import React from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { InviteSheet } from '../InviteSheet';

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
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/features/plans/store/purchasesClient', () => require('@/features/plans/store/fakeStore'));
jest.mock('@/features/plans/PlanHost', () => ({ requestPlanRefresh: jest.fn(() => Promise.resolve()) }));
// 09-20: a tester household (writable, no plan row) keeps Phase 8 behaviour: no plan confirm, no lock.
jest.mock('@/features/plans/usePlanState', () => ({
  usePlanState: () => ({
    status: 'tester',
    kind: 'prelaunch',
    writable: true,
    householdId: 'h',
    planKey: null,
    planSize: 0,
    period: null,
    seats: 6,
    members: 1,
    payerId: null,
    payerIsMe: false,
    payerName: null,
    store: null,
    productId: null,
    willRenew: false,
    coveredUntil: null,
    trialEndsAt: null,
    graceUntil: null,
    promoKind: 'tester',
    prelaunch: true,
    leftGrace: false,
    trialAvailable: true,
    billingIssueAt: null,
    loading: false,
    isError: false,
  }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const mockCreate = jest.fn();
jest.mock('@/db/householdInvites', () => ({
  ...jest.requireActual('@/db/householdInvites'),
  createInvite: (...a: unknown[]) => mockCreate(...a),
}));

let mockOnline = true;
jest.mock('../useHouseholdScope', () => ({
  useHouseholdScope: () => ({
    userId: 'me',
    householdId: 'h',
    household: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 },
    name: 'Flat 4B',
    members: [],
    isOwner: true,
    online: mockOnline,
  }),
}));
jest.mock('../noticeText', () => ({ useNoticeFormat: () => ({ text: () => '', when: () => '', day: () => 'Nov 22' }) }));
jest.mock('../useMemberLabel', () => ({ useMemberSeen: () => () => ({ seen: 'Paul', colourKey: 0, colourName: 'Green' }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Clipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };

async function setup(extra: { code?: string; expiresAt?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <InviteSheet visible onClose={jest.fn()} {...extra} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockOnline = true;
  mockCreate.mockReset();
  Clipboard.setStringAsync.mockClear();
});

describe('InviteSheet', () => {
  it('shows the grouped code and shares a fincwin:// link', async () => {
    mockCreate.mockResolvedValue({ ok: true, invite_id: 'i1', code: 'ABCD-1234-EFGH', expires_at: '2026-11-22T00:00:00Z' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await setup();
    await waitFor(() => expect(screen.getByTestId('invite-code').props.children).toBe('ABCD-1234-EFGH'));
    await fireEvent.press(screen.getByText('Share'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const message = (share.mock.calls[0]![0] as { message: string }).message;
    expect(message).toContain('fincwin://invite?code=ABCD-1234-EFGH');
    expect(message).not.toContain('https://');
    await fireEvent.press(screen.getByText('Copy code'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ABCD-1234-EFGH'));
    expect(screen.getByText('Works once, for one person. Expires Nov 22.')).toBeTruthy();
  });

  it('says the household is full and shows no code', async () => {
    mockCreate.mockResolvedValue({ ok: false, reason: 'full' });
    await setup();
    await waitFor(() => expect(screen.getByTestId('invite-full')).toBeTruthy());
    expect(screen.getByTestId('invite-full').props.children).toBe('Flat 4B already has 6 people. Remove someone before inviting another.');
    expect(screen.queryByTestId('invite-code')).toBeNull();
  });

  it('disables Copy and Share offline', async () => {
    mockOnline = false;
    await setup({ code: 'ABCD1234EFGH', expiresAt: '2026-11-22T00:00:00Z' });
    expect(screen.getByTestId('invite-code').props.children).toBe('ABCD-1234-EFGH');
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    // a code made elsewhere needs no new invite
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('makes no invite while offline and says why', async () => {
    mockOnline = false;
    await setup();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Needs a connection. Try again when you’re back online.')).toBeTruthy();
  });
});
