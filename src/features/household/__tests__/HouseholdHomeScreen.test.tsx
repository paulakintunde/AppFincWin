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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/db/memberDepartures', () => ({ fetchOpenDepartures: jest.fn(async () => []), reinviteRemoved: jest.fn() }));
const mockMarkRead = jest.fn(async () => undefined);
jest.mock('@/db/householdEvents', () => ({ markHouseholdEventsRead: () => mockMarkRead() }));

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
}));

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
  resetPushOnceForTests();
  mockPush.mockClear();
  mockMarkRead.mockClear();
  mockInvites = [];
  mockEvents = [];
  mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' })];
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

  it('says there are no notices', async () => {
    await setup(<NoticesScreen />);
    expect(screen.getByTestId('notices-empty')).toBeTruthy();
  });
});
