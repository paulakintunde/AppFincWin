import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StepSlider, snapToStep, stepFrom } from '../StepSlider';
import { RateInput, toRateText } from '../RateInput';
import * as deviceLocale from '@/services/locale/deviceLocale';
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

  async function laidOut(onChange: jest.Mock) {
    const view = await wrap(<StepSlider {...base} value={10000} onChange={onChange} />);
    await fireEvent(view.getByLabelText('Deposit'), 'layout', { nativeEvent: { layout: { width: 100, height: 44, x: 0, y: 0 } } });
    return view;
  }

  it('WR-D02: touch-down sets nothing; the pan fails on vertical motion and sets the value only once active', async () => {
    const onChange = jest.fn();
    await laidOut(onChange);
    const pan = getByGestureTestId('step-slider-pan') as unknown as {
      handlers: { onBegin?: unknown; onStart?: unknown };
      config: { failOffsetYStart?: number; failOffsetYEnd?: number };
    };
    expect(pan.handlers.onBegin).toBeUndefined();
    expect(pan.handlers.onStart).toBeDefined();
    expect([pan.config.failOffsetYStart, pan.config.failOffsetYEnd]).toEqual([-10, 10]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('WR-D02: an active horizontal pan and a tap set the touched value', async () => {
    const onChange = jest.fn();
    await laidOut(onChange);
    await act(async () => {
      fireGestureHandler(getByGestureTestId('step-slider-pan'), [
        { state: State.BEGAN, x: 20 },
        { state: State.ACTIVE, x: 40 },
        { state: State.END, x: 40 },
      ]);
    });
    expect(onChange).toHaveBeenLastCalledWith(20000);
    await act(async () => {
      fireGestureHandler(getByGestureTestId('step-slider-tap'), [
        { state: State.BEGAN, x: 80 },
        { state: State.ACTIVE, x: 80 },
        { state: State.END, x: 80 },
      ]);
    });
    expect(onChange).toHaveBeenLastCalledWith(40000);
  });

  it('WR-D06: max is reachable when it is off the step grid, and a bad step gives min', () => {
    // grid 100, 350, 600, 850; max 1000
    expect(snapToStep(1000, 100, 1000, 250)).toBe(1000);
    expect(snapToStep(930, 100, 1000, 250)).toBe(1000);
    expect(snapToStep(900, 100, 1000, 250)).toBe(850);
    expect(snapToStep(-50, 100, 1000, 250)).toBe(100);
    expect(stepFrom(850, 1, 100, 1000, 250)).toBe(1000);
    expect(stepFrom(1000, -1, 100, 1000, 250)).toBe(850);
    expect(stepFrom(1000, 1, 100, 1000, 250)).toBe(1000);
    expect(stepFrom(860, -1, 100, 860, 250)).toBe(850);
    expect(snapToStep(500, 100, 1000, 0)).toBe(100);
    expect(snapToStep(500, 100, 1000, -5)).toBe(100);
    expect(stepFrom(500, 1, 100, 1000, 0)).toBe(100);
    expect(snapToStep(500, 100, 100, 250)).toBe(100);
  });

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
  afterEach(() => jest.restoreAllMocks());

  it('WR-D03: a decimal-comma region types and sees a comma; the engine gets a point', async () => {
    jest.spyOn(deviceLocale, 'useDeviceLocale').mockReturnValue({
      locale: 'de-DE',
      timeZone: 'Europe/Berlin',
      separators: { decimal: ',', group: '.' },
    });
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(<RateInput value="4.5" onChange={onChange} label="Rate" accessibilityLabel="APR" />);
    expect(getByLabelText('APR').props.value).toBe('4,5');
    await fireEvent.changeText(getByLabelText('APR'), '7,25');
    expect(onChange).toHaveBeenLastCalledWith('7.25');
    await fireEvent.changeText(getByLabelText('APR'), '7,2,5');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('WR-D03: toRateText leaves a point region untouched', () => {
    expect(toRateText('1,5', '.')).toBe('1,5');
    expect(toRateText('1,5', ',')).toBe('1.5');
  });

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

  it('CR-D01: reports the parsed figure as it is typed, before any blur', async () => {
    const onChange = jest.fn();
    const { getByLabelText, queryByText } = await wrap(
      <MoneyInput value={null} currency="USD" onChange={onChange} label="Loan" accessibilityLabel="Loan amount" />,
    );
    await fireEvent.changeText(getByLabelText('Loan amount'), '12.5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
    await fireEvent.changeText(getByLabelText('Loan amount'), 'abc');
    expect(onChange).toHaveBeenLastCalledWith(null);
    // The parser error waits for the blur.
    expect(queryByText(/amount/i)).toBeNull();
  });

  it('WR-D05: a parent reset to null clears the text; a null answer to its own report keeps it', async () => {
    function Host() {
      const [value, setValue] = React.useState<number | null>(null);
      return (
        <>
          <MoneyInput
            value={value}
            currency="USD"
            // The parent keeps only positive figures, as several step-2 panels do.
            onChange={(minor) => setValue(minor !== null && minor > 0 ? minor : null)}
            label="Loan"
            accessibilityLabel="Loan amount"
          />
          <Pressable accessibilityLabel="Reset" onPress={() => setValue(null)} />
        </>
      );
    }
    const { getByLabelText } = await wrap(<Host />);
    const input = getByLabelText('Loan amount');
    await fireEvent.changeText(input, '0');
    expect(getByLabelText('Loan amount').props.value).toBe('0');
    await fireEvent.changeText(input, '0.5');
    expect(getByLabelText('Loan amount').props.value).toBe('0.5');
    await fireEvent.press(getByLabelText('Reset'));
    expect(getByLabelText('Loan amount').props.value).toBe('');
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

describe('dark rate and money fields', () => {
  const SURFACE = '#FFFFFF';
  const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

  it('D-95 dark rate and money fields use the ink-card tokens and a surface focus ring', async () => {
    const rate = await wrap(<RateInput tone="dark" value="4" onChange={jest.fn()} label="Rate" hint="a year" accessibilityLabel="APR" />);
    const input = rate.getByLabelText('APR');
    expect(flat(input).color).toBe(SURFACE);
    expect(rate.getByText('a year')).toBeTruthy();
    expect(flat(rate.getByText('a year')).color).toBe('#A8A79C');
    const ring = (n: ReturnType<typeof rate.getByLabelText>) => flat(n.parent as never);
    expect(ring(input).borderColor).toBe('transparent');
    await fireEvent(input, 'focus');
    expect(ring(input).borderColor).toBe(SURFACE);
    expect(ring(input).borderWidth).toBe(2);
    await fireEvent(input, 'blur');
    expect(ring(input).borderColor).toBe('transparent');

    const money = await wrap(<MoneyInput tone="dark" value={null} currency="USD" onChange={jest.fn()} label="Fees" accessibilityLabel="Fees" placeholder="0" />);
    const field = money.getByLabelText('Fees');
    expect(flat(field).color).toBe(SURFACE);
    expect(field.props.placeholderTextColor).toBe('#BFBEB4');
    await fireEvent(field, 'focus');
    expect(flat(field.parent as never).borderColor).toBe(SURFACE);
  });

  it('D-95 the dark out-of-range line is surface text', async () => {
    const rate = await wrap(<RateInput tone="dark" value="" onChange={jest.fn()} label="Rate" accessibilityLabel="APR" max="100" rangeText="0 to 100%" />);
    await fireEvent.changeText(rate.getByLabelText('APR'), '101');
    expect(flat(rate.getByText('0 to 100%')).color).toBe(SURFACE);
    const money = await wrap(<MoneyInput tone="dark" value={null} currency="USD" onChange={jest.fn()} label="Fees" accessibilityLabel="Fees" />);
    await fireEvent.changeText(money.getByLabelText('Fees'), 'abc');
    await fireEvent(money.getByLabelText('Fees'), 'blur');
    expect(flat(money.getByText(/amount/i)).color).toBe(SURFACE);
  });
});
