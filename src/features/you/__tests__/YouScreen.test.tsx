// D-13: proves identity rendering (full_name or email fallback + email sub-label), the live
// accent/font-pairing switchers (pressing a swatch/row calls setAccent/setPairing and the
// ring/indicator updates in the same render tree via the real ThemeProvider), the analytics
// toggle reflecting/updating consent, ConnectionStatus's three states, and the D-15 sign-out
// flow (silent when nothing pending, Alert-gated and only proceeding on confirm otherwise).
import { AccessibilityInfo, Alert, AppState, Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QUICK_ACTION_ORDER } from '@/shell/fab/quickActions';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetPushOnceForTests } from '@/shell/navigation/pushOnce';
import { setPlanWriteState } from '@/data/sync/planWriteGuard';
import { YouScreen } from '../YouScreen';
import { expectFits } from '@/test/textFitMatrix';

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
// 06.1-71: the Region row's writes and read (RegionRow.test.tsx covers them).
jest.mock('@/data/mutations/moneyPrefs', () => ({ useUpdateMoneyPrefs: () => ({ setRegion: jest.fn() }) }));
jest.mock('@/data/mutations/regionSubdivision', () => ({ useSetRegionSubdivision: () => jest.fn() }));
jest.mock('@/data/queries/regionSubdivision', () => ({ useRegionSubdivision: () => null }));

// 08-17: the Household row reads the household scope and the unread notices count.
let mockHousehold: { name: string; members: unknown[]; householdId: string | null; userId: string | null } = {
  name: 'Flat 4B',
  members: [{}, {}, {}],
  householdId: 'h1',
  userId: 'u1',
};
let mockUnread = 0;
jest.mock('@/features/household/useHouseholdScope', () => ({
  useHouseholdScope: () => mockHousehold,
}));
jest.mock('@/data/queries/household', () => ({
  useHouseholdEvents: () => ({ events: [], unreadCount: mockUnread, isLoading: false }),
}));

// 09-15: the Subscription and Features rows read plan state and feature access; stubbed so this screen test needs no providers.
let mockPlan: Record<string, unknown> = { status: 'sample' };
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
// 10-27: the Archive row shows only when the archive feature is on.
let mockArchiveOn = false;
jest.mock('@/features/levels/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ on: mockArchiveOn }),
  useAllFeatureAccess: () => [{ on: true }, { on: true }, { on: false }],
  useUserSetup: () => ({ data: { level: 2 }, loading: false }),
}));

