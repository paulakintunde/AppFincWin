import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { LineEditorSheet } from '../LineEditorSheet';
import { wrap } from '../steps/__tests__/helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const fmt = (n: number) => `$${(n / 100).toFixed(2)}`;
const BILLS = [{ id: 'ser-1', name: 'Parking', monthly: 12_000 }];

async function open(context: 'adjust' | 'running' | 'replaces' | 'setback' | 'fee', extra: Partial<React.ComponentProps<typeof LineEditorSheet>> = {}) {
  const onSave = jest.fn();
  const onCancel = jest.fn();
  await wrap(<LineEditorSheet visible context={context} currency="USD" formatMoney={fmt} onSave={onSave} onCancel={onCancel} {...extra} />);
  return { onSave, onCancel };
}

async function typeAmount(text: string) {
  const amount = screen.getByLabelText('Amount');
  await fireEvent.changeText(amount, text);
  await fireEvent(amount, 'blur');
}

describe('LineEditorSheet', () => {
  it.each([
    ['adjust', 'Add a cost, fee or trade-in'],
    ['running', 'Add a running cost'],
    ['replaces', 'Add an expense it replaces'],
    ['setback', 'Add a setback to test'],
    ['fee', 'Add a fee'],
  ] as const)('titles the %s context', async (context, title) => {
    await open(context);
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  });

  it('renders nothing while closed', async () => {
    await wrap(<LineEditorSheet visible={false} context="running" currency="USD" formatMoney={fmt} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('keeps Save line disabled until there is a name and an amount above zero', async () => {
    const { onSave } = await open('running');
    const save = () => screen.getByLabelText('Save line');
    expect(save().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Insurance');
    expect(save().props.accessibilityState.disabled).toBe(true);
    await typeAmount('45');
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Insurance', amount: 4_500 }));
  });

  it('adjustments carry the Adds / Takes off choice and Paid on the day', async () => {
    const { onSave } = await open('adjust');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Trade-in');
    await typeAmount('300');
    await fireEvent.press(screen.getByLabelText('Takes off the price'));
    await fireEvent.press(screen.getByLabelText('Paid on the day'));
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ effect: 'takes_off', onDay: true, amount: 30_000 }));
  });

  it('replaces lists recurring bills and picking one prefills the line', async () => {
    const { onSave } = await open('replaces', { recurringBills: BILLS });
    expect(screen.getByText('From your recurring bills')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Parking, $120.00'));
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Parking', amount: 12_000, seriesId: 'ser-1' }));
  });

  it('WR-C11: a picked bill whose amount is changed no longer ends its series', async () => {
    const { onSave } = await open('replaces', { recurringBills: BILLS });
    await fireEvent.press(screen.getByLabelText('Parking, $120.00'));
    await typeAmount('80');
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Parking', amount: 8_000, seriesId: null }));
  });

  it('WR-C11: a picked bill renamed with its amount unchanged still ends its series', async () => {
    const { onSave } = await open('replaces', { recurringBills: BILLS });
    await fireEvent.press(screen.getByLabelText('Parking, $120.00'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Car park');
    await typeAmount('120');
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Car park', amount: 12_000, seriesId: 'ser-1' }));
  });

  it('setbacks choose a kind and take months and a percent', async () => {
    const { onSave } = await open('setback');
    await fireEvent.press(screen.getByText('Income drops'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Pay cut');
    await fireEvent.changeText(screen.getByLabelText('Drop, percent'), '30');
    await fireEvent.changeText(screen.getByLabelText('Months'), '4');
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ code: 'income_drop', percentDrop: 30, months: 4, amount: 0 }));
  });

  it('late invoices take days late, and a one-off setback still needs an amount', async () => {
    const { onSave } = await open('setback');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Repair');
    expect(screen.getByLabelText('Save line').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText('Invoices pay late'));
    await fireEvent.changeText(screen.getByLabelText('Days late'), '45');
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ code: 'late_invoice', daysLate: 45 }));
  });

  it('Cancel closes without saving and without asking', async () => {
    const { onSave, onCancel } = await open('running');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Typed');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts from the initial values', async () => {
    await open('running', { initial: { name: 'Fuel', amount: 8_000 } });
    expect(screen.getByLabelText('Name').props.value).toBe('Fuel');
    expect(screen.getByLabelText('Save line').props.accessibilityState.disabled).toBe(false);
  });
});
