import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { SetupStepHandle, SetupStepReady } from '@/features/decide/setup/steps/types';
import { PayStep } from '../steps/PayStep';
import { OtherStep } from '../steps/OtherStep';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-series-id' }));

const mockConfirm = jest.fn((_input: { series: Record<string, unknown>; attributes: Record<string, unknown> }) => ({ seriesId: 'new-series-id', stepId: 'step-confirm' }));
const mockPatch = jest.fn((_items: unknown) => ({ stepId: 'step-patch' }));
const mockEdit = jest.fn((_input: Record<string, unknown>) => 'step-edit');
jest.mock('@/data/mutations/seriesAttributes', () => ({
  useConfirmRegularCandidate: () => ({ confirm: (i: never) => mockConfirm(i) }),
  usePatchSeriesAttributes: () => ({ patch: (i: unknown) => mockPatch(i) }),
}));
jest.mock('@/data/mutations/recurringSeries', () => ({
  useEditSeriesFrom: () => ({ editFrom: (i: Record<string, unknown>) => mockEdit(i) }),
}));

jest.mock('@/data/mutations/dismissals', () => ({
  useAddDismissal: () => ({ dismiss: jest.fn(() => ({ id: 'd', stepId: 's' })) }),
  useRemoveDismissal: () => ({ restore: jest.fn(() => ({ stepId: 's' })) }),
}));

const mockOpenStatus = jest.fn();
jest.mock('@/features/record/entry/seriesStatusHost', () => ({ openSeriesStatus: (s: unknown) => mockOpenStatus(s) }));

