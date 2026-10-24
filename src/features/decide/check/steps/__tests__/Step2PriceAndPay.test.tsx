import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { showToast } from '@/state/undoToast';
import { Step2PriceAndPay, step2Complete, type Step2Props } from '../Step2PriceAndPay';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs, InputLine } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

type Over = Partial<CheckInputs>;
const mockUpdate = (p: { update: unknown }) => p.update as jest.Mock;

function propsFor(over: Over = {}, extra: Partial<Step2Props> = {}): Step2Props {
  return { ...stepProps(buy(over)), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn(), ...extra };
}
async function renderStep(over: Over = {}, extra: Partial<Step2Props> = {}) {
  const p = propsFor(over, extra);
  const view = await wrap(<Step2PriceAndPay {...p} />);
  return { p, view };
}
/** A method card's radio header, found by its name (the label is "{name}, Selected|Not selected, ...") . */
const card = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name},`) });
/** The whole method card: header and, while open, its inputs and outputs. */
const box = (method: string) => screen.getByTestId(`method-${method}`);

describe('Step2PriceAndPay: price card', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the advertised price, an Edit link to step 1 and the final price from the counted lines', async () => {
    const adjustments = [
      { id: 'a1', name: '', amount: 0, note: '', counted: true, effect: 'adds' as const, onDay: true, taxPercentText: '10' },
      { id: 'a2', name: '', amount: 2_000, note: 'fees', counted: true, effect: 'adds' as const, onDay: true, taxPercentText: null },
      { id: 'a3', name: 'Trade-in', amount: 10_000, note: '', counted: false, effect: 'takes_off' as const, onDay: false, taxPercentText: null },
    ];
    const { p } = await renderStep({ adjustments });
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByLabelText('Sales tax, On the day, +$150.00')).toBeTruthy();
    expect(screen.getByLabelText('Fees, On the day, +$20.00')).toBeTruthy();
    expect(screen.getByLabelText('Trade-in, −$100.00')).toBeTruthy();
    expect(screen.getByText('2 of 3 lines counted')).toBeTruthy();
    expect(screen.getAllByText('$1670').length).toBeGreaterThan(0); // 1500 + 150 + 20
    await fireEvent.press(screen.getByLabelText('Edit'));
    expect(p.goToStep).toHaveBeenCalledWith(1);
  });

  it('hides the lines-counted caption when there are no lines', async () => {
    await renderStep({ adjustments: [] });
    expect(screen.queryByText(/lines counted/)).toBeNull();
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
    for (const name of ['Paid in full', 'Deposit and loan', 'Instalment plan', 'On a card']) expect(card(name)).toBeTruthy();
    const cash = within(box('cash'));
    expect(cash.getByLabelText('On the day, $1500')).toBeTruthy();
    expect(cash.getByLabelText('A month, $0.00')).toBeTruthy();
    expect(cash.getByLabelText('Total paid, $1500')).toBeTruthy();
    expect(cash.getByText(/Leaves \$.* in cash/)).toBeTruthy();
    expect(card('Paid in full').props.accessibilityState.checked).toBe(true);
  });

  it('selecting a method calls update({ method })', async () => {
    const { p } = await renderStep();
    await fireEvent.press(card('On a card'));
    expect(mockUpdate(p)).toHaveBeenCalledWith({ method: 'card' });
  });

  it('D-79 a loan with no rate typed says what it needs and shows no percentage', async () => {
    await renderStep({ method: 'loan' });
    const loan = within(box('loan'));
    expect(loan.getByText('Needs: rate')).toBeTruthy();
    expect(loan.queryByText('Rate needed')).toBeNull();
    expect(screen.queryAllByText(/\d%/)).toHaveLength(0);
  });

  it('a loan with a typed rate folds to its summary: the deposit, the term and the rate', async () => {
    const base = buy({ method: 'cash' });
    await renderStep({ method: 'cash', loan: { ...base.loan, aprText: '8', termMonths: 24, deposit: 30_000 } });
    expect(within(box('loan')).getByText(/^\$300 down · 24.months · 8%$/)).toBeTruthy();
  });

  it('a loan at 0% folds to a summary that says 0%', async () => {
    const base = buy({ method: 'cash' });
    await renderStep({ method: 'cash', loan: { ...base.loan, aprText: '0', termMonths: 12, aprFromQuick: true } });
    expect(within(box('loan')).getByText(/^\$0 down · 12.months · 0%$/)).toBeTruthy();
  });

  it('instalments that add up to less than the price carry the Below the price flag', async () => {
    await renderStep({ method: 'instalment', instalment: { amount: 1_000, count: 2, lateFee: null } });
    expect(within(box('instalment')).getByText('Below the price')).toBeTruthy();
  });

  it('instalments that cover the price fold to the count, the payment and no rate', async () => {
    await renderStep({ method: 'cash', instalment: { amount: 13_000, count: 12, lateFee: null } });
    expect(within(box('instalment')).getByText('12 × $130.00 a month · no rate')).toBeTruthy();
  });

  it('a card is flagged Not accepted for an item type a card cannot settle', async () => {
    await renderStep({ method: 'card', itemType: 'loan_repayment', itemTypeTouched: true }); // D-92: tax is blocked in GB only
    expect(within(box('card')).getByText('Not accepted')).toBeTruthy();
  });

  it('a capped vehicle shows Part on the card', async () => {
    const base = buy({ method: 'card' });
    await renderStep({
      method: 'card', itemType: 'vehicle', itemTypeTouched: true, advertised: 6_000_000,
      card: { ...base.card, accountId: 'acc-card', payoff: 'full' },
    });
    expect(within(box('card')).getByText('Part on the card')).toBeTruthy();
  });

  it('a card paid in full next statement folds to its summary and needs no rate', async () => {
    const base = buy({ method: 'cash' });
    await renderStep({ method: 'cash', card: { ...base.card, accountId: 'acc-card', payoff: 'full' } });
    expect(within(box('card')).getByText('Visa · in full next statement')).toBeTruthy();
    expect(within(box('card')).queryByText(/^Needs:/)).toBeNull();
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
    expect(within(box('card')).getByLabelText('Total paid, Endless')).toBeTruthy();
    await view.rerender(<Step2PriceAndPay {...p} computation={{ ...p.computation, methodPlans: { ...p.computation.methodPlans, card: open('exceeds_month_cap') } }} />);
    expect(within(box('card')).getByLabelText('Total paid, Not within 50 years')).toBeTruthy();
  });

  it('an investment offers a monthly contribution or a lump sum', async () => {
    await renderStep({ kind: 'invest', method: 'lump' });
    expect(card('Monthly contribution')).toBeTruthy();
    expect(card('Lump sum').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByLabelText('On a card')).toBeNull();
    expect(screen.getByText('How you put it in')).toBeTruthy();
  });

  it('states the not-a-lender footer exactly once', async () => {
    await renderStep();
    expect(screen.getAllByText('FincWin records and plans. It does not lend money, arrange credit or hold your funds.')).toHaveLength(1);
  });

  it('a decided (read only) check cannot change the method', async () => {
    const { p } = await renderStep({}, { readOnly: true });
    await fireEvent.press(card('On a card'));
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

// ── Task 3: method panels ──
function cardPlan(over: Record<string, unknown>, planOver: Record<string, unknown> = {}) {
  return {
    status: 'resolved',
    plan: {
      price: 150_000, dayOne: 0, monthly: 12_500, months: 12, financed: 150_000, total: 160_000, interest: 10_000, dayFees: 0,
      finalMonthly: 12_500, impliedAnnualRate: null, paymentSteps: [], promo: null, lateFees: null,
      card: { eligibility: 'permitted', onCard: 150_000, remainderOnDay: 0, payoff: 'minimum', payoffMonths: null, minimumOutcome: 'cleared', remainingAtCap: null, fees: 0, cardCosts: 10_000, ...over },
      ...planOver,
    },
  } as never;
}
async function renderCard(planned: ReturnType<typeof cardPlan>, over: Over = {}) {
  const base = buy({ method: 'card' });
  const p = propsFor({ method: 'card', card: { ...base.card, accountId: 'acc-card', payoff: 'minimum' }, ...over });
  const withPlan = { ...p, computation: { ...p.computation, methodPlans: { ...p.computation.methodPlans, card: planned } } };
  await wrap(<Step2PriceAndPay {...withPlan} />);
  return withPlan;
}

describe('MethodPanels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders only the selected method panel', async () => {
    const view = await renderStep({ method: 'cash' });
    expect(screen.queryByLabelText('Deposit')).toBeNull();
    expect(screen.queryByLabelText('Payment')).toBeNull();
    expect(screen.queryByText('Rate on this card')).toBeNull();
    await view.view.unmount();
    await renderStep({ method: 'loan' });
    expect(screen.getAllByLabelText('Deposit').length).toBeGreaterThan(0);
    expect(screen.queryByText('Rate on this card')).toBeNull();
  });

  describe('loan', () => {
    it('leaves the rate empty until typed and never invents one', async () => {
      await renderStep({ method: 'loan' });
      expect(screen.getByLabelText('Annual rate, percent').props.value).toBe('');
      expect(screen.getByText('The rate on the quote')).toBeTruthy();
    });

    it('typing a rate updates aprText and clears the quick-check marker', async () => {
      const base = buy({ method: 'loan' });
      const { p } = await renderStep({ method: 'loan', loan: { ...base.loan, aprText: '0', aprFromQuick: true } });
      await fireEvent.changeText(screen.getByLabelText('Annual rate, percent'), '7.5');
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ loan: expect.objectContaining({ aprText: '7.5', aprFromQuick: false }) });
    });

    it('a carried quick-check 0% reads "before any interest"', async () => {
      const base = buy({ method: 'loan' });
      await renderStep({ method: 'loan', loan: { ...base.loan, aprText: '0', aprFromQuick: true, termMonths: 12 } });
      expect(screen.getAllByText('before any interest').length).toBeGreaterThan(0);
    });

    it('the term chips set the term as typed', async () => {
      const { p } = await renderStep({ method: 'loan' });
      await fireEvent.press(screen.getByLabelText('36 months'));
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ loan: expect.objectContaining({ termMonths: 36 }) });
    });

    it('a payoff before the term is stated, the term stays as typed', async () => {
      const base = buy({ method: 'loan', advertised: 1_000 });
      await renderStep({ advertised: 1_000, method: 'loan', loan: { ...base.loan, aprText: '0', termMonths: 600 } });
      expect(screen.getByText(/^Paid off in month \d+, with a last payment of \$/)).toBeTruthy();
      expect(screen.getByLabelText('Custom, 600 months')).toBeTruthy();
      expect(screen.getByText(/^At 600\s+months the payment is/)).toBeTruthy();
    });

    it('states no early payoff when the term is used in full', async () => {
      const base = buy({ method: 'loan' });
      await renderStep({ method: 'loan', loan: { ...base.loan, aprText: '8', termMonths: 24 } });
      expect(screen.queryByText(/^Paid off in month/)).toBeNull();
    });

    it('shows Interest saved by the deposit against no deposit and the cash left after', async () => {
      const base = buy({ method: 'loan' });
      await renderStep({ method: 'loan', loan: { ...base.loan, aprText: '10', termMonths: 24, deposit: 50_000 } });
      expect(screen.getByText('Interest saved by the deposit')).toBeTruthy();
      expect(screen.getByText('Cash left after')).toBeTruthy();
    });

    it('secured stays where the user put it', async () => {
      const base = buy({ method: 'loan', itemType: 'vehicle', itemTypeTouched: true });
      const vehicle = { ...base, loan: { ...base.loan, secured: true } };
      const p = { ...stepProps(vehicle), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
      await wrap(<Step2PriceAndPay {...p} />);
      const toggle = screen.getByLabelText('Secured against what you’re buying');
      expect(toggle.props.accessibilityState.checked).toBe(true);
      await fireEvent.press(toggle);
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ loan: expect.objectContaining({ secured: false, securedTouched: true }) });
    });
  });

  describe('instalment', () => {
    const inst = (amount: number | null, count: number | null) => ({ amount, count, lateFee: null });

    it('writes the count', async () => {
      const { p } = await renderStep({ method: 'instalment' });
      await fireEvent.changeText(screen.getByLabelText('How many, custom, payments'), '12');
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ instalment: expect.objectContaining({ count: 12 }) });
    });

    it('asks for both numbers until the plan resolves', async () => {
      await renderStep({ method: 'instalment', instalment: inst(null, null) });
      expect(screen.getByText('The payment and how many are needed to score this.')).toBeTruthy();
    });

    it('states the implied rate only when the plan resolved', async () => {
      await renderStep({ method: 'instalment', instalment: inst(13_000, 12) });
      expect(screen.getByText(/^12\smonthly payments of \$130\.00\.$/)).toBeTruthy();
      expect(screen.getByText(/^No rate was quoted: about [\d.]+% a year, worked out from the figures you typed\.$/)).toBeTruthy();
    });

    it('the instalment note totals the instalments without the fees', async () => {
      const adjustments = [{ id: 'a2', name: '', amount: 2_000, note: 'fees', counted: true, effect: 'adds' as const, onDay: true, taxPercentText: null }];
      await renderStep({ method: 'instalment', adjustments, instalment: inst(13_000, 12) });
      // the rate is on what the instalments finance (the price less the on-the-day fees), not on the total with them
      expect(screen.getByText(/^12\smonthly payments of \$130\.00\.$/)).toBeTruthy();
      expect(screen.getByText(/^No rate was quoted: about [\d.]+% a year, worked out from the figures you typed\.$/)).toBeTruthy();
    });

    it('instalments below the price ask for the amount or count', async () => {
      await renderStep({ method: 'instalment', instalment: inst(1_000, 2) });
      expect(screen.getByText('2 × $10.00 is $20, less than the $1500 it has to cover. Change the payment or how many to score this.')).toBeTruthy();
      expect(screen.queryByText('The payment and how many are needed to score this.')).toBeNull();
    });
  });

  describe('card', () => {
    it('says a card is accepted for a general purchase', async () => {
      await renderStep({ method: 'card' });
      expect(screen.getByText('A card is accepted here')).toBeTruthy();
    });

    it('states the dealer cap for a vehicle', async () => {
      await renderStep({ method: 'card', itemType: 'vehicle', itemTypeTouched: true, advertised: 6_000_000 });
      expect(screen.getByText('Only part of this can go on a card')).toBeTruthy();
      expect(screen.getByText('A dealer card cap of $50000 applies. The other $10000 is counted as cash on the day.')).toBeTruthy();
    });

    it('blocks rent and offers deposit and loan instead', async () => {
      const { p } = await renderStep({ method: 'card', itemType: 'rent_bill', itemTypeTouched: true });
      expect(screen.getByText('This cannot go on a card')).toBeTruthy();
      expect(screen.queryByText('Rate on this card')).toBeNull();
      await fireEvent.press(screen.getByText('Use deposit and loan instead'));
      expect(mockUpdate(p)).toHaveBeenCalledWith({ method: 'loan' });
    });

    it('says when there is no card account yet', async () => {
      const p = { ...propsFor({ method: 'card' }) };
      await wrap(<Step2PriceAndPay {...p} source={{ ...p.source, cards: [] }} />);
      expect(screen.getByText('No card account yet')).toBeTruthy();
    });

    it('picks a card account and the payoff style', async () => {
      const { p } = await renderStep({ method: 'card' });
      await fireEvent.press(screen.getByText('Visa'));
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ card: expect.objectContaining({ accountId: 'acc-card' }) });
      await fireEvent.press(screen.getByText('Minimum only'));
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ card: expect.objectContaining({ payoff: 'minimum' }) });
    });

    it('the months stepper shows the months typed and stays within 1..120', async () => {
      const base = buy({ method: 'card' });
      const { p } = await renderStep({ method: 'card', card: { ...base.card, months: 12 } });
      expect(screen.getAllByText('12\u00A0mo').length).toBeGreaterThan(0);
      await fireEvent.press(screen.getByLabelText('More months'));
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ card: expect.objectContaining({ months: 13 }) });
      await fireEvent.press(screen.getByLabelText('Fewer months'));
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ card: expect.objectContaining({ months: 11 }) });
    });

    it('saves the typed card rate on blur only when it is a valid rate', async () => {
      const base = buy({ method: 'card' });
      const onSaveCardRate = jest.fn();
      await renderStep({ method: 'card', card: { ...base.card, accountId: 'acc-card' } }, { onSaveCardRate });
      const rate = screen.getByLabelText('Rate on this card, percent');
      expect(rate.props.value).toBe('19.99'); // the rate on the card record, never one the app supplies
      await fireEvent.changeText(rate, '1000');
      await fireEvent(rate, 'blur');
      expect(onSaveCardRate).not.toHaveBeenCalled();
      await fireEvent.changeText(rate, '25');
      await fireEvent(rate, 'blur');
      expect(onSaveCardRate).toHaveBeenCalledWith('acc-card', '25');
    });

    it('WR-C04: a typed card rate is saved once after typing stops, without a blur, and on Done', async () => {
      jest.useFakeTimers();
      try {
        const base = buy({ method: 'card' });
        const onSaveCardRate = jest.fn();
        await renderStep({ method: 'card', card: { ...base.card, accountId: 'acc-card' } }, { onSaveCardRate });
        const rate = screen.getByLabelText('Rate on this card, percent');
        await fireEvent.changeText(rate, '24');
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        expect(onSaveCardRate).toHaveBeenCalledTimes(1);
        expect(onSaveCardRate).toHaveBeenCalledWith('acc-card', '24');
        await fireEvent(rate, 'blur');
        expect(onSaveCardRate).toHaveBeenCalledTimes(1);
        await fireEvent.changeText(rate, '23');
        await fireEvent(rate, 'submitEditing');
        expect(onSaveCardRate).toHaveBeenLastCalledWith('acc-card', '23');
      } finally {
        jest.useRealTimers();
      }
    });

    it('WR-C04: a decided check never saves the card rate and the field is not editable', async () => {
      const base = buy({ method: 'card' });
      const onSaveCardRate = jest.fn();
      await renderStep({ method: 'card', card: { ...base.card, accountId: 'acc-card' } }, { onSaveCardRate, readOnly: true });
      const rate = screen.getByLabelText('Rate on this card, percent');
      expect(rate.props.editable).toBe(false);
      await fireEvent.changeText(rate, '25');
      await fireEvent(rate, 'blur');
      expect(onSaveCardRate).not.toHaveBeenCalled();
    });

    it('does not save a rate before a card account is picked', async () => {
      const onSaveCardRate = jest.fn();
      await renderStep({ method: 'card' }, { onSaveCardRate });
      const rate = screen.getByLabelText('Rate on this card, percent');
      await fireEvent.changeText(rate, '25');
      await fireEvent(rate, 'blur');
      expect(onSaveCardRate).not.toHaveBeenCalled();
    });

    it('shows Cleared as the months actually paid', async () => {
      await renderCard(cardPlan({ payoff: 'months', payoffMonths: 9, minimumOutcome: null, cardCosts: 5_000 }));
      expect(screen.getByLabelText('Cleared, 9 mo')).toBeTruthy();
    });

    it('the card costs tile reads the engine card costs', async () => {
      await renderCard(cardPlan({ payoffMonths: 9, cardCosts: 12_340 }, { interest: 10_000 }));
      expect(screen.getByLabelText('Card costs, $123')).toBeTruthy();
      expect(screen.getByLabelText('Interest, $100')).toBeTruthy();
    });

    it('a card minimum that never clears reads Never and Endless', async () => {
      await renderCard(cardPlan({ minimumOutcome: 'never_clears', payoffMonths: null, cardCosts: null }, { total: null, interest: null }));
      expect(screen.getByLabelText('Cleared, Never')).toBeTruthy();
      expect(screen.getByLabelText('Interest, Endless')).toBeTruthy();
      expect(screen.getByLabelText('Card costs, Endless')).toBeTruthy();
    });

    it('R6 card word values wrap, never fitted', async () => {
      await renderCard(cardPlan({ minimumOutcome: 'never_clears', payoffMonths: null, cardCosts: null }, { total: null, interest: null }));
      // the card tiles' words wrap (the method card above carries its own copy of the word)
      const fitted = screen.getAllByText('Endless').filter((n) => n.props.adjustsFontSizeToFit === true);
      const wrapped = screen.getAllByText('Endless').filter((n) => n.props.numberOfLines === undefined && n.props.adjustsFontSizeToFit === undefined);
      expect(wrapped.length).toBeGreaterThanOrEqual(2); // Interest and Card costs
      expect(fitted.length).toBeLessThanOrEqual(1);
      await renderCard(cardPlan({ payoffMonths: 9, cardCosts: 12_340 }, { interest: 10_000 }));
      const figure = screen.getAllByText('$123')[0]!;
      expect(figure.props.numberOfLines).toBe(1);
    });

    it('a card open at 50 years shows what is still owed', async () => {
      await renderCard(cardPlan({ minimumOutcome: 'exceeds_month_cap', payoffMonths: null, cardCosts: null, remainingAtCap: 250_000 }, { total: null, interest: null }));
      expect(screen.getByLabelText('Cleared, Not within 50 years')).toBeTruthy();
      expect(screen.getByLabelText('Interest, Not within 50 years')).toBeTruthy();
      expect(screen.getByLabelText('Card costs, Not within 50 years')).toBeTruthy();
      expect(screen.getByText('Still owing $2500 after 50 years at the minimum.')).toBeTruthy();
    });

    it('keeps the three card notes with no verdict effect', async () => {
      const { p } = await renderStep({ method: 'card' });
      expect(screen.getByText('0 of 3 answered')).toBeTruthy();
      await fireEvent.press(screen.getAllByText('Yes')[0]!);
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ cardNotes: { incomeStops: 'yes', noNewSpending: null, jobLossCover: null } });
    });

    it('uses no lender wording', async () => {
      await renderStep({ method: 'card' });
      expect(screen.queryByText(/apply|approved|pre-qualif|offer/i)).toBeNull();
    });
  });

  describe('investment', () => {
    it('shows the money put in over the term, and no growth claim without a typed rate', async () => {
      const { p } = await renderStep({ kind: 'invest', method: 'monthly', advertised: 20_000, investTermMonths: 24 });
      expect(screen.getByText('$200.00 a month for 24 months is $4800 put in.')).toBeTruthy();
      expect(screen.queryByText(/would be worth/)).toBeNull();
      await fireEvent.press(screen.getByLabelText('60 months'));
      expect(mockUpdate(p)).toHaveBeenLastCalledWith({ investTermMonths: 60 });
    });

    it('with an expected return entered, states what it could grow to as a projection', async () => {
      await renderStep({ kind: 'invest', method: 'monthly', advertised: 20_000, investTermMonths: 12, investReturnText: '5' });
      expect(screen.getByText(/^About \$\d+ after 12 months at 5% a year\. A projection at the rate you entered, not a forecast\./)).toBeTruthy();
    });

    it('a lump sum has no panel', async () => {
      await renderStep({ kind: 'invest', method: 'lump' });
      expect(screen.queryByLabelText('60 months')).toBeNull();
    });
  });
});
