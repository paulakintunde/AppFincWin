// 06.1-80 (DC-10, DS-19): a saved "Something changed" item can be changed from its home line (with Undo), and a one-off cost can
// carry a name that home shows. Haptics, toast and data hooks are mocked.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { DecideChangeRow } from '@/db/decideChanges';
import { showToast } from '@/state/undoToast';
import { wrap } from '@/test/stepProps';
import { SomethingChanged, SomethingChangedSheet } from '../SomethingChanged';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/entry/pickers/DateField', () => ({ DateField: () => null }));

const mockAdd = jest.fn((_input: unknown) => ({ id: 'new', stepId: 'step-add' }));
const mockEdit = jest.fn((_row: unknown, _patch: unknown) => 'step-edit');
const mockRemove = jest.fn((_row: unknown) => 'step-reset');
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: mockAdd }),
  useEditChange: () => ({ edit: mockEdit }),
  useRemoveChange: () => ({ remove: mockRemove }),
}));
let mockRows: DecideChangeRow[] = [];
jest.mock('@/data/queries/decide', () => ({ useDecideChanges: () => ({ data: mockRows }) }));
let mockSeries: unknown[] = [];
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ evaluation: { month: { typicalLeft: 40_000, typicalIncome: 300_000 } } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-11-11' }),
}));

function changeRow(over: Partial<DecideChangeRow>): DecideChangeRow {
  return {
    id: 'ch1',
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    kind: 'spending',
    name: 'Car repair',
    monthly_amount: 90_000,
    currency: 'USD',
    start_month: '2026-11',
    end_month: '2026-11',
    is_sample: false,
    deleted_at: null,
    version: 2,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...over,
  };
}

const gym = { id: 's-gym', name: 'Gym', amount: -4_000, freq: 'monthly', deleted_at: null, end_date: null, counts_as: null, goal_id: null };

async function typeAmount(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [];
  mockSeries = [];
});

describe('Something changed: a one-off cost can be named (DS-19)', () => {
  it('the name field shows for a one-off only', async () => {
    await wrap(
      <SomethingChangedSheet visible bills={[]} currency="USD" today="2026-11-11" usualLeft={null} usualPay={null} formatMoney={(n) => `$${n / 100}`} formatDate={(d) => d} onSave={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(screen.queryByLabelText('Name (optional)')).toBeNull();
    await fireEvent.press(screen.getByLabelText('My pay changed'));
    expect(screen.queryByLabelText('Name (optional)')).toBeNull();
    await fireEvent.press(screen.getByLabelText('A one-off cost is coming'));
    expect(screen.getByLabelText('Name (optional)')).toBeTruthy();
  });

  it('a named one-off saves its name, and the toast says it', async () => {
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByTestId('something-changed-row'));
    await fireEvent.press(screen.getByLabelText('A one-off cost is coming'));
    await typeAmount('Amount', '900');
    await fireEvent.changeText(screen.getByLabelText('Name (optional)'), '  Car repair ');
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0]?.[0]).toMatchObject({ change: { kind: 'spending', name: 'Car repair', monthly_amount: 90_000, start_month: '2026-11', end_month: '2026-11' } });
    expect(showToast).toHaveBeenCalledWith({
      kind: 'ordinary',
      text: { key: 'decide.screens.sheetsHome.changed.toast', params: expect.objectContaining({ change: 'Car repair', name: 'Car repair', undoLabel: 'changeAdded' }) },
      stepId: 'step-add',
    });
  });

  it('with no name the one-off keeps today’s wording', async () => {
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByTestId('something-changed-row'));
    await fireEvent.press(screen.getByLabelText('A one-off cost is coming'));
    await typeAmount('Amount', '9');
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    const name = (mockAdd.mock.calls[0]?.[0] as { change: { name: string } }).change.name;
    expect(name).toMatch(/^One-off \$9/);
  });

  it('home shows the name and amount for a named one-off, and today’s wording without one', async () => {
    mockRows = [changeRow({}), changeRow({ id: 'ch2', name: 'One-off $9.00', monthly_amount: 900 })];
    await wrap(<SomethingChanged />);
    expect(screen.getByTestId('changed-chip-ch1')).toHaveTextContent(/^Changed: Car repair \$900(\.00)?ChangeReset$/);
    expect(screen.getByTestId('changed-chip-ch2')).toHaveTextContent(/^Changed: One-off \$9(\.00)?ChangeReset$/);
  });
});

describe('Something changed: a saved item can be changed, with Undo (DC-10)', () => {
  it('Change opens the sheet filled with the saved values; Save writes only what moved, with Undo', async () => {
    const row = changeRow({});
    mockRows = [row];
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByLabelText('Change, Car repair'));
    expect(screen.getByLabelText('A one-off cost is coming').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Name (optional)').props.value).toBe('Car repair');
    await typeAmount('Amount', '950');
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect(mockEdit).toHaveBeenCalledWith(row, { monthly_amount: 95_000 });
    expect(showToast).toHaveBeenCalledWith({
      kind: 'ordinary',
      text: { key: 'decide.screens.sheetsHome.changed.toast', params: expect.objectContaining({ change: 'Car repair', undoLabel: 'changeEdited' }) },
      stepId: 'step-edit',
    });
    expect(screen.queryByLabelText('Save what changed')).toBeNull();
  });

  it('renaming a one-off writes the new name', async () => {
    const row = changeRow({});
    mockRows = [row];
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByLabelText('Change, Car repair'));
    await fireEvent.changeText(screen.getByLabelText('Name (optional)'), 'Brakes');
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(mockEdit).toHaveBeenCalledWith(row, { name: 'Brakes' });
  });

  it('Save with nothing moved writes nothing and says nothing', async () => {
    mockRows = [changeRow({})];
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByLabelText('Change, Car repair'));
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Save what changed')).toBeNull();
  });

  it('a stopped bill opens with its bill and status chosen', async () => {
    mockSeries = [gym];
    mockRows = [changeRow({ id: 'ch3', name: 'Gym paused', monthly_amount: -4_000, end_month: null })];
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByLabelText('Change, Gym paused'));
    expect(screen.getByLabelText('A bill stopped or paused').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('changed-bill-s-gym-tint')).toBeTruthy();
    expect(screen.getByLabelText('Paused').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText('Stopped'));
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch3' }), { name: 'Gym stopped' });
  });

  it('a change the sheet cannot open again (its bill is gone) has Reset but no Change', async () => {
    mockRows = [changeRow({ id: 'ch4', name: 'Phone stopped', monthly_amount: -4_500, end_month: null })];
    await wrap(<SomethingChanged />);
    expect(screen.queryByTestId('changed-change-ch4')).toBeNull();
    expect(screen.getByTestId('changed-reset-ch4')).toBeTruthy();
  });

  it('Reset removes the change with Undo', async () => {
    const row = changeRow({});
    mockRows = [row];
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByLabelText('Reset the change: Car repair'));
    expect(mockRemove).toHaveBeenCalledWith(row);
    expect(showToast).toHaveBeenCalledWith({
      kind: 'ordinary',
      text: { key: 'decide.screens.sheetsHome.changed.resetToast', params: { undoLabel: 'changeDeleted', name: 'Car repair' } },
      stepId: 'step-reset',
    });
  });
});
