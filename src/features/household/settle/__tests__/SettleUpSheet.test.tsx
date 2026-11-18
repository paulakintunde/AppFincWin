import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetToastForTests } from '@/state/undoToast';
import { SettleUpSheet } from '../SettleUpSheet';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: mockOnline, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/ui/haptics', () => ({
  hapticTap: jest.fn(),
  hapticTick: jest.fn(),
  hapticWarn: jest.fn(),
  hapticFailed: jest.fn(),
  hapticMilestone: jest.fn(),
}));

let mockOnline = true;
let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h' }),
  useHousehold: () => ({ data: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 } }),
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [{ id: 'a1', name: 'Everyday', currency: 'USD', created_by: 'me', archived_at: null }],
  }),
}));

let mockNet = 0;
let mockLines: Record<string, unknown>[] = [];
jest.mock('@/data/queries/householdBalances', () => ({
  useHouseholdBalances: () => ({ data: { pairs: [{ otherKey: 'u2', net: mockNet, pending: 0, lineIds: [] }], owedToMe: 0 } }),
  usePairLines: () => ({ data: mockLines }),
}));

const mockPropose = jest.fn();
const mockReceived = jest.fn();
const mockPaid = jest.fn();
jest.mock('@/data/mutations/settlements', () => ({
  useProposeSettlement: () => ({ mutateAsync: (...a: unknown[]) => mockPropose(...a), isPending: false }),
  useRecordReceived: () => ({ mutateAsync: (...a: unknown[]) => mockReceived(...a), isPending: false }),
  useRecordPaid: () => ({ mutateAsync: (...a: unknown[]) => mockPaid(...a), isPending: false }),
  useUndoSettlement: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

function line(id: string, name: string, signed: number, status = 'open') {
  return { line: { id, name, local_date: '2026-11-02', split_rule: 'even' }, signed, status, pendingSettlementId: null };
}

function member(id: string, name: string, colour: number) {
  return {
    household_id: 'h',
    user_id: id,
    is_owner: id === 'me',
    role_label: 'Flatmate',
    weight: 50,
    colour_key: colour,
    display_name: name,
    name_hidden: false,
    version: 1,
    created_at: '2026-11-01',
  };
}

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SettleUpSheet visible householdId="h" otherKey="u2" onClose={jest.fn()} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPropose.mockReset();
  mockReceived.mockReset();
  mockPaid.mockReset();
  mockOnline = true;
  resetToastForTests();
  mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1)];
  mockNet = -7000;
  mockLines = [line('l1', 'Groceries', -4200), line('l2', 'Power', -2800)];
});

describe('SettleUpSheet', () => {
  it('starts with every open line ticked and the total exactly those lines', async () => {
    await setup();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.props.accessibilityState?.checked === true)).toBe(true);
    expect(screen.getByTestId('settle-total').props.children).toBe('$70.00');
    expect(screen.getByText('Tell Sam you paid $70.00')).toBeTruthy();
    expect(screen.getByText('You pay Sam')).toBeTruthy();
  });

  it('updates the total when a line is unticked', async () => {
    await setup();
    await fireEvent.press(screen.getAllByRole('checkbox')[0]!);
    expect(screen.getByTestId('settle-total').props.children).toBe('$28.00');
    expect(screen.getByText('Tell Sam you paid $28.00')).toBeTruthy();
    expect(screen.getByText('1 lines covered, 1 left out')).toBeTruthy();
  });

  it('reads as recording a payment when the other person owes the viewer', async () => {
    mockNet = 8400;
    mockLines = [line('l1', 'Dinner', 8400)];
    await setup();
    expect(screen.getByText('Record $84.00 received')).toBeTruthy();
    expect(screen.getByText('Sam pays you')).toBeTruthy();
    expect(screen.getAllByText('Arrived in').length).toBeGreaterThan(0);
  });

  it('sends exactly the ticked lines and the engine total', async () => {
    mockPropose.mockResolvedValue({ ok: true, settlement_id: 's1', amount: 7000 });
    await setup();
    await fireEvent.press(screen.getByText('Tell Sam you paid $70.00'));
    await waitFor(() => expect(mockPropose).toHaveBeenCalledTimes(1));
    expect(mockPropose).toHaveBeenCalledWith({
      householdId: 'h',
      lineIds: expect.arrayContaining(['l1', 'l2']),
      expectedAmount: 7000,
      receiver: 'u2',
      payerAccount: 'a1',
    });
  });

  it('shows the lines-changed warning and blocks the button until Review is tapped', async () => {
    mockPropose.mockResolvedValue({ ok: false, reason: 'lines_changed', server_amount: 4200 });
    await setup();
    await fireEvent.press(screen.getByText('Tell Sam you paid $70.00'));
    await waitFor(() => expect(screen.getByTestId('settle-lines-changed')).toBeTruthy());
    expect(screen.getByText('Some lines changed. Review the total.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tell Sam you paid $70.00'));
    expect(mockPropose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Review'));
    await fireEvent.press(screen.getByText('Tell Sam you paid $70.00'));
    await waitFor(() => expect(mockPropose).toHaveBeenCalledTimes(2));
  });

  it('records a payment to someone who left with record_paid, not a waiting settle-up', async () => {
    mockMembers = [member('me', 'Paul', 0)];
    mockPaid.mockResolvedValue({ ok: true, settlement_id: 's9', amount: 7000 });
    await setup();
    await fireEvent.press(screen.getByText('Record that you paid'));
    await waitFor(() => expect(mockPaid).toHaveBeenCalledTimes(1));
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('is online-only: offline the button is disabled, says why and sends nothing', async () => {
    mockOnline = false;
    await setup();
    expect(screen.getByText('Settling up needs a connection. Nothing is saved until you are back online.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tell Sam you paid $70.00'));
    await act(async () => undefined);
    expect(mockPropose).not.toHaveBeenCalled();
  });
});
