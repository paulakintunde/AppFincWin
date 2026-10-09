// D-40: one pipeline for every statement format. Adapter -> StatementDraft -> format profile ->
// conversion -> reconciliation -> duplicate check -> transfer detection -> preview -> commit.
// Pure: no React, no I/O. The file's bytes arrive from the device (services/files) and the
// file never leaves it (D-17, D-39). Failures are typed reasons and issue codes only: nothing
// here throws for file content, and no statement text (descriptions, amounts, account numbers)
// is placed in an error, a log or an event (RESEARCH security extension V7).
import {
  detectColumns,
  csvToDraft,
  inferDateFormat,
  inferNumberNotation,
  notationFor,
  tokenize,
  type ColumnMapping,
  type DateFormat,
  type DateFormatGuess,
  type Delimiter,
  type NotationGuess,
} from '@/engine/csv';
import { DEFAULT_KEYWORD_RULES, guessCategory, type BuiltinCategoryKey, type GuessSource } from '@/engine/categorize';
import { minorUnits, type MinorUnits, type NumberNotation, type ScaledRate } from '@/engine/money';
import { parseOfx } from '@/engine/ofx';
import { matchPendingPayments, type PendingOccurrence } from '@/engine/recurring';
import {
  convertDraft,
  decodeText,
  findDuplicates,
  inferProfile,
  matchRefunds,
  reconcile,
  sniffFormat,
  type AccountKind,
  type ConvertedRow,
  type DraftRowIssue,
  type DuplicateMatch,
  type ExistingRow,
  type FormatProfile,
  type ProfileResult,
  type ReconcileResult,
  type RefundPurchase,
  type RowCheck,
  type StatementDraft,
} from '@/engine/statement';
import { buildTransferLegs, matchTransfers, type ExistingLeg, type ImportedLeg, type TransferAccount } from '@/engine/transfer';
import type { ImportCommitInput, ImportLink, ImportLimit, ImportMarkPaid } from '@/data/mutations/importFinalize';
import type { NewTransaction } from '@/db/rows';

export type RejectReason =
  | 'too_many_rows'
  | 'unreadable'
  | 'no_rows'
  | 'too_big'
  | 'unsupported_format'
  | 'unsupported_statement';

export type ImportFormat = 'csv' | 'ofx' | 'qfx';

export interface PreparedCsv {
  header: string[];
  dataRows: string[][];
  delimiter: Delimiter;
  detected: ColumnMapping;
  confidence: 'high' | 'low';
  dateGuess: DateFormatGuess;
  dateFormat: DateFormat;
  dateAmbiguous: boolean;
  notationGuess: NotationGuess;
  notation: NumberNotation;
  notationAmbiguous: boolean;
}

export type PreparedImport =
  | { format: 'csv'; csv: PreparedCsv }
  | { format: 'ofx' | 'qfx'; statements: StatementDraft[] };

export type PrepareResult = { ok: true; prepared: PreparedImport } | { ok: false; reason: RejectReason };

export interface PrepareRegion {
  decimal: '.' | ',';
  dayFirst: boolean;
}

const COLUMN_SAMPLE_ROWS = 100;

function columnCells(rows: readonly (readonly string[])[], cols: readonly (number | null)[]): string[] {
  const out: string[] = [];
  for (const col of cols) {
    if (col === null) continue;
    for (const row of rows) {
      const cell = row[col];
      if (cell !== undefined && cell.trim() !== '') out.push(cell);
    }
  }
  return out;
}

function regionDateFormat(region: PrepareRegion): DateFormat {
  return region.dayFirst ? 'DMY' : 'MDY';
}

function resolveDateFormat(guess: DateFormatGuess, region: PrepareRegion): { format: DateFormat; ambiguous: boolean } {
  if (guess.kind === 'certain') return { format: guess.format, ambiguous: false };
  const fallback = regionDateFormat(region);
  if (guess.kind === 'ambiguous') {
    // The region's own order when the file allows it; either way the user is asked (E-CR-02).
    return { format: guess.candidates.includes(fallback) ? fallback : (guess.candidates[0] ?? fallback), ambiguous: true };
  }
  return { format: fallback, ambiguous: true };
}

/** What the file itself says about the date order and decimal mark under one column mapping. */
export interface CsvReading {
  dateGuess: DateFormatGuess;
  dateFormat: DateFormat;
  dateAmbiguous: boolean;
  notationGuess: NotationGuess;
  notation: NumberNotation;
  notationAmbiguous: boolean;
}

