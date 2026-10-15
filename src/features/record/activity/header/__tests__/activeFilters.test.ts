import type { TFunction } from 'i18next';
import { EMPTY_FILTER, type ActivityFilter } from '@/engine/activity';
import {
  clearAllExceptUnpaid,
  clearOne,
  countActiveFilters,
  filterChipModels,
  type ChipLabelDeps,
} from '../activeFilters';

const t = ((k: string, p?: object) => (p ? `${k}|${JSON.stringify(p)}` : k)) as unknown as TFunction;

const names: Record<string, string> = { c1: 'Groceries', a1: 'Cash' };
const deps: ChipLabelDeps = {
  categoryName: (id) => (id === 'c1' ? 'Groceries' : ''),
  accountName: (id) => (id === 'a1' ? 'Cash' : ''),
  formatAmount: (n) => `$${n}`,
  t,
};
void names;

const f = (o: Partial<ActivityFilter>): ActivityFilter => ({ ...EMPTY_FILTER, ...o });

describe('countActiveFilters', () => {
  it('is 0 for empty and for Unpaid alone (D-57)', () => {
    expect(countActiveFilters(EMPTY_FILTER)).toBe(0);
    expect(countActiveFilters(f({ unpaidOnly: true }))).toBe(0);
  });
  it('counts each kind once', () => {
    expect(countActiveFilters(f({ categoryIds: ['c1'] }))).toBe(1);
    expect(countActiveFilters(f({ accountIds: ['a1'] }))).toBe(1);
    expect(countActiveFilters(f({ amountMin: 2000 }))).toBe(1);
    expect(countActiveFilters(f({ amountMax: 10000 }))).toBe(1);
    expect(countActiveFilters(f({ amountMin: 2000, amountMax: 10000 }))).toBe(1);
    expect(countActiveFilters(f({ direction: 'out' }))).toBe(1);
    expect(countActiveFilters(f({ direction: 'transfers' }))).toBe(1);
  });
  it('counts all four kinds and ignores Unpaid', () => {
    expect(
      countActiveFilters(
        f({ categoryIds: ['c1'], accountIds: ['a1'], amountMin: 1, direction: 'in', unpaidOnly: true })
      )
    ).toBe(4);
  });
  it('counts a non-null empty category array', () => {
    expect(countActiveFilters(f({ categoryIds: [] }))).toBe(1);
    expect(filterChipModels(f({ categoryIds: [] }), deps)).toEqual([
      { kind: 'category', label: 'activity.filter.category' },
    ]);
  });
});

describe('filterChipModels', () => {
  it('orders category, account, amount, direction', () => {
    const models = filterChipModels(
      f({ direction: 'in', amountMax: 5, accountIds: ['a1'], categoryIds: ['c1'] }),
      deps
    );
    expect(models.map((m) => m.kind)).toEqual(['category', 'account', 'amount', 'direction']);
  });
  it('labels categories', () => {
    expect(filterChipModels(f({ categoryIds: ['c1'] }), deps)[0]!.label).toBe('Groceries');
    expect(filterChipModels(f({ categoryIds: ['c1', 'c2', 'c3'] }), deps)[0]!.label).toBe(
      t('activity.filterChip.more', { label: 'Groceries', count: 2 })
    );
    expect(filterChipModels(f({ categoryIds: [null] }), deps)[0]!.label).toBe('record.sheet.uncategorised');
    expect(filterChipModels(f({ categoryIds: ['gone'] }), deps)[0]!.label).toBe('activity.filter.category');
  });
  it('WR-05: counts the whole selection, Uncategorised and unknown first ids included', () => {
    const label = (ids: (string | null)[]) => filterChipModels(f({ categoryIds: ids }), deps)[0]!.label;
    expect(label([null, 'c1'])).toBe(t('activity.filterChip.more', { label: 'record.sheet.uncategorised', count: 1 }));
    expect(label(['c1', null])).toBe(t('activity.filterChip.more', { label: 'Groceries', count: 1 }));
    expect(label(['gone', 'c1', 'c3'])).toBe(t('activity.filterChip.more', { label: 'Groceries', count: 2 }));
    expect(filterChipModels(f({ accountIds: ['gone', 'a1'] }), deps)[0]!.label).toBe(
      t('activity.filterChip.more', { label: 'Cash', count: 1 })
    );
  });
  it('labels accounts', () => {
    expect(filterChipModels(f({ accountIds: ['a1'] }), deps)[0]!.label).toBe('Cash');
    expect(filterChipModels(f({ accountIds: ['a1', 'a2'] }), deps)[0]!.label).toBe(
      t('activity.filterChip.more', { label: 'Cash', count: 1 })
    );
    expect(filterChipModels(f({ accountIds: ['gone'] }), deps)[0]!.label).toBe('activity.filter.account');
  });
  it('labels amounts', () => {
    expect(filterChipModels(f({ amountMin: 2000, amountMax: 10000 }), deps)[0]!.label).toBe(
      t('activity.filterChip.amountRange', { min: '$2000', max: '$10000' })
    );
    expect(filterChipModels(f({ amountMin: 2000 }), deps)[0]!.label).toBe(
      t('activity.filterChip.amountMin', { amount: '$2000' })
    );
    expect(filterChipModels(f({ amountMax: 10000 }), deps)[0]!.label).toBe(
      t('activity.filterChip.amountMax', { amount: '$10000' })
    );
  });
  it('labels directions and skips all / Unpaid', () => {
    expect(filterChipModels(f({ direction: 'in' }), deps)[0]!.label).toBe('activity.filter.in');
    expect(filterChipModels(f({ direction: 'out' }), deps)[0]!.label).toBe('activity.filter.out');
    expect(filterChipModels(f({ direction: 'transfers' }), deps)[0]!.label).toBe('activity.filter.transfers');
    expect(filterChipModels(f({ direction: 'all' }), deps)).toEqual([]);
    expect(filterChipModels(f({ unpaidOnly: true }), deps)).toEqual([]);
  });
});

describe('clearOne / clearAllExceptUnpaid', () => {
  const full = f({
    categoryIds: ['c1'],
    accountIds: ['a1'],
    amountMin: 1,
    amountMax: 9,
    direction: 'out',
    unpaidOnly: true,
  });
  it('clears one kind and leaves the rest (incl. Unpaid)', () => {
    expect(clearOne(full, 'category')).toEqual({ ...full, categoryIds: null });
    expect(clearOne(full, 'account')).toEqual({ ...full, accountIds: null });
    expect(clearOne(full, 'amount')).toEqual({ ...full, amountMin: null, amountMax: null });
    expect(clearOne(full, 'direction')).toEqual({ ...full, direction: 'all' });
  });
  it('does not mutate its input', () => {
    const copy = JSON.stringify(full);
    clearOne(full, 'category');
    clearAllExceptUnpaid(full);
    expect(JSON.stringify(full)).toBe(copy);
  });
  it('Clear all keeps Unpaid as it was (D-67)', () => {
    expect(clearAllExceptUnpaid(full)).toEqual({ ...EMPTY_FILTER, unpaidOnly: true });
    expect(clearAllExceptUnpaid({ ...full, unpaidOnly: false })).toEqual(EMPTY_FILTER);
  });
});
