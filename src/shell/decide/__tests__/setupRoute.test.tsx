/**
 * Plan 05.2-32: the /decide/setup route. D-01 gate (T-05.2-32-01), param checks, and that the route provides the
 * series-edit write to the steps (a SavingStep under the route shows its Raise pill; features/decide cannot import that
 * write itself).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { SetupRoute } from '../SetupRoute';

jest.setTimeout(30000);

let mockV3 = true;
let mockParams: Record<string, string> = {};
const mockEditFrom = jest.fn((_i: Record<string, unknown>) => 'step-raise');
const mockScreen = jest.fn();
let mockRenderSaving = false;
let mockOnReady: (r: unknown) => void = () => undefined;
const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T>,
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('../SetupSheetHost', () => ({ useSetupSheetHost: jest.fn() }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEditSeriesFrom: () => ({ editFrom: (i: Record<string, unknown>) => mockEditFrom(i) }) }));
jest.mock('../SetupScreen', () => ({
  SetupScreen: (props: Record<string, unknown>) => {
    mockScreen(props);
    const { Text } = jest.requireActual('react-native');
    const { SavingStep } = jest.requireActual('@/features/decide/setup/steps/SavingStep');
    return mockRenderSaving ? <SavingStep mode="stepper" onReadyChange={mockOnReady} /> : <Text testID="setup-screen" />;
  },
}));
jest.mock('@/data/mutations/seriesAttributes', () => ({ usePatchSeriesAttributes: () => ({ patch: jest.fn() }) }));
jest.mock('@/data/mutations/decidePots', () => ({ useAddPot: () => ({ add: jest.fn() }), useEditPot: () => ({ edit: jest.fn() }) }));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({
    data: [{ id: 's1', name: 'Save', account_id: 'acc1', category_id: 'cat-sav', amount: 40000, currency: 'USD', freq: 'monthly', anchor_date: '2026-10-05', end_date: null, deleted_at: null, saving_mode: null, version: 3 }],
  }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'acc1', name: 'Rainy day' }] }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [{ id: 'cat-sav', builtin_key: 'Savings' }] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { plain: [], live: [], wait: [], done: [] } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

beforeEach(() => {
  mockV3 = true;
  mockParams = {};
  mockEditFrom.mockClear();
  mockScreen.mockClear();
  mockRenderSaving = false;
});

describe('SetupRoute', () => {
  it('redirects to the Decide tab and renders nothing else when the account has no switch', async () => {
    mockV3 = false;
    await render(<SetupRoute />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByTestId('setup-screen')).toBeNull();
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('defaults to the full stepper', async () => {
    await render(<SetupRoute />);
    expect(mockScreen).toHaveBeenCalledWith({ mode: 'full' });
  });

  it('reads mode=standalone and ignores startAt/only values it does not know', async () => {
    mockParams = { mode: 'standalone', startAt: 'bogus', only: 'accountUse' };
    await render(<SetupRoute />);
    // `only` is edit-one-step and belongs to the full stepper; standalone never takes it.
    expect(mockScreen).toHaveBeenCalledWith({ mode: 'standalone' });
  });

  it('takes a known startAt and a known only, never welcome', async () => {
    mockParams = { startAt: 'unspent' };
    await render(<SetupRoute />);
    expect(mockScreen).toHaveBeenLastCalledWith({ mode: 'full', startAt: 'unspent' });
    mockParams = { only: 'accountUse', startAt: 'welcome' };
    await render(<SetupRoute />);
    expect(mockScreen).toHaveBeenLastCalledWith({ mode: 'full', only: 'accountUse' });
  });
});

describe('SetupRoute provides the series-edit write', () => {
  it('a SavingStep under the route offers Raise, and Raise reaches the series write', async () => {
    mockRenderSaving = true;
    const ready = jest.fn();
    mockOnReady = ready;
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider>
            <SetupRoute />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
    await fireEvent.press(screen.getByText('A new car'));
    await fireEvent.changeText(screen.getByLabelText('A new car, each month'), '500');
    const raise = screen.getByRole('button', { name: /Raise my regular saving to .*500/ });
    await fireEvent.press(raise);
    expect(mockEditFrom).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', patch: { amount: 50000 } }));
  });
});
