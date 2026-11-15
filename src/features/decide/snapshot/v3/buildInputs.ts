// PURE. 05.5-12 (ARC-03, ENG-21): the one snapshot path. buildInputs(source, settings) turns database rows straight into V3Inputs,
// with no step through the old engine's snapshot. Built beside buildV3Inputs.ts; callers switch in 05.5-16 after the owner reviews
// every difference (D-07), and the old builder goes in 05.5-19. Stored rates only (never the FX fetch door). FX stays here (D-09).
//
// What it reads, in the order it reads it: the logged months (full-month rule, used months, lines and their roles), the series (bills,
// pay, other income, Savings series), cash and accounts, debts (recorded loans and the debts derived from cards and loans), goals
// through the Grow connection points, then the stored settings answers. Rows flagged isSettlement add nothing to any month line (D-06).
import {
  homeThresholds,
  legacyLimits,
  cadenceOfFreq,
  type AccountKind,
  type AccountUse,
  type Envelope,
  type HomeThresholds,
  type LineRole,
  type MonthMark,
  type SeriesRole,
  type TypedEstimates,
  type V3Account,
  type V3Debt,
  type V3Inputs,
  type V3Line,
  type V3Month,
  type V3Series,
} from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { ZERO_PERCENT, percent, simulateMinimum, type CardMinimumTerms } from '@/engine/payoff';
import { type RecurringFreq } from '@/engine/recurring';
import { convertLatest } from '@/data/queries/fxConvert';
import { homeAmountFor } from '@/data/queries/homeAmount';
import { debtToV3Debt, envelopesOf, goalPointsOf, safetyNetInputsOf, safetyNetPointOf } from '@/features/grow/connect';
import { convertFloored, makeConverter, provisionalHomeAmount } from '../conversion';
import { fullMonthFlags } from '../fullMonths';
import {
  SUBDIVISION_PATTERN,
  WINDOW_MONTHS,
  accountUseFromColumns,
  customOf,
  dateOf,
  endOf,
  expectedIncomeOf,
  heldBridgesOf,
  incomeKindOf,
  inList,
  limitsOf,
  marketCardTerms,
  moneyOf,
  payArrivalsOf,
  profileOf,
  rateOf,
  settingsMoneyUsable,
  signedMoneyOf,
  skippedOf,
  str,
  taxSetAsideBpOf,
  tightLineOf,
  unexplainedOf,
  unsavedOf,
  usdRateOf,
  waiversOf,
  withoutMoney,
  type InputsRow,
  type InputsSource,
} from './buildInputsParts';
import type { V3SeriesExtra, V3SettingsSource } from './types';

const NO_EXTRA: V3SeriesExtra = { pay_group: null, counts_as: null, income_kind: null, saving_mode: null, typical_choice: null, status: null };
const MARKS: readonly string[] = ['normal', 'out', 'half'];
const SPENDING_KINDS: readonly string[] = ['cash', 'checking'];
const SAVED_KINDS: readonly string[] = ['savings', 'investment'];
const DEBT_KINDS: readonly string[] = ['credit', 'loan'];
const LOOKBACK_MONTHS = 12;
/**
 * 05.4-35 (FIN-03, D-144): the stored account kinds (20260924000300_accounts.sql) as engine kinds. credit and loan never get here
 * (they are debts). cash and other have no overdraft; an investment account is never kept savings for low-month cover (D-144), so
 * it is 'other' too. An unknown kind reads as 'other'.
 */
const ACCOUNT_KIND: Readonly<Record<string, AccountKind>> = { checking: 'checking', savings: 'savings', cash: 'other', investment: 'other', other: 'other' };

const cashLike = (kind: string | undefined): boolean => kind === 'cash' || kind === 'checking' || kind === 'savings';

