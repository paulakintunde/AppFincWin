/**
 * 05.3-119 (UAT gap 36), T-05.3-119-02: a readiness answer can only ever remove a needs-input item, never add one.
 * For any purchase band, pace and newest-line age, needsInput with waivers is a subset of needsInput without them.
 */
import { CLEAN_CONFIDENCE } from '../../__tests__/helpers/restsOn';
import { array, assert as fcAssert, boolean, constantFrom, integer, oneof, property, record, type Arbitrary } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import { addDays } from '../../dates';
import type { Band, Funds, MonthModel, Purchase, ReadinessWaiver } from '../../types';
import { ASOF, inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import { needsInput } from '../needsInput';

const pay = v3Series({ id: 'p', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-09-25', amount: 400_000 });

function monthModel(everydayLogged: number, e: number | null): MonthModel {
  return {
    month: '2026-10', day: 3, daysInMonth: 31, moneyIn: mu(0), moneyOut: mu(0), billsPaid: mu(0), billsDue: mu(0),
    everydayLogged: mu(everydayLogged), erest: mu(0), setAside: mu(0), monthLeft: mu(50_000), e: e === null ? null : mu(e),
    typicalIncome: mu(500_000), recurringBills: mu(0), typicalLeft: null, low: null, monthsUsed: [], categoryMonthly: [],
    housingMonthly: mu(0), largestLine: null, confidence: CLEAN_CONFIDENCE, notices: [], reasons: [],
  };
}

const funds: Funds = {
  balance: mu(0), suggested: mu(0), unspent: null, emergency: null, envelopesSaved: mu(0), envelopesMonthly: mu(0), ownEnvelope: mu(0), spending: mu(0),
};

function purchase(band: number, dayOne: number): Purchase {
  return {
    whole: mu(dayOne), dayOne: mu(dayOne), monthly: mu(0), runningMonthly: mu(0), schedule: null, share: SOLE_SHARE,
    itemType: 'electronics', purpose: null, emergency: false, canUseEmergency: false, band: band as Band, layers: ['L0'],
    financed: false, secured: false, categoryId: null, envelopeId: null,
  };
}

const month = constantFrom('2026-08', '2026-09', '2026-10', '2026-11');
const at = integer({ min: -40, max: 5 }).map((d) => addDays(ASOF, d));
const waiver = oneof(
  record({ kind: constantFrom('month_complete' as const, 'nothing_to_add' as const), month, at }),
  record({ kind: constantFrom('paid_by_other' as const, 'didnt_happen' as const, 'no_pay' as const), seriesId: constantFrom('p', 'x'), date: at }),
  record({ kind: constantFrom('always_other' as const), seriesId: constantFrom('p', 'x') }),
  record({ kind: constantFrom('income_elsewhere' as const) }),
  record({ kind: constantFrom('start_from' as const), month }),
) as Arbitrary<ReadinessWaiver>;

describe('needsInput waivers (property)', () => {
  it('waivers only ever remove missing items', () => {
    fcAssert(
      property(
        integer({ min: 0, max: 7 }),
        integer({ min: 0, max: 200_000 }),
        oneof(integer({ min: 0, max: 200_000 }), constantFrom(null)),
        oneof(integer({ min: 0, max: 60 }), constantFrom(null)),
        boolean(),
        integer({ min: 0, max: 100_000 }),
        array(waiver, { maxLength: 6 }),
        (band, logged, e, age, withPay, dayOne, waivers) => {
          const lines = age === null ? [] : [v3Line({ id: 'a', date: addDays(ASOF, -age), amount: 100 })];
          const base = { series: withPay ? [pay] : [], months: [monthOf('2026-10', lines)] };
          const ctx = { month: monthModel(logged, e), funds, purchase: purchase(band, dayOne), purchaseMissing: [] };
          const without = needsInput({ ...ctx, inputs: inputsOf(base) });
          const withW = needsInput({ ...ctx, inputs: inputsOf({ ...base, waivers }) });
          for (const code of withW) expect(without).toContain(code);
        },
      ),
      { numRuns: 300 },
    );
  });
});
