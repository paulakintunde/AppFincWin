import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { VersionConflictError } from '@/db/errors';
import type { TransactionRow } from '@/db/rows';
import { CategorySplitSheet } from '../CategorySplitSheet';
import { CategoryTag } from '../CategoryTag';

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
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => ({ visible: true }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ showCents: true }) }));
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({
    data: [
      { household_id: 'h', user_id: 'me', is_owner: true, role_label: 'Owner', weight: 50, colour_key: 0, display_name: 'Paul', name_hidden: false, version: 1 },
      { household_id: 'h', user_id: 'sam', is_owner: false, role_label: 'Flatmate', weight: 50, colour_key: 1, display_name: 'Sam', name_hidden: false, version: 1 },
    ],
  }),
  useFormerMembers: () => ({ data: [] }),
}));

jest.mock('@/data/queries/categories', () => {
  const all = [
    { id: 'g', builtin_key: 'Groceries', name: null, color_key: 'green', is_system: false, archived_at: null },
    { id: 'd', builtin_key: 'Dining', name: null, color_key: 'green', is_system: false, archived_at: null },
    { id: 's', builtin_key: 'Savings', name: null, color_key: 'green', is_system: false, archived_at: null },
    { id: 't', builtin_key: 'Transfer', name: null, color_key: 'slate', is_system: true, archived_at: null },
  ];
  return {
    useCategoryLookup: () => ({
      all,
      active: all.filter((c) => !c.is_system),
      byId: new Map(all.map((c) => [c.id, c])),
      transferCategoryId: 't',
      loading: false,
    }),
  };
});

const mockMutate = jest.fn();
jest.mock('@/data/mutations/categoryParts', () => ({
  ...jest.requireActual('@/data/mutations/categoryParts'),
  useSetCategoryParts: () => ({ mutate: mockMutate, isPending: false, isPaused: false }),
}));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));
const mockHapticWarn = jest.fn();
const mockHapticTap = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticTap: () => mockHapticTap(),
  hapticWarn: () => mockHapticWarn(),
  hapticTick: jest.fn(),
  hapticFailed: jest.fn(),
  hapticMilestone: jest.fn(),
}));

function line(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'line-1',
    household_id: 'h',
    account_id: 'a',
    name: 'Lunch at Pret',
    original_amount: -5000,
    original_currency: 'USD',
    category_id: 'g',
    version: 4,
    category_parts: null,
    ...over,
  } as unknown as TransactionRow;
}

const onClose = jest.fn();
async function setup(l: TransactionRow = line(), extra: Partial<React.ComponentProps<typeof CategorySplitSheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <CategorySplitSheet visible line={l} householdId="h" month="2026-11" currency="USD" onClose={onClose} {...extra} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockMutate.mockReset();
  mockShowToast.mockReset();
  mockHapticWarn.mockClear();
  mockHapticTap.mockClear();
  onClose.mockClear();
});

