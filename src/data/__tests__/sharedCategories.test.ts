// 07 D-32..D-34 (WR-03): shared lines read under the viewer's category, for Insights and for Decide's builder.
import { categoryTotals } from '@/engine/insights';
import { buildInputs } from '@/features/decide/snapshot/v3/buildInputs';
import { household, row, series } from '@/features/decide/snapshot/__tests__/helpers/sourceFixtures';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import {
  applySharedCategories,
  categoryIdsFor,
  resolveSharedRows,
  resolveSharedSeries,
  sharedCategoryResolution,
  sourceIdsOf,
  type PartnerCategoryRef,
} from '../sharedCategories';

const OWN = [
  { id: 'c-inc', builtin_key: 'Income' },
  { id: 'c-house', builtin_key: 'Housing' },
  { id: 'c-food', builtin_key: 'Groceries' },
  { id: 'c-sav', builtin_key: 'Savings' },
  { id: 'c-custom', builtin_key: null },
];
const partner = (id: string, builtin: string | null, name: string | null = null): PartnerCategoryRef => ({
  id,
  owner_id: 'u2',
  builtin_key: builtin,
  name,
  color_key: 'plum',
  icon_key: null,
});
const P_FOOD = partner('p-food', 'Groceries');
const P_SAV = partner('p-sav', 'Savings');
const P_PETS = partner('p-pets', null, 'Pets');
const P_ODD = partner('p-odd', 'Gifts'); // a built-in the viewer has no category for

describe('sharedCategoryResolution (D-33 order)', () => {
  const res = sharedCategoryResolution(OWN, [P_FOOD, P_SAV, P_PETS, P_ODD], [{ transaction_id: 'picked', category_id: 'c-house' }]);

  it('the viewer’s own pick on the line wins', () => {
    expect(res.line('picked', 'p-food')).toBe('c-house');
    expect(res.line('picked', null)).toBe('c-house');
  });

  it('then the viewer’s own category with the same built-in', () => {
    expect(res.line('x', 'p-food')).toBe('c-food');
    expect(res.category('p-sav')).toBe('c-sav');
  });

  it('then the partner’s category itself', () => {
    expect(res.line('x', 'p-pets')).toBe('p-pets');
    expect(res.line('x', 'p-odd')).toBe('p-odd');
  });

  it('leaves the viewer’s own ids, unknown ids and no category alone', () => {
    expect(res.line('x', 'c-food')).toBe('c-food');
    expect(res.line('x', 'unknown')).toBe('unknown');
    expect(res.line('x', null)).toBeNull();
  });

  it('never treats one of the viewer’s own ids as a partner’s', () => {
    const r = sharedCategoryResolution(OWN, [{ ...P_FOOD, id: 'c-food' }], []);
    expect(r.partners.has('c-food')).toBe(false);
  });

  it('matches the first own category for a built-in', () => {
    const r = sharedCategoryResolution([...OWN, { id: 'c-food-2', builtin_key: 'Groceries' }], [P_FOOD], []);
    expect(r.category('p-food')).toBe('c-food');
  });
});

describe('resolveSharedRows / resolveSharedSeries', () => {
  const res = sharedCategoryResolution(OWN, [P_FOOD, P_PETS], [{ transaction_id: 'own-shared', category_id: 'c-custom' }]);

  it('changes shared lines only, and keeps the same array when nothing changes', () => {
    const rows = [
      { id: 'a', category_id: 'p-food', is_shared: false },
      { id: 'b', category_id: 'c-food', is_shared: true },
    ];
    expect(resolveSharedRows(rows, res)).toBe(rows);
  });

  it('records which stored ids each resolved id gathers', () => {
    const rows = [
      { id: 'a', category_id: 'p-food', is_shared: true },
      { id: 'b', category_id: 'c-food', is_shared: true },
      { id: 'own-shared', category_id: 'c-food', is_shared: true },
    ];
    const sources = new Map<string, Set<string>>();
    const out = resolveSharedRows(rows, res, sources);
    expect(out.map((r) => r.category_id)).toEqual(['c-food', 'c-food', 'c-custom']);
    expect(out[1]).toBe(rows[1]);
    const ids = sourceIdsOf(sources);
    expect(ids).toEqual({ 'c-food': ['c-food', 'p-food'], 'c-custom': ['c-custom', 'c-food'] });
    expect(categoryIdsFor('c-food', ids)).toEqual(['c-food', 'p-food']);
    expect(categoryIdsFor('c-house', ids)).toEqual(['c-house']);
    expect(categoryIdsFor(null, ids)).toEqual([null]);
    expect(categoryIdsFor('c-house', undefined)).toEqual(['c-house']);
  });

  it('a pick that clears to no category records nothing', () => {
    const r = sharedCategoryResolution(OWN, [], []);
    const sources = new Map<string, Set<string>>();
    expect(resolveSharedRows([{ id: 'a', category_id: null, is_shared: true }], r, sources)).toHaveLength(1);
    expect(sourceIdsOf(sources)).toEqual({});
  });

  it('series take the built-in match only; the same array when nothing changes', () => {
    const list = [{ category_id: 'c-food' }, { category_id: null }];
    expect(resolveSharedSeries(list, res)).toBe(list);
    expect(resolveSharedSeries([{ category_id: 'p-food' }], res)).toEqual([{ category_id: 'c-food' }]);
  });
});

