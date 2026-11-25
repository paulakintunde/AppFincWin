import { filterRows, EMPTY_FILTER, type FilterRow } from '../filters';

function row(o: Partial<FilterRow>): FilterRow {
  return {
    id: 'l1',
    category_id: 'groceries',
    account_id: 'a1',
    original_amount: -5000,
    amountHome: -5000,
    name: null,
    note: null,
    transfer_id: null,
    status: 'paid',
    ...o,
  };
}
const split = row({
  parts: [
    { categoryId: 'groceries', amount: -3000 },
    { categoryId: 'dining', amount: -2000 },
  ],
});
const gapped = row({ parts: [{ categoryId: 'groceries', amount: -3000 }, { categoryId: 'dining', amount: -1000 }] });
const f = (ids: (string | null)[]) => ({ ...EMPTY_FILTER, categoryIds: ids });

describe('filterRows with category parts (10.1-10, D-05)', () => {
  it('a split line matches a filter on any of its categories', () => {
    expect(filterRows([split], f(['dining']))).toHaveLength(1);
    expect(filterRows([split], f(['groceries']))).toHaveLength(1);
    expect(filterRows([split], f(['transport']))).toHaveLength(0);
  });
  it('a gap matches the Uncategorised filter, a fully placed split does not', () => {
    expect(filterRows([gapped], f([null]))).toHaveLength(1);
    expect(filterRows([split], f([null]))).toHaveLength(0);
  });
  it('an unsplit line matches on its own category, with or without an id', () => {
    const plain = row({ id: undefined });
    expect(filterRows([plain], f(['groceries']))).toHaveLength(1);
    expect(filterRows([plain], f(['dining']))).toHaveLength(0);
  });
});
