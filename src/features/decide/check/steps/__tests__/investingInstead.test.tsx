import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { CheckComputation } from '../../../snapshot/types';
import { Step4Alternatives } from '../Step4Alternatives';
import { HoldingFeeInput, HorizonChips, RateChips } from '../step4/RateChips';
import { InvestingInsteadBody, InvestingInsteadSection } from '../step4/InvestingInsteadSection';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs } from '../../../snapshot/types';
import type { StepProps } from '../../stepTypes';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));

function props(over: Partial<CheckInputs> = {}, extra: Partial<StepProps> = {}): StepProps {
  return stepProps(buy(over), extra);
}

async function open() {
  await fireEvent.press(screen.getByLabelText(/If it went into investing instead/));
}

async function details() {
  await fireEvent.press(screen.getByLabelText(/Show details, If it went into investing instead/));
}

describe('RateChips', () => {
  it('shows a fixed 0% chip and removes a typed rate', async () => {
    const onChange = jest.fn();
    await wrap(<RateChips rates={['5', '7']} onChange={onChange} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('5% a year')).toBeTruthy();
    expect(screen.queryByLabelText('Remove the 0% rate')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Remove the 5% rate'));
    expect(onChange).toHaveBeenCalledWith(['7']);
  });

  it('adds a valid rate once and never pre-fills one', async () => {
    const onChange = jest.fn();
    await wrap(<RateChips rates={['5']} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('+ Add a rate'));
    const field = screen.getByLabelText('Return, percent');
    expect(field.props.value).toBe('');
    await fireEvent.changeText(field, '5');
    await fireEvent(field, 'blur');
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('+ Add a rate'));
    await fireEvent.changeText(screen.getByLabelText('Return, percent'), '7.5');
    await fireEvent(screen.getByLabelText('Return, percent'), 'blur');
    expect(onChange).toHaveBeenCalledWith(['5', '7.5']);
  });

  it('a rate above 100% is refused with its hint', async () => {
    const onChange = jest.fn();
    await wrap(<RateChips rates={[]} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('+ Add a rate'));
    await fireEvent.changeText(screen.getByLabelText('Return, percent'), '150');
    expect(screen.getByText('Up to 100% a year')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Return, percent'), 'blur');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hides the add link at three rates', async () => {
    await wrap(<RateChips rates={['1', '2', '3']} onChange={jest.fn()} />);
    expect(screen.queryByLabelText('+ Add a rate')).toBeNull();
    expect(screen.getByText('Up to 3 rates')).toBeTruthy();
  });

  it('removing the first rate makes the next one first', async () => {
    const onChange = jest.fn();
    await wrap(<RateChips rates={['4', '6']} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Remove the 4% rate'));
    expect(onChange.mock.calls[0][0][0]).toBe('6');
  });
});

describe('HorizonChips', () => {
  it('the plan-term chip stays after another horizon is picked', async () => {
    const onChange = jest.fn();
    const ui = (value: number | null) => <HorizonChips value={value} planTerm={18} onChange={onChange} />;
    const { rerender } = await wrap(ui(null));
    expect(screen.getByLabelText('18 months').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText('36 months'));
    expect(onChange).toHaveBeenCalledWith(36);
    await rerender(ui(36));
    expect(screen.getByLabelText('18 months')).toBeTruthy();
    expect(screen.getByLabelText('36 months').props.accessibilityState.selected).toBe(true);
  });

  it('defaults to 60 months for cash', async () => {
    await wrap(<HorizonChips value={null} planTerm={null} onChange={jest.fn()} />);
    expect(screen.getByLabelText('60 months').props.accessibilityState.selected).toBe(true);
  });
});

describe('HorizonChips custom', () => {
  it('D-71 the investing horizon takes Custom from 1 to 600', async () => {
    const onChange = jest.fn();
    await wrap(<HorizonChips value={60} planTerm={null} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Custom'));
    const field = screen.getByLabelText('Months to project, custom, months');
    await fireEvent.changeText(field, '600');
    expect(onChange).toHaveBeenLastCalledWith(600);
    await fireEvent.changeText(field, '1');
    expect(onChange).toHaveBeenLastCalledWith(1);
    onChange.mockClear();
    await fireEvent.changeText(field, '601');
    await fireEvent.changeText(field, '0');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('1 to 600 months')).toBeTruthy();
  });

  it('D-71 a stored horizon off the presets reads on the Custom chip', async () => {
    await wrap(<HorizonChips value={84} planTerm={null} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Custom, 84 months').props.accessibilityState.selected).toBe(true);
  });
});

describe('HoldingFeeInput', () => {
  it('the holding fee is blank until typed and clears to none', async () => {
    const onChange = jest.fn();
    await wrap(<HoldingFeeInput value={null} onChange={onChange} />);
    const field = screen.getByLabelText('Holding fee, percent a year');
    expect(field.props.value).toBe('');
    await fireEvent.changeText(field, '1');
    expect(onChange).toHaveBeenLastCalledWith('1');
    await fireEvent.changeText(screen.getByLabelText('Holding fee, percent a year'), '150');
    expect(onChange).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Holding fee, percent a year'), '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('WR-C13: 5.5 edited to 5. stores 5, and a value changed from outside replaces the text', async () => {
    const onChange = jest.fn();
    const view = await wrap(<HoldingFeeInput value="5.5" onChange={onChange} />);
    const field = () => screen.getByLabelText('Holding fee, percent a year');
    await fireEvent.changeText(field(), '5.');
    expect(onChange).toHaveBeenLastCalledWith('5');
    await view.rerender(<HoldingFeeInput value="5" onChange={onChange} />);
    expect(field().props.value).toBe('5.');
    await view.rerender(<HoldingFeeInput value={null} onChange={onChange} />);
    expect(field().props.value).toBe('');
  });
});

describe('InvestingInsteadSection', () => {
  it('sits collapsed after the trade in step 4 with its summary', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    expect(screen.getByText('If it went into investing instead')).toBeTruthy();
    expect(screen.getByText('A projection at the rate you enter')).toBeTruthy();
    expect(screen.queryByText('Price invested instead')).toBeNull();
  });

  it('shows the four views, each captioned as a projection', async () => {
    await wrap(<InvestingInsteadSection {...props({ projectionRates: ['5'] })} />);
    await open();
    await details();
    for (const title of ['Price invested instead', 'Payments invested instead', 'Investing growth lost to a pause', 'Net worth, with and without this'])
      expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getAllByText('A projection at the rate you entered, not a forecast.').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('At 0% the money is only held, not grown.').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('This plan pauses no investing.')).toBeTruthy();
  });

  it('writes the rates, the fee and the horizon through update', async () => {
    const p = props({ projectionRates: ['5'] });
    await wrap(<InvestingInsteadSection {...p} />);
    await open();
    await fireEvent.press(screen.getByLabelText('24 months'));
    expect(p.update).toHaveBeenCalledWith({ investHorizonMonths: 24 });
    await fireEvent.changeText(screen.getByLabelText('Holding fee, percent a year'), '1');
    expect(p.update).toHaveBeenCalledWith({ investHoldingFeeText: '1' });
    await fireEvent.press(screen.getByLabelText('Remove the 5% rate'));
    expect(p.update).toHaveBeenCalledWith({ projectionRates: [] });
  });

  it('the holding fee shows on the investing views only', async () => {
    const p = props({ projectionRates: ['5'], investHoldingFeeText: '1' });
    await wrap(<Step4Alternatives {...p} />);
    await open();
    await details();
    expect(screen.getAllByText('0% a year, −1% after fees').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5% a year, 4% after fees').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A projection at the rate you entered less the 1% fee, not a forecast.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('At 0% the money is only held, and the 1% fee comes off it.').length).toBeGreaterThan(0);
    // the Kept column header never mentions fees
    for (const node of screen.getAllByText(/^Kept/)) expect(node.props.children).not.toMatch(/after fees/);
    expect(screen.queryAllByLabelText(/^Kept.*after fees/).length).toBe(0);
  });

  it('an out-of-range view reads too large', async () => {
    const p = props({ projectionRates: ['5'] });
    const v = p.computation.investmentViews!;
    const bad = { ...v.priceInvested.byRate[1], projected: null, growth: null, rangeCode: 'exceeds_range' as const };
    const computation = {
      ...p.computation,
      investmentViews: { ...v, priceInvested: { ...v.priceInvested, byRate: [v.priceInvested.byRate[0], bad] } },
    } as CheckComputation;
    await wrap(<InvestingInsteadSection {...p} computation={computation} />);
    await open();
    expect(screen.getAllByText('Too large to project at this rate').length).toBeGreaterThan(0);
  });

  it('D-74 investing views 2-4 sit behind Show details', async () => {
    await wrap(<InvestingInsteadBody {...props({ projectionRates: ['5'] })} />);
    expect(screen.getByText('Price invested instead')).toBeTruthy();
    for (const title of ['Payments invested instead', 'Investing growth lost to a pause', 'Net worth, with and without this'])
      expect(screen.queryByText(title)).toBeNull();
    await details();
    for (const title of ['Payments invested instead', 'Investing growth lost to a pause', 'Net worth, with and without this'])
      expect(screen.getByText(title)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Hide details, If it went into investing instead/));
    expect(screen.queryByText('Payments invested instead')).toBeNull();
  });

  it('the body renders nothing without investment views', async () => {
    const p = props();
    const computation = { ...p.computation, investmentViews: null } as CheckComputation;
    await wrap(<InvestingInsteadBody {...p} computation={computation} />);
    expect(screen.queryByText('Price invested instead')).toBeNull();
  });

  it('renders nothing without investment views', async () => {
    const p = props();
    const computation = { ...p.computation, investmentViews: null } as CheckComputation;
    await wrap(<InvestingInsteadSection {...p} computation={computation} />);
    expect(screen.queryByText('If it went into investing instead')).toBeNull();
  });

  it('never tells the reader to invest', async () => {
    await wrap(<InvestingInsteadSection {...props({ projectionRates: ['5'], investHoldingFeeText: '1' })} />);
    await open();
    await details();
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/should|invest now|start investing|advice|recommend/i);
  });
});