// 10-27: the Security, Alerts and Archive rows read their own live values; stubbed so this screen test needs no providers.
let mockLock: { enabled: boolean; lockMethod: 'device' | 'appPin'; timing: string } = { enabled: false, lockMethod: 'device', timing: 'oneMinute' };
jest.mock('@/services/lock/lockStore', () => ({
  loadLockState: () => Promise.resolve({ settings: mockLock, hasPin: false, wrongTries: 0, lockUntil: null, backgroundedAt: null }),
}));
let mockAlertSettings: { enabled: boolean }[] | undefined;
jest.mock('@/data/queries/alerts', () => ({ useAlertSettings: () => ({ data: mockAlertSettings }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/features/archive/useArchiveState', () => ({ useArchiveState: () => ({ count: 3 }) }));

jest.setTimeout(60000);

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
  resetPushOnceForTests(); // the double-tap guard keeps module state between tests (05.4-34 made the Money rows use pushOnce)
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
  mockHousehold = { name: 'Flat 4B', members: [{}, {}, {}], householdId: 'h1', userId: 'u1' };
  mockUnread = 0;
  mockArchiveOn = false;
  mockLock = { enabled: false, lockMethod: 'device', timing: 'oneMinute' };
  mockAlertSettings = undefined;
  mockPlan = { status: 'sample' };
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

describe('YouScreen money rows (05.4-34 APP-11)', () => {
  it('a fast double tap on Accounts pushes one screen (pushOnce)', async () => {
    const { getByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByText('Accounts'));
      fireEvent.press(getByText('Accounts'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/accounts')).toHaveLength(1);
  });
});

describe('YouScreen Delete my account row (08-22, D-40)', () => {
  it('sits in the Account group and opens /delete-account', async () => {
    const { getByRole } = await renderScreen();
    const row = getByRole('button', { name: 'Delete my account' });
    await act(async () => {
      fireEvent.press(row);
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/delete-account')).toHaveLength(1);
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

    const toggle = getByRole('switch', { name: 'Share anonymous usage' });
    expect(toggle.props.accessibilityState?.checked).toBe(true);

    await act(async () => {
      fireEvent.press(toggle);
    });

    expect(mockSetEnabled).toHaveBeenCalledWith(false);
  });

  it('reflects declined consent as off, and toggling calls setEnabled(true)', async () => {
    mockConsent = 'declined';
    const { getByRole } = await renderScreen();

    const toggle = getByRole('switch', { name: 'Share anonymous usage' });
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

  it('You Money lists Goals after History (owner 2026-11-11)', async () => {
    const { getByText, getByRole, getAllByRole } = await renderScreen();
    const at = (n: string) => getAllByRole('button').indexOf(getByRole('button', { name: n }));
    expect(at('Goals')).toBe(at('History') + 1);
    await act(async () => {
      fireEvent.press(getByText('Goals'));
    });
    expect(mockRouterPush).toHaveBeenLastCalledWith('/grow?segment=goals');
  });

  it('D-101 the Add group has no Pots action', async () => {
    const { queryByRole } = await renderScreen();
    expect(queryByRole('button', { name: 'Add pot' })).toBeNull();
    expect(queryByRole('button', { name: 'Pots' })?.props.accessibilityHint).toBeUndefined();
    
    expect(QUICK_ACTION_ORDER).toEqual(['addExpense', 'addIncome', 'transfer', 'newCheck', 'importStatement']);
  });
});

// 09-25 (A5-4): in a locked (read-only) home every Money row that only opens a screen to read still opens it. Writes
// inside those screens are gated there (LockedSheet); the row itself is never gated or dead.
describe('09-25 A5-4: YouScreen Money rows open in a locked home', () => {
  afterEach(async () => {
    await act(() => setPlanWriteState(null));
  });
  it('Activity, Accounts, Categories, History, Goals, Household, Features and Subscription all navigate', async () => {
    mockPlan = { status: 'locked', writable: false, loading: false };
    setPlanWriteState({ status: 'locked', writable: false, loading: false });
    const { getByText } = await renderScreen();
    await act(async () => {
      for (const name of ['Activity', 'Accounts', 'Categories', 'History', 'Goals', 'Household', 'Features', 'Subscription']) {
        fireEvent.press(getByText(name));
      }
    });
    expect(mockRouterDismissTo).toHaveBeenCalledWith('/activity');
    expect(mockRouterPush.mock.calls.map((c) => c[0])).toEqual([
      '/accounts',
      '/categories',
      '/history',
      '/grow?segment=goals',
      '/household',
      '/features',
      '/subscription',
    ]);
  });
});

describe('YouScreen Money rows are full-size touch targets (S-WR-14)', () => {
  it('each row is at least 44pt tall (06.2 D-09: 52, the one-line Row)', async () => {
    const { getByRole } = await renderScreen();
    for (const name of ['Activity', 'Accounts', 'Categories', 'History']) {
      const style = Object.assign({}, ...[].concat(getByRole('button', { name }).props.style ?? []));
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
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

  it('06.1-71 (CN-10): Set your region opens You focused on the Region row', async () => {
    mockSearch = { focus: 'region' };
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const { getByLabelText, getByTestId } = await renderScreen();
    expect(getByLabelText('Region, United Kingdom')).toBeTruthy();
    await act(async () => {
      fireEvent(getByLabelText('Home currency'), 'layout', layout);
    });
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent(getByTestId('you-region'), 'layout', layout);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
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

// 06.2-15 (L04, D-06, D-21, D-28): the grouped You screen.
describe('YouScreen groups like L04 (06.2-15)', () => {
  // A whole-screen render; slow on a busy machine (the file's first render is a known slow case).
  const SLOW = 30_000;
  it('shows the groups in order: Add, Money, Appearance, Alerts and feel, Privacy and data, Account', async () => {
    const { getAllByRole } = await renderScreen();
    const headers = getAllByRole('header').map((h) => h.props.children);
    const order = ['Add', 'Money', 'Appearance', 'Alerts and feel', 'Privacy and data', 'Account'];
    expect(headers.filter((h: unknown) => order.includes(h as string))).toEqual(order);
    expect(headers).not.toContain('Connection');
  }, SLOW);

  it('every row has its accent tile and the settings show their current value', async () => {
    const { getAllByTestId, getByText, getAllByText } = await renderScreen();
    const tiles = getAllByTestId(/^you-tile-/, { includeHiddenElements: true }).map((n) => n.props.testID as string);
    for (const id of ['expense', 'activity', 'accounts', 'categories', 'history', 'goals', 'weekStart', 'homeCurrency', 'region', 'accent', 'font', 'haptics', 'analytics', 'connection', 'signOut']) {
      expect(tiles).toContain(`you-tile-${id}`);
    }
    // The theme keeps an earlier test's accent and pairing, so read whichever is current.
    expect(getAllByText(/^(Green|Navy|Rust|Slate)$/)).toHaveLength(1); // the Accent value (swatches have no text)
    expect(getAllByText(/^(Bold|Modern|Grotesk|Neutral)$/)).toHaveLength(5); // the Font pairing value and the four choices
    expect(getByText('Monday')).toBeTruthy();
  }, SLOW);

  it('has a Haptics switch, on by default, under Alerts and feel', async () => {
    const { getByRole } = await renderScreen();
    const sw = getByRole('switch', { name: 'Haptics' });
    expect(sw.props.accessibilityState?.checked).toBe(true);
  }, SLOW);

  it('keeps every text whole and every control a 44+ target (R6)', async () => {
    await renderScreen();
    expectFits();
  }, SLOW);

  it('adds no row for a feature that is not built (Face ID, PIN lock, Alerts, Delete account)', async () => {
    const { queryByText } = await renderScreen();
    for (const word of ['Face ID', 'PIN lock', 'Delete account', 'Download my data']) expect(queryByText(word)).toBeNull();
  }, SLOW);
});

describe('YouScreen Household row (08-17)', () => {
  it('shows the household name and people, opens /household, and carries the unread count', async () => {
    mockUnread = 2;
    const { getByText, getByLabelText } = await renderScreen();
    expect(getByText('Household')).toBeTruthy();
    expect(getByText('Flat 4B · 3 people')).toBeTruthy();
    expect(getByLabelText('Notices, 2 unread')).toBeTruthy();
    await fireEvent.press(getByText('Household'));
    expect(mockRouterPush).toHaveBeenCalledWith('/household');
  });

  it('says Just you for a household of one and shows no count', async () => {
    mockHousehold = { name: 'Your household', members: [{}], householdId: 'h1', userId: 'u1' };
    const { getByText, queryByLabelText } = await renderScreen();
    expect(getByText('Just you')).toBeTruthy();
    expect(queryByLabelText(/unread/)).toBeNull();
  });
});

describe('YouScreen Phase 9 rows (09-15)', () => {
  it('Subscription leads the Account group and opens SUBSCRIPTION_HREF one level down', async () => {
    mockPlan = { status: 'trial', payerIsMe: true, payerName: null, trialEndsAt: '2026-12-04T12:00:00Z', coveredUntil: null };
    const { getByText } = await renderScreen();
    expect(getByText(/Free trial · ends/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText('Subscription'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/subscription')).toHaveLength(1);
  });

  it('Subscription sublabel names the payer for a member', async () => {
    mockPlan = { status: 'active', payerIsMe: false, payerName: 'Sam', coveredUntil: '2027-01-09T12:00:00Z' };
    const { getByText } = await renderScreen();
    expect(getByText('Covered by Sam')).toBeTruthy();
  });

  it('Subscription sublabel says Read-only when locked', async () => {
    mockPlan = { status: 'locked', payerIsMe: false, payerName: null };
    const { getByText } = await renderScreen();
    expect(getByText('Read-only')).toBeTruthy();
  });

  it('Features shows the level and count and opens FEATURES_HREF', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('Everyday · 2 of 3 on')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText('Features'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/features')).toHaveLength(1);
  });

  it('Free help and Export your data open their routes in every plan state', async () => {
    mockPlan = { status: 'locked', payerIsMe: false, payerName: null };
    const { getByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByText('Free help'));
      fireEvent.press(getByText('Export your data'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/free-help')).toHaveLength(1);
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/export')).toHaveLength(1);
  });
});

describe('YouScreen Phase 10 rows (10-27)', () => {
  const SLOW = 30_000;
  const rowOrder = (labels: string[], root: { toJSON: () => unknown }): number[] => {
    const json = JSON.stringify(root.toJSON());
    return labels.map((l) => json.indexOf(`"${l}"`));
  };

  it('Privacy and data lists Security, analytics, connection, Export, Import from CSV, Diagnostic export in order', async () => {
    const r = await renderScreen();
    const idx = rowOrder(['Security', 'Share anonymous usage', 'Export your data', 'Import from CSV', 'Diagnostic export'], r);
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  }, SLOW);

  it('Security says Lock off, then names the method and timing, and opens /security', async () => {
    const r = await renderScreen();
    await waitFor(() => expect(r.getByText('Lock off')).toBeTruthy());
    await act(async () => {
      fireEvent.press(r.getByText('Security'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/security')).toHaveLength(1);
  }, SLOW);

  it('Security shows the lock method and timing when the lock is on', async () => {
    mockLock = { enabled: true, lockMethod: 'appPin', timing: 'fiveMinutes' };
    const r = await renderScreen();
    await waitFor(() => expect(r.getByText('FincWin PIN · after 5 minutes')).toBeTruthy());
  }, SLOW);

  it('Alerts sits above Haptics at every level, counts the switches that are on, and opens /alerts', async () => {
    mockAlertSettings = [{ enabled: true }, { enabled: true }, { enabled: false }];
    const r = await renderScreen();
    expect(r.getByText('2 on')).toBeTruthy();
    const idx = rowOrder(['Alerts', 'Haptics'], r);
    expect(idx[0]).toBeGreaterThanOrEqual(0);
    expect(idx[0]).toBeLessThan(idx[1]);
    await act(async () => {
      fireEvent.press(r.getByText('Alerts'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/alerts')).toHaveLength(1);
  }, SLOW);

  it('Archive is hidden while the archive feature is off', async () => {
    const off = await renderScreen();
    expect(off.queryByText('3 months')).toBeNull();
  }, SLOW);

  it('Archive shows after Features when the archive feature is on, with its month count', async () => {
    mockArchiveOn = true;
    const on = await renderScreen();
    expect(on.getByText('3 months')).toBeTruthy();
    const idx = rowOrder(['Features', 'Archive'], on);
    expect(idx[0]).toBeLessThan(idx[1]);
    await act(async () => {
      fireEvent.press(on.getByText('Archive'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/archive')).toHaveLength(1);
  }, SLOW);

  it('Import from CSV and Diagnostic export open their screens', async () => {
    const r = await renderScreen();
    await act(async () => {
      fireEvent.press(r.getByText('Import from CSV'));
    });
    await act(async () => {
      fireEvent.press(r.getByText('Diagnostic export'));
    });
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/data-import')).toHaveLength(1);
    expect(mockRouterPush.mock.calls.filter((c) => c[0] === '/diagnostic')).toHaveLength(1);
  }, SLOW);
});
