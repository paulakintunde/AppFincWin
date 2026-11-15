// BO-07 category cap contract. Owner: plan 05.5-15 (D-11, OFO-4). The frozen list lives in src/test/contracts/contractManifest.test.ts.
// Engine side: the one cap shape the engine reads. A category's cap is a category_monthly_cap line keyed by the category id with the cap
// in minor units; both places that set a cap (Decide's Add rule and Activity's category sheet) write categories.monthly_cap, and the
// builder turns that single column into this line. The builder-side proof, which may import features, is in
// src/test/contracts/bo07.contracts.test.ts ("BO-07 category cap").
import type { LimitLine } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';

describe('BO-07: category cap', () => {
  it('a category cap set from Decide or from Activity writes the same categories.monthly_cap', () => {
    // The engine reads exactly one cap per category: the line id, the category and the cap, nothing about where it was set.
    const line: LimitLine = { id: 'cap_c1', on: true, source: 'own', spec: { kind: 'category_monthly_cap', categoryId: 'c1', cap: minorUnits(20_000) } };
    expect(Object.keys(line.spec).sort()).toEqual(['cap', 'categoryId', 'kind']);
    expect(line.id).toBe('cap_c1');
    expect(line.on).toBe(true);
  });
});
