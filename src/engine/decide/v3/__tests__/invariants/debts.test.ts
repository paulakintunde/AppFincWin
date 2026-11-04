/**
 * I55, I56 and I-DB05 (05.4-20: FIN-04 / ENG-01, FIN-10 / ENG-09, D-08, D-39b). Golden persons, perturbed (inputsArb), with drawn
 * cards and loans.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { applyPurchaseFlows } from '../../cash/path';
import { addDays } from '../../dates';
import { evaluate } from '../../evaluate';
import { prepare } from '../../prepare';
import { liveSeriesOf } from '../../month/series';
import { monthlyEquivalentOf } from '../../plan/cadence';
import type { FactCode, V3Debt, V3Inputs } from '../../types';
import { loadCases } from '../rightAnswers/loader';
import { toEngineInputs } from '../rightAnswers/fixture';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, codeRank, inputsArb } from './arbitraries';

const mu = minorUnits;

const debtArb: fc.Arbitrary<V3Debt> = fc
  .record({
    n: fc.integer({ min: 0, max: 99 }),
    card: fc.boolean(),
    balance: fc.integer({ min: 0, max: 5_000_000 }),
    minimum: fc.integer({ min: 1, max: 200_000 }),
    apr: fc.constantFrom(null, '0', '5.5', '19.99', '20', '24.9', '39.9'),
    dueDay: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
    housing: fc.boolean(),
    joint: fc.boolean(),
    paid: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: undefined }),
  })
  .map((d) => ({
    id: `arb-debt-${d.n}`,
    kind: d.card ? 'card' : 'loan',
    balance: mu(d.balance),
    minimum: mu(d.minimum),
    apr: d.apr === null ? null : percent(d.apr),
    secured: false,
    isHousing: d.housing,
    dueDay: d.dueDay,
    joint: d.joint,
    ...(d.paid === undefined ? {} : { paidThisMonth: mu(d.paid) }),
  }));

/** The lowest point of the first reading's 90-day path with no purchase, from the spending money. */
function lowest(inputs: V3Inputs): number {
  const p = prepare(inputs);
  const r = p.readings[0] as (typeof p.readings)[number];
  const path = applyPurchaseFlows(r.open, r.funds.spending, []);
  return Math.min(...path.points.map((x) => x.balance));
}

const DEBT_LINES: readonly FactCode[] = ['debt_interest_cost', 'debt_more', 'housing_cost', 'joint_loan_risk'];

describe('card and loan minimums', () => {
  it('I55 adding a debt never raises the lowest point, and never makes the answer less strict', () => {
    fc.assert(
      fc.property(inputsArb, debtArb, checkArb, (base, debt, check) => {
        const withDebt: V3Inputs = { ...base, debts: [...base.debts, debt] };
        expect(lowest(withDebt)).toBeLessThanOrEqual(lowest(base));
        const a = evaluate(base, check).result;
        const b = evaluate(withDebt, check).result;
        if (a.code !== 'needs_input' && b.code !== 'needs_input') expect(codeRank(b.code)).toBeLessThanOrEqual(codeRank(a.code));
      }),
      { numRuns: fcRuns(200), seed: 0x0555 }
    );
  });

  it('I56 a debt payment is counted once: a debt paid through a live bill series changes neither the month nor the path', () => {
    fc.assert(
      fc.property(inputsArb, debtArb, checkArb, (base, debt, check) => {
        const bill = liveSeriesOf(base.series, base.asOf, 'bill')[0];
        fc.pre(bill !== undefined);
        const linked: V3Debt = { ...debt, minimum: monthlyEquivalentOf(bill!.amount, bill!.cadence), seriesId: bill!.id };
        const withDebt: V3Inputs = { ...base, debts: [...base.debts, linked] };
        const a = evaluate(base, check);
        const b = evaluate(withDebt, check);
        expect([b.month.monthLeft, b.month.typicalLeft, b.month.setAside]).toEqual([a.month.monthLeft, a.month.typicalLeft, a.month.setAside]);
        expect(lowest(withDebt)).toBe(lowest(base));
        expect(b.net?.starter).toBe(a.net?.starter);
      }),
      { numRuns: fcRuns(200), seed: 0x0556 }
    );
    // An unlinked debt lands at most once in each month of the path.
    fc.assert(
      fc.property(inputsArb, debtArb, (base, debt) => {
        const p = prepare({ ...base, debts: [debt] });
        const r = p.readings[0] as (typeof p.readings)[number];
        const q = prepare({ ...base, debts: [] });
        const s = q.readings[0] as (typeof q.readings)[number];
        const months = new Map<string, number>();
        r.open.net.forEach((x, i) => {
          const d = x - (s.open.net[i] as bigint);
          if (d !== 0n) {
            const ym = addDays(r.open.asOf, i).slice(0, 7);
            months.set(ym, (months.get(ym) ?? 0) + 1);
            expect(d).toBeLessThan(0n);
            expect(-d).toBeLessThanOrEqual(BigInt(debt.minimum));
          }
        });
        for (const n of months.values()) expect(n).toBe(1);
      }),
      { numRuns: fcRuns(200), seed: 0x0556 }
    );
  });

  it('I-DB05 the fact-lines switch hides only debt and housing fact lines: never the code, the variant, a caution, a shortfall or a variant\'s own fact', () => {
    fc.assert(
      fc.property(inputsArb, fc.array(debtArb, { minLength: 1, maxLength: 4 }), checkArb, (base, debts, check) => {
        const unique = debts.map((d, i) => ({ ...d, id: `${d.id}-${i}` }));
        const on = evaluate({ ...base, debts: unique, factLines: true }, check).result;
        const off = evaluate({ ...base, debts: unique, factLines: false }, check).result;
        expect([off.code, off.variant]).toEqual([on.code, on.variant]);
        const gone = on.facts.filter((f) => !off.facts.some((g) => JSON.stringify(g) === JSON.stringify(f)));
        for (const f of gone) expect(DEBT_LINES).toContain(f.code);
        if (on.variant === 'costly_debt') expect(off.facts.some((f) => f.code === 'debt_interest_cost')).toBe(true);
        expect(off.facts.filter((f) => DEBT_LINES.includes(f.code) && f.code !== 'debt_interest_cost')).toEqual([]);
      }),
      { numRuns: fcRuns(200), seed: 0x0db5 }
    );
  });

  it('I-DB05 DB-04: the same code and costly_debt with fact lines on and off, and its interest fact stays', () => {
    const db04 = loadCases().find((c) => c.id === 'DB-04');
    const { inputs, check } = toEngineInputs(db04!.fixture);
    const on = evaluate({ ...inputs, factLines: true }, check).result;
    const off = evaluate({ ...inputs, factLines: false }, check).result;
    expect([on.code, on.variant]).toEqual(['fits_unspent', 'costly_debt']);
    expect([off.code, off.variant]).toEqual(['fits_unspent', 'costly_debt']);
    expect(off.facts.find((f) => f.code === 'debt_interest_cost')?.values).toEqual({ balance: 600000, apr: '24.9', monthlyInterest: 12450 });
    expect(off.facts.find((f) => f.code === 'card_instead')?.values).toEqual({ price: 180000, saved: 3735 });
  });
});