describe('CategorySplitSheet', () => {
  it('opens with two parts: the line category with the total, and an empty part', async () => {
    await setup();
    expect(screen.getByText('Split Lunch at Pret')).toBeTruthy();
    expect(screen.getByTestId('split-part-1-category')).toBeTruthy();
    expect(screen.getByTestId('split-part-2-category')).toBeTruthy();
    expect(screen.queryByTestId('split-part-3-category')).toBeNull();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Adds up')).toBeTruthy();
    expect(screen.queryByTestId('split-part-1-remove')).toBeNull();
  });

  it('hides remove at two rows and shows it at three', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('split-add'));
    expect(screen.getByTestId('split-part-3-category')).toBeTruthy();
    expect(screen.getByTestId('split-part-1-remove')).toBeTruthy();
    expect(screen.getByTestId('split-part-3-remove')).toBeTruthy();
  });

  it('keeps Save blocked until the parts add up, warning on a blocked tap', async () => {
    await setup();
    expect(screen.getByText('Make the parts add up')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('split-save'));
    expect(mockHapticWarn).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Every part needs an amount.')).toBeTruthy();
  });

  it('shows the amount left to place and then saves signed parts with the line version', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Amount for part 2'), '20');
    expect(screen.getByText('Save split')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount for part 1'), '25');
    expect(screen.getByText('$5.00 left to place')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount for part 1'), '30');
    await fireEvent.press(screen.getByTestId('split-save'));
    expect(mockHapticTap).toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const vars = mockMutate.mock.calls[0]![0];
    expect(vars).toMatchObject({ householdId: 'h', month: '2026-11', id: 'line-1', expectedVersion: 4 });
    expect(vars.parts).toEqual([
      { categoryId: 'g', amount: -3000 },
      { categoryId: null, amount: -2000 },
    ]);
  });

  it('shows Split saved with an Undo that sends the before-state back', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Amount for part 2'), '20');
    mockMutate.mockImplementationOnce((_vars, opts) =>
      opts.onSuccess({ version: 5, before: { parts: null, category_id: 'g' } }),
    );
    await fireEvent.press(screen.getByTestId('split-save'));
    expect(onClose).toHaveBeenCalled();
    const toast = mockShowToast.mock.calls[0]![0];
    expect(toast.text).toEqual({ key: 'split.saved' });
    toast.onUndo();
    expect(mockMutate).toHaveBeenLastCalledWith({
      householdId: 'h',
      month: '2026-11',
      id: 'line-1',
      expectedVersion: 5,
      parts: null,
      keepAs: 'g',
    });
  });

  it('says who changed the line on a version conflict and keeps the draft', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Amount for part 2'), '20');
    mockMutate.mockImplementationOnce((_vars, opts) =>
      opts.onError(new VersionConflictError('transactions', 'line-1', { version: 6, updated_by: 'sam' })),
    );
    await fireEvent.press(screen.getByTestId('split-save'));
    expect(screen.getByText('Sam changed this line. Review and save again.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Save split')).toBeTruthy();
  });

  it('offers Savings and Transfer with their own words', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('split-part-2-category'));
    expect(screen.getByText('Transfer')).toBeTruthy();
    await fireEvent.press(screen.getByText('Savings'));
    expect(screen.getByText('Counts as saving')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('split-part-2-category'));
    await fireEvent.press(screen.getByText('Transfer'));
    expect(screen.getByText('Counts as a move between your accounts')).toBeTruthy();
  });

  it('prefills an existing split, shows a gap and removes it keeping the largest part', async () => {
    await setup(
      line({
        original_amount: -6000,
        category_id: 'g',
        category_parts: [
          { c: 'g', a: -2000 },
          { c: 'd', a: -3000 },
        ],
      }),
      { highlightGap: true },
    );
    expect(screen.getByText('$10.00 left to place')).toBeTruthy();
    expect(screen.getAllByText('Dining').length).toBe(2);
    expect(screen.getByText('Remove the split')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('split-remove'));
    expect(screen.getByText('Remove the split?')).toBeTruthy();
    expect(screen.getByText('The line goes back to one category: Dining. Nothing else changes.')).toBeTruthy();
    const confirm = screen.getAllByText('Remove the split');
    await fireEvent.press(confirm[confirm.length - 1]!);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0]![0]).toMatchObject({ parts: null, keepAs: 'd', expectedVersion: 4 });
  });

  it('does not show Remove the split on a line that is not split', async () => {
    await setup();
    expect(screen.queryByTestId('split-remove')).toBeNull();
  });
});

describe('CategoryTag', () => {
  it('reads N categories with a press target', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <CategoryTag count={3} onPress={onPress} />
      </ThemeProvider>,
    );
    expect(screen.getByText('3 categories')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('category-tag'));
    expect(onPress).toHaveBeenCalled();
  });

  it('is plain text without a handler', async () => {
    await render(
      <ThemeProvider>
        <CategoryTag count={2} />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('2 categories')).toBeTruthy();
  });
});
