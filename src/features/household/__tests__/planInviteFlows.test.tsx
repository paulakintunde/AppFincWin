/* eslint-disable @typescript-eslint/no-require-imports */
// 09-20 (D-17, D-20, D-21, D-39): invites, joins and the payer's approval, against the fake store. The plan view, the
// server calls and the household scope are mocked; prices come from the fake store's offers, never from the screens.
import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { PlanView } from '@/features/plans/types';
import { fakeStoreState, resetFakeStore } from '@/features/plans/store/fakeStore';
import { LockedSheetProvider } from '@/features/plans/useWriteGate';
import { InviteSheet } from '../InviteSheet';
import { JoinScreen } from '../join/JoinScreen';
import { ApprovePlanScreen } from '../approve/ApprovePlanScreen';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/plans/store/purchasesClient', () => require('@/features/plans/store/fakeStore'));
jest.mock('@/features/plans/PlanHost', () => ({ requestPlanRefresh: jest.fn(() => Promise.resolve()) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a) },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
const mockBack = jest.fn();
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: mockBack, history: [] }) }));
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
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'old-h' }),
  useHousehold: () => ({ data: { name: 'Flat 4B' } }),
  resetHouseholdScope: jest.fn(),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
// 09-23: an existing person with a finished setup (joining goes to the household, not the partner questions).
jest.mock('@/features/levels/useUserSetup', () => ({
  useUserSetup: () => ({ data: { completedAt: '2026-11-01T00:00:00Z', level: 4, partnerVersion: false, version: 1 }, loading: false }),
}));
jest.mock('../useHouseholdScope', () => ({
  useHouseholdScope: () => ({
    userId: 'me',
    householdId: 'h',
    household: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 },
    name: 'Flat 4B',
    members: [],
    isOwner: true,
    online: true,
  }),
}));
jest.mock('../noticeText', () => ({ useNoticeFormat: () => ({ text: () => '', when: () => '', day: () => 'Nov 22' }) }));
jest.mock('../useMemberLabel', () => ({
  useMemberSeen: () => () => ({ seen: 'Paul', colourKey: 0, colourName: 'Green' }),
  useInviterLabel: () => () => 'Sam',
}));
const mockTake = jest.fn();
jest.mock('../join/pendingInvite', () => ({ ...jest.requireActual('../join/pendingInvite'), takePendingInvite: () => mockTake() }));

let mockPlan: PlanView;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));

const mockCreate = jest.fn();
const mockPreview = jest.fn();
const mockRedeem = jest.fn();
const mockCancel = jest.fn();
const mockFetchRequest = jest.fn();
jest.mock('@/db/householdInvites', () => ({
  ...jest.requireActual('@/db/householdInvites'),
  createInvite: (...a: unknown[]) => mockCreate(...a),
  previewInvite: (...a: unknown[]) => mockPreview(...a),
  redeemInvite: (...a: unknown[]) => mockRedeem(...a),
  cancelJoinRequest: (...a: unknown[]) => mockCancel(...a),
  fetchJoinRequest: (...a: unknown[]) => mockFetchRequest(...a),
}));

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'active',
    kind: 'active',
    writable: true,
    householdId: 'h',
    planKey: 'solo',
    planSize: 1,
    period: 'year',
    seats: 1,
    members: 1,
    payerId: 'me',
    payerIsMe: true,
    payerName: 'Paul',
    store: 'APP_STORE',
    productId: 'fincwin.solo.year',
    willRenew: true,
    coveredUntil: '2027-03-01T00:00:00Z',
    trialEndsAt: null,
    graceUntil: null,
    promoKind: null,
    prelaunch: false,
    leftGrace: false,
    trialAvailable: false,
    billingIssueAt: null,
    loading: false,
    isError: false,
    ...over,
  };
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LockedSheetProvider>{node}</LockedSheetProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const onClose = jest.fn();
async function openInvite() {
  return render(wrap(<InviteSheet visible onClose={onClose} />));
}

