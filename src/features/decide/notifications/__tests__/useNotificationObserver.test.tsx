import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { checkIdFromResponse, useNotificationObserver } from '../useNotificationObserver';

jest.mock('expo-notifications', () =>
  require('@/features/decide/__tests__/helpers/mockNotifications').notificationsMock(),
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

type MockName =
  | 'setNotificationHandler'
  | 'setNotificationChannelAsync'
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'scheduleNotificationAsync'
  | 'cancelScheduledNotificationAsync'
  | 'cancelAllScheduledNotificationsAsync'
  | 'getLastNotificationResponseAsync'
  | 'clearLastNotificationResponseAsync'
  | 'addNotificationResponseReceivedListener';
const N = Notifications as unknown as Record<MockName, jest.Mock>;
const ID = '11111111-1111-4111-8111-111111111111';
const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';

function resp(data: Record<string, unknown>, identifier = 'req-1', actionIdentifier = DEFAULT) {
  return { actionIdentifier, notification: { request: { identifier, content: { data } } } } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  N.getLastNotificationResponseAsync.mockResolvedValue(null);
  N.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
});

describe('checkIdFromResponse', () => {
  it('accepts a default-action response with a uuid and known kind', () => {
    expect(checkIdFromResponse(resp({ checkId: ID, kind: 'wait' }))).toBe(ID);
    expect(checkIdFromResponse(resp({ checkId: ID, kind: 'cooling_off' }))).toBe(ID);
  });
  it('rejects null, other actions, bad ids and unknown kinds; ignores url', () => {
    expect(checkIdFromResponse(null)).toBeNull();
    expect(checkIdFromResponse(resp({ checkId: ID, kind: 'wait' }, 'r', 'other'))).toBeNull();
    expect(checkIdFromResponse(resp({ checkId: '../admin', kind: 'wait' }))).toBeNull();
    expect(checkIdFromResponse(resp({ checkId: 5, kind: 'wait' }))).toBeNull();
    expect(checkIdFromResponse(resp({ checkId: ID }))).toBeNull();
    expect(checkIdFromResponse(resp({ checkId: ID, kind: 'x' }))).toBeNull();
    expect(checkIdFromResponse(resp({ checkId: ID, kind: 'wait', url: '/evil' }))).toBe(ID);
  });
});

describe('useNotificationObserver', () => {
  it('routes a cold-start tap to step 3', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ checkId: ID, kind: 'wait' }));
    await renderHook(() => useNotificationObserver(true));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: ID, step: '3' } }),
    );
  });

  it('IN-B02: a routed tap clears the last response, so a remount does not push the check again', async () => {
    let last: unknown = resp({ checkId: ID, kind: 'wait' });
    N.getLastNotificationResponseAsync.mockImplementation(async () => last);
    N.clearLastNotificationResponseAsync.mockImplementation(async () => {
      last = null;
    });
    const first = await renderHook(() => useNotificationObserver(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(N.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
    await first.unmount();
    await renderHook(() => useNotificationObserver(true));
    await waitFor(() => expect(N.getLastNotificationResponseAsync).toHaveBeenCalledTimes(2));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('a cooling-off tap routes a bought check like any other', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ checkId: ID, kind: 'cooling_off' }));
    await renderHook(() => useNotificationObserver(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: ID, step: '3' } });
  });

  it('routes a listener tap once and removes the subscription on unmount', async () => {
    const remove = jest.fn();
    N.addNotificationResponseReceivedListener.mockReturnValue({ remove });
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ checkId: ID, kind: 'wait' }));
    const { unmount } = await renderHook(() => useNotificationObserver(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0]![0] as (r: unknown) => void;
    listener(resp({ checkId: ID, kind: 'wait' }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    listener(resp({ checkId: ID, kind: 'wait' }, 'req-2'));
    expect(mockPush).toHaveBeenCalledTimes(2);
    listener(resp({ checkId: 'bad', kind: 'wait' }, 'req-3'));
    expect(mockPush).toHaveBeenCalledTimes(2);
    await unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('does nothing while disabled and re-checks once when enabled', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(resp({ checkId: ID, kind: 'wait' }));
    const { rerender } = await renderHook(({ on }: { on: boolean }) => useNotificationObserver(on), {
      initialProps: { on: false },
    });
    expect(N.getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(N.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    await rerender({ on: true });
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });

  it('ignores a late cold-start result after unmount', async () => {
    let resolve!: (v: unknown) => void;
    N.getLastNotificationResponseAsync.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = await renderHook(() => useNotificationObserver(true));
    await unmount();
    resolve(resp({ checkId: ID, kind: 'wait' }));
    await Promise.resolve();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
