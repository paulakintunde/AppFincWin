// 02.3-09: useGuessContext resolves rules to the member's categories and builds the learned map.
import { renderHook } from '@testing-library/react-native';
import type { CategoryRuleRow } from '@/db/categoryRules';
import type { CategoryRow } from '@/db/rows';
import { DEFAULT_KEYWORD_RULES } from '@/engine/categorize';
import { useGuessContext } from '../useGuessContext';

let mockRules: { data?: CategoryRuleRow[]; isError: boolean; isSuccess: boolean };
let mockNames: { data?: { name: string; category_id: string; updated_at: string }[] };
let mockCategories: CategoryRow[];

jest.mock('../useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'hh1' }),
}));
jest.mock('@/i18n', () => ({ useT: () => (key: string) => key.split('.').pop() }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: mockCategories, builtinIds: new Map([['Groceries', 'g1']]) }),
}));
jest.mock('@/data/queries/categoryRules', () => ({
  useCategoryRules: () => mockRules,
  useCategorisedNames: () => mockNames,
}));

const cat = (id: string, overrides: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  owner_id: 'u1',
  builtin_key: null,
  name: id,
  color_key: 'green',
  is_system: false,
  archived_at: null,
  monthly_cap: null,
  is_sample: false,
  version: 1,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const rule = (id: string, overrides: Partial<CategoryRuleRow> = {}): CategoryRuleRow => ({
  id,
  scope: 'personal',
  owner_id: 'u1',
  household_id: null,
  created_by: 'u1',
  keyword: 'Tesco',
  keyword_norm: 'tesco',
  category_id: 'c1',
  target_builtin_key: null,
  target_name: null,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  mockCategories = [cat('c1'), cat('c9'), cat('g1', { builtin_key: 'Groceries', name: null })];
  mockNames = { data: [{ name: 'Tesco Express', category_id: 'c9', updated_at: '2026-10-01T00:00:00Z' }] };
  mockRules = {
    data: [rule('r1'), rule('r2', { scope: 'shared', keyword: 'Aldi', keyword_norm: 'aldi', category_id: null, target_builtin_key: 'Groceries' })],
    isError: false,
    isSuccess: true,
  };
});

describe('useGuessContext', () => {
  it('resolves personal and shared rules and builds the learned map', async () => {
    const { result } = await renderHook(() => useGuessContext());
    const { guess, rulesStatus } = result.current;
    expect(guess.personalRules).toEqual([{ keywordNorm: 'tesco', categoryId: 'c1' }]);
    expect(guess.sharedRules).toEqual([{ keywordNorm: 'aldi', categoryId: 'g1' }]);
    expect(guess.learned.get('tesco express')).toBe('c9');
    expect(guess.keywordRules).toBe(DEFAULT_KEYWORD_RULES);
    expect(rulesStatus).toBe('ready');
  });

  it('does not learn archived or system categories', async () => {
    mockCategories = [
      cat('c1'),
      cat('c9', { archived_at: '2026-10-01T00:00:00Z' }),
      cat('s1', { is_system: true }),
      cat('g1', { builtin_key: 'Groceries', name: null }),
    ];
    mockNames = {
      data: [
        { name: 'Costa', category_id: 'c9', updated_at: '2026-10-01T00:00:00Z' },
        { name: 'Settle up', category_id: 's1', updated_at: '2026-10-01T00:00:00Z' },
        { name: 'Pret', category_id: 'c1', updated_at: '2026-10-01T00:00:00Z' },
      ],
    };
    const { result } = await renderHook(() => useGuessContext());
    expect(result.current.guess.learned.has('costa')).toBe(false);
    expect(result.current.guess.learned.has('settle up')).toBe(false);
    expect(result.current.guess.learned.get('pret')).toBe('c1');
  });

  it('degrades to no rules when the rules query errors', async () => {
    mockRules = { data: undefined, isError: true, isSuccess: false };
    const { result } = await renderHook(() => useGuessContext());
    expect(result.current.guess.personalRules).toEqual([]);
    expect(result.current.guess.sharedRules).toEqual([]);
    expect(result.current.rulesStatus).toBe('error');
    expect(result.current.guess.learned.size).toBe(1);
  });

  it('reports a shared rule naming a category the member lacks as unresolved', async () => {
    mockRules = {
      data: [rule('r3', { scope: 'shared', category_id: null, target_name: 'Gym' })],
      isError: false,
      isSuccess: true,
    };
    const { result } = await renderHook(() => useGuessContext());
    expect(result.current.resolved.unresolvedIds.has('r3')).toBe(true);
  });
});
