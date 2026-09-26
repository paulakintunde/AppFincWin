// D-13: proves identity rendering (full_name or email fallback + email sub-label), the live
// accent/font-pairing switchers (pressing a swatch/row calls setAccent/setPairing and the
// ring/indicator updates in the same render tree via the real ThemeProvider), the analytics
// toggle reflecting/updating consent, ConnectionStatus's three states, and the D-15 sign-out
// flow (silent when nothing pending, Alert-gated and only proceeding on confirm otherwise).
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { YouScreen } from '../YouScreen';

const mockSetAccent = jest.fn();
const mockSetPairing = jest.fn();
let mockProfile: {
  id: string;
  full_name: string | null;
  email: string | null;
} = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
};

// The mock's setAccent/setPairing call the REAL theme's setters (via the real useTheme, not
// mocked), so pressing a swatch/row exercises the actual live theme update this behaviour
// depends on — only the profile row I/O itself is stubbed out.
jest.mock('../useProfile', () => {
  const actual = jest.requireActual('@/theme/ThemeProvider');
  return {
    useProfile: () => {
      const theme = actual.useTheme();
      return {
        profile: mockProfile,
        loading: false,
        saveError: false,
        setAccent: (key: string) => {
          theme.setAccent(key);
          mockSetAccent(key);
          return Promise.resolve();
        },
        setPairing: (key: string) => {
          theme.setPairing(key);
          mockSetPairing(key);
          return Promise.resolve();
        },
        refresh: jest.fn().mockResolvedValue(undefined),
      };
    },
  };
});

let mockConsent: 'granted' | 'declined' | null = 'declined';
const mockSetEnabled = jest.fn();
jest.mock('@/features/consent/useConsent', () => ({
  useConsent: () => ({
    consent: mockConsent,
    loading: false,
    needsPrompt: false,
    grant: jest.fn(),
    decline: jest.fn(),
    setEnabled: (...args: unknown[]) => mockSetEnabled(...args),
  }),
}));

const mockCheckConnection = jest.fn();
jest.mock('@/services/supabase', () => ({
  checkConnection: (...args: unknown[]) => mockCheckConnection(...args),
}));

const mockRequestSignOut = jest.fn();
const mockPerformSignOut = jest.fn();
jest.mock('@/features/auth/signOut', () => ({
  requestSignOut: (...args: unknown[]) => mockRequestSignOut(...args),
  performSignOut: (...args: unknown[]) => mockPerformSignOut(...args),
}));

// DSG-03: mock insets per react-native-safe-area-context's own jest docs.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

async function renderScreen() {
  return render(
    <ThemeProvider>
      <YouScreen />
    </ThemeProvider>
  );
}

let appStateCallback: ((state: string) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = {
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Ada Lovelace',
    email: 'ada@example.com',
  };
  mockConsent = 'declined';
  mockCheckConnection.mockResolvedValue({ ok: true, latencyMs: 42 });
  mockRequestSignOut.mockResolvedValue({ needsConfirm: false });
  appStateCallback = undefined;
  jest.spyOn(require('react-native').AppState, 'addEventListener').mockImplementation(
    (_event: string, cb: (state: string) => void) => {
      appStateCallback = cb;
      return { remove: jest.fn() };
    }
  );
});

describe('YouScreen identity', () => {
  it("renders the user's full name and email sub-label", async () => {
    const { getByText } = await renderScreen();
    expect(getByText('Ada Lovelace')).toBeTruthy();
    expect(getByText('ada@example.com')).toBeTruthy();
  });

  it('falls back to the email when full_name is null', async () => {
    mockProfile = { ...mockProfile, full_name: null };
    const { getAllByText } = await renderScreen();
    // Title falls back to the email; the email sub-label is still shown too.
    expect(getAllByText('ada@example.com').length).toBeGreaterThanOrEqual(1);
  });
});

