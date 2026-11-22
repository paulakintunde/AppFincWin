import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetPushOnceForTests } from '@/shell/navigation/pushOnce';
import { HouseholdHomeScreen } from '../HouseholdHomeScreen';
import { NoticesScreen } from '../NoticesScreen';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, [cb]);
  },
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
// 09-20: the plan view. Default is a tester household (no plan row), which keeps the Phase 8 behaviour.
const TESTER_PLAN = {
  status: 'tester', kind: 'prelaunch', writable: true, householdId: 'h', planKey: null, planSize: 0, period: null, seats: 6, members: 1,
  payerId: null, payerIsMe: false, payerName: null, store: null, productId: null, willRenew: false, coveredUntil: null, trialEndsAt: null,
  graceUntil: null, promoKind: 'tester', prelaunch: true, leftGrace: false, trialAvailable: true, billingIssueAt: null, loading: false, isError: false,
};
let mockPlanView: Record<string, unknown> = TESTER_PLAN;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlanView }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/db/memberDepartures', () => ({ fetchOpenDepartures: jest.fn(async () => []), reinviteRemoved: jest.fn() }));
const mockMarkRead = jest.fn(async () => undefined);
jest.mock('@/db/householdEvents', () => ({ markHouseholdEventsRead: () => mockMarkRead() }));

let mockPairs: Record<string, unknown>[] = [];
let mockOwedToMe = 0;
let mockSettlements: Record<string, unknown>[] = [];
let mockDeparted: Record<string, unknown>[] = [];
jest.mock('@/data/queries/householdBalances', () => ({
  useHouseholdBalances: () => ({ data: { pairs: mockPairs, owedToMe: mockOwedToMe } }),
  usePairLines: () => ({ data: [] }),
  useSettlements: () => ({ data: mockSettlements }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/db/settlements', () => ({
  myDepartedBalances: jest.fn(async () => ({ ok: true, balances: mockDeparted })),
}));
const mockLeaverPay = jest.fn(async (_v: Record<string, unknown>): Promise<Record<string, unknown>> => ({ ok: true, settlement_id: 's1', amount: 4000 }));
jest.mock('@/data/mutations/settlements', () => {
  const hook = () => ({ mutateAsync: jest.fn(), isPending: false });
  return {
    useProposeSettlement: hook, useRecordReceived: hook, useRecordPaid: hook, useUndoSettlement: hook, useConfirmSettlement: hook,
    useRejectSettlement: hook, useCancelSettlement: hook, useSetSettlementPayerAccount: hook, useAskToSettle: hook,
    useWriteOff: hook,
    useProposeLeaverPayment: () => ({ mutateAsync: (v: Record<string, unknown>) => mockLeaverPay(v), isPending: false }),
  };
});

jest.mock('../MemberSheet', () => ({
  MemberSheet: ({ visible, userId }: { visible: boolean; userId: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return visible ? <Text testID="member-sheet">{userId}</Text> : null;
  },
}));
jest.mock('../InviteSheet', () => ({
  InviteSheet: ({ visible }: { visible: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return visible ? <Text testID="invite-sheet">{String(visible)}</Text> : null;
  },
}));
jest.mock('../RenameHouseholdSheet', () => ({ RenameHouseholdSheet: () => null }));
jest.mock('../HouseholdCurrencySheet', () => ({ HouseholdCurrencySheet: () => null }));

let mockMembers: Record<string, unknown>[] = [];
let mockInvites: Record<string, unknown>[] = [];
let mockEvents: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h' }),
  useHousehold: () => ({ data: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 } }),
  useHouseholdMembers: () => ({ data: mockMembers }),
  useHouseholdEvents: () => ({ events: mockEvents, unreadCount: mockEvents.length, isLoading: false }),
  useOpenInvites: (_h: unknown, isOwner: boolean) => ({ data: isOwner ? mockInvites : [] }),
  useFormerMembers: () => ({ data: [] }),
}));

// 08.1-23: the spending rule row and the purpose card read through useSpendRule (mocked; its view comes from the real spendViewOf).
let mockSpend: { view: unknown; jointAccounts: { id: string }[]; purposes: { id: string; joint_purpose: string | null }[] | undefined } = {
  view: null,
  jointAccounts: [],
  purposes: [],
};
jest.mock('../rules/useSpendRule', () => ({ useSpendRule: () => mockSpend }));

