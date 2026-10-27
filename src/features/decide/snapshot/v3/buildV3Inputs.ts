// PURE. JSON inputs in, engine objects out (memory only). Barrel imports only (the v3 engine barrel and the payoff barrel). FX stays here (D-09).
// TODO(D-16): decouple from buildDecideSnapshot before the old engine is deleted. Today it is the one parse path for converted
// months, bills, pay series, debts, pots and cash (shadow parity), so its old-engine types still flow through this file.
//
// Known limits of that shared parse path (recorded for 05.3):
//  - a Savings-category outflow and a line of a debt-covered or Savings series never reach a month (the old builder folds them
//    into monthlySaving / minimums), so they are absent from the v3 lines;
//  - a 'rough' or 'none' snapshot carries no bills, series or debts, so those are empty for such a user.
import {
  cadenceOfFreq,
  homeThresholds,
  legacyLimits,
  validateCustomOptions,
  V3_ITEM_TYPES,
  MAX_OWN_LINES,
  MAX_CUSTOM_OPTIONS,
  type AccountUse,
  type Cadence,
  type CountsAs,
  type CustomOptions,
  type Envelope,
  type HomeThresholds,
  type IncomeKind,
  type IncomeProfile,
  type IncomeType,
  type LimitLine,
  type LineRole,
  type LineSpec,
  type Limits,
  type MonthMark,
  type RoughFigures,
  type SeriesRole,
  type UsdRate,
  type V3Account,
  type V3Debt,
  type V3Inputs,
  type V3Line,
  type V3Month,
  type V3Series,
  type VariableMethod,
  type V3PresetItemType,
} from '@/engine/decide/v3';
import { MAX_ABS_AMOUNT_MINOR, currencyCode, currencyExponent, minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { occurrenceDate, type RecurringFreq } from '@/engine/recurring';
import { buildDecideSnapshot, type SnapshotSource } from '../buildSnapshot';
import { convertFloored, makeConverter } from '../conversion';
import type { SnapshotResult } from '../types';
import type { V3SeriesExtra, V3SettingsSource } from './types';

type Obj = Record<string, unknown>;

const NO_EXTRA: V3SeriesExtra = { pay_group: null, counts_as: null, income_kind: null, saving_mode: null, typical_choice: null, status: null };
const EMPTY_LISTS = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] } as const satisfies CustomOptions;
const EMPTY_CUSTOM: CustomOptions = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] };
const INCOME_TYPES: readonly string[] = ['salary', 'commission', 'freelance', 'none', 'mix'];
const VARIABLE_METHODS: readonly string[] = ['match', 'spread', 'steady', 'balance'];
const PRESET_INCOME_KINDS: readonly string[] = ['salary', 'commission', 'side_business', 'dividends', 'interest', 'rent', 'family', 'other'];
const MARKS: readonly string[] = ['normal', 'out', 'half'];
const OWN_CADENCES: readonly string[] = ['monthly', 'yearly', 'one_off'];
const DSR_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINE_PERCENT = 100;
const MAX_UNSECURED_MULTIPLE = 120;
const SPENDING_KINDS: readonly string[] = ['cash', 'checking'];
const SAVED_KINDS: readonly string[] = ['savings', 'investment'];
const DEBT_KINDS: readonly string[] = ['credit', 'loan'];
const LEGACY_LINE_IDS: readonly string[] = ['debt_share', 'housing_share', 'unsecured_multiple'];
const USD_PROBE_MINOR = 1_000_000; // US$10,000 in minor units: the rate probe for a currency the band table lacks
const USD_PROBE_EXPONENT = 4; // 10,000 US$ = 10^4 major units

const isRec = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
const moneyOf = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= MAX_ABS_AMOUNT_MINOR ? x : null);
/** M-07: the unspent figure is signed (overdrawn, card owed). Only the bounds apply. */
const signedMoneyOf = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && Math.abs(x) <= MAX_ABS_AMOUNT_MINOR ? x : null);
const dateOf = (x: unknown): string | null => (typeof x === 'string' && DATE_PATTERN.test(x) ? x : null);
const pctOf = (x: unknown) => (typeof x === 'string' && DSR_PATTERN.test(x) && Number(x) <= MAX_LINE_PERCENT ? percent(x) : null);
const inList = (xs: readonly string[], x: unknown): x is string => typeof x === 'string' && xs.includes(x);