// D-34: Decide's builder reads the resolved source. The engine is untouched; only the rows it is handed change.
describe('Decide reads shared lines under the viewer’s category (D-34)', () => {
  const base = household();
  const shared = (id: string, amount: number, categoryId: string) => ({
    ...row({ id, local_date: '2026-09-15', original_amount: amount, category_id: categoryId }),
    created_by: 'u2',
    is_shared: true,
  });
  const sourceWith = (rows: SnapshotSource['rows'], partners: readonly PartnerCategoryRef[], picks: { transaction_id: string; category_id: string }[] = []): SnapshotSource => {
    const parts = applySharedCategories({ rows: [...base.rows, ...rows], upcomingRows: [], series: base.series, categories: base.categories }, sharedCategoryResolution(OWN, partners, picks));
    return { ...base, rows: parts.rows, upcomingRows: parts.upcomingRows, series: parts.series, categories: parts.categories, partnerCategories: parts.partnerCategories, categorySourceIds: parts.categorySourceIds };
  };
  const lineOf = (src: SnapshotSource, id: string) => buildInputs(src, null).months.flatMap((m) => m.lines).find((l) => l.id === id);

  it('a partner’s shared Savings line is saving, not spending', () => {
    const before: SnapshotSource = { ...base, rows: [...base.rows, shared('p-saving', -25_000, 'p-sav')] };
    expect(lineOf(before, 'p-saving')).toBeDefined(); // without resolution: an unknown category, so a spending line
    expect(lineOf(sourceWith([shared('p-saving', -25_000, 'p-sav')], [P_SAV]), 'p-saving')).toBeUndefined();
  });

  it('a partner’s Savings with no own Savings to match still reads as saving', () => {
    const own = OWN.filter((c) => c.builtin_key !== 'Savings');
    const parts = applySharedCategories(
      { rows: [...base.rows, shared('p-saving', -25_000, 'p-sav')], upcomingRows: [], series: base.series, categories: base.categories },
      sharedCategoryResolution(own, [P_SAV], [])
    );
    expect(parts.categories['p-sav']).toBe('Savings');
    expect(lineOf({ ...base, rows: parts.rows, categories: parts.categories }, 'p-saving')).toBeUndefined();
  });

  it('the viewer’s money rule applies to a partner-categorised shared line', () => {
    const src = { ...sourceWith([shared('p-groc', -9_000, 'p-food')], [P_FOOD]), categoryCaps: { 'c-food': 30_000 } };
    const inputs = buildInputs(src, null);
    expect(lineOf(src, 'p-groc')?.categoryId).toBe('c-food');
    expect(inputs.limits.lines.some((l) => l.spec.kind === 'category_monthly_cap' && l.spec.categoryId === 'c-food')).toBe(true);
    const food = categoryTotals(inputs.months, ['2026-09']).rows.find((r) => r.categoryId === 'c-food');
    expect(food?.amount).toBe(49_000); // the viewer's own 400.00 plus the partner's 90.00, under the one rule
    expect(src.categorySourceIds).toEqual({ 'c-food': ['c-food', 'p-food'] });
  });

  it('the viewer’s own pick on the line wins over every match', () => {
    const src = sourceWith([shared('p-groc', -9_000, 'p-food')], [P_FOOD], [{ transaction_id: 'p-groc', category_id: 'c-house' }]);
    expect(lineOf(src, 'p-groc')?.categoryId).toBe('c-house');
  });

  it('a partner’s custom category stays its own, with no money rule', () => {
    const src = { ...sourceWith([shared('p-vet', -5_000, 'p-pets')], [P_PETS]), categoryCaps: { 'c-food': 30_000 } };
    expect(lineOf(src, 'p-vet')?.categoryId).toBe('p-pets');
    expect(src.categories['p-pets']).toBeNull();
    expect(src.partnerCategories?.map((p) => p.id)).toEqual(['p-pets']);
    expect(buildInputs(src, null).limits.lines.some((l) => l.spec.kind === 'category_monthly_cap' && l.spec.categoryId === 'p-pets')).toBe(false);
  });

  it('a shared series under a partner’s Savings is read as a Savings series', () => {
    const s = series({ id: 's-p-sav', amount: -10_000, anchor_date: '2026-06-20', category_id: 'p-sav' });
    const parts = applySharedCategories({ rows: base.rows, upcomingRows: [], series: [...base.series, s], categories: base.categories }, sharedCategoryResolution(OWN, [P_SAV], []));
    expect(parts.series.find((x) => x.id === 's-p-sav')?.category_id).toBe('c-sav');
  });

  it('a household of one: every part comes back as the same object', () => {
    const parts = { rows: base.rows, upcomingRows: base.upcomingRows, series: base.series, categories: base.categories };
    const out = applySharedCategories(parts, sharedCategoryResolution(OWN, [], []));
    expect(out.rows).toBe(base.rows);
    expect(out.upcomingRows).toBe(base.upcomingRows);
    expect(out.series).toBe(base.series);
    expect(out.categories).toBe(base.categories);
    expect(out.categorySourceIds).toEqual({});
  });
});
