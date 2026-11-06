// 05.4-39 (D-156): MoneyInput tests, split from decide's inputPrimitives.test.tsx when MoneyInput moved to src/ui,
// plus the harvested 05.3-52 zero-hint tests (D-157).
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
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
    expect(field.props.accessibilityValue).toBeUndefined();
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
});
