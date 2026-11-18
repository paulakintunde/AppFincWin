import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { WeightsSheet } from '../WeightsSheet';

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
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const mockSet = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; reason?: string; updated_by?: string | null; versions?: Record<string, number> }> => ({ ok: true }));
jest.mock('@/db/householdMembers', () => ({ setMemberWeights: (...a: unknown[]) => mockSet(...a) }));

jest.mock('@/db/transactionSplits', () => ({
  countUnsettledForRule: async () => ({ ok: true, count: 4 }),
  applyRuleToUnsettled: async () => ({ ok: true, changed_count: 4 }),
}));

let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({ useHouseholdMembers: () => ({ data: mockMembers }), useFormerMembers: () => ({ data: [] }) }));

function member(id: string, name: string, weight: number, colour: number) {
  return { household_id: 'h', user_id: id, is_owner: id === 'me', role_label: 'Flatmate', weight, colour_key: colour, display_name: name, name_hidden: false, version: 1 };
}

async function setup(onSaved?: (b: Record<string, number>) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <WeightsSheet visible householdId="h" onClose={jest.fn()} onSaved={onSaved} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function pct(id: string): string {
  return screen.getByTestId(`weight-value-${id}`).props.accessibilityLabel as string;
}

beforeEach(() => {
  mockSet.mockClear();
  resetToastForTests();
  mockMembers = [member('me', 'Paul', 50, 0), member('u2', 'Sam', 50, 1)];
});

describe('WeightsSheet', () => {
  it('rebalances so the weights still total 100 when one is stepped', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('weight-up-me'));
    expect(pct('me')).toContain('55 percent');
    expect(pct('u2')).toContain('45 percent');
    expect(screen.getByText('Adds up to 100%')).toBeTruthy();
  });

  it('allows 0% and says it pays no share', async () => {
    mockMembers = [member('me', 'Paul', 100, 0), member('u2', 'Sam', 0, 1)];
    await setup();
    expect(screen.getByText('Pays no share of weighted lines.')).toBeTruthy();
  });

  it('keeps the last positive weight and shows the warning', async () => {
    mockMembers = [member('me', 'Paul', 100, 0), member('u2', 'Sam', 0, 1)];
    await setup();
    await fireEvent.press(screen.getByTestId('weight-value-me'));
    await fireEvent.changeText(screen.getByTestId('weight-input-me'), '0');
    await fireEvent(screen.getByTestId('weight-input-me'), 'submitEditing');
    expect(screen.getByTestId('weights-last-holder')).toBeTruthy();
    expect(screen.getByText('At least one person has to hold a share. Give someone a share first.')).toBeTruthy();
    expect(pct('me')).toContain('100 percent');
  });

  it('saves, shows the toast with Undo and calls onSaved with the old weights', async () => {
    const onSaved = jest.fn();
    await setup(onSaved);
    await fireEvent.press(screen.getByTestId('weight-up-me'));
    await fireEvent.press(screen.getByText('Save weights'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ me: 50, u2: 50 }));
    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { me: 55, u2: 45 }, { me: 1, u2: 1 });
    const toast = getToast();
    expect(toast?.text?.key).toBe('household.members.weights.saved');
    expect(toast?.onUndo).toBeTruthy();
    toast?.onUndo?.();
    await waitFor(() => expect(mockSet).toHaveBeenLastCalledWith(expect.anything(), { me: 50, u2: 50 }, {}));
  });

  it('opens the apply-to-existing offer after a save and closes once it is answered (08-20, D-35)', async () => {
    const onClose = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <WeightsSheet visible householdId="h" onClose={onClose} />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await fireEvent.press(screen.getByTestId('weight-up-me'));
    await fireEvent.press(screen.getByText('Save weights'));
    expect(await screen.findByText('Also apply to the 4 unsettled lines')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep current split'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names who saved first when the versions are stale (08-16 deviation 4)', async () => {
    mockSet.mockResolvedValueOnce({ ok: false, reason: 'version_conflict', updated_by: 'u2' });
    await setup();
    await fireEvent.press(screen.getByTestId('weight-up-me'));
    await fireEvent.press(screen.getByText('Save weights'));
    expect(await screen.findByText('Sam changed this first')).toBeTruthy();
    expect(screen.queryByTestId('weights-failure')).toBeNull();
  });

  it('falls back to the plain title when the server cannot say who', async () => {
    mockSet.mockResolvedValueOnce({ ok: false, reason: 'version_conflict', updated_by: null });
    await setup();
    await fireEvent.press(screen.getByTestId('weight-up-me'));
    await fireEvent.press(screen.getByText('Save weights'));
    expect(await screen.findByText('Changed by someone else')).toBeTruthy();
  });

  it('shows a reason when the server refuses', async () => {
    mockSet.mockResolvedValueOnce({ ok: false, reason: 'members_mismatch' });
    await setup();
    await fireEvent.press(screen.getByTestId('weight-up-me'));
    await fireEvent.press(screen.getByText('Save weights'));
    expect(await screen.findByTestId('weights-failure')).toBeTruthy();
  });
});