const ACCOUNT = { id: 'a1', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null };
let mockSeries: Record<string, unknown>[] = [];
let mockFound: Record<string, unknown> | null = null;
jest.mock('../useIncomeContext', () => ({
  useIncomeContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'USD',
    timeZone: 'UTC',
    today: '2026-10-15',
    settings: null,
    accounts: [ACCOUNT],
    series: mockSeries,
    found: mockFound,
    notPay: [],
  }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount(Step: typeof PayStep) {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <Step ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { ref, last: () => ready[ready.length - 1]! };
}

const save = async (ref: React.RefObject<SetupStepHandle | null>) => {
  let out: { stepId: string | null; stepIds?: readonly string[] } | undefined;
  await act(async () => {
    out = ref.current!.save();
  });
  return out!;
};

beforeEach(() => {
  mockConfirm.mockClear();
  mockPatch.mockClear();
  mockEdit.mockClear();
  mockSeries = [];
  mockFound = null;
  mockDecideV3 = true;
  mockOpenStatus.mockClear();
});

describe('PayStep', () => {
  it('needs amount and frequency; nothing is pre-selected', async () => {
    const { last } = await mount(PayStep);
    expect(last().canContinue).toBe(false);
    for (const label of ['Weekly', 'Every 2 weeks', 'Monthly']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('shows the prefill note without selecting anything', async () => {
    mockFound = { payer: 'Acme Ltd', amount: 320000, day: 25, currency: 'USD' };
    const { last } = await mount(PayStep);
    expect(screen.getByText(/We found Acme Ltd paying about .*3,200.* around the 25th of each month\./)).toBeTruthy();
    expect(last().canContinue).toBe(false);
  });

  it('a new card creates a salary series tagged available', async () => {
    const { ref, last } = await mount(PayStep);
    await fireEvent.changeText(screen.getByLabelText('Take-home amount, after tax'), '3000');
    await fireEvent.press(screen.getByText('Monthly'));
    expect(last().canContinue).toBe(true);
    const out = await save(ref);
    expect(out).toEqual({ stepId: 'step-confirm', stepIds: ['step-confirm'] });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const call = mockConfirm.mock.calls[0]![0];
    expect(call.attributes).toEqual({ income_kind: 'salary', counts_as: 'available' });
    expect(call.series).toMatchObject({ id: 'new-series-id', household_id: 'h1', account_id: 'a1', amount: 300000, freq: 'monthly', currency: 'USD', anchor_date: '2026-10-15' });
  });

  it('names a new pay "Pay" even when a payer was found (F-03, D-21)', async () => {
    mockFound = { payer: 'Refund - Online Store', amount: 1999, day: 3, currency: 'USD' };
    const { ref } = await mount(PayStep);
    await fireEvent.changeText(screen.getByLabelText('Take-home amount, after tax'), '3000');
    await fireEvent.press(screen.getByText('Monthly'));
    await save(ref);
    expect(mockConfirm.mock.calls[0]![0].series.name).toBe('Pay');
  });

  it('two new pays return every series step id for one Undo (05.2-40)', async () => {
    mockConfirm.mockReturnValueOnce({ seriesId: 's-a', stepId: 'step-a' }).mockReturnValueOnce({ seriesId: 's-b', stepId: 'step-b' });
    const { ref } = await mount(PayStep);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add another regular pay' }));
    const amounts = screen.getAllByLabelText('Take-home amount, after tax');
    await fireEvent.changeText(amounts[0]!, '3000');
    await fireEvent.changeText(amounts[1]!, '500');
    for (const m of screen.getAllByText('Monthly')) await fireEvent.press(m);
    const out = await save(ref);
    expect(out).toEqual({ stepId: 'step-a', stepIds: ['step-a', 'step-b'] });
  });

  it('adds and removes an extra card', async () => {
    await mount(PayStep);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add another regular pay' }));
    expect(screen.getAllByLabelText('Take-home amount, after tax')).toHaveLength(2);
    expect(screen.getAllByText('Weekly')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getAllByLabelText('Take-home amount, after tax')).toHaveLength(1);
  });

  it('an unchanged existing salary series writes nothing; a changed amount uses the edit-from path', async () => {
    mockSeries = [{ id: 's1', name: 'Acme', amount: 300000, freq: 'monthly', anchor_date: '2026-09-25', version: 4, income_kind: 'salary', counts_as: 'available', deleted_at: null }];
    const { ref, last } = await mount(PayStep);
    expect(last().dirty).toBe(false);
    expect(await save(ref)).toEqual({ stepId: null });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Take-home amount, after tax'), '3100');
    expect(last().dirty).toBe(true);
    expect(await save(ref)).toEqual({ stepId: 'step-edit', stepIds: ['step-edit'] });
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', expectedVersion: 4, patch: { amount: 310000 }, effectiveFrom: '2026-10-15' }));
  });
});

const salary = (over: Record<string, unknown> = {}) => ({ id: 's1', name: 'Acme', amount: 300000, currency: 'USD', freq: 'monthly', anchor_date: '2026-09-25', version: 4, income_kind: 'salary', counts_as: 'available', deleted_at: null, end_date: null, end_reason: null, ...over });
const PAUSED = { end_date: '2026-09-30', end_reason: 'paused' };

describe('D-24 status link and paused listing', () => {
  it('Pay: a saved card shows the link; pressing opens the sheet and writes nothing', async () => {
    mockSeries = [salary()];
    await mount(PayStep);
    await fireEvent.press(screen.getByLabelText('Acme, Stopped or paused'));
    expect(mockOpenStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('Pay: a new unsaved card has no link; a stopped series is not listed', async () => {
    mockSeries = [salary({ id: 's9', end_date: '2026-08-31', end_reason: 'stopped' })];
    await mount(PayStep);
    expect(screen.queryByText('Stopped or paused')).toBeNull();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('Pay: a paused pay is listed read-only with Paused since, opens in resume mode, and is not saved as new', async () => {
    mockSeries = [salary({ id: 'p1', name: 'Old job', ...PAUSED })];
    const { ref, last } = await mount(PayStep);
    expect(screen.getByRole('header', { name: 'Paused' })).toBeTruthy();
    expect(screen.getByText(/^Paused since Oct.1,.2026$/)).toBeTruthy();
    // the only card is the blank new one; the paused pay is not counted
    expect(screen.getAllByLabelText('Take-home amount, after tax')).toHaveLength(1);
    expect(last().canContinue).toBe(false);
    await fireEvent.press(screen.getByLabelText('Old job, Stopped or paused'));
    expect(mockOpenStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(await save(ref)).toEqual({ stepId: null });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('Pay and Other: no link and no paused listing without v3', async () => {
    mockDecideV3 = false;
    mockSeries = [salary(), salary({ id: 'p1', name: 'Old job', ...PAUSED }), salary({ id: 'o1', name: 'Div', income_kind: 'dividends' }), salary({ id: 'o2', name: 'Rent in', income_kind: 'rent', ...PAUSED })];
    await mount(PayStep);
    expect(screen.queryByText('Stopped or paused')).toBeNull();
    expect(screen.queryByText('Old job')).toBeNull();
    await screen.unmount();
    await mount(OtherStep);
    expect(screen.queryByText('Stopped or paused')).toBeNull();
    expect(screen.queryByText('Rent in')).toBeNull();
  });

  it('Other: a saved line shows the link; a paused one is listed with Paused since and its link opens the sheet', async () => {
    mockSeries = [salary({ id: 'o1', name: 'Div', income_kind: 'dividends' }), salary({ id: 'o2', name: 'Rent in', income_kind: 'rent', ...PAUSED }), salary({ id: 'o3', name: 'Stopped one', income_kind: 'family', end_date: '2026-08-31', end_reason: 'stopped' })];
    const { ref } = await mount(OtherStep);
    expect(screen.getByRole('header', { name: 'Paused' })).toBeTruthy();
    expect(screen.getByText(/^Paused since Oct.1,.2026$/)).toBeTruthy();
    expect(screen.queryByText('Stopped one')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Div, Stopped or paused'));
    expect(mockOpenStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'o1' }));
    await fireEvent.press(screen.getByLabelText('Rent in, Stopped or paused'));
    expect(mockOpenStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'o2' }));
    expect(await save(ref)).toEqual({ stepId: null });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('OtherStep', () => {
  it('is optional and writes nothing until a line is finished', async () => {
    const { ref, last } = await mount(OtherStep);
    expect(last().canContinue).toBe(true);
    expect(await save(ref)).toEqual({ stepId: null });
    await fireEvent.press(screen.getByText('Interest'));
    expect(await save(ref)).toEqual({ stepId: null });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('None is exclusive', async () => {
    await mount(OtherStep);
    await fireEvent.press(screen.getByText('Interest'));
    expect(screen.getByText('What happens to it?')).toBeTruthy();
    await fireEvent.press(screen.getByText('None'));
    expect(screen.queryByText('What happens to it?')).toBeNull();
    await fireEvent.press(screen.getByText('Interest'));
    expect(screen.getByText('What happens to it?')).toBeTruthy();
  });

  it('a finished line becomes a series with income_kind and counts_as', async () => {
    const { ref } = await mount(OtherStep);
    await fireEvent.press(screen.getByText('Dividends or investment income'));
    await fireEvent.changeText(screen.getByLabelText(/Dividends or investment income, About how much/), '150');
    await fireEvent.press(screen.getByText('Every 3 months'));
    await fireEvent.press(screen.getByRole('radio', { name: 'It’s reinvested or kept' }));
    expect(await save(ref)).toEqual({ stepId: 'step-confirm', stepIds: ['step-confirm'] });
    const call = mockConfirm.mock.calls[0]![0];
    expect(call.attributes).toEqual({ income_kind: 'dividends', counts_as: 'kept' });
    expect(call.series).toMatchObject({ name: 'Dividends or investment income', amount: 15000, freq: 'quarterly' });
  });

  it('two finished lines return both step ids for one Undo (05.2-40)', async () => {
    mockConfirm.mockReturnValueOnce({ seriesId: 's-a', stepId: 'step-a' }).mockReturnValueOnce({ seriesId: 's-b', stepId: 'step-b' });
    const { ref } = await mount(OtherStep);
    await fireEvent.press(screen.getByText('Interest'));
    await fireEvent.press(screen.getByText('Dividends or investment income'));
    await fireEvent.changeText(screen.getByLabelText(/Interest, About how much/), '20');
    await fireEvent.changeText(screen.getByLabelText(/Dividends or investment income, About how much/), '150');
    for (const m of screen.getAllByText('Monthly')) await fireEvent.press(m);
    for (const r of screen.getAllByRole('radio', { name: 'I spend it or it’s available' })) await fireEvent.press(r);
    const out = await save(ref);
    expect(out.stepIds).toHaveLength(2);
    expect(out.stepId).toBe(out.stepIds![0]);
  });

  it('Other uses the typed name (max 40) as the series name and needs it', async () => {
    const { ref } = await mount(OtherStep);
    await fireEvent.press(screen.getByText('Other'));
    await fireEvent.changeText(screen.getByLabelText(/Other, About how much/), '80');
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByRole('radio', { name: 'I spend it or it’s available' }));
    expect(await save(ref)).toEqual({ stepId: null });
    await fireEvent.changeText(screen.getByLabelText('What is it?'), 'x'.repeat(60));
    expect(await save(ref)).toEqual({ stepId: 'step-confirm', stepIds: ['step-confirm'] });
    const call = mockConfirm.mock.calls[0]![0];
    expect(call.series.name).toBe('x'.repeat(40));
    expect(call.attributes).toEqual({ income_kind: 'other', counts_as: 'available' });
  });

  it('"It varies" writes no series', async () => {
    const { ref } = await mount(OtherStep);
    await fireEvent.press(screen.getByText('Interest'));
    await fireEvent.changeText(screen.getByLabelText(/Interest, About how much/), '20');
    await fireEvent.press(screen.getByText('It varies'));
    await fireEvent.press(screen.getByRole('radio', { name: 'I spend it or it’s available' }));
    expect(await save(ref)).toEqual({ stepId: null });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('an existing line changes through the patch path when only counts_as changed', async () => {
    mockSeries = [{ id: 's9', name: 'Interest', amount: 2000, freq: 'monthly', anchor_date: '2026-09-01', version: 2, income_kind: 'interest', counts_as: 'available', deleted_at: null }];
    const { ref } = await mount(OtherStep);
    await fireEvent.press(screen.getByRole('radio', { name: 'It’s reinvested or kept' }));
    expect(await save(ref)).toEqual({ stepId: 'step-patch', stepIds: ['step-patch'] });
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });
});
