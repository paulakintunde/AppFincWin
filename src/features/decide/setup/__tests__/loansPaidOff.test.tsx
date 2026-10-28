// 05.2-48: the Loans step lists a paid-off debt read-only with "Paid off {date}", and never re-asks it.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';
import { LoansStep } from '../steps/LoansStep';
import { registerSetupSheetActions } from '../steps/setupSheetHost';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockPays = jest.fn((_d: unknown, _v: unknown, _o: unknown, _t: unknown) => 'step-pays');
jest.mock('@/data/mutations/debts', () => ({
  useSetDebtPaysInFull: () => ({ setPaysInFull: (d: unknown, v: unknown, o: unknown, t: unknown) => mockPays(d, v, o, t) }),
}));

let mockDebts: Record<string, unknown>[] = [];
jest.mock('@/data/queries/decide', () => ({ useDebts: () => ({ data: mockDebts }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount() {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider>
          <LoansStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
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
  series_id: null,
  paid_in_full: false,
  pays_in_full: null,
  paid_off_on: null,
  deleted_at: null,
  version: 1,
  ...over,
});

beforeEach(() => {
  mockWidth = 402;
  mockScale = 1;
  mockPays.mockClear();
  mockDebts = [];
});

describe('LoansStep with a paid-off debt', () => {
  it('shows the Paid off line (date not broken) and no pays-in-full chips for it', async () => {
    mockDebts = [debt({ id: 'd1', paid_off_on: '2026-10-01' })];
    await mount();
    expect(screen.getByText('Visa')).toBeTruthy();
    expect(screen.getByText(/^Paid off\s/)).toBeTruthy();
    expect(screen.getByLabelText(/^Visa, paid off /)).toBeTruthy();
    expect(screen.queryByText('Do you usually pay the full balance each month?')).toBeNull();
    expect(screen.queryByText('Sometimes')).toBeNull();
  });

  it('shows the line for a date of today, not for a date still ahead or none', async () => {
    mockDebts = [
      debt({ id: 'd1', name: 'Today card', paid_off_on: '2026-10-15' }),
      debt({ id: 'd2', name: 'Future card', paid_off_on: '2026-10-16' }),
      debt({ id: 'd3', name: 'Open card' }),
    ];
    await mount();
    expect(screen.getAllByText(/^Paid off\s/)).toHaveLength(1);
    expect(screen.getAllByText('Do you usually pay the full balance each month?')).toHaveLength(2);
  });

  it('Edit still opens the sheet for a paid-off debt', async () => {
    const editDebt = jest.fn();
    const unregister = registerSetupSheetActions({ editDebt });
    mockDebts = [debt({ id: 'd1', paid_off_on: '2026-10-01' })];
    await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(editDebt).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
    unregister();
  });

  it('save() writes nothing for a paid-off card, even with a stale stored answer', async () => {
    mockDebts = [debt({ id: 'd1', paid_off_on: '2026-10-01', pays_in_full: 'no' })];
    const { ref, last } = await mount();
    expect(last().dirty).toBe(false);
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
    expect(mockPays).not.toHaveBeenCalled();
  });

  it.each([
    [320, 1],
    [320, 2],
    [402, 1],
    [402, 2],
  ])('renders the status line at %i dp x %i font scale', async (w, s) => {
    mockWidth = w;
    mockScale = s;
    mockDebts = [debt({ id: 'd1', name: 'Long named student loan account', kind: 'loan', paid_off_on: '2026-10-01' })];
    await mount();
    const line = screen.getByText(/^Paid off\s/);
    expect(line.props.numberOfLines).toBeUndefined();
    expect(line.props.children).toMatch(/ /);
  });
});
