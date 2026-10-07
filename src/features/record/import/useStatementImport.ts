// The statement import as one state machine (D-40, UI-SPEC pipeline): idle -> reading ->
// (rejected | choose-statement | format | mapping) -> review -> matches -> committing -> done.
// It drives the pure pipeline (importPipeline.ts, 02-26) and renders nothing; the screens
// (02-27) only read what it returns and call what it exposes.
//
// D-39: the file's bytes are read on this device, parsed, and dropped; statement content
// (descriptions, amounts, account numbers, the file's own label) never reaches an analytics
// property, a toast parameter, a log or an error. Funnel events carry literal unions and
// booleans only (ANL-05).
// D-42: an ambiguous reading has no selected profile, so nothing can be committed until the
// user chooses; a remembered reading that still reconciles skips the format step.
// D-17 / D-29: every database read has a fallback, so a preview never waits on the network.
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { validateMapping, notationFor, type ColumnMapping, type DateFormat, type MappingError } from '@/engine/csv';
import { buildLearnedMap } from '@/engine/categorize';
import { minorUnits, parseAmount, resolveExponent, type NumberNotation, type ScaledRate } from '@/engine/money';
import { detectRecurring, type PendingOccurrence, type RecurringSuggestion } from '@/engine/recurring';
import {
  convertDraft,
  flipProfile,
  type ConvertedRow,
  type ExistingRow,
  type FormatProfile,
  type StatementDraft,
} from '@/engine/statement';
import type { ExistingLeg, TransferAccount } from '@/engine/transfer';
import { fetchImportProfile } from '@/db/importProfiles';
import type { AccountRow, TransactionRow } from '@/db/rows';
import {
  fetchCategorisedNames,
  fetchHasRowsAfter,
  fetchHasRowsBefore,
  fetchTransactionsInRange,
  fetchTransferCandidates,
} from '@/db/transactions';
import { queryKeys } from '@/data/keys';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useFxLatest } from '@/data/queries/fxLatest';
import { latestPerEur } from '@/data/queries/homeAmount';
import { useImportCommit } from '@/data/mutations/importFinalize';
import { useCreateSeries } from '@/data/mutations/recurringSeries';
import { newStepId } from '@/data/mutations/undoCapture';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pickStatementBytes } from '@/services/files/pickStatement';
import { getAnalytics, type EventName, type EventProps } from '@/services/analytics';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { acceptedSuggestionCount, maxAcceptedSuggestions } from './suggestionCap';
import {
  buildPreview,
  inferCsvReading,
  prepareImport,
  resolveCsvDraft,
  resolveProfile,
  sizeBand,
  statementOptions,
  suggestionToSeries,
  toImportCommit,
  type CsvReading,
  type ExistingInfo,
  type ImportFormat,
  type PreparedImport,
  type Preview,
  type PreviewAccount,
  type PreviewRow,
  type RejectReason,
} from './importPipeline';

export type ImportStage =
  | 'idle'
  | 'reading'
  | 'rejected'
  | 'choose-statement'
  | 'format'
  | 'mapping'
  | 'review'
  | 'matches'
  | 'committing'
  | 'done';

export type ImportEntry = 'onboarding' | 'you' | 'account';

type AbandonStage = 'pick' | 'format' | 'mapping' | 'review' | 'matches';

interface Machine {
  stage: ImportStage;
  rejectReason: RejectReason | null;
  prepared: PreparedImport | null;
  statementIndex: number | null;
  accountId: string | null;
  draft: StatementDraft | null;
  profile: FormatProfile | null;
  candidates: FormatProfile[];
  rememberedNote: boolean;
  flipped: boolean;
  /** The balance and direction roles the profile was resolved under (D-53). */
  rolesKey: string | null;
  mapping: ColumnMapping | null;
  mappingEdited: boolean;
  /** S-CR-06: the date order and decimal mark the file shows under the *current* mapping. */
  reading: CsvReading | null;
  dateFormat: DateFormat | null;
  dateChosen: boolean;
  dateEdited: boolean;
  notation: NumberNotation | null;
  notationChosen: boolean;
  notationEdited: boolean;
  // review and matches: every default is "not accepted" (D-48, D-52, D-55)
  preview: Preview | null;
  existingById: ReadonlyMap<string, ExistingInfo>;
  /** Which account and name each offered stored row has, so a suggestion can name them (D-52, D-55). */
  storedLegs: ReadonlyMap<string, { accountId: string; name: string | null }>;
  included: ReadonlyMap<number, boolean>;
  categories: ReadonlyMap<number, string | null>;
  links: ReadonlyMap<number, string>;
  orphans: ReadonlyMap<number, { accountId: string; counterAmount: number | null }>;
  orphanDrafts: ReadonlyMap<number, { accountId: string; text: string }>;
  transferAnswers: ReadonlyMap<number, 'linked' | 'orphan' | 'dismissed'>;
  payAnswers: ReadonlyMap<number, 'accepted' | 'dismissed'>;
  limitAccepted: boolean;
  // after commit
  suggestions: RecurringSuggestion[];
  committedRows: { id: string; localDate: string; categoryId: string | null }[];
}

const NONE = new Map<never, never>();

/**
 * Why a commit wrote nothing (S-WR-03, S-WR-04): more accepted suggestions than one import can
 * hold; transfers asked for while the transfer category is unknown; or the write was refused
 * before anything was queued. Each leaves the user's choices in place to adjust and retry.
 */
export type CommitProblem = 'suggestionCap' | 'transfersUnavailable' | 'failed';

/** The mapping roles whose cells decide the decimal mark (S-CR-06). */
const AMOUNT_ROLES = ['amount', 'debit', 'credit', 'balance', 'limit'] as const;

