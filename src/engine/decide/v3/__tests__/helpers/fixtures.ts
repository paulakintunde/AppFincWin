/**
 * Test-only v3 builders (05.1). Changing a default here changes many tests: add an override at the call site instead.
 * Lives under __tests__, so jest neither runs it as a suite nor counts it for coverage.
 */
import { currencyCode, minorUnits, type CurrencyCode, type MinorUnits } from '../../../../money/types';
import { BAND_EDGES_USD } from '../../constants';
import type {
  CheckV2,
  Cadence,
  LineRole,
  MonthMark,
  PayV2,
  V3Inputs,
  V3Line,
  V3Month,
  V3Series,
} from '../../types';

export const USD: CurrencyCode = currencyCode('USD');
export const ASOF = '2026-10-03';

const mu = (n: number): MinorUnits => minorUnits(n);

type LineOver = Omit<Partial<V3Line>, 'amount'> & Pick<V3Line, 'id' | 'date'> & { amount: number };

export function v3Line(p: LineOver): V3Line {
  return {
    status: 'paid',
    role: 'spending' satisfies LineRole,
    seriesId: null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
    ...p,
    amount: mu(p.amount),
  };
}

type SeriesOver = Omit<Partial<V3Series>, 'amount'> &
  Pick<V3Series, 'id' | 'role' | 'cadence' | 'anchorDate'> & { amount: number };

export function v3Series(p: SeriesOver): V3Series {
  return {
    endDate: null,
    status: 'live',
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: null,
    categoryId: null,
    isHousing: false,
    savingMode: null,
    ...p,
    amount: mu(p.amount),
  };
}

export function monthOf(
  month: string,
  lines: readonly V3Line[],
  over: { full?: boolean; mark?: MonthMark } = {}
): V3Month {
  return { month, full: true, mark: null, lines, ...over };
}

export function inputsOf(over: Partial<V3Inputs> = {}): V3Inputs {
  return {
    asOf: ASOF,
    currency: USD,
    region: null,
    months: [],
    series: [],
    dismissedKeys: [],
    profile: null,
    rough: null,
    balance: mu(0),
    unspent: null,
    emergency: null,
    envelopes: [],
    debts: [],
    everydayOverride: null,
    limits: { lines: [] },
    custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] },
    thresholds: {
      bandEdges: BAND_EDGES_USD.map((e) => mu(e)),
      unspentDrift: mu(20_000),
      quotedTolerance: mu(100),
      source: 'table',
    },
    unsavedWrites: 0,
    provisionalRates: false,
    ...over,
  };
}

const NO_VALUE: CheckV2['value'] = { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: null };

export function checkOnce(price: number, over: Partial<CheckV2> = {}): CheckV2 {
  return {
    v: 2,
    legacyKind: 'buy',
    price: mu(price),
    taxPercent: null,
    oneOffFees: mu(0),
    itemType: { kind: 'preset', value: 'general' },
    categoryId: null,
    purpose: null,
    emergency: false,
    envelopeId: null,
    pay: { mode: 'once' },
    extras: {},
    value: NO_VALUE,
    share: { kind: 'personal' },
    foreign: null,
    layerAnswers: {},
    ...over,
  };
}

const MONTHLY: Cadence = { unit: 'month', every: 1 };

export function checkPlan(price: number, pay: Partial<Extract<PayV2, { mode: 'plan' }>> = {}, over: Partial<CheckV2> = {}): CheckV2 {
  return checkOnce(price, {
    pay: {
      mode: 'plan',
      cadence: MONTHLY,
      count: null,
      termMonths: null,
      apr: null,
      fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
      deposit: mu(0),
      tradeIn: mu(0),
      quotedPayment: null,
      firstPayment: null,
      deferredInterestTerm: false,
      ...pay,
    },
    ...over,
  });
}

/**
 * D-48: a seasonal earner whose income swings far past the volatile limit. 14 full months to 2026-09, pay of 200,000 in
 * May to September and 40,000 otherwise (window income CV well above 38%), 30,000 a month of everyday spending, so each
 * lean month leaves 10,000. Unspent money is confirmed at 120,000 so only the monthly question is open.
 */
export function volatileInputs(over: Partial<V3Inputs> = {}): V3Inputs {
  const pay = v3Series({ id: 'gig', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2025-01-01', amount: 40_000 });
  const months = Array.from({ length: 14 }, (_, i) => {
    const t = 7 + i; // 2025-08 ...
    const m = `${2025 + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    const high = ['05', '06', '07', '08', '09'].includes(m.slice(5));
    return monthOf(m, [
      v3Line({ id: `vp-${m}`, date: `${m}-01`, amount: high ? 200_000 : 40_000, role: 'income', seriesId: 'gig' }),
      v3Line({ id: `ve-${m}`, date: `${m}-15`, amount: 30_000 }),
    ]);
  });
  return inputsOf({
    asOf: '2026-10-10',
    series: [pay],
    months: [
      ...months,
      monthOf(
        '2026-10',
        [
          v3Line({ id: 'vp-2026-10', date: '2026-10-01', amount: 40_000, role: 'income', seriesId: 'gig' }),
          v3Line({ id: 've-2026-10', date: '2026-10-05', amount: 20_000 }),
        ],
        { full: false }
      ),
    ],
    profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'seasonal' },
    unspent: { amount: mu(120_000), at: '2026-10-10' },
    ...over,
  });
}
