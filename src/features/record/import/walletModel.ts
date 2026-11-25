// Wallet statement import model (IMP-06, D-21..D-23): pure, no React. Turns the engine's wallet
// drafts into per-currency account targets (nothing is created without a tap, D-22), the lines
// held back for want of an account, and the rows, fee expenses and conversion pairs a commit
// writes (D-23: payments at gross, each fee its own expense, so every account balance moves by
// exactly the file's net).
import { DEFAULT_KEYWORD_RULES, guessCategory, type GuessContext } from '@/engine/categorize';
import { findDuplicates, type DraftRow, type ExistingRow, type WalletDrafts, type WalletKind } from '@/engine/statement';
import type { NewTransaction } from '@/db/rows';

export interface WalletTarget {
  currency: string;
  accountId: string | null;
  /** The name offered for a new account, e.g. "Wise EUR"; null when an account is already picked. */
  createName: string | null;
  /** The person switched this currency's new account on. Nothing is created until they tap Create. */
  create: boolean;
}

export interface WalletPlan {
  wallet: WalletKind;
  targets: WalletTarget[];
  /** DraftRow.index of every line whose currency has no account and no new-account switch. */
  heldBack: number[];
  counts: { lines: number; fees: number; conversions: number; newAccounts: number };
  /** D-34: lines already imported, left out of the counts above and skipped by the commit. */
  duplicateCount: number;
}

export interface WalletPlanAccount {
  id: string;
  name: string;
  currency: string;
  archived: boolean;
}

export interface WalletChoices {
  /** Currencies whose new-account switch is on. */
  create?: ReadonlySet<string>;
  /** Currency -> an account the person picked (or just created) for it. */
  link?: ReadonlyMap<string, string>;
  /** Conversions the person unlinked, by the index of their outgoing line. */
  unlinked?: ReadonlySet<number>;
  /** D-34: duplicates and guesses; duplicates leave the counts. */
  marks?: WalletMarks;
}

/** The brand names are proper nouns, not interface copy. */
const LABELS: Readonly<Record<WalletKind, string>> = { paypal: 'PayPal', wise: 'Wise', revolut: 'Revolut' };

export function walletLabel(wallet: WalletKind): string {
  return LABELS[wallet];
}

/** The person's own category the fee lines go to; created on first use and theirs to rename (D-23). */
export const FEES_CATEGORY_NAME = 'Fees';

function suggestAccount(wallet: WalletKind, currency: string, accounts: readonly WalletPlanAccount[]): string | null {
  const brand = LABELS[wallet].toLowerCase();
  const hits = accounts.filter((a) => !a.archived && a.currency === currency && a.name.toLowerCase().includes(brand));
  return hits.length === 1 ? (hits[0] as WalletPlanAccount).id : null;
}

export function walletPlan(d: WalletDrafts, accounts: readonly WalletPlanAccount[], choices: WalletChoices = {}): WalletPlan {
  const targets: WalletTarget[] = d.currencies.map((currency) => {
    const accountId = choices.link?.get(currency) ?? suggestAccount(d.wallet, currency, accounts);
    const create = accountId === null && choices.create?.has(currency) === true;
    return {
      currency,
      accountId,
      createName: accountId === null ? `${LABELS[d.wallet]} ${currency}` : null,
      create,
    };
  });
  const available = new Set(targets.filter((x) => x.accountId !== null || x.create).map((x) => x.currency));
  const heldBack = d.drafts.filter((x) => !available.has(x.currency ?? '')).flatMap((x) => x.rows.map((r) => r.index));
  const dup = choices.marks?.duplicates ?? new Set<number>();
  const dupFees = choices.marks?.duplicateFees ?? new Set<number>();
  const lines = d.drafts.filter((x) => available.has(x.currency ?? '')).reduce((a, x) => a + x.rows.filter((r) => !dup.has(r.index)).length, 0);
  const duplicateCount = d.drafts.filter((x) => available.has(x.currency ?? '')).reduce((a, x) => a + x.rows.filter((r) => dup.has(r.index)).length, 0);
  const fees = d.feeLines.filter((f, position) => available.has(f.currency) && !dupFees.has(position)).length;
  const conversions = d.transferPairs.filter(
    (p) => available.has(p.fromCurrency) && available.has(p.toCurrency) && choices.unlinked?.has(p.fromIndex) !== true && !dup.has(p.fromIndex) && !dup.has(p.toIndex)
  ).length;
  return {
    wallet: d.wallet,
    targets,
    heldBack,
    counts: { lines, fees, conversions, newAccounts: targets.filter((x) => x.create).length },
    duplicateCount,
  };
}

export interface WalletCommitInput {
  drafts: WalletDrafts;
  /** Currency -> the account its lines go to. A currency absent here is held back. */
  accountByCurrency: ReadonlyMap<string, string>;
  householdId: string;
  timeZone: string;
  batchId: string;
  feesCategoryId: string | null;
  transferCategoryId: string | null;
  unlinked?: ReadonlySet<number>;
  /** D-34: lines already in the books (and their fees) are skipped; guessed categories are applied. */
  marks?: WalletMarks;
  newId: () => string;
}