export function buildInputs(source: InputsSource, settings: V3SettingsSource | null): V3Inputs {
  const { today, homeCurrency: home } = source;
  const st = source.settings;
  const moneyUsable = settingsMoneyUsable(st, home);
  const v3 = moneyUsable ? settings : withoutMoney(settings); // CR-03: settings money in another currency never reaches the engine
  const converter = makeConverter({ home, rates: source.rates, customs: source.customCurrencies, today });
  const toHome = converter.toHome;

  const accountKind = new Map(source.accounts.map((a) => [a.id, a.kind as string]));
  const kindOf = (accountId: string): string => accountKind.get(accountId) ?? '';
  const accountById = new Map(source.accounts.map((a) => [a.id, a]));
  const liveAccounts = source.accounts.filter((a) => a.archived_at === null && a.deleted_at === null);
  const isLiveAccount = (a: { archived_at: string | null; deleted_at: string | null }): boolean => a.archived_at === null && a.deleted_at === null;
  const categoryKey = (id: string | null): string | null => (id === null ? null : (source.categories[id] ?? null));
  const liveGoals = new Set(source.goals.filter((g) => g.deleted_at === null && g.done_at === null).map((g) => g.id));
  const isLiveGoal = (id: string | null | undefined): boolean => id !== null && id !== undefined && liveGoals.has(id);

  // A line's home amount: its own stamp, else the latest stored rate (D-69, provisional), else null (never guessed, D-37).
  let provisionalRates = false;
  const homeOf = (r: InputsRow): { amount: number; provisional: boolean } | null => {
    const stamped = homeAmountFor(r, home, source.rates, source.customCurrencies);
    if (stamped !== null) return { amount: stamped, provisional: false };
    const conv = provisionalHomeAmount(r, home, source.rates, source.customCurrencies, today);
    return conv === null ? null : { amount: conv.amount, provisional: conv.rateDate !== null };
  };
  /** D-69: a line whose figure is used and came from a provisional rate caps the answer's confidence. */
  const markProvisional = (conv: { provisional: boolean }): void => {
    if (conv.provisional) provisionalRates = true;
  };

  const legsOf = new Map<string, InputsRow[]>();
  for (const r of source.rows) {
    if (r.transfer_id === null || r.deleted_at !== null) continue;
    legsOf.set(r.transfer_id, [...(legsOf.get(r.transfer_id) ?? []), r]);
  }

  // D-03: the series attributes come from the series row; a settings series_extra entry (shadow exports) overrides field by field.
  const seriesRow = new Map(source.series.map((r) => [r.id, r]));
  const extraOf = (seriesId: string): V3SeriesExtra => {
    const r = seriesRow.get(seriesId) as InputsSource['series'][number]; // every id asked for comes from source.series
    const base: V3SeriesExtra = { ...NO_EXTRA, pay_group: r.pay_group ?? null, counts_as: r.counts_as ?? null, income_kind: r.income_kind ?? null, saving_mode: r.saving_mode ?? null };
    const over = v3?.series_extra[seriesId];
    if (over === undefined) return base;
    return {
      pay_group: over.pay_group ?? base.pay_group,
      counts_as: over.counts_as ?? base.counts_as,
      income_kind: over.income_kind ?? base.income_kind,
      saving_mode: over.saving_mode ?? base.saving_mode,
      typical_choice: over.typical_choice,
      status: over.status,
    };
  };
  // The series that feed a live goal: the goal's monthly amount carries them, so Decide never reads them as series too (P5-CR-01).
  const goalLinkedSeries = new Set(source.series.filter((r) => isLiveGoal(r.goal_id)).map((r) => r.id));
  // D-03, 05.1 D-53: account use is read from the account columns (one source).
  const effectiveUses: Record<string, AccountUse> = {};
  for (const a of source.accounts) {
    const u = accountUseFromColumns(a);
    if (u !== null) effectiveUses[a.id] = u;
  }

  // ── debts rows ──
  const liveDebts = source.debts.filter((d) => d.deleted_at === null);
  // A debt marked paid off adds no minimum from that date. Its series stays covered so it is not re-counted as a bill.
  const paidOff = (d: { paid_off_on?: string | null }): boolean => d.paid_off_on != null && d.paid_off_on <= today;
  const countedDebts = liveDebts.filter((d) => !paidOff(d));
  const loanDebts = liveDebts.filter((d) => d.kind !== 'card');
  const countedLoans = countedDebts.filter((d) => d.kind !== 'card');
  const cardRowOf = (accountId: string) => liveDebts.find((d) => d.kind === 'card' && d.account_id === accountId);
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
  const investing = new Set(source.paymentLinks.filter((l) => l.check_kind === 'invest').map((l) => l.target_id));

  // ── series: one predicate for what is counted elsewhere ──
  const liveSeries = source.series.filter((s) => s.deleted_at === null);
  const savingsSeries = new Set(liveSeries.filter((s) => categoryKey(s.category_id) === 'Savings').map((s) => s.id));
  const elsewhere = new Set([...coveredSeries, ...savingsSeries]);

  // ── rows -> full months ──
  const liveRows = source.rows.filter((r) => r.deleted_at === null);
  const flags = fullMonthFlags({
    today,
    rowDates: liveRows.map((r) => ({ date: r.local_date, accountId: r.account_id })),
    periods: source.statementPeriods.map((p) => ({ accountId: p.account_id, start: p.period_start, end: p.period_end })),
    lookbackMonths: LOOKBACK_MONTHS,
  });
  const monthKeys = [...flags.keys()].sort().reverse(); // newest first
  const fullKeys = monthKeys.filter((m) => flags.get(m) === true);
  const usedMonths = new Set(fullKeys.slice(0, WINDOW_MONTHS));
  const logged = fullKeys.length > 0;

  // Which rows reach a month, in which direction. A row of a month the history window skips never reaches one; a row no stored rate
  // converts is left out (D-37); a Savings-category outflow outside a transfer is folded into saving, never a line.
  interface Kept { row: InputsRow; amount: number }
  const keptByMonth = new Map<string, Kept[]>();
  for (const r of liveRows) {
    const month = r.local_date.slice(0, 7);
    if (!flags.has(month)) continue;
    if (r.recurring_series_id !== null && elsewhere.has(r.recurring_series_id)) continue;
    const conv = homeOf(r);
    if (conv === null) continue;
    if (usedMonths.has(month)) markProvisional(conv);
    if (r.isSettlement === true) continue; // D-06: a settlement between people is not the user's own money in or out
    if (conv.amount < 0 && r.transfer_id === null && categoryKey(r.category_id) === 'Savings') continue;
    if (r.status === 'skipped') continue; // a skipped occurrence settles its due (skipped), it is never a line
    const bucket = keptByMonth.get(month);
    if (bucket) bucket.push({ row: r, amount: conv.amount });
    else keptByMonth.set(month, [{ row: r, amount: conv.amount }]);
  }

  // ── series ── (only once there is a full month; before that the typed estimates stand in)
  const series: V3Series[] = [];
  const make = (
    id: string,
    role: SeriesRole,
    freq: RecurringFreq,
    anchor: string,
    endDate: string | null,
    count: number | null,
    amount: number,
    categoryId: string | null
  ): V3Series => {
    const x = extraOf(id);
    const pay = role === 'pay' || role === 'other_income';
    const saving = role === 'saving' || role === 'investing';
    return {
      id,
      role,
      cadence: cadenceOfFreq(freq),
      anchorDate: anchor,
      endDate: endOf(anchor, freq, endDate, count),
      amount: minorUnits(amount),
      status: x.status ?? 'live',
      confirmed: true, // every stored series is user-created or accepted (04 D-25)
      payGroup: x.pay_group,
      countsAs: pay ? (x.counts_as ?? (role === 'pay' ? 'available' : null)) : null,
      incomeKind: pay ? incomeKindOf(x.income_kind) : null,
      typicalChoice: x.typical_choice,
      categoryId,
      isHousing: categoryKey(categoryId) === 'Housing',
      savingMode: saving ? (x.saving_mode ?? 'fixed') : null,
    };
  };

  let months: V3Month[] = [];
  let typed: TypedEstimates | null = null;
  // Cash on hand: every live cash, checking and savings account at its converted balance (an account no rate converts adds nothing).
  let cashOnHand = 0;
  for (const a of liveAccounts) {
    if (!cashLike(a.kind)) continue;
    const v = toHome(source.balances[a.id] ?? 0, a.currency);
    if (v !== null) cashOnHand += v;
  }

  if (logged) {
    const bills: V3Series[] = [];
    const income: V3Series[] = [];
    for (const s of liveSeries) {
      if (s.end_date !== null && s.end_date < today) continue; // ended
      if (savingsSeries.has(s.id)) continue; // a Savings series is read below
      if (coveredSeries.has(s.id) || s.amount === 0) continue;
      if (categoryKey(s.category_id) === 'Transfer') continue; // WR-B02: moves money between the user's own accounts
      const amount = toHome(Math.abs(s.amount), s.currency);
      if (amount === null) continue;
      if (s.amount < 0) {
        if (goalLinkedSeries.has(s.id)) continue;
        bills.push(make(s.id, 'bill', s.freq, s.anchor_date, s.end_date, s.occurrence_count, amount, s.category_id));
      } else {
        const other = incomeKindOf(extraOf(s.id).income_kind);
        const role: SeriesRole = other === null || (other.kind === 'preset' && other.value === 'salary') ? 'pay' : 'other_income';
        income.push(make(s.id, role, s.freq, s.anchor_date, s.end_date, s.occurrence_count, amount, null));
      }
    }
    series.push(...bills, ...income);
    // Saving and investing series: a Savings-category series no debt covers and no live goal carries.
    const covered = new Set(liveDebts.filter((d) => d.series_id !== null).map((d) => d.series_id as string));
    for (const s of liveSeries) {
      if (categoryKey(s.category_id) !== 'Savings' || covered.has(s.id) || goalLinkedSeries.has(s.id)) continue; // 06 ARC-15: a goal's contribution is carried by the goal, counted once
      if (s.end_date !== null && s.end_date < today) continue;
      const amount = toHome(Math.abs(s.amount), s.currency);
      if (amount === null || amount === 0) continue;
      series.push(make(s.id, investing.has(s.id) ? 'investing' : 'saving', s.freq, s.anchor_date, s.end_date, s.occurrence_count, amount, s.category_id));
    }

    // ── lines ──
    const anyUse = Object.keys(effectiveUses).length > 0;
    const counts = (id: string | undefined): boolean => {
      const u = id === undefined ? undefined : effectiveUses[id];
      return u !== undefined && (u.kind === 'everyday' || u.kind === 'mixed');
    };
    const roleOf = (row: InputsRow, out: boolean): LineRole => {
      if (row.transfer_id === null) {
        // 06 ARC-15: single-leg goal contribution, counted once as an envelope deposit
        if (isLiveGoal(row.goal_id)) return out ? 'envelope_deposit' : 'envelope_withdrawal';
        // 06-37 D-35: a line tagged to a debt is a debt payment (money out once); money IN tagged to a debt is the asset sale itself (P5-WR-05).
        if (row.debt_id !== null && row.debt_id !== undefined) return out ? 'debt_payment' : 'other_in';
        return out ? 'spending' : row.is_refund ? 'refund' : 'income';
      }
      const partner = (legsOf.get(row.transfer_id) as readonly InputsRow[]).find((r) => r.id !== row.id);
      const mine = kindOf(row.account_id);
      const theirs = partner === undefined ? '' : kindOf(partner.account_id);
      const fromKind = out ? mine : theirs;
      const toKind = out ? theirs : mine;
      const fromId = out ? row.account_id : partner?.account_id;
      const toId = out ? partner?.account_id : row.account_id;
      const tagged = isLiveGoal(row.goal_id) || isLiveGoal(partner?.goal_id);
      // M-06: stated uses decide what counts; with none stated the account kinds do.
      const fromSpending = anyUse ? counts(fromId) : SPENDING_KINDS.includes(fromKind);
      const toSpending = anyUse ? counts(toId) : SPENDING_KINDS.includes(toKind);
      if (out && fromSpending && !toSpending) {
        if (tagged) return 'envelope_deposit'; // D-22 stand-in: money into a pot or goal
        if (DEBT_KINDS.includes(toKind)) return 'debt_payment';
        if ((anyUse && partner !== undefined) || SAVED_KINDS.includes(toKind)) return 'saved_invested';
        return 'other_out';
      }
      if (!out && toSpending && !fromSpending) return tagged ? 'envelope_withdrawal' : 'other_in';
      return 'own_transfer';
    };
    const seriesById = new Map(series.map((s) => [s.id, s]));
    const marks = v3?.month_marks ?? null;
    months = monthKeys.map((m) => {
      const mark = marks === null ? undefined : marks[m];
      return {
        month: m,
        full: flags.get(m) === true,
        mark: inList(MARKS, mark) ? (mark as MonthMark) : null,
        lines: (keptByMonth.get(m) ?? []).map(({ row, amount }): V3Line => {
          const out = amount < 0;
          const role = roleOf(row, out);
          const s = row.recurring_series_id === null ? undefined : seriesById.get(row.recurring_series_id);
          return {
            id: row.id,
            date: row.local_date,
            amount: minorUnits(Math.abs(amount)),
            role,
            status: row.status as 'paid' | 'pending',
            seriesId: row.recurring_series_id,
            categoryId: row.category_id,
            coversMonths: null,
            source: row.import_batch_id ? 'statement' : 'manual', // D-51
            expected: false,
            // 05.2 F-10: an occurrence without its own tag takes its series' income type, as countsAs does
            incomeKind: role === 'income' ? (incomeKindOf(str(row.income_kind)) ?? (s !== undefined ? s.incomeKind : null)) : null,
            countsAs: role === 'income' ? (row.counts_as ?? (s !== undefined ? s.countsAs : null)) : null,
            refundOf: str(row.refund_of),
          };
        }),
      };
    });
  } else if (moneyUsable && st !== null && st.rough_income !== null && st.rough_spending !== null) {
    // Typed estimates (D-04): only before the first full month, in the settings currency (converted at stored rates).
    // moneyUsable means the settings currency is the home currency (or unstamped), so no conversion is needed.
    const part = (x: unknown) => minorUnits(moneyOf(x) ?? 0);
    typed = {
      income: minorUnits(st.rough_income),
      expenses: minorUnits(st.rough_spending),
      saving: part(v3?.rough_saving),
      debt: part(v3?.rough_debt),
      invest: part(v3?.rough_invest),
      asOf: dateOf(v3?.rough_as_of) ?? today,
    };
  }

  // ── pending one-offs (04 D-61): their amounts feed the card and loan owed below, and a provisional rate marks the answer ──
  const allRows: InputsRow[] = [];
  const seenIds = new Set<string>();
  for (const r of [...source.rows, ...source.upcomingRows]) {
    if (r.deleted_at !== null || seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    allRows.push(r);
  }
  const paymentChecks = new Set(source.paymentLinks.map((l) => l.check_id));
  const writtenTargets = new Set(source.writtenRowLinks.filter((l) => paymentChecks.has(l.check_id)).map((l) => l.target_id));
  const pendingByAccount = new Map<string, number>();
  const coveredByAccount = new Map<string, number>();
  for (const r of allRows) {
    if (r.status !== 'pending' || r.recurring_series_id !== null) continue;
    const conv = homeOf(r);
    if (conv === null) continue;
    const amt = conv.amount;
    if (amt >= 0) continue;
    const account = accountById.get(r.account_id);
    if (account === undefined || !isLiveAccount(account)) continue;
    if (cashLike(account.kind)) {
      if (r.transfer_id !== null) {
        const partner = allRows.find((p) => p.transfer_id === r.transfer_id && p.id !== r.id && p.original_amount > 0);
        const partnerAccount = partner === undefined ? undefined : accountById.get(partner.account_id);
        if (partnerAccount !== undefined && isLiveAccount(partnerAccount) && cashLike(partnerAccount.kind)) continue; // an internal move
      }
      markProvisional(conv);
    } else if ((account.kind === 'credit' || account.kind === 'loan') && !namedByLoan.has(account.id)) {
      markProvisional(conv);
      pendingByAccount.set(account.id, (pendingByAccount.get(account.id) ?? 0) + amt);
      if (writtenTargets.has(r.id)) coveredByAccount.set(account.id, (coveredByAccount.get(account.id) ?? 0) - amt);
    }
  }
  // A goal-tagged paid row's figure sets the pot's saved money, so a provisional rate there marks the answer too.
  for (const r of allRows) {
    if ((r.goal_id ?? null) === null || r.status !== 'paid') continue;
    const conv = homeOf(r);
    if (conv !== null) markProvisional(conv);
  }

  // ── goals, safety net, envelopes (06 D-02: through the Grow connection points only) ──
  const goalRows = source.goals.map((g) => ({ ...g, name: g.name ?? '' }));
  // D-54, OQ6: a goal with no stored account falls back to the account its latest goal-tagged transfer leg landed in (null when none).
  const landing = new Map<string, InputsRow>();
  for (const r of source.rows) {
    if (r.deleted_at !== null || r.transfer_id === null || r.goal_id == null || r.original_amount <= 0) continue;
    const prev = landing.get(r.goal_id);
    if (prev === undefined || r.local_date >= prev.local_date) landing.set(r.goal_id, r);
  }
  const envelopes: Envelope[] = envelopesOf(goalPointsOf(goalRows, source.rows, toHome)).map((e) => ({ ...e, accountId: e.accountId ?? landing.get(e.id)?.account_id ?? null }));

  const accounts: V3Account[] = source.accounts.flatMap((a): V3Account[] => {
    if (!isLiveAccount(a)) return [];
    // 05.2 F-05: only money accounts are V3 accounts; cards and loans are debts.
    if (a.kind === 'credit' || a.kind === 'loan') return [];
    const balance = toHome(source.balances[a.id] ?? 0, a.currency);
    // 05.4 ENG-17 (CO-D-114): an account no rate converts still reaches the engine (noRate), so account_no_rate can name it; it counts nowhere.
    if (balance === null) return [{ id: a.id, balance: minorUnits(0), use: null, noRate: true }];
    // 05.4-35 (FIN-03): the limit is in the account's currency; converted at the latest stored rate, rounded DOWN (D-91). No rate = no limit.
    const limit = moneyOf(a.overdraft_limit);
    const converted = limit === null ? null : convertFloored(limit, a.currency, home, source.rates, source.customCurrencies, today);
    return [
      {
        id: a.id,
        balance: minorUnits(balance),
        use: effectiveUses[a.id] ?? null,
        kind: ACCOUNT_KIND[a.kind] ?? 'other',
        overdraftLimit: converted === null ? null : minorUnits(converted.amount),
        overdraftRate: rateOf(a.overdraft_rate),
      },
    ];
  });

  // ── debts ── whatever the records basis, the debt list reaches the engine (D-43)
  interface DebtRec { id: string; balance: ReturnType<typeof minorUnits>; minimumPayment: ReturnType<typeof minorUnits>; secured: boolean; apr: ReturnType<typeof percent> | null }
  const debtRecs: DebtRec[] = [];
  for (const d of countedLoans) {
    const balance = toHome(d.balance, d.currency);
    const minimum = toHome(d.minimum_payment, d.currency);
    if (balance === null || minimum === null) continue;
    debtRecs.push({ id: d.id, balance: minorUnits(Math.max(0, balance)), minimumPayment: minorUnits(Math.max(0, minimum)), secured: d.secured, apr: d.apr ? percent(d.apr) : null });
  }
  // The card terms: stored on the card's debts row, else the market's usual terms for the region (never a made-up default).
  const market = marketCardTerms(source.region);
  const cardTerms = new Map<string, { terms: CardMinimumTerms | null; paidInFull: boolean; apr: ReturnType<typeof percent> | null }>();
  for (const a of liveAccounts) {
    if (a.kind !== 'credit') continue;
    const row = cardRowOf(a.id);
    const stored = row !== undefined && row.min_percent !== null && row.min_interest_added !== null && row.min_floor !== null ? { percent: row.min_percent, interestAdded: row.min_interest_added, floor: row.min_floor, currency: row.currency } : null;
    let terms: CardMinimumTerms | null = null;
    if (stored !== null) {
      const floor = toHome(stored.floor, stored.currency);
      if (floor !== null) terms = { minimumPercent: percent(stored.percent), interestAdded: stored.interestAdded, floor: minorUnits(floor) };
    } else if (market !== null && market.currency === a.currency) {
      const floor = convertLatest(market.floor, a.currency, home, source.rates, source.customCurrencies, today)?.amount ?? null;
      if (floor !== null) terms = { ...market.terms, floor: minorUnits(floor) };
    }
    cardTerms.set(a.id, { terms, paidInFull: row !== undefined && (row.paid_in_full || paidOff(row)), apr: row !== undefined && row.apr ? percent(row.apr) : null });
  }
  // Cards and loans with no recorded loan row: the owed figure is the account's balance (plus pending one-offs), its minimum the card terms'.
  for (const a of liveAccounts) {
    if ((a.kind !== 'credit' && a.kind !== 'loan') || namedByLoan.has(a.id)) continue;
    const balance = toHome(source.balances[a.id] ?? 0, a.currency);
    if (balance === null) continue;
    const owed = Math.max(0, -(balance + (pendingByAccount.get(a.id) ?? 0)));
    if (owed === 0) continue;
    let minimum = 0;
    const info = cardTerms.get(a.id);
    if (info !== undefined) {
      const base = Math.max(0, owed - (coveredByAccount.get(a.id) ?? 0));
      if (!info.paidInFull && base > 0 && info.terms !== null) minimum = simulateMinimum(minorUnits(base), info.apr ?? ZERO_PERCENT, info.terms).firstPayment;
    }
    const cardRow = cardRowOf(a.id);
    debtRecs.push({ id: a.id, balance: minorUnits(owed), minimumPayment: minorUnits(minimum), secured: false, apr: cardRow?.apr ? percent(cardRow.apr) : null });
  }
  const debtRow = new Map(source.debts.map((d) => [d.id, d]));
  const debts: V3Debt[] = debtRecs.map((d) => {
    const row = debtRow.get(d.id);
    const mapped = debtToV3Debt(d, row, cardRowOf(d.id), kindOf);
    // 05.4 deferred-items "the app builder does not pass the new debt fields": seriesId is carried by the debts row. joint and
    // paidThisMonth have no stored column yet, so they are left absent (the engine reads absent as not joint and nothing paid).
    return row !== undefined && row.series_id !== null ? { ...mapped, seriesId: row.series_id } : mapped;
  });

  const answers = v3?.answers ?? [];

  // ── funds ──
  const anchorAmount = signedMoneyOf(v3?.unspent_anchor);
  const anchorAt = dateOf(v3?.unspent_anchor_at);
  const everyday = moneyOf(v3?.everyday_override);
  // 06 D-02 (ARC-13, FIN-16): the safety net and its fund come only from the flagged Grow goal. No flagged goal = null.
  const netFromGrow = safetyNetInputsOf(safetyNetPointOf(goalRows, source.rows, toHome, home));
  const netGoalRow = source.goals.find((g) => g.is_safety_net === true && g.deleted_at === null);
  // 06.1 D-20: answers may use the net only when Decide's unlock says so
  const safetyNet = netFromGrow.safetyNet === null ? null : { ...netFromGrow.safetyNet, locked: !(netGoalRow?.decide_may_use === true) };
  const subdivision = source.regionSubdivision;
  const thresholds: HomeThresholds = homeThresholds(home, usdRateOf(source, home));

  return {
    asOf: today,
    currency: currencyCode(home),
    region: source.region,
    months,
    series,
    dismissedKeys: (v3?.dismissals ?? []).filter((k): k is string => typeof k === 'string'),
    profile: profileOf(v3),
    typedEstimates: typed,
    balance: minorUnits(cashOnHand),
    unspent: anchorAmount === null || anchorAt === null ? null : { amount: minorUnits(anchorAmount), at: anchorAt },
    emergency: netFromGrow.emergency,
    envelopes,
    debts,
    everydayOverride: everyday === null ? null : minorUnits(everyday),
    limits: limitsOf(v3, legacyLimits(st), source.categoryCaps ?? {}),
    custom: customOf(v3?.custom_options),
    thresholds,
    accounts,
    unexplainedAnswer: unexplainedOf(v3),
    payArrivals: payArrivalsOf(answers),
    expectedIncome: expectedIncomeOf(answers),
    heldBridges: heldBridgesOf(answers, new Set(v3?.live_bridge_check_ids ?? [])),
    waivers: waiversOf(answers), // 06.1-43 (G-1): the user's readiness answers
    skipped: skippedOf(source.rows), // 06.1-43 (G-1): skipped occurrences settle their dues
    unsavedWrites: unsavedOf(source.unsavedWrites), // D-127: the D-113 note only, never the sums
    provisionalRates,
    recordsAsOf: source.recordsAsOf ?? null, // ENG-14, D-126: the oldest real server fetch, null when unknown
    safetyNet,
    tightLine: tightLineOf(v3?.tight_line),
    taxSetAsideBp: taxSetAsideBpOf(v3?.tax_set_aside_bp), // 06.1 FIN-20 (D-26)
    factLines: true, // D-08: on by default
    // D-142: the stored state or province passes with whatever country `region` resolved to; no country -> null.
    regionSubdivision: source.region !== null && typeof subdivision === 'string' && SUBDIVISION_PATTERN.test(subdivision) ? subdivision : null,
  };
}
