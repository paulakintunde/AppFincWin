// 05.4-39 (D-156): MoneyInput tests, split from decide's inputPrimitives.test.tsx when MoneyInput moved to src/ui,
// plus the harvested 05.3-52 zero-hint tests (D-157).
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, StyleSheet } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import * as deviceLocale from '@/services/locale/deviceLocale';
import { MoneyInput } from '../MoneyInput';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

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
    // 06.1-52: a half-typed grouping is not an error yet; it waits for the blur.
    await fireEvent.changeText(getByLabelText('Loan amount'), '1,2');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(queryByText(/match how amounts/i)).toBeNull();
  });

  it('06.1-52 (C-10): text no more typing can fix shows the digits-only line at once, and empty text shows none', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText, queryByText } = await wrap(
      <MoneyInput value={null} currency="USD" onChange={onChange} label="Loan" accessibilityLabel="Loan amount" />,
    );
    const input = getByLabelText('Loan amount');
    await fireEvent.changeText(input, '12a');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(getByText('Digits only, like 1200 or 1,200.50.')).toBeTruthy();
    await fireEvent.changeText(input, '');
    expect(queryByText(/Digits only/)).toBeNull();
    await fireEvent.changeText(input, '$150');
    expect(onChange).toHaveBeenLastCalledWith(15000);
    expect(queryByText(/Digits only/)).toBeNull();
    await fireEvent.changeText(input, '£150');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(getByText('Digits only, like 1200 or 1,200.50.')).toBeTruthy();
  });

  it('06.1-52 (X-4): on blur a whole amount rests as 9,000, a fractional one keeps its decimals; the value is unchanged', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(
      <MoneyInput value={null} currency="USD" onChange={onChange} label="Loan" accessibilityLabel="Loan amount" />,
    );
    const input = getByLabelText('Loan amount');
    await fireEvent.changeText(input, '9000.00');
    await fireEvent(input, 'blur');
    expect(getByLabelText('Loan amount').props.value).toBe('9,000');
    expect(onChange).toHaveBeenLastCalledWith(900000);
    await fireEvent.changeText(input, '$9000.5');
    await fireEvent(input, 'blur');
    expect(getByLabelText('Loan amount').props.value).toBe('9,000.50');
    expect(onChange).toHaveBeenLastCalledWith(900050);
  });

  it('06.1-83: a pre-filled amount shows grouped with no .00, before focus, while editing and after blur', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(
      <MoneyInput value={300000} currency="USD" onChange={onChange} label="Price" accessibilityLabel="Price" />,
    );
    const input = getByLabelText('Price');
    expect(input.props.value).toBe('3,000');
    await fireEvent(input, 'focus');
    expect(getByLabelText('Price').props.value).toBe('3,000');
    await fireEvent(input, 'blur');
    expect(getByLabelText('Price').props.value).toBe('3,000');
    expect(onChange).toHaveBeenLastCalledWith(300000);
  });

  it('06.1-83: a fractional pre-fill keeps its decimals, grouped', async () => {
    const { getByLabelText } = await wrap(
      <MoneyInput value={123456} currency="USD" onChange={jest.fn()} label="Price" accessibilityLabel="Price" />,
    );
    expect(getByLabelText('Price').props.value).toBe('1,234.56');
  });

  it('06.1-83: a value set from outside shows grouped; typed text with or without commas still parses', async () => {
    const onChange = jest.fn();
    const ui = (value: number | null) => <MoneyInput value={value} currency="USD" onChange={onChange} label="Price" accessibilityLabel="Price" />;
    const { getByLabelText, rerender } = await wrap(ui(null));
    await rerender(<ThemeProvider>{ui(250000)}</ThemeProvider>);
    expect(getByLabelText('Price').props.value).toBe('2,500');
    await fireEvent.changeText(getByLabelText('Price'), '4,500');
    expect(onChange).toHaveBeenLastCalledWith(450000);
    await fireEvent.changeText(getByLabelText('Price'), '4500');
    expect(onChange).toHaveBeenLastCalledWith(450000);
  });

  it('06.1-52 (X-4): prefix shows the currency symbol and suffix the trailing word', async () => {
    const { getByTestId, queryByTestId, rerender } = await wrap(
      <MoneyInput value={null} currency="USD" onChange={jest.fn()} label="Rent" accessibilityLabel="Rent" prefix="symbol" suffix="a month" />,
    );
    expect(getByTestId('money-symbol')).toHaveTextContent('$');
    expect(getByTestId('money-suffix')).toHaveTextContent('a month');
    await rerender(
      <ThemeProvider>
        <MoneyInput value={null} currency="USD" onChange={jest.fn()} label="Rent" accessibilityLabel="Rent" />
      </ThemeProvider>,
    );
    expect(queryByTestId('money-symbol')).toBeNull();
    expect(queryByTestId('money-suffix')).toBeNull();
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
    // 06.1-52 (C-10): the invalid-text error now reads digits only.
    expect(getByText(/Digits only/)).toBeTruthy();
  });
});

