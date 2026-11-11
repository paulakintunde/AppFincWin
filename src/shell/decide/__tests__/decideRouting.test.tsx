// 06.1-28 (D-05, ARC-11): one Decide in the routes. Every new route sits inside the DECIDE_OPEN gate, and every old path redirects.
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
  useLocalSearchParams: () => mockParams,
}));
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
  'decide/setup/done',
  'decide/setup/quick-estimates',
  'decide/past/index',
  'decide/past/[id]',
];
const OLD_ROUTES = ['decide/check/[id]', 'decide/settings', 'decide/open', 'decide/changes', 'decide/lines', 'decide/pots', 'setup/rough', 'setup/first-check'];

beforeEach(() => {
  mockRedirect.mockClear();
  mockParams = {};
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
