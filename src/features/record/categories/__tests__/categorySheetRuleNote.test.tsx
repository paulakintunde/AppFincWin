// 05.5-15 (D-17, UI-SPEC section 3c, test 3): CategorySheet says "Also a money rule in Decide" under the cap field once a cap is set
// on a user category, and a cap change that crosses an open check (opened from Decide) gives the warning haptic and the crossing sentence.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { CategoryRow } from '@/db/rows';
import { hapticWarning } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import { CategorySheet } from '../CategorySheet';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
const mockEdit = jest.fn(() => 'edit-step');
jest.mock('@/data/mutations/categories', () => ({
  useAddCategory: () => ({ add: jest.fn() }),
  useEditCategory: () => ({ edit: mockEdit }),
  useArchiveCategory: () => ({ archive: jest.fn(), restore: jest.fn() }),
  useMergeCategory: () => ({ merge: jest.fn() }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), loading: false }),
  useCategoryUsage: () => ({ count: 0, capped: false, isLoading: false }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1', homeCurrency: 'GBP', showCents: true, region: 'GB', today: '2026-10-09' }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const cat = (over: Partial<CategoryRow> = {}): CategoryRow => ({
  id: 'c1', monthly_cap: null, is_sample: false, owner_id: 'u1', builtin_key: null, name: 'Groceries', color_key: 'teal',
  is_system: false, archived_at: null, version: 2, updated_by: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...over,
});
const NOTE = 'Also a money rule in Decide';
const open = (row: CategoryRow, extra: Partial<React.ComponentProps<typeof CategorySheet>> = {}) =>
  render(
    <ThemeProvider>
      <CategorySheet visible mode={{ kind: 'edit', category: row }} onClose={jest.fn()} {...extra} />
    </ThemeProvider>,
  );

beforeEach(() => jest.clearAllMocks());

describe('CategorySheet: the money-rule note (UI-SPEC 3c)', () => {
  it('shows under the cap helper when the category has a cap', async () => {
    const u = await open(cat({ monthly_cap: 30_000 }));
    expect(u.getByText(NOTE)).toBeTruthy();
  });

  it('appears once a cap is typed and goes when the field is cleared', async () => {
    const u = await open(cat());
    expect(u.queryByText(NOTE)).toBeNull();
    await fireEvent.changeText(u.getByLabelText('Monthly cap'), '200');
    expect(u.getByText(NOTE)).toBeTruthy();
    await fireEvent.changeText(u.getByLabelText('Monthly cap'), '');
    expect(u.queryByText(NOTE)).toBeNull();
  });

  it('is hidden for a system category, which has no cap field', async () => {
    const u = await open(cat({ is_system: true, monthly_cap: 30_000 }));
    expect(u.queryByText(NOTE)).toBeNull();
  });
});

describe('CategorySheet opened from Decide: the crossing check on a cap change', () => {
  it('a cap that crosses an open check gives the warning haptic and the crossing sentence', async () => {
    const row = cat({ monthly_cap: 30_000 });
    const capCrossings = jest.fn(() => [{ name: 'Headphones' }]);
    const u = await open(row, { capCrossings });
    await fireEvent.changeText(u.getByLabelText('Monthly cap'), '100');
    await fireEvent.press(u.getByText('Save changes'));
    expect(capCrossings).toHaveBeenCalledWith('c1', 10_000);
    expect(mockEdit).toHaveBeenCalledWith(row, { monthlyCap: 10_000 });
    expect(hapticWarning).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning', stepId: 'edit-step', text: expect.objectContaining({ key: 'decide.screens.sheetsHome.rule.crosses' }) }));
  });

  it('a cap that crosses nothing takes the ordinary path', async () => {
    const capCrossings = jest.fn(() => []);
    const u = await open(cat({ monthly_cap: 30_000 }), { capCrossings });
    await fireEvent.changeText(u.getByLabelText('Monthly cap'), '100');
    await fireEvent.press(u.getByText('Save changes'));
    expect(hapticWarning).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'edit-step' }));
  });

  it('a save that does not change the cap does not run the crossing check', async () => {
    const capCrossings = jest.fn(() => [{ name: 'Headphones' }]);
    const u = await open(cat({ monthly_cap: 30_000 }), { capCrossings });
    await fireEvent.changeText(u.getByLabelText('Name'), 'Food');
    await fireEvent.press(u.getByText('Save changes'));
    expect(capCrossings).not.toHaveBeenCalled();
    expect(hapticWarning).not.toHaveBeenCalled();
  });
});