/**
 * S-CR-06 / E-CR-02: infers the date order from the mapped date column and the decimal mark
 * from the mapped amount columns. Run again whenever the user remaps one of them, so an order
 * or mark is never carried over from a column nobody chose.
 */
export function inferCsvReading(
  dataRows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  region: PrepareRegion
): CsvReading {
  const dateGuess = inferDateFormat(columnCells(dataRows, [mapping.date]));
  const date = resolveDateFormat(dateGuess, region);
  const notationGuess = inferNumberNotation(
    columnCells(dataRows, [mapping.amount, mapping.debit, mapping.credit, mapping.balance, mapping.limit])
  );
  const notationAmbiguous = notationGuess.kind === 'ambiguous';
  const notation = notationGuess.kind === 'ambiguous' ? notationFor(region.decimal) : notationGuess.notation;
  return { dateGuess, dateFormat: date.format, dateAmbiguous: date.ambiguous, notationGuess, notation, notationAmbiguous };
}

function prepareCsv(text: string, region: PrepareRegion): PrepareResult {
  const tokens = tokenize(text);
  if (!tokens.ok) return { ok: false, reason: tokens.error === 'too-many-rows' ? 'too_many_rows' : 'unreadable' };

  const header = tokens.rows[0];
  const dataRows = tokens.rows.slice(1);
  if (header === undefined || dataRows.length === 0) return { ok: false, reason: 'no_rows' };

  const { mapping, confidence } = detectColumns(header, dataRows.slice(0, COLUMN_SAMPLE_ROWS));

  const reading = inferCsvReading(dataRows, mapping, region);

  return {
    ok: true,
    prepared: {
      format: 'csv',
      csv: {
        header,
        dataRows,
        delimiter: tokens.delimiter,
        detected: mapping,
        confidence,
        ...reading,
      },
    },
  };
}

function prepareOfx(text: string, hints: { extension: string }, exponentFor: (code: string) => number | null): PrepareResult {
  const parsed = parseOfx(text, { exponentFor });
  if (!parsed.ok) {
    if (parsed.error === 'unsupported-statement') return { ok: false, reason: 'unsupported_statement' };
    if (parsed.error === 'too-large' || parsed.error === 'too-deep') return { ok: false, reason: 'too_big' };
    return { ok: false, reason: 'unreadable' };
  }
  const isQfx = hints.extension === 'qfx' || text.toUpperCase().includes('<INTU.');
  return { ok: true, prepared: { format: isQfx ? 'qfx' : 'ofx', statements: parsed.drafts } };
}

/**
 * Decodes the bytes (BOM, UTF-8, Windows-1252 fallback), sniffs the format from the content
 * (the extension is only a hint for OFX versus QFX), and runs the matching adapter.
 */
export function prepareImport(
  bytes: Uint8Array,
  hints: { extension: 'csv' | 'ofx' | 'qfx' | 'other' },
  region: PrepareRegion,
  exponentFor: (code: string) => number | null
): PrepareResult {
  const { text } = decodeText(bytes);
  const sniffed = sniffFormat(text);
  if (sniffed === 'unknown') return { ok: false, reason: 'unsupported_format' };
  if (sniffed === 'ofx') return prepareOfx(text, hints, exponentFor);
  return prepareCsv(text, region);
}

/** The multi-statement picker's rows (D-12): kind, currency and line count, never an account number. */
export function statementOptions(
  statements: readonly StatementDraft[]
): { index: number; kind: 'bank' | 'card'; currency: string | null; count: number }[] {
  return statements.map((s, index) => ({
    index,
    kind: s.accountHint === 'card' ? 'card' : 'bank',
    currency: s.currency,
    count: s.rows.length,
  }));
}

/** The CSV draft once the user has confirmed the mapping, date order and number notation. */
export function resolveCsvDraft(
  prepared: PreparedCsv,
  options: { mapping: ColumnMapping; dateFormat: DateFormat; notation: NumberNotation; account: { currency: string } },
  exponentFor: (code: string) => number | null
): StatementDraft {
  return csvToDraft(prepared.header, prepared.dataRows, {
    mapping: options.mapping,
    dateFormat: options.dateFormat,
    notation: options.notation,
    delimiter: prepared.delimiter,
    defaultCurrency: options.account.currency,
    exponentFor,
  });
}

// ---------------------------------------------------------------------------------------
// Profile, preview and commit (D-40 stages 3 to 9)
// ---------------------------------------------------------------------------------------

export interface PreviewAccount {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  overdraftLimit: number | null;
  creditLimit: number | null;
}

