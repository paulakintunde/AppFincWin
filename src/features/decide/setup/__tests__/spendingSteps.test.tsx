import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';
import { EverydayStep, recordsTypical } from '../steps/EverydayStep';
import { UnusualStep, tileColumns } from '../steps/UnusualStep';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/theme/FontScaleProvider', () => {
  const actual = jest.requireActual('@/theme/FontScaleProvider');
  return { ...actual, useFontScale: () => mockScale };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockSave = jest.fn((_i: { patch: Record<string, unknown> }) => ({ stepId: 'step-1' }) as { stepId: string } | null);
jest.mock('@/data/mutations/decideSetup', () => ({
  useSaveSetupStep: () => ({ save: (i: { patch: Record<string, unknown> }) => mockSave(i) }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

let mockSettings: Record<string, unknown> | null = null;
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockSettings }) }));

type Month = { month: string; full: boolean; mark: string | null; lines: Record<string, unknown>[] };
let mockMonths: Month[] = [];
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ status: 'ready', inputs: { currency: 'USD', months: mockMonths, series: [] }, evaluation: null, refetch: () => undefined }),
}));

const line = (id: string, amount: number) => ({
  id, date: '2026-01-05', amount, role: 'spending', status: 'paid', seriesId: null, categoryId: null,
  coversMonths: null, expected: false, incomeKind: null, countsAs: null,
});
const month = (m: string, amount: number, mark: string | null = null): Month => ({ month: m, full: true, mark, lines: [line(`l-${m}`, amount)] });
const sixMonths = () => [
  month('2026-04', 100000), month('2026-05', 110000), month('2026-06', 120000),
  month('2026-07', 130000), month('2026-08', 140000), month('2026-09', 150000),
];

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };
async function mount(Step: typeof EverydayStep) {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider>
          <Step ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { ref, last: () => ready[ready.length - 1]! };
}
const save = async (ref: React.RefObject<SetupStepHandle | null>) => {
  let out: { stepId: string | null } = { stepId: null };
  await act(async () => {
    out = ref.current!.save();
  });
  return out;
};

beforeEach(() => {
  mockWidth = 402;
  mockScale = 1;
  mockSettings = null;
  mockMonths = sixMonths();
  mockSave.mockClear();
  mockSave.mockImplementation(() => ({ stepId: 'step-1' }));
});

describe('recordsTypical', () => {
  it('takes the middle of the eligible months, half rounding up, and skips marked and current months', () => {
    const months = [
      { month: '2026-07', full: true, mark: null },
      { month: '2026-08', full: true, mark: 'out' },
      { month: '2026-09', full: true, mark: null },
      { month: '2026-10', full: true, mark: null },
    ];
    const spend = new Map([['2026-07', 100], ['2026-08', 9999], ['2026-09', 201], ['2026-10', 5]]);
    expect(recordsTypical(months, spend, '2026-10-15')).toBe(151);
    expect(recordsTypical([], new Map(), '2026-10-15')).toBeNull();
  });
});

describe('EverydayStep', () => {
  it('shows the typical month with neither choice selected and needs a choice', async () => {
    const { last } = await mount(EverydayStep);
    expect(screen.getByText('Your typical month')).toBeTruthy();
    expect(screen.getByText('The middle of your last 6 months')).toBeTruthy();
    expect(screen.getByLabelText('Looks right').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByLabelText('Change it').props.accessibilityState).toMatchObject({ checked: false });
    expect(last()).toEqual({ canContinue: false, reasonKey: 'decide.setup.shell.chooseOneReason', dirty: false });
  });

  it('Looks right writes nothing when there is no override', async () => {
    const { ref, last } = await mount(EverydayStep);
    await fireEvent.press(screen.getByLabelText('Looks right'));
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: false });
    expect((await save(ref)).stepId).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a typed figure writes the override and today', async () => {
    const { ref, last } = await mount(EverydayStep);
    await fireEvent.press(screen.getByLabelText('Change it'));
    expect(screen.getByText('About how much in a usual month?')).toBeTruthy();
    expect(last().canContinue).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Usual monthly spending'), '1200');
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: true });
    expect((await save(ref)).stepId).toBe('step-1');
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ everyday_override: 120000, everyday_override_at: '2026-10-15' });
  });

  it('Looks right on a stored override clears it', async () => {
    mockSettings = { everyday_override: 90000, everyday_override_at: '2026-09-01' };
    const { ref } = await mount(EverydayStep);
    await fireEvent.press(screen.getByLabelText('Looks right'));
    expect((await save(ref)).stepId).toBe('step-1');
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ everyday_override: null, everyday_override_at: null });
  });

  it('fewer than 3 months asks for a usual month and shows no typical card', async () => {
    mockMonths = [month('2026-08', 100000), month('2026-09', 100000)];
    const { ref, last } = await mount(EverydayStep);
    expect(screen.queryByText('Your typical month')).toBeNull();
    expect(screen.getByText('About how much do you spend in a usual month, outside regular payments?')).toBeTruthy();
    expect(last().canContinue).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Usual monthly spending'), '800');
    expect(last().canContinue).toBe(true);
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ everyday_override: 80000, everyday_override_at: '2026-10-15' });
  });
});

