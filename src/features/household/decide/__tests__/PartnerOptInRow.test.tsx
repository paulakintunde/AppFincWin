import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PartnerOptInRow } from '../PartnerOptInRow';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));

let mockOptins: { owner_id: string; partner_id: string; enabled: boolean }[] = [];
const mockSet = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; reason?: string; enabled?: boolean }> => ({ ok: true }));
jest.mock('@/db/partnerOptins', () => ({ setPartnerOptin: (...a: unknown[]) => mockSet(...a) }));
jest.mock('@/data/queries/partnerMoney', () => {
  const actual = jest.requireActual('@/data/queries/partnerMoney');
  return { ...actual, usePartnerOptins: () => ({ data: mockOptins }) };
});

const member = (id: string, name: string | null, colour: number, hidden = false) => ({
  household_id: 'h', user_id: id, is_owner: false, role_label: 'Partner', weight: 50, colour_key: colour,
  display_name: name, name_hidden: hidden, version: 1,
});

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <PartnerOptInRow householdId="h" partnerId="u2" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSet.mockClear();
  mockOptins = [];
  mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1)];
});

describe('PartnerOptInRow', () => {
  it('is off by default, with the helper and an accessible label that names the state', async () => {
    await setup();
    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityState.checked).toBe(false);
    expect(sw.props.accessibilityLabel).toBe('Count Sam’s money in my Decide checks. Off');
    expect(screen.getByText(/Only a single rounded total is used\. Sam’s records are never shown to you\. Sam has to say yes on their side too\./)).toBeTruthy();
    expect(screen.queryByTestId('partner-optin-waiting')).toBeNull();
    expect(screen.queryByTestId('partner-optin-both')).toBeNull();
  });

  it('shows the waiting state while only this side is on', async () => {
    mockOptins = [{ owner_id: 'me', partner_id: 'u2', enabled: true }];
    await setup();
    expect(screen.getByTestId('partner-optin-waiting')).toBeTruthy();
    expect(screen.getByText('Waiting for Sam to agree')).toBeTruthy();
    expect(screen.getByRole('switch').props.accessibilityLabel).toContain('Waiting for Sam to agree');
  });

  it('shows "On for both of you" when both sides are on', async () => {
    mockOptins = [
      { owner_id: 'me', partner_id: 'u2', enabled: true },
      { owner_id: 'u2', partner_id: 'me', enabled: true },
    ];
    await setup();
    expect(screen.getByTestId('partner-optin-both')).toBeTruthy();
    expect(screen.getByText('On for both of you')).toBeTruthy();
  });

  it('does not count the other side alone as this side being on', async () => {
    mockOptins = [{ owner_id: 'u2', partner_id: 'me', enabled: true }];
    await setup();
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(false);
    expect(screen.queryByTestId('partner-optin-both')).toBeNull();
  });

  it('turns on and off through the server call', async () => {
    await setup();
    fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith({}, 'u2', true));
  });

  it('reads a hidden name as its colour', async () => {
    mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1, true)];
    await setup();
    expect(screen.queryByText(/Sam/)).toBeNull();
    expect(screen.getByRole('switch').props.accessibilityLabel).toContain('Rust');
  });

  it('says so when the save is refused', async () => {
    mockSet.mockResolvedValueOnce({ ok: false, reason: 'not_a_member' });
    await setup();
    fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByText('This wasn’t saved. Try again.')).toBeTruthy());
  });
});
