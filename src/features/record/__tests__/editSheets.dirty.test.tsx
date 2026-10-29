// D-26/D-27: every non-entry edit sheet reports unsaved work through Sheet's `dirty` prop, and its own
// Cancel closes it directly. Sheet is swapped for a probe that records the prop; data hooks are mocked.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow, CategoryRow } from '@/db/rows';
import type { CategoryRuleRow } from '@/db/categoryRules';
import { EMPTY_FILTER, type ActivityFilter } from '@/engine/activity/filters';
import { AccountSheet } from '../accounts/AccountSheet';
import { CategorySheet } from '../categories/CategorySheet';
import { RuleSheet } from '../categories/RuleSheet';
import { FilterSheet } from '../activity/FilterSheet';
import { PasteSheet } from '../import/PasteSheet';
import { PasswordPromptSheet } from '../import/PasswordPromptSheet';
import { RepeatsField } from '../entry/RepeatsField';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The probe: renders children while visible and remembers the last dirty value any edit sheet passed.
let mockDirty: boolean | undefined;
jest.mock('@/ui/Sheet', () => {
  const R = jest.requireActual('react');
  return {
    Sheet: (p: { visible: boolean; dirty?: boolean; children: React.ReactNode }) => {
      if (p.dirty !== undefined) mockDirty = p.dirty;
      return p.visible ? R.createElement(R.Fragment, null, p.children) : null;
    },
    SheetScroll: (p: { children: React.ReactNode }) => R.createElement(R.Fragment, null, p.children),
  };
});

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/accounts', () => ({
  useAddAccount: () => ({ add: jest.fn(() => 'new-acc') }),
  useEditAccount: () => ({ edit: jest.fn(() => true) }),
}));
jest.mock('@/data/mutations/accountDelete', () => ({ useDeleteAccount: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePendingSplit: () => ({ split: new Map(), isLoading: false }) }));
jest.mock('../accounts/useAccountUsage', () => ({ useAccountUsage: () => ({ usage: null }) }));
jest.mock('@/data/queries/fxLatest', () => ({
  useFxLatest: () => ({
    data: [
      { quote: 'EUR', rate: '1.00000000', rate_date: '2026-10-01', source: 'frankfurter-v2' },
      { quote: 'GBP', rate: '0.85000000', rate_date: '2026-10-01', source: 'frankfurter-v2' },
    ],
  }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [
      { code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null },
      { code: 'EUR', name: 'Euro', symbol: '€', exponent: 2, kind: 'iso', rateDate: null },
    ],
    loading: false,
  }),
}));
jest.mock('@/data/mutations/categories', () => ({
  useAddCategory: () => ({ add: jest.fn(() => ({ id: 'n', stepId: 's' })) }),
  useEditCategory: () => ({ edit: jest.fn(() => 'edit-step') }),
  useArchiveCategory: () => ({ archive: jest.fn(), restore: jest.fn() }),
  useMergeCategory: () => ({ merge: jest.fn() }),
}));
jest.mock('@/data/mutations/categoryRules', () => ({
  useAddRule: () => ({ add: jest.fn(() => ({ id: 'r', stepId: 's' })) }),
  useEditRule: () => ({ edit: jest.fn(() => 'edit-step') }),
  useRemoveRule: () => ({ remove: jest.fn(() => 'remove-step') }),
}));
jest.mock('@/data/mutations/pasteLines', () => ({ usePasteLines: () => ({ add: jest.fn() }) }));
jest.mock('@/data/queries/categoryRules', () => ({
  useCategoryRules: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/features/record/useGuessContext', () => ({
  useGuessContext: () => ({
    guess: { keywordRules: [], learned: new Map(), builtinIds: new Map(), personalRules: [], sharedRules: [] },
    rules: [],
    resolved: { personal: [], shared: [], byRuleId: new Map(), unresolvedIds: new Set() },
    memberCategories: [],
    rulesStatus: 'ready',
  }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'UTC',
    today: '2026-10-06',
    horizonMonth: null,
  }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [{ id: 'a1', name: 'Current', currency: 'GBP', kind: 'checking', archived_at: null }],
  }),
}));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({ rows: [], projections: [], totals: {}, isLoading: false, isError: false, refetch: jest.fn() }),
  useAccountBalances: () => ({ balances: new Map(), isLoading: false }),
}));
jest.mock('@/data/queries/categories', () => {
  const cats = [
    { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null },
    { id: 'c2', builtin_key: null, name: 'Fuel', color_key: 'rust', is_system: false, archived_at: null },
  ];
  return {
    useCategoryLookup: () => ({
      all: cats,
      active: cats,
      byId: new Map(cats.map((c) => [c.id, c])),
      builtinIds: new Map(),
      transferCategoryId: 'tc',
      loading: false,
    }),
    useCategoryUsage: () => ({ count: 0, capped: false, isLoading: false }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDirty = undefined;
});

const wrap = (node: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>
    <ThemeProvider>{node}</ThemeProvider>
  </QueryClientProvider>
);

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1',
    deleted_at: null,
    is_sample: false,
    household_id: 'h1',
    created_by: null,
    name: 'Current',
    kind: 'checking',
    currency: 'GBP',
    opening_balance: 10000,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    version: 4,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function category(over: Partial<CategoryRow> = {}): CategoryRow {
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

describe('AccountSheet dirty', () => {
  it('new: clean until a name is typed', async () => {
    const onClose = jest.fn();
    const u = await render(wrap(<AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={onClose} />));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Name'), 'Main');
    expect(mockDirty).toBe(true);
    await fireEvent.press(u.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('edit: changing the opening balance is dirty and restoring it is clean', async () => {
    const u = await render(wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />));
    expect(mockDirty).toBe(false);
    const original = u.getByLabelText('Opening balance').props.value as string;
    await fireEvent.changeText(u.getByLabelText('Opening balance'), '50');
    expect(mockDirty).toBe(true);
    await fireEvent.changeText(u.getByLabelText('Opening balance'), original);
    expect(mockDirty).toBe(false);
  });
});

describe('CategorySheet dirty', () => {
  it('reports a changed name, colour and cap, and Cancel closes directly', async () => {
    const onClose = jest.fn();
    const u = await render(wrap(<CategorySheet visible mode={{ kind: 'edit', category: category() }} onClose={onClose} />));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Name'), 'Food');
    expect(mockDirty).toBe(true);
    await fireEvent.changeText(u.getByLabelText('Name'), 'Groceries');
    expect(mockDirty).toBe(false);
    await fireEvent.press(u.getByLabelText('Plum colour'));
    expect(mockDirty).toBe(true);
    await fireEvent.press(u.getByLabelText('Teal colour'));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Monthly cap'), '120');
    expect(mockDirty).toBe(true);
    await fireEvent.press(u.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RuleSheet dirty', () => {
  it('reports a changed keyword, and Cancel closes directly', async () => {
    const onClose = jest.fn();
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'edit', rule: rule(), categoryId: 'c1' }} onClose={onClose} />));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Description contains'), 'Aldi');
    expect(mockDirty).toBe(true);
    await fireEvent.changeText(u.getByLabelText('Description contains'), 'Tesco');
    expect(mockDirty).toBe(false);
    await fireEvent.press(u.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('new: choosing the shared scope is dirty', async () => {
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'new' }} onClose={jest.fn()} />));
    expect(mockDirty).toBe(false);
    await fireEvent.press(u.getByText('Shared'));
    expect(mockDirty).toBe(true);
  });

  it('a different category is dirty', async () => {
    const u = await render(wrap(<RuleSheet visible mode={{ kind: 'edit', rule: rule(), categoryId: 'c1' }} onClose={jest.fn()} />));
    await fireEvent.press(u.getByLabelText('Category'));
    await fireEvent.press(u.getByLabelText('Fuel'));
    expect(mockDirty).toBe(true);
  });
});

describe('FilterSheet dirty', () => {
  const categories = [
    { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null },
  ] as never;
  const accounts = [{ id: 'a1', name: 'Current', currency: 'GBP', archived_at: null }] as never;

  function filter(value: ActivityFilter = EMPTY_FILTER, onClose = jest.fn()) {
    return wrap(
      <FilterSheet
        visible
        value={value}
        homeCurrency="GBP"
        categories={categories}
        accounts={accounts}
        onApply={jest.fn()}
        onClose={onClose}
      />,
    );
  }

  it('is clean when untouched, dirty after toggling Unpaid only, clean again when toggled back', async () => {
    const onClose = jest.fn();
    const u = await render(filter(EMPTY_FILTER, onClose));
    expect(mockDirty).toBe(false);
    await fireEvent.press(u.getByText('Unpaid only'));
    expect(mockDirty).toBe(true);
    await fireEvent.press(u.getByText('Unpaid only'));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByPlaceholderText('At least'), '10');
    expect(mockDirty).toBe(true);
    await fireEvent.press(u.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('an applied range that is left alone is clean', async () => {
    await render(filter({ ...EMPTY_FILTER, amountMin: 1500, amountMax: 2500 }));
    expect(mockDirty).toBe(false);
  });
});

describe('PasteSheet dirty', () => {
  it('is clean while empty or blank and dirty once text is typed', async () => {
    const onClose = jest.fn();
    const u = await render(wrap(<PasteSheet visible month="2026-10" onClose={onClose} onCsv={jest.fn()} />));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Lines to add'), '   ');
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Lines to add'), 'Coffee 3.00');
    expect(mockDirty).toBe(true);
  });
});

describe('PasswordPromptSheet dirty', () => {
  it('is dirty only after something is typed, and Cancel closes directly', async () => {
    const onCancel = jest.fn();
    const u = await render(wrap(<PasswordPromptSheet visible wrong={false} onUnlock={jest.fn()} onCancel={onCancel} />));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Password'), 'secret');
    expect(mockDirty).toBe(true);
    await fireEvent.press(u.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('RepeatsField sheet dirty', () => {
  function Host({ onChange }: { onChange: (v: unknown) => void }) {
    const [value, setValue] = React.useState<React.ComponentProps<typeof RepeatsField>['value']>({
      freq: 'monthly',
      end: { kind: 'count', count: 3 },
    });
    return (
      <RepeatsField
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        formatDate={(d) => d}
        today="2026-10-06"
        entryDate="2026-10-06"
      />
    );
  }

  it('is clean on open, dirty once the count is edited, and Done closes directly', async () => {
    const u = await render(wrap(<Host onChange={jest.fn()} />));
    await fireEvent.press(u.getByLabelText('Repeats'));
    expect(mockDirty).toBe(false);
    await fireEvent.changeText(u.getByLabelText('Number of times'), '5');
    expect(mockDirty).toBe(true);
    await fireEvent.changeText(u.getByLabelText('Number of times'), '3');
    expect(mockDirty).toBe(false);
    await fireEvent.press(u.getByText('Done'));
    expect(u.queryByLabelText('Number of times')).toBeNull();
  });
});
