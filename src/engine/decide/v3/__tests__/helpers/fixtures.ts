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
