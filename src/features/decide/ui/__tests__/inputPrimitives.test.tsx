import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StepSlider } from '../StepSlider';
import { RateInput } from '../RateInput';
import { MoneyInput } from '../MoneyInput';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function action(name: 'increment' | 'decrement') {
  return { nativeEvent: { actionName: name } };
}

describe('StepSlider', () => {
  const base = { min: 0, max: 50000, step: 5000, accessibilityLabel: 'Deposit', valueText: '100 dollars' };

  it('is adjustable with a spoken value', async () => {
    const { getByLabelText } = await wrap(<StepSlider {...base} value={10000} onChange={jest.fn()} />);
    const s = getByLabelText('Deposit');
    expect(s.props.accessibilityRole).toBe('adjustable');
    expect(s.props.accessibilityValue).toEqual({ min: 0, max: 50000, now: 10000, text: '100 dollars' });
  });

  it('increment and decrement move exactly one step', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(<StepSlider {...base} value={10000} onChange={onChange} />);
    const s = getByLabelText('Deposit');
    await fireEvent(s, 'accessibilityAction', action('increment'));
    expect(onChange).toHaveBeenLastCalledWith(15000);
    await fireEvent(s, 'accessibilityAction', action('decrement'));
    expect(onChange).toHaveBeenLastCalledWith(5000);
  });

  it('does not move past either end', async () => {
    const onChange = jest.fn();
    const hi = await wrap(<StepSlider {...base} value={50000} onChange={onChange} />);
    await fireEvent(hi.getByLabelText('Deposit'), 'accessibilityAction', action('increment'));
    expect(onChange).not.toHaveBeenCalled();
    await hi.unmount();
    const lo = await wrap(<StepSlider {...base} value={0} onChange={onChange} />);
    await fireEvent(lo.getByLabelText('Deposit'), 'accessibilityAction', action('decrement'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps every emitted value on the step grid', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(
      <StepSlider min={100} max={1000} step={250} value={350} onChange={onChange} accessibilityLabel="S" />,
    );
    const s = getByLabelText('S');
    await fireEvent(s, 'accessibilityAction', action('increment'));
    await fireEvent(s, 'accessibilityAction', action('decrement'));
    expect(onChange).toHaveBeenCalled();
    for (const [v] of onChange.mock.calls) {
      expect((v - 100) % 250).toBe(0);
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(1000);
    }
  });
});

describe('RateInput', () => {
  it('accepts digits and one decimal point, ignores everything else', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = await wrap(
      <RateInput value="5" onChange={onChange} label="Rate" hint="A hint" accessibilityLabel="APR" />,
    );
    const input = getByLabelText('APR');
    expect(input.props.inputMode).toBe('decimal');
    expect(getByText('%')).toBeTruthy();
    expect(getByText('A hint')).toBeTruthy();
    await fireEvent.changeText(input, '5.25');
    expect(onChange).toHaveBeenLastCalledWith('5.25');
    onChange.mockClear();
    await fireEvent.changeText(input, '5a');
    await fireEvent.changeText(input, '5.2.');
    await fireEvent.changeText(input, '12345');
    await fireEvent.changeText(input, '1.12345678901');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes the text through untouched (no float conversion)', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(<RateInput value="" onChange={onChange} label="Rate" accessibilityLabel="APR" />);
    await fireEvent.changeText(getByLabelText('APR'), '7.50');
    expect(onChange).toHaveBeenCalledWith('7.50');
  });
});

describe('MoneyInput', () => {
  it('reports integer minor units on blur', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(
      <MoneyInput value={null} currency="USD" onChange={onChange} label="Loan" accessibilityLabel="Loan amount" />,
    );
    const input = getByLabelText('Loan amount');
    await fireEvent.changeText(input, '1,234.56');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenLastCalledWith(123456);
  });

  it('shows the parser error and reports null for invalid text', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = await wrap(
      <MoneyInput value={null} currency="USD" onChange={onChange} label="Loan" accessibilityLabel="Loan amount" />,
    );
    const input = getByLabelText('Loan amount');
    await fireEvent.changeText(input, 'abc');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(getByText(/amount/i)).toBeTruthy();
  });
});
