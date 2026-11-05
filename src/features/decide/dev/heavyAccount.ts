// 05.4-34 (APP-04, D-130): a heavy synthetic account for the on-device engine timing harness. Dev only: nothing here is real
// data, and nothing reaches the database. The shape matches prepare.test.ts heavyInputs() (12 months x 120 lines, 20 series:
// 2 pay, 4 debt payments, 14 bills; 6 loans; 4 everyday accounts), built here directly because app code must not import test
// helpers. Amounts are integer minor units.
import { BAND_EDGES_USD } from '@/engine/decide/v3';
import type { CheckV2, PayV2, V3Inputs, V3Line, V3Month, V3Series } from '@/engine/decide/v3';
import { currencyCode, minorUnits, type MinorUnits } from '@/engine/money/types';
import { percent } from '@/engine/payoff/types';

const mu = (n: number): MinorUnits => minorUnits(n);

export const HEAVY_AS_OF = '2026-10-03';
export const HEAVY_MONTHS = 12;
export const HEAVY_LINES_PER_MONTH = 120;

function line(id: string, date: string, amount: number, categoryId: string): V3Line {
  return {
    id,
    date,
    amount: mu(amount),
    status: 'paid',
    role: 'spending',
    seriesId: null,
    categoryId,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
  };
}

function series(i: number): V3Series {
  return {
    id: `s${i}`,
    role: i < 2 ? 'pay' : i < 6 ? 'debt_payment' : 'bill',
    cadence: { unit: 'month', every: 1 },
    anchorDate: `2026-01-${String((i % 27) + 1).padStart(2, '0')}`,
    amount: mu(i < 2 ? 250_000 : 5000 + i * 300),
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
  };
}

/** The heavy account: the same inputs every call, so runs compare. */
export function heavyAccount(): V3Inputs {
  const months: V3Month[] = [];
  for (let m = 0; m < HEAVY_MONTHS; m++) {
    const ym = `2026-${String(m < 10 ? m + 1 : m - 9).padStart(2, '0')}`;
    const lines: V3Line[] = [];
    for (let i = 0; i < HEAVY_LINES_PER_MONTH; i++) {
      lines.push(line(`l-${ym}-${i}`, `${ym}-${String((i % 27) + 1).padStart(2, '0')}`, 1500 + ((i * 37) % 900), `c${i % 12}`));
    }
    months.push({ month: ym, full: true, mark: null, lines });
  }
  const debts = Array.from({ length: 6 }, (_, i) => ({
    id: `d${i}`,
    kind: 'loan' as const,
    balance: mu(500_000 + i * 10_000),
    minimum: mu(5000),
    apr: percent('12'),
    secured: false,
    isHousing: false,
  }));
  const accounts = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, balance: mu(300_000), use: { kind: 'everyday' as const } }));
  return {
    asOf: HEAVY_AS_OF,
    currency: currencyCode('USD'),
    region: null,
    months,
    series: Array.from({ length: 20 }, (_, i) => series(i)),
    dismissedKeys: [],
    profile: null,
    typedEstimates: null,
    balance: mu(1_200_000),
    unspent: null,
    emergency: null,
    envelopes: [],
    debts,
    everydayOverride: null,
    limits: { lines: [] },
    custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] },
    thresholds: { bandEdges: BAND_EDGES_USD.map((e) => mu(e)), unspentDrift: mu(20_000), quotedTolerance: mu(100), source: 'table' },
    unsavedWrites: 0,
    provisionalRates: false,
    accounts,
  };
}

function checkOf(price: number, pay: PayV2 = { mode: 'once' }): CheckV2 {
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
    pay,
    extras: {},
    value: { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: null },
    share: { kind: 'personal' },
    foreign: null,
    layerAnswers: {},
  };
}

/** A monthly plan of `count` payments at `apr` percent, `deposit` up front, first payment one period after today. */
export function monthlyPlan(count: number, apr: string, deposit: number): PayV2 {
  return {
    mode: 'plan',
    cadence: { unit: 'month', every: 1 },
    count,
    termMonths: null,
    apr: percent(apr),
    fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
    deposit: mu(deposit),
    tradeIn: mu(0),
    quotedPayment: null,
    firstPayment: { kind: 'one_period' },
    deferredInterestTerm: false,
  };
}

/** The shadow sample set (CONTEXT specifics): $60, $500 phone, $2,000 laptop, $9,000 car paid at once and on a plan. */
export function heavyChecks(): CheckV2[] {
  return [checkOf(6_000), checkOf(50_000), checkOf(200_000), checkOf(900_000), checkOf(900_000, monthlyPlan(48, '7.9', 100_000))];
}
