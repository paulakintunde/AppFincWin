import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { hapticTap } from '@/ui/haptics';
import { JoinScreen } from '../JoinScreen';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() } }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
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
const mockReset = jest.fn();
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'old-h' }),
  resetHouseholdScope: (...a: unknown[]) => mockReset(...a),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1' }] }) }));
const mockPreview = jest.fn();
const mockRedeem = jest.fn();
jest.mock('@/db/householdInvites', () => ({
  ...jest.requireActual('@/db/householdInvites'),
  previewInvite: (...a: unknown[]) => mockPreview(...a),
  redeemInvite: (...a: unknown[]) => mockRedeem(...a),
}));
const mockTake = jest.fn();
jest.mock('../pendingInvite', () => ({
  ...jest.requireActual('../pendingInvite'),
  takePendingInvite: () => mockTake(),
}));

let mockOnline = true;

const CODE = 'A7K2-M9Q3-X4W5';
const PREVIEW = {
  ok: true,
  household_name: 'Flat 4B',
  inviter_display_name: 'Sam',
  inviter_colour_key: 1,
  member_count: 2,
  in_other_household: false,
  already_member: false,
  full: false,
};
const INVALID = 'This invite has run out or was already used. Ask the person who invited you for a new one.';

async function setup(initialCode?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <JoinScreen initialCode={initialCode} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function typeAndCheck(text: string) {
  await fireEvent.changeText(screen.getByTestId('join-code-input'), text);
  await fireEvent.press(screen.getByText('Check code'));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  [mockPreview, mockRedeem, mockReset, mockReplace].forEach((m) => m.mockReset());
  mockTake.mockReset();
  mockTake.mockResolvedValue(null);
  (hapticTap as jest.Mock).mockClear();
  mockOnline = true;
});

describe('JoinScreen', () => {
  it('groups a typed or pasted code and keeps Check code off until 12 characters are in', async () => {
    await setup();
    await fireEvent.changeText(screen.getByTestId('join-code-input'), 'a7k2m9');
    expect(screen.getByTestId('join-code-input').props.value).toBe('A7K2-M9');
    expect(screen.getByText('Check code')).toBeTruthy();
    await fireEvent.press(screen.getByText('Check code'));
    expect(mockPreview).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('join-code-input'), ' a7k2 m9q3 x4w5 ');
    expect(screen.getByTestId('join-code-input').props.value).toBe(CODE);
  });

  it('turns off auto-correct and capitalises as characters', async () => {
    await setup();
    const field = screen.getByTestId('join-code-input');
    expect(field.props.autoCorrect).toBe(false);
    expect(field.props.autoCapitalize).toBe('characters');
  });

  it('shows the same message for an unknown, used, expired or cancelled code', async () => {
    mockPreview.mockResolvedValue({ ok: false, reason: 'invalid' });
    await setup();
    await typeAndCheck(CODE);
    await waitFor(() => expect(screen.getByText(INVALID)).toBeTruthy());
    mockPreview.mockResolvedValue({ ok: false, reason: 'something_else' });
    await typeAndCheck('B7K2-M9Q3-X4W5');
    await waitFor(() => expect(screen.getByText(INVALID)).toBeTruthy());
  });

  it('shows the slow-down message after too many tries', async () => {
    mockPreview.mockResolvedValue({ ok: false, reason: 'slow_down' });
    await setup();
    await typeAndCheck(CODE);
    await waitFor(() => expect(screen.getByText('Too many tries. Wait a few minutes and try again.')).toBeTruthy());
  });

  it('shows the full-household message', async () => {
    mockPreview.mockResolvedValue({ ...PREVIEW, full: true });
    await setup();
    await typeAndCheck(CODE);
    await waitFor(() =>
      expect(screen.getByText('Flat 4B already has 6 people. Ask the owner to remove someone first.')).toBeTruthy(),
    );
  });

  it('warns when the person is in another household and offers no Join', async () => {
    mockPreview.mockResolvedValue({ ...PREVIEW, in_other_household: true });
    await setup();
    await typeAndCheck(CODE);
    await waitFor(() => expect(screen.getByTestId('join-in-other')).toBeTruthy());
    expect(screen.getByText('You’re in another household. Leave it first to join this one.')).toBeTruthy();
    expect(screen.getByText('Go to my household')).toBeTruthy();
    expect(screen.queryByText('Join Flat 4B')).toBeNull();
  });

  it('needs a connection to join', async () => {
    mockOnline = false;
    await setup();
    expect(screen.getByText('You need a connection to join. Connect and try again.')).toBeTruthy();
  });

  it('previews who invited you, joins on one tap, then shows the what is shared card once', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockRedeem.mockResolvedValue({ ok: true, household_id: 'h-new', household_name: 'Flat 4B' });
    await setup();
    await typeAndCheck(CODE);
    await waitFor(() => expect(screen.getByTestId('join-preview')).toBeTruthy());
    expect(screen.getByText('Sam invited you to Flat 4B')).toBeTruthy();
    expect(screen.getByText('2 people so far')).toBeTruthy();
    expect(screen.getByText('Your accounts and records come with you and stay private.')).toBeTruthy();
    expect(mockRedeem).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Join Flat 4B'));
    await waitFor(() => expect(mockRedeem).toHaveBeenCalledWith({}, CODE));
    expect(mockReset).toHaveBeenCalledWith(expect.anything(), 'me', 'old-h');
    expect(hapticTap).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('whats-shared-body')).toBeTruthy());
    expect(screen.getByTestId('whats-shared-body').props.children).toBe(
      'Your records stay private. Only lines you mark shared are seen by Flat 4B. Your Decide checks are never shared.',
    );
    await fireEvent.press(screen.getByText('Got it'));
    expect(mockReplace).toHaveBeenCalledWith('/household');
    expect(await AsyncStorage.getItem('fincwin.whatsSharedSeen.h-new')).not.toBeNull();
  });

  it('does not show the card a second time for the same household', async () => {
    await AsyncStorage.setItem('fincwin.whatsSharedSeen.h-new', '1');
    mockPreview.mockResolvedValue(PREVIEW);
    mockRedeem.mockResolvedValue({ ok: true, household_id: 'h-new', household_name: 'Flat 4B' });
    await setup();
    await typeAndCheck(CODE);
    await waitFor(() => expect(screen.getByText('Join Flat 4B')).toBeTruthy());
    await fireEvent.press(screen.getByText('Join Flat 4B'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/household'));
    expect(screen.queryByTestId('whats-shared-body')).toBeNull();
  });

  it('fills the code from a link and shows the preview without joining', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    await setup(CODE);
    await waitFor(() => expect(screen.getByTestId('join-preview')).toBeTruthy());
    expect(screen.getByTestId('join-code-input').props.value).toBe(CODE);
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it('picks up a code stored before sign-in', async () => {
    mockTake.mockResolvedValue(CODE);
    mockPreview.mockResolvedValue(PREVIEW);
    await setup();
    await waitFor(() => expect(screen.getByTestId('join-preview')).toBeTruthy());
    expect(mockRedeem).not.toHaveBeenCalled();
  });
});