function lineSpecOf(s: unknown): LineSpec | null {
  if (!isRec(s)) return null;
  const categoryId = str(s.categoryId);
  const cap = moneyOf(s.cap);
  switch (s.kind) {
    case 'housing_share':
    case 'debt_share': {
      const pct = pctOf(s.pct);
      return pct === null ? null : { kind: s.kind, pct };
    }
    case 'unsecured_multiple': {
      const t = s.times;
      return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= MAX_UNSECURED_MULTIPLE ? { kind: 'unsecured_multiple', times: t } : null;
    }
    case 'category_monthly_cap':
      return categoryId === null || cap === null ? null : { kind: 'category_monthly_cap', categoryId, cap: minorUnits(cap) };
    case 'single_purchase_cap':
      return cap === null ? null : { kind: 'single_purchase_cap', cap: minorUnits(cap) };
    case 'category_income_share': {
      const pct = pctOf(s.pct);
      return categoryId === null || pct === null ? null : { kind: 'category_income_share', categoryId, pct };
    }
    case 'unspent_floor': {
      const floor = moneyOf(s.floor);
      return floor === null ? null : { kind: 'unspent_floor', floor: minorUnits(floor) };
    }
    default:
      return null;
  }
}

/** D-13: the legacy lines first, then the user's own lines (at most 5, unique ids). Invalid entries are dropped, never thrown. */
function limitsOf(v3: V3SettingsSource | null, legacy: Limits): Limits {
  if (v3 === null) return legacy;
  const taken = new Set<string>(LEGACY_LINE_IDS);
  const own: LimitLine[] = [];
  for (const raw of v3.own_lines) {
    const id = isRec(raw) ? str(raw.id) : null;
    const spec = isRec(raw) ? lineSpecOf(raw.spec) : null;
    if (id === null || spec === null || taken.has(id) || own.length >= MAX_OWN_LINES) continue;
    taken.add(id);
    own.push({ id, on: (raw as Obj).on === true, source: 'own', spec });
  }
  return { lines: [...legacy.lines, ...own] };
}

function cadenceOf(x: unknown): Cadence | null {
  if (!isRec(x)) return null;
  const every = x.every;
  const unit = x.unit;
  return (unit === 'week' || unit === 'month') && typeof every === 'number' && Number.isInteger(every) ? { unit, every } : null;
}

/** M-09: keep an entry only when the list so far plus the entry validates; so one bad entry drops itself, a duplicate id drops the later one, and each list stops at MAX_CUSTOM_OPTIONS. */
function keepValid<T>(candidates: readonly T[], wrap: (xs: readonly T[]) => CustomOptions): T[] {
  const kept: T[] = [];
  for (const c of candidates) {
    if (kept.length >= MAX_CUSTOM_OPTIONS) break;
    if (validateCustomOptions(wrap([...kept, c])).length === 0) kept.push(c);
  }
  return kept;
}

