import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetToastForTests } from '@/state/undoToast';
import { hapticTap } from '@/ui/haptics';
import { PendingSettlementCard } from '../PendingSettlementCard';

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
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/ui/haptics', () => ({
  hapticTap: jest.fn(),
  hapticTick: jest.fn(),
  hapticWarn: jest.fn(),
  hapticFailed: jest.fn(),
  hapticMilestone: jest.fn(),
}));

let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h' }),
  useHousehold: () => ({ data: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 } }),
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday', currency: 'USD', created_by: 'me', archived_at: null }] }),
}));
jest.mock('@/data/queries/householdBalances', () => ({ useSettlements: () => ({ data: [] }) }));

const mockConfirm = jest.fn();
const mockReject = jest.fn();
const mockCancel = jest.fn();
const mockUndo = jest.fn();
jest.mock('@/data/mutations/settlements', () => ({
  useConfirmSettlement: () => ({ mutateAsync: (...a: unknown[]) => mockConfirm(...a), isPending: false }),
  useRejectSettlement: () => ({ mutateAsync: (...a: unknown[]) => mockReject(...a), isPending: false }),
  useCancelSettlement: () => ({ mutateAsync: (...a: unknown[]) => mockCancel(...a), isPending: false }),
  useUndoSettlement: () => ({ mutateAsync: (...a: unknown[]) => mockUndo(...a), isPending: false }),
  useSetSettlementPayerAccount: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
const now = () => new Date().toISOString();

function settlement(over: Record<string, unknown>) {
  return {
    id: 's1',
    household_id: 'h',
    kind: 'payment',
    payer_id: 'u2',
    receiver_id: 'me',
    payer_former_key: 'u2',
    receiver_former_key: 'me',
    amount: 8400,
    currency: 'USD',
    status: 'pending',
    created_by: 'u2',
    payer_account_id: 'x',
    receiver_account_id: null,
    remind_at: null,
    expires_at: future,
    confirmed_at: null,
    resolved_at: null,
    version: 1,
    created_at: now(),
    updated_at: now(),
    lines: [],
    ...over,
  };
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

async function setup(s: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <PendingSettlementCard settlement={s as never} householdId="h" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  [mockConfirm, mockReject, mockCancel, mockUndo].forEach((m) => m.mockReset());
  (hapticTap as jest.Mock).mockClear();
  resetToastForTests();
  mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1)];
});

describe('PendingSettlementCard', () => {
  it('payer view: waiting for Sam with the day 7 and day 14 words and a Cancel', async () => {
    mockCancel.mockResolvedValue({ ok: true });
    await setup(settlement({ payer_id: 'me', receiver_id: 'u2' }));
    expect(screen.getByText('Waiting for Sam')).toBeTruthy();
    expect(screen.getByText('Waiting for Sam. Reminder goes out on day 7 and this lapses on day 14 if there is no answer.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel settle-up'));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith({ householdId: 'h', id: 's1' }));
  });

  it('receiver view: Yes, I got it asks for an account, confirms and taps lightly', async () => {
    mockConfirm.mockResolvedValue({ ok: true });
    await setup(settlement({}));
    expect(screen.getByText('Sam says they paid you $84.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Yes, I got $84.00'));
    expect(screen.getByText('Arrived in')).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith({ householdId: 'h', id: 's1', receiverAccount: 'a1' }));
    expect(hapticTap).toHaveBeenCalled();
  });

  it('receiver view: Not yet rejects the settle-up', async () => {
    mockReject.mockResolvedValue({ ok: true });
    await setup(settlement({}));
    await fireEvent.press(screen.getByText('Not yet'));
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith({ householdId: 'h', id: 's1' }));
  });

  it('leaver proposal: says only the picked account is updated (no payer account to show)', async () => {
    mockMembers = [member('me', 'Paul', 0)];
    await setup(settlement({ payer_account_id: null }));
    expect(screen.getByText(/left the household, so only the account you pick is updated/)).toBeTruthy();
  });

  it('offers Undo inside 24 hours and hides it once a party has left', async () => {
    const s = settlement({ status: 'confirmed', confirmed_at: now(), payer_id: 'me', receiver_id: 'u2' });
    const view = await setup(s);
    expect(screen.getByText('Undo')).toBeTruthy();
    await view.unmount();
    mockMembers = [member('me', 'Paul', 0)];
    await setup(s);
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('shows a lapsed settle-up with the Lapsed badge', async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await setup(settlement({ status: 'lapsed', expires_at: past }));
    expect(screen.getByText('Lapsed')).toBeTruthy();
  });
});
