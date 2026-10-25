import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { computeCheck } from '../../../snapshot/computeCheck';
import { emptyCheckInputs } from '../../../snapshot/checkInputs';
import type { CheckInputs } from '../../../snapshot/types';
import { TODAY, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { stepProps, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

const source = loggedSource();
const RETURN_LABEL = 'Expected return, % a year (optional)';
type Update = (patch: Partial<CheckInputs>) => void;

function Harness({ initial, onUpdate }: { initial: CheckInputs; onUpdate?: Update }) {
  const [inputs, setInputs] = useState(initial);
  const update: Update = (patch) => {
    onUpdate?.(patch);
    setInputs((cur) => ({ ...cur, ...patch }));
  };
  const props: Step2Props = {
    ...stepProps(inputs, { update }, source),
    computation: computeCheck(source, inputs),
    onSaveCardRate: jest.fn(),
    onSaveCardTerms: jest.fn(),
  };
  return <Step2PriceAndPay {...props} />;
}

const invest = (over: Partial<CheckInputs>): CheckInputs => ({ ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 100_000, ...over });

describe('Step 2 investment expected return (05-87)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-82 the expected return is blank by default and bounded at 100%', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={invest({ method: 'lump' })} onUpdate={onUpdate} />);
    const field = screen.getByLabelText(RETURN_LABEL);
    expect(field.props.value).toBe('');
    expect(screen.getAllByText('Up to 100% a year').length).toBeGreaterThan(0);
    await fireEvent.changeText(field, '7');
    expect(onUpdate).toHaveBeenLastCalledWith({ investReturnText: '7' });
    onUpdate.mockClear();
    await fireEvent.changeText(field, '7000');
    expect(onUpdate).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '');
    expect(onUpdate).toHaveBeenLastCalledWith({ investReturnText: null });
  });

  it('D-82 the lump-sum horizon chips show only with a return and default to 60 months', async () => {
    const onUpdate = jest.fn();
    const view = await wrap(<Harness initial={invest({ method: 'lump' })} onUpdate={onUpdate} />);
    expect(screen.queryByLabelText('5 years')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(RETURN_LABEL), '6');
    for (const label of ['1 year', '5 years', '10 years', '20 years']) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByLabelText('5 years').props.accessibilityState?.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText('10 years'));
    expect(onUpdate).toHaveBeenLastCalledWith({ lumpHorizonMonths: 120 });
    expect(screen.getByText(/after 120 months at 6% a year\. A projection at the rate you entered, not a forecast\./)).toBeTruthy();
    view.unmount();
  });

  it('D-82 the lump-sum horizon takes Custom from 1 to 600', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={invest({ method: 'lump', investReturnText: '5' })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom'));
    const field = screen.getByLabelText('Over, custom, months');
    await fireEvent.changeText(field, '600');
    expect(onUpdate).toHaveBeenLastCalledWith({ lumpHorizonMonths: 600 });
    onUpdate.mockClear();
    await fireEvent.changeText(field, '601');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('D-82 the step 2 projection note uses the expected return', async () => {
    await wrap(<Harness initial={invest({ method: 'monthly', advertised: 20_000, investTermMonths: 12, investReturnText: '5', projectionRates: ['9'] })} />);
    expect(screen.getByText(/^About \$\d+ after 12 months at 5% a year\./)).toBeTruthy();
    expect(screen.queryByText(/at 9%/)).toBeNull();
  });

  it('D-82 no projection note without a return', async () => {
    await wrap(<Harness initial={invest({ method: 'monthly', advertised: 20_000, investTermMonths: 12, projectionRates: ['5'] })} />);
    expect(screen.queryByText(/not a forecast/)).toBeNull();
    expect(screen.getByLabelText(RETURN_LABEL).props.value).toBe('');
  });
});
