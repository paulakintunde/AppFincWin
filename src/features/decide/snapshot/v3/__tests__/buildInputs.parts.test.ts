// 10.1-16 (D-04, D-05): category parts through the one builder. Each part counts as its category does.
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../sourceTypes';
import { buildInputs } from '../buildInputs';

const TODAY = '2026-10-03';
type Row = SnapshotSource['rows'][number];
const EVERYDAY = 'demo-acct-everyday';

function mk(id: string, amount: number, over: Partial<Row> = {}): Row {
  return {
    id, account_id: EVERYDAY, local_date: '2026-10-02', original_amount: amount, original_currency: 'USD', home_currency: 'USD', home_amount: amount,
    orig_per_eur: null, status: 'paid', is_refund: false, transfer_id: null, recurring_series_id: null, category_id: 'cat-groceries', deleted_at: null, ...over,
  };
}
const base = demoSource(TODAY);
const categories = { ...base.categories, 'cat-groceries': 'Groceries', 'cat-dining': 'Dining', 'cat-savings': 'Savings', 'cat-transfer': 'Transfer' };
const lineOf = (rows: Row[], id: string, over: Partial<SnapshotSource> = {}) =>
  buildInputs({ ...base, categories, rows: [...base.rows, ...rows], ...over }, null).months.flatMap((m) => m.lines).find((l) => l.id === id);
const p = (c: string | null, a: number) => ({ c, a });

describe('buildInputs with category parts (10.1-16)', () => {
  it('an unsplit line is unchanged and carries no parts', () => {
    expect(lineOf([mk('plain', -10000)], 'plain')).toMatchObject({ amount: 10000, categoryId: 'cat-groceries' });
    expect(lineOf([mk('plain', -10000)], 'plain')).not.toHaveProperty('parts');
  });

  it('a stored one-part list is not a split', () => {
    const l = lineOf([mk('one', -10000, { category_parts: [p('cat-groceries', -10000)] })], 'one');
    expect(l).not.toHaveProperty('parts');
    expect(l!.amount).toBe(10000);
  });

  it('a split line carries absolute parts in order', () => {
    const l = lineOf([mk('s', -8000, { category_parts: [p('cat-groceries', -5000), p('cat-dining', -3000)] })], 's');
    expect(l).toMatchObject({ amount: 8000, categoryId: 'cat-groceries', parts: [{ categoryId: 'cat-groceries', amount: 5000 }, { categoryId: 'cat-dining', amount: 3000 }] });
  });

  it('a Savings part of an outflow is folded away like a Savings line; one category remains', () => {
    const l = lineOf([mk('s', -10000, { category_parts: [p('cat-groceries', -6000), p('cat-savings', -4000)] })], 's');
    expect(l).toMatchObject({ amount: 6000, categoryId: 'cat-groceries' });
    expect(l).not.toHaveProperty('parts');
  });

  it('the largest kept part names the line when its own category was folded away', () => {
    const rows = [mk('s', -10000, { category_id: 'cat-savings', category_parts: [p('cat-savings', -1000), p('cat-groceries', -3000), p('cat-dining', -6000)] })];
    expect(lineOf(rows, 's')).toMatchObject({ amount: 9000, categoryId: 'cat-dining' });
    const tie = [mk('t', -10000, { category_id: 'cat-savings', category_parts: [p('cat-savings', -2000), p('cat-groceries', -4000), p('cat-dining', -4000)] })];
    expect(lineOf(tie, 't')).toMatchObject({ categoryId: 'cat-groceries' });
  });

  it('a Transfer part is neither spending nor income', () => {
    const l = lineOf([mk('s', -10000, { category_parts: [p('cat-groceries', -5000), p('cat-dining', -3000), p('cat-transfer', -2000)] })], 's');
    expect(l).toMatchObject({ amount: 8000, parts: [{ categoryId: 'cat-groceries', amount: 5000 }, { categoryId: 'cat-dining', amount: 3000 }] });
  });

  it('a line whose every part folds away is left out', () => {
    expect(lineOf([mk('s', -10000, { category_parts: [p('cat-savings', -6000), p('cat-transfer', -4000)] })], 's')).toBeUndefined();
  });

  it('a Savings part of an inflow stays, and a Savings split line on a transfer leg is not folded', () => {
    const inflow = lineOf([mk('i', 10000, { category_parts: [p('cat-savings', 6000), p('cat-groceries', 4000)] })], 'i');
    expect(inflow!.parts).toHaveLength(2);
    const leg = lineOf([mk('x', -10000, { transfer_id: 't1', category_parts: [p('cat-savings', -6000), p('cat-groceries', -4000)] })], 'x');
    expect(leg!.parts).toHaveLength(2);
  });

  it('parts convert to the home amount by largest remainder', () => {
    const l = lineOf([mk('u', -10000, { original_currency: 'EUR', home_amount: -12500, category_parts: [p('cat-groceries', -6000), p('cat-dining', -4000)] })], 'u');
    expect(l!.amount).toBe(12500);
    expect(l!.parts!.map((x) => x.amount)).toEqual([7500, 5000]);
  });

  it('a gap stays as an Uncategorised part', () => {
    const l = lineOf([mk('g', -10000, { category_parts: [p('cat-groceries', -5000), p('cat-dining', -3000)] })], 'g');
    expect(l).toMatchObject({ amount: 10000, parts: [{ categoryId: 'cat-groceries', amount: 5000 }, { categoryId: 'cat-dining', amount: 3000 }, { categoryId: null, amount: 2000 }] });
  });

  it('a skipped split line is never a line', () => {
    expect(lineOf([mk('k', -10000, { status: 'skipped', category_parts: [p('cat-groceries', -5000), p('cat-dining', -5000)] })], 'k')).toBeUndefined();
  });
});
