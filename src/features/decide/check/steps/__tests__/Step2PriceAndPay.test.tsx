import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { showToast } from '@/state/undoToast';
import { Step2PriceAndPay, step2Complete, type Step2Props } from '../Step2PriceAndPay';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs, InputLine } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

type Over = Partial<CheckInputs>;
const mockUpdate = (p: { update: unknown }) => p.update as jest.Mock;

function propsFor(over: Over = {}, extra: Partial<Step2Props> = {}): Step2Props {
  return { ...stepProps(buy(over)), onSaveCardRate: jest.fn(), ...extra };
}
async function renderStep(over: Over = {}, extra: Partial<Step2Props> = {}) {
  const p = propsFor(over, extra);
  const view = await wrap(<Step2PriceAndPay {...p} />);
  return { p, view };
}
const card = (name: string) => screen.getByLabelText(name);

describe('Step2PriceAndPay: price card', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the advertised price, an Edit link to step 1 and the final price from the counted lines', async () => {
    const adjustments = [
      { id: 'a1', name: '', amount: 0, note: '', counted: true, effect: 'adds' as const, onDay: true, taxPercentText: '10' },
      { id: 'a2', name: '', amount: 2_000, note: 'fees', counted: true, effect: 'adds' as const, onDay: true, taxPercentText: null },
      { id: 'a3', name: 'Trade-in', amount: 10_000, note: '', counted: false, effect: 'takes_off' as const, onDay: false, taxPercentText: null },
    ];
    const { p } = await renderStep({ adjustments });
    expect(screen.getByText('Advertised')).toBeTruthy();
    expect(screen.getByLabelText('Sales tax, On the day, +$150.00')).toBeTruthy();
    expect(screen.getByLabelText('Fees, On the day, +$20.00')).toBeTruthy();
    expect(screen.getByLabelText('Trade-in, −$100.00')).toBeTruthy();
    expect(screen.getByText('2 of 3 lines counted')).toBeTruthy();
    expect(screen.getAllByText('$1670').length).toBeGreaterThan(0); // 1500 + 150 + 20
    await fireEvent.press(screen.getByLabelText('Edit'));
    expect(p.goToStep).toHaveBeenCalledWith(1);
  });

  it('adds, toggles and removes a line (removal has a local undo)', async () => {
    const adj = { id: 'a1', name: 'Delivery', amount: 3_000, note: '', counted: true, effect: 'adds' as const, onDay: false, taxPercentText: null };
    const { p, view } = await renderStep({ adjustments: [adj] });
    await fireEvent.press(screen.getByLabelText('Delivery, +$30.00'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ adjustments: [{ ...adj, counted: false }] });
    await fireEvent.press(screen.getByLabelText('Remove Delivery'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ adjustments: [] });
    const toast = (showToast as jest.Mock).mock.calls[0][0];
    await view.rerender(<Step2PriceAndPay {...p} inputs={{ ...p.inputs, adjustments: [] }} />);
    toast.onUndo();
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ adjustments: [adj] });
  });

  it('adds a cost from the line editor', async () => {
    const { p } = await renderStep();
    await fireEvent.press(screen.getByText('+ Add a cost, fee or trade-in'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Delivery');
    const amount = screen.getByLabelText('Amount');
    await fireEvent.changeText(amount, '30');
    await fireEvent(amount, 'blur');
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({
      adjustments: [expect.objectContaining({ name: 'Delivery', amount: 3_000, effect: 'adds', counted: true })],
    });
  });

  it('step2Complete needs a price and a method', () => {
    expect(step2Complete(buy())).toBe(true);
    expect(step2Complete(buy({ method: null }))).toBe(false);
    expect(step2Complete(buy({ advertised: null }))).toBe(false);
    expect(step2Complete(buy({ advertised: 0 }))).toBe(false);
  });
});

