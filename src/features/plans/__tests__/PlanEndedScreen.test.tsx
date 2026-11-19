import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PlanEndedScreen } from '../PlanEndedScreen';

jest.setTimeout(30000);

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/data/queries/household', () => ({ useHousehold: () => ({ data: { name: 'Maple' } }) }));
const mockRequestSignOut = jest.fn(async () => ({ needsConfirm: false }));
jest.mock('@/features/auth/signOut', () => ({
  requestSignOut: () => mockRequestSignOut(),
  performSignOut: jest.fn(),
}));
const mockManage = jest.fn(async () => undefined);
const mockRestore = jest.fn(async () => 'restored');
jest.mock('../store/purchasesClient', () => ({
  openManageSubscription: () => mockManage(),
  restorePurchases: () => mockRestore(),
}));
jest.mock('../PlanHost', () => ({ requestPlanRefresh: jest.fn(async () => undefined) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

let mockPlan: Record<string, unknown>;
jest.mock('../usePlanState', () => ({ usePlanState: () => mockPlan }));

const base = { status: 'locked', writable: false, loading: false, householdId: 'h1', members: 1, payerId: 'u1', payerIsMe: true, payerName: 'Sam' };

describe('PlanEndedScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockPlan = { ...base };
  });

  it('lists the seven Still open rows in order, all pressable, and never says free version', async () => {
    const { getAllByRole, getByText, toJSON } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    const order = [
      'Read your records',
      'Export your data',
      'Free help',
      'Manage subscription',
      'Restore purchases',
      'Sign out',
      'Delete account',
    ];
    const json = JSON.stringify(toJSON());
    let last = -1;
    for (const label of order) {
      const at = json.indexOf(label);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    // every row responds while locked
    await fireEvent.press(getByText('Read your records'));
    expect(mockReplace).toHaveBeenCalled();
    await fireEvent.press(getByText('Export your data'));
    expect(mockPush).toHaveBeenCalledWith('/export');
    await fireEvent.press(getByText('Free help'));
    expect(mockPush).toHaveBeenCalledWith('/free-help');
    await fireEvent.press(getByText('Manage subscription'));
    expect(mockManage).toHaveBeenCalled();
    await fireEvent.press(getByText('Restore purchases'));
    expect(mockRestore).toHaveBeenCalled();
    await fireEvent.press(getByText('Sign out'));
    expect(mockRequestSignOut).toHaveBeenCalled();
    await fireEvent.press(getByText('Delete account'));
    expect(mockPush).toHaveBeenCalledWith('/delete-account');
    expect(getAllByRole('header').length).toBeGreaterThan(0);
    expect(json.toLowerCase()).not.toContain('free version');
  });

  it('member of a lapsed multi-person home sees who paid, Take over and Leave and continue on Solo', async () => {
    mockPlan = { ...base, members: 2, payerIsMe: false, payerName: 'Alex' };
    const { getByText, queryByText } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    expect(getByText('Maple’s plan has ended')).toBeTruthy();
    expect(getByText('Paid by Alex')).toBeTruthy();
    expect(getByText('Take over the plan')).toBeTruthy();
    expect(getByText('Leave and continue on Solo')).toBeTruthy();
    expect(queryByText('Choose a plan')).toBeNull();
  });

  it('no payer adds the nothing-deleted line', async () => {
    mockPlan = { ...base, payerId: null, payerName: null, payerIsMe: false };
    const { getByText } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    expect(getByText('Your records stay here read-only. Nothing is deleted without notice.')).toBeTruthy();
  });
});
