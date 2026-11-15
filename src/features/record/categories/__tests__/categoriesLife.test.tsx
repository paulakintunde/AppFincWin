// 06.2-19 (DSG-01, DSG-07, NAV-06): category icons on every category surface (D-07), the icon picker for a custom
// category (our own set only, never emoji; a tick on pick, D-20), and the rules list's empty state with an icon (D-24).
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { CategoryRow } from '@/db/rows';
import type { CategoryRuleRow } from '@/db/categoryRules';
import { resetToastForTests } from '@/state/undoToast';
import { layOutSheets } from '@/test/sheetLayout';
import { ICONS } from '@/ui/icons/iconData';
import { CUSTOM_CATEGORY_ICONS } from '@/ui/icons/iconFor';
import { categories as categoryWords } from '@/i18n/locales/appLife/categories';
import { CategorySheet } from '../CategorySheet';
import { CategoryIconPicker } from '../CategoryIconPicker';
import { CategoriesScreen } from '../CategoriesScreen';
import { RemoveCategoryPrompt } from '../RemoveCategoryPrompt';
import { RuleSheet } from '../RuleSheet';
import { RulesScreen } from '../RulesScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockTick = jest.fn();
jest.mock('@/ui/haptics', () => ({
  ...jest.requireActual('@/ui/haptics'),
  hapticTick: () => mockTick(),
}));

jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));

const mockAdd = jest.fn((..._a: unknown[]) => ({ id: 'new-cat', stepId: 'add-step' }));
const mockEdit = jest.fn((..._a: unknown[]) => 'edit-step');
jest.mock('@/data/mutations/categories', () => ({
  useAddCategory: () => ({ add: (...a: unknown[]) => mockAdd(...a) }),
  useEditCategory: () => ({ edit: (...a: unknown[]) => mockEdit(...a) }),
  useArchiveCategory: () => ({ archive: jest.fn(), restore: jest.fn() }),
  useMergeCategory: () => ({ merge: jest.fn() }),
}));
jest.mock('@/data/mutations/categoryRules', () => ({
  useAddRule: () => ({ add: jest.fn() }),
  useEditRule: () => ({ edit: jest.fn() }),
  useRemoveRule: () => ({ remove: jest.fn() }),
}));

function cat(over: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'c1',
    monthly_cap: null,
    is_sample: false,
    owner_id: 'u1',
    builtin_key: null,
    name: 'Pets',
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

const custom = cat({ id: 'c1', name: 'Pets', icon_key: 'camera' });
const plain = cat({ id: 'c2', name: 'Fuel', color_key: 'rust' });
const seed = cat({ id: 'c3', name: null, builtin_key: 'Dining', color_key: 'plum' });
const mockCats = [custom, plain, seed];

jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    all: mockCats,
    active: mockCats,
    byId: new Map(mockCats.map((c) => [c.id, c])),
    builtinIds: new Map(),
    loading: false,
  }),
  useCategoryUsage: () => mockUsage,
}));
let mockUsage: Record<string, unknown> = { count: 0, capped: false, isLoading: false };
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
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/data/queries/activity', () => ({ useMonthView: () => ({ rows: [], isLoading: false }) }));

function rule(over: Partial<CategoryRuleRow> = {}): CategoryRuleRow {
  return {
    id: 'r1',
    scope: 'personal',
    owner_id: 'u1',
    household_id: null,
    created_by: 'u1',
    keyword: 'Vet',
    keyword_norm: 'vet',
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
let mockQuery: Record<string, unknown> = {};
jest.mock('@/data/queries/categoryRules', () => ({ useCategoryRules: () => mockQuery }));

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockUsage = { count: 0, capped: false, isLoading: false };
  mockRules = [];
  mockByRuleId = new Map();
  mockQuery = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
});

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;
const glyphs = (name: string) => screen.queryAllByTestId(`glyph-${name}`, { includeHiddenElements: true });