describe('Step2PriceAndPay: how you pay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the four methods side by side, each resolved on its own', async () => {
    await renderStep();
    for (const name of ['Paid in full', 'Deposit and loan', 'Instalment plan', 'Put it on a card']) expect(card(name)).toBeTruthy();
    const cash = within(card('Paid in full'));
    expect(cash.getByLabelText('On the day, $1500')).toBeTruthy();
    expect(cash.getByLabelText('A month, $0.00')).toBeTruthy();
    expect(cash.getByLabelText('Total paid, $1500')).toBeTruthy();
    expect(cash.getByText(/Leaves \$.* in cash/)).toBeTruthy();
    expect(card('Paid in full').props.accessibilityState.checked).toBe(true);
  });

  it('selecting a method calls update({ method })', async () => {
    const { p } = await renderStep();
    await fireEvent.press(card('Put it on a card'));
    expect(mockUpdate(p)).toHaveBeenCalledWith({ method: 'card' });
  });

  it('a loan with no rate typed says so and shows no percentage', async () => {
    await renderStep({ method: 'loan' });
    const loan = within(card('Deposit and loan'));
    expect(loan.getByText('Rate needed')).toBeTruthy();
    expect(loan.getByText('Type the rate you were quoted to score this.')).toBeTruthy();
    expect(screen.queryAllByText(/\d%/)).toHaveLength(0);
  });

  it('a loan with a typed rate shows the term typed, the rate and the interest', async () => {
    const base = buy({ method: 'loan' });
    await renderStep({ method: 'loan', loan: { ...base.loan, aprText: '8', termMonths: 24, deposit: 30_000 } });
    expect(within(card('Deposit and loan')).getByText(/\$300 down, 24 months at 8%\. Interest over the term is \$/)).toBeTruthy();
  });

  it('a loan at 0% reads "before any interest"', async () => {
    const base = buy({ method: 'loan' });
    await renderStep({ method: 'loan', loan: { ...base.loan, aprText: '0', termMonths: 12, aprFromQuick: true } });
    expect(within(card('Deposit and loan')).getByText('$0 down, 12 months, before any interest.')).toBeTruthy();
  });

  it('instalments that add up to less than the price carry the Below the price flag', async () => {
    await renderStep({ method: 'instalment', instalment: { amount: 1_000, count: 2, lateFee: null } });
    expect(within(card('Instalment plan')).getByText('Below the price')).toBeTruthy();
  });

  it('instalments that cover the price state the amount on top, as typed', async () => {
    await renderStep({ method: 'instalment', instalment: { amount: 13_000, count: 12, lateFee: null } });
    expect(within(card('Instalment plan')).getByText(/12 × \$130\.00 as quoted\. That implies \$60 on top of the price\./)).toBeTruthy();
  });

  it('a card is flagged Not accepted for an item type a card cannot settle', async () => {
    await renderStep({ method: 'card', itemType: 'tax', itemTypeTouched: true });
    expect(within(card('Put it on a card')).getByText('Not accepted')).toBeTruthy();
  });

  it('a capped vehicle shows Part on the card', async () => {
    const base = buy({ method: 'card' });
    await renderStep({
      method: 'card', itemType: 'vehicle', itemTypeTouched: true, advertised: 6_000_000,
      card: { ...base.card, accountId: 'acc-card', payoff: 'full' },
    });
    expect(within(card('Put it on a card')).getByText('Part on the card')).toBeTruthy();
  });

  it('a card paid in full next statement needs no rate; another payoff with no rate asks for the card rate', async () => {
    const base = buy({ method: 'card' });
    const view = await renderStep({ method: 'card', card: { ...base.card, accountId: 'acc-card', payoff: 'full' } });
    expect(within(card('Put it on a card')).getByText('Paid in full next statement, so no rate is needed.')).toBeTruthy();
    await view.view.unmount();
    const source = { ...propsFor().source, cards: [] };
    const p = { ...propsFor({ method: 'card' }), source };
    await wrap(<Step2PriceAndPay {...p} />);
    expect(within(card('Put it on a card')).getByText('Type the rate on your card to score months or minimum plans.')).toBeTruthy();
  });

  it('a null total reads as words', async () => {
    const p = propsFor({ method: 'card' });
    const real = p.computation.methodPlans.cash;
    if (real?.status !== 'resolved') throw new Error('cash plan');
    const open = (outcome: 'never_clears' | 'exceeds_month_cap') =>
      ({
        status: 'resolved',
        plan: {
          ...real.plan,
          total: null,
          interest: null,
          card: { eligibility: 'permitted', onCard: 150_000, remainderOnDay: 0, payoff: 'minimum', payoffMonths: null, minimumOutcome: outcome, remainingAtCap: null, fees: 0, cardCosts: null },
        },
      }) as never;
    const view = await wrap(<Step2PriceAndPay {...p} computation={{ ...p.computation, methodPlans: { ...p.computation.methodPlans, card: open('never_clears') } }} />);
    expect(within(card('Put it on a card')).getByLabelText('Total paid, Endless')).toBeTruthy();
    await view.rerender(<Step2PriceAndPay {...p} computation={{ ...p.computation, methodPlans: { ...p.computation.methodPlans, card: open('exceeds_month_cap') } }} />);
    expect(within(card('Put it on a card')).getByLabelText('Total paid, Not within 50 years')).toBeTruthy();
  });

  it('an investment offers a monthly contribution or a lump sum', async () => {
    await renderStep({ kind: 'invest', method: 'lump' });
    expect(card('Monthly contribution')).toBeTruthy();
    expect(card('Lump sum').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByLabelText('Put it on a card')).toBeNull();
    expect(screen.getByText('How you put it in')).toBeTruthy();
  });

  it('states the not-a-lender footer exactly once', async () => {
    await renderStep();
    expect(screen.getAllByText('FincWin records and plans. It does not lend money, arrange credit or hold your funds.')).toHaveLength(1);
  });

  it('a decided (read only) check cannot change the method', async () => {
    const { p } = await renderStep({}, { readOnly: true });
    await fireEvent.press(card('Put it on a card'));
    expect(mockUpdate(p)).not.toHaveBeenCalledWith({ method: 'card' });
  });
});

