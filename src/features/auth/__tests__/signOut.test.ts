// D-15: requestSignOut() warns (needsConfirm) when writes are pending and signs out
// immediately when nothing is pending; performSignOut() runs analytics.disable(), the
// Supabase local sign-out, wipeDeviceData() and resetTheme() in that order, and still wipes
// locally when the Supabase call rejects (offline).
import { requestSignOut, performSignOut } from '../signOut';

function makeDeps(overrides: Partial<Parameters<typeof performSignOut>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      getPendingWriteCount: jest.fn().mockResolvedValue(0),
      wipeDeviceData: jest.fn(async () => {
        calls.push('wipeDeviceData');
      }),
      analytics: {
        disable: jest.fn(async () => {
          calls.push('analytics.disable');
        }),
      },
      supabase: {
        auth: {
          signOut: jest.fn(async () => {
            calls.push('supabase.signOut');
            return { error: null };
          }),
        },
      },
      resetTheme: jest.fn(() => {
        calls.push('resetTheme');
      }),
      ...overrides,
    },
  };
}

describe('requestSignOut', () => {
  it('returns needsConfirm with the pending count when writes are queued, without signing out', async () => {
    const { deps } = makeDeps({ getPendingWriteCount: jest.fn().mockResolvedValue(3) });

    const result = await requestSignOut(deps);

    expect(result).toEqual({ needsConfirm: true, count: 3 });
    expect(deps.wipeDeviceData).not.toHaveBeenCalled();
    expect(deps.analytics.disable).not.toHaveBeenCalled();
  });

  it('signs out immediately with no confirmation when nothing is pending', async () => {
    const { deps, calls } = makeDeps({ getPendingWriteCount: jest.fn().mockResolvedValue(0) });

    const result = await requestSignOut(deps);

    expect(result).toEqual({ needsConfirm: false });
    expect(calls).toEqual(['analytics.disable', 'supabase.signOut', 'wipeDeviceData', 'resetTheme']);
  });
});

describe('performSignOut', () => {
  it('calls analytics.disable, supabase signOut with scope local, wipeDeviceData and resetTheme in order', async () => {
    const { deps, calls } = makeDeps();

    await performSignOut(deps);

    expect(deps.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(calls).toEqual(['analytics.disable', 'supabase.signOut', 'wipeDeviceData', 'resetTheme']);
  });

  it('still wipes locally and resolves when the Supabase sign-out call rejects (offline)', async () => {
    const { deps, calls } = makeDeps({
      supabase: {
        auth: {
          signOut: jest.fn().mockRejectedValue(new Error('offline')),
        },
      },
    });

    await expect(performSignOut(deps)).resolves.toBeUndefined();

    expect(calls).toEqual(['analytics.disable', 'wipeDeviceData', 'resetTheme']);
  });
});
