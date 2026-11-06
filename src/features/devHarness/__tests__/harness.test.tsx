// 05.4-34 (BO-03, APP-04; T-05.4-34-01, T-05.4-34-03): the dev harness gates, the redirect, the Record-as-bought wiring and the
// engine timing read-out.
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'check-1' }));
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text> };
});
jest.mock('@/ui/Text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@/ui/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/ui/Pill', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    Pill: ({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" onPress={disabled ? undefined : onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

const mockRc = {
  ready: true,
  userId: 'u1',
  householdId: 'h1',
  homeCurrency: 'USD',
  timeZone: 'UTC',
  today: '2026-11-05',
};
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockRc }));

const mockAccount = { id: 'acc1', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null };
let mockAccounts: unknown[] = [mockAccount];
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ builtinIds: new Map([['Debt', 'cat-debt'], ['Insurance', 'cat-ins']]) }),
}));
const mockQc = new (jest.requireActual('@tanstack/react-query').QueryClient)();
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => mockQc }));
const mockCreate = jest.fn();
jest.mock('@/data/mutations/decideChecks', () => ({ useCreateCheck: () => ({ create: mockCreate, pendingIds: [], pendingRows: [] }) }));
const mockRecord = jest.fn();
jest.mock('@/data/mutations/boughtWrite', () => ({ useRecordBought: () => ({ record: mockRecord, canRecord: () => true }) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));

import { BoughtWriteHarness, waitForSavedCheck } from '../BoughtWriteHarness';
import { DevHarnessScreen } from '../DevHarnessScreen';
import { EnginePerfHarness, PERF_CALLS, percentile, runEngineTiming } from '../EnginePerfHarness';
import { boughtHarnessEnabled, harnessEnabled } from '../harnessEnabled';
import { SAMPLE_NAME } from '../sampleBought';

const g = globalThis as unknown as { __DEV__: boolean };
const originalDev = g.__DEV__;
const originalPerf = process.env.EXPO_PUBLIC_PERF;

function setGate(dev: boolean, perf: string | undefined): void {
  g.__DEV__ = dev;
  if (perf === undefined) delete process.env.EXPO_PUBLIC_PERF;
  else process.env.EXPO_PUBLIC_PERF = perf;
}

afterEach(() => {
  g.__DEV__ = originalDev;
  if (originalPerf === undefined) delete process.env.EXPO_PUBLIC_PERF;
  else process.env.EXPO_PUBLIC_PERF = originalPerf;
  mockAccounts = [mockAccount];
  mockQc.clear();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('harness gates', () => {
  it.each([
    [true, undefined, true, true],
    [false, undefined, false, false],
    [false, '1', true, false],
    [false, '0', false, false],
  ])('__DEV__ %s, EXPO_PUBLIC_PERF %s: route %s, bought harness %s', (dev, perf, route, bought) => {
    setGate(dev, perf);
    expect(harnessEnabled()).toBe(route);
    expect(boughtHarnessEnabled()).toBe(bought);
  });

  it('the layout registers the route only inside a Stack.Protected guarded by harnessEnabled()', () => {
    const src = readFileSync(join(__dirname, '../../../../app/(app)/_layout.tsx'), 'utf8');
    expect(src).toMatch(/<Stack\.Protected guard=\{harnessEnabled\(\)\}>\s*<Stack\.Screen name="decide\/dev-harness" \/>\s*<\/Stack\.Protected>/);
  });
});

describe('DevHarnessScreen', () => {
  it('redirects to Home in a production build', async () => {
    setGate(false, undefined);
    const view = await render(<DevHarnessScreen />);
    expect(view.getByText('redirect:/home')).toBeTruthy();
    expect(view.queryByTestId('perf-run')).toBeNull();
  });

  it('a perf build shows the engine timing only, never the bought harness', async () => {
    setGate(false, '1');
    const view = await render(<DevHarnessScreen />);
    expect(view.getByTestId('perf-run')).toBeTruthy();
    expect(view.queryByTestId('harness-record-bought')).toBeNull();
  });

  it('a dev build shows both', async () => {
    setGate(true, undefined);
    const view = await render(<DevHarnessScreen />);
    expect(view.getByTestId('perf-run')).toBeTruthy();
    expect(view.getByTestId('harness-record-bought')).toBeTruthy();
  });
});

const KEY = ['decide-checks', 'u1', 'h1'];

describe('waitForSavedCheck', () => {
  it('resolves at once when the check is already saved', async () => {
    mockQc.setQueryData(KEY, [{ id: 'c', created_by: 'u1' }]);
    await expect(waitForSavedCheck(mockQc, KEY, 'c')).resolves.toEqual({ id: 'c', created_by: 'u1' });
  });

  it('waits while it is pending, then resolves once it saves', async () => {
    mockQc.setQueryData(KEY, [{ id: 'c', created_by: 'u1', pending: true }]);
    const p = waitForSavedCheck(mockQc, KEY, 'c');
    mockQc.setQueryData(KEY, [{ id: 'other' }]);
    mockQc.setQueryData(KEY, [{ id: 'c', created_by: 'u1' }]);
    await expect(p).resolves.toEqual({ id: 'c', created_by: 'u1' });
  });

  it('gives null after the time limit', async () => {
    jest.useFakeTimers();
    const p = waitForSavedCheck(mockQc, KEY, 'c', 1000);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBeNull();
  });
});

describe('BoughtWriteHarness', () => {
  it('creates the check first, records only once it is saved, then shows done with an undo toast', async () => {
    mockRecord.mockReturnValue({ stepId: 'step-1' });
    mockQc.setQueryData(KEY, [{ id: 'check-1', created_by: 'u1', pending: true }]);
    const view = await render(<BoughtWriteHarness />);
    await act(async () => fireEvent.press(view.getByText('Record the sample as bought')));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'check-1', userId: 'u1', householdId: 'h1', kind: 'buy', name: SAMPLE_NAME })
    );
    expect(view.getByTestId('harness-bought-saving')).toBeTruthy();
    expect(mockRecord).not.toHaveBeenCalled();

    await act(async () => {
      mockQc.setQueryData(KEY, [{ id: 'check-1', created_by: 'u1' }]);
    });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const args = mockRecord.mock.calls[0][0];
    expect(args.check.id).toBe('check-1');
    expect(args.purchase).not.toBeNull();
    expect(args.ctx).toEqual(
      expect.objectContaining({ cashAccountId: 'acc1', debtCategoryId: 'cat-debt', runningCostCategoryId: 'cat-ins', currency: 'USD' })
    );
    expect(view.getByTestId('harness-bought-done')).toBeTruthy();
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-1' }));
  });

  it('shows refused when the write is refused', async () => {
    mockRecord.mockReturnValue(null);
    mockQc.setQueryData(KEY, [{ id: 'check-1', created_by: 'u1' }]);
    const view = await render(<BoughtWriteHarness />);
    await act(async () => fireEvent.press(view.getByText('Record the sample as bought')));
    expect(view.getByTestId('harness-bought-refused')).toBeTruthy();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('is not ready (and sends nothing) with no everyday account in the home currency', async () => {
    mockAccounts = [{ ...mockAccount, currency: 'EUR' }];
    const view = await render(<BoughtWriteHarness />);
    expect(view.getByTestId('harness-bought-not-ready')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByText('Record the sample as bought')));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('EnginePerfHarness', () => {
  it('percentile is nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile(Array.from({ length: 200 }, (_, i) => i + 1), 0.95)).toBe(190);
  });

  it('times PERF_CALLS calls with the clock given', () => {
    let t = 0;
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = runEngineTiming(() => (t += 0.5));
    expect(run).toEqual({ p50: 0.5, p95: 0.5, n: PERF_CALLS });
    expect(log).toHaveBeenCalledWith('[perf] judgeCheck p50=0.50 p95=0.50 n=200');
    log.mockRestore();
  });

  it('shows p50 and p95 after a run', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const view = await render(<EnginePerfHarness />);
    expect(view.queryByTestId('perf-p50')).toBeNull();
    await act(async () => fireEvent.press(view.getByText('Run 200 checks')));
    expect(view.getByTestId('perf-p50')).toHaveTextContent(/^p50 \d+\.\d{2} ms$/);
    expect(view.getByTestId('perf-p95')).toHaveTextContent(/^p95 \d+\.\d{2} ms$/);
    expect(view.getByTestId('perf-runs')).toHaveTextContent(/Run 1: p50/);
    log.mockRestore();
  }, 30_000);
});
