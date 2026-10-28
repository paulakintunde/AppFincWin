import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { HowArePaidCard, SETUP_STANDALONE_HREF } from '../HowArePaidCard';
import { incomeCardDismissedKey, incomeCardIsDismissed } from '../activityViewPrefs';

const mockAccess = { v3: true };
const mockSettings: { current: { isSuccess: boolean; data: { income_types: string[] | null } | null } } = {
  current: { isSuccess: true, data: { income_types: null } },
};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => mockAccess }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => mockSettings.current }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1' }),
}));

function renderCard() {
  return render(
    <ThemeProvider>
      <HowArePaidCard />
    </ThemeProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAccess.v3 = true;
  mockSettings.current = { isSuccess: true, data: { income_types: null } };
  await AsyncStorage.clear();
});

describe('HowArePaidCard', () => {
  it('shows for a flagged account with no income profile', async () => {
    const screen = await renderCard();
    await waitFor(() => expect(screen.getByText('How are you paid?')).toBeTruthy());
    expect(screen.getByText('ONE QUICK THING')).toBeTruthy();
    expect(screen.getByLabelText('Set it up')).toBeTruthy();
    expect(screen.getByLabelText('Not now')).toBeTruthy();
  });

  it('is hidden when the switch is off', async () => {
    mockAccess.v3 = false;
    const screen = await renderCard();
    await act(async () => {});
    expect(screen.queryByText('How are you paid?')).toBeNull();
  });

  it('is hidden once the income profile exists', async () => {
    mockSettings.current = { isSuccess: true, data: { income_types: ['salary'] } };
    const screen = await renderCard();
    await act(async () => {});
    expect(screen.queryByText('How are you paid?')).toBeNull();
  });

  it('Set it up opens the standalone stepper', async () => {
    const screen = await renderCard();
    await waitFor(() => screen.getByLabelText('Set it up'));
    await fireEvent.press(screen.getByLabelText('Set it up'));
    expect(mockPush).toHaveBeenCalledWith(SETUP_STANDALONE_HREF);
  });

  it('Not now hides the card and stores a local timestamp only', async () => {
    const screen = await renderCard();
    await waitFor(() => screen.getByLabelText('Not now'));
    await fireEvent.press(screen.getByLabelText('Not now'));
    await waitFor(() => expect(screen.queryByText('How are you paid?')).toBeNull());
    const stored = await AsyncStorage.getItem(incomeCardDismissedKey('u1'));
    expect(stored).not.toBeNull();
    expect(Number.isFinite(Date.parse(stored as string))).toBe(true);
    expect(incomeCardDismissedKey('u1').startsWith('fincwin:')).toBe(true);
  });

  it('stays hidden inside 14 days and returns after', async () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(incomeCardIsDismissed(null, now)).toBe(false);
    expect(incomeCardIsDismissed('2026-10-15T12:00:00Z', now)).toBe(true);
    expect(incomeCardIsDismissed('2026-10-14T11:59:00Z', now)).toBe(false);

    await AsyncStorage.setItem(incomeCardDismissedKey('u1'), new Date().toISOString());
    const screen = await renderCard();
    await act(async () => {});
    expect(screen.queryByText('How are you paid?')).toBeNull();
  });
});
