import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { goal } from '../../past/__tests__/helpers/pastFixtures';
import { PotSheet } from '../PotSheet';

jest.setTimeout(30000);

const mockAdd = jest.fn(() => ({ id: 'new', stepId: 's-add' }));
const mockEdit = jest.fn(() => 's-edit');

jest.mock('@/data/mutations/decidePots', () => ({
  useAddPot: () => ({ add: (...a: unknown[]) => (mockAdd as (...x: unknown[]) => unknown)(...a) }),
  useEditPot: () => ({ edit: (...a: unknown[]) => (mockEdit as (...x: unknown[]) => unknown)(...a) }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
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

function bucket(over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goal('', { id: 'b1', check_id: null, kind: 'pot', name: 'A trip or holiday', bucket: 'trip', target: 500_000, ready_by: null, monthly_amount: 10_000, ...over });
}

beforeEach(() => jest.clearAllMocks());

describe('PotSheet on a saving bucket (05.2 D-22)', () => {
  it('shows Each month and Goal (optional) and no month field', async () => {
    await wrap(<PotSheet visible pot={bucket()} onClose={jest.fn()} />);
    expect(screen.getByLabelText('Each month')).toBeTruthy();
    expect(screen.getByLabelText('Goal (optional)')).toBeTruthy();
    expect(screen.queryByText('By')).toBeNull();
    expect(screen.queryByLabelText('Target')).toBeNull();
  });

  it('saves only a changed monthly amount, with no date needed', async () => {
    const onClose = jest.fn();
    await wrap(<PotSheet visible pot={bucket()} onClose={onClose} />);
    await fireEvent.changeText(screen.getByLabelText('Each month'), '150');
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), { monthly_amount: 15_000 });
    expect(onClose).toHaveBeenCalled();
  });

  it('saves a bucket that has no goal at all', async () => {
    await wrap(<PotSheet visible pot={bucket({ target: null, monthly_amount: 0 })} onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Each month'), '20');
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).toHaveBeenCalledWith(expect.anything(), { monthly_amount: 2_000 });
  });

  it('clearing the goal patches target null', async () => {
    await wrap(<PotSheet visible pot={bucket()} onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Goal (optional)'), '');
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).toHaveBeenCalledWith(expect.anything(), { target: null });
  });

  it('an ordinary pot still needs a target and a month', async () => {
    const ordinary = goal('', { id: 'p1', check_id: null, kind: 'pot', name: 'Car service', target: 60_000, monthly_amount: null, ready_by: '2027-03-31' });
    await wrap(<PotSheet visible pot={ordinary} onClose={jest.fn()} />);
    expect(screen.getByLabelText('Target')).toBeTruthy();
    expect(screen.queryByLabelText('Each month')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Target'), '');
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).not.toHaveBeenCalled();
  });
});