const SOLO_BODY = 'Adding a member needs a household plan. Your next bill would be $7.99 a month or $70.99 a year.';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetFakeStore();
  [mockCreate, mockPreview, mockRedeem, mockCancel, mockFetchRequest, mockPush, mockReplace, mockBack, onClose].forEach((m) =>
    m.mockReset(),
  );
  mockTake.mockReset();
  mockTake.mockResolvedValue(null);
  mockPlan = view();
  mockCreate.mockResolvedValue({ ok: true, invite_id: 'i1', code: 'ABCD-1234-EFGH', expires_at: '2026-11-22T00:00:00Z' });
});

describe('InviteSheet and plans', () => {
  it('asks a Solo payer to change plan first, with the exact D-20 body and store prices', async () => {
    await openInvite();
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
    expect(screen.getByText('Add a member')).toBeTruthy();
    expect(screen.getByText('New plan: Duo, 2 people')).toBeTruthy();
    expect(screen.getByText('Takes effect: now')).toBeTruthy();
    expect(screen.getByText('Change to Duo')).toBeTruthy();
    expect(screen.getByText('Keep Solo')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(fakeStoreState.purchases).toHaveLength(0);
  });

  it('changes the store product only after "Change to Duo", then makes the invite once the server shows two places', async () => {
    const { rerender } = await openInvite();
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
    await fireEvent.press(screen.getByText('Change to Duo'));
    await waitFor(() => expect(fakeStoreState.purchases).toEqual([{ packageId: 'duo_year', change: undefined }]));
    // The store said yes, but the server has not changed the plan yet: no invite.
    expect(mockCreate).not.toHaveBeenCalled();
    mockPlan = view({ planKey: 'duo', planSize: 2, seats: 2, productId: 'fincwin.duo.year' });
    await act(async () => {
      rerender(wrap(<InviteSheet visible onClose={onClose} />));
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  });

  it('closes on "Keep Solo" and makes no invite', async () => {
    await openInvite();
    await waitFor(() => expect(screen.getByText('Keep Solo')).toBeTruthy());
    await fireEvent.press(screen.getByText('Keep Solo'));
    expect(onClose).toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(fakeStoreState.purchases).toHaveLength(0);
  });

  it('says the trial continues when a Solo trial adds a second person', async () => {
    mockPlan = view({ status: 'trial', kind: 'trial', trialEndsAt: '2026-12-01T00:00:00Z' });
    await openInvite();
    await waitFor(() =>
      expect(
        screen.getByText('Adding a 2nd person moves you to Duo. Your free trial continues, and the Duo price starts when it ends.'),
      ).toBeTruthy(),
    );
  });

  it('names the action in the locked sheet and closes when the plan has ended', async () => {
    mockPlan = view({ status: 'locked', kind: 'lapsed', writable: false });
    await openInvite();
    await waitFor(() => expect(screen.getByText('Inviting someone needs a plan')).toBeTruthy());
    expect(onClose).toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows how many people the plan holds, with See plans for the payer, and still makes the invite', async () => {
    mockPlan = view({ planKey: 'duo', planSize: 2, seats: 2, members: 2, productId: 'fincwin.duo.year' });
    await openInvite();
    await waitFor(() => expect(screen.getByText('Duo holds 2 people.')).toBeTruthy());
    expect(screen.getByText('See plans')).toBeTruthy();
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText('See plans'));
    expect(mockPush).toHaveBeenCalled();
  });

  it('tells a home owner who does not pay to ask the payer', async () => {
    mockPlan = view({ planKey: 'duo', planSize: 2, seats: 2, members: 2, payerIsMe: false, payerId: 'sam', payerName: 'Sam' });
    await openInvite();
    await waitFor(() => expect(screen.getByText('Ask Sam to change the plan.')).toBeTruthy());
    expect(screen.queryByText('See plans')).toBeNull();
  });
});

const PREVIEW = {
  ok: true,
  household_name: 'Flat 4B',
  inviter_display_name: 'Sam',
  inviter_colour_key: 1,
  member_count: 2,
  in_other_household: false,
  already_member: false,
  full: false,
  needs_approval: true,
};
const CODE = 'A7K2-M9Q3-X4W5';

async function joinThrough() {
  await render(wrap(<JoinScreen />));
  await fireEvent.changeText(screen.getByTestId('join-code-input'), CODE);
  await fireEvent.press(screen.getByText('Check code'));
  await waitFor(() => expect(screen.getByTestId('join-preview')).toBeTruthy());
  await fireEvent.press(screen.getByText('Join Flat 4B'));
}

describe('JoinScreen and plans', () => {
  it('passes the store country to redeem_invite once', async () => {
    fakeStoreState.country = 'GB';
    mockPreview.mockResolvedValue(PREVIEW);
    mockRedeem.mockResolvedValue({ ok: false, reason: 'needs_approval', request_id: 'r1' });
    await joinThrough();
    await waitFor(() => expect(mockRedeem).toHaveBeenCalledTimes(1));
    expect(mockRedeem.mock.calls[0]).toEqual([{}, CODE, 'GB']);
    expect(await AsyncStorage.getAllKeys()).not.toEqual(expect.arrayContaining([expect.stringMatching(/country/i)]));
  });

  it('waits for the payer when the invite is past the plan size, and cannot join', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockRedeem.mockResolvedValue({ ok: false, reason: 'needs_approval', request_id: 'r1' });
    await joinThrough();
    await waitFor(() => expect(screen.getByTestId('join-waiting')).toBeTruthy());
    expect(screen.getByText('Waiting for Sam to approve')).toBeTruthy();
    expect(screen.getByText('Sam has been told. You will be added when they approve. You can close this screen.')).toBeTruthy();
    expect(screen.getByTestId('status-badge-waitingApproval')).toBeTruthy();
    expect(screen.queryByText('Join Flat 4B')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows when a refused person can join a different home, with support and no store country', async () => {
    fakeStoreState.country = 'DE';
    mockPreview.mockResolvedValue({ ...PREVIEW, needs_approval: false });
    mockRedeem.mockResolvedValue({ ok: false, reason: 'switch_rule', open_from: '2027-06-01T00:00:00Z' });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await joinThrough();
    await waitFor(() => expect(screen.getByTestId('join-switch-rule')).toBeTruthy());
    expect(screen.getByText(/You left a home recently\. You can join a different home from/)).toBeTruthy();
    expect(screen.getByText(/Joining the same home is always open/)).toBeTruthy();
    expect(screen.queryByText(/Germany|\bDE\b|country/)).toBeNull();
    await fireEvent.press(screen.getByText('Contact support'));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('support@'));
    open.mockRestore();
  });
});

describe('JoinScreen waiting re-check (quick 261124-2bs, UAT C2-5)', () => {
  const REQUEST = { id: 'r1', household_id: 'hNew', user_id: 'me', needed_plan_size: 6, status: 'waiting', created_at: '2026-11-20T00:00:00Z' };

  async function waitThenTick(ms = 30_000) {
    mockPreview.mockResolvedValue(PREVIEW);
    mockRedeem.mockResolvedValue({ ok: false, reason: 'needs_approval', request_id: 'r1' });
    await joinThrough();
    await waitFor(() => expect(screen.getByTestId('join-waiting')).toBeTruthy());
    mockPreview.mockClear();
    mockFetchRequest.mockClear();
    return async () => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchRequest.mockResolvedValue(REQUEST);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks every 30 s while waiting and stays waiting when nothing changed', async () => {
    const tick = await waitThenTick(29_000);
    await tick();
    expect(mockFetchRequest).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockFetchRequest).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('join-waiting-expired')).toBeNull();
    expect(screen.getByTestId('join-waiting')).toBeTruthy();
  });

  it('shows the expired line when the request expired, and stops asking', async () => {
    const tick = await waitThenTick(0);
    mockFetchRequest.mockResolvedValue({ ...REQUEST, status: 'expired' });
    await tick();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('join-waiting-expired')).toBeTruthy();
    expect(screen.getByText('This invite expired. Ask Sam to send a new one.')).toBeTruthy();
    expect(screen.queryByText(/You will be added when they approve/)).toBeNull();
    const calls = mockFetchRequest.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(mockFetchRequest).toHaveBeenCalledTimes(calls);
  });

  it('a cancelled request reads the same expired line', async () => {
    const tick = await waitThenTick(0);
    mockFetchRequest.mockResolvedValue({ ...REQUEST, status: 'cancelled' });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('This invite expired. Ask Sam to send a new one.')).toBeTruthy();
    void tick;
  });

  it('a request still waiting but an invite that no longer previews reads the expired line', async () => {
    await waitThenTick(0);
    mockPreview.mockResolvedValue({ ok: false, reason: 'expired' });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('join-waiting-expired')).toBeTruthy();
  });

  it('an admitted request runs the joined path', async () => {
    await waitThenTick(0);
    mockFetchRequest.mockResolvedValue({ ...REQUEST, status: 'admitted' });
    await AsyncStorage.setItem('fincwin.whatsSharedSeen.hNew', '1');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/household'));
    const calls = mockFetchRequest.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(mockFetchRequest).toHaveBeenCalledTimes(calls);
  });

  it('a failing read keeps the waiting state and shows no error', async () => {
    await waitThenTick(0);
    mockFetchRequest.mockRejectedValue(new Error('network'));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('join-waiting')).toBeTruthy();
    expect(screen.queryByTestId('join-error')).toBeNull();
    expect(screen.queryByTestId('join-waiting-expired')).toBeNull();
  });
});