export interface WalletCommit {
  rows: NewTransaction[];
  /** forRowId is null only for a fee with no payment line of its own (a fee-only line). */
  walletFees: { forRowId: string | null; row: NewTransaction }[];
  walletPairs: { fromRowId: string; toRowId: string }[];
}

function signed(r: DraftRow): number {
  return (r.marker === 'minus' ? -1 : 1) * (r.magnitude ?? 0);
}

/** D-34: what the same duplicate check and category guess as a bank statement found for a wallet file. */
export interface WalletMarks {
  /** DraftRow.index of every line already stored (skipped by default, as for statements). */
  duplicates: ReadonlySet<number>;
  /** Position in WalletDrafts.feeLines of every fee already stored, or whose payment line is a duplicate. */
  duplicateFees: ReadonlySet<number>;
  /** DraftRow.index -> the guessed category id (only lines with a guess appear). */
  categories: ReadonlyMap<number, string>;
}

export const NO_WALLET_MARKS: WalletMarks = { duplicates: new Set(), duplicateFees: new Set(), categories: new Map() };

/**
 * D-34: reuses the statement import's findDuplicates (per account, over already-settled stored rows)
 * and guessCategory (rules, learned names, keywords). A fee is a duplicate when its payment line is,
 * or when a stored expense with the same wallet-fee name, date and amount exists (multiset-counted).
 */
export function walletMarks(
  d: WalletDrafts,
  accountByCurrency: ReadonlyMap<string, string>,
  existingByAccount: ReadonlyMap<string, readonly ExistingRow[]>,
  guess: Omit<GuessContext, 'keywordRules'>
): WalletMarks {
  const duplicates = new Set<number>();
  const categories = new Map<number, string>();
  const ctx: GuessContext = { keywordRules: DEFAULT_KEYWORD_RULES, ...guess };

  for (const draft of d.drafts) {
    const accountId = draft.rows.length === 0 ? undefined : accountByCurrency.get(draft.rows[0]?.currency ?? '');
    const existing = accountId === undefined ? [] : (existingByAccount.get(accountId) ?? []);
    const candidates = draft.rows.map((r) => ({
      index: r.index,
      localDate: r.localDate,
      amount: r.magnitude === null ? null : signed(r),
      name: r.description,
      externalId: r.externalId,
    }));
    for (const index of findDuplicates(candidates, existing, { sourceFormat: 'csv' }).matches.keys()) duplicates.add(index);
    for (const r of draft.rows) {
      if (r.magnitude === null) continue;
      const g = guessCategory({ name: r.description, amount: signed(r) }, ctx);
      if (g.categoryId !== null) categories.set(r.index, g.categoryId);
    }
  }

  const feeName = `${LABELS[d.wallet]} fee`;
  const used = new Map<string, number>();
  const duplicateFees = new Set<number>();
  d.feeLines.forEach((f, position) => {
    if (duplicates.has(f.forIndex)) {
      duplicateFees.add(position);
      return;
    }
    const accountId = accountByCurrency.get(f.currency);
    const stored = accountId === undefined ? [] : (existingByAccount.get(accountId) ?? []);
    const matching = stored.filter((e) => e.name === feeName && e.localDate === f.localDate && e.amount === -f.magnitude).length;
    const key = `${accountId ?? ''}|${f.localDate}|${f.magnitude}`;
    const seen = used.get(key) ?? 0;
    if (seen < matching) {
      used.set(key, seen + 1);
      duplicateFees.add(position);
    }
  });
  return { duplicates, duplicateFees, categories };
}

