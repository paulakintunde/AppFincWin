// Quick 261124-2bs (UAT C2-3): the trial reminder tap opens Subscription on a cold start and on a warm tap, once.
import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useTrialReminderTap } from '../useTrialReminderTap';

jest.mock('expo-notifications', () => require('@/features/decide/__tests__/helpers/mockNotifications').notificationsMock());
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

type MockName = 'getLastNotificationResponseAsync' | 'clearLastNotificationResponseAsync' | 'addNotificationResponseReceivedListener';
const N = Notifications as unknown as Record<MockName, jest.Mock>;
const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';

function resp(data: Record<string, unknown>, identifier = 'req-1') {
  return { actionIdentifier: DEFAULT, notification: { request: { identifier, content: { data } } } } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  N.getLastNotificationResponseAsync.mockResolvedValue(null);
  N.clearLastNotificationResponseAsync.mockResolvedValue(undefined);
  N.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
});

describe('useTrialReminderTap', () => {
  it('routes a cold-start trial_end tap to Subscription once, then clears the stored response', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ kind: 'trial_end' }));
    await renderHook(() => useTrialReminderTap(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/subscription');
    expect(N.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  it('the same response arriving through the listener does not push again', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ kind: 'trial_end' }, 'same'));
    await renderHook(() => useTrialReminderTap(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0][0] as (r: unknown) => void;
    listener(resp({ kind: 'trial_end' }, 'same'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('a warm tap (listener) routes a new trial_end response', async () => {
    await renderHook(() => useTrialReminderTap(true));
    await waitFor(() => expect(N.addNotificationResponseReceivedListener).toHaveBeenCalled());
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0][0] as (r: unknown) => void;
    listener(resp({ kind: 'trial_end' }, 'warm'));
    expect(mockPush).toHaveBeenCalledWith('/subscription');
  });

  it('ignores wait and cooling_off taps: no push, no clear (the Decide observer owns them)', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ kind: 'wait', checkId: 'x' }));
    await renderHook(() => useTrialReminderTap(true));
    await waitFor(() => expect(N.getLastNotificationResponseAsync).toHaveBeenCalled());
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0][0] as (r: unknown) => void;
    listener(resp({ kind: 'cooling_off', checkId: 'x' }, 'r2'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(N.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ kind: 'trial_end' }));
    await renderHook(() => useTrialReminderTap(false));
    expect(N.getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(N.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
