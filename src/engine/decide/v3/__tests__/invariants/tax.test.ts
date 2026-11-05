/**
 * 05.4 FIN-27 / ENG-29 / ARC-25 (05.4-25, D-18..D-21): sales tax on every check, through evaluate() on the generated people.
 * - I65: adding tax never makes an answer better (the code never ranks looser and this month's figure never rises).
 * - I66: a price that already includes tax adds none, whatever the region or a typed rate.
 * - I67: an unknown region (no country, another country, or the US or Canada with no state or province) adds 0 and says so.
 * Plus: a region's usual rate is the same as typing that rate, and is named as an estimate (tax_estimate).
 * The rates below come from the primary-source table (tax/defaults.ts) through its one lookup; this file restates the rounding.
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import { percent, type Percent } from '../../../../payoff/types';
import { TAX_DEFAULTS } from '../../tax/defaults';
import type { CheckV2, Result, V3Inputs } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { checkArb, codeRank, inputsArb } from './arbitraries';

const SCALE = 10n ** 10n; // Percent scale: percent('1') is 10^10 (asserted below)

type Region = { readonly country: string | null; readonly subdivision: string | null };
const withRegion = (i: V3Inputs, r: Region): V3Inputs => ({ ...i, region: r.country, regionSubdivision: r.subdivision });
const run = (i: V3Inputs, c: CheckV2): Result => evaluate(i, c).result;
const strip = (r: Result): Result => ({
  ...r,
  reasons: r.reasons.filter((x) => x !== 'tax_not_included'),
  notices: r.notices.filter((n) => n.code !== 'tax_not_included'),
  caveats: r.caveats?.filter((c) => c.code !== 'tax_not_included'), // 05.4-37 D-64 (4): the caveat of the same name
});

const ADD: readonly Region[] = [
  { country: 'US', subdivision: 'CA' },
  { country: 'US', subdivision: 'TX' },
  { country: 'US', subdivision: 'OR' },
  { country: 'CA', subdivision: 'ON' },
  { country: 'CA', subdivision: 'QC' },
  { country: 'CA', subdivision: 'AB' },
];
const INCLUDED: readonly Region[] = [
  { country: 'GB', subdivision: null },
  { country: 'DE', subdivision: null },
  { country: 'FR', subdivision: 'IDF' },
];
const UNKNOWN: readonly Region[] = [
  { country: null, subdivision: null },
  { country: 'US', subdivision: null },
  { country: 'CA', subdivision: null },
  { country: 'AU', subdivision: 'NSW' },
  { country: 'US', subdivision: 'ZZ' },
];
const regionArb = fc.constantFrom(...ADD, ...INCLUDED, ...UNKNOWN);
/** 0% to 25% in steps of 0.001%. */
const taxArb: fc.Arbitrary<Percent> = fc.integer({ min: 0, max: 25_000 }).map((n) => (BigInt(n) * (SCALE / 1000n)) as Percent);

it('the Percent scale this file restates', () => {
  expect(percent('1')).toBe(SCALE);
});

describe('I65 adding tax never makes an answer better', () => {
  it('I65 a check with a tax rate is never looser and leaves this month no more than the same check with none', () => {
    let compared = 0;
    fc.assert(
      fc.property(inputsArb, checkArb, taxArb, regionArb, (inputs0, check, t, r) => {
        const inputs = withRegion(inputs0, r);
        const none = run(inputs, { ...check, taxPercent: null, taxIncluded: true });
        const taxed = run(inputs, { ...check, taxPercent: t, taxIncluded: false });
        expect(taxed.afterBuy.month).toBeLessThanOrEqual(none.afterBuy.month);
        fc.pre(none.code !== 'needs_input' && taxed.code !== 'needs_input');
        compared += 1;
        expect(codeRank(taxed.code)).toBeLessThanOrEqual(codeRank(none.code));
      }),
      { numRuns: fcRuns(200), seed: 0x0565 }
    );
    if (isFullRun(200)) expect(compared).toBeGreaterThan(0);
  });
});

