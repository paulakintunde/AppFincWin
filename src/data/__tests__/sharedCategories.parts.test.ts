// 10.1-16 (D-05): shared split lines show each part in the viewer's category; member picks apply to unsplit lines only.
import { resolveSharedRows, sharedCategoryResolution, applySharedCategories } from '../sharedCategories';

const OWN = [{ id: 'a-groc', builtin_key: 'Groceries' }];
const PARTNER = [
  { id: 's-groc', owner_id: 'sam', builtin_key: 'Groceries', name: null, color_key: null, icon_key: null },
  { id: 's-pets', owner_id: 'sam', builtin_key: null, name: 'Pets', color_key: null, icon_key: null },
];
type R = { id: string; category_id: string | null; is_shared: boolean; category_parts?: { c: string | null; a: number }[] | null };
const split = (over: Partial<R> = {}): R => ({
  id: 'l1',
  category_id: 's-groc',
  is_shared: true,
  category_parts: [{ c: 's-groc', a: -3000 }, { c: 's-pets', a: -2000 }],
  ...over,
});
const res = (picks: { transaction_id: string; category_id: string }[] = []) => sharedCategoryResolution(OWN, PARTNER, picks);

describe('resolveSharedRows with parts (10.1-16)', () => {
  it('maps each part through the builtin match and leaves a custom partner category alone', () => {
    const [out] = resolveSharedRows([split()], res());
    expect(out).toMatchObject({ category_id: 'a-groc', category_parts: [{ c: 'a-groc', a: -3000 }, { c: 's-pets', a: -2000 }] });
  });

  it('ignores the viewer pick on a split row but still honours it on an unsplit row', () => {
    const picks = [{ transaction_id: 'l1', category_id: 'a-groc' }, { transaction_id: 'u1', category_id: 'a-groc' }];
    const [s] = resolveSharedRows([split({ category_id: 's-pets' })], res(picks));
    expect(s!.category_id).toBe('s-pets');
    expect(s!.category_parts![0]!.c).toBe('a-groc');
    const [u] = resolveSharedRows([{ id: 'u1', category_id: 's-pets', is_shared: true }], res(picks));
    expect(u!.category_id).toBe('a-groc');
  });

  it('returns the same object when nothing changes, and the same array', () => {
    const own = split({ category_id: 'a-groc', category_parts: [{ c: 'a-groc', a: -3000 }, { c: null, a: -2000 }] });
    const rows = [own];
    expect(resolveSharedRows(rows, res())[0]).toBe(own);
    expect(resolveSharedRows(rows, res())).toBe(rows);
  });

  it('a split row whose parts are unchanged but whose line category changes is rewritten', () => {
    const [out] = resolveSharedRows([split({ category_parts: [{ c: 'a-groc', a: -3000 }, { c: null, a: -2000 }] })], res());
    expect(out!.category_id).toBe('a-groc');
  });

  it('a one-part list is treated as an unsplit line; an unshared split row is untouched', () => {
    const one = split({ category_parts: [{ c: 's-groc', a: -5000 }] });
    expect(resolveSharedRows([one], res([{ transaction_id: 'l1', category_id: 'a-groc' }]))[0]!.category_id).toBe('a-groc');
    const mine = split({ is_shared: false });
    expect(resolveSharedRows([mine], res())[0]).toBe(mine);
  });

  it('gathers the original ids under the resolved id (including a null part category)', () => {
    const sources = new Map<string, Set<string>>();
    resolveSharedRows([split({ category_parts: [{ c: 's-groc', a: -3000 }, { c: null, a: -2000 }] })], res(), sources);
    expect([...sources.get('a-groc')!].sort()).toEqual(['a-groc', 's-groc']);
    resolveSharedRows([split()], res());
  });

  it('works without a sources map and through applySharedCategories', () => {
    const out = applySharedCategories({ rows: [split()], upcomingRows: [], series: [], categories: { 'a-groc': 'Groceries' } }, res());
    expect(out.rows[0]!.category_parts![0]!.c).toBe('a-groc');
    expect(out.categorySourceIds['a-groc']).toContain('s-groc');
  });
});