function initialMachine(accountId: string | null): Machine {
  return {
    stage: 'idle',
    rejectReason: null,
    prepared: null,
    statementIndex: null,
    accountId,
    draft: null,
    profile: null,
    candidates: [],
    rememberedNote: false,
    flipped: false,
    rolesKey: null,
    mapping: null,
    mappingEdited: false,
    reading: null,
    dateFormat: null,
    dateChosen: false,
    dateEdited: false,
    notation: null,
    notationChosen: false,
    notationEdited: false,
    preview: null,
    existingById: NONE,
    storedLegs: NONE,
    included: NONE,
    categories: NONE,
    links: NONE,
    orphans: NONE,
    orphanDrafts: NONE,
    transferAnswers: NONE,
    payAnswers: NONE,
    limitAccepted: false,
    suggestions: [],
    committedRows: [],
  };
}

function addDays(localDate: string, days: number): string {
  const [y, mo, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

const RECONCILIATION = {
  'all-verified': 'all_verified',
  partial: 'partial',
  'none-in-file': 'none_in_file',
  'ends-only-mismatch': 'ends_only_mismatch',
} as const;

function isTransactionRow(v: unknown): v is TransactionRow {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.account_id === 'string' && typeof r.local_date === 'string' && typeof r.original_amount === 'number';
}

/** D-17 / D-29: the cached month rows for the account, when a live read fails. */
function cachedRows(rows: readonly unknown[][]): TransactionRow[] {
  return rows.flat().filter(isTransactionRow);
}

type Read<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(read: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

/** Unknown currency code -> null (the pipeline then refuses rather than guessing a scale). */
function exponentFor(code: string): number | null {
  try {
    return resolveExponent(code);
  } catch {
    return null;
  }
}

function isDayFirst(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2026, 11, 31)));
    const day = parts.findIndex((p) => p.type === 'day');
    const month = parts.findIndex((p) => p.type === 'month');
    return day !== -1 && month !== -1 && day < month;
  } catch {
    return false;
  }
}

function rolesKeyOf(m: ColumnMapping): string {
  return JSON.stringify([m.amount, m.debit, m.credit, m.balance, m.direction, m.limit]);
}

/** The household's accounts as the transfer matcher sees them. */
function transferAccounts(accounts: readonly AccountRow[]): TransferAccount[] {
  return accounts
    .filter((a) => a.archived_at === null)
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, exponent: exponentFor(a.currency) ?? 2 }));
}

function previewAccountOf(a: AccountRow): PreviewAccount {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    overdraftLimit: a.overdraft_limit,
    creditLimit: a.credit_limit,
  };
}

function track<E extends EventName>(name: E, props: EventProps<E>): void {
  getAnalytics().track(name, props);
}

