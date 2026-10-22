import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { DecideChangeRow } from '@/db/decideChanges';
import { showToast } from '@/state/undoToast';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { ChangeSheet, toMonthKey } from '../ChangeSheet';
import { ChangesCard } from '../ChangesCard';

jest.setTimeout(30000);

const mockAdd = jest.fn(() => ({ id: 'new', stepId: 's-add' }));
const mockEdit = jest.fn(() => 's-edit');
const mockRemove = jest.fn(() => 's-remove');
let mockPicker: ((e: { type: string }, d?: Date) => void) | undefined;

jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: (...a: unknown[]) => (mockAdd as (...x: unknown[]) => unknown)(...a) }),
  useEditChange: () => ({ edit: (...a: unknown[]) => (mockEdit as (...x: unknown[]) => unknown)(...a) }),
  useRemoveChange: () => ({ remove: (...a: unknown[]) => (mockRemove as (...x: unknown[]) => unknown)(...a) }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', ready: true }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
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

const whole = (n: number) => `$${Math.round(n / 100)}`;
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

function change(over: Partial<DecideChangeRow> = {}): DecideChangeRow {
  return {
    id: 'c1',
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    kind: 'income',
    name: 'Raise',
    monthly_amount: 30_000,
    currency: 'USD',
    start_month: '2026-11',
    end_month: null,
    is_sample: false,
    deleted_at: null,
    version: 3,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

async function typeAmount(text: string) {
  const field = screen.getByLabelText('Amount a month');
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

describe('toMonthKey', () => {
  it('slices a local date without any Date round trip', () => {
    expect(toMonthKey('2026-11-23')).toBe('2026-11');
    expect(toMonthKey('2026-01-01')).toBe('2026-01');
    expect(toMonthKey('2026-12-31')).toBe('2026-12');
  });
});

describe('ChangeSheet add mode', () => {
  it('opens with the defaults and Save disabled until an amount is typed', async () => {
    await wrap(<ChangeSheet visible row={null} onClose={jest.fn()} />);
    expect(screen.getByText('Add a change')).toBeTruthy();
    expect(screen.getByText('Oct 2026')).toBeTruthy(); // starts this month
    expect(screen.queryByText('Ends')).toBeNull(); // No end date is on
    expect(screen.getByLabelText('Save change').props.accessibilityState?.disabled).toBe(true);
    await typeAmount('250');
    expect(screen.getByLabelText('Save change').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('saves a signed amount, the month keys and a null end', async () => {
    const onClose = jest.fn();
    await wrap(<ChangeSheet visible row={null} onClose={onClose} />);
    await typeAmount('250');
    await fireEvent.press(screen.getByLabelText('Save change'));
    expect(mockAdd).toHaveBeenCalledWith({
      householdId: 'h1',
      ownerId: 'u1',
      change: { kind: 'income', name: null, monthly_amount: 25_000, currency: 'USD', start_month: '2026-10', end_month: null },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('stores spending going down as a negative amount with a name and an end month', async () => {
    await wrap(<ChangeSheet visible row={null} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Spending'));
    await fireEvent.press(screen.getByLabelText('Goes down'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Gym');
    await typeAmount('40');
    await fireEvent.press(screen.getByLabelText('No end date'));
    expect(screen.getByText('Ends')).toBeTruthy();
    await fireEvent.press(screen.getByText('Ends'));
    await act(async () => mockPicker!({ type: 'set' }, noon(2027, 3, 9)));
    await fireEvent.press(screen.getByLabelText('Save change'));
    expect(mockAdd).toHaveBeenCalledWith({
      householdId: 'h1',
      ownerId: 'u1',
      change: { kind: 'spending', name: 'Gym', monthly_amount: -4_000, currency: 'USD', start_month: '2026-10', end_month: '2027-03' },
    });
  });

  it('refuses a start month before this one', async () => {
    await wrap(<ChangeSheet visible row={null} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText('Starts'));
    await act(async () => mockPicker!({ type: 'set' }, noon(2026, 9, 20)));
    expect(screen.getByText('Oct 2026')).toBeTruthy();
    await act(async () => mockPicker!({ type: 'set' }, noon(2026, 12, 2)));
    expect(screen.getByText('Dec 2026')).toBeTruthy();
  });

  it('refuses an end before the start inline and keeps Save disabled', async () => {
    await wrap(<ChangeSheet visible row={null} onClose={jest.fn()} />);
    await typeAmount('250');
    await fireEvent.press(screen.getByText('Starts'));
    await act(async () => mockPicker!({ type: 'set' }, noon(2027, 9, 1)));
    expect(screen.queryByText('The end month is before the start month.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('No end date')); // the end opens at this month, before the start
    expect(screen.getByText('The end month is before the start month.')).toBeTruthy();
    expect(screen.getByLabelText('Save change').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Save change'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('Cancel without edits just closes; with edits it asks to discard', async () => {
    const onClose = jest.fn();
    await wrap(<ChangeSheet visible row={null} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await typeAmount('10');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Discard changes?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep editing'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await fireEvent.press(screen.getByText('Discard'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ChangeSheet edit mode', () => {
  it('fills from the row and sends only the changed keys', async () => {
    await wrap(<ChangeSheet visible row={change({ monthly_amount: -12_000, kind: 'spending', name: 'Rent' })} onClose={jest.fn()} />);
    expect(screen.getByText('Edit change')).toBeTruthy();
    expect(screen.getByDisplayValue('Rent')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Rent rise');
    await fireEvent.press(screen.getByLabelText('Save change'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect(mockEdit.mock.calls[0]).toEqual([expect.objectContaining({ id: 'c1' }), { name: 'Rent rise' }]);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('saving with nothing changed writes nothing', async () => {
    const onClose = jest.fn();
    await wrap(<ChangeSheet visible row={change()} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText('Save change'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ChangesCard', () => {
  it('shows the empty state and opens the add sheet', async () => {
    await wrap(<ChangesCard changes={[]} currency="USD" whole={whole} />);
    expect(screen.getByText('Changes coming up')).toBeTruthy();
    expect(screen.getByText('Nothing dated yet')).toBeTruthy();
    expect(screen.getByText('A raise, a rent change or a bill ending: add it and every check looks 12 months ahead.')).toBeTruthy();
    await fireEvent.press(screen.getByText('+ Add a change'));
    expect(screen.getByText('Add a change')).toBeTruthy();
  });

  it('lists rows with a tag in words and the from / until line', async () => {
    await wrap(
      <ChangesCard
        changes={[
          change(),
          change({ id: 'c2', name: null, kind: 'spending', monthly_amount: -5_000, start_month: '2026-12', end_month: '2027-06' }),
        ]}
        currency="USD"
        whole={whole}
      />
    );
    expect(screen.getByText('Raise')).toBeTruthy();
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('+$300 a month · from Nov 2026')).toBeTruthy();
    expect(screen.getByText('Spending change')).toBeTruthy();
    expect(screen.getByText('Spending')).toBeTruthy();
    expect(screen.getByText('−$50 a month · from Dec 2026 · until Jun 2027')).toBeTruthy();
  });

  it('tap edits a row', async () => {
    await wrap(<ChangesCard changes={[change()]} currency="USD" whole={whole} />);
    await fireEvent.press(screen.getByText('Raise'));
    expect(screen.getByText('Edit change')).toBeTruthy();
  });

  it('the x removes with the Change removed toast and Undo step', async () => {
    const row = change();
    await wrap(<ChangesCard changes={[row]} currency="USD" whole={whole} />);
    // IN-B03: the x names its row
    await fireEvent.press(screen.getByLabelText('Remove Raise'));
    expect(mockRemove).toHaveBeenCalledWith(row);
    expect(showToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.depth.changes.removed' }, stepId: 's-remove' });
  });
});