function customOf(x: unknown): CustomOptions {
  if (!isRec(x)) return EMPTY_CUSTOM;
  const itemTypes: CustomOptions['itemTypes'][number][] = list(x.itemTypes).flatMap((t) => {
    if (!isRec(t)) return [];
    const id = str(t.id);
    if (id === null || !inList(V3_ITEM_TYPES, t.base)) return [];
    const ownQuestions = list(t.ownQuestions).flatMap((q) => {
      const qid = isRec(q) ? str(q.id) : null;
      const label = isRec(q) && typeof q.label === 'string' ? q.label : null;
      if (qid === null || label === null || !isRec(q) || !inList(OWN_CADENCES, q.cadence) || typeof q.cash !== 'boolean') return [];
      return [{ id: qid, label, cadence: q.cadence as 'monthly' | 'yearly' | 'one_off', cash: q.cash }];
    });
    return [{ id, base: t.base as V3PresetItemType, questionIds: list(t.questionIds).filter((q): q is string => typeof q === 'string'), ownQuestions }];
  });
  const purposes = list(x.purposes).flatMap((p) => (isRec(p) && str(p.id) !== null ? [{ id: p.id as string }] : []));
  const cadences = list(x.cadences).flatMap((c) => {
    const cad = cadenceOf(c);
    return cad === null ? [] : [cad];
  });
  const incomeKinds = list(x.incomeKinds).flatMap((k) => {
    if (!isRec(k) || str(k.id) === null) return [];
    const countsAs: CountsAs = k.countsAs === 'available' || k.countsAs === 'kept' ? k.countsAs : null;
    return [{ id: k.id as string, countsAs }];
  });
  return {
    itemTypes: keepValid(itemTypes, (xs) => ({ ...EMPTY_LISTS, itemTypes: xs })),
    purposes: keepValid(purposes, (xs) => ({ ...EMPTY_LISTS, purposes: xs })),
    cadences: keepValid(cadences, (xs) => ({ ...EMPTY_LISTS, cadences: xs })),
    incomeKinds: keepValid(incomeKinds, (xs) => ({ ...EMPTY_LISTS, incomeKinds: xs })),
  };
}

function profileOf(v3: V3SettingsSource | null): IncomeProfile | null {
  if (v3 === null || v3.income_types === null) return null;
  const steady = moneyOf(v3.steady_amount);
  const hold = v3.hold_months;
  return {
    types: v3.income_types.filter((t) => INCOME_TYPES.includes(t)) as IncomeType[],
    variable: inList(VARIABLE_METHODS, v3.variable_method) ? (v3.variable_method as VariableMethod) : null,
    steady: steady === null ? null : minorUnits(steady),
    billsHorizonMonths: hold === 1 || hold === 2 || hold === 3 ? hold : null,
    pattern: null, // 05.2 stores this (05.2-OWNER-NOTES, D-34)
    patternConfirmed: false, // 05.2 stores this (D-34)
  };
}

function incomeKindOf(raw: string | null): IncomeKind | null {
  if (raw === null) return null;
  return PRESET_INCOME_KINDS.includes(raw)
    ? { kind: 'preset', value: raw as Extract<IncomeKind, { kind: 'preset' }>['value'] }
    : { kind: 'custom', id: raw };
}

/** The last day a series runs: its end date, or the date of its final counted occurrence when it has an occurrence count. */
function endOf(anchor: string, freq: RecurringFreq, endDate: string | null, count: number | null): string | null {
  if (count === null) return endDate;
  const last = occurrenceDate(anchor, freq, Math.max(0, count - 1));
  return endDate === null || last < endDate ? last : endDate;
}

/** Home major units per US$1 as a rational, from stored rates only (D-26). Null when the table has the currency or no rate converts. */
function usdRateOf(source: SnapshotSource, home: string): UsdRate | null {
  if (homeThresholds(home, null).source === 'table') return null;
  const r = convertFloored(USD_PROBE_MINOR, 'USD', home, source.rates, source.customCurrencies, source.today);
  return r === null ? null : { num: BigInt(r.amount), den: 10n ** BigInt(currencyExponent(home) + USD_PROBE_EXPONENT) };
}

/**
 * Builds the v3 engine inputs from today's snapshot source. `v3` null = nothing set up yet (the v3 defaults and the
 * needs-input rules apply, S9). `built` lets computeV3 pass a snapshot it already built (one parse, one conversion).
 */