function limitOf(account: PreviewAccount): MinorUnits | null {
  const n = account.kind === 'credit' ? account.creditLimit : account.overdraftLimit;
  return n === null ? null : minorUnits(n);
}

/**
 * The inference result unchanged. A remembered profile is offered to the engine only when it
 * was saved for this account and this exact file layout (D-42).
 */
export function resolveProfile(
  draft: StatementDraft,
  account: PreviewAccount,
  remembered: { accountId: string; signature: string; profile: FormatProfile } | null
): ProfileResult {
  const usable =
    remembered !== null && remembered.accountId === account.id && remembered.signature === draft.layoutSignature
      ? remembered.profile
      : null;
  return inferProfile(draft, { kind: account.kind, limit: limitOf(account) }, usable);
}

export type RowTransfer = { kind: 'pair'; existingId: string } | { kind: 'choose'; options: string[] } | { kind: 'orphan' };

export interface PreviewRow {
  index: number;
  converted: ConvertedRow;
  check: RowCheck;
  duplicate: DuplicateMatch | null;
  categoryId: string | null;
  categorySource: GuessSource;
  included: boolean;
  locked: boolean;
  transfer: RowTransfer | null;
  payMatch: { pendingId: string; automatic: boolean } | null;
  /** D-07: a suggestion only, applied on insert when accepted; never changes anything unasked. */
  refund: { purchaseId: string; merchant: string; categoryId: string | null } | null;
}

export interface Preview {
  rows: PreviewRow[];
  reconcile: ReconcileResult;
  fitidDisabled: boolean;
  limitOffer: { field: 'credit_limit' | 'overdraft_limit'; amount: number } | null;
  profile: FormatProfile;
  format: ImportFormat;
}

export interface PreviewInput {
  draft: StatementDraft;
  /** A decided or user-chosen profile. An ambiguous ProfileResult cannot be passed (D-41, D-53). */
  profile: FormatProfile;
  format: ImportFormat;
  account: PreviewAccount;
  accounts: readonly TransferAccount[];
  /** Target account rows around the file's date range, with externalId and importFormat. */
  existing: readonly ExistingRow[];
  /** Target account pending rows in range. */
  pending: readonly PendingOccurrence[];
  /** Earlier expense rows on the target account (refund matching, D-07). Omitted means none. */
  purchases?: readonly RefundPurchase[];
  /** Other accounts' unlinked rows, range plus or minus 3 days. */
  transferCandidates: readonly ExistingLeg[];
  perEur: ReadonlyMap<string, ScaledRate>;
  learned: ReadonlyMap<string, string>;
  builtinIds: ReadonlyMap<BuiltinCategoryKey, string>;
  /**
   * OFX only: the account's stored balance just before the file, supplied only when the
   * account has rows before the file and none inside its date range; else null. OFX carries
   * no opening balance, so its closing balance is only checkable against a stored one that
   * genuinely precedes the file (D-46, RESEARCH A1 option a).
   */
  storedOpeningForFile: number | null;
}

// A row with one of these cannot be committed as it stands (D-49: an arithmetic mismatch or a
// negative balance is never one of them). bad-balance and unknown-currency leave the amount and
// date usable, so they do not lock.
const BLOCKING_ISSUES: ReadonlySet<DraftRowIssue> = new Set<DraftRowIssue>([
  'bad-date',
  'bad-amount',
  'zero-amount',
  'amount-too-large',
  'empty-description',
  'conflicting-markers',
]);

function offerLimit(profile: FormatProfile, account: PreviewAccount): Preview['limitOffer'] {
  const stated = profile.statedLimit;
  if (stated === null || stated <= 0) return null;
  if (profile.accountFamily === 'card' && account.creditLimit === null) return { field: 'credit_limit', amount: stated };
  if (profile.accountFamily === 'deposit' && account.overdraftLimit === null) return { field: 'overdraft_limit', amount: stated };
  return null;
}

/**
 * convert -> reconcile -> duplicates -> pay-match -> transfers -> categories, in D-40 order.
 * Never throws for content. Nothing is linked, marked paid or applied here: every suggestion is
 * only attached to its row for the user to accept (D-48, D-52, D-55).
 */
