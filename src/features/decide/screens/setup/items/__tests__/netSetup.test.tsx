// 06.1-53 (C-21 net, G-5): the safety-net setup item says why Save is off: with no net yet and "Not set yet" not chosen, it waits
// for an amount above zero. Reads and writers are mocked; the writers come in as props (bound in the shell).
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { NetSetup } from '../NetSetup';

jest.setTimeout(60000);

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), back: mockBack, canGoBack: () => true }) }));
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
  mockBack.mockClear();
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

describe('NetSetup Save and close (06.1-65 FQ4)', () => {
  it('a typed amount + Save and close goes through the first-answer write once, then goes back', async () => {
    const answer = jest.fn(() => ({ status: 'saved', stepId: 's1' }));
    await wrap(<NetSetup answer={answer as never} setAccount={jest.fn(() => 'x')} />);
    const field = screen.getByLabelText('Set an amount');
    await fireEvent.changeText(field, '500');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'amount', amount: 50000 }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('an amount of zero + Save and close stays open with the need line', async () => {
    const answer = jest.fn();
    await wrap(<NetSetup answer={answer} setAccount={jest.fn(() => 'x')} />);
    const field = screen.getByLabelText('Set an amount');
    await fireEvent.changeText(field, '0');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(answer).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('need-line').props.children).toBe(NEED);
  });

  it('another currency on save keeps the item open', async () => {
    const answer = jest.fn(() => ({ status: 'other_currency' }));
    await wrap(<NetSetup answer={answer as never} setAccount={jest.fn(() => 'x')} />);
    const field = screen.getByLabelText('Set an amount');
    await fireEvent.changeText(field, '500');
    await fireEvent(field, 'blur');
    await fireEvent.press(save());
    expect(answer).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('nothing typed + Save and close writes nothing and goes back', async () => {
    const answer = jest.fn();
    await wrap(<NetSetup answer={answer} setAccount={jest.fn(() => 'x')} />);
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(answer).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('with a net, an unchanged account + Save leaves with no write', async () => {
    mockGoals = [{ id: 'g1', household_id: 'h1', is_safety_net: true, deleted_at: null, account_id: null, decide_may_use: false }];
    const setAccount = jest.fn(() => 'x');
    await wrap(<NetSetup answer={jest.fn()} setAccount={setAccount} />);
    await fireEvent.press(save());
    expect(setAccount).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