export function buildV3Inputs(
  source: SnapshotSource,
  v3: V3SettingsSource | null,
  built: SnapshotResult = buildDecideSnapshot(source),
  uses: Readonly<Record<string, AccountUse>> = {} // D-54: no stored account use exists yet (05.2 stores it); until then every use is null
): V3Inputs {
  const { today, homeCurrency: home } = source;
  const thresholds: HomeThresholds = homeThresholds(home, usdRateOf(source, home));
  const accountKind = new Map(source.accounts.map((a) => [a.id, a.kind as string]));
  const kindOf = (accountId: string): string => accountKind.get(accountId) ?? '';
  const categoryKey = (id: string | null): string | null => (id === null ? null : (source.categories[id] ?? null));
  const liveGoals = new Set(source.goals.filter((g) => g.deleted_at === null && g.done_at === null).map((g) => g.id));
  const isLiveGoal = (id: string | null | undefined): boolean => id !== null && id !== undefined && liveGoals.has(id);

  const rowById = new Map(source.rows.map((r) => [r.id, r]));
  type Row = SnapshotSource['rows'][number];
  const legsOf = new Map<string, Row[]>();
  for (const r of source.rows) {
    if (r.transfer_id === null || r.deleted_at !== null) continue;
    legsOf.set(r.transfer_id, [...(legsOf.get(r.transfer_id) ?? []), r]);
  }

  const extraOf = (seriesId: string): V3SeriesExtra => v3?.series_extra[seriesId] ?? NO_EXTRA;

  // ── series ──
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
  let debts: V3Debt[] = [];
  // D-54: the account an envelope's latest goal-tagged leg lands in; null when it has none.
  const landing = new Map<string, Row>();
  for (const r of source.rows) {
    if (r.deleted_at !== null || r.transfer_id === null || r.goal_id == null || r.original_amount <= 0) continue;
    const prev = landing.get(r.goal_id);
    if (prev === undefined || r.local_date >= prev.local_date) landing.set(r.goal_id, r);
  }
  const envelopes: Envelope[] = (built.pots ?? []).map((p) => ({ ...p, purposeId: null, accountId: landing.get(p.id)?.account_id ?? null }));
  const toHome = makeConverter({ home, rates: source.rates, customs: source.customCurrencies, today }).toHome;
  const accounts: V3Account[] = source.accounts.flatMap((a) => {
    if (a.deleted_at !== null || a.archived_at !== null) return [];
    const balance = toHome(source.balances[a.id] ?? 0, a.currency);
    return balance === null ? [] : [{ id: a.id, balance: minorUnits(balance), use: uses[a.id] ?? null }];
  });
  let rough: RoughFigures | null = null;
  let provisionalRates = (built.provisional ?? null) !== null;

  if (built.kind === 'logged') {
    const snap = built.snapshot;
    provisionalRates = snap.provisionalRates === true;
    for (const b of snap.bills) series.push(make(b.seriesId, 'bill', b.freq, b.anchorDate, b.endDate, b.occurrenceCount, b.latestAmount, b.categoryId));
    for (const s of snap.incomeSeries) {
      const other = incomeKindOf(extraOf(s.seriesId).income_kind);
      const role: SeriesRole = other === null || (other.kind === 'preset' && other.value === 'salary') ? 'pay' : 'other_income';
      series.push(make(s.seriesId, role, s.freq, s.anchorDate, s.endDate, s.occurrenceCount, s.latestAmount, null));
    }

    // Saving and investing series are folded into monthlySaving by the old builder, so they are read from the source here.
    const converter = makeConverter({ home, rates: source.rates, customs: source.customCurrencies, today });
    const investing = new Set(source.paymentLinks.filter((l) => l.check_kind === 'invest').map((l) => l.target_id));
    const covered = new Set(source.debts.filter((d) => d.deleted_at === null && d.series_id !== null).map((d) => d.series_id as string));
    for (const s of source.series) {
      if (s.deleted_at !== null || categoryKey(s.category_id) !== 'Savings' || covered.has(s.id)) continue;
      if (s.end_date !== null && s.end_date < today) continue;
      const amount = converter.toHome(Math.abs(s.amount), s.currency);
      if (amount === null || amount === 0) continue;
      series.push(make(s.id, investing.has(s.id) ? 'investing' : 'saving', s.freq, s.anchor_date, s.end_date, s.occurrence_count, amount, s.category_id));
    }

    // ── lines ──
    const anyUse = Object.keys(uses).length > 0;
    const counts = (id: string | undefined): boolean => {
      const u = id === undefined ? undefined : uses[id];
      return u !== undefined && (u.kind === 'everyday' || u.kind === 'mixed');
    };
    const roleOf = (line: (typeof snap.months)[number]['lines'][number]): LineRole => {
      if (line.transferId === null) return line.direction === 'out' ? 'spending' : line.isRefund ? 'refund' : 'income';
      const row = rowById.get(line.id);
      if (row === undefined) return 'own_transfer'; // L-09: a leg whose row is gone is ignored
      const partner = (legsOf.get(line.transferId) ?? []).find((r) => r.id !== row.id);
      const out = line.direction === 'out';
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
        if (anyUse || SAVED_KINDS.includes(toKind)) return 'saved_invested';
        return 'other_out';
      }
      if (!out && toSpending && !fromSpending) return tagged ? 'envelope_withdrawal' : 'other_in';
      return 'own_transfer';
    };
    const seriesById = new Map(series.map((s) => [s.id, s]));
    const marks = v3?.month_marks ?? null;
    months = snap.months.map((m) => {
      const mark = marks === null ? undefined : marks[m.month];
      return {
        month: m.month,
        full: m.full,
        mark: inList(MARKS, mark) ? (mark as MonthMark) : null,
        lines: m.lines.flatMap((l): V3Line[] => {
          if (l.status === 'skipped') return [];
          const role = roleOf(l);
          const s = l.seriesId === null ? undefined : seriesById.get(l.seriesId);
          return [
            {
              id: l.id,
              date: l.date,
              amount: l.amount,
              role,
              status: l.status,
              seriesId: l.seriesId,
              categoryId: l.categoryId,
              coversMonths: null,
              source: rowById.get(l.id)?.import_batch_id ? 'statement' : 'manual', // D-51
              expected: false,
              incomeKind: null,
              countsAs: role === 'income' && s !== undefined ? s.countsAs : null,
            },
          ];
        }),
      };
    });

    // ── debts ──
    const debtRow = new Map(source.debts.map((d) => [d.id, d]));
    debts = snap.debts.map((d) => {
      const row = debtRow.get(d.id);
      return {
        id: d.id,
        kind: row !== undefined ? row.kind : kindOf(d.id) === 'credit' ? 'card' : 'loan',
        balance: d.balance,
        minimum: d.minimumPayment,
        apr: d.apr,
        secured: d.secured,
        isHousing: row !== undefined && row.is_housing,
      };
    });
  } else if (built.kind === 'rough') {
    const f = built.figures;
    const part = (x: unknown): ReturnType<typeof minorUnits> => minorUnits(moneyOf(x) ?? 0);
    rough = {
      income: f.monthlyIncome,
      expenses: f.monthlySpending,
      saving: part(v3?.rough_saving),
      debt: part(v3?.rough_debt),
      invest: part(v3?.rough_invest),
      asOf: dateOf(v3?.rough_as_of) ?? today,
    };
  }

  // ── funds ──
  const st = source.settings;
  const reserve = st === null || (st.currency !== null && st.currency !== home) ? null : moneyOf(st.reserve);
  const anchorAmount = signedMoneyOf(v3?.unspent_anchor);
  const anchorAt = dateOf(v3?.unspent_anchor_at);
  const everyday = moneyOf(v3?.everyday_override);

  return {
    asOf: today,
    currency: currencyCode(home),
    region: source.region,
    months,
    series,
    dismissedKeys: (v3?.dismissals ?? []).filter((k): k is string => typeof k === 'string'),
    profile: profileOf(v3),
    rough,
    balance: built.cash,
    unspent: anchorAmount === null || anchorAt === null ? null : { amount: minorUnits(anchorAmount), at: anchorAt },
    emergency: reserve === null ? null : { amount: minorUnits(reserve), accountId: v3?.reserve_account_id ?? null },
    envelopes,
    debts,
    everydayOverride: everyday === null ? null : minorUnits(everyday),
    limits: limitsOf(v3, legacyLimits(st)),
    custom: customOf(v3?.custom_options),
    thresholds,
    accounts,
    unexplainedAnswer: null, // 05.2 stores the D-50 answer
    payArrivals: [], // 05.2 stores this (D-58)
    expectedIncome: [], // 05.2 stores this (05.2-OWNER-NOTES, D-35)
    heldBridges: [], // 05.2 stores this (05.2-OWNER-NOTES, D-38)
    unsavedWrites: 0,
    provisionalRates,
  };
}