export function buildPreview(input: PreviewInput): Preview {
  const { draft, profile, account } = input;

  const accountLimit = limitOf(account);
  const converted = convertDraft(draft, profile, {
    limit: profile.accountFamily === 'card' ? (accountLimit ?? profile.statedLimit) : accountLimit,
  });

  const reconciled = reconcile(
    converted.rows.map((r) => ({
      amount: r.amount,
      // An available-credit file with no known limit reconciles on its signed available
      // figure: the unknown limit is a constant that cancels in every difference (E-WR-07).
      balance: r.balance ?? r.availableSigned,
      localDate: r.localDate,
    })),
    {
      opening: converted.opening ?? (draft.source === 'ofx' && input.storedOpeningForFile !== null ? input.storedOpeningForFile : null),
      closing: converted.closing,
    }
  );

  const { matches: duplicates, fitidDisabled } = findDuplicates(
    converted.rows.map((r) => ({
      index: r.index,
      localDate: r.localDate,
      amount: r.amount,
      name: r.description,
      externalId: r.externalId,
    })),
    input.existing,
    { sourceFormat: draft.source }
  );

  const blocked = new Map<number, boolean>();
  for (const r of converted.rows) {
    blocked.set(r.index, r.issues.some((i) => BLOCKING_ISSUES.has(i)) || r.localDate === null || r.amount === null);
  }

  const usable = converted.rows.flatMap((r) =>
    r.localDate !== null && r.amount !== null && blocked.get(r.index) !== true ? [{ row: r, localDate: r.localDate, amount: r.amount }] : []
  );

  const payMatches = new Map(
    matchPendingPayments(
      usable.map((u) => ({ index: u.row.index, localDate: u.localDate, amount: u.amount, currency: u.row.currency, name: u.row.description })),
      input.pending,
      { excludeIndexes: new Set(duplicates.keys()) }
    ).map((m) => [m.index, { pendingId: m.pendingId, automatic: m.automatic }] as const)
  );

  // D-07: refund suggestions run over rows that are not duplicates or pay-matched, and drop
  // any row later paired as a transfer (a transfer is never a refund).
  const refundCandidates = usable.filter((u) => !duplicates.has(u.row.index) && !payMatches.has(u.row.index));

  const imported: ImportedLeg[] = refundCandidates
    .map((u) => ({
      index: u.row.index,
      accountId: account.id,
      localDate: u.localDate,
      amount: u.amount,
      currency: u.row.currency,
      name: u.row.description,
      trnType: u.row.trnType,
    }));
  const transfers = new Map<number, RowTransfer>();
  for (const s of matchTransfers({ imported, existing: input.transferCandidates, accounts: input.accounts, perEur: input.perEur })) {
    if (s.kind === 'pair') transfers.set(s.importIndex, { kind: 'pair', existingId: s.existingId });
    else if (s.kind === 'choose') transfers.set(s.importIndex, { kind: 'choose', options: s.options });
    else transfers.set(s.importIndex, { kind: 'orphan' });
  }

  const refunds = new Map(
    matchRefunds(
      refundCandidates
        .filter((u) => !transfers.has(u.row.index))
        .map((u) => ({
          index: u.row.index,
          amount: u.amount,
          currency: u.row.currency,
          name: u.row.description,
          localDate: u.localDate,
          isTransfer: false,
        })),
      input.purchases ?? [],
      account.kind
    ).map((m) => [m.index, m] as const)
  );

  const guessContext = { keywordRules: DEFAULT_KEYWORD_RULES, learned: input.learned, builtinIds: input.builtinIds };

  const rows: PreviewRow[] = converted.rows.map((r, position) => {
    const locked = blocked.get(r.index) === true;
    const duplicate = duplicates.get(r.index) ?? null;
    const guess = guessCategory({ name: r.description, amount: r.amount ?? 0 }, guessContext);
    const pay = payMatches.get(r.index);
    const refund = refunds.get(r.index);
    return {
      index: r.index,
      converted: r,
      check: reconciled.rows[position] ?? 'no-balance',
      duplicate,
      categoryId: guess.categoryId,
      categorySource: guess.source,
      included: !locked && duplicate === null,
      locked,
      transfer: transfers.get(r.index) ?? null,
      payMatch: pay === undefined ? null : { pendingId: pay.pendingId, automatic: pay.automatic },
      refund: refund === undefined ? null : { purchaseId: refund.purchaseId, merchant: refund.merchant, categoryId: refund.categoryId },
    };
  });

  return {
    rows,
    reconcile: reconciled,
    fitidDisabled,
    limitOffer: offerLimit(profile, account),
    profile,
    format: input.format,
  };
}

/** What the preview needs to know about a stored row to link it or mark it paid. */
export interface ExistingInfo {
  version: number;
  category_id: string | null;
  local_date: string;
  original_amount: number;
  status: string;
  transfer_id: string | null;
}

