// 10-12 (ACC-07): a SIGNED_OUT this phone did not start wipes the phone copy once and records reason 'remote';
// a normal sign-out records 'local' and never triggers the remote path.
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

import { supabase } from '@/services/supabase';
import { AuthProvider } from '../AuthProvider';
import { performSignOut, registerThemeReset } from '../signOut';
import { consumeSignOutReason, lastSignOutReason, isLocalSignOutInProgress } from '../signOutReason';

const mockGetSession = jest.fn();
const mockWipe = jest.fn(async () => undefined);
const mockSupabaseSignOut = jest.fn();
let mockCallback: ((event: string, session: unknown) => void) | undefined;

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      signOut: (...a: unknown[]) => mockSupabaseSignOut(...a),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        mockCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));
jest.mock('@/services/auth', () => ({
  configureGoogle: jest.fn(),
  retryPendingFirstAuthProfile: jest.fn(async () => undefined),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  continueWithGoogle: jest.fn(),
  signInWithDifferentGoogleAccount: jest.fn(),
}));
jest.mock('../rememberedAccounts', () => ({
  ...jest.requireActual('../rememberedAccounts'),
  rememberAccount: jest.fn(),
}));
jest.mock('@/services/storage/wipe', () => ({
  getPendingWriteCount: jest.fn(async () => 0),
  wipeDeviceData: () => mockWipe(),
}));
const mockCapture = jest.fn();
jest.mock('@/services/errors', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('@/services/analytics', () => ({
  getAnalytics: () => ({ disable: jest.fn(async () => undefined) }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  consumeSignOutReason();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } });
  // Like GoTrue, a local sign-out emits SIGNED_OUT to the listener.
  mockSupabaseSignOut.mockImplementation(async () => {
    mockCallback?.('SIGNED_OUT', null);
  });
});

describe('remote sign-out', () => {
  it('wipes once and records remote when SIGNED_OUT was not started locally', async () => {
    const { result } = await renderHook(() => ({}), { wrapper });
    await waitFor(() => expect(mockCallback).toBeDefined());
    await act(async () => {
      mockCallback?.('SIGNED_OUT', null);
    });
    await waitFor(() => expect(mockWipe).toHaveBeenCalledTimes(1));
    expect(mockSupabaseSignOut).toHaveBeenCalledTimes(1);
    expect(lastSignOutReason()).toBe('remote');
    expect(isLocalSignOutInProgress()).toBe(false);
    expect(result.current).toBeDefined();
  });

  it('10-review (L-9): the remote sign-out resets the theme registered from inside the ThemeProvider', async () => {
    const reset = jest.fn();
    const unregister = registerThemeReset(reset);
    await renderHook(() => ({}), { wrapper });
    await waitFor(() => expect(mockCallback).toBeDefined());
    await act(async () => {
      mockCallback?.('SIGNED_OUT', null);
    });
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    unregister();
  });

  it('10-review (L-8): a failing remote wipe is reported, not dropped', async () => {
    mockWipe.mockRejectedValueOnce(new Error('wipe failed'));
    await renderHook(() => ({}), { wrapper });
    await waitFor(() => expect(mockCallback).toBeDefined());
    await act(async () => {
      mockCallback?.('SIGNED_OUT', null);
    });
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith(expect.any(Error), { area: 'auth' }));
  });

  it('records local and runs no extra wipe on a normal sign-out', async () => {
    await renderHook(() => ({}), { wrapper });
    await waitFor(() => expect(mockCallback).toBeDefined());
    await act(async () => {
      await performSignOut({ supabase: supabase as never });
    });
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(lastSignOutReason()).toBe('local');
  });

  it('consumeSignOutReason clears the reason', () => {
    jest.isolateModules(() => {
      const m = require('../signOutReason');
      m.setSignOutReason('remote');
      expect(m.consumeSignOutReason()).toBe('remote');
      expect(m.lastSignOutReason()).toBeNull();
    });
  });
});
