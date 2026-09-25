// ACC-01, D-11, T-00-15-01/03: proves the nonce direction (hashed to Apple, raw to Supabase),
// that persistFirstAuthProfile is awaited before signInWithApple() resolves (ACC-03), that a
// user-cancelled native flow resolves {status:'cancelled'} rather than throwing, and the
// Android web-OAuth path (D-11): PKCE code exchange on success, cancelled on dismiss.
//
// jest.mock() factories may only reference out-of-scope variables prefixed with `mock`
// (case-insensitive) -- every jest.fn() below follows that naming for exactly that reason.
let mockPlatformOS: 'ios' | 'android' = 'ios';
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

const mockSignInAsync = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();
const mockPersistFirstAuthProfile = jest.fn(async () => undefined);
const mockCreateNonce = jest.fn(async () => ({ raw: 'RAW_NONCE', hashed: 'HASHED_NONCE' }));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `fincwin://${path}`,
  parse: (url: string) => {
    const [, query = ''] = url.split('?');
    const queryParams: Record<string, string> = {};
    for (const pair of query.split('&').filter(Boolean)) {
      const [key, value] = pair.split('=');
      queryParams[key] = decodeURIComponent(value ?? '');
    }
    return { queryParams };
  },
}));

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
    },
  },
}));

jest.mock('../nonce', () => ({ createNonce: () => mockCreateNonce() }));
jest.mock('../firstAuthProfile', () => ({
  persistFirstAuthProfile: (...args: unknown[]) => mockPersistFirstAuthProfile(...args),
}));

import { signInWithApple } from '../apple';

afterEach(() => {
  jest.clearAllMocks();
});

describe('signInWithApple on iOS', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
  });

  it('sends the hashed nonce to Apple, the raw nonce to Supabase, and awaits persistFirstAuthProfile before resolving', async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
      email: 'x@privaterelay.appleid.com',
    });
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const order: string[] = [];
    mockPersistFirstAuthProfile.mockImplementation(async () => {
      order.push('persist-start');
      await Promise.resolve();
      order.push('persist-end');
    });

    const result = await signInWithApple();
    order.push('resolved');

    expect(mockSignInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'HASHED_NONCE' }));
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token',
      nonce: 'RAW_NONCE',
    });
    expect(mockPersistFirstAuthProfile).toHaveBeenCalledWith(
      'user-1',
      { givenName: 'Ada', familyName: 'Lovelace' },
      'x@privaterelay.appleid.com'
    );
    expect(order).toEqual(['persist-start', 'persist-end', 'resolved']);
    expect(result).toEqual({ status: 'signedIn' });
  });

  it('resolves cancelled without throwing on ERR_REQUEST_CANCELED', async () => {
    const err = Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
    mockSignInAsync.mockRejectedValue(err);

    const result = await signInWithApple();

    expect(result).toEqual({ status: 'cancelled' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('signInWithApple on Android', () => {
  beforeEach(() => {
    mockPlatformOS = 'android';
  });

  it('opens the Supabase OAuth URL and exchanges the returned code for a session', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://provider/authorize' }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'fincwin://auth-callback?code=abc' });
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    const result = await signInWithApple();

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: { redirectTo: 'fincwin://auth-callback', skipBrowserRedirect: true, scopes: 'name email' },
    });
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith('https://provider/authorize', 'fincwin://auth-callback');
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(result).toEqual({ status: 'signedIn' });
  });

  it('resolves cancelled when the browser is dismissed', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://provider/authorize' }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });

    const result = await signInWithApple();

    expect(result).toEqual({ status: 'cancelled' });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('throws when the redirect has no code', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://provider/authorize' }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'fincwin://auth-callback' });

    await expect(signInWithApple()).rejects.toThrow();
  });
});
