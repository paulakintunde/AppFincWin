import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AlertsScreen } from '../AlertsScreen';
import { DEFAULT_ALERT_SETTINGS, ALERT_KINDS, type AlertSetting } from '@/db/alerts';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(30000);

let mockSettings: AlertSetting[];
let mockMembers: unknown[] = [];
let mockCapsOn = true;
const mockSaveSetting = jest.fn();
const mockSavePrefs = jest.fn();
const mockGetPerm = jest.fn();
const mockRequest = jest.fn();
const mockEnsure = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, today: '2026-11-23', timeZone: 'UTC' }),
}));
jest.mock('@/features/household/useHouseholdScope', () => ({ useHouseholdScope: () => ({ members: mockMembers }) }));
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => ({ on: mockCapsOn }) }));
jest.mock('@/data/queries/alerts', () => ({
  useAlertSettings: () => ({ data: mockSettings }),
  useAlertPrefs: () => ({ data: { ...jest.requireActual('@/db/alerts').DEFAULT_ALERT_PREFS, version: 3 } }),
}));
jest.mock('@/data/mutations/alertSettings', () => ({
  useSaveAlertSetting: () => ({ saveAlertSetting: (...a: unknown[]) => mockSaveSetting(...a) }),
  useSaveAlertPrefs: () => ({ saveAlertPrefs: (...a: unknown[]) => mockSavePrefs(...a) }),
}));
jest.mock('../useAlertDefaults', () => ({
  useAlertDefaults: () => ({
    suggested: { large: { minor: 60000, basis: 'history' }, low: { minor: 10000, basis: 'flat' } },
    homeCurrency: 'USD',
    ensurePartnerThreshold: (...a: unknown[]) => mockEnsure(...a),
  }),
}));
jest.mock('../pushRegistration', () => ({
  getPushPermission: (...a: unknown[]) => mockGetPerm(...a),
  requestPushPermissionAndRegister: (...a: unknown[]) => mockRequest(...a),
}));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));

const renderScreen = async () => {
  const view = await render(
    <ThemeProvider>
      <AlertsScreen />
    </ThemeProvider>
  );
  // The theme provider paints after its saved theme loads; wait for the screen before acting.
  await waitFor(() => expect(screen.getAllByTestId('alerts-screen').length).toBeGreaterThan(0));
  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = ALERT_KINDS.map((k) => DEFAULT_ALERT_SETTINGS[k]);
  mockMembers = [];
  mockCapsOn = true;
  mockGetPerm.mockResolvedValue('undetermined');
  mockRequest.mockResolvedValue('granted');
});

describe('AlertsScreen', () => {
  it('lists the five kinds in order with defaults and never asks permission on open', async () => {
    await renderScreen();
    await waitFor(() => expect(mockGetPerm).toHaveBeenCalled());
    expect(mockRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId('alerts-preask')).toBeNull();
    expect(screen.getByLabelText('Alert: Bills due, on')).toBeTruthy();
    expect(screen.getByLabelText('Alert: Goal reached, on')).toBeTruthy();
    expect(screen.getByLabelText('Alert: Over cap, off')).toBeTruthy();
    expect(screen.getByLabelText('Alert: Large transaction, off')).toBeTruthy();
    expect(screen.getByLabelText('Alert: Low balance, off')).toBeTruthy();
    expect(screen.getByText('1 day before')).toBeTruthy();
    expect(screen.getByText('Over $600')).toBeTruthy();
    expect(screen.getByText('Below $100')).toBeTruthy();
  });

  it('switching an alert on saves it with the suggested amount and shows the pre-ask; Continue asks the OS', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('alert-switch-large_txn'));
    expect(mockSaveSetting).toHaveBeenCalledWith({
      userId: 'u1',
      setting: { kind: 'large_txn', enabled: true, thresholdMinor: 60000, thresholdCurrency: 'USD', leadDays: null },
      baseVersion: 0,
    });
    await waitFor(() => expect(screen.getByText('Allow notifications?')).toBeTruthy());
    expect(mockRequest).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('Not now closes the pre-ask without asking the OS', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('alert-switch-low_balance'));
    await waitFor(() => expect(screen.getByText('Allow notifications?')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alerts-preask-notnow'));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('shows the permission card after the OS answers denied, switch stays on', async () => {
    mockRequest.mockResolvedValue('denied');
    await renderScreen();
    await fireEvent.press(screen.getByTestId('alert-switch-over_cap'));
    await waitFor(() => expect(screen.getByText('Allow notifications?')).toBeTruthy());
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByTestId('alerts-permission-card')).toBeTruthy());
    expect(screen.getByText('Open settings')).toBeTruthy();
  });

  it('does not show the pre-ask when switching off', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('alert-switch-bills_due'));
    expect(mockSaveSetting).toHaveBeenCalledWith(expect.objectContaining({ setting: expect.objectContaining({ kind: 'bills_due', enabled: false }) }));
    expect(screen.queryByTestId('alerts-preask')).toBeNull();
  });

  it('over cap is disabled below the caps level', async () => {
    mockCapsOn = false;
    await renderScreen();
    expect(screen.getAllByText('Needs category caps').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('alert-switch-over_cap'));
    expect(mockSaveSetting).not.toHaveBeenCalled();
  });

  it('delivery and quiet hours save through prefs', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Daily summary'));
    expect(mockSavePrefs).toHaveBeenCalledWith({ userId: 'u1', patch: { mode: 'digest' }, baseVersion: 3 });
    await fireEvent.press(screen.getByLabelText('Quiet hours'));
    expect(mockSavePrefs).toHaveBeenCalledWith({ userId: 'u1', patch: { quietEnabled: false }, baseVersion: 3 });
  });

  it('shows Partner alerts only for household members', async () => {
    await renderScreen();
    expect(screen.queryByText('Partner alerts')).toBeNull();
    expect(mockEnsure).not.toHaveBeenCalled();
    mockMembers = [{}, {}];
    await renderScreen();
    expect(screen.getAllByText('Partner alerts').length).toBeGreaterThan(0);
    expect(mockEnsure).toHaveBeenCalled();
  });

  it('bills due sheet saves the lead time as 0, 1 or 3', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('alert-body-bills_due'));
    await waitFor(() => expect(screen.getByText('3 days before')).toBeTruthy());
    await fireEvent.press(screen.getByText('3 days before'));
    expect(mockSaveSetting).toHaveBeenCalledWith(expect.objectContaining({ setting: expect.objectContaining({ kind: 'bills_due', leadDays: 3 }) }));
  });

  it('Use the suggested amount resets the large amount in integer minor units', async () => {
    mockSettings = mockSettings.map((s) => (s.kind === 'large_txn' ? { ...s, enabled: true, thresholdMinor: 25000, thresholdCurrency: 'USD' } : s));
    await renderScreen();
    await fireEvent.press(screen.getByTestId('alert-body-large_txn'));
    await waitFor(() => expect(screen.getByTestId('alert-use-suggested')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alert-use-suggested'));
    expect(mockSaveSetting).toHaveBeenCalledWith(
      expect.objectContaining({ setting: expect.objectContaining({ kind: 'large_txn', thresholdMinor: 60000, thresholdCurrency: 'USD' }) })
    );
  });
});