describe('I66 price included means no tax added', () => {
  it('I66 the switch adds no tax: the same answer as a typed 0%, whatever the region and any typed rate', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, taxArb, regionArb, (inputs0, check, t, r) => {
        const inputs = withRegion(inputs0, r);
        const switched = evaluate(inputs, { ...check, taxPercent: t, taxIncluded: true });
        const zero = evaluate(inputs, { ...check, taxPercent: percent('0'), taxIncluded: false });
        expect(switched).toEqual(zero);
        expect(switched.result.reasons).not.toContain('tax_not_included');
        expect(switched.result.facts.map((f) => f.code)).not.toContain('tax_estimate');
      }),
      { numRuns: fcRuns(100), seed: 0x0566 }
    );
  });

  it('I66 the UK and every EU member add no tax with the switch unset, and say nothing about it', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.constantFrom(...INCLUDED), fc.constantFrom(null, false), (inputs0, check, r, inc) => {
        const inputs = withRegion(inputs0, r);
        expect(evaluate(inputs, { ...check, taxPercent: null, taxIncluded: inc })).toEqual(evaluate(inputs, { ...check, taxPercent: null, taxIncluded: true }));
      }),
      { numRuns: fcRuns(100), seed: 0x0566 }
    );
  });
});

describe('I67 unknown region adds 0 and emits tax_not_included', () => {
  it('I67 the same answer as no tax, plus the reason and the notice on every answer that is not an ask', () => {
    let said = 0;
    fc.assert(
      fc.property(inputsArb, checkArb, fc.constantFrom(...UNKNOWN), fc.constantFrom(null, false), (inputs0, check, r, inc) => {
        const inputs = withRegion(inputs0, r);
        const unknown = run(inputs, { ...check, taxPercent: null, taxIncluded: inc });
        const none = run(inputs, { ...check, taxPercent: null, taxIncluded: true });
        expect(strip(unknown)).toEqual(none);
        const reason = unknown.reasons.includes('tax_not_included');
        const notice = unknown.notices.some((n) => n.code === 'tax_not_included');
        expect(notice).toBe(reason);
        if (unknown.code !== 'needs_input') expect(reason).toBe(true);
        if (reason) said += 1;
      }),
      { numRuns: fcRuns(200), seed: 0x0567 }
    );
    if (isFullRun(200)) expect(said).toBeGreaterThan(0);
  });

  it('I67 a typed rate is used as typed, so no notice even with no region', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, taxArb, fc.constantFrom(...UNKNOWN), (inputs0, check, t, r) => {
        const res = run(withRegion(inputs0, r), { ...check, taxPercent: t, taxIncluded: null });
        expect(res.reasons).not.toContain('tax_not_included');
        expect(res.notices.map((n) => n.code)).not.toContain('tax_not_included');
      }),
      { numRuns: fcRuns(60), seed: 0x0567 }
    );
  });
});

describe('FIN-27 a region default is the same as typing its rate, and is named as an estimate', () => {
  it('FIN-27 US and Canadian defaults: the answer equals the typed rate, plus one tax_estimate fact with the tax', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.constantFrom(...ADD), (inputs0, check, r) => {
        const inputs = withRegion(inputs0, r);
        const row = TAX_DEFAULTS[`${String(r.country)}-${String(r.subdivision)}`]!;
        const dflt = evaluate(inputs, { ...check, taxPercent: null, taxIncluded: null });
        const typed = evaluate(inputs, { ...check, taxPercent: row.percent, taxIncluded: null });
        const facts = dflt.result.facts.filter((f) => f.code !== 'tax_estimate');
        expect({ ...dflt, result: { ...dflt.result, facts } }).toEqual(typed);
        const price = BigInt(check.price ?? 0);
        // half up, restated: tax = price x percent / 100, rounded to the nearest minor unit
        const amount = Number((price * row.percent + 50n * SCALE) / (100n * SCALE));
        const est = dflt.result.facts.filter((f) => f.code === 'tax_estimate');
        if (dflt.result.code === 'needs_input' && est.length === 0) return; // an ask before the purchase is built
        expect(est).toHaveLength(1);
        expect(est[0]!.values['amount']).toBe(amount);
        expect(est[0]!.values['basis']).toBe(row.basis);
        expect(percent(String(est[0]!.values['percent']))).toBe(row.percent);
      }),
      { numRuns: fcRuns(100), seed: 0x0568 }
    );
  });
});