export interface CommitDecisions {
  included: ReadonlySet<number>;
  /** An explicit entry (including null) overrides the guessed category. */
  categories: ReadonlyMap<number, string | null>;
  /** Row index -> stored row id the user accepted as the other leg. */
  links: ReadonlyMap<number, string>;
  /** Row index -> the other account for a transfer with no stored counterpart. */
  orphans: ReadonlyMap<number, { accountId: string; counterAmount: number | null }>;
  /** Row indexes whose pay-match the user accepted. */
  payMatches: ReadonlySet<number>;
  /** Row indexes whose refund suggestion the user accepted (D-07). None when omitted. */
  refunds?: ReadonlySet<number>;
  acceptLimit: boolean;
}

export interface CommitContext {
  householdId: string;
  accountId: string;
  timeZone: string;
  transferCategoryId: string | null;
  accounts: readonly TransferAccount[];
  existingById: ReadonlyMap<string, ExistingInfo>;
  accountVersion: number;
  remember: { signature: string; id: string } | null;
}

/**
 * The input to useImportCommit: inserted rows (status paid, one batch, provenance), accepted
 * links, orphan transfers with their counter-leg, accepted mark-paid patches (in place of
 * inserting those rows), an accepted limit and the profile to remember. A suggestion that
 * cannot be applied exactly as previewed (unknown or already-linked stored row, missing
 * Transfer category, pending row no longer pending) is set aside and its row is inserted as an
 * ordinary row, so no statement line is ever lost.
 */
export function toImportCommit(
  preview: Preview,
  decisions: CommitDecisions,
  ctx: CommitContext,
  batchId: string,
  newId: () => string
): Pick<ImportCommitInput, 'rows' | 'finalize'> {
  const rows: NewTransaction[] = [];
  const links: ImportLink[] = [];
  const markPaid: ImportMarkPaid[] = [];
  const linkedStored = new Set<string>();
  const usedPending = new Set<string>();
  const importFormat = preview.format === 'csv' ? 'csv' : 'ofx'; // QFX is OFX (D-39)
  const canTransfer = ctx.transferCategoryId !== null;

  for (const pr of preview.rows) {
    const c = pr.converted;
    if (pr.locked || !decisions.included.has(pr.index) || c.amount === null || c.localDate === null) continue;

    const categoryId = decisions.categories.has(pr.index) ? (decisions.categories.get(pr.index) ?? null) : pr.categoryId;
    const row: NewTransaction = {
      id: newId(),
      household_id: ctx.householdId,
      account_id: ctx.accountId,
      original_amount: c.amount,
      original_currency: c.currency,
      local_date: c.localDate,
      time_zone: ctx.timeZone,
      note: null,
      name: c.description,
      category_id: categoryId,
      status: 'paid',
      import_batch_id: batchId,
      raw_amount: c.rawAmount,
      raw_balance: c.rawBalance,
      external_id: c.externalId,
      import_format: importFormat,
    };

    // D-07: an accepted refund is set on the inserted row itself (so it adds no undo ops) and
    // takes the purchase's category; it is never income (D-03).
    if (decisions.refunds?.has(pr.index) === true && pr.refund !== null && c.amount > 0 && pr.transfer === null) {
      row.is_refund = true;
      row.category_id = pr.refund.categoryId ?? categoryId;
    }

    // Mark paid replaces the insert (D-55); the line rides along for the fallback.
    if (decisions.payMatches.has(pr.index) && pr.payMatch !== null) {
      const pending = ctx.existingById.get(pr.payMatch.pendingId);
      if (pending !== undefined && pending.status === 'pending' && !usedPending.has(pr.payMatch.pendingId)) {
        usedPending.add(pr.payMatch.pendingId);
        markPaid.push({
          pendingId: pr.payMatch.pendingId,
          expectedVersion: pending.version,
          before: { status: 'pending', local_date: pending.local_date, original_amount: pending.original_amount },
          patch: { status: 'paid', local_date: c.localDate, original_amount: c.amount },
          line: row,
        });
        continue;
      }
    }

    const orphan = decisions.orphans.get(pr.index);
    if (orphan !== undefined && pr.transfer?.kind === 'orphan' && ctx.transferCategoryId !== null) {
      const counter = counterLeg(row, c.currency, orphan, ctx, newId, batchId);
      if (counter !== null) {
        rows.push({ ...row, category_id: ctx.transferCategoryId, transfer_id: counter.transferId }, counter.row);
        continue;
      }
    }

    const storedId = decisions.links.get(pr.index);
    if (storedId !== undefined && canTransfer && offersStored(pr.transfer, storedId) && !linkedStored.has(storedId)) {
      const stored = ctx.existingById.get(storedId);
      // E-WR-06: a leg already in a transfer is never linked again.
      if (stored !== undefined && stored.transfer_id === null) {
        linkedStored.add(storedId);
        links.push({
          importedId: row.id,
          importedCategoryId: categoryId,
          storedId,
          storedVersion: stored.version,
          storedCategoryId: stored.category_id,
          transferId: newId(),
          storedTransferId: stored.transfer_id,
        });
      }
    }

    rows.push(row);
  }

  return {
    rows,
    finalize: {
      transferCategoryId: ctx.transferCategoryId,
      links,
      markPaid,
      limit: acceptedLimit(preview, decisions, ctx),
      profile:
        ctx.remember === null
          ? null
          : { accountId: ctx.accountId, signature: ctx.remember.signature, profile: preview.profile, id: ctx.remember.id },
    },
  };
}

