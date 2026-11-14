// 06.1-79 (H-16, DS-8, OQ-79-1 A): the one rules list Decide home and Setup > Your money rules both show, and the checklist's count.
import type { V3Inputs, V3Series } from '@/engine/decide/v3';
import { growRulesOf, rulesOnOf, rulesShown, seriesMonthlyMinor, shownOnCount } from '../rulesShown';

const series = (over: Record<string, unknown>): V3Series =>
  ({ id: 's', role: 'saving', status: 'live', amount: 10_000, cadence: { unit: 'month', every: 1 }, ...over }) as unknown as V3Series;

const inputs = (s: readonly V3Series[], lines: readonly { on: boolean }[] = []): V3Inputs => ({ series: s, limits: { lines } }) as unknown as V3Inputs;

describe('rulesShown', () => {
  const keep = { id: 'own_keep', kind: 'keep' as const, on: true, value: 30_000, categoryId: null };
  const cap = { id: 'own_cap', kind: 'category_cap' as const, on: false, value: 5_000, categoryId: 'c1' };

  it('lists the debt share, Grow saving and investing, then the own rules in their stored order', () => {
    const shown = rulesShown({ debtPercent: 36, rules: [keep, cap], saving: 80_000, investing: 20_000 });
    expect(shown.map((r) => r.key)).toEqual(['debt', 'saving', 'investing', 'own_keep', 'own_cap']);
    expect(shown[0]).toEqual({ key: 'debt', kind: 'debt', on: true, percent: 36 });
    expect(shown[1]).toEqual({ key: 'saving', kind: 'saving', on: true, amount: 80_000 });
    expect(shown[2]).toEqual({ key: 'investing', kind: 'investing', on: true, amount: 20_000 });
    expect(shown[4]).toEqual({ key: 'own_cap', kind: 'stored', on: false, rule: cap });
    expect(shownOnCount(shown)).toBe(4);
  });

  it('with nothing set: the debt share alone, off, and no rule on (the only case where "No rules" may show)', () => {
    const shown = rulesShown({ debtPercent: null, rules: [], saving: null, investing: null });
    expect(shown).toEqual([{ key: 'debt', kind: 'debt', on: false, percent: null }]);
    expect(shownOnCount(shown)).toBe(0);
  });

  it('DS-8: Grow saving alone is a rule that is on', () => {
    expect(shownOnCount(rulesShown({ debtPercent: null, rules: [], saving: 80_000, investing: null }))).toBe(1);
  });
});

describe('growRulesOf and the checklist count', () => {
  it('sums live saving and investing series a month; weekly spread over 52 weeks', () => {
    expect(seriesMonthlyMinor(series({ amount: 12_000, cadence: { unit: 'month', every: 3 } }))).toBe(4_000);
    expect(seriesMonthlyMinor(series({ amount: 1_200, cadence: { unit: 'week', every: 0 } }))).toBe(5_200);
    const ins = inputs([
      series({ id: 'a', amount: 50_000 }),
      series({ id: 'b', amount: 30_000 }),
      series({ id: 'c', status: 'stopped' }),
      series({ id: 'd', role: 'investing', amount: 20_000 }),
      series({ id: 'e', role: 'bill' }),
    ]);
    expect(growRulesOf(ins)).toEqual({ saving: 80_000, investing: 20_000 });
    expect(growRulesOf(null)).toEqual({ saving: null, investing: null });
    expect(growRulesOf(inputs([]))).toEqual({ saving: null, investing: null });
  });

  it('counts engine lines that are on plus each Grow rule, so the checklist agrees with both lists', () => {
    expect(rulesOnOf(inputs([], [{ on: false }, { on: false }]))).toBe(0);
    expect(rulesOnOf(inputs([series({})], [{ on: false }]))).toBe(1);
    expect(rulesOnOf(inputs([series({}), series({ id: 'i', role: 'investing' })], [{ on: true }, { on: false }]))).toBe(3);
  });
});
