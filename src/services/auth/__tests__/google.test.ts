const mockHasPlayServices = jest.fn(async () => true);
const mockSignIn = jest.fn();
const mockSignInSilently = jest.fn();
const mockSignOut = jest.fn(async () => null);
const mockRevokeAccess = jest.fn(async () => null);
const mockConfigure = jest.fn();
const mockSignInWithIdToken = jest.fn(async (..._a: unknown[]) => ({ error: null }));
const mockForget = jest.fn(async (..._a: unknown[]) => []);

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    hasPlayServices: () => mockHasPlayServices(),
    signIn: (...a: unknown[]) => mockSignIn(...a),
    signInSilently: () => mockSignInSilently(),
    signOut: () => mockSignOut(),
    revokeAccess: () => mockRevokeAccess(),
    configure: (...a: unknown[]) => mockConfigure(...a),
  },
}));
jest.mock('@/services/supabase', () => ({
  supabase: { auth: { signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a) } },
}));
jest.mock('@/config/env', () => ({
  getEnv: () => ({ googleWebClientId: 'web', googleIosClientId: 'ios' }),
}));
jest.mock('@/features/auth/rememberedAccounts', () => ({
  forgetRememberedAccount: (...a: unknown[]) => mockForget(...a),
}));

import {
  continueWithGoogle,
  forgetGoogleOnAccountDeletion,
  signInWithDifferentGoogleAccount,
  signInWithGoogle,
} from '../google';

const user = (email: string, idToken: string | null) => ({ user: { email }, idToken });

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockImplementation(async () => null);
});

describe('continueWithGoogle', () => {
  it('uses the silent session when the email matches (case-insensitive)', async () => {
    mockSignInSilently.mockResolvedValue({ type: 'success', data: user('ANN@x.com', 't1') });
    await expect(continueWithGoogle('ann@x.com')).resolves.toEqual({ status: 'signedIn' });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 't1' });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('opens the hinted chooser on an email mismatch and resets configure', async () => {
    mockSignInSilently.mockResolvedValue({ type: 'success', data: user('other@x.com', 't1') });
    mockSignIn.mockResolvedValue({ type: 'success', data: user('ann@x.com', 't2') });
    await continueWithGoogle('ann@x.com');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockConfigure).toHaveBeenNthCalledWith(1, expect.objectContaining({ accountName: 'ann@x.com' }));
    expect(mockSignIn).toHaveBeenCalledWith({ loginHint: 'ann@x.com' });
    expect(mockConfigure).toHaveBeenLastCalledWith({ webClientId: 'web', iosClientId: 'ios' });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 't2' });
  });

  it('resets configure even when the chooser throws', async () => {
    mockSignInSilently.mockResolvedValue({ type: 'noSavedCredentialFound', data: null });
    mockSignIn.mockRejectedValue(new Error('boom'));
    await expect(continueWithGoogle('ann@x.com')).rejects.toThrow('boom');
    expect(mockConfigure).toHaveBeenLastCalledWith({ webClientId: 'web', iosClientId: 'ios' });
  });

  it('falls back to the chooser when silent throws or has no idToken', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: user('ann@x.com', 't3') });
    mockSignInSilently.mockRejectedValueOnce(new Error('x'));
    await continueWithGoogle('ann@x.com');
    mockSignInSilently.mockResolvedValueOnce({ type: 'success', data: user('ann@x.com', null) });
    await continueWithGoogle('ann@x.com');
    expect(mockSignIn).toHaveBeenCalledTimes(2);
  });

  it('returns cancelled without exchanging a token', async () => {
    mockSignInSilently.mockResolvedValue({ type: 'noSavedCredentialFound', data: null });
    mockSignIn.mockResolvedValue({ type: 'cancelled', data: null });
    await expect(continueWithGoogle('ann@x.com')).resolves.toEqual({ status: 'cancelled' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('signInWithDifferentGoogleAccount', () => {
  it('signs out first, ignoring a rejecting signOut', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('x'));
    mockSignIn.mockResolvedValue({ type: 'success', data: user('b@x.com', 't')});
    await expect(signInWithDifferentGoogleAccount()).resolves.toEqual({ status: 'signedIn' });
    expect(mockSignOut.mock.invocationCallOrder[0]!).toBeLessThan(mockSignIn.mock.invocationCallOrder[0]!);
  });
});

describe('forgetGoogleOnAccountDeletion', () => {
  it('forgets, revokes and signs out, swallowing failures', async () => {
    mockRevokeAccess.mockRejectedValueOnce(new Error('x'));
    mockSignOut.mockRejectedValueOnce(new Error('y'));
    await expect(forgetGoogleOnAccountDeletion('ann@x.com')).resolves.toBeUndefined();
    expect(mockForget).toHaveBeenCalledWith('google', 'ann@x.com');
    expect(mockRevokeAccess).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe('signInWithGoogle', () => {
  it('still exchanges the token', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: user('a@x.com', 'tt') });
    await expect(signInWithGoogle()).resolves.toEqual({ status: 'signedIn' });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'tt' });
  });
});
