// SYN-01/SYN-02/SYN-06: proves isReachable's truth table, that startOnlineManager wires
// NetInfo into TanStack Query's onlineManager exactly once regardless of call count, and that
// a simulated NetInfo event actually flips onlineManager.isOnline().
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { isReachable, startOnlineManager } from '../onlineManager';

describe('isReachable', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: null, isInternetReachable: null }, true],
    [{ isConnected: false, isInternetReachable: true }, false],
    [{ isConnected: false, isInternetReachable: null }, false],
    [{ isConnected: true, isInternetReachable: false }, false],
    [{ isConnected: false, isInternetReachable: false }, false],
  ])('isReachable(%o) === %s', (state, expected) => {
    expect(isReachable(state)).toBe(expected);
  });
});

describe('startOnlineManager', () => {
  // startOnlineManager is idempotent at module scope (a `started` guard), so these two tests
  // share one real registration on purpose: the first proves it only happens once, the second
  // reuses the listener that registration captured. Mocks are intentionally not cleared
  // between them for that reason.
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('registers exactly one NetInfo listener even when called more than once', () => {
    startOnlineManager();
    startOnlineManager();

    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('flips onlineManager.isOnline() to false when NetInfo reports offline', () => {
    const netInfoListener = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0] as (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => void;

    netInfoListener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    netInfoListener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
