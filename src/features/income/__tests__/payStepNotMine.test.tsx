import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PayStep } from '../steps/PayStep';
import { notPayKey } from '../notPay';

jest.setTimeout(30000);
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
jest.mock('@/data/mutations/seriesAttributes', () => ({ useConfirmRegularCandidate: () => ({ confirm: jest.fn() }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEditSeriesFrom: () => ({ editFrom: jest.fn() }) }));

const mockDismiss = jest.fn((_i: Record<string, unknown>) => ({ id: 'd1', stepId: 'step-dismiss' }));
const mockRestore = jest.fn((_row: unknown, _name: unknown, _label: unknown) => ({ stepId: 'step-restore' }));
jest.mock('@/data/mutations/dismissals', () => ({
  useAddDismissal: () => ({ dismiss: (i: Record<string, unknown>) => mockDismiss(i) }),
  useRemoveDismissal: () => ({ restore: (r: unknown, n: unknown, l: unknown) => mockRestore(r, n, l) }),
}));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (a: unknown) => mockShowToast(a) }));

let mockCtx: Record<string, unknown> = {};
jest.mock('../useIncomeContext', () => ({ useIncomeContext: () => mockCtx }));

const UID = '11111111-2222-3333-4444-555555555555';
const FOUND = { payer: 'Refund - Online Store', amount: 1999, day: 24, currency: 'GBP', key: 'refund-key' };
const ROW = { id: 'row1' };
const base = () => ({
  userId: UID,
  householdId: 'h1',
  homeCurrency: 'GBP',
  timeZone: 'UTC',
  today: '2026-10-15',
  settings: null,
  accounts: [{ id: 'a1', kind: 'checking', currency: 'GBP', deleted_at: null, archived_at: null }],
  series: [],
  found: FOUND as Record<string, unknown> | null,
  notPay: [] as unknown[],
});
const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };
const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <PayStep ref={React.createRef()} mode="stepper" onReadyChange={() => undefined} />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  mockDismiss.mockClear();
  mockRestore.mockClear();
  mockShowToast.mockClear();
  mockCtx = base();
});

describe('PayStep Not my pay', () => {
  it('shows the control, dismisses with the not-pay key and toasts with Undo', async () => {
    await mount();
    expect(screen.getByText(/We found Refund - Online Store paying about/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Not my pay, Refund - Online Store' }));
    expect(mockDismiss).toHaveBeenCalledWith({ payeeKey: notPayKey('refund-key', UID), direction: 'in', name: 'Refund - Online Store', labelKey: 'payNotMine' });
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.payNotMine', params: { name: 'Refund - Online Store' } }, stepId: 'step-dismiss' });
  });

  it('names the next payer, or no note, once the context answers', async () => {
    mockCtx = { ...base(), found: { ...FOUND, payer: 'Acme Ltd', key: 'acme' } };
    await mount();
    expect(screen.getByText(/We found Acme Ltd paying about/)).toBeTruthy();
    await screen.unmount();
    mockCtx = { ...base(), found: null };
    await mount();
    expect(screen.queryByText(/We found/)).toBeNull();
    expect(screen.queryByText('Not my pay')).toBeNull();
  });

  it('lists a not-pay payer with Show again, which restores and toasts', async () => {
    mockCtx = { ...base(), found: null, notPay: [{ row: ROW, payer: 'Refund - Online Store' }] };
    await mount();
    expect(screen.getByText('Refund - Online Store isn’t counted as your pay.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show Refund - Online Store as pay again' }));
    expect(mockRestore).toHaveBeenCalledWith(ROW, 'Refund - Online Store', 'payNotMineCleared');
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.payNotMineCleared', params: { name: 'Refund - Online Store' } }, stepId: 'step-restore' });
  });

  it('leaves typed card amounts alone', async () => {
    await mount();
    const input = screen.getAllByLabelText('Take-home amount, after tax')[0]!;
    await act(async () => {
      fireEvent.changeText(input, '2500');
    });
    const before = screen.toJSON();
    await fireEvent.press(screen.getByRole('button', { name: 'Not my pay, Refund - Online Store' }));
    expect(JSON.stringify(screen.toJSON())).toContain('2500');
    expect(before).not.toBeNull();
  });

  it('writes nothing without a user', async () => {
    mockCtx = { ...base(), userId: undefined };
    await mount();
    expect(screen.queryByText('Not my pay')).toBeNull();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('renders no control without a household or user', async () => {
    mockCtx = { ...base(), householdId: undefined, notPay: [{ row: ROW, payer: 'X' }] };
    await mount();
    expect(screen.queryByText('Not my pay')).toBeNull();
    expect(screen.queryByText('Show again')).toBeNull();
  });
});
