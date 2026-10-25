import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Step1Item } from '../Step1Item';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { ChoiceCard } from '../../../ui/ChoiceCard';
import { CARD_CHOICE, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs, InputLine } from '../../../snapshot/types';
import { buy, stepProps, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));

const REPLACED: InputLine = { id: 'rp-1', name: 'Bus pass', amount: 12_000, note: '', counted: true, seriesId: null, category: null };

/** The nearest ancestor (host or composite) whose flattened style has the given key. */
function ancestorStyle(el: { parent: unknown }, key: string): Record<string, unknown> | null {
  let node = el as { parent: unknown; props?: { style?: unknown } } | null;
  while (node) {
    const style = StyleSheet.flatten(node.props?.style as never) as Record<string, unknown> | undefined;
    if (style && key in style) return style;
    node = node.parent as typeof node;
  }
  return null;
}

/** Presses the ⓘ named "About {term}", sees the sheet's own heading and Close, then closes it. */
async function opensSheetFor(term: string, index = 0) {
  const buttons = screen.getAllByRole('button', { name: `About ${term}` });
  await act(async () => {
    fireEvent.press(buttons[index]!);
  });
  const close = await screen.findByRole('button', { name: 'Close' });
  expect(screen.getAllByText(term).length).toBeGreaterThanOrEqual(1);
  await act(async () => {
    fireEvent.press(close);
  });
}

async function step1(scale = 1, over: Parameters<typeof buy>[0] = {}) {
  const p = stepProps(buy(over));
  await wrap(<Step1Item {...p} recurringBills={[]} />, scale);
  return p;
}

describe('D-70 placement: step 1', () => {
  it('D-70 step 1 carries replaces and incomeChange', async () => {
    await step1(1, { replaces: [REPLACED], incomeChange: { direction: 'raises', amount: null, startDate: null, likelihood: 'likely' } });
    await opensSheetFor('Expenses it replaces');
    await opensSheetFor('A change to your income');
  });

  it('D-76 step 1 flex chips stack full width at fontScale 2', async () => {
    await step1(2);
    expect(ancestorStyle(screen.getByLabelText('A purchase'), 'width')).toMatchObject({ width: '100%' });
    expect(ancestorStyle(screen.getByLabelText('In a month'), 'width')).toMatchObject({ width: '100%' });
  });

  it('keeps the chips side by side at 1.0x', async () => {
    await step1(1);
    expect(ancestorStyle(screen.getByLabelText('A purchase'), 'flex')).toMatchObject({ flex: 1 });
  });
});

async function step2(inputs: CheckInputs, scale = 1) {
  const source = { ...loggedSource(), cards: [CARD_CHOICE] };
  const p: Step2Props = { ...stepProps(inputs, {}, source), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
  await wrap(<Step2PriceAndPay {...p} />, scale);
  return p;
}

describe('D-70 placement: step 2', () => {
  it('D-70 step 2 price card carries replaces, runningCosts, netMonthly and lossOfValue', async () => {
    await step2(buy({ itemType: 'vehicle', replaces: [REPLACED] }));
    await opensSheetFor('Expenses it replaces');
    await opensSheetFor('Costs that follow it');
    await opensSheetFor('Net monthly change');
    await opensSheetFor('Loss of value');
  });

  it('D-70 the card terms sheet and the minimum payment row carry cardMinimum', async () => {
    const base = buy({ method: 'card' });
    await step2(buy({ method: 'card', card: { ...base.card, accountId: 'acc-card', payoff: 'minimum' } }));
    expect(screen.getAllByRole('button', { name: 'About Card minimum payment' })).toHaveLength(1);
    await opensSheetFor('Card minimum payment');
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    expect(await screen.findAllByRole('button', { name: 'About Card minimum payment' })).toHaveLength(2); // the row and the sheet title
    await opensSheetFor('Card minimum payment', 1);
  });

  it('D-84 Paid in full monthly carries its ⓘ', async () => {
    const base = buy({ method: 'card' });
    await step2(buy({ method: 'card', card: { ...base.card, accountId: 'acc-card', payoff: 'minimum' } }));
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    await opensSheetFor('Paid in full monthly');
  });

  it('R4 loss of value refuses 101% and shows the range line', async () => {
    const p = await step2(buy({ itemType: 'vehicle', lossOfValue: { kind: 'percent_per_year', percentText: '15' } }));
    const field = screen.getByLabelText('Loss of value, percent a year');
    await fireEvent.changeText(field, '101');
    expect(screen.getByText('0 to 100%')).toBeTruthy();
    expect((p.update as jest.Mock).mock.calls.some(([patch]) => JSON.stringify(patch).includes('101'))).toBe(false);
  });
});

describe('D-76 ChoiceCard', () => {
  it('D-76 a ChoiceCard flag chip wraps under its title at fontScale 2', async () => {
    await wrap(<ChoiceCard selected={false} onPress={jest.fn()} title="Pay over a long period of months" flag="Pay later" accessibilityLabel="Loan" />, 2);
    const head = ancestorStyle(screen.getByText('Pay later'), 'flexWrap');
    expect(head).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(screen.getByText('Pay over a long period of months').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Pay later').props.numberOfLines).toBeUndefined();
  });
});