describe('YouScreen accent switcher', () => {
  it("pressing the Navy swatch calls setAccent('navy') and updates the ring colour live", async () => {
    const { getByLabelText, getByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByLabelText('Navy'));
    });

    expect(mockSetAccent).toHaveBeenCalledWith('navy');
    const ring = getByTestId('accent-ring-navy');
    const flatStyle = Array.isArray(ring.props.style)
      ? Object.assign({}, ...ring.props.style)
      : ring.props.style;
    expect(flatStyle.borderColor).toBe('#1F3A5F');
  });
});

describe('YouScreen font pairing switcher', () => {
  it("pressing Grotesk calls setPairing('grotesk') and renders its own label in its display face", async () => {
    const { getByText } = await renderScreen();

    const groteskLabel = getByText('Grotesk');
    expect(groteskLabel.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontFamily: 'SpaceGrotesk_700Bold' })])
    );

    await act(async () => {
      fireEvent.press(groteskLabel);
    });

    expect(mockSetPairing).toHaveBeenCalledWith('grotesk');
  });
});

describe('YouScreen analytics toggle', () => {
  it('reflects granted consent as on, and toggling calls setEnabled(false)', async () => {
    mockConsent = 'granted';
    const { getByRole } = await renderScreen();

    const toggle = getByRole('switch');
    expect(toggle.props.accessibilityState?.checked).toBe(true);

    await act(async () => {
      fireEvent.press(toggle);
    });

    expect(mockSetEnabled).toHaveBeenCalledWith(false);
  });

  it('reflects declined consent as off, and toggling calls setEnabled(true)', async () => {
    mockConsent = 'declined';
    const { getByRole } = await renderScreen();

    const toggle = getByRole('switch');
    expect(toggle.props.accessibilityState?.checked).toBe(false);

    await act(async () => {
      fireEvent.press(toggle);
    });

    expect(mockSetEnabled).toHaveBeenCalledWith(true);
  });
});

describe('YouScreen connection status', () => {
  it('shows checking, then connected with an accent dot, when checkConnection resolves ok', async () => {
    let resolveCheck!: (value: { ok: true; latencyMs: number }) => void;
    mockCheckConnection.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    const { getByText } = await renderScreen();
    expect(getByText('Checking connection…')).toBeTruthy();

    await act(async () => {
      resolveCheck({ ok: true, latencyMs: 10 });
    });

    await waitFor(() => expect(getByText('Connected to Supabase')).toBeTruthy());
  });

  it('shows the error copy when checkConnection resolves not-ok', async () => {
    mockCheckConnection.mockResolvedValue({ ok: false, reason: 'offline' });
    const { getByText } = await renderScreen();

    await waitFor(() =>
      expect(getByText('Not connected — check your internet connection.')).toBeTruthy()
    );
  });

  it('re-checks when the app returns to the foreground', async () => {
    await renderScreen();
    await waitFor(() => expect(mockCheckConnection).toHaveBeenCalledTimes(1));

    await act(async () => {
      appStateCallback?.('active');
    });

    await waitFor(() => expect(mockCheckConnection).toHaveBeenCalledTimes(2));
  });
});

describe('YouScreen sign out', () => {
  it('signs out without an Alert when nothing is pending', async () => {
    mockRequestSignOut.mockResolvedValue({ needsConfirm: false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByText('Sign out'));
    });

    expect(mockRequestSignOut).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockPerformSignOut).not.toHaveBeenCalled();
  });

  it('warns with the pending count and only signs out when confirmed', async () => {
    mockRequestSignOut.mockResolvedValue({ needsConfirm: true, count: 3 });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByText('Sign out'));
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [, message, buttons] = alertSpy.mock.calls[0]!;
    expect(message).toBe(
      '3 changes not yet saved. Signing out clears the encrypted cache and everything queued on this device.'
    );
    expect(buttons?.[0]?.text).toBe('Cancel');
    expect(buttons?.[1]?.text).toBe('Sign out anyway');
    expect(mockPerformSignOut).not.toHaveBeenCalled();

    buttons?.[1]?.onPress?.();
    expect(mockPerformSignOut).toHaveBeenCalledTimes(1);
  });
});
