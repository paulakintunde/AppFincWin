import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { CategoryRow } from '@/db/rows';
import type { CategoryRuleRow } from '@/db/categoryRules';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { RuleSheet } from '../RuleSheet';
import { RulesScreen } from '../RulesScreen';
import { CategoriesScreen } from '../CategoriesScreen';

jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() } }));

const mockAdd = jest.fn(() => ({ id: 'r-new', stepId: 'add-step' }));
const mockEdit = jest.fn(() => 'edit-step');
const mockRemove = jest.fn(() => 'remove-step');
jest.mock('@/data/mutations/categoryRules', () => ({
  useAddRule: () => ({ add: mockAdd }),
  useEditRule: () => ({ edit: mockEdit }),
  useRemoveRule: () => ({ remove: mockRemove }),
}));

jest.mock('@/data/mutations/categories', () => ({
  useAddCategory: () => ({ add: jest.fn() }),
  useEditCategory: () => ({ edit: jest.fn() }),
  useArchiveCategory: () => ({ archive: jest.fn(), restore: jest.fn() }),
  useMergeCategory: () => ({ merge: jest.fn() }),
}));

function cat(over: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'c1',
    monthly_cap: null,
    is_sample: false,
    owner_id: 'u1',
    builtin_key: null,
    name: 'Groceries',
    color_key: 'teal',
    is_system: false,
    archived_at: null,
    version: 2,
    updated_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}
const mockCats = [cat(), cat({ id: 'c2', name: 'Fuel', color_key: 'rust' })];
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    all: mockCats,
    active: mockCats,
    byId: new Map(mockCats.map((c) => [c.id, c])),
    builtinIds: new Map(),
    loading: false,
  }),
  useCategoryUsage: () => ({ count: 0, capped: false, isLoading: false }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    today: '2026-10-09',
  }),
}));
jest.mock('@/data/queries/activity', () => ({ useMonthView: () => ({ rows: [], isLoading: false }) }));

