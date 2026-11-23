import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PinPad } from '../PinPad';
import { PinDots } from '../PinDots';

const wrap = async (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('PinPad', () => {
  it('calls onDigit for each key and onBackspace for delete', async () => {
    const onDigit = jest.fn();
    const onBackspace = jest.fn();
    const { getByTestId, getByLabelText } = await wrap(<PinPad onDigit={onDigit} onBackspace={onBackspace} />);
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) await fireEvent.press(getByTestId(`pin-key-${d}`));
    expect(onDigit.mock.calls.map((c) => c[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    await fireEvent.press(getByLabelText('Delete last digit'));
    expect(onBackspace).toHaveBeenCalledTimes(1);
  });

  it('keys announce their digit', async () => {
    const { getByLabelText } = await wrap(<PinPad onDigit={jest.fn()} onBackspace={jest.fn()} />);
    expect(getByLabelText('7')).toBeTruthy();
  });

  it('blocks presses while disabled', async () => {
    const onDigit = jest.fn();
    const onBackspace = jest.fn();
    const { getByTestId } = await wrap(<PinPad onDigit={onDigit} onBackspace={onBackspace} disabled />);
    await fireEvent.press(getByTestId('pin-key-5'));
    await fireEvent.press(getByTestId('pin-key-backspace'));
    expect(onDigit).not.toHaveBeenCalled();
    expect(onBackspace).not.toHaveBeenCalled();
  });

  it('keys are 64 x 64', async () => {
    const { getByTestId } = await wrap(<PinPad onDigit={jest.fn()} onBackspace={jest.fn()} />);
    const style = Object.assign({}, ...[getByTestId('pin-key-1').props.style].flat(2).filter(Boolean));
    expect(style.width).toBe(64);
    expect(style.height).toBe(64);
  });
});

describe('PinDots', () => {
  it('shows six dots with the filled count', async () => {
    const { getAllByTestId, queryAllByTestId } = await wrap(<PinDots filled={2} />);
    expect(queryAllByTestId('pin-dot-filled')).toHaveLength(2);
    expect(getAllByTestId('pin-dot-empty')).toHaveLength(4);
  });

  it('reads the count, never the digits', async () => {
    const { getByLabelText } = await wrap(<PinDots filled={3} />);
    expect(getByLabelText('3 of 6 digits entered')).toBeTruthy();
  });
});