export function useStatementImport({ entry, accountId: initialAccountId = null }: { entry: ImportEntry; accountId?: string | null }) {
  const ctx = useRecordContext();
  const accountsQuery = useAccounts(ctx.householdId ?? undefined);
  const device = useDeviceLocale(ctx.region);
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const qc = useQueryClient();
  const lookup = useCategoryLookup(ctx.userId ?? undefined);
  const fx = useFxLatest();
  const { balances } = useAccountBalances(ctx.householdId, accounts);
  const importCommit = useImportCommit();
  const createSeries = useCreateSeries();

  const [m, setM] = useState<Machine>(() => initialMachine(initialAccountId));
  /** S-WR-03/S-WR-04: why the last commit wrote nothing; cleared by the next attempt. */
  const [commitProblem, setCommitProblem] = useState<CommitProblem | null>(null);
  const run = useRef(0); // bumped on every restart or cancel, so a late read is dropped
  const committing = useRef(false);

  const region = useMemo(
    () => ({ decimal: (device.separators?.decimal === ',' ? ',' : '.') as '.' | ',', dayFirst: isDayFirst(device.locale) }),
    [device.separators?.decimal, device.locale]
  );

  const patch = useCallback((p: Partial<Machine>) => setM((prev) => ({ ...prev, ...p })), []);

  const accountById = useCallback((id: string | null): AccountRow | null => (id === null ? null : (accounts.find((a) => a.id === id) ?? null)), [accounts]);

  /** The draft under the current mapping choices (CSV) or the chosen statement (OFX). */
  const draftFor = useCallback(
    (s: Machine, account: AccountRow): StatementDraft | null => {
      if (s.prepared === null) return null;
      if (s.prepared.format !== 'csv') return s.prepared.statements[s.statementIndex ?? 0] ?? null;
      if (s.mapping === null || s.dateFormat === null || s.notation === null) return null;
      try {
        return resolveCsvDraft(
          s.prepared.csv,
          { mapping: s.mapping, dateFormat: s.dateFormat, notation: s.notation, account: { currency: account.currency } },
          exponentFor
        );
      } catch {
        return null; // an account currency with no known scale
      }
    },
    []
  );

  /** The remembered reading for this layout, or null when absent or unreadable (D-17, D-42). */
  const rememberedFor = useCallback(
    async (draft: StatementDraft, accountId: string) => {
      if (ctx.userId === null) return null;
      try {
        const row = await fetchImportProfile(supabase, ctx.userId, accountId, draft.layoutSignature);
        return row === null ? null : { accountId, signature: draft.layoutSignature, profile: row.profile };
      } catch {
        return null;
      }
    },
    [ctx.userId]
  );

  /**
   * Enters review: reads what the preview needs (D-17), every read with a fallback so the
   * import never waits on the network (D-29), then builds the preview. Existing rows are
   * supplied for every stored row that can be offered (pair and choose options, pending
   * rows), with their transfer_id, so a finalize never meets an unknown stored row (02-26).
   */
  const goReview = useCallback(
    (draft: StatementDraft, profile: FormatProfile, accountId: string, format: ImportFormat): void => {
      const account = accountById(accountId);
      const householdId = ctx.householdId;
      const userId = ctx.userId;
      if (account === null || householdId === null || userId === null) return;
      const token = ++run.current;
      setM((prev) => ({
        ...prev,
        stage: 'review',
        preview: null,
        existingById: NONE,
        storedLegs: NONE,
        included: NONE,
        categories: NONE,
        links: NONE,
        orphans: NONE,
        orphanDrafts: NONE,
        transferAnswers: NONE,
        payAnswers: NONE,
        limitAccepted: false,
      }));

      void (async () => {
        const dates = draft.rows.flatMap((r) => (r.localDate === null ? [] : [r.localDate])).sort();
        const first = dates[0] ?? ctx.today;
        const last = dates[dates.length - 1] ?? ctx.today;
        const range = { from: addDays(first, -2), toInclusive: addDays(last, 2) };

        const [rangeRead, candidateRead, namesRead] = await Promise.all([
          attempt(() => fetchTransactionsInRange(supabase, householdId, { ...range, accountId })),
          attempt(() =>
            fetchTransferCandidates(supabase, householdId, {
              excludeAccountId: accountId,
              from: addDays(first, -3),
              toInclusive: addDays(last, 3),
            })
          ),
          attempt(() => fetchCategorisedNames(supabase, householdId, userId)),
        ]);

        // A failed read falls back to the cached month rows for this account, or to none.
        const stored: TransactionRow[] = rangeRead.ok
          ? rangeRead.value
          : cachedRows(qc.getQueriesData<unknown[]>({ queryKey: queryKeys.transactionsRoot(householdId) }).map(([, data]) => (Array.isArray(data) ? data : []))).filter(
              (r) => r.account_id === accountId && r.local_date >= range.from && r.local_date <= range.toInclusive
            );
        const candidates = candidateRead.ok ? candidateRead.value : [];
        const names = namesRead.ok ? namesRead.value : [];

        // OFX carries no opening balance: a stored balance stands in only when the account has
        // rows before the file and none inside it (D-46). S-WR-05: that balance is the balance
        // *now*, so it equals the balance at the file's start only when nothing is dated after
        // the file either; a failed or non-empty read of the later rows drops the fallback.
        let storedOpeningForFile: number | null = null;
        if (format !== 'csv' && draft.periodStart !== null) {
          const periodStart = draft.periodStart;
          const periodEnd = draft.periodEnd ?? last;
          const before = await attempt(() => fetchHasRowsBefore(supabase, householdId, accountId, periodStart));
          const anyInside = stored.some((r) => r.local_date >= periodStart && r.local_date <= periodEnd);
          if (before.ok && before.value && !anyInside) {
            // I-02: one limit-1 read for any active row dated strictly after the period.
            const after = await attempt(() => fetchHasRowsAfter(supabase, householdId, accountId, periodEnd));
            if (after.ok && !after.value) storedOpeningForFile = balances.get(accountId)?.balance ?? null;
          }
        }
        if (token !== run.current) return;

        const pendingRows = stored.filter((r) => r.status === 'pending');
        const settled = stored.filter((r) => r.status !== 'pending');
        const existing: ExistingRow[] = settled.map((r) => ({
          id: r.id,
          localDate: r.local_date,
          amount: r.original_amount,
          name: r.name,
          externalId: r.external_id,
          importFormat: r.import_format,
        }));
        const pending: PendingOccurrence[] = pendingRows.map((r) => ({
          id: r.id,
          version: r.version,
          localDate: r.local_date,
          amount: r.original_amount,
          currency: r.original_currency,
          name: r.name,
          accountId: r.account_id,
        }));
        const transferCandidates: ExistingLeg[] = candidates.map((c) => ({
          id: c.id,
          accountId: c.account_id,
          localDate: c.local_date,
          amount: c.original_amount,
          currency: c.original_currency,
          name: c.name,
          paymentType: c.payment_type,
          transferId: c.transfer_id,
        }));

        const existingById = new Map<string, ExistingInfo>();
        for (const r of stored) {
          existingById.set(r.id, {
            version: r.version,
            category_id: r.category_id,
            local_date: r.local_date,
            original_amount: r.original_amount,
            status: r.status,
            transfer_id: r.transfer_id,
          });
        }
        for (const c of candidates) {
          existingById.set(c.id, {
            version: c.version,
            category_id: c.category_id,
            local_date: c.local_date,
            original_amount: c.original_amount,
            status: 'paid',
            transfer_id: c.transfer_id,
          });
        }

        const perEur = new Map<string, ScaledRate>();
        const rates = fx.data ?? [];
        for (const code of new Set([...accounts.map((a) => a.currency), ...draft.rows.map((r) => r.currency)])) {
          const rate = latestPerEur(rates, code);
          if (rate !== null) perEur.set(code, rate);
        }

        const preview = buildPreview({
          draft,
          profile,
          format,
          account: previewAccountOf(account),
          accounts: transferAccounts(accounts),
          existing,
          pending,
          transferCandidates,
          perEur,
          learned: buildLearnedMap(names.map((n) => ({ name: n.name, categoryId: n.category_id, updatedAt: n.updated_at }))),
          builtinIds: lookup.builtinIds,
          storedOpeningForFile,
        });
        const storedLegs = new Map<string, { accountId: string; name: string | null }>();
        for (const r of stored) storedLegs.set(r.id, { accountId: r.account_id, name: r.name });
        for (const c of candidates) storedLegs.set(c.id, { accountId: c.account_id, name: c.name });
        patch({ preview, existingById, storedLegs });
      })();
    },
    [accountById, accounts, balances, ctx.householdId, ctx.today, ctx.userId, fx.data, lookup.builtinIds, patch, qc]
  );

  /**
   * Reads the draft for the chosen account and resolves how it reads (D-41, D-53). Decided ->
   * the format step (or straight on when the remembered reading still holds); ambiguous ->
   * the format step with the candidates and no selected profile.
   */
  const derive = useCallback(
    async (s: Machine, accountId: string): Promise<void> => {
      const account = accountById(accountId);
      if (s.prepared === null || account === null) return;
      const token = ++run.current;
      const draft = draftFor(s, account);
      if (draft === null) {
        patch({ stage: 'rejected', rejectReason: 'unreadable' });
        return;
      }
      const remembered = await rememberedFor(draft, accountId);
      if (token !== run.current) return;

      const result = resolveProfile(draft, previewAccountOf(account), remembered);
      const rolesKey = s.mapping === null ? null : rolesKeyOf(s.mapping);
      const format = s.prepared.format;
      if (result.kind === 'ambiguous') {
        patch({ draft, accountId, profile: null, candidates: result.candidates, rememberedNote: false, flipped: false, rolesKey, stage: 'format' });
        return;
      }
      const skip = result.profile.decidedBy === 'remembered';
      patch({
        draft,
        accountId,
        profile: result.profile,
        candidates: [],
        rememberedNote: skip,
        flipped: false,
        rolesKey,
        stage: skip ? (format === 'csv' ? 'mapping' : 'review') : 'format',
      });
      if (skip && format !== 'csv') goReview(draft, result.profile, accountId, format);
    },
    [accountById, draftFor, goReview, patch, rememberedFor]
  );

  const start = useCallback((): void => {
    const token = ++run.current;
    committing.current = false;
    track('import_started', { entry });
    setM(() => ({ ...initialMachine(m.accountId), stage: 'reading' }));
    void (async () => {
      const picked = await pickStatementBytes();
      if (token !== run.current) return;
      if (picked.kind === 'canceled') {
        patch({ stage: 'idle' });
        return;
      }
      if (picked.kind === 'rejected') {
        track('import_file_rejected', { reason: picked.reason });
        patch({ stage: 'rejected', rejectReason: picked.reason });
        return;
      }
      let prepared: ReturnType<typeof prepareImport>;
      try {
        prepared = prepareImport(picked.bytes, { extension: picked.extension }, region, exponentFor);
      } catch {
        prepared = { ok: false, reason: 'unreadable' };
      }
      if (!prepared.ok) {
        track('import_file_rejected', { reason: prepared.reason });
        patch({ stage: 'rejected', rejectReason: prepared.reason });
        return;
      }
      const p = prepared.prepared;
      const next: Machine = { ...initialMachine(m.accountId), prepared: p };
      if (p.format === 'csv') {
        next.mapping = p.csv.detected;
        next.reading = p.csv;
        next.dateFormat = p.csv.dateFormat;
        next.notation = p.csv.notation;
      } else if (p.statements.length > 1) {
        setM({ ...next, stage: 'choose-statement' });
        return;
      } else {
        next.statementIndex = 0;
      }
      // Without an account yet the format step waits for one (setAccount continues).
      setM({ ...next, stage: 'format' });
      if (next.accountId !== null) await derive(next, next.accountId);
    })();
  }, [derive, entry, m.accountId, patch, region]);

  const chooseStatement = useCallback(
    (index: number): void => {
      if (m.stage !== 'choose-statement' || m.prepared === null || m.prepared.format === 'csv') return;
      if (m.prepared.statements[index] === undefined) return;
      const next: Machine = { ...m, statementIndex: index, stage: 'format' };
      setM(next);
      if (next.accountId !== null) void derive(next, next.accountId);
    },
    [derive, m]
  );

  const setAccount = useCallback(
    (id: string): void => {
      if (m.stage === 'review' || m.stage === 'matches' || m.stage === 'committing' || m.stage === 'done') return;
      const next: Machine = { ...m, accountId: id };
      setM(next);
      // The account kind fixes what the balance means, so the reading is worked out again (D-53).
      if (next.prepared !== null && (next.stage === 'format' || next.stage === 'mapping')) void derive(next, id);
    },
    [derive, m]
  );

  const flip = useCallback((): void => {
    if (m.profile === null || m.stage !== 'format') return;
    patch({ profile: flipProfile(m.profile), flipped: true });
  }, [m.profile, m.stage, patch]);

  const chooseCandidate = useCallback(
    (i: number): void => {
      const c = m.candidates[i];
      if (m.stage !== 'format' || c === undefined) return;
      patch({ profile: { ...c, decidedBy: 'user' }, flipped: false });
    },
    [m.candidates, m.stage, patch]
  );

  const confirmFormat = useCallback((): void => {
    if (m.stage !== 'format' || m.profile === null || m.prepared === null || m.draft === null || m.accountId === null) return;
    const format: ImportFormat = m.prepared.format;
    track('import_format_confirmed', { format, decided_by: m.profile.decidedBy, flipped: m.flipped });
    if (format === 'csv') patch({ stage: 'mapping' });
    else goReview(m.draft, m.profile, m.accountId, format);
  }, [goReview, m, patch]);

  // --- mapping (CSV only) ---------------------------------------------------------------

  const mappingErrors: MappingError[] = useMemo(() => (m.mapping === null ? [] : validateMapping(m.mapping)), [m.mapping]);
  const dateAmbiguous = m.reading?.dateAmbiguous ?? false;
  const notationAmbiguous = m.reading?.notationAmbiguous ?? false;
  const dateNeedsChoice = dateAmbiguous && !m.dateChosen;
  const notationNeedsChoice = notationAmbiguous && !m.notationChosen;

  /** Re-derives the draft under new mapping choices; an invalid mapping keeps the old draft. */
  const redraft = useCallback(
    (s: Machine): Machine => {
      const account = accountById(s.accountId);
      if (account === null || s.mapping === null || validateMapping(s.mapping).length > 0) return s;
      const draft = draftFor(s, account);
      return draft === null ? s : { ...s, draft };
    },
    [accountById, draftFor]
  );

  const setMapping = useCallback(
    (mapping: ColumnMapping): void => {
      if (m.stage !== 'mapping' || m.prepared === null || m.prepared.format !== 'csv') return;
      const edited = JSON.stringify(mapping) !== JSON.stringify(m.prepared.csv.detected);
      const next: Machine = { ...m, mapping, mappingEdited: edited };
      // S-CR-06 (E-CR-02): a remapped date or amount column is read again on its own, and any
      // earlier answer about the old column is dropped, so no order or mark is inherited.
      const before = m.mapping;
      const dateMoved = before === null || before.date !== mapping.date;
      const amountsMoved = before === null || AMOUNT_ROLES.some((role) => before[role] !== mapping[role]);
      if (dateMoved || amountsMoved) {
        const reading = inferCsvReading(m.prepared.csv.dataRows, mapping, region);
        const prior = m.reading ?? reading;
        next.reading = {
          ...(dateMoved
            ? { dateGuess: reading.dateGuess, dateFormat: reading.dateFormat, dateAmbiguous: reading.dateAmbiguous }
            : { dateGuess: prior.dateGuess, dateFormat: prior.dateFormat, dateAmbiguous: prior.dateAmbiguous }),
          ...(amountsMoved
            ? { notationGuess: reading.notationGuess, notation: reading.notation, notationAmbiguous: reading.notationAmbiguous }
            : { notationGuess: prior.notationGuess, notation: prior.notation, notationAmbiguous: prior.notationAmbiguous }),
        };
        if (dateMoved) Object.assign(next, { dateFormat: reading.dateFormat, dateChosen: false, dateEdited: false });
        if (amountsMoved) Object.assign(next, { notation: reading.notation, notationChosen: false, notationEdited: false });
      }
      setM(redraft(next));
    },
    [m, redraft, region]
  );

  const setDateFormat = useCallback(
    (f: DateFormat): void => {
      if (m.stage !== 'mapping' || m.prepared === null || m.prepared.format !== 'csv') return;
      const edited = f !== (m.reading ?? m.prepared.csv).dateFormat;
      setM(redraft({ ...m, dateFormat: f, dateChosen: true, dateEdited: edited }));
    },
    [m, redraft]
  );

  const setDecimalMark = useCallback(
    (mark: '.' | ','): void => {
      if (m.stage !== 'mapping' || m.prepared === null || m.prepared.format !== 'csv') return;
      const edited = mark !== (m.reading ?? m.prepared.csv).notation.decimal;
      setM(redraft({ ...m, notation: notationFor(mark), notationChosen: true, notationEdited: edited }));
    },
    [m, redraft]
  );

  const continueFromMapping = useCallback(async (): Promise<void> => {
    if (m.prepared === null || m.prepared.format !== 'csv' || m.profile === null || m.mapping === null) return;
    if (mappingErrors.length > 0 || dateNeedsChoice || notationNeedsChoice) return;
    const account = accountById(m.accountId);
    if (account === null) return;
    const draft = draftFor(m, account);
    if (draft === null) return;

    track('import_mapping_confirmed', { corrected: m.mappingEdited || m.dateEdited || m.notationEdited });

    const rolesKey = rolesKeyOf(m.mapping);
    if (rolesKey === m.rolesKey) {
      patch({ draft });
      goReview(draft, m.profile, account.id, 'csv');
      return;
    }
    // The balance or direction roles moved: the reading is resolved again (D-53).
    const token = ++run.current;
    const remembered = await rememberedFor(draft, account.id);
    if (token !== run.current) return;
    const result = resolveProfile(draft, previewAccountOf(account), remembered);
    if (result.kind === 'ambiguous') {
      patch({ draft, profile: null, candidates: result.candidates, rememberedNote: false, flipped: false, rolesKey, stage: 'format' });
      return;
    }
    const same = result.profile.positiveMeans === m.profile.positiveMeans && result.profile.balanceMeans === m.profile.balanceMeans;
    if (same) {
      patch({ draft, rolesKey });
      goReview(draft, m.profile, account.id, 'csv');
      return;
    }
    // A different reading than the one the user confirmed is shown again, never swapped silently.
    patch({ draft, profile: result.profile, candidates: [], rememberedNote: result.profile.decidedBy === 'remembered', flipped: false, rolesKey, stage: 'format' });
  }, [accountById, dateNeedsChoice, draftFor, goReview, m, mappingErrors.length, notationNeedsChoice, patch, rememberedFor]);

  // --- review ---------------------------------------------------------------------------

  const isIncluded = useCallback(
    (row: PreviewRow): boolean => (row.locked ? false : (m.included.get(row.index) ?? row.included)),
    [m.included]
  );

  const counts = useMemo(() => {
    const rows = m.preview?.rows ?? [];
    return {
      total: rows.length,
      included: rows.filter(isIncluded).length,
      duplicates: rows.filter((r) => r.duplicate !== null).length,
      blocked: rows.filter((r) => r.locked).length,
      cannotVerify: rows.filter((r) => r.check === 'cannot-verify').length,
    };
  }, [isIncluded, m.preview]);

  // S-WR-13: one keyed lookup per preview, so per-row reads (every render of a 5,000-line
  // review) are O(1) rather than a scan of every row.
  const rowsByIndex = useMemo(() => new Map((m.preview?.rows ?? []).map((r) => [r.index, r] as const)), [m.preview]);

  const rowState = useCallback(
    (index: number): { included: boolean; categoryId: string | null; locked: boolean } => {
      const row = rowsByIndex.get(index);
      if (row === undefined) return { included: false, categoryId: null, locked: false };
      return {
        included: isIncluded(row),
        categoryId: m.categories.has(index) ? (m.categories.get(index) ?? null) : row.categoryId,
        locked: row.locked,
      };
    },
    [isIncluded, m.categories, rowsByIndex]
  );

  const toggleRow = useCallback(
    (index: number): void => {
      const row = rowsByIndex.get(index);
      if (row === undefined || row.locked) return;
      setM((prev) => ({ ...prev, included: new Map(prev.included).set(index, !isIncluded(row)) }));
    },
    [isIncluded, rowsByIndex]
  );

  const setRowCategory = useCallback((index: number, categoryId: string | null): void => {
    setM((prev) => ({ ...prev, categories: new Map(prev.categories).set(index, categoryId) }));
  }, []);

  const selectAllClean = useCallback((): void => {
    const next = new Map<number, boolean>();
    for (const row of m.preview?.rows ?? []) next.set(row.index, !row.locked && row.duplicate === null);
    setM((prev) => ({ ...prev, included: next }));
  }, [m.preview]);

  const acceptLimit = useCallback((accepted: boolean): void => patch({ limitAccepted: accepted }), [patch]);

  // --- matches: each suggestion is applied only when the user accepts it ----------------

  const transferRows = useMemo(() => {
    const own = accountById(m.accountId);
    return (m.preview?.rows ?? []).flatMap((row) => {
      if (row.transfer === null || !isIncluded(row)) return [];
      const draft = m.orphanDrafts.get(row.index);
      const other = draft === undefined ? null : accountById(draft.accountId);
      return [
        {
          index: row.index,
          suggestion: row.transfer,
          answer: m.transferAnswers.get(row.index) ?? null,
          linkedId: m.links.get(row.index) ?? null,
          orphanAccountId: draft?.accountId ?? null,
          needsCounterAmount: other !== null && own !== null && other.currency !== row.converted.currency && !m.orphans.has(row.index),
        },
      ];
    });
  }, [accountById, isIncluded, m.accountId, m.links, m.orphanDrafts, m.orphans, m.preview, m.transferAnswers]);

  const payMatchRows = useMemo(
    () =>
      (m.preview?.rows ?? []).flatMap((row) =>
        row.payMatch === null || !isIncluded(row)
          ? []
          : [{ index: row.index, pendingId: row.payMatch.pendingId, answer: m.payAnswers.get(row.index) ?? null }]
      ),
    [isIncluded, m.payAnswers, m.preview]
  );

  // S-WR-03: the cap is enforced here, not only by the buttons, and re-checked at commit, since
  // going Back to Review and including more lines lowers it after suggestions were accepted.
  const acceptedSuggestions = acceptedSuggestionCount(transferRows, payMatchRows);
  const suggestionCap = maxAcceptedSuggestions(counts.included);
  const roomForSuggestion = acceptedSuggestions < suggestionCap;
  const overSuggestionCap = acceptedSuggestions > suggestionCap;
  // S-WR-04: a link or counter leg needs the transfer category; without it nothing is offered.
  const transfersUnavailable = lookup.transferCategoryId === null;

  const rowAt = useCallback((index: number): PreviewRow | undefined => rowsByIndex.get(index), [rowsByIndex]);

  const linkTransfer = useCallback(
    (index: number, existingId: string): void => {
      const t = rowAt(index)?.transfer;
      if (t === undefined || t === null) return;
      const offered = t.kind === 'pair' ? t.existingId === existingId : t.kind === 'choose' ? t.options.includes(existingId) : false;
      const info = m.existingById.get(existingId);
      if (!offered || info === undefined || info.transfer_id !== null) return;
      for (const [other, id] of m.links) if (id === existingId && other !== index) return; // one stored leg, one link (E-WR-06)
      if (transfersUnavailable) return;
      const answered = m.transferAnswers.get(index);
      if (answered !== 'linked' && answered !== 'orphan' && !roomForSuggestion) return;
      track('transfer_suggestion_answered', { accepted: true, kind: 'pair' });
      setM((prev) => ({
        ...prev,
        links: new Map(prev.links).set(index, existingId),
        transferAnswers: new Map(prev.transferAnswers).set(index, 'linked'),
      }));
    },
    [m.existingById, m.links, m.transferAnswers, roomForSuggestion, rowAt, transfersUnavailable]
  );

  const dismissTransfer = useCallback(
    (index: number): void => {
      const t = rowAt(index)?.transfer;
      if (t === undefined || t === null || t.kind === 'orphan') return;
      track('transfer_suggestion_answered', { accepted: false, kind: 'pair' });
      setM((prev) => {
        const links = new Map(prev.links);
        links.delete(index);
        return { ...prev, links, transferAnswers: new Map(prev.transferAnswers).set(index, 'dismissed') };
      });
    },
    [rowAt]
  );

  const setOrphanAccount = useCallback(
    (index: number, otherAccountId: string, counterAmountText?: string): void => {
      const row = rowAt(index);
      const own = accountById(m.accountId);
      const other = accountById(otherAccountId);
      if (row === undefined || row.transfer?.kind !== 'orphan' || own === null || other === null) return;
      if (other.id === own.id || other.archived_at !== null) return;
      if (transfersUnavailable) return;
      const answered = m.transferAnswers.get(index);
      if (answered !== 'linked' && answered !== 'orphan' && !roomForSuggestion) return;

      let counterAmount: number | null = null;
      let accepted = true;
      if (other.currency !== row.converted.currency) {
        // Cross-currency: the user's own figure, parsed strictly, never one derived from a rate (D-50).
        accepted = false;
        if (counterAmountText !== undefined && counterAmountText.trim() !== '') {
          const parsed = parseAmount(counterAmountText, {
            locale: device.locale,
            exponent: exponentFor(other.currency) ?? 2,
            separators: device.separators,
          });
          if (parsed.ok && parsed.value !== 0) {
            counterAmount = Math.abs(parsed.value);
            accepted = true;
          }
        }
      }
      const wasAccepted = m.orphans.has(index);
      if (accepted && !wasAccepted) track('transfer_suggestion_answered', { accepted: true, kind: 'orphan' });
      setM((prev) => {
        const orphans = new Map(prev.orphans);
        const answers = new Map(prev.transferAnswers);
        if (accepted) {
          orphans.set(index, { accountId: other.id, counterAmount });
          answers.set(index, 'orphan');
        } else {
          orphans.delete(index);
          if (answers.get(index) === 'orphan') answers.delete(index);
        }
        return {
          ...prev,
          orphans,
          transferAnswers: answers,
          orphanDrafts: new Map(prev.orphanDrafts).set(index, { accountId: other.id, text: counterAmountText ?? '' }),
        };
      });
    },
    [accountById, device.locale, device.separators, m.accountId, m.orphans, m.transferAnswers, roomForSuggestion, rowAt, transfersUnavailable]
  );

  const dismissOrphan = useCallback(
    (index: number): void => {
      if (rowAt(index)?.transfer?.kind !== 'orphan') return;
      track('transfer_suggestion_answered', { accepted: false, kind: 'orphan' });
      setM((prev) => {
        const orphans = new Map(prev.orphans);
        orphans.delete(index);
        return { ...prev, orphans, transferAnswers: new Map(prev.transferAnswers).set(index, 'dismissed') };
      });
    },
    [rowAt]
  );

  const answerPayMatch = useCallback(
    (index: number, accepted: boolean): void => {
      const pm = rowAt(index)?.payMatch;
      if (pm === undefined || pm === null) return;
      if (accepted && m.existingById.get(pm.pendingId)?.status !== 'pending') return;
      if (accepted && m.payAnswers.get(index) !== 'accepted' && !roomForSuggestion) return;
      track('pay_match_answered', { accepted });
      setM((prev) => ({ ...prev, payAnswers: new Map(prev.payAnswers).set(index, accepted ? 'accepted' : 'dismissed') }));
    },
    [m.existingById, m.payAnswers, roomForSuggestion, rowAt]
  );
  const acceptPayMatch = useCallback((index: number): void => answerPayMatch(index, true), [answerPayMatch]);
  const dismissPayMatch = useCallback((index: number): void => answerPayMatch(index, false), [answerPayMatch]);

  // --- commit ---------------------------------------------------------------------------

  const commit = useCallback((): void => {
    const { preview, profile, draft } = m;
    const account = accountById(m.accountId);
    const householdId = ctx.householdId;
    const userId = ctx.userId;
    // T-02-39-01: nothing is written under a reading the user has not selected (D-42).
    if ((m.stage !== 'review' && m.stage !== 'matches') || committing.current) return;
    if (preview === null || profile === null || draft === null || account === null || householdId === null || userId === null) return;
    if (overSuggestionCap) {
      // S-WR-03: never sent -- the finalize and its undo step would exceed MAX_UNDO_OPS.
      setCommitProblem('suggestionCap');
      if (m.stage === 'review') patch({ stage: 'matches' });
      return;
    }
    if (transfersUnavailable && (m.links.size > 0 || m.orphans.size > 0)) {
      setCommitProblem('transfersUnavailable');
      if (m.stage === 'review') patch({ stage: 'matches' });
      return;
    }

    const included = new Set(preview.rows.filter(isIncluded).map((r) => r.index));
    const payMatches = new Set([...m.payAnswers].flatMap(([i, a]) => (a === 'accepted' ? [i] : [])));
    const batchId = newStepId();
    const stepId = newStepId();
    const built = toImportCommit(
      preview,
      { included, categories: m.categories, links: m.links, orphans: m.orphans, payMatches, acceptLimit: m.limitAccepted },
      {
        householdId,
        accountId: account.id,
        timeZone: ctx.timeZone,
        transferCategoryId: lookup.transferCategoryId,
        accounts: transferAccounts(accounts),
        existingById: m.existingById,
        accountVersion: account.version,
        // A reading the user confirmed or flipped is remembered for this layout (D-42).
        remember: profile.decidedBy === 'remembered' ? null : { signature: draft.layoutSignature, id: newStepId() },
      },
      batchId,
      newStepId
    );
    // Nothing included and nothing marked paid: there is nothing to write.
    if (built.rows.length === 0 && built.finalize.markPaid.length === 0) return;

    // Held until the next start or cancel, so a double tap can never write the batch twice.
    committing.current = true;
    try {
      importCommit.commit({
        householdId,
        userId,
        homeCurrency: ctx.homeCurrency,
        batchId,
        stepId,
        rows: built.rows,
        finalize: built.finalize,
      });
    } catch {
      // S-WR-04: refused before anything was queued (the hook validates synchronously). An
      // exception thrown from an onPress would crash the app and lose the import; instead the
      // user's choices stay and they can adjust and try again.
      committing.current = false;
      setCommitProblem('failed');
      return;
    }
    setCommitProblem(null);

    const count = built.rows.length + built.finalize.markPaid.length;
    showToast({ kind: 'destructive', text: { key: 'undo.label.imported', params: { count, n: count } }, stepId });
    track('import_committed', {
      entry,
      size: sizeBand(count),
      format: preview.format,
      reconciliation: RECONCILIATION[preview.reconcile.file],
    });

    // D-21 / D-56: recurring suggestions come from the committed ordinary rows only; a linked
    // or counter transfer leg and a row that marked a bill paid are never fed to detection.
    const linkedImported = new Set(built.finalize.links.map((l) => l.importedId));
    const ordinary = built.rows.filter((r) => !r.transfer_id && !linkedImported.has(r.id) && r.name !== null && r.name !== undefined);
    const suggestions = detectRecurring(
      ordinary.map((r) => ({
        id: r.id,
        name: r.name as string,
        amount: r.original_amount,
        currency: r.original_currency,
        localDate: r.local_date,
        isTransfer: false,
      }))
    );
    patch({
      stage: 'done',
      suggestions,
      committedRows: ordinary.map((r) => ({ id: r.id, localDate: r.local_date, categoryId: r.category_id ?? null })),
    });
  }, [accountById, accounts, ctx.homeCurrency, ctx.householdId, ctx.timeZone, ctx.userId, entry, importCommit, isIncluded, lookup.transferCategoryId, m, overSuggestionCap, patch, transfersUnavailable]);

  const acceptSuggestion = useCallback(
    (key: string): void => {
      const s = m.suggestions.find((x) => x.key === key);
      if (s === undefined || m.accountId === null || ctx.householdId === null || ctx.userId === null) return;
      const spec = suggestionToSeries(s, m.committedRows, { householdId: ctx.householdId, accountId: m.accountId, timeZone: ctx.timeZone }, newStepId());
      createSeries.create({
        series: spec.series,
        anchorTransactionId: spec.anchorTransactionId,
        linkTransactionIds: spec.linkTransactionIds,
        anchorIsNew: false,
        ownerId: ctx.userId,
      });
      track('recurring_suggestion_answered', { accepted: true });
      setM((prev) => ({ ...prev, suggestions: prev.suggestions.filter((x) => x.key !== key) }));
    },
    [createSeries, ctx.householdId, ctx.timeZone, ctx.userId, m.accountId, m.committedRows, m.suggestions]
  );

  const dismissSuggestion = useCallback((key: string): void => {
    track('recurring_suggestion_answered', { accepted: false });
    setM((prev) => ({ ...prev, suggestions: prev.suggestions.filter((x) => x.key !== key) }));
  }, []);

  const continueStage = useCallback((): Promise<void> | void => {
    if (m.stage === 'mapping') return continueFromMapping();
    if (m.stage === 'review') {
      if (transferRows.length > 0 || payMatchRows.length > 0) patch({ stage: 'matches' });
      else commit();
    } else if (m.stage === 'matches') commit();
    return undefined;
  }, [commit, continueFromMapping, m.stage, patch, payMatchRows.length, transferRows.length]);

  const back = useCallback((): void => {
    if (m.stage === 'mapping') patch({ stage: 'format' });
    else if (m.stage === 'review') patch({ stage: m.prepared?.format === 'csv' ? 'mapping' : 'format' });
    else if (m.stage === 'matches') patch({ stage: 'review' });
  }, [m.prepared, m.stage, patch]);

  const cancel = useCallback((): void => {
    const at: AbandonStage | null =
      m.stage === 'reading' || m.stage === 'choose-statement'
        ? 'pick'
        : m.stage === 'format' || m.stage === 'mapping' || m.stage === 'review' || m.stage === 'matches'
          ? m.stage
          : null;
    if (m.stage === 'committing') return;
    run.current += 1;
    committing.current = false;
    if (at !== null) track('import_abandoned', { stage: at });
    setM(initialMachine(m.accountId));
  }, [m.accountId, m.stage]);

  const exampleRow: ConvertedRow | null = useMemo(() => {
    if (m.draft === null || m.profile === null) return null;
    const account = accountById(m.accountId);
    if (account === null) return null;
    const row = m.draft.rows.find((r) => r.magnitude !== null);
    if (row === undefined) return null;
    const own = m.profile.accountFamily === 'card' ? account.credit_limit : account.overdraft_limit;
    const limit = m.profile.accountFamily === 'card' ? (own ?? m.profile.statedLimit) : own;
    const converted = convertDraft({ ...m.draft, rows: [row], statedOpening: null, statedClosing: null, available: null }, m.profile, {
      limit: limit === null ? null : minorUnits(limit),
    });
    return converted.rows[0] ?? null;
  }, [accountById, m.accountId, m.draft, m.profile]);

  /**
   * What the format sentence quotes (D-42): the file's stated closing balance under the
   * current reading (owed negative, held positive), the limit it is read against, and whether
   * the amount owed is over that limit. Null until a reading is selected.
   */
  const formatFigures = useMemo(() => {
    if (m.draft === null || m.profile === null) return null;
    const account = accountById(m.accountId);
    if (account === null) return null;
    const own = m.profile.accountFamily === 'card' ? account.credit_limit : account.overdraft_limit;
    const limit = m.profile.accountFamily === 'card' ? (own ?? m.profile.statedLimit) : own;
    const converted = convertDraft({ ...m.draft, rows: [] }, m.profile, { limit: limit === null ? null : minorUnits(limit) });
    const closing: number | null = converted.closing;
    return {
      closing,
      limit: limit as number | null,
      overLimit: limit !== null && closing !== null && closing < 0 && -closing > limit,
      currency: m.draft.currency ?? account.currency,
    };
  }, [accountById, m.accountId, m.draft, m.profile]);

  /** The CSV header row, so the mapping step can name each column (empty for OFX). */
  const headers: string[] = m.prepared !== null && m.prepared.format === 'csv' ? m.prepared.csv.header : [];

  const statementChoices = useMemo(
    () => (m.prepared !== null && m.prepared.format !== 'csv' ? statementOptions(m.prepared.statements) : []),
    [m.prepared]
  );

  return {
    stage: m.stage,
    rejectReason: m.rejectReason,
    format: (m.prepared?.format ?? null) as ImportFormat | null,
    statementChoices,
    chooseStatement,
    accountId: m.accountId,
    setAccount,
    profile: m.profile,
    candidates: m.candidates,
    rememberedNote: m.rememberedNote,
    exampleRow,
    formatFigures,
    headers,
    flip,
    chooseCandidate,
    confirmFormat,
    mapping: m.mapping,
    mappingErrors,
    dateFormat: m.dateFormat,
    dateAmbiguous,
    dateNeedsChoice,
    decimalMark: (m.notation?.decimal ?? null) as '.' | ',' | null,
    notationAmbiguous,
    notationNeedsChoice,
    setMapping,
    setDateFormat,
    setDecimalMark,
    start,
    cancel,
    continue: continueStage,
    back,
    // review
    preview: m.preview,
    storedLegs: m.storedLegs,
    reconcile: m.preview?.reconcile ?? null,
    counts,
    rowState,
    toggleRow,
    setRowCategory,
    selectAllClean,
    limitOffer: m.preview?.limitOffer ?? null,
    limitAccepted: m.limitAccepted,
    acceptLimit,
    // matches
    transferRows,
    payMatchRows,
    linkTransfer,
    dismissTransfer,
    setOrphanAccount,
    dismissOrphan,
    acceptPayMatch,
    dismissPayMatch,
    overSuggestionCap,
    suggestionCap,
    transfersUnavailable,
    // commit and what follows
    commit,
    commitProblem,
    suggestions: m.suggestions,
    acceptSuggestion,
    dismissSuggestion,
  };
}
