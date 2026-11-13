// 06.1-28 (D-05, ARC-11): one Decide in the routes. Every new route sits inside the DECIDE_OPEN gate, and every old path redirects.
import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { BoughtRoute, SaveForItRoute } from '../ActionRoutes';

const mockRedirect = jest.fn();
let mockParams: Record<string, string | string[] | undefined> = {};
const mockRouter = { dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));

// 06.1-63: the Bought and Save for it route binders. Their data hooks are mocked at the edge; the screens are stand-ins that show
// which callbacks the route hands them.
type MockChecks = { data: unknown[] | undefined; isLoading: boolean; isError: boolean };
const mockData: { checks: MockChecks; engine: { status: 'loading' | 'error' | 'ready'; evaluation: unknown }; accounts: { data: unknown[] | undefined; isError: boolean } } = {
  checks: { data: [], isLoading: false, isError: false },
  engine: { status: 'ready', evaluation: {} },
  accounts: { data: [], isError: false },
};
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: true, today: '2026-11-12', timeZone: 'UTC' }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => mockData.checks }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockData.accounts }));
jest.mock('@/features/decide/screens/engine/useCheckEngine', () => ({
  useCheckEngine: () => ({ status: mockData.engine.status, evaluation: mockData.engine.evaluation, readyDate: () => null }),
}));
jest.mock('@/engine/decide/v3', () => ({ ...jest.requireActual('@/engine/decide/v3'), readStoredCheck: (inputs: unknown) => ({ check: inputs }) }));
jest.mock('@/ui/money/useMoneyFormatter', () => ({ useMoneyFormatter: () => ({ formatMoney: () => '$1', formatDate: (d: string) => d }) }));
jest.mock('@/data/mutations/decideGoAhead', () => ({ useGoAheadV3: () => ({ goAhead: jest.fn() }) }));
jest.mock('@/data/mutations/runningCostBills', () => ({ useAddRunningCostBill: () => ({ add: jest.fn() }) }));
jest.mock('@/shell/screen/DetailScreen', () => ({
  DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { Text, View } = jest.requireActual('react-native');
    return (
      <View>
        <Text testID="detail-title">{title}</Text>
        {children}
      </View>
    );
  },
}));
const mockBoughtProps = jest.fn();
const mockSaveProps = jest.fn();
jest.mock('@/features/decide/screens/actions/BoughtScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    BoughtScreen: (p: { onDone: () => void; accountsLoading?: boolean }) => {
      mockBoughtProps(p);
      return (
        <Text testID="bought-screen" onPress={p.onDone} />
      );
    },
  };
});
jest.mock('@/features/decide/screens/actions/SaveForItScreen', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    SaveForItScreen: (p: { onBackToDecide: () => void; onBackToAnswer: () => void; onSeeInGrow: (id: string) => void }) => {
      mockSaveProps(p);
      return (
        <View>
          <Text testID="save-to-decide" onPress={p.onBackToDecide} />
          <Text testID="save-to-answer" onPress={p.onBackToAnswer} />
          <Text testID="save-to-grow" onPress={() => p.onSeeInGrow('g1')} />
        </View>
      );
    },
  };
});
jest.mock('@/shell/decide/SetupChecklistRoute', () => {
  const R = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { SetupChecklistRoute: () => R.createElement(Text, null, 'checklist') };
});
jest.mock('@/features/decide/screens/ui/CheckNotFound', () => {
  const R = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { CheckNotFound: () => R.createElement(Text, null, 'not-found') };
});

const APP = path.resolve(__dirname, '../../../../app/(app)');
const layout = fs.readFileSync(path.join(APP, '_layout.tsx'), 'utf8');
const ID = '123e4567-e89b-42d3-a456-426614174000';

