// 05.1-37 M-08 (T-05.3-04-01): sales tax and deposit are modelled elsewhere. Writing them into extras never changes the answer;
// only taxPercent and pay.deposit do. Property-checked on the demo person with a real set-up so the answer is a verdict.
import * as fc from 'fast-check';
import { readStoredCheck, toStoredV2, type AccountUse } from '@/engine/decide/v3';
import { demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import { computeV3 } from '../computeV3';
import { v3s } from './v3Fixtures';

const source = demoSource('2026-10-03');
const uses: Record<string, AccountUse> = Object.fromEntries(source.accounts.map((a) => [a.id, { kind: 'everyday' } as AccountUse]));
const settings = v3s({ income_types: ['salary'], unspent_anchor: 300000, unspent_anchor_at: '2026-10-01', unexplained_amount: 1197097, unexplained_use: 'spare', unexplained_at: '2026-10-01', income_pattern: 'steady', income_pattern_confirmed: true });
const sofa = readStoredCheck(sofaInputs).check;
const plan = { mode: 'plan' as const, cadence: { unit: 'month' as const, every: 1 }, count: 12, termMonths: null, apr: null as null, fees: { setup: 0, perPeriod: 0, end: 0 }, deposit: 0, tradeIn: 0, quotedPayment: null, firstPayment: { kind: 'today' as const }, deferredInterestTerm: false };
const run = (check: object, tax?: string) => {
  const stored = toStoredV2({ ...check } as never) as { pay: object };
  const pay = stored.pay && (stored.pay as { mode: string }).mode === 'plan' ? { ...stored.pay, apr: '6' } : stored.pay;
  return computeV3(source, settings, { ...stored, pay, ...(tax === undefined ? {} : { taxPercent: tax }) }, uses);
};

describe('extras sales_tax and deposit count nothing (M-08)', () => {
  it.each(['sales_tax', 'deposit'])('extras.%s changes neither code, split nor day-one money', (key) => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), fc.integer({ min: 0, max: 1_000_000 }), (price, amount) => {
        const plain = run({ ...sofa, price, extras: {} });
        const withExtra = run({ ...sofa, price, extras: { [key]: amount } });
        expect(withExtra.result.code).toBe(plain.result.code);
        expect(withExtra.result.split).toEqual(plain.result.split);
        expect(withExtra.purchase!.dayOne).toBe(plain.purchase!.dayOne);
      }),
      { numRuns: 200 }
    );
  });

  it('taxPercent above 0 raises the whole price', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 10_000_000 }), fc.integer({ min: 1, max: 30 }), (price, pct) => {
        const plain = run({ ...sofa, price, taxPercent: null });
        const taxed = run({ ...sofa, price, taxPercent: null }, String(pct));
        expect(taxed.purchase!.whole).toBeGreaterThan(plain.purchase!.whole);
      }),
      { numRuns: 200 }
    );
  });

  it('a plan deposit above 0 lowers the financed amount', () => {
    
    fc.assert(
      fc.property(fc.integer({ min: 100_000, max: 10_000_000 }), fc.integer({ min: 1, max: 99_000 }), (price, deposit) => {
        const pay = (d: number) => ({ ...plan, deposit: d });
        const none = run({ ...sofa, price, pay: pay(0) });
        const some = run({ ...sofa, price, pay: pay(deposit) });
        expect(some.purchase!.schedule!.financed).toBeLessThan(none.purchase!.schedule!.financed);
      }),
      { numRuns: 200 }
    );
  });
});
