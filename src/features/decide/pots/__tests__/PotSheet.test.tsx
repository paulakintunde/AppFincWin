import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { goal } from '../../past/__tests__/helpers/pastFixtures';
import { PotSheet } from '../PotSheet';

jest.setTimeout(30000);

const mockAdd = jest.fn(() => ({ id: 'new', stepId: 's-add' }));
const mockEdit = jest.fn(() => 's-edit');
const mockToast = jest.fn();

jest.mock('@/data/mutations/decidePots', () => ({
  useAddPot: () => ({ add: (...a: unknown[]) => (mockAdd as (...x: unknown[]) => unknown)(...a) }),
  useEditPot: () => ({ edit: (...a: unknown[]) => (mockEdit as (...x: unknown[]) => unknown)(...a) }),
}));
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
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pot(over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goal('', { id: 'p1', check_id: null, kind: 'pot', name: 'Car service', target: 60_000, monthly_amount: null, ready_by: '2027-03-31', ...over });
}

async function typeMoney(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

// D-105 (R18.2): By is a month list, not a calendar.
const monthText = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;
async function openBy() {
  await fireEvent.press(screen.getByText('By'));
}
async function pickMonth(y: number, m: number) {
  await openBy();
  await fireEvent.press(screen.getAllByText(monthText(y, m)).at(-1)!);
}

describe('PotSheet', () => {
  it('D-101 Save pot stays disabled until name, target and month are valid', async () => {
    await wrap(<PotSheet visible pot={null} onClose={jest.fn()} />);
    expect(screen.getByText('New pot')).toBeTruthy();
    const disabled = () => screen.getByLabelText('Save pot').props.accessibilityState?.disabled;
    expect(disabled()).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Car service');
    expect(disabled()).toBe(true);
    await typeMoney('Target', '600');
    expect(disabled()).toBe(true);
    await pickMonth(2027, 3);
    expect(disabled()).toBeFalsy();
    await fireEvent.changeText(screen.getByLabelText('Name'), '   ');
    expect(disabled()).toBe(true);
  });

  it('D-101 the stored date is the last day of the chosen month', async () => {
    const onClose = jest.fn();
    await wrap(<PotSheet visible pot={null} onClose={onClose} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), ' Car service ');
    await typeMoney('Target', '600');
    await pickMonth(2028, 2);
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockAdd).toHaveBeenCalledWith({
      householdId: 'h1',
      ownerId: 'u1',
      pot: { name: 'Car service', currency: 'USD', target: 60_000, ready_by: '2028-02-29', opening_saved: 0 },
    });
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.saved', params: { undoLabel: 'potAdded', name: 'Car service' } }, stepId: 's-add' });
    expect(onClose).toHaveBeenCalled();
  });

  it('D-101 the preview comes from potSetAside', async () => {
    await wrap(<PotSheet visible pot={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId('pot-preview')).toBeNull();
    await typeMoney('Target', '600');
    await pickMonth(2027, 3);
    expect(screen.getByTestId('pot-preview').props.children).toBe('About $120 a month for 5 months.');
    await typeMoney('Already saved', '600');
    expect(screen.getByTestId('pot-preview').props.children).toBe('Already at the target.');
  });

  it('D-105 By is a month list that starts this month and ends 50 years out, with no calendar', async () => {
    await wrap(<PotSheet visible pot={null} onClose={jest.fn()} />);
    await openBy();
    expect(screen.queryByTestId('date-picker')).toBeNull();
    expect(screen.getAllByText('Oct 2026').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sep 2026')).toBeNull();
    expect(screen.getAllByText('Oct 2076').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nov 2076')).toBeNull();
  });

  it('D-105 By starts empty and shows the chosen month after a pick', async () => {
    await wrap(<PotSheet visible pot={null} onClose={jest.fn()} />);
    expect(screen.getByText('—')).toBeTruthy();
    await pickMonth(2027, 3);
    expect(screen.getByText('Mar 2027')).toBeTruthy();
    expect(screen.queryByText('Sep 2026')).toBeNull(); // the list closed on the pick
  });

  it('D-105 an existing pot keeps its own past month on the list', async () => {
    await wrap(<PotSheet visible pot={pot({ ready_by: '2026-06-30' })} onClose={jest.fn()} />);
    await openBy();
    expect(screen.getAllByText('Jun 2026').length).toBeGreaterThan(0);
    expect(screen.queryByText('May 2026')).toBeNull();
  });

  it('D-105 Target and Already saved match the Name field: body type, card padding, and the home currency symbol', async () => {
    await wrap(<PotSheet visible pot={null} onClose={jest.fn()} />);
    const input = (label: string) => StyleSheet.flatten(screen.getByLabelText(label).props.style);
    expect(input('Target').fontSize).toBe(input('Name').fontSize);
    expect(input('Already saved').fontSize).toBe(input('Name').fontSize);
    const box = (label: string) => {
      let node = screen.getByLabelText(label).parent;
      while (node) {
        const flat = StyleSheet.flatten(node.props?.style);
        if (flat && flat.paddingHorizontal !== undefined) return flat;
        node = node.parent;
      }
      throw new Error('no box');
    };
    expect(box('Target').paddingHorizontal).toBe(box('Name').paddingHorizontal);
    expect(box('Already saved').paddingHorizontal).toBe(box('Name').paddingHorizontal);
    expect(box('Target').borderRadius).toBe(box('Name').borderRadius);
    const symbols = screen.getAllByTestId('money-symbol');
    expect(symbols).toHaveLength(2);
    expect(symbols.map((n) => n.props.children)).toEqual(['$', '$']);
  });

  it('D-101 a dirty cancel asks to discard', async () => {
    const onClose = jest.fn();
    await wrap(<PotSheet visible pot={null} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1); // clean: just closes
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Car');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Discard changes?')).toBeTruthy();
  });

  it('D-101 edit mode offers Tag a transfer and saves only what changed', async () => {
    const onClose = jest.fn();
    const row = pot();
    await wrap(<PotSheet visible pot={row} onClose={onClose} />);
    expect(screen.getByText('Edit pot')).toBeTruthy();
    expect(screen.getByText(/Saved so far is what you entered/)).toBeTruthy();
    expect(screen.getAllByText('Tag a transfer')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Tag a transfer'));
    expect(screen.getAllByText('Tag a transfer').length).toBeGreaterThan(1); // the transfer picker opened
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Car service and MOT');
    await fireEvent.press(screen.getByLabelText('Save pot'));
    expect(mockEdit).toHaveBeenCalledWith(row, { name: 'Car service and MOT' });
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.saved', params: { undoLabel: 'potEdited', name: 'Car service and MOT' } }, stepId: 's-edit' });
  });
});