describe('UnusualStep', () => {
  it('cycles Normal, Leave it out, Half-logged, Normal, announcing each status', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await mount(UnusualStep);
    const tile = () => screen.getByTestId('unusual-tile-2026-09');
    expect(tile().props.accessibilityLabel).toMatch(/^September, .*1,500.*, Normal\. Tap to change\.$/);
    await fireEvent.press(tile());
    expect(announce).toHaveBeenLastCalledWith('September: Leave it out');
    await fireEvent.press(tile());
    expect(announce).toHaveBeenLastCalledWith('September: Half-logged');
    await fireEvent.press(tile());
    expect(announce).toHaveBeenLastCalledWith('September: Normal');
    announce.mockRestore();
  });

  it('shows six tiles and the legend', async () => {
    await mount(UnusualStep);
    expect(screen.getAllByTestId(/^unusual-tile-/)).toHaveLength(6);
    expect(screen.getByText(/counted as usual/)).toBeTruthy();
    expect(screen.getByText(/I didn’t record everything/)).toBeTruthy();
  });

  it('stores only non-normal months, and unchanged saves nothing', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const { ref, last } = await mount(UnusualStep);
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: false });
    expect((await save(ref)).stepId).toBeNull();
    await fireEvent.press(screen.getByTestId('unusual-tile-2026-05')); // out
    await fireEvent.press(screen.getByTestId('unusual-tile-2026-08')); // out
    await fireEvent.press(screen.getByTestId('unusual-tile-2026-08')); // half
    expect(last().dirty).toBe(true);
    expect((await save(ref)).stepId).toBe('step-1');
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ month_marks: { '2026-05': 'out', '2026-08': 'half' } });
  });

  it('cycling back to Normal removes the mark and clears the column', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    mockSettings = { month_marks: { '2026-05': 'out' } };
    const { ref } = await mount(UnusualStep);
    await fireEvent.press(screen.getByTestId('unusual-tile-2026-05')); // half
    await fireEvent.press(screen.getByTestId('unusual-tile-2026-05')); // normal
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ month_marks: null });
  });

  it('keeps marks for months outside the screen and caps the object at 12 keys', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const old: Record<string, string> = {};
    for (let i = 1; i <= 12; i++) old[`2024-${String(i).padStart(2, '0')}`] = 'out';
    mockSettings = { month_marks: old };
    const { ref } = await mount(UnusualStep);
    await fireEvent.press(screen.getByTestId('unusual-tile-2026-09'));
    await save(ref);
    const marks = mockSave.mock.calls[0]![0].patch.month_marks as Record<string, string>;
    expect(Object.keys(marks)).toHaveLength(12);
    expect(marks['2026-09']).toBe('out');
    expect(marks['2024-01']).toBeUndefined();
  });

  it('lays out 3 / 2 / 1 columns by width and text scale, tiles filling the row at one column', async () => {
    expect(tileColumns(402, 1)).toBe(3);
    expect(tileColumns(320, 1)).toBe(2);
    expect(tileColumns(402, 1.5)).toBe(2);
    expect(tileColumns(402, 2)).toBe(1);
    mockScale = 2;
    await mount(UnusualStep);
    const style = screen.getByTestId('unusual-tile-2026-09').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
    expect(flat.width).toBe(402 - 44);
  });
});