function offersStored(transfer: RowTransfer | null, storedId: string): boolean {
  if (transfer === null) return false;
  if (transfer.kind === 'pair') return transfer.existingId === storedId;
  if (transfer.kind === 'choose') return transfer.options.includes(storedId);
  return false;
}

/** The other leg of an accepted orphan transfer, or null when it cannot be built exactly (D-50). */
function counterLeg(
  row: NewTransaction,
  currency: string,
  orphan: { accountId: string; counterAmount: number | null },
  ctx: CommitContext,
  newId: () => string,
  batchId: string
): { row: NewTransaction; transferId: string } | null {
  const other = ctx.accounts.find((a) => a.id === orphan.accountId);
  if (other === undefined || other.id === ctx.accountId || ctx.transferCategoryId === null) return null;

  const importedIsOut = row.original_amount < 0;
  const importedMagnitude = Math.abs(row.original_amount);
  let counterMagnitude = importedMagnitude;
  if (other.currency !== currency) {
    // Cross-currency: the user's own figure, never one derived from a rate (D-50).
    if (orphan.counterAmount === null) return null;
    counterMagnitude = Math.abs(orphan.counterAmount);
  }

  const transferId = newId();
  const counterId = newId();
  const imported = { id: ctx.accountId, currency };
  const counter = { id: other.id, currency: other.currency };
  const built = buildTransferLegs({
    transferId,
    outId: importedIsOut ? row.id : counterId,
    inId: importedIsOut ? counterId : row.id,
    from: importedIsOut ? imported : counter,
    to: importedIsOut ? counter : imported,
    amountOut: minorUnits(importedIsOut ? importedMagnitude : counterMagnitude),
    amountIn: minorUnits(importedIsOut ? counterMagnitude : importedMagnitude),
    localDate: row.local_date,
  });
  if (!built.ok) return null;

  const leg = importedIsOut ? built.legs[1] : built.legs[0];
  return {
    transferId,
    row: {
      id: counterId,
      household_id: ctx.householdId,
      account_id: leg.accountId,
      original_amount: leg.amount,
      original_currency: leg.currency,
      local_date: leg.localDate,
      time_zone: ctx.timeZone,
      note: null,
      name: row.name ?? null,
      category_id: ctx.transferCategoryId,
      status: 'paid',
      import_batch_id: batchId,
      raw_amount: null,
      raw_balance: null,
      external_id: null,
      import_format: null,
      transfer_id: transferId,
    },
  };
}

function acceptedLimit(preview: Preview, decisions: CommitDecisions, ctx: CommitContext): ImportLimit | null {
  const offer = preview.limitOffer;
  if (!decisions.acceptLimit || offer === null) return null;
  // The offer only exists while the account has no limit of that kind, so the prior value is null.
  if (offer.field === 'credit_limit') {
    return { accountId: ctx.accountId, expectedVersion: ctx.accountVersion, before: { credit_limit: null }, patch: { credit_limit: offer.amount } };
  }
  return { accountId: ctx.accountId, expectedVersion: ctx.accountVersion, before: { overdraft_limit: null }, patch: { overdraft_limit: offer.amount } };
}

/** Analytics size band for an import (counts only, never content). */
export function sizeBand(n: number): '1-50' | '51-500' | '501-5000' {
  if (n <= 50) return '1-50';
  if (n <= 500) return '51-500';
  return '501-5000';
}
