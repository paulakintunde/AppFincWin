import { renderHook } from '@testing-library/react-native';
import type { CategoryRow } from '@/db/rows';
import { useCategoryMonthUsage } from '../useCategoryMonthUsage';

let mockRows: Record<string, unknown>[] = [];
let mockCats: CategoryRow[] = [];

jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({ rows: mockRows, isLoading: false }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: mockCats }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'GBP', today: '2026-10-09' }),
}));

const cat = (id: string, cap: number | null) => ({ id, monthly_cap: cap }) as CategoryRow;
function split(over: Record<string, unknown>) {
  return {
    id: 'l1',
    category_id: 'groceries',
    original_amount: -5000,
    amountHome: -5000,
    status: 'paid',
    transfer_id: null,
    is_refund: false,
    category_parts: [
      { c: 'groceries', a: -3000 },
      { c: 'dining', a: -2000 },
    ],
    ...over,
  };
}

describe('useCategoryMonthUsage with parts (10.1-10, D-05)', () => {
  it('counts each category part, not the whole split line', async () => {
    mockCats = [cat('groceries', 4000), cat('dining', null)];
    mockRows = [split({})];
    const { result } = await renderHook(() => useCategoryMonthUsage());
    expect(result.current.usage.get('groceries')).toMatchObject({ spent: 3000, state: 'capped' });
    expect(result.current.usage.get('dining')).toMatchObject({ spent: 2000 });
  });

  it('converts parts to home currency by largest remainder', async () => {
    mockCats = [cat('groceries', null), cat('dining', null)];
    mockRows = [split({ amountHome: -6250 })];
    const { result } = await renderHook(() => useCategoryMonthUsage());
    expect(result.current.usage.get('groceries')).toMatchObject({ spent: 3750 });
    expect(result.current.usage.get('dining')).toMatchObject({ spent: 2500 });
  });

  it('does not add a gap to any capped category', async () => {
    mockCats = [cat('groceries', null), cat('dining', null)];
    mockRows = [split({ category_parts: [{ c: 'groceries', a: -3000 }, { c: 'dining', a: -1000 }] })];
    const { result } = await renderHook(() => useCategoryMonthUsage());
    expect(result.current.usage.get('groceries')).toMatchObject({ spent: 3000 });
    expect(result.current.usage.get('dining')).toMatchObject({ spent: 1000 });
  });

  it('keeps a line with no home figure as before', async () => {
    mockCats = [cat('groceries', null)];
    mockRows = [split({ amountHome: null }), split({ id: 'l2', category_id: null, amountHome: null, category_parts: null })];
    const { result } = await renderHook(() => useCategoryMonthUsage());
    expect(result.current.usage.get('groceries')).toMatchObject({ count: 1, unconvertedCount: 1 });
  });
});
