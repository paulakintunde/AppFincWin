import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useMemberLabel } from '../useMemberLabel';

const members = [
  { household_id: 'h', user_id: 'me', display_name: 'Me', name_hidden: false, colour_key: 0 },
  { household_id: 'h', user_id: 'u2', display_name: 'Sam', name_hidden: false, colour_key: 1 },
  { household_id: 'h', user_id: 'u3', display_name: 'Pat', name_hidden: true, colour_key: 2 },
];
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/householdMembers', () => ({ fetchHouseholdMembers: async () => members }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return await renderHook(() => useMemberLabel('h'), { wrapper });
}

describe('useMemberLabel (D-32)', () => {
  it('names the viewer, shown names, and shows the colour for a hidden name', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current('u2')).toBe('Sam'));
    expect(result.current('me')).toBe('You');
    expect(result.current('u3')).toBe('Slate');
  });

  it('says Former member for a null id and for someone no longer listed', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current('u2')).toBe('Sam'));
    expect(result.current(null)).toBe('Former member');
    expect(result.current('gone')).toBe('Former member');
  });

  it('adds (left) for a member marked as left', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current('u2')).toBe('Sam'));
    expect(result.current('u2', { left: true })).toBe('Sam (left)');
    expect(result.current('u3', { left: true })).toBe('Slate (left)');
  });
});
