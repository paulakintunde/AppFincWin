import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { buy, stepProps, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

const source = loggedSource();
const NBSP = ' ';
const RANGE_MONTHS = '1 to 120 months';
const RANGE_COUNT = '1 to 120';
const RANGE_APR = '0 to 999.99% a year';
const TERM_FIELD = 'Term, custom, months';
const COUNT_FIELD = 'How many, custom, payments';
const RATE_LABEL = 'Annual rate, percent';
const CARD_RATE_LABEL = 'Rate on this card, percent';
const FOR_FIELD = 'For, custom, months';

type Update = (patch: Partial<CheckInputs>) => void;

/** Holds the inputs so an edit recomputes the check, as the flow shell does. */
function Harness({ initial, onUpdate, readOnly = false }: { initial: CheckInputs; onUpdate?: Update; readOnly?: boolean }) {
  const [inputs, setInputs] = useState(initial);
  const update: Update = (patch) => {
    onUpdate?.(patch);
    setInputs((cur) => ({ ...cur, ...patch }));
  };
  const props: Step2Props = {
    ...stepProps(inputs, { update, readOnly }, source),
    computation: computeCheck(source, inputs),
    onSaveCardRate: jest.fn(),
    onSaveCardTerms: jest.fn(),
  };
  return <Step2PriceAndPay {...props} />;
}

const loanBase = () => buy({ method: 'loan' });
const loanWith = (patch: Partial<CheckInputs['loan']>): CheckInputs => ({ ...loanBase(), loan: { ...loanBase().loan, aprText: '8', termMonths: 24, ...patch } });
const lastLoan = (fn: jest.Mock) => fn.mock.calls.filter((c) => c[0].loan !== undefined).at(-1)?.[0].loan;

describe('Step 2 custom values (05-67)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-71 the loan term takes Custom from 1 to 120', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanWith({ termMonths: 24 })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom'));
    const field = screen.getByLabelText(TERM_FIELD);
    await fireEvent.changeText(field, '100');
    expect(lastLoan(onUpdate).termMonths).toBe(100);
    await fireEvent.changeText(field, '120');
    expect(lastLoan(onUpdate).termMonths).toBe(120);
    onUpdate.mockClear();
    await fireEvent.changeText(field, '121');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(RANGE_MONTHS)).toBeTruthy();
  });

  it('D-71 a stored 600-month term opens under Custom and is scored as stored', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanWith({ termMonths: 600, aprText: '0' })} onUpdate={onUpdate} />);
    expect(screen.getByLabelText(`Custom, 600${NBSP}months`)).toBeTruthy();
    expect(screen.getByText(RANGE_MONTHS)).toBeTruthy();
    expect(screen.getByText(/^At 600\s+months the payment is/)).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('D-71 the instalment count refuses 121', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy({ method: 'instalment' })} onUpdate={onUpdate} />);
    const field = screen.getByLabelText(COUNT_FIELD);
    await fireEvent.changeText(field, '121');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(RANGE_COUNT)).toBeTruthy();
    await fireEvent.changeText(field, '120');
    expect(onUpdate.mock.calls.at(-1)?.[0].instalment.count).toBe(120);
  });

  it('D-71 the card months stepper stops at 120 and its figure opens the field', async () => {
    const onUpdate = jest.fn();
    const base = buy({ method: 'card' });
    await wrap(<Harness initial={{ ...base, card: { ...base.card, payoff: 'months', months: 120 } }} onUpdate={onUpdate} />);
    expect(screen.getByLabelText('More months').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(`Months, type a number, 120${NBSP}mo`));
    const field = screen.getByLabelText('Over a few months, custom, months');
    await fireEvent.changeText(field, '36');
    expect(onUpdate.mock.calls.at(-1)?.[0].card.months).toBe(36);
    onUpdate.mockClear();
    await fireEvent.changeText(field, '121');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('D-71 the invest term takes Custom from 1 to 120', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy({ kind: 'invest', method: 'monthly', advertised: 10_000, projectionRates: ['5'] })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom'));
    await fireEvent.changeText(screen.getByLabelText(TERM_FIELD), '90');
    expect(onUpdate.mock.calls.at(-1)?.[0].investTermMonths).toBe(90);
  });

  it('D-71 the deposit is one slider with a typed field', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanWith({})} onUpdate={onUpdate} />);
    const both = screen.getAllByLabelText('Deposit');
    expect(both).toHaveLength(2);
    const slider = both.find((n) => n.props.accessibilityRole === 'adjustable');
    const field = both.find((n) => n.props.accessibilityRole !== 'adjustable')!;
    expect(slider).toBeTruthy();
    // typed to the cent, used exactly
    await fireEvent.changeText(field, '100.50');
    expect(lastLoan(onUpdate).deposit).toBe(10_050);
    // above the price is refused with the range line
    onUpdate.mockClear();
    await fireEvent.changeText(field, '1600');
    expect(lastLoan(onUpdate)?.deposit).not.toBe(160_000);
    expect(screen.getByText('Up to the price, $1500')).toBeTruthy();
  });

  it('R4 the loan rate refuses 1000% and shows the range line', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanWith({})} onUpdate={onUpdate} />);
    await fireEvent.changeText(screen.getByLabelText(RATE_LABEL), '1000');
    expect(lastLoan(onUpdate)).toBeUndefined();
    expect(screen.getByText(RANGE_APR)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(RATE_LABEL), '999.99');
    expect(lastLoan(onUpdate).aprText).toBe('999.99');
  });

  it('R4 the card rate refuses 1000% and shows the range line', async () => {
    const base = buy({ method: 'card' });
    await wrap(<Harness initial={{ ...base, card: { ...base.card, accountId: 'acc-card' } }} />);
    await fireEvent.changeText(screen.getByLabelText(CARD_RATE_LABEL), '1000');
    expect(screen.getByLabelText(CARD_RATE_LABEL).props.value).toBe('19.99');
    expect(screen.getByText(RANGE_APR)).toBeTruthy();
  });

  it('D-71 the promotion length stays within 120 and the term', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanWith({ termMonths: 24 })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('+ Promotional rate'));
    const field = screen.getByLabelText(FOR_FIELD);
    // bounded by the 24-month term, so the range line says so
    expect(screen.getByText('From 1 to 24')).toBeTruthy();
    await fireEvent.changeText(field, '25');
    expect(lastLoan(onUpdate)).toBeUndefined();
    await fireEvent.changeText(field, '12');
    expect(lastLoan(onUpdate).promo.months).toBe(12);
  });

  it('D-71 the promotion length reads 1 to 120 months when the term is longer', async () => {
    await wrap(<Harness initial={loanWith({ termMonths: 120 })} />);
    await fireEvent.press(screen.getByLabelText('+ Promotional rate'));
    expect(screen.getByText(RANGE_MONTHS)).toBeTruthy();
  });

  it('D-70 step 2 credit terms carry their ⓘ', async () => {
    await wrap(<Harness initial={loanWith({ aprText: '0' })} />);
    expect(screen.getByLabelText('About Annual rate (APR)')).toBeTruthy();
    expect(screen.getByLabelText('About The rate can change')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('+ Promotional rate'));
    expect(screen.getByLabelText('About Promotional rate')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Promotional rate'), '0');
    expect(screen.getByLabelText('About Interest charged back')).toBeTruthy();
    // the quick check's own term does not appear on step 2
    expect(screen.queryByLabelText('About Before any interest')).toBeNull();
  });

  it('R4 the promotional and Then rates refuse 1000% and show the range line', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanWith({})} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('+ Promotional rate'));
    await fireEvent.changeText(screen.getByLabelText('Promotional rate'), '1000');
    expect(lastLoan(onUpdate)).toBeUndefined();
    expect(screen.getAllByText(RANGE_APR)).toHaveLength(1);
    await fireEvent.changeText(screen.getByLabelText('Then'), '1000');
    expect(lastLoan(onUpdate)).toBeUndefined();
    expect(screen.getAllByText(RANGE_APR)).toHaveLength(2);
  });
});
