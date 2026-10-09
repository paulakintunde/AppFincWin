import { renderHook } from '@testing-library/react-native';
import type { CategoryUsageResult } from '@/engine/categorize';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { useCapCrossing } from '../useCapCrossing';

const mockWarning = jest.fn();
let mockUsage = new Map<string, CategoryUsageResult>();

jest.mock('@/ui/haptics', () => ({ hapticWarning: () => mockWarning() }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({
  useCategoryMonthUsage: () => ({ usage: mockUsage, isLoading: false }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    all: [
      { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null },
      { id: 'c2', builtin_key: null, name: 'Fun', color_key: 'teal', is_system: false, archived_at: null },
    ],
  }),
}));
jest.mock('@/data/queries/fxLatest', () => ({
  useFxLatest: () => ({ data: [{ quote: 'GBP', rate: '0.86', rate_date: '2026-10-01', source: 'frankfurter-v2' }] }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    today: '2026-10-09',
  }),
}));

function usage(spent: number, cap: number | null): CategoryUsageResult {
  return { count: 1, spent, cap, over: 0, state: 'capped', unconvertedCount: 0 };
}

const line = (over: Partial<Parameters<ReturnType<typeof useCapCrossing>['check']>[0]> = {}) => ({
  categoryId: 'c1',
  localDate: '2026-10-09',
  amountMinor: -3000,
  currency: 'GBP',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockUsage = new Map([['c1', usage(28000, 30000)]]);
});

describe('useCapCrossing', () => {
  it('warns once, with haptic and toast, when a save crosses the cap', async () => {
    const { result } = await renderHook(() => useCapCrossing());
    expect(result.current.check(line())).toBe(true);
    expect(mockWarning).toHaveBeenCalledTimes(1);
    expect(getToast()).toMatchObject({
      kind: 'info',
      text: { key: 'categories.cap.overToast', params: { category: 'Groceries', amount: '£10.00' } },
    });
  });

  it('keeps the Undo step on the toast when one is given', async () => {
    const { result } = await renderHook(() => useCapCrossing());
    result.current.check(line({ stepId: 's1' }));
    expect(getToast()).toMatchObject({ kind: 'ordinary', stepId: 's1' });
  });

  it('stays quiet when the category is already over its cap', async () => {
    mockUsage = new Map([['c1', usage(35000, 30000)]]);
    const { result } = await renderHook(() => useCapCrossing());
    expect(result.current.check(line())).toBe(false);
    expect(mockWarning).not.toHaveBeenCalled();
    expect(getToast()).toBeNull();
  });

  it('stays quiet for a refund that brings spend back down', async () => {
    const { result } = await renderHook(() => useCapCrossing());
    expect(result.current.check(line({ amountMinor: 3000 }))).toBe(false);
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('stays quiet for another month, a category without a cap, or no category', async () => {
    mockUsage = new Map([
      ['c1', usage(28000, 30000)],
      ['c2', usage(28000, null)],
    ]);
    const { result } = await renderHook(() => useCapCrossing());
    expect(result.current.check(line({ localDate: '2026-09-30' }))).toBe(false);
    expect(result.current.check(line({ categoryId: 'c2' }))).toBe(false);
    expect(result.current.check(line({ categoryId: null }))).toBe(false);
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('counts only the change when an edit keeps the category and month', async () => {
    const { result } = await renderHook(() => useCapCrossing());
    // The line was already -2900 in the 28000; editing it to -3000 adds only 100, so no crossing.
    expect(
      result.current.check(
        line({ previous: { categoryId: 'c1', localDate: '2026-10-05', amountMinor: -2900, currency: 'GBP' } })
      )
    ).toBe(false);
    // Moving it from -500 to -3000 adds 2500 and crosses 30000.
    expect(
      result.current.check(
        line({ previous: { categoryId: 'c1', localDate: '2026-10-05', amountMinor: -500, currency: 'GBP' } })
      )
    ).toBe(true);
  });

  it('converts a foreign line with the stored rate and skips it with none', async () => {
    const { result } = await renderHook(() => useCapCrossing());
    // 40.00 EUR at 0.86 is 34.40 GBP: 28000 + 3440 crosses 30000.
    expect(result.current.check(line({ amountMinor: -4000, currency: 'EUR' }))).toBe(true);
    // No stored rate for USD: the check is skipped, never guessed.
    expect(result.current.check(line({ amountMinor: -4000, currency: 'USD' }))).toBe(false);
  });
});