// One render per test: a second render leaks an act() scope in this project's Jest setup.
describe('icons on category surfaces (D-07)', () => {
  it('CategoriesScreen: a seed shows its drawn icon, a custom one its picked icon, one with none its letter', async () => {
    await render(wrap(<CategoriesScreen />));
    expect(glyphs('dining').length).toBeGreaterThanOrEqual(1);
    expect(glyphs('camera').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('F', { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
  });

  it('RemoveCategoryPrompt merge list shows each target icon', async () => {
    mockUsage = { count: 3, capped: false, isLoading: false };
    await render(wrap(<RemoveCategoryPrompt visible category={plain} onCancel={jest.fn()} onDone={jest.fn()} />));
    await layOutSheets();
    await fireEvent.press(screen.getByText('Merge'));
    await layOutSheets();
    expect(glyphs('camera').length).toBe(1);
    expect(glyphs('dining').length).toBe(1);
  });

  it('RuleSheet shows the chosen category icon', async () => {
    await render(wrap(<RuleSheet visible mode={{ kind: 'edit', rule: rule(), categoryId: 'c1' }} onClose={jest.fn()} />));
    await layOutSheets();
    expect(glyphs('camera').length).toBe(1);
  });

  it('RulesScreen rows show the rule category icon', async () => {
    mockRules = [rule()];
    mockByRuleId = new Map([['r1', 'c1']]);
    mockQuery = { data: mockRules, isLoading: false, isError: false, refetch: jest.fn() };
    await render(wrap(<RulesScreen />));
    expect(glyphs('camera').length).toBe(1);
  });

  it('RulesScreen empty uses EmptyState with the categories icon and its words (D-24)', async () => {
    await render(wrap(<RulesScreen />));
    expect(screen.getByText('No rules yet.')).toBeTruthy();
    expect(screen.getByTestId('empty-state-tile', { includeHiddenElements: true })).toBeTruthy();
    expect(glyphs('categories').length).toBe(1);
  });
});

describe('CategoryIconPicker (D-07, D-20)', () => {
  it('offers only our own icons plus the letter, each a radio with a spoken word and a 48 target', async () => {
    await render(
      wrap(<CategoryIconPicker visible colorKey="teal" letter="P" selected="camera" onPick={jest.fn()} onClose={jest.fn()} />)
    );
    await layOutSheets();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(CUSTOM_CATEGORY_ICONS.length + 1);
    for (const icon of CUSTOM_CATEGORY_ICONS) {
      expect(Object.prototype.hasOwnProperty.call(ICONS, icon)).toBe(true);
      const tileEl = screen.getByTestId(`category-icon-${icon}`);
      expect(tileEl.props.accessibilityLabel).toBe(`${categoryWords.iconNames[icon as keyof typeof categoryWords.iconNames]} icon`);
      expect(tileEl.props.accessibilityLabel).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(screen.getByTestId('category-icon-none').props.accessibilityLabel).toBe('Letter icon');
    expect(screen.getByTestId('category-icon-camera').props.accessibilityState).toEqual({ checked: true });
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)) as Record<string, number>;
    expect(flat(screen.getByTestId('category-icon-housing').props.style).width).toBe(48);
    expect(flat(screen.getByTestId('category-icon-housing').props.style).height).toBe(48);
  });

  it('every pickable icon has exactly one word, and no word is an emoji', () => {
    expect(Object.keys(categoryWords.iconNames).sort()).toEqual([...CUSTOM_CATEGORY_ICONS].sort());
    for (const w of Object.values(categoryWords.iconNames)) expect(w).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('picking an icon gives a tick and hands it back', async () => {
    const onPick = jest.fn();
    await render(wrap(<CategoryIconPicker visible colorKey="teal" letter="P" selected={null} onPick={onPick} onClose={jest.fn()} />));
    await layOutSheets();
    await fireEvent.press(screen.getByLabelText('Laptop icon'));
    expect(mockTick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('laptop');
  });
});

describe('CategorySheet icon choice', () => {
  it('a new category picks an icon and saves it as iconKey', async () => {
    await render(wrap(<CategorySheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    await layOutSheets();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Pets');
    await fireEvent.press(screen.getByText('Icon'));
    await layOutSheets();
    await fireEvent.press(screen.getByLabelText('Camera icon'));
    expect(mockTick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Pick an icon')).toBeNull();
    expect(screen.getByText('Camera')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save category'));
    expect(mockAdd).toHaveBeenCalledWith({ ownerId: 'u1', name: 'Pets', colorKey: 'green', iconKey: 'camera' });
  });

  it('choosing Letter on a custom category with an icon saves iconKey null (icon_key cleared)', async () => {
    await render(wrap(<CategorySheet visible mode={{ kind: 'edit', category: custom }} onClose={jest.fn()} />));
    await layOutSheets();
    expect(screen.getByText('Camera')).toBeTruthy();
    await fireEvent.press(screen.getByText('Icon'));
    await layOutSheets();
    await fireEvent.press(screen.getByLabelText('Letter icon'));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledWith(custom, { iconKey: null });
  });

  it('a built-in category has no Icon row and keeps its drawn icon', async () => {
    await render(wrap(<CategorySheet visible mode={{ kind: 'edit', category: seed }} onClose={jest.fn()} />));
    await layOutSheets();
    expect(screen.queryByText('Icon')).toBeNull();
    expect(glyphs('dining').length).toBe(1);
  });
});
