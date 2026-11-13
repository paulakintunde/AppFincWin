import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Chip } from '../Chip';

jest.setTimeout(30000);

describe('Chip', () => {
  it('exposes the host Pressable through pressableRef', async () => {
    const ref = React.createRef<React.ComponentRef<typeof import('react-native').View>>();
    await render(
      <ThemeProvider>
        <Chip label="Food" pressableRef={ref} />
      </ThemeProvider>
    );
    expect(ref.current).toBeTruthy();
  });

  it('renders the accent tint only when selected', async () => {
    const a = await render(
      <ThemeProvider>
        <Chip label="Food" />
      </ThemeProvider>
    );
    expect(a.queryByTestId('accent-tint')).toBeNull();
    const b = await render(
      <ThemeProvider>
        <Chip label="Food" selected />
      </ThemeProvider>
    );
    expect(b.getByTestId('accent-tint')).toBeTruthy();
  });
});

describe('Chip dark tone', () => {
  const INK = '#14150F';
  const SURFACE = '#FFFFFF';
  const SOFT1 = '#A8A79C';
  const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

  it('D-95 dark chips use the ink-card tokens', async () => {
    const idle = await render(
      <ThemeProvider>
        <Chip label="12 months" tone="dark" />
      </ThemeProvider>
    );
    expect(flat(idle.getByText('12 months')).color).toBe(SOFT1);
    expect(idle.getByTestId('dark-tint')).toBeTruthy();
    expect(idle.queryByTestId('accent-tint')).toBeNull();
    const picked = await render(
      <ThemeProvider>
        <Chip label="24 months" tone="dark" selected />
      </ThemeProvider>
    );
    expect(flat(picked.getByText('24 months')).color).toBe(INK);
    expect(flat(picked.getByLabelText('24 months')).backgroundColor).toBe(SURFACE);
    expect(picked.queryByTestId('accent-tint')).toBeNull();
  });
});

describe('Chip press feedback (06.1-62)', () => {
  it('keeps the resting look: fill1 background, no dim until pressed, presses still reach onPress', async () => {
    const onPress = jest.fn();
    const s = await render(
      <ThemeProvider>
        <Chip label="Food" onPress={onPress} />
      </ThemeProvider>
    );
    const chip = s.getByLabelText('Food');
    const style = StyleSheet.flatten(chip.props.style as never) as Record<string, unknown>;
    expect(style.backgroundColor).toBe('#F1EFE8');
    expect(style.minHeight).toBe(44);
    expect(style.opacity).toBeUndefined();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

