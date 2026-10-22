import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { SnapshotResult } from '../../snapshot/types';
import { TODAY, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { FirstCheckScreen } from '../FirstCheckScreen';
import { RoughFiguresScreen } from '../RoughFiguresScreen';

jest.setTimeout(30000);

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
const mockSuccess = jest.fn();
const mockWarning = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticSuccess: () => mockSuccess(),
  hapticWarning: () => mockWarning(),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1', today: '2026-10-15', homeCurrency: 'USD' }),
}));
const mockUpdate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: (...a: unknown[]) => mockUpdate(...a) }) }));
let mockResult: SnapshotResult | null = null;
jest.mock('@/data/queries/decide', () => ({
  useOtherChecks: () => ({ otherChecks: [], openCount: 0, notCounted: 0, notCountedCurrency: 0 }),
  useDecideSnapshot: () => ({ status: 'ready', result: mockResult, source: null, retry: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockResult = null;
});

const wrap = (node: React.ReactElement) => render(<ThemeProvider>{node}</ThemeProvider>);

async function runCheck(price: string) {
  await fireEvent.changeText(screen.getByLabelText('What is it?'), 'Laptop');
  await fireEvent.changeText(screen.getByLabelText('Price'), price);
  await fireEvent(screen.getByLabelText('Price'), 'blur');
  await fireEvent.press(screen.getByText('Check it'));
}

describe('RoughFiguresScreen', () => {
  it('keeps Next disabled until both figures are entered, then saves and moves on', async () => {
    await wrap(<RoughFiguresScreen accountId="acc-1" />);
    expect(screen.getByText('Roughly, what comes in and goes out?')).toBeTruthy();
    expect(screen.getByText('Next').props.accessibilityState ?? screen.getByLabelText('Next').props.accessibilityState).toBeTruthy();
    await fireEvent.press(screen.getByText('Next'));
    expect(mockUpdate).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Money in each month'), '4000');
    await fireEvent(screen.getByLabelText('Money in each month'), 'blur');
    await fireEvent.changeText(screen.getByLabelText('Money out each month'), '2500');
    await fireEvent(screen.getByLabelText('Money out each month'), 'blur');
    await fireEvent.press(screen.getByText('Next'));
    expect(mockUpdate).toHaveBeenCalledWith({ rough_income: 400000, rough_spending: 250000, currency: 'USD' });
    expect(mockUpdate.mock.calls[0]?.[0]).not.toHaveProperty('seeded');
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/setup/first-check', params: { accountId: 'acc-1' } });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('CR-D01: Next counts figures typed without a blur (the iOS decimal pad has no return key)', async () => {
    await wrap(<RoughFiguresScreen accountId="acc-1" />);
    await fireEvent.changeText(screen.getByLabelText('Money in each month'), '4000');
    await fireEvent.changeText(screen.getByLabelText('Money out each month'), '2500');
    await fireEvent.press(screen.getByText('Next'));
    expect(mockUpdate).toHaveBeenCalledWith({ rough_income: 400000, rough_spending: 250000, currency: 'USD' });
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('CR-D01: Skip saves a valid figure already typed instead of dropping it', async () => {
    await wrap(<RoughFiguresScreen accountId="acc-1" />);
    await fireEvent.changeText(screen.getByLabelText('Money in each month'), '4000');
    await fireEvent.changeText(screen.getByLabelText('Money out each month'), 'abc');
    await fireEvent.press(screen.getByText('Skip for now'));
    expect(mockUpdate).toHaveBeenCalledWith({ rough_income: 400000, currency: 'USD' });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/setup/first-check', params: { accountId: 'acc-1' } });
  });

  it('Skip for now goes on without saving', async () => {
    await wrap(<RoughFiguresScreen accountId="acc-1" />);
    await fireEvent.press(screen.getByText('Skip for now'));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/setup/first-check', params: { accountId: 'acc-1' } });
  });
});

describe('FirstCheckScreen', () => {
  it('rough figures give a first read', async () => {
    mockResult = roughSource(3_000_000);
    await wrap(<FirstCheckScreen accountId="acc-1" />);
    expect(screen.getByText('Try one thing you’re thinking of buying')).toBeTruthy();
    await runCheck('300');
    expect(screen.getByText('First read, from the figures you gave. An import or a month of logging sharpens it.')).toBeTruthy();
    expect(screen.queryByText('Run the full check')).toBeNull();
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('first_read_shown', { state: 'fits' });
    expect(mockSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Check something else')).toBeTruthy();
  });

  it('a first read that does not fit fires the warning haptic', async () => {
    mockResult = roughSource();
    await wrap(<FirstCheckScreen accountId={null} />);
    await runCheck('9000');
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack.mock.calls[0]?.[1]).not.toEqual({ state: 'fits' });
    expect(mockWarning).toHaveBeenCalledTimes(1);
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('skipped figures give a cash-only answer', async () => {
    mockResult = noneSource(400_000);
    await wrap(<FirstCheckScreen accountId="acc-1" />);
    await runCheck('1450');
    expect(screen.getByText('Cash only · no monthly figures yet')).toBeTruthy();
    expect(screen.getByText(/From your cash alone/)).toBeTruthy();
    expect(screen.queryByText(/cushion/)).toBeNull();
    expect(screen.queryByText(/The month closes/)).toBeNull();
    expect(screen.queryByText(/short of your cushion/)).toBeNull();
    expect(screen.queryByText('It fits')).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('first_read_shown', { state: 'missing' });
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('cash-only that overdraws fires the warning haptic', async () => {
    mockResult = noneSource(100_000);
    await wrap(<FirstCheckScreen accountId="acc-1" />);
    await runCheck('5000');
    expect(mockWarning).toHaveBeenCalledTimes(1);
  });

  it('Bring your history replaces to the history step and Check something else clears the form', async () => {
    mockResult = roughSource();
    await wrap(<FirstCheckScreen accountId="acc-1" />);
    await runCheck('1500');
    await fireEvent.press(screen.getByText('Check something else'));
    expect(screen.queryByText('Check something else')).toBeNull();
    expect(screen.getByLabelText('What is it?').props.value).toBe('');
    await fireEvent.press(screen.getByText('Bring your history'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/setup/history', params: { accountId: 'acc-1' } });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
