import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SplitSheet, type SplitValue } from '../SplitSheet';

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
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ showCents: true }) }));

function member(id: string, name: string, weight: number, colour: number) {
  return { household_id: 'h', user_id: id, is_owner: id === 'me', role_label: 'Flatmate', weight, colour_key: colour, display_name: name, name_hidden: false, version: 1 };
}
const mockMembers = [member('me', 'Paul', 50, 0), member('sam', 'Sam', 50, 1)];
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));
jest.mock('../../WeightsSheet', () => ({ WeightsSheet: () => null }));

const mockHapticWarn = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticTap: jest.fn(),
  hapticWarn: () => mockHapticWarn(),
  hapticTick: jest.fn(),
  hapticFailed: jest.fn(),
  hapticMilestone: jest.fn(),
}));

const start: SplitValue = { rule: 'even', included: ['me', 'sam'], amounts: {} };

async function setup(over: Partial<React.ComponentProps<typeof SplitSheet>> = {}) {
  const onSave = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SplitSheet
          visible
          householdId="h"
          currency="USD"
          total={8400}
          householdCurrency="USD"
          payerId="me"
          value={start}
          onClose={jest.fn()}
          onSave={onSave}
          {...over}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return onSave;
}

beforeEach(() => mockHapticWarn.mockClear());

describe('SplitSheet', () => {
  it('offers the four rules and a preview that adds up to the total', async () => {
    await setup();
    expect(screen.getByTestId('split-rule-even')).toBeTruthy();
    expect(screen.getByTestId('split-rule-weight')).toBeTruthy();
    expect(screen.getByTestId('split-rule-amount')).toBeTruthy();
    expect(screen.getByTestId('split-rule-mine')).toBeTruthy();
    expect(screen.getAllByText('$42.00').length).toBe(2);
    expect(screen.getByText('Adds up to $84.00')).toBeTruthy();
  });

  it('saves a valid even split with the people ticked', async () => {
    const onSave = await setup();
    await fireEvent.press(screen.getByText('Save split'));
    expect(onSave).toHaveBeenCalledWith({ rule: 'even', included: expect.arrayContaining(['me', 'sam']), amounts: {} });
  });

  it('by amount cannot be saved while something is left to assign, and warns', async () => {
    const onSave = await setup({ value: { rule: 'amount', included: ['me', 'sam'], amounts: { me: 7000, sam: 1000 } } });
    expect(screen.getByText('Left to assign: $4.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save split'));
    expect(onSave).not.toHaveBeenCalled();
    expect(mockHapticWarn).toHaveBeenCalled();
  });

  it('by amount saves once nothing is left to assign', async () => {
    const onSave = await setup({ value: { rule: 'amount', included: ['me', 'sam'], amounts: { me: 7000, sam: 1400 } } });
    expect(screen.queryByTestId('split-left')).toBeNull();
    await fireEvent.press(screen.getByText('Save split'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('even with only the payer ticked says why and cannot be saved', async () => {
    const onSave = await setup({ value: { rule: 'even', included: ['me'], amounts: {} } });
    expect(screen.getByTestId('split-reason')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save split'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('leaves By amount out when the line is in another currency than the household', async () => {
    await setup({ currency: 'EUR' });
    expect(screen.queryByTestId('split-rule-amount')).toBeNull();
  });

  it('by weight shows the household weights read-only with a Change weights link', async () => {
    await setup({ value: { rule: 'weight', included: ['me', 'sam'], amounts: {} } });
    expect(screen.getByTestId('split-weights')).toBeTruthy();
    expect(screen.getByTestId('split-change-weights')).toBeTruthy();
  });
});
