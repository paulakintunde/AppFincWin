// D-13: proves identity rendering (full_name or email fallback + email sub-label), the live
// accent/font-pairing switchers (pressing a swatch/row calls setAccent/setPairing and the
// ring/indicator updates in the same render tree via the real ThemeProvider), the analytics
// toggle reflecting/updating consent, ConnectionStatus's three states, and the D-15 sign-out
// flow (silent when nothing pending, Alert-gated and only proceeding on confirm otherwise).
import { AccessibilityInfo, Alert, AppState, Linking } from 'react-native';
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

const mockGoBack = jest.fn();
let mockHistory: { area: string; tab?: string; href: string }[] = [{ area: 'tab', tab: 'home', href: '/home' }];
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({
  useBackHistory: () => ({ goBack: mockGoBack, canGoBack: true, history: mockHistory }),
}));

// D-85: the FAB's registered quick actions, and You's navigation (transitionEnd).
const mockRuns: Record<string, jest.Mock> = {};
let mockQuickIds: string[] = [];
jest.mock('@/shell/fab/FabProvider', () => ({
  useFab: () => ({
    quickActions: mockQuickIds.map((id) => ({ id, label: id, run: mockRuns[id] })),
  }),
}));
let mockTransitionListener: ((e: { data: { closing: boolean } }) => void) | null = null;
const mockRemoveTransition = jest.fn();
const mockAddListener = jest.fn((_name: string, fn: (e: { data: { closing: boolean } }) => void) => {
  mockTransitionListener = fn;
  return mockRemoveTransition;
});

const mockRouterPush = jest.fn();
let mockSearch: { focus?: string } = {};
const mockRouterDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearch,
  useNavigation: () => ({ addListener: (...a: [string, never]) => mockAddListener(...a) }),
  router: {
    push: (...a: unknown[]) => mockRouterPush(...a),
    dismissTo: (...a: unknown[]) => mockRouterDismissTo(...a),
  },
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

// SYN-06 (01-15): SyncStatusLine reads useSyncStatus() directly -- mocked here so this
// screen-level test never needs a real QueryClient/TanStack mutation cache.
let mockSyncStatus = { isOnline: false, queued: 3, failed: 0, conflicts: 0, lastSyncedAt: null as number | null };
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => mockSyncStatus,
}));

// 01-15: DevSyncProbe has its own dedicated test file covering its hook wiring (useAuth,
// useHouseholdId, useMoneyPrefs, useAccounts, useAddAccount, useAddTransaction). Stubbed out
// here so this screen-level test never needs AuthProvider/QueryClientProvider wrapping just
// to satisfy a dev-only row unrelated to what this file verifies.
jest.mock('../components/DevSyncProbe', () => ({
  DevSyncProbe: () => null,
}));

