import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { MethodPanels } from '../step2/MethodPanels';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';
import { EMPTY_STACK } from '../../../snapshot/types';
import { TODAY, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { buy, exact, whole, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const source = loggedSource();
const store: { current: CheckInputs } = { current: buy() };

function instalment(inst: Partial<CheckInputs['instalment']> = {}): CheckInputs {
  const base = buy({ method: 'instalment' });
  return { ...base, instalment: { ...base.instalment, ...inst } };
}

/** Holds the inputs so an edit recomputes the check, as the flow shell does. */
function Harness({ initial }: { initial: CheckInputs }) {
  const [inputs, setInputs] = useState(initial);
  const update = (patch: Partial<CheckInputs>) => {
    store.current = { ...store.current, ...patch };
    setInputs(store.current);
  };
  return (
    <MethodPanels
      inputs={inputs}
      update={update}
      computation={computeCheck(source, inputs)}
      source={source}
      goToStep={jest.fn()}
      whole={whole}
      exact={exact}
      today={TODAY}
      readOnly={false}
      stack={EMPTY_STACK}
      onSaveCardRate={jest.fn()}
      onSaveCardTerms={jest.fn()}
    />
  );
}

async function mount(initial: CheckInputs) {
  store.current = initial;
  return wrap(<Harness initial={initial} />);
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('InstalmentPanel (D-80)', () => {
  it('D-80 Has a rate? defaults to No with today’s fields', async () => {
    await mount(instalment());
    expect(radio('No').props.accessibilityState.checked).toBe(true);
    expect(radio('Yes').props.accessibilityState.checked).toBe(false);
    expect(screen.getByLabelText('Payment')).toBeTruthy();
    expect(screen.getByLabelText('How many, custom, payments')).toBeTruthy();
    expect(screen.queryByLabelText('Annual rate, percent')).toBeNull();
    expect(screen.queryByLabelText('Payment as quoted (optional)')).toBeNull();
    expect(radio('Today').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('Late fee (optional)')).toBeTruthy();
  });

  it('D-80 Yes shows how many, the annual rate and the optional quote', async () => {
    await mount(instalment());
    await fireEvent.press(radio('Yes'));
    expect(store.current.instalment.hasRate).toBe(true);
    expect(screen.getByLabelText('How many, custom, payments')).toBeTruthy();
    const rate = screen.getByLabelText('Annual rate, percent');
    expect(rate.props.value).toBe(''); // never pre-filled
    expect(screen.getByLabelText('Payment as quoted (optional)')).toBeTruthy();
    expect(screen.queryByLabelText('Payment')).toBeNull();
    expect(screen.getByText('Add the payment and how many to score this.')).toBeTruthy();
  });

  it('D-80 a quote that differs shows the rate works out note and is scored', async () => {
    await mount(instalment({ hasRate: true, aprText: '12', count: 12 }));
    expect(screen.getByText(/^12 payments of \$\d+\.\d\d at 12%, the first on the day\. Interest over the plan is \$\d+\.$/)).toBeTruthy();
    expect(screen.queryByText(/The rate works out to/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Payment as quoted (optional)'), '140');
    expect(store.current.instalment.amount).toBe(14_000);
    expect(screen.getByText(/^12 payments of \$140\.00 at 12%/)).toBeTruthy(); // the quote is the one scored
    expect(screen.getByText(/^The rate works out to \$1\d\d\.\d\d a month; the quote is \$140\.00\.$/)).toBeTruthy();
  });

  it('D-80 the typed amount survives switching No and Yes', async () => {
    await mount(instalment({ amount: 14_000, count: 12 }));
    await fireEvent.press(radio('Yes'));
    expect(store.current.instalment.amount).toBe(14_000);
    expect(screen.getByLabelText('Payment as quoted (optional)').props.value).toMatch(/140/);
    await fireEvent.changeText(screen.getByLabelText('Annual rate, percent'), '7.5');
    await fireEvent.press(radio('No'));
    expect(store.current.instalment.hasRate).toBe(false);
    expect(store.current.instalment.amount).toBe(14_000);
    expect(store.current.instalment.aprText).toBe('7.5'); // the typed rate is kept, hidden and unused
    expect(screen.getByLabelText('Payment').props.value).toMatch(/140/);
    expect(screen.queryByLabelText('Annual rate, percent')).toBeNull();
    expect(screen.getByText(/^No rate was quoted\. 12 × \$140\.00/)).toBeTruthy();
  });

  it('D-80 first payment In a month changes the note', async () => {
    await mount(instalment({ hasRate: true, aprText: '12', count: 12 }));
    await fireEvent.press(radio('In a month'));
    expect(store.current.instalment.firstPayment).toBe('next_month');
    expect(screen.getByText(/the first in a month\. Interest over the plan is/)).toBeTruthy();
    await fireEvent.press(radio('Today'));
    expect(store.current.instalment.firstPayment).toBe('today');
    expect(screen.getByText(/the first on the day\./)).toBeTruthy();
  });

  it('R4 the instalment rate refuses 1000% and shows the range line', async () => {
    await mount(instalment({ hasRate: true, aprText: '', count: 12 }));
    const rate = screen.getByLabelText('Annual rate, percent');
    expect(screen.queryByText('0 to 999.99% a year')).toBeNull();
    await fireEvent.changeText(rate, '1000');
    expect(store.current.instalment.aprText).toBe('');
    expect(screen.getByText('0 to 999.99% a year')).toBeTruthy();
    await fireEvent.changeText(rate, '999.99');
    expect(store.current.instalment.aprText).toBe('999.99');
  });

  it('D-80 the late-fee lines sit behind Show details, and the info buttons are present', async () => {
    await mount(instalment({ amount: 30_000, count: 6 }));
    await fireEvent.changeText(screen.getByLabelText('Late fee (optional)'), '15');
    expect(screen.queryByText(/If 1 payment is late/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Show details, Late fee (optional)'));
    expect(screen.getByText('If 1 payment is late: +$15.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Hide details, Late fee (optional)'));
    expect(screen.queryByText(/If 1 payment is late/)).toBeNull();
    for (const term of ['Has a rate?', 'First payment', 'Late fee']) expect(screen.getByLabelText(`About ${term}`)).toBeTruthy();
  });
});
