import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { goal } from '../../past/__tests__/helpers/pastFixtures';
import { PotSheet } from '../PotSheet';

jest.setTimeout(30000);

const mockAdd = jest.fn(() => ({ id: 'new', stepId: 's-add' }));
const mockEdit = jest.fn(() => 's-edit');
const mockToast = jest.fn();
let mockPicker: ((e: { type: string }, d?: Date) => void) | undefined;

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
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: { onChange: (e: { type: string }, d?: Date) => void }) => {
    mockPicker = props.onChange;
    return null;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPicker = undefined;
});

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

function pot(over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goal('', { id: 'p1', check_id: null, kind: 'pot', name: 'Car service', target: 60_000, monthly_amount: null, ready_by: '2027-03-31', ...over });
}

async function typeMoney(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

async function pickMonth(y: number, m: number) {
  await fireEvent.press(screen.getByText('By'));
  await act(async () => mockPicker!({ type: 'set' }, noon(y, m, 9)));
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
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.saved' }, stepId: 's-add' });
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

  it('D-101 a month beyond 50 years shows the range line and blocks Save', async () => {
    await wrap(<PotSheet visible pot={null} onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Far');
    await typeMoney('Target', '600');
    await pickMonth(2080, 1);
    expect(screen.getByText('Out of range: within 50 years')).toBeTruthy();
    expect(screen.getByLabelText('Save pot').props.accessibilityState?.disabled).toBe(true);
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
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.saved' }, stepId: 's-edit' });
  });
});
