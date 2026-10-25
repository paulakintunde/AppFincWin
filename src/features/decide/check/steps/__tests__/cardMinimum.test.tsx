import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { buy, stepProps, wrap } from './helpers/stepProps';
import { CARD_CHOICE, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CardTermsView, CheckInputs, SnapshotResult } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

const NONE: CardTermsView = { ...CARD_CHOICE.terms, source: 'none', percentText: null, interestAdded: null, floor: null, version: null };

function sourceWith(terms: CardTermsView | null): SnapshotResult {
  const base = loggedSource();
  return terms === null ? { ...base, cards: [] } : { ...base, cards: [{ ...CARD_CHOICE, terms }] };
}

function cardInputs(over: Partial<CheckInputs> = {}): CheckInputs {
  const base = buy({ method: 'card' });
  return buy({ method: 'card', card: { ...base.card, accountId: 'acc-card', payoff: 'minimum' }, ...over });
}

async function renderCard(terms: CardTermsView | null, extra: Partial<Step2Props> = {}, over: Partial<CheckInputs> = {}, readOnly = false) {
  const source = sourceWith(terms);
  const inputs = cardInputs(over);
  const p: Step2Props = { ...stepProps(inputs, { readOnly }, source), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn(), ...extra };
  await wrap(<Step2PriceAndPay {...p} />);
  return p;
}

describe('card minimum payment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('the card minimum row reads the terms', async () => {
    await renderCard(CARD_CHOICE.terms);
    expect(screen.getByLabelText('Minimum payment, 2% of the balance plus interest, at least $25')).toBeTruthy();
    expect(screen.queryByText(/Pre-filled/)).toBeNull();
  });

  it('shows the pre-fill note when the terms are the market ones', async () => {
    await renderCard({ ...CARD_CHOICE.terms, source: 'market', floorCurrency: 'USD' });
    expect(screen.getByText('Pre-filled from the standard card terms for your region. Your card’s own terms can differ.')).toBeTruthy();
  });

  it('a card with no terms reads minimum payment not set', async () => {
    await renderCard(NONE);
    expect(screen.getByLabelText('Minimum payment, Minimum payment not set')).toBeTruthy();
    expect(screen.queryByText(/Pre-filled/)).toBeNull();
  });

  it('shows no row without a card', async () => {
    await renderCard(null, {}, { card: { ...cardInputs().card, accountId: null } });
    expect(screen.queryByText('Minimum payment')).toBeNull();
  });

  it('saves valid terms once and closes', async () => {
    const p = await renderCard(CARD_CHOICE.terms);
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    expect(screen.getByText('Card minimum payment')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Percent of the balance, percent'), '3.5');
    await fireEvent.press(screen.getByLabelText('Plus that month’s interest'));
    const floor = screen.getByLabelText('At least');
    await fireEvent.changeText(floor, '30');
    await fireEvent(floor, 'blur');
    await fireEvent.press(screen.getByLabelText('Save terms'));
    expect(p.onSaveCardTerms).toHaveBeenCalledTimes(1);
    expect(p.onSaveCardTerms).toHaveBeenCalledWith('acc-card', { percentText: '3.5', interestAdded: false, floor: 3_000, paidInFull: false });
    expect(screen.queryByText('Card minimum payment')).toBeNull();
  });

  it('an invalid percent shows an error and does not save', async () => {
    const p = await renderCard(CARD_CHOICE.terms);
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    await fireEvent.changeText(screen.getByLabelText('Percent of the balance, percent'), '');
    await fireEvent.press(screen.getByLabelText('Save terms'));
    expect(p.onSaveCardTerms).not.toHaveBeenCalled();
    expect(screen.getByText('Card minimum payment')).toBeTruthy();
  });

  it('paid in full disables the term fields and saves no minimum', async () => {
    const p = await renderCard(CARD_CHOICE.terms);
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    await fireEvent.press(screen.getByLabelText('Paid in full monthly'));
    expect(screen.getByLabelText('Percent of the balance, percent').props.editable).toBe(false);
    expect(screen.getByLabelText('At least').props.editable).toBe(false);
    expect(screen.getByLabelText('Plus that month’s interest').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByLabelText('Save terms'));
    expect(p.onSaveCardTerms).toHaveBeenCalledWith('acc-card', expect.objectContaining({ paidInFull: true }));
  });

  it('Use the standard terms restores the pre-fill, only when stored and a market row exists', async () => {
    const p = await renderCard({ ...CARD_CHOICE.terms, marketAvailable: true });
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    await fireEvent.press(screen.getByLabelText('Use the standard terms'));
    expect(p.onSaveCardTerms).toHaveBeenCalledWith('acc-card', { percentText: null, interestAdded: null, floor: null, paidInFull: false });
  });

  it('hides Use the standard terms without a market row', async () => {
    await renderCard({ ...CARD_CHOICE.terms, marketAvailable: false });
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    expect(screen.queryByLabelText('Use the standard terms')).toBeNull();
  });

  it('a decided check shows the row but cannot open the sheet', async () => {
    await renderCard(CARD_CHOICE.terms, {}, {}, true);
    const row = screen.getByLabelText(/^Minimum payment, /);
    await fireEvent.press(row);
    expect(screen.queryByText('Card minimum payment')).toBeNull();
  });
});

