import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DeleteAccountScreen } from '../DeleteAccountScreen';

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
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));

let mockOnline = true;
jest.mock('@/features/household/useHouseholdScope', () => ({
  useHouseholdScope: () => ({ userId: 'me', householdId: 'h', name: 'Home', members: [], isOwner: false, online: mockOnline }),
}));
jest.mock('@/features/household/useMemberLabel', () => ({
  useMemberLabel: () => (id: string | null) => (id === 'next' ? 'Sam' : 'Former member'),
}));
let mockPreview: { data?: Record<string, unknown>; isLoading: boolean } = { isLoading: false };
jest.mock('../useAccountDeletionPreview', () => ({ useAccountDeletionPreview: () => mockPreview }));
let mockPlan: Record<string, unknown> = {};
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
const mockManage = jest.fn(() => Promise.resolve());
jest.mock('@/features/plans/store/purchasesClient', () => ({ openManageSubscription: () => mockManage() }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
const mockRequest = jest.fn();
jest.mock('@/services/account/deleteAccount', () => ({ requestAccountDeletion: (...a: unknown[]) => mockRequest(...a) }));

const alone = { in_shared_household: false, is_owner: false, next_owner_user_id: null, household_name: null };
const sharedMember = { in_shared_household: true, is_owner: false, next_owner_user_id: null, household_name: 'The Flat' };
const sharedOwner = { in_shared_household: true, is_owner: true, next_owner_user_id: 'next', household_name: 'The Flat' };

async function renderScreen() {
  return render(
    <ThemeProvider>
      <DeleteAccountScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockPlan = { status: 'sample', payerIsMe: false, store: null, members: 1 };
  mockPreview = { data: alone, isLoading: false };
  mockRequest.mockResolvedValue({ ok: true });
});

describe('DeleteAccountScreen', () => {
  it('shows the household paragraph only for someone in a shared household', async () => {
    await renderScreen();
    expect(screen.queryByTestId('delete-household-paragraph')).toBeNull();
    await screen.unmount();

    mockPreview = { data: sharedMember, isLoading: false };
    await renderScreen();
    expect(screen.getByTestId('delete-household-paragraph').props.children).toContain('The Flat');
    expect(screen.queryByTestId('delete-owner-line')).toBeNull();
  });

  it('names the next owner for an owner', async () => {
    mockPreview = { data: sharedOwner, isLoading: false };
    await renderScreen();
    expect(screen.getByTestId('delete-owner-line').props.children).toBe('Sam becomes the owner and is told.');
  });

  it('keeps the button disabled until the typed word matches, then deletes', async () => {
    await renderScreen();
    const button = () => screen.getByRole('button', { name: 'Delete my account' });
    expect(button().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(button());
    expect(mockRequest).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'delet');
    expect(button().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'delete');
    expect(button().props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(button());
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
  });

  it('shows the failure line and allows another try when the deletion fails', async () => {
    mockRequest.mockResolvedValue({ ok: false, reason: 'failed' });
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(screen.getByTestId('delete-failed')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Delete my account' }).props.accessibilityState?.disabled).toBeFalsy();
  });

  it('is disabled with a helper line while offline', async () => {
    mockOnline = false;
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
    expect(screen.getByTestId('delete-offline')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete my account' }).props.accessibilityState?.disabled).toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  describe('billing warning (09-15, D-23)', () => {
    const BODY = 'Deleting your account doesn’t cancel billing. Cancel in your app store first.';

    it('warns the payer of an active store plan with the exact sentence, and the confirm stays enabled', async () => {
      mockPlan = { status: 'trial', payerIsMe: true, store: 'PLAY_STORE', members: 1 };
      await renderScreen();
      expect(screen.getByText('Billing keeps going')).toBeTruthy();
      expect(screen.getByText(BODY)).toBeTruthy();
      await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
      expect(screen.getByRole('button', { name: 'Delete my account' }).props.accessibilityState?.disabled).toBeFalsy();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
      await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    });

    it('links to Manage subscription', async () => {
      mockPlan = { status: 'active', payerIsMe: true, store: 'APP_STORE', members: 1 };
      await renderScreen();
      await fireEvent.press(screen.getByText('Manage subscription'));
      expect(mockManage).toHaveBeenCalledTimes(1);
    });

    it('adds the others-covered line for the payer of a home with other people', async () => {
      mockPlan = { status: 'active', payerIsMe: true, store: 'APP_STORE', members: 3 };
      await renderScreen();
      expect(screen.getByText('2 other people are covered by this plan. They will see a notice and 7 days of full access.')).toBeTruthy();
    });

    it('shows no warning to a member, a tester or someone with no plan', async () => {
      for (const plan of [
        { status: 'active', payerIsMe: false, store: 'APP_STORE', members: 2 },
        { status: 'tester', payerIsMe: true, store: 'PROMOTIONAL', members: 1 },
        { status: 'sample', payerIsMe: false, store: null, members: 1 },
      ]) {
        mockPlan = plan;
        await renderScreen();
        expect(screen.queryByText('Billing keeps going')).toBeNull();
        await screen.unmount();
      }
    });
  });
});