// 05.3-52 (F8): an empty money field hints a zero amount, read as a hint (muted, never the value or the label).
describe('MoneyInput zero hint', () => {
  afterEach(() => jest.restoreAllMocks());
  const INK_MUTED = '#6E6A5E';

  it('shows 0.00 for USD in inkMuted, keeps the label and reports no value', async () => {
    const onChange = jest.fn();
    const view = await wrap(<MoneyInput boxed zeroHint value={null} currency="USD" onChange={onChange} label="Target" accessibilityLabel="Target" />);
    const field = view.getByLabelText('Target');
    expect(field.props.placeholder).toBe('0.00');
    expect(field.props.value).toBe('');
    expect(field.props.placeholderTextColor).toBe(INK_MUTED);
    expect(field.props.accessibilityLabel).toBe('Target');
    // 06.1-84 (G-61-6): a value object, never none (see the type-then-clear case below). 06.1-85 (G-PD-4): its text is null, not
    // '', so Android names it "Price", not "Price, ".
    expect(field.props.accessibilityValue).toEqual({ text: null });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows the currency digits and the region decimal mark', async () => {
    jest.spyOn(deviceLocale, 'useDeviceLocale').mockReturnValue({ locale: 'de-DE', timeZone: 'Europe/Berlin', separators: { decimal: ',', group: '.' } });
    const eur = await wrap(<MoneyInput zeroHint value={null} currency="EUR" onChange={jest.fn()} label="Goal" accessibilityLabel="Goal" />);
    expect(eur.getByLabelText('Goal').props.placeholder).toBe('0,00');
    const jpy = await wrap(<MoneyInput zeroHint value={null} currency="JPY" onChange={jest.fn()} label="Fees" accessibilityLabel="Fees" />);
    expect(jpy.getByLabelText('Fees').props.placeholder).toBe('0');
  });

  it('a given placeholder wins, and no hint shows without zeroHint', async () => {
    const given = await wrap(<MoneyInput zeroHint value={null} currency="USD" onChange={jest.fn()} label="Price" accessibilityLabel="Price" placeholder="Add amount" />);
    expect(given.getByLabelText('Price').props.placeholder).toBe('Add amount');
    const none = await wrap(<MoneyInput value={null} currency="USD" onChange={jest.fn()} label="Other" accessibilityLabel="Other" />);
    expect(none.getByLabelText('Other').props.placeholder).toBeUndefined();
  });
  // 06.1-61 (plan 51 item 6): the empty price field is announced by its name, before any amount is typed.
  it('the empty field carries its label for screen readers, with no value yet', async () => {
    const view = await wrap(
      <MoneyInput value={null} currency="USD" onChange={jest.fn()} label="Price" accessibilityLabel="Price" prefix="symbol" zeroHint labelAccessory={<Pressable accessibilityLabel="Why?" />} />,
    );
    const field = view.getByLabelText('Price');
    expect(field.props.value).toBe('');
    expect(field.props.accessibilityLabel).toBe('Price');
    expect(field.props.accessibilityValue).toEqual({ text: null });
    await fireEvent.changeText(field, '180');
    await fireEvent(field, 'blur');
    expect(view.getByLabelText('Price').props.accessibilityLabel).toBe('Price');
  });

  // 06.1-84 (G-61-6): on Android, React Native's setAccessibilityValue(null) clears the whole content description and does not
  // rebuild it from the label, so a field that went from "5" back to empty lost its name ("Price"). The value is never removed:
  // an empty field sends an empty value text, which keeps the label in the description.
  it('type then clear: the field keeps a value object, so its name is not wiped', async () => {
    function Controlled() {
      const [v, setV] = React.useState<number | null>(null);
      return <MoneyInput value={v} currency="USD" onChange={setV} label="Price" accessibilityLabel="Price" zeroHint />;
    }
    const view = await wrap(<Controlled />);
    const field = view.getByLabelText('Price');
    await fireEvent.changeText(field, '5');
    expect(view.getByLabelText('Price').props.accessibilityValue?.text).toMatch(/5/);
    await fireEvent.changeText(view.getByLabelText('Price'), '');
    await fireEvent(view.getByLabelText('Price'), 'blur');
    expect(view.getByLabelText('Price').props.accessibilityLabel).toBe('Price');
    expect(view.getByLabelText('Price').props.accessibilityValue).toEqual({ text: null });
  });

  // 06.1-61: a fixed-width amount field grows with the OS font scale (to the 2x cap), so "$156.00" is not cut at 2x.
  it('an amount field width follows the font scale up to the 2x cap', async () => {
    const widthAt = async (scale: number): Promise<number> => {
      const view = await render(
        <FontScaleProvider value={scale}>
          <ThemeProvider>
            <MoneyInput value={15_600} currency="USD" onChange={jest.fn()} label="Registration" accessibilityLabel="Registration amount" prefix="symbol" amountField={{ width: 120 }} />
          </ThemeProvider>
        </FontScaleProvider>,
      );
      // the field's outer host View carries the width
      await view.findByLabelText('Registration amount');
      const root = view.toJSON() as { props: { style?: unknown } } | null;
      const width = (StyleSheet.flatten(root?.props.style as never) as { width?: number } | undefined)?.width;
      await view.unmount();
      return width ?? -1;
    };
    expect(await widthAt(1)).toBe(120);
    expect(await widthAt(1.5)).toBe(180);
    expect(await widthAt(2)).toBe(240);
    expect(await widthAt(3)).toBe(240);
  });
});
