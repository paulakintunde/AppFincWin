// 05.3-103: onlineManager logs only in development builds.
import NetInfo from '@react-native-community/netinfo';
import { QueryClient } from '@tanstack/react-query';
import { resetOnlineManagerForTests, startOnlineManager } from '../onlineManager';
import { resetQueueDiagnosticsForTests } from '../sync/queueDiagnostics';

jest.mock('@/config/env', () => ({ getEnv: () => ({ supabaseUrl: 'https://abc.supabase.co/' }) }));

type Listener = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;

function listenerFor(qc: QueryClient): Listener {
  resetOnlineManagerForTests();
  (NetInfo.addEventListener as jest.Mock).mockClear();
  startOnlineManager(qc);
  // TanStack subscribes lazily; subscribing to the manager triggers the event listener setup.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { onlineManager } = require('@tanstack/react-query') as typeof import('@tanstack/react-query');
  const unsub = onlineManager.subscribe(() => undefined);
  unsub();
  const calls = (NetInfo.addEventListener as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as Listener;
}

describe('onlineManager diagnostics', () => {
  const original = (global as { __DEV__?: boolean }).__DEV__;
  let spy: jest.SpyInstance;
  beforeEach(() => {
    resetQueueDiagnosticsForTests();
    spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = original;
    spy.mockRestore();
  });

  it('logs a change in a dev build', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    const listener = listenerFor(new QueryClient());
    listener({ isConnected: true, isInternetReachable: false });
    expect(spy).toHaveBeenCalledWith('[sync-diag]', expect.stringContaining('"source":"netinfo"'));
  });

  it('05.3-116 logs a reachability blip as unreachable while still online', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    const listener = listenerFor(new QueryClient());
    listener({ isConnected: true, isInternetReachable: false });
    const line = spy.mock.calls.find((c) => c[0] === '[sync-diag]')?.[1] as string;
    expect(JSON.parse(line)).toMatchObject({ source: 'netinfo', net: 'unreachable', online: true });
    resetOnlineManagerForTests();
  });

  it('logs nothing when __DEV__ is false', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    const listener = listenerFor(new QueryClient());
    listener({ isConnected: true, isInternetReachable: false });
    expect(spy).not.toHaveBeenCalled();
  });
});
