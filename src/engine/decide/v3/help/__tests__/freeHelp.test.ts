/**
 * 05.4 CMP-F04 (05.4-38, D-122..D-125): the money-help table and the free_help fact. The table rows, the lookup, which answers
 * carry the fact (D-123: every answer whose usual month is short), and I76 (the fact never changes the answer).
 */
import fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { Result, V3Inputs } from '../../types';
import { FREE_HELP, freeHelpFacts, freeHelpFor, usualMonthShort } from '../freeHelp';
import { TIER_CASES, rileyTier } from '../../__tests__/helpers/tierFixtures';
import { fcRuns } from '../../__tests__/helpers/fcRuns';
import { checkArb, inputsArb } from '../../__tests__/invariants/arbitraries';

type Shape = Pick<Result, 'code' | 'variant' | 'readiness'>;
const shape = (code: Result['code'], variant: Result['variant'] = null, readiness?: Result['readiness']): Shape => ({ code, variant, ...(readiness === undefined ? {} : { readiness }) });

describe('05.4-38 free help (CMP-F04)', () => {
  it('has the UK, US and Canada rows only, each a name, an https website and a checked date, nothing else (D-125, no phone)', () => {
    expect(Object.keys(FREE_HELP).sort()).toEqual(['CA', 'GB', 'US']);
    for (const row of Object.values(FREE_HELP)) {
      expect(Object.keys(row).sort()).toEqual(['checkedOn', 'name', 'url']);
      expect(row.url).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]+$/);
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.checkedOn === null || /^\d{4}-\d{2}-\d{2}$/.test(row.checkedOn)).toBe(true);
      expect(Object.isFrozen(row)).toBe(true);
    }
    expect(Object.isFrozen(FREE_HELP)).toBe(true);
  });

  it('looks up by ISO country; anything else has no row', () => {
    expect(freeHelpFor('GB')?.name).toBe('MoneyHelper');
    expect(freeHelpFor('US')?.name).toBe('NFCC');
    expect(freeHelpFor('CA')?.name).toBe('Credit Counselling Canada');
    for (const c of [null, 'UK', 'IE', 'gb', '', 'toString', 'constructor']) expect(freeHelpFor(c)).toBeNull();
  });

  it('D-123: Short each month and every month-already-short answer; nothing else, never an ask or a not-ready answer', () => {
    expect(usualMonthShort(shape('monthly_short'))).toBe(true);
    expect(usualMonthShort(shape('monthly_short', 'tight'))).toBe(true);
    for (const v of ['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'] as const) {
      expect(usualMonthShort(shape('fits_unspent', v))).toBe(true);
      expect(usualMonthShort(shape('not_yet', v))).toBe(true);
    }
    expect(usualMonthShort(shape('fits_month'))).toBe(false);
    expect(usualMonthShort(shape('fits_month', 'tight'))).toBe(false);
    expect(usualMonthShort(shape('not_yet', 'not_covered'))).toBe(false);
    expect(usualMonthShort(shape('needs_input'))).toBe(false);
    expect(usualMonthShort(shape('monthly_short', null, { ready: false, missing: ['past_month_missing'] }))).toBe(false);
    expect(usualMonthShort(shape('monthly_short', null, { ready: true, missing: [] }))).toBe(true);
  });

  it('the fact carries the country and the name, and only when both rules hold', () => {
    expect(freeHelpFacts(shape('monthly_short'), 'US')).toEqual([{ code: 'free_help', values: { country: 'US', name: 'NFCC' } }]);
    expect(freeHelpFacts(shape('monthly_short'), null)).toEqual([]);
    expect(freeHelpFacts(shape('monthly_short'), 'FR')).toEqual([]);
    expect(freeHelpFacts(shape('fits_month'), 'GB')).toEqual([]);
  });

  it('every D-65 tier in the UK ends with the pointer; the same answers with no region carry none', () => {
    for (const t of Object.values(TIER_CASES)) {
      const { inputs, check } = rileyTier(t);
      const none = evaluate(inputs, check).result;
      const uk = evaluate({ ...inputs, region: 'GB' }, check).result;
      expect(usualMonthShort(uk)).toBe(true);
      expect(none.facts.some((f) => f.code === 'free_help')).toBe(false);
      expect(uk.facts.at(-1)).toEqual({ code: 'free_help', values: { country: 'GB', name: 'MoneyHelper' } });
      expect(uk.facts.slice(0, -1)).toEqual(none.facts);
    }
  });

  it('I76 the pointer never changes the answer: US with no state reads like no region, apart from the one fact', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs0, check) => {
        const inputs: V3Inputs = { ...inputs0, regionSubdivision: null };
        const plain = evaluate({ ...inputs, region: null }, check).result;
        const us = evaluate({ ...inputs, region: 'US' }, check).result;
        const help = us.facts.filter((f) => f.code === 'free_help');
        expect(help).toEqual(freeHelpFacts(us, 'US'));
        expect({ ...us, facts: us.facts.filter((f) => f.code !== 'free_help') }).toEqual(plain);
      }),
      { numRuns: fcRuns(200), seed: 0x0576 }
    );
  });
});
