/**
 * Fixed-seed properties over the variable-income persons (05.1-48): ines (seasonal), gabe (gig) and vic (very volatile).
 * Same bodies as the end-to-end invariants in invariants/, drawn over these three persons so the lean-month, bridge and
 * D-48 branches are exercised. A pair where either side asks (needs_input) is skipped with fc.pre: asking is a request for
 * a figure, not a verdict.
 */
import fc from 'fast-check';
import { evaluate } from '../evaluate';
import type { CheckV2, ReadyBy, Result, V3Inputs } from '../types';
import { checkArb, checkOf, codeRank, mu, perturbPerson, priceArb, shapeArb, tweakArb } from './invariants/arbitraries';
import { toV3Inputs } from './golden/adapter';
import { variablePersonById } from './golden/variableIncomeLoader';

const PEOPLE = ['ines', 'gabe', 'vic'] as const;

const inputsArb: fc.Arbitrary<V3Inputs> = fc
  .tuple(fc.constantFrom(...PEOPLE), tweakArb)
  .map(([id, t]) => toV3Inputs(perturbPerson(variablePersonById(id), t)));

const run = (inputs: V3Inputs, check: CheckV2): Result => evaluate(inputs, check).result;
const asking = (...rs: Result[]): boolean => rs.some((r) => r.code === 'needs_input');

function readyKey(r: ReadyBy | null): string {
  if (r === null) return '9999-99-99';
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

/** The fund sits in its own dedicated emergency account, so its amount never touches the spending balance (D-43, D-54). */
function withFund(inputs: V3Inputs, amount: number): V3Inputs {
  const accounts = (inputs.accounts ?? []).filter((a) => !(a.use !== null && a.use.kind === 'dedicated' && a.use.purpose.kind === 'emergency'));
  return {
    ...inputs,
    accounts: [...accounts, { id: 'fund-acct', balance: mu(amount), use: { kind: 'dedicated', purpose: { kind: 'emergency' } } }],
    emergency: { amount: mu(amount), accountId: 'fund-acct' },
  };
}

const LEVELS = { rough: 0, fair: 1, firm: 2 } as const;

describe('variable-income persons: fixed-seed properties', () => {
  it('I9 a cheaper price is never worse', () => {
    fc.assert(
      fc.property(inputsArb, shapeArb, priceArb, fc.integer({ min: 1, max: 99 }), (inputs, shape, price, pct) => {
        const cheaper = Math.max(100, Math.floor((price * pct) / 100));
        const hi = run(inputs, checkOf(price, shape));
        const lo = run(inputs, checkOf(cheaper, shape));
        fc.pre(!asking(hi, lo));
        expect(codeRank(lo.code)).toBeGreaterThanOrEqual(codeRank(hi.code));
      }),
      { numRuns: 100, seed: 0x0548 }
    );
  });

  it('I13 a dearer price is never ready sooner', () => {
    fc.assert(
      fc.property(inputsArb, shapeArb, priceArb, fc.integer({ min: 1, max: 99 }), (inputs, shape, price, pct) => {
        const cheaper = Math.max(100, Math.floor((price * pct) / 100));
        const hi = run(inputs, checkOf(price, shape));
        const lo = run(inputs, checkOf(cheaper, shape));
        fc.pre(hi.code === 'not_yet' && lo.code === 'not_yet');
        expect(readyKey(hi.readyBy) >= readyKey(lo.readyBy)).toBe(true);
      }),
      { numRuns: 100, seed: 0x0549 }
    );
  });

  it('I31 with the emergency flag off, a fund of $0 or $1M changes nothing but its own line', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const off: CheckV2 = { ...check, emergency: false };
        const zero = run(withFund(inputs, 0), off);
        const million = run(withFund(inputs, 100_000_000), off);
        const norm = (r: Result): Result => ({
          ...r,
          facts: r.facts.map((f) => (f.code === 'emergency_untouched' ? { ...f, values: { amount: 0 } } : f)),
        });
        expect(norm(million)).toEqual(norm(zero));
        expect(million.code).not.toBe('emergency_use');
      }),
      { numRuns: 100, seed: 0x054a }
    );
  });

  it('D-42 partial thinning never helps: neither the code nor the confidence', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }), (inputs, check, mask) => {
        const treatedFull: V3Inputs = { ...inputs, months: inputs.months.map((m) => ({ ...m, full: true })) };
        const thin: V3Inputs = { ...inputs, months: inputs.months.map((m, i) => ({ ...m, full: mask[i % mask.length]! })) };
        const a = run(thin, check);
        const b = run(treatedFull, check);
        expect(codeRank(a.code)).toBeLessThanOrEqual(codeRank(b.code));
        expect(LEVELS[a.confidence.level]).toBeLessThanOrEqual(LEVELS[b.confidence.level]);
      }),
      { numRuns: 100, seed: 0x054b }
    );
  });
});