describe('card fees', () => {
  beforeEach(() => jest.clearAllMocks());

  function planned(fees: number, cardCosts: number) {
    return {
      status: 'resolved',
      plan: {
        price: 150_000, dayOne: 0, monthly: 12_500, months: 12, financed: 150_000, total: 160_000, interest: 27_660, dayFees: 0,
        finalMonthly: 12_500, impliedAnnualRate: null, paymentSteps: [], promo: null, lateFees: null,
        card: { eligibility: 'permitted', onCard: 150_000, remainderOnDay: 0, payoff: 'minimum', payoffMonths: 12, minimumOutcome: 'cleared', remainingAtCap: null, fees, cardCosts },
      },
    } as never;
  }
  async function renderPlanned(plan: ReturnType<typeof planned>, over: Partial<CheckInputs> = {}) {
    const source = sourceWith(CARD_CHOICE.terms);
    const base = cardInputs(over);
    const p: Step2Props = { ...stepProps(base, {}, source), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
    const withPlan = { ...p, computation: { ...p.computation, methodPlans: { ...p.computation.methodPlans, card: plan } } };
    await wrap(<Step2PriceAndPay {...withPlan} />);
    return withPlan;
  }

  it('card fees are blank until typed and feed the card costs tile', async () => {
    const p = await renderPlanned(planned(0, 27_660));
    const field = screen.getByLabelText('Card fees for this purchase');
    expect(field.props.value).toBe('');
    expect(screen.queryByText(/in card fees/)).toBeNull();
    await fireEvent.changeText(field, '35');
    await fireEvent(field, 'blur');
    const call = (p.update as jest.Mock).mock.calls.at(-1)![0] as { card: { fees: number | null } };
    expect(call.card.fees).toBe(3_500);
    await fireEvent.changeText(field, '');
    await fireEvent(field, 'blur');
    expect(((p.update as jest.Mock).mock.calls.at(-1)![0] as { card: { fees: number | null } }).card.fees).toBeNull();
  });

  it('a typed fee shows the card costs sum and the breakdown line', async () => {
    const base = cardInputs();
    await renderPlanned(planned(3_500, 31_160), { card: { ...base.card, fees: 3_500 } });
    expect(screen.getByLabelText('Card costs, $312')).toBeTruthy();
    expect(screen.getByText('$277 interest plus $35 in card fees.')).toBeTruthy();
    expect(screen.getByLabelText('Card fees for this purchase').props.value).toBe('35.00');
  });
});