/** The Stack.Screen names inside a `<Stack.Protected guard={...}>` block. */
function protectedNames(guard: string): string[] {
  const start = layout.indexOf(`<Stack.Protected guard={${guard}}>`);
  expect(start).toBeGreaterThan(-1);
  const end = layout.indexOf('</Stack.Protected>', start);
  return [...layout.slice(start, end).matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((m) => m[1] as string);
}

const NEW_ROUTES = [
  'decide/answer/[id]',
  'decide/check/kind',
  'decide/check/price',
  'decide/check/costs',
  'decide/compare/[id]',
  'decide/save/[id]',
  'decide/bought/[id]',
  'decide/safety-net',
  'decide/setup/index',
  'decide/setup/pay',
  'decide/setup/bills',
  'decide/setup/debts',
  'decide/setup/net',
  'decide/setup/rules',
  'decide/setup/records',
  'decide/setup/quick-estimates',
  'decide/past/index',
  'decide/past/[id]',
];
const OLD_ROUTES = ['decide/check/[id]', 'decide/settings', 'decide/open', 'decide/changes', 'decide/lines', 'decide/pots', 'setup/rough', 'setup/first-check'];

beforeEach(() => {
  mockRedirect.mockClear();
  mockParams = {};
  jest.clearAllMocks();
  mockData.checks = { data: [{ id: ID, name: 'Laptop', inputs: { v: 2 }, deleted_at: null }], isLoading: false, isError: false };
  mockData.engine = { status: 'ready', evaluation: {} };
  mockData.accounts = { data: [], isError: false };
});

describe('06.1-28 routes are inside the Decide gate', () => {
  const gated = protectedNames('DECIDE_OPEN');
  it.each(NEW_ROUTES)('%s is registered inside DECIDE_OPEN and has a file', (name) => {
    expect(gated).toContain(name);
    expect(fs.existsSync(path.join(APP, `${name}.tsx`))).toBe(true);
  });
  it.each(OLD_ROUTES)('%s stays inside DECIDE_OPEN (its file is a redirect)', (name) => {
    expect(gated).toContain(name);
  });
  it('no Decide screen is registered outside the gate except the dev harness', () => {
    const all = [...layout.matchAll(/<Stack\.Screen name="(decide\/[^"]+)"/g)].map((m) => m[1] as string);
    const outside = all.filter((n) => !gated.includes(n));
    expect(outside).toEqual(['decide/dev-harness']);
  });
  it('the old setup.tsx file is gone, so setup/ is the only setup route', () => {
    expect(fs.existsSync(path.join(APP, 'decide/setup.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(APP, 'decide/setup/index.tsx'))).toBe(true);
  });
  it('the Decide tab renders DecideHome behind DECIDE_OPEN', () => {
    const tab = fs.readFileSync(path.join(APP, '(tabs)/decide.tsx'), 'utf8');
    expect(tab).toContain('DECIDE_OPEN ? <DecideHome />');
  });
  it('no route file under app/(app)/decide imports an old Decide folder', () => {
    const old = /features\/decide\/(check|home|quick|setup|settings|pots|ui|judgeOn|onboarding|copy|past)\//;
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const offenders = walk(path.join(APP, 'decide')).filter((f) => old.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

async function renderRoute(file: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Route = (require(path.join(APP, file)) as { default: () => React.JSX.Element }).default;
  await render(<Route />);
}

describe('06.1-28 old paths redirect', () => {
  it.each([
    ['decide/settings', '/decide/setup'],
    ['decide/open', '/decide'],
    ['decide/changes', '/decide'],
    ['decide/lines', '/decide'],
    ['decide/pots', '/decide'],
    ['setup/first-check', '/decide?focus=check'],
    ['setup/rough', '/decide/setup/quick-estimates?returnTo=/decide'],
  ])('%s -> %s', async (file, href) => {
    await renderRoute(file);
    expect(mockRedirect).toHaveBeenCalledWith(href);
  });

  it('decide/check/[id] goes to the answer (notification payloads)', async () => {
    mockParams = { id: ID };
    await renderRoute('decide/check/[id]');
    expect(mockRedirect).toHaveBeenCalledWith(`/decide/answer/${ID}`);
  });
  it.each([
    ['1', 'kind'],
    ['2', 'price'],
    ['3', 'costs'],
  ])('decide/check/[id]?step=%s goes to the stepper step %s', async (step, name) => {
    mockParams = { id: ID, step };
    await renderRoute('decide/check/[id]');
    expect(mockRedirect).toHaveBeenCalledWith(`/decide/check/${name}?id=${ID}`);
  });
  it('decide/check/[id] with a bad id shows not-found and does not redirect', async () => {
    mockParams = { id: '../x' };
    await renderRoute('decide/check/[id]');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it.each([
    [{ only: 'pay' }, '/decide/setup/pay'],
    [{ mode: 'standalone' }, '/decide/setup/pay'],
    [{ only: 'regular' }, '/decide/setup/bills'],
    [{ only: 'accountUse' }, '/decide/setup/records'],
  ])('decide/setup %j -> %s', async (params, href) => {
    mockParams = params;
    await renderRoute('decide/setup/index');
    expect(mockRedirect).toHaveBeenCalledWith(href);
  });
  it.each([{}, { only: 'share' }, { only: 'toString' }, { startAt: 'unusual' }])('decide/setup %j shows the checklist', async (params) => {
    mockParams = params;
    await renderRoute('decide/setup/index');
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('06.1-63 Bought and Save for it routes (CN-7 / CF-7, CN-12, CB-9, DC-2, DN-7)', () => {
  const routes = [
    ['Bought', () => <BoughtRoute id={ID} />, 'I bought it'],
    ['Save for it', () => <SaveForItRoute id={ID} />, 'Save for it'],
  ] as const;

  it.each(routes)('%s: while the checks load it shows the loading line in its frame, never the error card', async (_n, el, title) => {
    mockData.checks = { data: undefined, isLoading: true, isError: false };
    await wrap(el());
    expect(screen.getByTestId('answer-loading')).toBeTruthy();
    expect(screen.getByTestId('detail-title').props.children).toBe(title);
    expect(screen.queryByTestId('action-away')).toBeNull();
  });

  it.each(routes)('%s: while the engine loads it shows the loading line, never the error card (DC-2)', async (_n, el) => {
    mockData.engine = { status: 'loading', evaluation: null };
    await wrap(el());
    expect(screen.getByTestId('answer-loading')).toBeTruthy();
    expect(screen.queryByTestId('action-away')).toBeNull();
  });

  it.each(routes)('%s: a check that is not there shows "isn\'t here", not the error card', async (_n, el) => {
    mockData.checks = { data: [], isLoading: false, isError: false };
    await wrap(el());
    expect(screen.getByText('not-found')).toBeTruthy();
    expect(screen.queryByTestId('action-away')).toBeNull();
    expect(screen.queryByTestId('answer-loading')).toBeNull();
  });

  it.each(routes)('%s: a real engine failure shows the error card in its frame; Back to Decide goes home (DN-7)', async (_n, el, title) => {
    mockData.engine = { status: 'error', evaluation: null };
    await wrap(el());
    expect(screen.getByTestId('action-away')).toBeTruthy();
    expect(screen.getByTestId('detail-title').props.children).toBe(title);
    await fireEvent.press(screen.getByText('Back to Decide'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/decide');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it.each(routes)('%s: a failed checks read with nothing cached shows the error card', async (_n, el) => {
    mockData.checks = { data: undefined, isLoading: false, isError: true };
    await wrap(el());
    expect(screen.getByTestId('action-away')).toBeTruthy();
  });

  it('Bought: done (Back to Decide after Added to records) goes to Decide home', async () => {
    await wrap(<BoughtRoute id={ID} />);
    await fireEvent.press(screen.getByTestId('bought-screen'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/decide');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('Bought: accounts still loading are passed as loading, and only everyday accounts in the home currency are offered', async () => {
    mockData.accounts = { data: undefined, isError: false };
    await wrap(<BoughtRoute id={ID} />);
    expect(mockBoughtProps.mock.calls.at(-1)?.[0]).toMatchObject({ accounts: [], accountsLoading: true });
    mockData.accounts = {
      data: [
        { id: 'a1', name: 'Everyday', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null },
        { id: 'a2', name: 'Card', kind: 'credit', currency: 'USD', deleted_at: null, archived_at: null },
        { id: 'a3', name: 'Euro', kind: 'cash', currency: 'EUR', deleted_at: null, archived_at: null },
      ],
      isError: false,
    };
    await wrap(<BoughtRoute id={ID} />);
    expect(mockBoughtProps.mock.calls.at(-1)?.[0]).toMatchObject({ accounts: [{ id: 'a1', name: 'Everyday' }], accountsLoading: false });
  });

  it('06.1-77 (DC-3): Bought gets the record context’s today and time zone, never the engine’s purchase date', async () => {
    mockData.engine = { status: 'ready', evaluation: { result: { purchaseDate: '2026-11-13' }, purchase: null } };
    await wrap(<BoughtRoute id={ID} />);
    expect(mockBoughtProps.mock.calls.at(-1)?.[0]).toMatchObject({ today: '2026-11-12', timeZone: 'UTC' });
  });

  it('Save for it: Back to Decide goes home, Back to the answer goes back, See it in Grow replaces with the goal', async () => {
    await wrap(<SaveForItRoute id={ID} />);
    await fireEvent.press(screen.getByTestId('save-to-decide'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/decide');
    await fireEvent.press(screen.getByTestId('save-to-answer'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('save-to-grow'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/grow/goal/g1');
  });
});
