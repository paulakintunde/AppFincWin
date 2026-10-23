import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step1Item } from '../Step1Item';
import { IncomeChangeCard } from '../step1/IncomeChangeCard';
import { MethodPanels } from '../step2/MethodPanels';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';
import { EMPTY_STACK } from '../../../snapshot/types';
import { TODAY, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { buy, exact, stepProps, whole, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/features/record/entry/pickers/DateField', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    DateField: (p: { label: string; minDate?: string; onChange: (d: string) => void }) => (
      <P accessibilityLabel={p.label} accessibilityHint={p.minDate} onPress={() => p.onChange('2099-01-01')}>
        <T>{`min ${p.minDate}`}</T>
      </P>
    ),
  };
});

const source = loggedSource();

function loanInputs(promo: CheckInputs['loan']['promo'] = null, variable = false): CheckInputs {
  const base = buy({ method: 'loan' });
  return { ...base, loan: { ...base.loan, termMonths: 24, aprText: '9.5', promo, variable } };
}

/** Holds the inputs so an edit recomputes the check, as the flow shell does. */
function Harness({ initial, readOnly = false, onUpdate }: { initial: CheckInputs; readOnly?: boolean; onUpdate?: (p: Partial<CheckInputs>) => void }) {
  const [inputs, setInputs] = useState(initial);
  const update = (patch: Partial<CheckInputs>) => {
    onUpdate?.(patch);
    setInputs((cur) => ({ ...cur, ...patch }));
  };
  return (
    <>
      <IncomeChangeCard inputs={inputs} update={update} today={TODAY} readOnly={readOnly} source={source} exact={exact} />
      <MethodPanels
        inputs={inputs}
        update={update}
        computation={computeCheck(source, inputs)}
        source={source}
        goToStep={jest.fn()}
        whole={whole}
        exact={exact}
        today={TODAY}
        readOnly={readOnly}
        stack={EMPTY_STACK}
        onSaveCardRate={jest.fn()}
        onSaveCardTerms={jest.fn()}
      />
    </>
  );
}

describe('IncomeChangeCard', () => {
  it('is off until turned on, then seeds a likely raise with no amount or date', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy()} onUpdate={onUpdate} />);
    expect(screen.queryByText('Raises')).toBeNull();
    await fireEvent.press(screen.getByLabelText('This changes my income'));
    expect(onUpdate).toHaveBeenLastCalledWith({ incomeChange: { direction: 'raises', amount: null, startDate: null, likelihood: 'likely' } });
    expect(screen.getByText('Not counted in the verdict. It is shown separately on the Impact step.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('This changes my income'));
    expect(onUpdate).toHaveBeenLastCalledWith({ incomeChange: null });
    expect(screen.queryByText('Raises')).toBeNull();
  });

  it('Lowers notes that it is counted; amount, likelihood and a date patch the change', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy()} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('This changes my income'));
    await fireEvent.press(screen.getByLabelText('Lowers'));
    expect(screen.getByText('Counted in the verdict.')).toBeTruthy();
    const amount = screen.getByLabelText('Amount a month');
    await fireEvent.changeText(amount, '200');
    await fireEvent(amount, 'blur');
    expect(onUpdate.mock.calls.at(-1)[0].incomeChange).toMatchObject({ direction: 'lowers', amount: 20_000 });
    await fireEvent.press(screen.getByLabelText('Uncertain'));
    expect(onUpdate.mock.calls.at(-1)[0].incomeChange.likelihood).toBe('uncertain');
  });

  it('offers no past start date: the picker minimum is today', async () => {
    await wrap(<Harness initial={{ ...buy(), incomeChange: { direction: 'raises', amount: null, startDate: null, likelihood: 'likely' } }} />);
    expect(screen.getByText(`min ${TODAY}`)).toBeTruthy();
  });

  it('is absent from an investment check', async () => {
    await wrap(<Step1Item {...stepProps(buy({ kind: 'invest', method: null }))} recurringBills={[]} />);
    expect(screen.queryByLabelText('This changes my income')).toBeNull();
  });

  it('shows on a purchase check inside step 1', async () => {
    await wrap(<Step1Item {...stepProps(buy())} recurringBills={[]} />);
    expect(screen.getByLabelText('This changes my income')).toBeTruthy();
  });

  it('is inert when read-only', async () => {
    const update = jest.fn();
    await wrap(<IncomeChangeCard inputs={buy()} update={update} today={TODAY} readOnly source={source} exact={exact} />);
    await fireEvent.press(screen.getByLabelText('This changes my income'));
    expect(update).not.toHaveBeenCalled();
  });
});

