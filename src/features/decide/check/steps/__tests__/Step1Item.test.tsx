import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { showToast } from '@/state/undoToast';
import { Step1Item, step1Complete } from '../Step1Item';
import { buy, stepProps, wrap, TODAY } from './helpers/stepProps';
import type { InputLine } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

const BILLS = [{ id: 'ser-1', name: 'Parking', monthly: 12_000 }];
const mockUpdate = (p: ReturnType<typeof stepProps>) => p.update as jest.Mock;

function line(over: Partial<InputLine> = {}): InputLine {
  return { id: 'rp-1', name: 'Parking', amount: 12_000, note: 'Recurring', counted: true, seriesId: 'ser-1', category: null, ...over };
}

async function renderStep(over: Parameters<typeof buy>[0] = {}, props: Parameters<typeof stepProps>[1] = {}) {
  const p = stepProps(buy(over), props);
  const view = await wrap(<Step1Item {...p} recurringBills={BILLS} />);
  return { p, view };
}

describe('Step1Item', () => {
  beforeEach(() => jest.clearAllMocks());

  it('captures the name, price and who quoted it as plain JSON', async () => {
    const { p } = await renderStep({ name: '', advertised: null });
    await fireEvent.changeText(screen.getByLabelText('What it is'), 'Sofa');
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ name: 'Sofa' });
    await fireEvent.changeText(screen.getByLabelText('Who quoted it'), 'Shop');
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ source: 'Shop' });
    const price = screen.getByLabelText('Price you have been quoted');
    await fireEvent.changeText(price, '1200');
    await fireEvent(price, 'blur');
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ advertised: 120_000 });
  });

  it('switching kind keeps the name and price and clears the method', async () => {
    const { p } = await renderStep();
    await fireEvent.press(screen.getByText('An investment'));
    expect(mockUpdate(p)).toHaveBeenCalledWith({ kind: 'invest', method: null });
  });

  it('typing "car" on a loan check sets secured true while the toggle is untouched', async () => {
    const { p } = await renderStep({ method: 'loan', name: '' });
    await fireEvent.changeText(screen.getByLabelText('What it is'), 'car');
    const patch = mockUpdate(p).mock.calls.at(-1)[0];
    expect(patch.itemType).toBe('vehicle');
    expect(patch.itemTypeTouched).toBe(false);
    expect(patch.loan.secured).toBe(true);
  });

  it('after the user flips secured, a later item type pick leaves it as it was', async () => {
    const base = buy({ method: 'loan', itemType: 'vehicle', itemTypeTouched: true });
    const touched = { ...base, loan: { ...base.loan, secured: true, securedTouched: true } };
    const p = stepProps(touched);
    await wrap(<Step1Item {...p} recurringBills={BILLS} />);
    await fireEvent.press(screen.getByLabelText('Item type, Vehicle'));
    await fireEvent.press(screen.getByLabelText('General'));
    const patch = mockUpdate(p).mock.calls.at(-1)[0];
    expect(patch.itemType).toBe('general');
    expect(patch.itemTypeTouched).toBe(true);
    expect(patch.loan.secured).toBe(true);
  });

  it('shows "Suggested from the name" until the type is touched', async () => {
    const { view } = await renderStep();
    expect(screen.getByText('Suggested from the name')).toBeTruthy();
    await view.unmount();
    await renderStep({ itemTypeTouched: true });
    expect(screen.queryByText('Suggested from the name')).toBeNull();
  });

  it('offset chips set the need-by date', async () => {
    const { p } = await renderStep();
    await fireEvent.press(screen.getByText('In a week'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ needBy: '2026-10-22' });
    await fireEvent.press(screen.getByText('In 3 months'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ needBy: '2027-01-15' });
  });

  it('marks the chip that equals the stored date', async () => {
    await renderStep({ needBy: '2026-11-15' });
    expect(screen.getByLabelText('In a month').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('In a week').props.accessibilityState.selected).toBe(false);
  });

  it('a stored past date reads "This date has passed" and blocks Next', async () => {
    await renderStep({ needBy: '2026-10-01' });
    expect(screen.getByText('This date has passed')).toBeTruthy();
    expect(step1Complete(buy({ needBy: '2026-10-01' }), TODAY)).toBe(false);
  });

  it('shows how far away a future date is', async () => {
    await renderStep({ needBy: '2026-10-16' });
    expect(screen.getByText('Tomorrow')).toBeTruthy();
  });

  it('step1Complete needs a price above zero and a date that is empty or not past', () => {
    expect(step1Complete(buy({ advertised: null }), TODAY)).toBe(false);
    expect(step1Complete(buy({ advertised: 0 }), TODAY)).toBe(false);
    expect(step1Complete(buy(), TODAY)).toBe(true);
    expect(step1Complete(buy({ needBy: TODAY }), TODAY)).toBe(true);
  });

  it('lists what it replaces, sums the counted lines and removes with a local undo', async () => {
    const { p, view } = await renderStep({ replaces: [line(), line({ id: 'rp-2', name: 'Bus', amount: 5_000, counted: false })] });
    expect(screen.getByText('−$120.00/mo')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove Parking'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ replaces: [expect.objectContaining({ id: 'rp-2' })] });
    const toast = (showToast as jest.Mock).mock.calls[0][0];
    expect(toast.text.key).toBe('decide.toast.lineRemoved');
    await view.rerender(<Step1Item {...p} inputs={{ ...p.inputs, replaces: [line({ id: 'rp-2', name: 'Bus', amount: 5_000, counted: false })] }} recurringBills={BILLS} />);
    toast.onUndo();
    expect(mockUpdate(p).mock.calls.at(-1)[0].replaces.map((l: InputLine) => l.id)).toEqual(['rp-1', 'rp-2']);
  });

  it('says "none yet" with nothing replaced, and adds a line from a recurring bill', async () => {
    const { p } = await renderStep();
    expect(screen.getByText('none yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('+ Add an expense it replaces'));
    await fireEvent.press(screen.getByLabelText('Parking, $120.00'));
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({
      replaces: [expect.objectContaining({ name: 'Parking', amount: 12_000, seriesId: 'ser-1', counted: true })],
    });
  });

  it('CR-C02: a bill already replaced is not offered again', async () => {
    await renderStep({ replaces: [line()] });
    await fireEvent.press(screen.getByText('+ Add an expense it replaces'));
    expect(screen.queryByLabelText('Parking, $120.00')).toBeNull();
  });

  it('hides the replaces card for an investment', async () => {
    await renderStep({ kind: 'invest' });
    expect(screen.queryByText('Expenses it replaces')).toBeNull();
    expect(screen.getAllByText('Start on').length).toBeGreaterThan(0);
  });

  it('readOnly makes the text fields inert', async () => {
    await renderStep({}, { readOnly: true });
    expect(screen.getByLabelText('What it is').props.editable).toBe(false);
  });

  it('WR-C06: on a decided check the controls are announced disabled and a screen-reader removal shows no toast', async () => {
    const { p } = await renderStep({ replaces: [line()] }, { readOnly: true });
    expect(screen.getByLabelText('A purchase').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    const remove = screen.getByLabelText('Remove Parking');
    expect(remove.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(remove);
    expect(showToast).not.toHaveBeenCalled();
    expect(mockUpdate(p)).not.toHaveBeenCalled();
  });
});
