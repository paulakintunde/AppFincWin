import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SelectBar } from '../SelectBar';

jest.setTimeout(30000);

async function setup(count = 3) {
  const fns = { onSelectAll: jest.fn(), onSelectNone: jest.fn(), onDone: jest.fn() };
  const utils = await render(
    <ThemeProvider>
      <SelectBar count={count} {...fns} />
    </ThemeProvider>
  );
  return { ...utils, ...fns };
}

describe('SelectBar', () => {
  it('shows the count', async () => {
    expect((await setup(3)).getByText('3 selected')).toBeTruthy();
    expect((await setup(1)).getByText('1 selected')).toBeTruthy();
  });

  it('wires the three actions', async () => {
    const { getByText, onSelectAll, onSelectNone, onDone } = await setup();
    await fireEvent.press(getByText('Select all'));
    await fireEvent.press(getByText('None'));
    await fireEvent.press(getByText('Done'));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(onSelectNone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('wraps in a row', async () => {
    const { getByTestId } = await setup();
    const style = StyleSheet.flatten(getByTestId('activity-select-bar').props.style);
    expect(style.flexDirection).toBe('row');
    expect(style.flexWrap).toBe('wrap');
  });
});
