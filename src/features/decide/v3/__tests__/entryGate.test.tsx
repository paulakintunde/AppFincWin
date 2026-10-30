/**
 * 05.3-43 (DSV-01, DSV-02, D-04): with the engine on v2 every Decide entry point lands on Coming soon, and with v3 each one opens
 * the new screens. Covered: the tab, the FAB / You > Add quick action, the nine v3 routes (deep links), the layout's Stack.Protected
 * guards and notification observer switch, and the old check route (still behind DECIDE_OPEN, which stays false).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DECIDE_OPEN } from '@/features/decide/availability';
import AppLayout from '../../../../../app/(app)/_layout';
import TabsLayout from '../../../../../app/(app)/(tabs)/_layout';
import DecideTab from '../../../../../app/(app)/(tabs)/decide';
import PurchaseFile from '../../../../../app/(app)/decide/purchase/[id]';
import AnswerFile from '../../../../../app/(app)/decide/answer/[id]';
import PlanFile from '../../../../../app/(app)/decide/plan/[id]';
import InsteadFile from '../../../../../app/(app)/decide/instead/[id]';
import HelpFile from '../../../../../app/(app)/decide/help/[id]';
import WorkedFile from '../../../../../app/(app)/decide/worked';
import RefineFile from '../../../../../app/(app)/decide/refine';
import DecisionsFile from '../../../../../app/(app)/decide/decisions';
import EnvelopesFile from '../../../../../app/(app)/decide/envelopes';

jest.setTimeout(60000);

let mockV3 = false;
const mockGuards: { name: string; guard: boolean }[] = [];
let mockObserver: boolean | null = null;
const mockQuick: { id: string; run: () => void }[] = [];
const mockOpenNew = jest.fn();

jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  const { Text: T, View: V } = jest.requireActual('react-native');
  function Stack({ children }: { children?: React.ReactNode }) {
    return R.createElement(V, null, children);
  }
  Stack.Screen = function StackScreen() {
    return null;
  };
  Stack.Protected = function StackProtected({ guard, children }: { guard: boolean; children?: React.ReactNode }) {
    for (const c of R.Children.toArray(children) as { props: { name: string } }[]) mockGuards.push({ name: c.props.name, guard });
    return null;
  };
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => R.createElement(T, null, `redirect:${href}`),
    usePathname: () => '/decide',
    useLocalSearchParams: () => ({ id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b' }),
  };
});
jest.mock('expo-router/js-tabs', () => ({ Tabs: Object.assign(() => null, { Screen: () => null }) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3, testAccount: mockV3 }) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ loading: false, profile: null }) }));
jest.mock('@/shell/fab/FabProvider', () => ({
  FabProvider: ({ children }: { children: React.ReactNode }) => children,
  useProvideQuickAction: (id: string, run: () => void) => {
    const R = jest.requireActual('react');
    R.useEffect(() => {
      mockQuick.push({ id, run });
    }, [id, run]);
  },
}));
jest.mock('@/features/decide/v3/nav/hrefs', () => ({
  DECIDE_TAB_HREF: '/decide',
  openV3NewCheck: () => mockOpenNew(),
  answerHref: (id: string) => `/answer/${id}`,
}));
jest.mock('@/features/decide/notifications/useNotificationObserver', () => ({
  useNotificationObserver: (enabled: boolean) => {
    mockObserver = enabled;
  },
}));
// The layout's providers and hosts are pass-through; only the guards and the observer switch matter here.
jest.mock('@/features/navigation/SwipeBack', () => ({ SwipeBack: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/consent/useConsent', () => ({ useConsent: () => ({ loading: false, needsPrompt: false, consent: { analytics: true } }) }));
jest.mock('@/features/record/useDeviceHomeCurrencyDefault', () => ({ DeviceHomeCurrencyDefault: () => null }));
jest.mock('@/features/record/history/UndoToastHost', () => ({ SheetToastOverlay: () => null, UndoToastHost: () => null }));
jest.mock('@/features/record/samples/SampleBanner', () => ({ SampleBanner: () => null }));
jest.mock('@/features/record/samples/SampleClearPrompts', () => ({ SampleClearPrompts: () => null }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ BackHistoryProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/shell/backHistory/useAndroidBackHandler', () => ({ AndroidBackHandler: () => null }));
jest.mock('@/shell/layout/ShellLayoutProvider', () => ({ ShellLayoutProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/ui/sheetOverlay', () => ({ SheetOverlayProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/ui/RouteErrorBoundary', () => ({ RouteErrorBoundary: () => null }));
jest.mock('@/ui/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/theme/motion', () => ({ useReduceMotion: () => false }));
// The tabs layout's neighbours.
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ isLoading: false, isError: false, data: [{ id: 'a1', archived_at: null }] }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ ready: true, householdId: 'h1' }) }));
jest.mock('@/features/record/entry/ShellEntryHost', () => ({ ShellEntryHost: () => null }));
jest.mock('@/shell/fab/Fab', () => ({ Fab: () => null }));
jest.mock('@/shell/fab/FabQuickMenu', () => ({ FabQuickMenu: () => null }));
jest.mock('@/shell/tabBar/TabBar', () => ({ TabBar: () => null }));
jest.mock('@/shell/tabBar/TabSlideIn', () => ({ TabSlideIn: ({ children }: { children: React.ReactNode }) => children }));
// The tab root and the route bodies.
jest.mock('@/features/decide/home/DecideComingSoonScreen', () => ({ DecideComingSoonScreen: mockScreen('coming-soon') }));
jest.mock('@/features/decide/dev/ShadowExportDevMenu', () => ({ ShadowExportDevMenu: () => null }));
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => ({ V3Skeleton: () => null }));
jest.mock('@/features/decide/v3/nav/V3NotFound', () => ({ V3NotFound: () => null }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
function mockScreen(label: string): () => React.JSX.Element {
  return function MockScreen() {
    const { Text } = jest.requireActual('react-native');
    return <Text>{label}</Text>;
  };
}
jest.mock('@/features/decide/v3/home/HomeScreen', () => ({ HomeScreen: mockScreen('v3-home') }));
jest.mock('@/features/decide/v3/check/CheckScreen', () => ({ CheckScreen: mockScreen('screen:purchase') }));
jest.mock('@/features/decide/v3/layers/LayerStack', () => ({ LayerStack: () => null }));
jest.mock('@/shell/decide/V3RecordProvider', () => ({ V3RecordProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/decide/v3/answer/AnswerScreen', () => ({ AnswerScreen: mockScreen('screen:answer') }));
jest.mock('@/features/decide/v3/plan/WholePlanScreen', () => ({ WholePlanScreen: mockScreen('screen:plan') }));
jest.mock('@/features/decide/v3/instead/InsteadScreen', () => ({ InsteadScreen: mockScreen('screen:instead') }));
jest.mock('@/features/decide/v3/help/HelpScreen', () => ({ HelpScreen: mockScreen('screen:help') }));
jest.mock('@/features/decide/v3/worked/WorkedScreen', () => ({ WorkedScreen: mockScreen('screen:worked') }));
jest.mock('@/features/decide/v3/refine/RefineScreen', () => ({ RefineScreen: mockScreen('screen:refine') }));
jest.mock('@/features/decide/v3/lists/DecisionsScreen', () => ({ DecisionsScreen: mockScreen('screen:decisions') }));
jest.mock('@/features/decide/pots/PotsScreen', () => ({ PotsScreen: mockScreen('screen:envelopes') }));
jest.mock('@/shell/decide/GoalTagEditProvider', () => ({ GoalTagEditProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/shell/decide/SetupSheetHost', () => ({ useSetupSheetHost: () => undefined }));
jest.mock('@/data/queries/decideCheckV3', () => ({ useCheckV3: () => ({ status: 'ready', evaluation: { purchase: {} } }), useChecksV3: () => ({ status: 'ready', inputs: { months: [{ full: false }] } }) }));

const ROUTES: [string, () => React.JSX.Element, string][] = [
  ['decide/purchase/[id]', PurchaseFile, 'screen:purchase'],
  ['decide/answer/[id]', AnswerFile, 'screen:answer'],
  ['decide/plan/[id]', PlanFile, 'screen:plan'],
  ['decide/instead/[id]', InsteadFile, 'screen:instead'],
  ['decide/help/[id]', HelpFile, 'screen:help'],
  ['decide/worked', WorkedFile, 'screen:worked'],
  ['decide/refine', RefineFile, 'screen:refine'],
  ['decide/decisions', DecisionsFile, 'screen:decisions'],
  ['decide/envelopes', EnvelopesFile, 'screen:envelopes'],
];

beforeEach(() => {
  mockV3 = false;
  mockGuards.length = 0;
  mockObserver = null;
  mockQuick.length = 0;
  mockOpenNew.mockClear();
});

describe('Decide entry points when the engine is on v2', () => {
  it('keeps DECIDE_OPEN false, so the old check route stays behind a false guard', async () => {
    expect(DECIDE_OPEN).toBe(false);
    await render(<AppLayout />);
    const old = mockGuards.filter((g) => g.name === 'decide/check/[id]');
    expect(old).toHaveLength(1);
    expect(old[0]!.guard).toBe(false);
  });

  it('guards all nine v3 routes with false and turns the notification observer off', async () => {
    await render(<AppLayout />);
    for (const [name] of ROUTES) expect(mockGuards.find((g) => g.name === name)).toEqual({ name, guard: false });
    expect(mockObserver).toBe(false);
  });

  it('the tab shows Coming soon', async () => {
    await render(<DecideTab />);
    expect(screen.getByText('coming-soon')).toBeTruthy();
    expect(screen.queryByText('v3-home')).toBeNull();
  });

  it('registers no New check quick action, so the FAB menu and You > Add have none', async () => {
    await render(<TabsLayout />);
    expect(mockQuick.filter((q) => q.id === 'newCheck')).toHaveLength(0);
  });

  for (const [name, File] of ROUTES) {
    it(`a deep link to ${name} is redirected to the Decide tab`, async () => {
      await render(<File />);
      expect(screen.getByText('redirect:/decide')).toBeTruthy();
      expect(screen.queryByText(/^screen:/)).toBeNull();
    });
  }
});

describe('Decide entry points when the engine is on v3', () => {
  beforeEach(() => {
    mockV3 = true;
  });

  it('opens the v3 routes and turns the notification observer on', async () => {
    await render(<AppLayout />);
    for (const [name] of ROUTES) expect(mockGuards.find((g) => g.name === name)).toEqual({ name, guard: true });
    expect(mockObserver).toBe(true);
  });

  it('the tab shows the v3 home', async () => {
    await render(<DecideTab />);
    expect(screen.getByText('v3-home')).toBeTruthy();
    expect(screen.queryByText('coming-soon')).toBeNull();
  });

  it('registers the New check quick action, and it opens a v3 check', async () => {
    await render(<TabsLayout />);
    const q = mockQuick.filter((x) => x.id === 'newCheck');
    expect(q).toHaveLength(1);
    q[0]!.run();
    expect(mockOpenNew).toHaveBeenCalledTimes(1);
  });

  for (const [name, File, label] of ROUTES) {
    it(`${name} renders its screen`, async () => {
      await render(<File />);
      expect(screen.getByText(label)).toBeTruthy();
    });
  }
});