// 02.2-32: the Money group's week-start and home-currency rows have their own data hooks;
// stubbed here so this screen-level test needs no providers.
const mockSetWeekStart = jest.fn();
let mockWeekStart: 0 | 1 = 1;
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    weekStart: mockWeekStart,
    region: 'GB',
  }),
}));
jest.mock('@/data/mutations/recordPrefs', () => ({
  useUpdateRecordPrefs: () => ({ setWeekStart: (...a: unknown[]) => mockSetWeekStart(...a) }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({ options: [{ code: 'GBP', name: 'Pound', exponent: 2 }] }),
}));
jest.mock('@/data/mutations/homeCurrency', () => ({
  useChangeHomeCurrency: () => ({ change: jest.fn(), pending: false }),
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
  mockHistory = [{ area: 'tab', tab: 'home', href: '/home' }];
  mockQuickIds = ['addExpense', 'addIncome', 'transfer', 'importStatement', 'newCheck'];
  for (const id of mockQuickIds) mockRuns[id] = jest.fn();
  mockTransitionListener = null;
  mockSearch = {};
  mockProfile = {
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Ada Lovelace',
    email: 'ada@example.com',
  };
  mockConsent = 'declined';
  mockSyncStatus = { isOnline: false, queued: 3, failed: 0, conflicts: 0, lastSyncedAt: null };
  mockCheckConnection.mockResolvedValue({ ok: true, latencyMs: 42 });
  mockRequestSignOut.mockResolvedValue({ needsConfirm: false });
  appStateCallback = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((..._args: unknown[]) => {
    appStateCallback = _args[1] as (state: string) => void;
    return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
  });
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

describe('YouScreen sync status', () => {
  it("shows 'offline · 3 changes waiting' in the Connection section", async () => {
    const { getByText } = await renderScreen();
    expect(getByText('offline · 3 changes waiting')).toBeTruthy();
  });
});

describe('YouScreen back button', () => {
  it('goes back through the shell back history', async () => {
    const { getByLabelText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Back'));
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

// 02-30: the Money section links to every Record screen.
describe('YouScreen Money section', () => {
  it('lists the four Record entry points and navigates to each', async () => {
    const { getByText, queryByText } = await renderScreen();
    expect(getByText('Money')).toBeTruthy();
    expect(queryByText('Import CSV')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Activity'));
      fireEvent.press(getByText('Accounts'));
      fireEvent.press(getByText('Categories'));
      fireEvent.press(getByText('History'));
    });
    expect(mockRouterDismissTo).toHaveBeenCalledWith('/activity');
    expect(mockRouterPush.mock.calls.map((c) => c[0])).toEqual([
      '/accounts',
      '/categories',
      '/history',
    ]);
  });
});

describe('YouScreen Money rows are full-size touch targets (S-WR-14)', () => {
  it('each row is at least 44pt tall', async () => {
    const { getByRole } = await renderScreen();
    for (const name of ['Activity', 'Accounts', 'Categories', 'History']) {
      const style = Object.assign({}, ...[].concat(getByRole('button', { name }).props.style ?? []));
      expect(style.minHeight).toBe(44);
    }
  });
});

// 05-98 (D-85, R16.1): the always-reachable Add group.
describe('YouScreen Add group (D-85)', () => {
  it('D-85 the Add group is first with five rows', async () => {
    const { getByText, getByRole, getAllByRole } = await renderScreen();
    expect(getByText('Add')).toBeTruthy();
    const hints = [
      'Opens the entry sheet',
      'Opens the entry sheet',
      'Opens the transfer sheet',
      'Opens statement import',
      'Starts a new affordability check',
    ];
    const labels = ['Add expense', 'Add income', 'Transfer', 'Import statement', 'New check'];
    labels.forEach((label, i) => {
      expect(getByRole('button', { name: label }).props.accessibilityHint).toBe(hints[i]);
    });
    // Tree order: the Add rows come before the Money rows.
    const order = getAllByRole('button').map((b) => b.props.accessibilityHint ?? '');
    const first = order.findIndex((h) => h === hints[0]);
    expect(order.slice(first, first + 5)).toEqual(hints);
    expect(order[first + 5]).toBe('');
  });

  it('D-85 a row closes You, then runs the quick action after the transition', async () => {
    mockHistory = [{ area: 'tab', tab: 'activity', href: '/activity' }];
    const { getByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByText('Add expense'));
    });
    expect(mockRouterDismissTo).toHaveBeenCalledWith('/activity');
    expect(mockAddListener).toHaveBeenCalledWith('transitionEnd', expect.any(Function));
    expect(mockRuns.addExpense).not.toHaveBeenCalled();

    await act(async () => {
      mockTransitionListener?.({ data: { closing: false } });
    });
    expect(mockRuns.addExpense).not.toHaveBeenCalled();

    await act(async () => {
      mockTransitionListener?.({ data: { closing: true } });
    });
    expect(mockRuns.addExpense).toHaveBeenCalledTimes(1);
    expect(mockRemoveTransition).toHaveBeenCalled();
  });

  it('D-85 a row without a handler is hidden', async () => {
    mockQuickIds = ['addExpense', 'transfer'];
    const { queryByText, getByText } = await renderScreen();
    expect(getByText('Add expense')).toBeTruthy();
    expect(getByText('Transfer')).toBeTruthy();
    expect(queryByText('Add income')).toBeNull();
    expect(queryByText('Import statement')).toBeNull();
    expect(queryByText('New check')).toBeNull();
  });

  it('D-85 the Money group has no import row', async () => {
    mockQuickIds = [];
    const { queryByText, getByText } = await renderScreen();
    expect(getByText('Money')).toBeTruthy();
    expect(queryByText('Import statement')).toBeNull();
    expect(queryByText('Add')).toBeNull();
  });
});

describe('YouScreen credits', () => {
  it('renders the open.er-api credit line and opens its URL when pressed', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const { getByText, getByRole } = await renderScreen();
    expect(getByText('Rates By Exchange Rate API')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByRole('link'));
    });

    expect(openURLSpy).toHaveBeenCalledWith('https://www.exchangerate-api.com');
  });
});

describe('YouScreen Money settings (02.2-32)', () => {
  it('shows week start (Monday) with its sub-label, and picking Sunday calls setWeekStart(0)', async () => {
    mockWeekStart = 1;
    const { getByText, getByLabelText } = await renderScreen();
    expect(getByText('Monday')).toBeTruthy();
    expect(getByText('Used by the calendar and week view')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByLabelText('Week starts on'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Sunday'));
    });
    expect(mockSetWeekStart).toHaveBeenCalledWith(0);
  });

  it('shows the Home currency row with the current code', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('Home currency')).toBeTruthy();
    expect(getByText('GBP')).toBeTruthy();
  });
});

describe('YouScreen focus param (05-116)', () => {
  const layout = { nativeEvent: { layout: { x: 0, y: 600, width: 300, height: 44 } } };

  it('D-96 Exchange rates opens You focused on the currency row', async () => {
    mockSearch = { focus: 'currencies' };
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const { getByLabelText } = await renderScreen();
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent(getByLabelText('Home currency'), 'layout', layout);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
    // A second layout (a re-render) does not steal focus again.
    await act(async () => {
      fireEvent(getByLabelText('Home currency'), 'layout', layout);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('D-96 without the focus param the currency row takes no focus', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const { getByLabelText } = await renderScreen();
    await act(async () => {
      fireEvent(getByLabelText('Home currency'), 'layout', layout);
    });
    expect(send).not.toHaveBeenCalled();
  });
});