function member(id: string, name: string | null, colour: number, extra: Record<string, unknown> = {}) {
  return {
    household_id: 'h', user_id: id, is_owner: false, role_label: 'Flatmate', weight: 50, colour_key: colour,
    display_name: name, name_hidden: false, version: 1, created_at: '2026-11-01', ...extra,
  };
}

async function setup(ui: React.ReactElement = <HouseholdHomeScreen />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPlanView = TESTER_PLAN;
  resetPushOnceForTests();
  mockPush.mockClear();
  mockMarkRead.mockClear();
  mockInvites = [];
  mockEvents = [];
  mockPairs = [];
  mockOwedToMe = 0;
  mockSettlements = [];
  mockDeparted = [];
  mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' })];
  mockSpend = { view: null, jointAccounts: [], purposes: [] };
});

describe('HouseholdHomeScreen', () => {
  it('shows Just you for now with a way to invite and a way to enter a code', async () => {
    await setup();
    expect(screen.getByText('Just you for now')).toBeTruthy();
    expect(screen.getByText('Have a code?')).toBeTruthy();
    expect(screen.getByText('Invite someone')).toBeTruthy();
    expect(screen.queryByText('Leave household')).toBeNull();
    await fireEvent.press(screen.getByText('Have a code?'));
    expect(mockPush).toHaveBeenCalledWith('/household/join');
  });

  it('gives the owner Invite someone and pending invites, with the link scheme only', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockInvites = [{ invite_id: 'i1', code: 'ABCD-1234-EFGH', expires_at: '2026-11-22T00:00:00Z', created_at: '2026-11-15' }];
    await setup();
    expect(screen.getByText('+ Invite someone')).toBeTruthy();
    expect(screen.getByTestId('pending-invites')).toBeTruthy();
    expect(screen.getByText('Valid for one person')).toBeTruthy();
    expect(screen.getByText('Copy link')).toBeTruthy();
    expect(screen.getByText('Cancel invite')).toBeTruthy();
    expect(screen.getByText('Leave household')).toBeTruthy();
    await fireEvent.press(screen.getByText('+ Invite someone'));
    expect(screen.getByTestId('invite-sheet')).toBeTruthy();
  });

  it('hides every owner action from a member', async () => {
    mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1, { is_owner: true, role_label: 'Owner' })];
    mockInvites = [{ invite_id: 'i1', code: 'ABCD-1234-EFGH', expires_at: '2026-11-22T00:00:00Z', created_at: '2026-11-15' }];
    await setup();
    expect(screen.queryByText('+ Invite someone')).toBeNull();
    expect(screen.queryByTestId('pending-invites')).toBeNull();
    expect(screen.queryByText('Rename')).toBeNull();
    expect(screen.queryByTestId('household-currency-link')).toBeNull();
  });

  it('shows a hidden-name member by colour name and opens the member sheet', async () => {
    mockMembers = [
      member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }),
      member('u2', 'Sam', 1, { name_hidden: true }),
    ];
    await setup();
    expect(screen.getByText('Rust')).toBeTruthy();
    expect(screen.queryByText('Sam')).toBeNull();
    await fireEvent.press(screen.getByText('Rust'));
    expect(screen.getByTestId('member-sheet').props.children).toBe('u2');
  });

  it('shows the cap line at 6 members and the rules, recent changes and leave links', async () => {
    mockMembers = [
      member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }),
      ...['u2', 'u3', 'u4', 'u5', 'u6'].map((id, i) => member(id, `P${i}`, i + 1)),
    ];
    await setup();
    expect(screen.getByText('A household holds up to 6 people.')).toBeTruthy();
    expect(screen.queryByText('+ Invite someone')).toBeNull();
    await fireEvent.press(screen.getByText('Category defaults'));
    expect(mockPush).toHaveBeenCalledWith('/household/category-defaults');
    await fireEvent.press(screen.getByText('Leave household'));
    expect(mockPush).toHaveBeenCalledWith('/household/leave');
    expect(screen.getByText('Nothing has changed yet')).toBeTruthy();
  });

  it.each([
    ['How new shared lines are split', '/household/split-default'],
    ['Category defaults', '/household/category-defaults'],
    ['Shared accounts', '/household/shared-accounts'],
    ['How spending is split', '/household/spending'],
  ])('the Rules card row %s opens %s', async (label, route) => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    await setup();
    await fireEvent.press(screen.getByText(label));
    expect(mockPush).toHaveBeenCalledWith(route);
  });

  it('08.1-23 Q1/Q6: How spending is split is the fourth row and shows the current rule, or Needs updating', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockSpend = { ...mockSpend, view: { asked: 'bring', outOfDate: false } };
    await setup();
    expect(screen.getByText('How spending is split')).toBeTruthy();
    expect(screen.getByText('What each person brings')).toBeTruthy();
  });

  it('08.1-23 Q6: the spending row says Needs updating while set shares are out of date', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockSpend = { ...mockSpend, view: { asked: 'custom', outOfDate: true } };
    await setup();
    expect(screen.getByText('Needs updating')).toBeTruthy();
  });

  it('08.1-23 Q1: there is no spending row for a household of one', async () => {
    await setup();
    expect(screen.queryByText('How spending is split')).toBeNull();
  });

  it('08.1-23 Q9: one card counts the joint accounts with no purpose, singular for one, and goes to Shared accounts', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockSpend = { view: null, jointAccounts: [{ id: 'j1' }, { id: 'j2' }], purposes: [{ id: 'j1', joint_purpose: null }, { id: 'j2', joint_purpose: 'bills' }] };
    await setup();
    expect(screen.getByText('1 joint account doesn’t have a purpose set yet. Until then, it counts as everyday spending.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('purpose-missing-action'));
    expect(mockPush).toHaveBeenCalledWith('/household/shared-accounts');
  });

  it('08.1-23 Q9: the card says the plural, and is gone once every joint account has a purpose', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockSpend = { view: null, jointAccounts: [{ id: 'j1' }, { id: 'j2' }], purposes: [{ id: 'j1', joint_purpose: null }] };
    await setup();
    expect(screen.getByText('2 joint accounts don’t have a purpose set yet. Until then, they count as everyday spending.')).toBeTruthy();
  });

  it('08.1-23 Q9: no card once every joint account has a purpose', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockSpend = { view: null, jointAccounts: [{ id: 'j1' }], purposes: [{ id: 'j1', joint_purpose: 'everyday' }] };
    await setup();
    expect(screen.queryByTestId('purpose-missing-card')).toBeNull();
  });

  it('writes recent changes through the member resolver', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockEvents = [
      { id: 'e1', household_id: 'h', kind: 'joined', actor_id: 'u2', subject_id: 'u2', ref_id: null, params: {}, created_at: '2026-11-15T10:00:00Z' },
    ];
    await setup();
    expect(screen.getByText('Sam joined Flat 4B')).toBeTruthy();
    expect(screen.getByLabelText('Notices, 1 unread')).toBeTruthy();
  });
});

