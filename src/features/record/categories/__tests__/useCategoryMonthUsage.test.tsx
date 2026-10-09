import { renderHook } from '@testing-library/react-native';
import type { CategoryRow } from '@/db/rows';
import { useCategoryMonthUsage, usageSubLabel } from '../useCategoryMonthUsage';

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

function cat(id: string, cap: number | null): CategoryRow {
  return { id, monthly_cap: cap } as CategoryRow;
}
function line(categoryId: string | null, amountHome: number | null, over: Record<string, unknown> = {}) {
  return { category_id: categoryId, amountHome, status: 'paid', transfer_id: null, is_refund: false, ...over };
}

describe('useCategoryMonthUsage', () => {
  it('groups the month by category, counts paid and pending, nets refunds, skips transfers and skipped', async () => {
    mockCats = [cat('a', 30000), cat('b', null), cat('c', null)];
    mockRows = [
      line('a', -20000),
      line('a', -5000, { status: 'pending' }),
      line('a', 1000, { is_refund: true }),
      line('a', -9999, { status: 'skipped' }),
      line('a', -7777, { transfer_id: 't1' }),
      line('b', -100),
      line(null, -500),
    ];
    const { result } = await renderHook(() => useCategoryMonthUsage());
    const captured = result.current.usage;
    expect(captured.get('a')).toMatchObject({ count: 3, spent: 24000, cap: 30000, state: 'capped' });
    expect(captured.get('b')).toMatchObject({ count: 1, state: 'used' });
    expect(captured.get('c')).toMatchObject({ count: 0, state: 'unused' });
  });
});

describe('usageSubLabel', () => {
  const fmt = (m: number) => `£${(m / 100).toFixed(2)}`;
  const t = ((key: string, p?: Record<string, unknown>) => `${key}|${JSON.stringify(p ?? {})}`) as never;
  const base = { count: 1, spent: 0, cap: null, over: 0, unconvertedCount: 0 };

  it('maps each state to its wording and tone', () => {
    expect(usageSubLabel({ ...base, state: 'unused', count: 0 }, fmt, t).text).toContain('categories.usage.unused');
    expect(usageSubLabel({ ...base, state: 'used', count: 2 }, fmt, t)).toMatchObject({ tone: 'inkMuted' });
    expect(usageSubLabel({ ...base, state: 'capped', spent: 21500, cap: 30000 }, fmt, t).text).toContain('"spent":"£215.00","cap":"£300.00"');
    const over = usageSubLabel({ ...base, state: 'over', spent: 31000, cap: 30000, over: 1000 }, fmt, t);
    expect(over.tone).toBe('warn1');
    expect(over.text).toContain('"over":"£10.00"');
    const refunds = usageSubLabel({ ...base, state: 'refundsExceed', spent: -2000 }, fmt, t);
    expect(refunds.tone).toBe('inkMuted');
    expect(refunds.text).toContain('"amount":"£20.00"');
  });
});