function rule(over: Partial<CategoryRuleRow> = {}): CategoryRuleRow {
  return {
    id: 'r1',
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
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

let mockRules: CategoryRuleRow[] = [];
let mockByRuleId = new Map<string, string>();
jest.mock('@/features/record/useGuessContext', () => ({
  useGuessContext: () => ({
    rules: mockRules,
    resolved: { byRuleId: mockByRuleId, unresolvedIds: new Set() },
    rulesStatus: 'ready',
  }),
}));

const mockRefetch = jest.fn();
let mockQuery: Record<string, unknown> = {};
jest.mock('@/data/queries/categoryRules', () => ({
  useCategoryRules: () => mockQuery,
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockRules = [];
  mockByRuleId = new Map();
  mockQuery = { data: [], isLoading: false, isError: false, refetch: mockRefetch };
});

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;

// One render per test: a second render leaks an act() scope in this project's Jest setup.
describe('RuleSheet: new', () => {
  it('shows the keyword and category errors for an empty form and writes nothing', async () => {
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    expect(u.getByText('New rule')).toBeTruthy();
    await fireEvent.press(u.getByText('Save rule'));
    expect(u.getByText('Type a word to match.')).toBeTruthy();
    expect(u.getByText('Pick a category.')).toBeTruthy();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('refuses a keyword over 60 characters', async () => {
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    await fireEvent.changeText(u.getByLabelText('Description contains'), 'a'.repeat(61));
    await fireEvent.press(u.getByText('Save rule'));
    expect(u.getByText('Use 60 characters or fewer.')).toBeTruthy();
  });

  it('flags a duplicate keyword in the same scope', async () => {
    mockRules = [rule()];
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    await fireEvent.changeText(u.getByLabelText('Description contains'), ' TESCO ');
    await fireEvent.press(u.getByText('Save rule'));
    expect(u.getByText('There’s already a rule for “TESCO”.')).toBeTruthy();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('allows the same keyword in the other scope, and shows the scope helpers', async () => {
    mockRules = [rule()];
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    expect(u.getByText('Only your entries use this rule.')).toBeTruthy();
    await fireEvent.press(u.getByText('Shared'));
    expect(u.getByText('Everyone in the household uses it and can change it.')).toBeTruthy();
    await fireEvent.changeText(u.getByLabelText('Description contains'), 'Tesco');
    await fireEvent.press(u.getByLabelText('Category'));
    await fireEvent.press(u.getByLabelText('Groceries'));
    await fireEvent.press(u.getByText('Save rule'));
    expect(mockAdd).toHaveBeenCalledWith({
      ownerId: 'u1',
      householdId: 'h1',
      scope: 'shared',
      keyword: 'Tesco',
      category: mockCats[0],
    });
  });

  it('offers no Uncategorised row in the category picker', async () => {
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    await fireEvent.press(u.getByLabelText('Category'));
    expect(u.getByLabelText('Fuel')).toBeTruthy();
    expect(u.queryByText('Uncategorised')).toBeNull();
  });

  it('adds a valid rule, shows the Undo toast and closes', async () => {
    const onClose = jest.fn();
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={onClose} />));
    await fireEvent.changeText(u.getByLabelText('Description contains'), '  Tesco ');
    await fireEvent.press(u.getByLabelText('Category'));
    await fireEvent.press(u.getByLabelText('Groceries'));
    await fireEvent.press(u.getByText('Save rule'));
    expect(mockAdd).toHaveBeenCalledWith({
      ownerId: 'u1',
      householdId: 'h1',
      scope: 'personal',
      keyword: 'Tesco',
      category: mockCats[0],
    });
    expect(getToast()?.stepId).toBe('add-step');
    expect(getToast()?.text?.key).toBe('undo.label.ruleAdded');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RuleSheet: edit', () => {
  const sharedRule = rule({
    id: 'r2',
    scope: 'shared',
    owner_id: null,
    household_id: 'h1',
    category_id: null,
    target_name: 'Groceries',
  });

  it('shows the scope as fixed and saves only the changed keyword', async () => {
    const u = await render(
      wrap(<RuleSheet visible mode={{ kind: 'edit', rule: sharedRule, categoryId: 'c1' }} onClose={jest.fn()} />)
    );
    expect(u.getByText('Edit rule')).toBeTruthy();
    expect(u.getByText('This can’t change once the rule is made.')).toBeTruthy();
    expect(u.queryByText('Save rule')).toBeNull();
    await fireEvent.changeText(u.getByLabelText('Description contains'), 'Tesco Extra');
    await fireEvent.press(u.getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledWith(sharedRule, { keyword: 'Tesco Extra' }, { userId: 'u1', householdId: 'h1' });
    expect(getToast()?.stepId).toBe('edit-step');
    expect(getToast()?.text?.key).toBe('undo.label.ruleEdited');
  });

  it('removes with a destructive toast and no confirm', async () => {
    const r = rule();
    const onClose = jest.fn();
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'edit', rule: r, categoryId: 'c1' }} onClose={onClose} />));
    await fireEvent.press(u.getByText('Remove rule'));
    expect(mockRemove).toHaveBeenCalledWith(r, { userId: 'u1', householdId: 'h1' });
    expect(getToast()?.kind).toBe('destructive');
    expect(getToast()?.text?.key).toBe('undo.label.ruleRemoved');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RulesScreen', () => {
  it('shows the empty state when there are no rules', async () => {
    const u = await render(wrap(<RulesScreen />));
    expect(u.getByText('No rules yet.')).toBeTruthy();
  });

  it('lists Just me then Shared, A-Z, with resolved and unresolved rows', async () => {
    mockRules = [
      rule({ id: 'b', keyword: 'Shell', keyword_norm: 'shell', category_id: 'c2' }),
      rule({ id: 'a', keyword: 'Tesco', keyword_norm: 'tesco' }),
      rule({
        id: 's',
        scope: 'shared',
        owner_id: null,
        household_id: 'h1',
        category_id: null,
        target_name: 'Gym',
        keyword: 'Pure',
        keyword_norm: 'pure',
      }),
    ];
    mockByRuleId = new Map([
      ['a', 'c1'],
      ['b', 'c2'],
    ]);
    const u = await render(wrap(<RulesScreen />));
    expect(u.getByText('Add rule')).toBeTruthy();
    const labels = u.getAllByText(/^(Shell|Tesco|Pure|Just me|Shared with household)$/).map((n) => n.props.children);
    expect(labels).toEqual(['Just me', 'Shell', 'Tesco', 'Shared with household', 'Pure']);
    expect(u.getByLabelText('Description contains Tesco, category Groceries, Just me')).toBeTruthy();
    expect(u.getByText('Gym · not in your categories')).toBeTruthy();
    expect(
      u.getByLabelText('Description contains Pure, category Gym, Shared with household, not in your categories')
    ).toBeTruthy();
  });

  it('shows the loading line on first load without a cache', async () => {
    mockQuery = { data: undefined, isLoading: true, isError: false, refetch: mockRefetch };
    const u = await render(wrap(<RulesScreen />));
    expect(u.getByText('Loading rules…')).toBeTruthy();
  });

  it('shows the error with Try again when there is no cache', async () => {
    mockQuery = { data: undefined, isLoading: false, isError: true, refetch: mockRefetch };
    const u = await render(wrap(<RulesScreen />));
    expect(u.getByText('Rules couldn’t load.')).toBeTruthy();
    await fireEvent.press(u.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('keeps cached rows and shows no error line when a refetch fails', async () => {
    mockRules = [rule()];
    mockByRuleId = new Map([['r1', 'c1']]);
    mockQuery = { data: mockRules, isLoading: false, isError: true, refetch: mockRefetch };
    const u = await render(wrap(<RulesScreen />));
    expect(u.getByText('Tesco')).toBeTruthy();
    expect(u.queryByText('Rules couldn’t load.')).toBeNull();
  });

  it('opens the edit sheet from a row', async () => {
    mockRules = [rule()];
    mockByRuleId = new Map([['r1', 'c1']]);
    const u = await render(wrap(<RulesScreen />));
    await fireEvent.press(u.getByLabelText('Description contains Tesco, category Groceries, Just me'));
    expect(u.getByText('Edit rule')).toBeTruthy();
  });

  it('opens the new rule sheet from Add rule', async () => {
    const u = await render(wrap(<RulesScreen />));
    await fireEvent.press(u.getByText('Add rule'));
    expect(u.getByText('New rule')).toBeTruthy();
  });
});

describe('CategoriesScreen Rules row', () => {
  it('shows the entry sub-label with no rules and opens /category-rules', async () => {
    const u = await render(wrap(<CategoriesScreen />));
    expect(u.getByText('Fill in a category from the description')).toBeTruthy();
    await fireEvent.press(u.getByText('Rules'));
    expect(mockPush).toHaveBeenCalledWith('/category-rules');
  });

  it('shows the rule count', async () => {
    mockRules = [rule(), rule({ id: 'r2', keyword: 'Shell', keyword_norm: 'shell' })];
    const u = await render(wrap(<CategoriesScreen />));
    expect(u.getByText('2 rules')).toBeTruthy();
  });
});
