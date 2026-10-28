import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';
import { RegularStep } from '../steps/RegularStep';
import { LoansStep } from '../steps/LoansStep';
import { registerSetupSheetActions } from '../steps/setupSheetHost';

jest.setTimeout(30000);
let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-series-id' }));

const mockConfirm = jest.fn((_i: Record<string, unknown>) => ({ seriesId: 'new-series-id', stepId: 'step-confirm' }));
const mockDismiss = jest.fn((_i: Record<string, unknown>) => ({ id: 'd1', stepId: 'step-dismiss' }));
const mockPays = jest.fn((_d: unknown, _v: unknown, _o: unknown, _t: unknown) => 'step-pays');
const mockToast = jest.fn();
jest.mock('@/data/mutations/seriesAttributes', () => ({
  useConfirmRegularCandidate: () => ({ confirm: (i: Record<string, unknown>) => mockConfirm(i) }),
}));
jest.mock('@/data/mutations/dismissals', () => ({ useAddDismissal: () => ({ dismiss: (i: Record<string, unknown>) => mockDismiss(i) }) }));
jest.mock('@/data/mutations/debts', () => ({
  useSetDebtPaysInFull: () => ({ setPaysInFull: (d: unknown, v: unknown, o: unknown, t: unknown) => mockPays(d, v, o, t) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));

type Row = {
  id: string;
  state: 'unmarked' | 'regular' | 'notRegular';
  series: Record<string, unknown> | null;
  dismissal: Record<string, unknown> | null;
};
const candidate = (name: string, amount: number, state: Row['state'], key = name.toLowerCase()) => ({
  id: `${key}|2026-10-01`,
  state,
  currency: 'USD',
  accountId: 'a1',
  categoryId: null,
  series: state === 'regular' ? { id: 's1', name } : null,
  dismissal: state === 'notRegular' ? { id: 'd0', version: 1 } : null,
  freq: 'monthly',
  candidate: { key, name, direction: 'out', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-10-01', amount, rowIds: ['r1'], payGroupKey: null },
});
let mockRows: ReturnType<typeof candidate>[] = [];
jest.mock('../steps/useRegularCandidates', () => ({
  useRegularCandidates: () => ({ rows: mockRows, isLoading: false, householdId: 'h1', userId: 'u1', today: '2026-10-15', homeCurrency: 'USD', timeZone: 'UTC' }),
}));

let mockDebts: Record<string, unknown>[] = [];
jest.mock('@/data/queries/decide', () => ({ useDebts: () => ({ data: mockDebts }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [{ id: 'ser1', anchor_date: '2026-10-14' }] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount(Step: typeof RegularStep) {
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

const debt = (over: Record<string, unknown>) => ({
  id: 'x',
  household_id: 'h1',
  kind: 'card',
  name: 'Visa',
  currency: 'USD',
  balance: 120000,
  minimum_payment: 3500,
  apr: '19.9',
  series_id: 'ser1',
  paid_in_full: false,
  pays_in_full: null,
  deleted_at: null,
  version: 1,
  ...over,
});

beforeEach(() => {
  mockWidth = 402;
  mockScale = 1;
  [mockConfirm, mockDismiss, mockPays, mockToast].forEach((m) => m.mockClear());
  mockRows = [];
  mockDebts = [];
});

describe('RegularStep', () => {
  it('lists unmarked rows as Not marked with the counter and the unmarked line, and Next works', async () => {
    mockRows = [candidate('Rent', 150000, 'unmarked'), candidate('Phone', 5000, 'regular'), candidate('Gym', 4000, 'notRegular')];
    const { last, ref } = await mount(RegularStep);
    expect(screen.getByText('2 of 3 marked')).toBeTruthy();
    expect(screen.getAllByText('Not marked').length).toBeGreaterThan(0);
    expect(screen.getByText('Payments you don’t mark aren’t counted as regular. You can mark them later.')).toBeTruthy();
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: false });
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
  });

  it('hides the unmarked line when every row is marked', async () => {
    mockRows = [candidate('Phone', 5000, 'regular')];
    await mount(RegularStep);
    expect(screen.queryByText(/aren’t counted as regular/)).toBeNull();
  });

  it('Regular confirms the series and shows an Undo toast from the step id', async () => {
    mockRows = [candidate('Rent', 150000, 'unmarked')];
    await mount(RegularStep);
    await fireEvent.press(screen.getByLabelText('Mark Rent as regular'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const arg = mockConfirm.mock.calls[0]![0] as { series: Record<string, unknown>; attributes: unknown };
    expect(arg.series).toMatchObject({ name: 'Rent', amount: 150000, freq: 'monthly', account_id: 'a1', anchor_date: '2026-10-01' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-confirm' }));
  });

  it('Not regular writes a dismissal and never creates a series', async () => {
    mockRows = [candidate('Rent', 150000, 'unmarked')];
    await mount(RegularStep);
    await fireEvent.press(screen.getByLabelText('Mark Rent as not regular'));
    expect(mockDismiss).toHaveBeenCalledWith({ payeeKey: 'rent', direction: 'out' });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-dismiss' }));
  });

  it('Edit opens the series sheet through the host', async () => {
    const editRegular = jest.fn();
    const unregister = registerSetupSheetActions({ editRegular });
    mockRows = [candidate('Rent', 150000, 'unmarked')];
    await mount(RegularStep);
    await fireEvent.press(screen.getByLabelText('Edit Rent'));
    expect(editRegular).toHaveBeenCalledWith({ candidate: expect.objectContaining({ name: 'Rent' }) });
    unregister();
  });

  it('shows the empty state and the quick picks; a pick opens the series sheet with the kind', async () => {
    const addRegular = jest.fn();
    const unregister = registerSetupSheetActions({ addRegular });
    const { last } = await mount(RegularStep);
    expect(screen.getByText('No regular payments found yet')).toBeTruthy();
    expect(last().canContinue).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add a regular payment' }));
    await fireEvent.press(screen.getByLabelText('Regular payment, Phone and internet'));
    expect(addRegular).toHaveBeenCalledWith('phone', expect.any(String));
    unregister();
  });

  it('puts the three buttons in one row at 402 dp and stacks them at 320 dp', async () => {
    mockRows = [candidate('Rent', 150000, 'unmarked')];
    await mount(RegularStep);
    const wide = screen.getByLabelText('Mark Rent as regular');
    expect(JSON.stringify(wide.props.style)).toContain('"flex":1');
    await screen.unmount();
    mockWidth = 320;
    await mount(RegularStep);
    const narrow = screen.getByLabelText('Mark Rent as regular');
    expect(JSON.stringify(narrow.props.style)).not.toContain('"flex":1');
    expect(JSON.stringify(narrow.props.style)).toContain('"alignSelf":"stretch"');
  });
});

describe('LoansStep', () => {
  it('lists debts with a figure strip and asks the pays-in-full question for cards only', async () => {
    mockDebts = [debt({ id: 'd1' }), debt({ id: 'd2', kind: 'loan', name: 'Auto finance' }), debt({ id: 'd3', name: 'Old', paid_in_full: true })];
    await mount(LoansStep);
    expect(screen.getByText('Visa')).toBeTruthy();
    expect(screen.getByText('Auto finance')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
    expect(screen.getAllByText('due the 14')).toHaveLength(2);
    expect(screen.getAllByText('Do you usually pay the full balance each month?')).toHaveLength(1);
    expect(screen.getAllByText('19.9%')).toHaveLength(2);
  });

  it('writes pays_in_full for changed cards on save and nothing when unchanged', async () => {
    mockDebts = [debt({ id: 'd1' })];
    const { ref, last } = await mount(LoansStep);
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
    await fireEvent.press(screen.getByText('Sometimes'));
    expect(last().dirty).toBe(true);
    await act(async () => {
      out = ref.current!.save();
    });
    expect(mockPays).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), 'sometimes', 'u1', 'Loans and credit');
    expect(out).toEqual({ stepId: 'step-pays' });
  });

  it('shows the empty state and the add chips, which open the debt sheet with the kind', async () => {
    const addDebt = jest.fn();
    const unregister = registerSetupSheetActions({ addDebt });
    await mount(LoansStep);
    expect(screen.getByText('No loans or cards yet')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Loan or card, Student loan'));
    expect(addDebt).toHaveBeenCalledWith('student');
    unregister();
  });

  it('Edit opens the debt sheet', async () => {
    const editDebt = jest.fn();
    const unregister = registerSetupSheetActions({ editDebt });
    mockDebts = [debt({ id: 'd1' })];
    await mount(LoansStep);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(editDebt).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
    unregister();
  });
});
