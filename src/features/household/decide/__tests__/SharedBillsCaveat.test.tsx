import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { SharedBillsCaveat, sharedBillsStale } from '../SharedBillsCaveat';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-GB' }) }));

let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));

const member = (id: string, name: string | null, colour: number, hidden = false) => ({
  household_id: 'h', user_id: id, is_owner: false, role_label: 'Partner', weight: 50, colour_key: colour,
  display_name: name, name_hidden: hidden, version: 1,
});

async function setup(ui: React.ReactElement) {
  const client = new QueryClient();
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1)];
});

describe('sharedBillsStale (OWNER-Q9: 30 days)', () => {
  it('is stale only when older than 30 days', () => {
    expect(sharedBillsStale('2026-10-19', '2026-11-18')).toBe(false); // exactly 30
    expect(sharedBillsStale('2026-10-18', '2026-11-18')).toBe(true); // 31
    expect(sharedBillsStale('2026-11-18', '2026-11-18')).toBe(false);
  });
});

describe('SharedBillsCaveat', () => {
  it('shows the word, the glyph and the sentence in the tight tint', async () => {
    await setup(<SharedBillsCaveat householdId="h" partnerId="u2" lastDate="2026-11-03" />);
    expect(screen.getByText('Shared bills')).toBeTruthy();
    expect(screen.getByText(/Sam hasn’t entered shared bills since 3 Nov 2026, so shared costs could be higher\./)).toBeTruthy();
    const row = screen.getByTestId('shared-bills-caveat');
    expect(JSON.stringify(row.props.style)).toContain(stateColors.tight.tint);
  });

  it('reads a hidden name as its colour, never the real name', async () => {
    mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1, true)];
    await setup(<SharedBillsCaveat householdId="h" partnerId="u2" lastDate="2026-11-03" />);
    expect(screen.queryByText(/Sam/)).toBeNull();
    expect(screen.getByText(/Rust hasn’t entered shared bills since/)).toBeTruthy();
    expect(screen.getByTestId('shared-bills-caveat').props.accessibilityLabel).not.toContain('Sam');
  });
});
