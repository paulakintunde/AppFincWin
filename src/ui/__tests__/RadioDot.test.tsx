import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RadioDot } from '../RadioDot';

jest.setTimeout(20000);

const opts = { includeHiddenElements: true };

async function setup() {
  return render(
    <ThemeProvider>
      <RadioDot selected />
      <RadioDot selected={false} />
    </ThemeProvider>,
  );
}

describe('RadioDot', () => {
  it('draws the inner fill only when selected', async () => {
    const { queryAllByTestId } = await setup();
    expect(queryAllByTestId('radio-dot-fill', opts)).toHaveLength(1);
    expect(queryAllByTestId('radio-dot', opts)).toHaveLength(2);
  });

  it('rings in the accent when selected and inkFaint when not', async () => {
    const { getAllByTestId, getByTestId } = await setup();
    const [on, off] = getAllByTestId('radio-dot', opts);
    const ringOn = StyleSheet.flatten(on?.props.style).borderColor;
    const ringOff = StyleSheet.flatten(off?.props.style).borderColor;
    const fill = StyleSheet.flatten(getByTestId('radio-dot-fill', opts).props.style).backgroundColor;
    expect(ringOn).toBe(fill);
    expect(ringOff).toBe('#767161');
    expect(ringOff).not.toBe(ringOn);
  });
});
