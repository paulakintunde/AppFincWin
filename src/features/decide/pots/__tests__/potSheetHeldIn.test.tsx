import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { goal } from '../../past/__tests__/helpers/pastFixtures';
import { PotSheet } from '../PotSheet';

jest.setTimeout(30000);

const mockAdd = jest.fn(() => ({ id: 'new', stepId: 's-add' }));
const mockEdit = jest.fn(() => 's-edit');
let mockV3 = true;
let mockAccounts: unknown[] = [];

jest.mock('@/data/mutations/decidePots', () => ({
  useAddPot: () => ({ add: (...a: unknown[]) => (mockAdd as (...x: unknown[]) => unknown)(...a) }),
  useEditPot: () => ({ edit: (...a: unknown[]) => (mockEdit as (...x: unknown[]) => unknown)(...a) }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/data/mutations/decideLinks', () => ({ useAttachLine: () => ({ attach: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({
  useGoalLines: () => ({ data: [] }),
  useAttachCandidates: () => ({ data: [] }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));

const account = (id: string, name: string, use: string | null) => ({ id, name, use, deleted_at: null, archived_at: null, currency: 'USD' });

function pot(over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goal('', { id: 'p1', check_id: null, kind: 'pot', name: 'Car service', target: 60_000, monthly_amount: null, ready_by: '2027-03-31', ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockV3 = true;
  mockAccounts = [account('a1', 'Everyday', 'everyday'), account('a2', 'Joint', 'mixed')];
});

describe('PotSheet Held in row', () => {
  it('is hidden when the Decide flag is off', async () => {
    mockV3 = false;
    await wrap(<PotSheet visible pot={pot()} onClose={jest.fn()} />);
    expect(screen.queryByText('Held in')).toBeNull();
  });

  it('is hidden when no account is set to A mix', async () => {
    mockAccounts = [account('a1', 'Everyday', 'everyday')];
    await wrap(<PotSheet visible pot={pot()} onClose={jest.fn()} />);
    expect(screen.queryByText('Held in')).toBeNull();
  });

  it('shows Not set, lists only mixed accounts and saves account_id in the edit patch', async () => {
    const onClose = jest.fn();
    await wrap(<PotSheet visible pot={pot()} onClose={onClose} />);
    expect(screen.getByLabelText('Held in, Not set')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Held in, Not set'));
    expect(screen.queryByLabelText('Everyday')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Joint'));
    expect(screen.getByLabelText('Held in, Joint')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { account_id: 'a2' });
    expect(onClose).toHaveBeenCalled();
  });

  it('choosing Not set clears a placed envelope', async () => {
    await wrap(<PotSheet visible pot={pot({ account_id: 'a2' })} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Held in, Joint'));
    await fireEvent.press(screen.getByLabelText('Not set'));
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).toHaveBeenCalledWith(expect.anything(), { account_id: null });
  });

  it('add mode passes account_id and the prefilled swatch to the add hook', async () => {
    await wrap(<PotSheet visible pot={null} prefill={{ name: 'Holiday', colorKey: 'teal' }} onClose={jest.fn()} />);
    expect((screen.getByLabelText('Name').props as { value: string }).value).toBe('Holiday');
    await fireEvent.press(screen.getByLabelText('Held in, Not set'));
    await fireEvent.press(screen.getByLabelText('Joint'));
    await fireEvent.changeText(screen.getByLabelText('Target'), '600');
    await fireEvent(screen.getByLabelText('Target'), 'blur');
    await fireEvent.press(screen.getByText('By'));
    await fireEvent.press(screen.getAllByText('Mar 2027').at(-1)!);
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockAdd).toHaveBeenCalledWith({
      householdId: 'h1',
      ownerId: 'u1',
      pot: expect.objectContaining({ name: 'Holiday', account_id: 'a2', color_key: 'teal', target: 60_000 }),
    });
  });
});