describe('Step2PriceAndPay: costs that follow it', () => {
  beforeEach(() => jest.clearAllMocks());

  const rc = (over: Partial<InputLine> = {}): InputLine => ({ id: 'rc-1', name: 'Insurance', amount: 4_000, note: '', counted: true, seriesId: null, category: null, ...over });
  const rp = (over: Partial<InputLine> = {}): InputLine => ({ id: 'rp-1', name: 'Bus pass', amount: 1_500, note: '', counted: true, seriesId: null, category: null, ...over });

  it('lists running costs, the lines the item step ends, and the net monthly change', async () => {
    await renderStep({ runningCosts: [rc()], replaces: [rp()] });
    expect(screen.getByLabelText('Insurance, $40.00')).toBeTruthy();
    const ends = screen.getByLabelText('Bus pass ends, Confirmed on the item step, −$15.00');
    expect(ends.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('$25.00')).toBeTruthy();
    expect(screen.getByText('$40.00 added, $15.00 ends')).toBeTruthy();
  });

  it('adds a running cost', async () => {
    const { p } = await renderStep();
    await fireEvent.press(screen.getByText('+ Add a running cost'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Fuel');
    const amount = screen.getByLabelText('Amount');
    await fireEvent.changeText(amount, '60');
    await fireEvent(amount, 'blur');
    await fireEvent.press(screen.getByLabelText('Save line'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ runningCosts: [expect.objectContaining({ name: 'Fuel', amount: 6_000, counted: true })] });
  });

  it('removes a running cost with a local undo', async () => {
    const { p } = await renderStep({ runningCosts: [rc()] });
    await fireEvent.press(screen.getByLabelText('Remove Insurance'));
    expect(mockUpdate(p)).toHaveBeenLastCalledWith({ runningCosts: [] });
    expect((showToast as jest.Mock).mock.calls[0][0].text.key).toBe('decide.toast.lineRemoved');
  });

  it('an investment calls them costs of holding it, with Add a fee', async () => {
    await renderStep({ kind: 'invest', method: 'lump' });
    expect(screen.getByText('Costs of holding it')).toBeTruthy();
    expect(screen.getByText('+ Add a fee')).toBeTruthy();
  });
});