describe('credit terms', () => {
  it('a promotional row starts collapsed and empty', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanInputs()} onUpdate={onUpdate} />);
    expect(screen.queryByLabelText('For, custom, months')).toBeNull();
    await fireEvent.press(screen.getByLabelText('+ Promotional rate'));
    expect(screen.getByLabelText('Promotional rate').props.value).toBe('');
    expect(screen.getByLabelText('For, custom, months').props.value).toBe('');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText(/To clear it inside the promotion/)).toBeNull();
  });

  it('shows the summary and the engine results once rate and months are typed', async () => {
    await wrap(<Harness initial={loanInputs({ aprText: '2', months: 12, deferredInterest: false })} />);
    expect(screen.getByText('2% for 12 months, then 9.5%')).toBeTruthy();
    expect(screen.getByText(/Payment after the promotion: \$/)).toBeTruthy();
    expect(screen.getByText(/Interest after it ends: \$/)).toBeTruthy();
    expect(screen.getByText(/The month test uses the highest payment, \$/)).toBeTruthy();
  });

  it('the clear-in-promotion tile shows only with a promotion', async () => {
    await wrap(<Harness initial={loanInputs()} />);
    expect(screen.queryByText(/To clear it inside the promotion/)).toBeNull();
  });

  it('the clear-in-promotion tile is first when a promotion is entered', async () => {
    await wrap(<Harness initial={loanInputs({ aprText: '2', months: 12, deferredInterest: false })} />);
    const tiles = screen.getAllByText(/inside the promotion|Payment after|Interest after|highest payment|Left when|clears before/);
    expect(tiles[0]!.props.children).toMatch(/^To clear it inside the promotion: \$\d/);
  });

  it('left when it ends reads the balance at the promotion end', async () => {
    await wrap(<Harness initial={loanInputs({ aprText: '2', months: 6, deferredInterest: false })} />);
    const source_ = computeCheck(source, loanInputs({ aprText: '2', months: 6, deferredInterest: false }));
    const left = source_.promoBalanceAtEnd.loan;
    expect(left).toBeGreaterThan(0);
    expect(screen.getByText(`Left when it ends: $${Math.round(Number(left) / 100)}`)).toBeTruthy();
  });

  it('a promotion that clears says so', async () => {
    await wrap(<Harness initial={loanInputs({ aprText: '0', months: 60, deferredInterest: false })} />);
    expect(screen.getByText('The balance clears before it ends')).toBeTruthy();
  });

  it('the deferred-interest toggle shows only at a 0% promotion', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={loanInputs({ aprText: '3', months: 6, deferredInterest: false })} onUpdate={onUpdate} />);
    expect(screen.queryByLabelText('Interest is charged back if it isn’t cleared')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Promotional rate'), '0');
    const toggle = screen.getByLabelText('Interest is charged back if it isn’t cleared');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('Only on a 0% promotion. Off unless you turn it on.')).toBeTruthy();
    await fireEvent.press(toggle);
    expect(onUpdate.mock.calls.at(-1)[0].loan.promo.deferredInterest).toBe(true);
    expect(screen.getByText(/Charged back if it isn’t cleared by the end: \$/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Promotional rate'), '1');
    expect(screen.queryByLabelText('Interest is charged back if it isn’t cleared')).toBeNull();
    expect(onUpdate.mock.calls.at(-1)[0].loan.promo.deferredInterest).toBe(false);
    expect(screen.queryByText(/Charged back if it isn’t cleared by the end/)).toBeNull();
  });

  it('the rate-can-change toggle shows the +2 and +4 lines with states and the verdict note', async () => {
    await wrap(<Harness initial={loanInputs()} />);
    expect(screen.queryByText(/At \+2 points/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('The rate can change'));
    expect(screen.getByText(/At \+2 points: \$\d/)).toBeTruthy();
    expect(screen.getByText(/At \+4 points: \$\d/)).toBeTruthy();
    expect(screen.getByText('The verdict stays on the rate you entered.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('The rate can change'));
    expect(screen.queryByText(/At \+2 points/)).toBeNull();
  });

  it('the instalment late fee shows its two lines once typed', async () => {
    const base = buy({ method: 'instalment' });
    const initial = { ...base, instalment: { amount: 30_000, count: 6, lateFee: null } };
    await wrap(<Harness initial={initial} />);
    expect(screen.queryByText(/If 1 payment is late/)).toBeNull();
    const field = screen.getByLabelText('Late fee (optional)');
    await fireEvent.changeText(field, '15');
    await fireEvent(field, 'blur');
    expect(screen.getByText('If 1 payment is late: +$15.00')).toBeTruthy();
    expect(screen.getByText('If 2 are late: +$30.00')).toBeTruthy();
  });

  it('renders no figures while the check is incomplete', async () => {
    const base = loanInputs({ aprText: '2', months: 12, deferredInterest: false });
    await wrap(<Harness initial={{ ...base, advertised: null }} />);
    expect(screen.queryByText(/inside the promotion/)).toBeNull();
    expect(screen.queryByText(/highest payment/)).toBeNull();
  });

  it('the card panel carries the promotion row with the rate read-only', async () => {
    const base = buy({ method: 'card' });
    const card = source.cards[0];
    await wrap(<Harness initial={{ ...base, card: { ...base.card, accountId: card?.accountId ?? null, promo: { aprText: '0', months: 6, deferredInterest: false } } }} />);
    expect(screen.getByText('Change it above')).toBeTruthy();
  });

  it('the quick check has none of these inputs', () => {
    // the quick form is its own file and never imports the credit terms
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const text = require('fs').readFileSync(require('path').join(__dirname, '../../../quick/QuickCheckForm.tsx'), 'utf8') as string;
    expect(text).not.toMatch(/CreditTermsPanel|PromoRow|VariableRateCard|LateFeeField|IncomeChangeCard/);
  });
});
