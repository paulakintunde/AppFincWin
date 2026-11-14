// 06.1-16: the cost sheets (D44 four variants, D45) and the WaterfallCard. The sheets write the engine's shapes
// (RunningCostLine, StoppedCost, Sale); the stepper owns the toast and the check.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { minorUnits } from '@/engine/money';
import { AddYourOwnSheet, type OwnAdd } from '../AddYourOwnSheet';
import { SaleSheet } from '../SaleSheet';
import { WaterfallCard } from '../../ui/WaterfallCard';

jest.setTimeout(30000);

jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null),
    SheetScroll: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const TODAY = '2026-10-15';
const BILLS = [{ id: 'series-bus', name: 'Bus pass' }];
const DEBTS = [{ id: 'debt-1', name: 'Car loan', balance: 800_000 }];

function addSheet(variant: 'running' | 'stop' | 'oneOff' | 'kind', onAdd: (a: OwnAdd) => void, extra: Record<string, unknown> = {}) {
  return wrap(
    <AddYourOwnSheet visible variant={variant} currency="USD" today={TODAY} bills={BILLS} categories={[]} existingKindCount={0} newId={() => 'id1'} onAdd={onAdd} onClose={jest.fn()} {...extra} />,
  );
}

describe('AddYourOwnSheet', () => {
  it('stop variant writes a bill source with the chosen seriesId', async () => {
    const onAdd = jest.fn();
    await addSheet('stop', onAdd);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Old pass');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '90');
    await fireEvent.press(screen.getByText('Bus pass'));
    await fireEvent.press(screen.getByText('Add this cost that stops'));
    const add = onAdd.mock.calls[0][0] as OwnAdd;
    expect(add.variant).toBe('stop');
    if (add.variant !== 'stop') throw new Error('variant');
    expect(add.stop.source).toEqual({ kind: 'bill', seriesId: 'series-bus' });
    expect(add.stop.amount).toBe(9000);
    expect(add.stop.everyMonths).toBe(1);
  });

  it('the primary stays dimmed until there is a name and an amount', async () => {
    const onAdd = jest.fn();
    await addSheet('running', onAdd);
    await fireEvent.press(screen.getByText('Add this cost'));
    expect(onAdd).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Parking permit');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '30');
    await fireEvent.press(screen.getByText('Add this cost'));
    const add = onAdd.mock.calls[0][0] as OwnAdd;
    if (add.variant !== 'running') throw new Error('variant');
    expect(add.line).toEqual({ id: 'id1', amount: 3000, everyMonths: 1, start: TODAY, end: null, on: true });
  });

  it('06.1-53 C-17: the disabled primary says a name and an amount above zero are needed', async () => {
    await addSheet('running', jest.fn());
    const need = 'A name and an amount above zero are needed.';
    expect(screen.getByText(need)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Parking permit');
    expect(screen.getByText(need)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '30');
    expect(screen.queryByText(need)).toBeNull();
  });

  it('06.1-53 C-17: an own kind needs only a name, and says so', async () => {
    await addSheet('kind', jest.fn());
    expect(screen.getByText('A name is needed.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Bike');
    expect(screen.queryByText('A name is needed.')).toBeNull();
  });

  it('one-off keeps a named line under a stable key', async () => {
    const onAdd = jest.fn();
    await addSheet('oneOff', onAdd);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Delivery');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '25');
    await fireEvent.press(screen.getByText('Add this cost'));
    expect(onAdd).toHaveBeenCalledWith({ variant: 'oneOff', id: 'id1', key: 'oneOff:id1', name: 'Delivery', amount: 2500 });
  });

  it('the kind list has no Home', async () => {
    await addSheet('kind', jest.fn());
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.getByText('Everyday')).toBeTruthy();
    expect(screen.getByText('Tech')).toBeTruthy();
    expect(screen.getByText('Car')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
  });

  it('kind adds a name and a counts-like', async () => {
    const onAdd = jest.fn();
    await addSheet('kind', onAdd);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Boat');
    await fireEvent.press(screen.getByText('Other'));
    await fireEvent.press(screen.getByText('Add this kind'));
    expect(onAdd).toHaveBeenCalledWith({ variant: 'kind', kind: { id: 'id1', name: 'Boat', countsLike: 'other' } });
  });

  it('refuses a fourth own kind', async () => {
    const onAdd = jest.fn();
    await addSheet('kind', onAdd, { existingKindCount: 3 });
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Boat');
    await fireEvent.press(screen.getByText('Add this kind'));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Up to 3 of your own items for each kind.')).toBeTruthy();
  });
});

describe('SaleSheet', () => {
  const base = { visible: true, currency: 'USD', today: TODAY, debts: DEBTS, onClose: jest.fn() };

  it('switch off writes a null sale', async () => {
    const onSave = jest.fn();
    await wrap(<SaleSheet {...base} sale={{ amount: minorUnits(100_000), arrives: TODAY, paysDebtId: null }} onSave={onSave} />);
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.press(screen.getByText('Save the sale'));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('writes amount, arrival and paysDebtId', async () => {
    const onSave = jest.fn();
    await wrap(<SaleSheet {...base} sale={null} onSave={onSave} />);
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.changeText(screen.getByLabelText('Sale price'), '10000');
    await fireEvent.press(screen.getByText('Car loan'));
    await fireEvent.press(screen.getByText('About a month later'));
    await fireEvent.press(screen.getByText('Save the sale'));
    expect(onSave).toHaveBeenCalledWith({ amount: 1_000_000, arrives: '2026-11-15', paysDebtId: 'debt-1' });
  });

  it('06.1-53 C-17: a sale with no amount keeps Save off and says an amount above zero is needed', async () => {
    const onSave = jest.fn();
    await wrap(<SaleSheet {...base} sale={null} onSave={onSave} />);
    expect(screen.queryByText('An amount above zero is needed.')).toBeNull();
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByText('An amount above zero is needed.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Sale price'), '100');
    expect(screen.queryByText('An amount above zero is needed.')).toBeNull();
  });

  it('a debt larger than the sale leaves nothing toward the purchase', async () => {
    await wrap(<SaleSheet {...base} sale={{ amount: minorUnits(500_000), arrives: TODAY, paysDebtId: 'debt-1' }} onSave={jest.fn()} />);
    expect(screen.getByText('Pays down Car loan')).toBeTruthy();
    expect(screen.getByLabelText(/Toward this purchase: .*0/)).toBeTruthy();
  });
});

describe('WaterfallCard', () => {
  it('reads every line and the total to a screen reader', async () => {
    await wrap(
      <WaterfallCard
        currency="USD"
        lines={[
          { label: 'Sale price', amount: 500_000, sign: '+' },
          { label: 'Pays down Car loan', amount: 500_000, sign: '-' },
        ]}
        total={{ label: 'Toward this purchase', amount: 0 }}
      />,
    );
    const card = screen.getByTestId('waterfall-card');
    expect(card.props.accessibilityRole).toBe('summary');
    const label = card.props.accessibilityLabel as string;
    expect(label.indexOf('Sale price')).toBeLessThan(label.indexOf('Pays down Car loan'));
    expect(label).toContain('Toward this purchase');
  });
});