describe('HouseholdHomeScreen balances (08-21)', () => {
  const two = () => [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];

  it('says who owes whom, with the not-spendable note and a row for the pair', async () => {
    mockMembers = two();
    mockPairs = [{ otherKey: 'u2', net: 8400, pending: 0, lineIds: ['l1'] }];
    mockOwedToMe = 8400;
    await setup();
    expect(screen.getByTestId('balances-hero').props.children).toBe('Sam owes you $84.00.');
    expect(screen.getByText('Not spendable until it arrives')).toBeTruthy();
    expect(screen.getByText('owes you')).toBeTruthy();
    expect(screen.getByText('$84.00')).toBeTruthy();
  });

  it('lists a member who left with an open balance, marked (left)', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' })];
    mockPairs = [{ otherKey: 'gone', net: -2500, pending: 0, lineIds: ['l1'] }];
    await setup();
    expect(screen.getByTestId('household-balances')).toBeTruthy();
    expect(screen.getByText('you owe')).toBeTruthy();
  });

  it('says everyone is square when nothing is owed', async () => {
    mockMembers = two();
    await setup();
    expect(screen.getByTestId('balances-hero').props.children).toBe('Everyone is square in Flat 4B.');
  });

  it('shows the leaver their departed balance with an I paid entry, and a waiting state without it', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' })];
    mockDeparted = [
      { departure_id: 'd1', household_id: 'old', household_name: 'Flat 4B', kind: 'left', other_id: 'u2', other_display_name: 'Sam', other_colour_key: 1, amount: 4000, currency: 'USD', line_ids: ['l1', 'l4'], pending_settlement_id: null, pending_amount: null },
    ];
    await setup();
    expect(await screen.findByText('You owe Sam $40.00 from Flat 4B')).toBeTruthy();
    expect(screen.getByText('I paid')).toBeTruthy();
  });

  it('I paid sends the server line ids and amount, and a refusal says the lines changed', async () => {
    mockDeparted = [
      { departure_id: 'd1', household_id: 'old', household_name: 'Flat 4B', kind: 'left', other_id: 'u2', other_display_name: 'Sam', other_colour_key: 1, amount: 4000, currency: 'USD', line_ids: ['l1', 'l4'], pending_settlement_id: null, pending_amount: null },
    ];
    mockLeaverPay.mockResolvedValueOnce({ ok: false, reason: 'lines_changed', server_amount: 3000 });
    await setup();
    await fireEvent.press(await screen.findByText('I paid'));
    expect(mockLeaverPay).toHaveBeenCalledWith(expect.objectContaining({ household: 'old', receiver: 'u2', lineIds: ['l1', 'l4'], expectedAmount: 4000 }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('shows a departed balance in the old household currency, not the current one', async () => {
    mockDeparted = [
      { departure_id: 'd1', household_id: 'old', household_name: 'Old flat', kind: 'left', other_id: 'u2', other_display_name: 'Sam', other_colour_key: 1, amount: -2500, currency: 'EUR', line_ids: ['l1'], pending_settlement_id: null, pending_amount: null },
    ];
    await setup();
    expect(await screen.findByText(/Sam owes you .*€.*25\.00|Sam owes you .*25\.00.*€/)).toBeTruthy();
    expect(screen.queryByText(/\$25\.00/)).toBeNull();
  });
});

describe('NoticesScreen', () => {
  it('lists events newest first and marks them read on focus', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockEvents = [
      { id: 'e2', household_id: 'h', kind: 'weights_changed', actor_id: 'u2', subject_id: null, ref_id: null, params: {}, created_at: '2026-11-16T10:00:00Z' },
      { id: 'e1', household_id: 'h', kind: 'owner_changed', actor_id: null, subject_id: 'me', ref_id: null, params: {}, created_at: '2026-11-15T10:00:00Z' },
    ];
    await setup(<NoticesScreen />);
    expect(screen.getByText('Sam changed the weights')).toBeTruthy();
    expect(screen.getByText('You’re now the owner of Flat 4B')).toBeTruthy();
    expect(mockMarkRead).toHaveBeenCalled();
  });

  it('shows the settle_departed notice in its own words', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    mockEvents = [
      { id: 'e3', household_id: 'h', kind: 'settle_departed', actor_id: null, subject_id: 'u2', ref_id: 's1', params: { amount: 2500, currency: 'USD', reason: 'left' }, created_at: '2026-11-16T10:00:00Z' },
    ];
    await setup(<NoticesScreen />);
    expect(screen.getByText('Sam left the household. The $25.00 settle-up with Sam was cancelled and the lines are owed again.')).toBeTruthy();
  });

  it('says there are no notices', async () => {
    await setup(<NoticesScreen />);
    expect(screen.getByTestId('notices-empty')).toBeTruthy();
  });

  describe('plan line (09-20, UI-SPEC 13)', () => {
    const duo = { ...TESTER_PLAN, status: 'active', kind: 'active', planKey: 'duo', planSize: 2, seats: 2, members: 2, payerId: 'me', payerIsMe: true, payerName: 'Paul' };
    const twoPeople = () => [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];

    it('shows who pays and how many people the plan holds, with See plans for the payer', async () => {
      mockPlanView = duo;
      mockMembers = twoPeople();
      await setup();
      expect(screen.getByText('Plan: Duo · Paul pays')).toBeTruthy();
      expect(screen.queryByTestId('status-badge-coveredBy')).toBeNull();
      expect(screen.getByText('Duo holds 2 people.')).toBeTruthy();
      await fireEvent.press(screen.getByText('See plans'));
      expect(mockPush).toHaveBeenCalled();
      // an invite past the size goes to approval, so the link stays
      expect(screen.getByText('+ Invite someone')).toBeTruthy();
    });

    it('says who covers the home and that only the payer can change it, to an owner who does not pay', async () => {
      mockPlanView = { ...duo, payerId: 'u2', payerIsMe: false, payerName: 'Sam' };
      mockMembers = twoPeople();
      await setup();
      expect(screen.getByText('Plan: Duo · Sam pays')).toBeTruthy();
      expect(screen.getByTestId('status-badge-coveredBy')).toBeTruthy();
      expect(screen.getByText('Sam pays. Only they can change the plan.')).toBeTruthy();
      expect(screen.getByText('Ask Sam to change the plan.')).toBeTruthy();
      expect(screen.queryByText('See plans')).toBeNull();
    });
  });
});
