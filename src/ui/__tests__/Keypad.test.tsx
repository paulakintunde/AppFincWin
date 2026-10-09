import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Keypad } from '../Keypad';
import { hapticSelection } from '../haptics';

jest.mock('../haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

jest.setTimeout(20000);

async function setup(over: Partial<React.ComponentProps<typeof Keypad>> = {}) {
  const onChange = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <Keypad value="" onChange={onChange} exponent={2} decimalSeparator="." {...over} />
    </ThemeProvider>,
  );
  return { ...utils, onChange };
}

beforeEach(() => jest.clearAllMocks());

describe('Keypad', () => {
  it('renders 12 keys in grid order with the locale separator', async () => {
    const { getAllByRole } = await setup({ decimalSeparator: ',' });
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(12);
    const expected = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', String.fromCharCode(0x232b)];
    expected.forEach((label, i) => expect(within(buttons[i]!).getByText(label)).toBeTruthy());
  });

  it('pressing 5 on empty calls onChange and a selection haptic', async () => {
    const { getByLabelText, onChange } = await setup();
    await fireEvent.press(getByLabelText('5'));
    expect(onChange).toHaveBeenCalledWith('5');
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('decimal with exponent 0 is a no-op', async () => {
    const { getByLabelText, onChange } = await setup({ exponent: 0, value: '12' });
    await fireEvent.press(getByLabelText('Decimal point'));
    expect(onChange).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it('long-press backspace clears', async () => {
    const { getByLabelText, onChange } = await setup({ value: '123.4' });
    await fireEvent(getByLabelText('Delete last digit'), 'longPress');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('backspace has a spoken label and a hold-to-clear hint', async () => {
    const { getByLabelText } = await setup({ value: '1' });
    const key = getByLabelText('Delete last digit');
    expect(key.props.accessibilityHint).toBe('Hold to clear');
  });
});
