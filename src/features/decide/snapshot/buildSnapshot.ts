// 05-06: PURE snapshot builder (DEC-12 seam). No React, no I/O, never reaches the FX fetch door
// (depcruise fx-fetch-never-from-reads): stored rates only. Integer minor units only.
//
// Every payment is counted once (Core Value): a Savings-category series is saving, a series that pays a recorded loan is
// that debt's minimum, a card owing a balance pays its stored or per-market minimum (simulateMinimum, D-40). A needed
// amount with no stored rate makes the whole result unconverted (D-37); nothing is ever guessed. A past line saved while its
// own rate was pending is converted at the latest stored rate and flagged provisional (D-69); that value is never written.
import {
  AVERAGING_WINDOW_MONTHS,
  CARD_MAX_PURCHASE_USD,
  MARKET_DEFAULTS,
  ZERO_PERCENT,
  minimumTermsFromDefaults,
  monthlyEquivalent,
  percent,
  type CardMinimumTerms,
  type DebtRecord,
  type DecideLimits,
  type DecideSnapshot,
  type ExpenseLine,
  type FutureChange,
  type MarketKey,
  type MonthRecord,
  type Percent,
  type PotInput,
  type RecordLine,
  type RecurringBill,
  type RecurringIncome,
  type RoughFigures,
  type ScheduledOutflow,
} from '@/engine/decide';
import { PERCENT_SCALE, simulateMinimum } from '@/engine/payoff';
import { MAX_ABS_AMOUNT_MINOR, currencyCode, divideHalfUp, minorUnits } from '@/engine/money';
import { monthOf } from '@/engine/time';
import { convertLatest } from '@/data/queries/fxConvert';
import { homeAmountFor, isOwnCurrencyRow } from '@/data/queries/homeAmount';
import type { AccountRow, CustomCurrencyRow, FxLatestRow, RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { convertCeiled, convertFloored, makeConverter, provisionalHomeAmount, type ProvisionalAmount } from './conversion';
import { fullMonthFlags } from './fullMonths';
import type { CardChoice, CardLimitRateNote, CardTermsView, SnapshotMeta, SnapshotResult } from './types';

// structurally identical to src/db/* (05-05); 05-12 passes 05-05 rows here, so its typecheck proves they agree
export interface SettingsSource {
  currency: string | null;
  rough_income: number | null;
  rough_spending: number | null;
  reserve: number | null;
  dsr_line: string | null;
  housing_line: string | null; // D-103 (R18.4): the 28% housing line as a decimal string, parsed like dsr_line and capped at 100
  unsecured_multiple: number | null;
  investing_floor: number | null;
  saving_floor: number | null;
  basis_override: 'average' | 'worst' | null;
}

export interface DebtSource {
  id: string;
  account_id: string | null;
  check_id: string | null;
  series_id: string | null;
  kind: 'loan' | 'card' | 'other';
  currency: string;
  balance: number;
  apr: string | null;
  minimum_payment: number;
  secured: boolean;
  min_percent: string | null;
  min_interest_added: boolean | null;
  min_floor: number | null;
  paid_in_full: boolean;
  is_housing: boolean; // D-103: a loan (never a card) whose minimum counts toward housingMonthly
  version: number;
  deleted_at: string | null;
}

// structurally identical to the savings_goals rows (05-122): the pots and Wait goals (D-101). Done and deleted rows are left out by the builder.
export interface GoalSource {
  id: string;
  kind: 'wait' | 'pot';
  check_id: string | null;
  currency: string;
  target: number | null;
  monthly_amount: number | null;
  ready_by: string | null;
  opening_saved: number;
  done_at: string | null;
  deleted_at: string | null;
}

// structurally identical to src/db/decideChanges.ts (05-38)
export interface ChangeSource {
  id: string;
  kind: 'income' | 'spending';
  monthly_amount: number;
  currency: string;
  start_month: string;
  end_month: string | null;
  deleted_at: string | null;
}

type SnapshotRow = Pick<
  TransactionRow,
  | 'id'
  | 'account_id'
  | 'local_date'
  | 'original_amount'
  | 'original_currency'
  | 'home_currency'
  | 'home_amount'
  | 'orig_per_eur'
  | 'status'
  | 'is_refund'
  | 'transfer_id'
  | 'recurring_series_id'
  | 'category_id'
  | 'deleted_at'
> & { one_off?: boolean | null; goal_id?: string | null }; // goal_id: D-34/D-101, a transfer leg tagged to a savings goal or pot

export interface SnapshotSource {
  today: string;
  homeCurrency: string;
  region: string | null; // 05-12 passes getDeviceRegion(rc.region) ?? null (RD-02: override > device region > time zone, never IP)
  rows: readonly SnapshotRow[];
  upcomingRows: readonly SnapshotRow[]; // live rows dated after the history window (05-12); only their pending one-offs are used
  series: readonly Pick<
    RecurringSeriesRow,
    'id' | 'account_id' | 'amount' | 'currency' | 'freq' | 'anchor_date' | 'end_date' | 'occurrence_count' | 'category_id' | 'deleted_at'
  >[];
  accounts: readonly Pick<AccountRow, 'id' | 'name' | 'kind' | 'currency' | 'archived_at' | 'deleted_at'>[];
  balances: Readonly<Record<string, number>>; // account id → paid-only balance in the account's currency
  rates: readonly FxLatestRow[];
  categories: Readonly<Record<string, string | null>>; // category id → builtin_key (null for custom)
  settings: SettingsSource | null;
  debts: readonly DebtSource[];
  goals: readonly GoalSource[]; // D-101: every savings_goals row (kind 'pot' | 'wait'); done and deleted ones are filtered here
  statementPeriods: readonly { account_id: string; period_start: string; period_end: string }[];
  customCurrencies: readonly CustomCurrencyRow[];
  changes: readonly ChangeSource[];
  paymentLinks: readonly { check_id: string; target_id: string; check_kind: 'buy' | 'invest' }[];
  writtenRowLinks: readonly { check_id: string; target_id: string }[];
}

const LOOKBACK_MONTHS = 12;
const UNCATEGORISED = 'uncategorised';
const NOT_CUTTABLE = new Set(['Housing', 'Savings', 'Debt', 'Tax']);
const DSR_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;
const MAX_UNSECURED_MULTIPLE = 120;
const MAX_LINE_PERCENT = 100; // D-103: the housing line, like the column check
const NO_SETTINGS: SettingsSource = {
  currency: null,
  rough_income: null,
  rough_spending: null,
  reserve: null,
  dsr_line: null,
  housing_line: null,
  unsecured_multiple: null,
  investing_floor: null,
  saving_floor: null,
  basis_override: null,
};

/** The region preference → market table row. Country level only: never 'CA-QC' (a province field is deferred). */
export function marketKeyFor(region: string | null): MarketKey | null {
  if (region === 'US') return 'US';
  if (region === 'CA') return 'CA';
  if (region === 'GB') return 'UK';
  return null;
}

function decimalOf(p: Percent): string {
  const digits = p.toString().padStart(PERCENT_SCALE.toString().length, '0');
  const split = digits.length - (PERCENT_SCALE.toString().length - 1);
  return [digits.slice(0, split), digits.slice(split).replace(/0+$/, '')].filter((part) => part !== '').join('.');
}

function average(total: bigint, count: number): number {
  return count > 0 ? Number(divideHalfUp(total, BigInt(count))) : 0;
}

export function buildDecideSnapshot(source: SnapshotSource): SnapshotResult {
  const { today, homeCurrency: home } = source;
  const cur = currencyCode(home);
  const currentMonth = monthOf(today);
  const converter = makeConverter({ home, rates: source.rates, customs: source.customCurrencies, today });
  /** A needed amount: no stored rate → recorded as missing (D-37), never guessed. */
  const need = (amount: number, currency: string): number | null => {
    const v = converter.toHome(amount, currency);
    if (v === null) converter.miss(currency);
    return v;
  };
  /** A market default (not the user's amount): converted without a basis note, and a miss is not recorded. */
  const peek = (amount: number, currency: string): number | null =>
    convertLatest(amount, currency, home, source.rates, source.customCurrencies, today)?.amount ?? null;
  const missedRows = new Set<string>();
  const missRow = (r: SnapshotRow): void => {
    if (missedRows.has(r.id)) return;
    missedRows.add(r.id);
    converter.miss(r.original_currency);
  };
  /** A line's home amount: its own stamp (homeAmountFor), else the latest stored rate (D-69, provisional), else null. */
  const homeOf = (r: SnapshotRow): ProvisionalAmount | null => {
    const stamped = homeAmountFor(r, home, source.rates, source.customCurrencies);
    if (stamped !== null) {
      // The home currency changed after this line was saved in its own currency: a normal latest-rate conversion (D-37 note), not provisional.
      return isOwnCurrencyRow(r, home) ? { amount: stamped, rateDate: null, latestFrom: r.original_currency } : { amount: stamped, rateDate: null };
    }
    return provisionalHomeAmount(r, home, source.rates, source.customCurrencies, today);
  };
  /** D-69: count a line whose figure is in use and came from a provisional rate. */
  const markProvisional = (r: SnapshotRow, conv: ProvisionalAmount): void => {
    if (conv.latestFrom !== undefined) converter.toHome(r.original_amount, conv.latestFrom); // records the D-37 conversion note
    if (conv.rateDate !== null) converter.provisional(r.id, conv.rateDate);
  };
  const keyOf = (categoryId: string | null): string | null =>
    categoryId === null ? null : (source.categories[categoryId] ?? null);

  const accountById = new Map(source.accounts.map((a) => [a.id, a]));
  const isLive = (a: Pick<AccountRow, 'archived_at' | 'deleted_at'>): boolean => a.archived_at === null && a.deleted_at === null;
  const cashLike = (kind: string | undefined): boolean => kind === 'cash' || kind === 'checking' || kind === 'savings';
  const liveAccounts = source.accounts.filter(isLive);

  // ── debts rows ──
  const liveDebts = source.debts.filter((d) => d.deleted_at === null);
  const loanDebts = liveDebts.filter((d) => d.kind !== 'card');
  const cardRowOf = (accountId: string) => liveDebts.find((d) => d.kind === 'card' && d.account_id === accountId) ?? null;
  const namedByLoan = new Set<string>();
  const loanChecks = new Set<string>();
  const coveredSeries = new Set<string>();
  for (const d of loanDebts) {
    if (d.account_id !== null) namedByLoan.add(d.account_id);
    if (d.check_id !== null) loanChecks.add(d.check_id);
    if (d.series_id !== null) coveredSeries.add(d.series_id); // D-48: names the first run
  }
  for (const link of source.paymentLinks) {
    if (loanChecks.has(link.check_id)) coveredSeries.add(link.target_id); // the later runs
  }
  const investSeries = new Set(source.paymentLinks.filter((l) => l.check_kind === 'invest').map((l) => l.target_id));
  const paymentChecks = new Set(source.paymentLinks.map((l) => l.check_id));
  const writtenTargets = new Set(source.writtenRowLinks.filter((l) => paymentChecks.has(l.check_id)).map((l) => l.target_id));

  const debts: DebtRecord[] = [];
  let housingDebtMonthly = 0; // D-103: the minimums of the loans marked as housing (a card is never in loanDebts)
  for (const d of loanDebts) {
    const balance = need(d.balance, d.currency);
    const minimum = need(d.minimum_payment, d.currency);
    if (balance === null || minimum === null) continue;
    if (d.is_housing) housingDebtMonthly += Math.max(0, minimum);
    debts.push({
      id: d.id,
      balance: minorUnits(Math.max(0, balance)),
      minimumPayment: minorUnits(Math.max(0, minimum)),
      secured: d.secured,
      apr: d.apr ? percent(d.apr) : null,
      currency: cur,
    });
  }

  // ── series: one predicate for what is counted elsewhere ──
  const liveSeries = source.series.filter((s) => s.deleted_at === null);
  const savingsSeries = new Set(liveSeries.filter((s) => keyOf(s.category_id) === 'Savings').map((s) => s.id));
  const elsewhere = new Set([...coveredSeries, ...savingsSeries]);
  const isActive = (s: { end_date: string | null }): boolean => s.end_date === null || s.end_date >= today;

  // ── rows → months ──
  const liveRows = source.rows.filter((r) => r.deleted_at === null);
  const flags = fullMonthFlags({
    today,
    rowDates: liveRows.map((r) => ({ date: r.local_date, accountId: r.account_id })),
    periods: source.statementPeriods.map((p) => ({ accountId: p.account_id, start: p.period_start, end: p.period_end })),
    lookbackMonths: LOOKBACK_MONTHS,
  });
  const monthKeys = [...flags.keys()].sort().reverse(); // newest first
  const fullKeys = monthKeys.filter((m) => flags.get(m) === true);
  const usedMonths = new Set(fullKeys.slice(0, AVERAGING_WINDOW_MONTHS));

  // WR-B03 (D-68): a Debt-category payment outside a series is spending unless it is a transfer into a card or loan
  // whose minimum is counted. A transfer leg is never spending here anyway (D-28), so in the history every Debt-category
  // payment that is not a transfer stays an ordinary outgoing: it went to an account the app does not track.
  const linesByMonth = new Map<string, RecordLine[]>();
  let savingTotal = 0n;
  let investingTotal = 0n;
  const expenseTotals = new Map<string, bigint>();
  const lastPaid = new Map<string, string>();
  let expenseLinesThisMonth = 0;
  for (const r of liveRows) {
    if (r.recurring_series_id !== null && r.status !== 'pending') {
      const seen = lastPaid.get(r.recurring_series_id);
      if (seen === undefined || seen < r.local_date) lastPaid.set(r.recurring_series_id, r.local_date);
    }
    const month = r.local_date.slice(0, 7);
    if (!flags.has(month)) continue;
    const conv = homeOf(r);
    if (month === currentMonth && conv !== null && conv.amount < 0) expenseLinesThisMonth += 1;
    if (r.recurring_series_id !== null && elsewhere.has(r.recurring_series_id)) continue;
    const used = usedMonths.has(month);
    if (conv === null) {
      if (used) missRow(r);
      continue;
    }
    if (used) markProvisional(r, conv);
    const amt = conv.amount;
    const out = amt < 0;
    const abs = Math.abs(amt);
    const key = keyOf(r.category_id);
    const isTransfer = r.transfer_id !== null;
    const paidUsed = used && r.status === 'paid';
    if (out && !isTransfer && key === 'Savings') {
      if (paidUsed) savingTotal += BigInt(abs); // enters monthlySaving, not the lines
      continue;
    }
    const oneOff = r.one_off === true && r.recurring_series_id === null && !isTransfer; // D-29
    const line: RecordLine = {
      id: r.id,
      date: r.local_date,
      direction: out ? 'out' : 'in',
      amount: minorUnits(abs),
      currency: cur,
      status: r.status,
      isRefund: r.is_refund,
      transferId: r.transfer_id,
      seriesId: r.recurring_series_id,
      categoryId: r.category_id,
      oneOff,
    };
    const bucket = linesByMonth.get(month);
    if (bucket) bucket.push(line);
    else linesByMonth.set(month, [line]);
    if (!paidUsed) continue;
    if (!out && isTransfer && (r.goal_id ?? null) === null) { // D-101: a leg tagged to a pot or goal is that pot's set-aside, not saving twice
      const kind = accountById.get(r.account_id)?.kind;
      if (kind === 'savings') savingTotal += BigInt(abs);
      else if (kind === 'investment') investingTotal += BigInt(abs);
    }
    if (out && !isTransfer && !oneOff) {
      const id = r.category_id ?? UNCATEGORISED;
      expenseTotals.set(id, (expenseTotals.get(id) ?? 0n) + BigInt(abs));
    }
  }
  const months: MonthRecord[] = monthKeys.map((m) => ({ month: m, full: flags.get(m) === true, lines: linesByMonth.get(m) ?? [] }));
  const usedCount = usedMonths.size;

  // ── bills, income, savings series ──
  const bills: RecurringBill[] = [];
  const incomeSeries: RecurringIncome[] = [];
  let seriesSaving = 0;
  let seriesInvesting = 0;
  for (const s of liveSeries) {
    if (!isActive(s)) continue;
    const isSavings = savingsSeries.has(s.id);
    if (!isSavings && (coveredSeries.has(s.id) || s.amount === 0)) continue;
    // WR-B02: a Transfer series moves money between the user's own accounts; it is neither a bill nor income. Its
    // paid inbound legs already count as saving or investing through the history above.
    if (keyOf(s.category_id) === 'Transfer') continue;
    const amount = need(Math.abs(s.amount), s.currency);
    if (amount === null) continue;
    if (isSavings) {
      const eq = monthlyEquivalent(minorUnits(amount), s.freq);
      if (investSeries.has(s.id)) seriesInvesting += eq;
      else seriesSaving += eq;
      continue;
    }
    const common = {
      seriesId: s.id,
      confirmed: true, // every stored series is user-created or accepted (04 D-25)
      freq: s.freq,
      anchorDate: s.anchor_date,
      endDate: s.end_date,
      occurrenceCount: s.occurrence_count,
      latestAmount: minorUnits(amount),
      currency: cur,
      lastPaidDate: lastPaid.get(s.id) ?? null,
    };
    if (s.amount < 0) bills.push({ ...common, categoryId: s.category_id });
    else incomeSeries.push(common);
  }

  // ── balances ──
  let cashOnHand = 0;
  let accountCount = 0;
  let investmentBalance = 0;
  const homeBalance = new Map<string, number>();
  for (const a of liveAccounts) {
    const kind = a.kind;
    if (cashLike(kind)) accountCount += 1;
    if (!cashLike(kind) && kind !== 'investment' && kind !== 'credit' && kind !== 'loan') continue;
    const v = need(source.balances[a.id] ?? 0, a.currency);
    if (v === null) continue;
    if (cashLike(kind)) cashOnHand += v;
    else if (kind === 'investment') investmentBalance += v;
    else homeBalance.set(a.id, v);
  }
  investmentBalance = Math.max(0, investmentBalance);

  // ── pending one-offs (04 D-61) ──
  const allRows: SnapshotRow[] = [];
  const seenIds = new Set<string>();
  for (const r of [...source.rows, ...source.upcomingRows]) {
    if (r.deleted_at !== null || seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    allRows.push(r);
  }
  const scheduledOutflows: ScheduledOutflow[] = [];
  /**
   * WR-B03 (D-68): pending Debt-category transfers out of cash into a card or loan account. Each is that debt's minimum
   * when the minimum is counted (known only once the derived debts below exist); otherwise it is an ordinary outflow.
   */
  const pendingDebtTransfers: { outflow: ScheduledOutflow; into: string }[] = [];
  const pendingByAccount = new Map<string, number>();
  const coveredByAccount = new Map<string, number>();
  let pendingOneOffs = 0;
  for (const r of allRows) {
    if (r.status !== 'pending' || r.recurring_series_id !== null) continue;
    const conv = homeOf(r);
    if (conv === null) {
      missRow(r);
      continue;
    }
    const amt = conv.amount;
    if (amt >= 0) continue;
    const account = accountById.get(r.account_id);
    if (account === undefined || !isLive(account)) continue;
    if (cashLike(account.kind)) {
      let partnerAccount: SnapshotSource['accounts'][number] | undefined;
      if (r.transfer_id !== null) {
        const partner = allRows.find((p) => p.transfer_id === r.transfer_id && p.id !== r.id && p.original_amount > 0);
        partnerAccount = partner === undefined ? undefined : accountById.get(partner.account_id);
        if (partnerAccount !== undefined && isLive(partnerAccount) && cashLike(partnerAccount.kind)) continue; // an internal move
      }
      markProvisional(r, conv);
      const outflow: ScheduledOutflow = { id: r.id, date: r.local_date, amount: minorUnits(-amt), currency: cur };
      if (keyOf(r.category_id) === 'Debt' && partnerAccount !== undefined && (partnerAccount.kind === 'credit' || partnerAccount.kind === 'loan')) {
        pendingDebtTransfers.push({ outflow, into: partnerAccount.id });
        continue;
      }
      scheduledOutflows.push(outflow);
      pendingOneOffs += 1;
    } else if ((account.kind === 'credit' || account.kind === 'loan') && !namedByLoan.has(account.id)) {
      markProvisional(r, conv);
      pendingByAccount.set(account.id, (pendingByAccount.get(account.id) ?? 0) + amt);
      if (writtenTargets.has(r.id)) coveredByAccount.set(account.id, (coveredByAccount.get(account.id) ?? 0) - amt);
      pendingOneOffs += 1;
    }
  }

  // ── pots (D-101, R18.2): the live, not-done pots in the home currency ──
  // A pot in another currency converts at the LATEST STORED rate, target and Wait amount rounded UP and the opening saved
  // rounded DOWN, so the set-aside is never understated (T-05-124-01). No stored rate leaves the pot out and makes the
  // whole result unconverted (D-37), counted once per pot. Stored rates only: the FX fetch door is never reached.
  const pots: PotInput[] = [];
  const potChecks: Record<string, string> = {};
  let unconvertedPots = 0;
  const taggedSaved = new Map<string, number>();
  const taggedMissed = new Set<string>();
  for (const r of allRows) {
    const goalId = r.goal_id ?? null;
    if (goalId === null || r.status !== 'paid') continue;
    const conv = homeOf(r);
    if (conv === null) {
      taggedMissed.add(goalId);
      continue;
    }
    markProvisional(r, conv);
    taggedSaved.set(goalId, (taggedSaved.get(goalId) ?? 0) + Math.abs(conv.amount));
  }
  /** An amount in the home currency, rounded as asked; false = no stored rate (or out of range). Zero needs no rate. */
  const toHomeRounded = (amount: number, currency: string, round: typeof convertCeiled): number | false => {
    if (amount === 0) return 0;
    const v = round(amount, currency, home, source.rates, source.customCurrencies, today);
    return v === null || v.amount > MAX_ABS_AMOUNT_MINOR ? false : v.amount;
  };
  for (const g of source.goals) {
    if (g.deleted_at !== null || g.done_at !== null) continue;
    const target = g.target === null ? null : toHomeRounded(g.target, g.currency, convertCeiled);
    const monthlyAmount = g.monthly_amount === null ? null : toHomeRounded(g.monthly_amount, g.currency, convertCeiled);
    const opening = toHomeRounded(g.opening_saved, g.currency, convertFloored);
    if (target === false || monthlyAmount === false || opening === false || taggedMissed.has(g.id)) {
      converter.miss(g.currency);
      unconvertedPots += 1;
      continue;
    }
    const tagged = taggedSaved.get(g.id) ?? 0;
    pots.push({
      id: g.id,
      kind: g.kind,
      target: target === null ? null : minorUnits(target),
      monthlyAmount: monthlyAmount === null ? null : minorUnits(monthlyAmount),
      readyBy: g.ready_by,
      saved: minorUnits(Math.min(opening + tagged, MAX_ABS_AMOUNT_MINOR)),
    });
    if (g.check_id !== null) potChecks[g.id] = g.check_id;
  }

  // ── cards and derived debts ──
  const market = marketKeyFor(source.region);
  const marketRow = market === null ? null : MARKET_DEFAULTS[market];
  const cards: CardChoice[] = [];
  const cardTerms = new Map<string, { terms: CardMinimumTerms | null; paidInFull: boolean; apr: Percent | null }>();
  for (const a of liveAccounts) {
    if (a.kind !== 'credit') continue;
    const row = cardRowOf(a.id);
    const stored =
      row !== null && row.min_percent !== null && row.min_interest_added !== null && row.min_floor !== null
        ? { percent: row.min_percent, interestAdded: row.min_interest_added, floor: row.min_floor, currency: row.currency }
        : null;
    let storedTerms: CardMinimumTerms | null = null;
    if (stored !== null) {
      const floor = need(stored.floor, stored.currency);
      if (floor !== null) {
        storedTerms = { minimumPercent: percent(stored.percent), interestAdded: stored.interestAdded, floor: minorUnits(floor) };
      }
    }
    let marketTerms: CardMinimumTerms | null = null;
    const listed = marketRow !== null && marketRow.currency === a.currency ? minimumTermsFromDefaults(marketRow) : null;
    if (listed !== null) {
      const floor = peek(listed.floor, a.currency);
      if (floor !== null) marketTerms = { ...listed, floor: minorUnits(floor) };
    }
    const paidInFull = row !== null && row.paid_in_full;
    const apr = row !== null && row.apr ? percent(row.apr) : null;
    const terms = stored !== null ? storedTerms : marketTerms;
    cardTerms.set(a.id, { terms, paidInFull, apr });
    const view: CardTermsView = {
      debtId: row === null ? null : row.id,
      source: stored !== null ? 'stored' : marketTerms !== null ? 'market' : 'none',
      paidInFull,
      percentText: stored !== null ? stored.percent : marketTerms !== null ? decimalOf(marketTerms.minimumPercent) : null,
      interestAdded: stored !== null ? stored.interestAdded : marketTerms !== null ? marketTerms.interestAdded : null,
      floor: stored !== null ? stored.floor : marketTerms !== null && marketRow !== null ? marketRow.floor : null,
      floorCurrency: stored !== null ? stored.currency : a.currency,
      marketAvailable: marketTerms !== null,
      version: row === null ? null : row.version,
    };
    cards.push({
      accountId: a.id,
      name: a.name,
      record: { id: a.id, apr, minimumTerms: paidInFull ? null : terms, currency: cur },
      terms: view,
    });
  }

  let derivedDebts = 0;
  let cardsWithoutMinimum = 0;
  let cardsMinimumWithoutRate = 0;
  let loansWithoutPayment = 0;
  const cardsWithoutMinimumIds: string[] = [];
  for (const a of liveAccounts) {
    if ((a.kind !== 'credit' && a.kind !== 'loan') || namedByLoan.has(a.id)) continue;
    const balance = homeBalance.get(a.id);
    if (balance === undefined) continue;
    const owed = Math.max(0, -(balance + (pendingByAccount.get(a.id) ?? 0)));
    if (owed === 0) continue;
    let minimum = 0;
    const info = cardTerms.get(a.id);
    if (info !== undefined) {
      const base = Math.max(0, owed - (coveredByAccount.get(a.id) ?? 0));
      if (!info.paidInFull && base > 0) {
        if (info.terms === null) {
          cardsWithoutMinimum += 1;
          cardsWithoutMinimumIds.push(a.id);
        } else {
          if (info.apr === null && info.terms.interestAdded) cardsMinimumWithoutRate += 1;
          minimum = simulateMinimum(minorUnits(base), info.apr ?? ZERO_PERCENT, info.terms).firstPayment;
        }
      }
    } else if (!liveSeries.some((s) => s.account_id === a.id)) {
      loansWithoutPayment += 1; // D-38 minimal reading: nothing is counted for it
    }
    const cardRow = cardRowOf(a.id);
    debts.push({
      id: a.id,
      balance: minorUnits(owed),
      minimumPayment: minorUnits(minimum),
      secured: false,
      apr: cardRow?.apr ? percent(cardRow.apr) : null,
      currency: cur,
    });
    derivedDebts += 1;
  }

  // ── Debt-category transfers (WR-B03, D-68): that debt's minimum when its minimum is counted, otherwise an outflow ──
  // A derived debt is keyed by its account; a recorded loan names its account.
  const minimumAccounts = new Set<string>();
  for (const d of debts) if (d.minimumPayment > 0) minimumAccounts.add(d.id);
  for (const d of loanDebts) {
    if (d.account_id !== null && debts.some((x) => x.id === d.id && x.minimumPayment > 0)) minimumAccounts.add(d.account_id);
  }
  for (const { outflow, into } of pendingDebtTransfers) {
    if (minimumAccounts.has(into)) continue;
    scheduledOutflows.push(outflow);
    pendingOneOffs += 1;
  }
  scheduledOutflows.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  const expenseLines: ExpenseLine[] = [...expenseTotals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([lineId, total]) => {
      const key = lineId === UNCATEGORISED ? null : keyOf(lineId);
      return {
        lineId,
        averageMonthly: minorUnits(average(total, usedCount)),
        cuttable: key === null || !NOT_CUTTABLE.has(key),
      };
    });

  // ── limits (D-14, D-51) ──
  let limitsReset = 0;
  const st = source.settings ?? NO_SETTINGS;
  const foreignSettings = st.currency !== null && st.currency !== home;
  const money = (v: number | null): number | null => {
    if (v === null || foreignSettings) return null;
    if (Number.isSafeInteger(v) && v >= 0) return v;
    limitsReset += 1;
    return null;
  };
  let dsrLine: Percent | null = null;
  if (st.dsr_line !== null) {
    if (DSR_PATTERN.test(st.dsr_line)) dsrLine = percent(st.dsr_line);
    else limitsReset += 1;
  }
  let multiple: number | null = null;
  if (st.unsecured_multiple !== null) {
    const m = st.unsecured_multiple;
    if (Number.isInteger(m) && m >= 0 && m <= MAX_UNSECURED_MULTIPLE) multiple = m;
    else limitsReset += 1;
  }
  let housingLine: Percent | null = null; // D-103 (R18.4): the DSR pattern, capped at 100
  if (st.housing_line !== null) {
    if (DSR_PATTERN.test(st.housing_line) && Number(st.housing_line) <= MAX_LINE_PERCENT) housingLine = percent(st.housing_line);
    else limitsReset += 1;
  }
  const reserve = money(st.reserve);
  const investingFloor = money(st.investing_floor);
  const savingFloor = money(st.saving_floor);
  const limits: DecideLimits = {
    reserve: reserve === null ? null : minorUnits(reserve),
    dsrLine,
    housingLine,
    unsecuredIncomeMultiple: multiple,
    investingFloor: investingFloor === null ? null : minorUnits(investingFloor),
    savingFloor: savingFloor === null ? null : minorUnits(savingFloor),
    spareFloor: null,
  };

  // ── dated changes (D-27) ──
  const futureChanges: FutureChange[] = [];
  for (const c of source.changes) {
    if (c.deleted_at !== null || (c.end_month !== null && c.end_month < currentMonth)) continue;
    const v = need(c.monthly_amount, c.currency);
    if (v === null) continue;
    futureChanges.push({
      id: c.id,
      kind: c.kind,
      monthlyAmount: minorUnits(v),
      startMonth: c.start_month,
      endMonth: c.end_month,
      currency: cur,
    });
  }

  const dealerCap =
    marketRow !== null && marketRow.dealerCap !== null ? peek(marketRow.dealerCap, marketRow.currency) : null;

  // D-91 (R16.7): the card check limit in the home currency, floored (T-05-95-01), at the latest stored USD rate. USD home needs
  // no rate; no stored USD rate is null (the engine reports card_limit_rate_missing). Stored rates only, never the fetch door.
  const limit = convertFloored(CARD_MAX_PURCHASE_USD, 'USD', home, source.rates, source.customCurrencies, today);
  const cardMaxPurchase = limit === null ? null : minorUnits(limit.amount);
  const basisNotes: CardLimitRateNote[] = limit !== null && limit.rateDate < today ? [{ kind: 'card_limit_rate', date: limit.rateDate }] : [];

  // D-103 (R18.4): my monthly housing cost = the Housing-category spending (the same expenseTotals as the spending basis, so a
  // debt-covered series is counted once, in the loan's minimum) averaged over the used months, plus the minimums of the loans
  // marked as housing. The used-month average applies whatever the Worst / Average basis.
  let housingSpending = 0n;
  for (const [categoryId, total] of expenseTotals) if (keyOf(categoryId) === 'Housing') housingSpending += total;
  const housingMonthly = average(housingSpending, usedCount) + housingDebtMonthly;

  const monthlySaving = minorUnits(average(savingTotal, usedCount) + seriesSaving);
  const monthlyInvesting = minorUnits(average(investingTotal, usedCount) + seriesInvesting);

  // Rough figures (D-04): only before the first full month, in the settings currency (converted at stored rates).
  let figures: RoughFigures | null = null;
  if (fullKeys.length === 0 && st.rough_income !== null && st.rough_spending !== null) {
    const roughCurrency = st.currency ?? home;
    const income = need(st.rough_income, roughCurrency);
    const spending = need(st.rough_spending, roughCurrency);
    if (income !== null && spending !== null) {
      figures = {
        currency: cur,
        cash: minorUnits(cashOnHand),
        monthlyIncome: minorUnits(income),
        monthlySpending: minorUnits(spending),
      };
    }
  }

  const unconverted = converter.unconverted();
  const provisional = converter.provisionalNote();
  const meta: SnapshotMeta = {
    fullMonths: fullKeys.length,
    expenseLinesThisMonth,
    debtCount: debts.length,
    accountCount,
    unconvertedRows: unconverted === null ? 0 : unconverted.rowCount,
    unconvertedPots,
    derivedDebts,
    pendingOneOffs,
    cardsWithoutMinimum,
    cardsMinimumWithoutRate,
    cardsWithoutMinimumIds,
    loansWithoutPayment,
    limitsReset,
  };
  const base = {
    currency: cur,
    meta,
    pots,
    potChecks,
    cards,
    dealerCap: dealerCap === null ? null : minorUnits(dealerCap),
    cardMaxPurchase,
    region: source.region,
    basisNotes,
    cash: minorUnits(cashOnHand),
    conversions: converter.notes(),
    unconverted,
    provisional,
    fx: { rates: source.rates, customs: source.customCurrencies, today },
  };

  if (fullKeys.length > 0) {
    const snapshot: DecideSnapshot = {
      currency: cur,
      asOf: today,
      months,
      bills,
      basisOverride: st.basis_override,
      cashOnHand: minorUnits(cashOnHand),
      debts,
      monthlySaving,
      monthlyInvesting,
      scope: { kind: 'personal' },
      householdSpending: null, // D-18: household scope hidden until Phase 8
      housingMonthly: minorUnits(housingMonthly),
      limits,
      projectionReturn: null, // the per-check rate is applied by computeCheck (D-07)
      projectionRates: [],
      expenseLines,
      incomeSeries,
      futureChanges,
      investmentBalance: minorUnits(investmentBalance),
      scheduledOutflows,
      pots,
      ...(provisional === null ? {} : { provisionalRates: true }), // D-69: caps confidence at fair
    };
    return { kind: 'logged', ...base, snapshot };
  }
  if (figures !== null) return { kind: 'rough', ...base, figures };
  return { kind: 'none', ...base };
}
