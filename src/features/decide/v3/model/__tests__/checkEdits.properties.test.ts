import * as fc from 'fast-check';
import { parseCheckV2, toStoredV2 } from '@/engine/decide/v3';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import {
  emptyCheck, withDeposit, withEmergency, withExtra, withItemType, withLayerAnswer, withPayMode, withPlan,
  withPrice, withPurpose, withTaxPercent, withValue,
} from '../checkEdits';

jest.setTimeout(60000);

const money = fc.integer({ min: 0, max: 100_000_000 }).map(minorUnits);
const pct = fc.integer({ min: 0, max: 99999 }).map((n) => percent(`${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`));

const edit: fc.Arbitrary<(c: CheckV2) => CheckV2> = fc.oneof(
  money.map((p) => (c: CheckV2) => withPrice(c, p)),
  fc.constant((c: CheckV2) => withPrice(c, null)),
  fc.constantFrom('vehicle', 'property', 'general', 'tuition').map((v) => (c: CheckV2) => withItemType(c, { kind: 'preset', value: v })),
  fc.constantFrom('once', 'plan').map((mode) => (c: CheckV2) => withPayMode(c, mode)),
  fc.tuple(fc.integer({ min: 0, max: 600 }), pct).map(([t, apr]) => (c: CheckV2) => (c.pay.mode === 'plan' ? withPlan(c, { termMonths: t, apr }) : c)),
  pct.map((p) => (c: CheckV2) => withTaxPercent(c, p)),
  money.map((a) => (c: CheckV2) => (c.pay.mode === 'plan' ? withDeposit(c, a) : c)),
  fc.tuple(fc.constantFrom('dealer_fees', 'insurance_monthly', 'trade_in', 'closing_costs'), fc.option(money, { nil: null })).map(([id, a]) => (c: CheckV2) => withExtra(c, id, a)),
  fc.integer({ min: 0, max: 200 }).map((y) => (c: CheckV2) => withValue(c, { useYears: y })),
  fc.tuple(fc.constantFrom('L2.alternative', 'L4.rent_stops', 'L6.closing', 'L6.moving', 'L7.professional'), fc.oneof(fc.boolean(), fc.string({ maxLength: 8 }), fc.integer({ min: 0, max: 1e6 }))).map(([k, v]) => (c: CheckV2) => withLayerAnswer(c, k, v)),
  fc.constantFrom('necessity', 'treat', 'for_work', 'luxury').map((value) => (c: CheckV2) => withPurpose(c, { kind: 'preset', value })),
  fc.boolean().map((y) => (c: CheckV2) => withEmergency(c, c.purpose !== null && c.purpose.kind === 'preset' && ['necessity', 'for_work'].includes(c.purpose.value) ? y : false)),
);

describe('checkEdits properties', () => {
  it('round trip: any sequence of edits reads back equal (300 runs)', () => {
    fc.assert(
      fc.property(fc.array(edit, { maxLength: 15 }), (edits) => {
        const c = edits.reduce((acc, f) => f(acc), emptyCheck());
        expect(parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(c))))).toEqual(c);
        expect(parseCheckV2(toStoredV2(c))).toEqual(c);
      }),
      { numRuns: 300 },
    );
  });

  it('D-18 / M-08: no edit sequence ever puts sales_tax or deposit in extras', () => {
    fc.assert(
      fc.property(fc.array(edit, { maxLength: 15 }), (edits) => {
        const c = edits.reduce((acc, f) => f(acc), emptyCheck());
        expect(c.extras).not.toHaveProperty('sales_tax');
        expect(c.extras).not.toHaveProperty('deposit');
        expect(Object.keys(c.extras).every((k) => !k.startsWith('L'))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
