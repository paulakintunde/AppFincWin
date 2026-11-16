import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetToastForTests } from '@/state/undoToast';
import { CategoryDefaultsScreen, categoryRefOf } from '../CategoryDefaultsScreen';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/shell/header/BackButton', () => ({ BackButton: () => null }));

const mockSetDefault = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; reason?: string; before?: { rule: string | null } }> => ({ ok: true, before: { rule: null } }));
jest.mock('@/db/transactionSplits', () => ({
  setSplitDefault: (...a: unknown[]) => mockSetDefault(...a),
  countUnsettledForRule: async () => ({ ok: true, count: 0 }),
  applyRuleToUnsettled: async () => ({ ok: true, changed_count: 0 }),
}));

let mockDefaults: Record<string, unknown>[] = [];
jest.mock('@/data/queries/householdBalances', () => ({ useSplitDefaults: () => ({ data: mockDefaults }) }));
jest.mock('../../useHouseholdScope', () => ({
  useHouseholdScope: () => ({ householdId: 'h', userId: 'me', online: true, members: [], isOwner: true, name: 'Home', household: null }),
}));

const mockCats = [
  { id: 'c1', builtin_key: 'Groceries', name: null, color_key: 'sage', is_system: false, archived_at: null, icon_key: null },
  { id: 'c2', builtin_key: null, name: 'Pets', color_key: 'sage', is_system: false, archived_at: null, icon_key: null },
];
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ active: mockCats, all: mockCats }) }));

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <CategoryDefaultsScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSetDefault.mockClear();
  resetToastForTests();
  mockDefaults = [];
});

describe('categoryRefOf', () => {
  it('uses builtin: for a built-in category and custom: for one the person made', () => {
    expect(categoryRefOf({ id: 'c1', builtin_key: 'Groceries' })).toBe('builtin:Groceries');
    expect(categoryRefOf({ id: 'abc-123', builtin_key: null })).toBe('custom:abc-123');
  });
});

describe('CategoryDefaultsScreen', () => {
  it('says the household split is used while no category has its own', async () => {
    await setup();
    expect(screen.getByTestId('category-defaults-empty')).toBeTruthy();
    expect(screen.getByText('Using the household split for every category')).toBeTruthy();
    expect(screen.getAllByText('Household default').length).toBe(2);
  });

  it('shows a category rule and saves a new one under the right key', async () => {
    mockDefaults = [{ id: 'd1', category_ref: 'custom:c2', rule: 'mine', version: 3 }];
    await setup();
    expect(screen.getByText('Mine only')).toBeTruthy();
    await fireEvent.press(screen.getByText('Groceries'));
    await fireEvent.press(screen.getByTestId('split-rule-weight'));
    await fireEvent.press(screen.getByText('Save split'));
    await waitFor(() => expect(mockSetDefault).toHaveBeenCalledTimes(1));
    expect(mockSetDefault).toHaveBeenCalledWith(expect.anything(), 'builtin:Groceries', 'weight', undefined);
  });

  it('removes a category rule with Use household default', async () => {
    mockDefaults = [{ id: 'd1', category_ref: 'custom:c2', rule: 'mine', version: 3 }];
    await setup();
    await fireEvent.press(screen.getByText('Pets'));
    await fireEvent.press(screen.getByText('Use household default'));
    await fireEvent.press(screen.getByText('Save split'));
    await waitFor(() => expect(mockSetDefault).toHaveBeenCalledTimes(1));
    expect(mockSetDefault).toHaveBeenCalledWith(expect.anything(), 'custom:c2', null, 3);
  });

  it('shows a refusal in the sheet and keeps it open', async () => {
    mockSetDefault.mockResolvedValueOnce({ ok: false, reason: 'invalid_rule' });
    await setup();
    await fireEvent.press(screen.getByText('Groceries'));
    await fireEvent.press(screen.getByTestId('split-rule-mine'));
    await fireEvent.press(screen.getByText('Save split'));
    expect(await screen.findByTestId('category-default-failure')).toBeTruthy();
  });
});
