import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
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
const mockManage = jest.fn(async (_opts?: unknown) => true);
const mockRestore = jest.fn(async () => 'restored');
jest.mock('../store/purchasesClient', () => ({
  openManageSubscription: (opts?: unknown) => mockManage(opts),
  restorePurchases: () => mockRestore(),
}));
jest.mock('../PlanHost', () => ({ requestPlanRefresh: jest.fn(async () => undefined) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

let mockPlan: Record<string, unknown>;
jest.mock('../usePlanState', () => ({ usePlanState: () => mockPlan }));

const base = { store: 'NONE', status: 'locked', writable: false, loading: false, householdId: 'h1', members: 1, payerId: 'u1', payerIsMe: true, payerName: 'Sam' };

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

  it('09-25 A5-2: Manage subscription with no store subscription (NONE) asks for the store page with that store', async () => {
    mockManage.mockClear();
    mockShowToast.mockClear();
    const { getByText } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    await fireEvent.press(getByText('Manage subscription'));
    expect(mockManage).toHaveBeenCalledWith({ store: 'NONE' });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('09-25 A5-2: when no store page opens, the tap still answers with a toast', async () => {
    mockManage.mockClear();
    mockShowToast.mockClear();
    mockManage.mockResolvedValueOnce(false);
    const { getByText } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    await fireEvent.press(getByText('Manage subscription'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'plans.subscription.manageFailed' } });
  });

  it('quick 261124-2bs: shows "Your 7 days after leaving ended" for a non-payer who left a home', async () => {
    mockPlan = { ...base, payerIsMe: false, payerId: 'u2', payerName: null, leftAt: '2026-11-01T10:00:00Z' };
    const { getByText } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    expect(getByText('Your 7 days after leaving ended')).toBeTruthy();
  });

  it('quick 261124-2bs: hides the 7-days line with no leftAt, and for the payer', async () => {
    for (const over of [{ leftAt: null }, { leftAt: '2026-11-01T10:00:00Z', payerIsMe: true }]) {
      mockPlan = { ...base, ...over };
      const { queryByTestId, unmount } = await render(
        <ThemeProvider>
          <PlanEndedScreen />
        </ThemeProvider>,
      );
      expect(queryByTestId('lock-after-seven')).toBeNull();
      await unmount();
    }
  });

  it('09-25 A5-1: the Needs a plan lines are information only: not buttons, no chevrons, no press handler', async () => {
    const { getByText, getByTestId, queryAllByRole } = await render(
      <ThemeProvider>
        <PlanEndedScreen />
      </ThemeProvider>,
    );
    const needs = getByTestId('plan-ended-needs');
    expect(getByText('Needs a plan')).toBeTruthy();
    for (const label of ['Adding or editing records', 'Importing', 'New Decide checks']) {
      const line = getByText(label);
      expect(line.props.onPress).toBeUndefined();
      expect(line.props.accessibilityRole).toBeUndefined();
      expect(queryAllByRole('button', { name: label })).toHaveLength(0);
    }
    // nothing inside the list is pressable or carries a chevron
    expect(within(needs).queryAllByRole('button')).toHaveLength(0);
    expect(within(needs).queryAllByTestId('row-root')).toHaveLength(0);
  });
});