describe('ApprovePlanScreen', () => {
  beforeEach(() => {
    mockPlan = view({ planKey: 'duo', planSize: 2, seats: 2, members: 2, productId: 'fincwin.duo.year' });
    mockFetchRequest.mockResolvedValue({
      id: 'r1',
      household_id: 'h',
      user_id: 'u2',
      needed_plan_size: 6,
      status: 'waiting',
      created_at: '',
    });
  });
  const open = async (name?: string) => render(wrap(<ApprovePlanScreen requestId="r1" name={name} />));

  it('shows the plan now, the plan after, both store prices and when it starts', async () => {
    await open('Alex');
    await waitFor(() => expect(screen.getByText('Plan after: Household, up to 6 people')).toBeTruthy());
    expect(screen.getByText('Alex is waiting to join Flat 4B')).toBeTruthy();
    expect(screen.getByText('Plan now: Duo, 2 people')).toBeTruthy();
    expect(screen.getByText('$15.99 a month')).toBeTruthy();
    expect(screen.getByText('$150.99 a year')).toBeTruthy();
    expect(screen.getByText('Takes effect: now')).toBeTruthy();
    expect(screen.getByText('Approve and change plan')).toBeTruthy();
    expect(screen.getByText('Cancel invite')).toBeTruthy();
    expect(screen.getByText('Decide later')).toBeTruthy();
  });

  it('runs the store change on "Approve and change plan"', async () => {
    await open('Alex');
    await waitFor(() => expect(screen.getByText('Plan after: Household, up to 6 people')).toBeTruthy());
    await fireEvent.press(screen.getByText('Approve and change plan'));
    await waitFor(() => expect(fakeStoreState.purchases.map((p) => p.packageId)).toEqual(['household_year']));
  });

  it('says the trial ends and the Household price is charged today for a third person in a Duo trial', async () => {
    mockPlan = view({
      status: 'trial',
      kind: 'trial',
      planKey: 'duo',
      planSize: 2,
      seats: 2,
      members: 2,
      trialEndsAt: '2026-12-01T00:00:00Z',
    });
    await open('Alex');
    await waitFor(() =>
      expect(
        screen.getByText('Adding a 3rd person moves you to Household. Your free trial ends and $150.99 is charged today.'),
      ).toBeTruthy(),
    );
  });

  it('shows the renewal date when the change waits for renewal', async () => {
    mockPlan = view({ planKey: 'household', planSize: 6, seats: 6, members: 6, productId: 'fincwin.household.year' });
    mockFetchRequest.mockResolvedValue({
      id: 'r1',
      household_id: 'h',
      user_id: 'u2',
      needed_plan_size: 12,
      status: 'waiting',
      created_at: '',
    });
    await open('Alex');
    // Household to Extended is an upgrade, so it starts now.
    await waitFor(() => expect(screen.getByText('Plan after: Extended, up to 12 people')).toBeTruthy());
    expect(screen.getByText('Takes effect: now')).toBeTruthy();
  });

  it('cancels the request on "Cancel invite" and goes back on "Decide later"', async () => {
    mockCancel.mockResolvedValue({ ok: true });
    await open('Alex');
    await waitFor(() => expect(screen.getByText('Cancel invite')).toBeTruthy());
    await fireEvent.press(screen.getByText('Decide later'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Cancel invite'));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith({}, 'r1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(2));
  });
});