export function buildWalletCommit(input: WalletCommitInput): WalletCommit {
  const { drafts: d } = input;
  const rows: NewTransaction[] = [];
  const idByIndex = new Map<number, string>();

  for (const draft of d.drafts) {
    for (const r of draft.rows) {
      const accountId = input.accountByCurrency.get(r.currency);
      if (accountId === undefined || r.magnitude === null || r.localDate === null) continue;
      if (input.marks?.duplicates.has(r.index) === true) continue;
      const row: NewTransaction = {
        id: input.newId(),
        household_id: input.householdId,
        account_id: accountId,
        original_amount: signed(r),
        original_currency: r.currency,
        local_date: r.localDate,
        time_zone: input.timeZone,
        note: null,
        name: r.description === '' ? null : r.description,
        category_id: input.marks?.categories.get(r.index) ?? null,
        status: 'paid',
        import_batch_id: input.batchId,
        raw_amount: null,
        raw_balance: null,
        external_id: r.externalId,
        import_format: 'csv',
      };
      rows.push(row);
      idByIndex.set(r.index, row.id);
    }
  }

  const walletFees: WalletCommit['walletFees'] = [];
  d.feeLines.forEach((f, position) => {
    const accountId = input.accountByCurrency.get(f.currency);
    if (accountId === undefined || f.magnitude <= 0 || input.marks?.duplicateFees.has(position) === true) return;
    walletFees.push({
      forRowId: idByIndex.get(f.forIndex) ?? null,
      row: {
        id: input.newId(),
        household_id: input.householdId,
        account_id: accountId,
        original_amount: -f.magnitude,
        original_currency: f.currency,
        local_date: f.localDate,
        time_zone: input.timeZone,
        note: null,
        name: `${LABELS[d.wallet]} fee`,
        category_id: input.feesCategoryId,
        status: 'paid',
        import_batch_id: input.batchId,
        raw_amount: null,
        raw_balance: null,
        external_id: null,
        import_format: 'csv',
      },
    });
  });

  // A conversion links only when both lines are imported, the legs run out and in on different
  // accounts (the database pair rule), and a Transfer category exists; otherwise they stay plain lines.
  const walletPairs: WalletCommit['walletPairs'] = [];
  const rowById = new Map(rows.map((r) => [r.id, r] as const));
  for (const p of d.transferPairs) {
    if (input.transferCategoryId === null || input.unlinked?.has(p.fromIndex) === true) continue;
    const fromId = idByIndex.get(p.fromIndex);
    const toId = idByIndex.get(p.toIndex);
    if (fromId === undefined || toId === undefined) continue;
    const from = rowById.get(fromId) as NewTransaction;
    const to = rowById.get(toId) as NewTransaction;
    if (from.account_id === to.account_id || from.original_amount >= 0 || to.original_amount <= 0) continue;
    walletPairs.push({ fromRowId: fromId, toRowId: toId });
  }

  return { rows, walletFees, walletPairs };
}

export interface WalletFeeView {
  magnitude: number;
  currency: string;
}

export type WalletItem =
  | { kind: 'line'; key: string; row: DraftRow; held: boolean; /** D-34: already imported, skipped. */ duplicate: boolean; fee: WalletFeeView | null; /** Set on the outgoing line of a conversion the person unlinked. */ relinkFrom: number | null }
  | { kind: 'conversion'; key: string; from: DraftRow; to: DraftRow; fee: WalletFeeView | null; fromIndex: number }
  | { kind: 'feeOnly'; key: string; localDate: string; fee: WalletFeeView };

/**
 * The preview list (D-22, D-23): every line in file order, a linked conversion as one item, each fee
 * under its payment, and lines with no account held back rather than guessed.
 */
export function walletItems(d: WalletDrafts, plan: WalletPlan, unlinked: ReadonlySet<number> = new Set(), marks: WalletMarks = NO_WALLET_MARKS): WalletItem[] {
  const rows = d.drafts.flatMap((x) => x.rows).sort((a, b) => a.index - b.index);
  const byIndex = new Map(rows.map((r) => [r.index, r] as const));
  const held = new Set(plan.heldBack);
  const feeFor = new Map(d.feeLines.map((f) => [f.forIndex, { magnitude: f.magnitude, currency: f.currency }] as const));
  const pairOfFrom = new Map(d.transferPairs.map((p) => [p.fromIndex, p] as const));
  const pairedTo = new Map<number, number>();
  const items: WalletItem[] = [];

  for (const p of d.transferPairs) {
    if (!unlinked.has(p.fromIndex) && !held.has(p.fromIndex) && !held.has(p.toIndex)) pairedTo.set(p.toIndex, p.fromIndex);
  }

  for (const r of rows) {
    if (pairedTo.has(r.index)) continue; // shown with its outgoing leg
    const pair = pairOfFrom.get(r.index);
    const to = pair === undefined ? undefined : byIndex.get(pair.toIndex);
    if (pair !== undefined && to !== undefined && pairedTo.get(pair.toIndex) === r.index) {
      items.push({
        kind: 'conversion',
        key: `c${r.index}`,
        from: r,
        to,
        fromIndex: r.index,
        fee: feeFor.get(pair.feeIndex ?? -1) ?? null,
      });
      continue;
    }
    items.push({
      kind: 'line',
      key: `l${r.index}`,
      row: r,
      held: held.has(r.index),
      duplicate: marks.duplicates.has(r.index),
      fee: feeFor.get(r.index) ?? null,
      relinkFrom: pair !== undefined && unlinked.has(pair.fromIndex) ? pair.fromIndex : null,
    });
  }

  for (const f of d.feeLines) {
    if (!byIndex.has(f.forIndex) && plan.targets.some((x) => x.currency === f.currency && (x.accountId !== null || x.create))) {
      items.push({ kind: 'feeOnly', key: `f${f.forIndex}`, localDate: f.localDate, fee: { magnitude: f.magnitude, currency: f.currency } });
    }
  }
  return items;
}
