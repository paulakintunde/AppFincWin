// 06.1-53 (C-21 net, G-5): the safety-net setup item says why Save is off: with no net yet and "Not set yet" not chosen, it waits
// for an amount above zero. Reads and writers are mocked; the writers come in as props (bound in the shell).
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { NetSetup } from '../NetSetup';

jest.setTimeout(60000);

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-20' }),
}));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ inputs: null, source: null, v3: null }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
let mockGoals: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockGoals }) }));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => ({ model: { safetyNet: null } }) }));
jest.mock('@/ui/ProgressBar', () => ({ ProgressBar: () => null }));
jest.mock('@/features/grow/safetyNet/netPreview', () => ({ essentialMonthOf: () => 0 }));

const NEED = 'An amount above zero is needed.';
const save = () => screen.getByLabelText('Save safety net');

beforeEach(() => {
  mockGoals = [];
});

describe('NetSetup need line (06.1-53 C-21)', () => {
  it('with no amount, Save is off and the line says an amount above zero is needed', async () => {
    const answer = jest.fn();
    await wrap(<NetSetup answer={answer} setAccount={jest.fn(() => 'x')} />);
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('need-line').props.children).toBe(NEED);
  });

  it('an amount above zero turns Save on and clears the line', async () => {
    const answer = jest.fn(() => ({ status: 'saved', stepId: 's1' }));
    await wrap(<NetSetup answer={answer as never} setAccount={jest.fn(() => 'x')} />);
    const field = screen.getByLabelText('Set an amount');
    await fireEvent.changeText(field, '500');
    await fireEvent(field, 'blur');
    expect(save().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText(NEED)).toBeNull();
  });

  it('"Not set yet" needs no amount, so no line', async () => {
    await wrap(<NetSetup answer={jest.fn()} setAccount={jest.fn(() => 'x')} />);
    await fireEvent.press(screen.getByLabelText('Not set yet'));
    expect(save().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText(NEED)).toBeNull();
  });

  it('with a net already saved, no line', async () => {
    mockGoals = [{ id: 'g1', household_id: 'h1', is_safety_net: true, deleted_at: null, account_id: null, decide_may_use: false }];
    await wrap(<NetSetup answer={jest.fn()} setAccount={jest.fn(() => 'x')} />);
    expect(screen.queryByText(NEED)).toBeNull();
  });
});
