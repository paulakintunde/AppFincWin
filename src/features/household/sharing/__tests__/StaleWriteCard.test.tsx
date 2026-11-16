import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StaleWriteCard } from '../StaleWriteCard';

jest.setTimeout(30000);

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({
    data: [
      { household_id: 'h', user_id: 'me', is_owner: true, role_label: 'x', weight: 50, colour_key: 0, display_name: 'Paul', name_hidden: false, version: 1 },
      { household_id: 'h', user_id: 'sam', is_owner: false, role_label: 'x', weight: 50, colour_key: 1, display_name: 'Sam', name_hidden: false, version: 1 },
    ],
  }),
  useFormerMembers: () => ({ data: [] }),
}));

const mockHapticWarn = jest.fn();
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticWarn: () => mockHapticWarn(), hapticTick: jest.fn(), hapticFailed: jest.fn(), hapticMilestone: jest.fn() }));

const mockDismiss = jest.fn(async () => undefined);
let mockWrites: unknown[] = [];
jest.mock('@/data/sync/failedWrites', () => ({
  getFailedWrites: () => mockWrites,
  subscribeFailedWrites: () => () => undefined,
  dismissFailedWrite: (...a: unknown[]) => (mockDismiss as unknown as (...x: unknown[]) => Promise<void>)(...a),
}));

async function setup(onMakeAgain = jest.fn(), change?: React.ComponentProps<typeof StaleWriteCard>['change']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <StaleWriteCard householdId="h" lineId="l1" month="2026-11" change={change} onMakeAgain={onMakeAgain} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return onMakeAgain;
}

beforeEach(() => {
  mockHapticWarn.mockClear();
  mockDismiss.mockClear();
  mockWrites = [{ id: 'f1', entity: 'transactions', entityId: 'l1', kind: 'conflict', code: 'version-conflict', attempted: { updated_by: 'sam' }, at: 'x' }];
});

describe('StaleWriteCard', () => {
  it('names who changed the line first, says the change was not saved, and warns', async () => {
    await setup();
    expect(screen.getByText('Sam changed this first')).toBeTruthy();
    expect(screen.getByText('Your change wasn’t saved.')).toBeTruthy();
    expect(mockHapticWarn).toHaveBeenCalled();
  });

  it('gives the field, before, after and time when the server told us', async () => {
    await setup(jest.fn(), { field: 'amount', before: '$80.00', after: '$84.00', time: '14:05' });
    expect(screen.getByText('Sam changed the amount from $80.00 to $84.00 at 14:05. Your change wasn’t saved.')).toBeTruthy();
  });

  it('offers both paths: See their change and Make my change again', async () => {
    const again = await setup();
    await fireEvent.press(screen.getByText('See their change'));
    expect(mockDismiss).toHaveBeenCalledWith('f1');
    mockDismiss.mockClear();
    await fireEvent.press(screen.getByText('Make my change again'));
    await waitFor(() => expect(again).toHaveBeenCalled());
  });

  it('shows nothing when there is no conflict for the line', async () => {
    mockWrites = [];
    await setup();
    expect(screen.queryByTestId('stale-write-card')).toBeNull();
  });
});
