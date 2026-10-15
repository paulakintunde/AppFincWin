import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY } from '@/theme/layout';
import { HeaderIconButton } from '../HeaderIconButton';

jest.setTimeout(20000);

async function setup(badge?: number) {
  const onPress = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <HeaderIconButton glyph="filter" label="Filter, 2 active" badge={badge} onPress={onPress} testID="btn" />
    </ThemeProvider>,
  );
  return { ...utils, onPress };
}

describe('HeaderIconButton', () => {
  it('is a labelled button with a 36pt circle and 4pt hitSlop', async () => {
    const { getByRole } = await setup();
    const btn = getByRole('button', { name: 'Filter, 2 active' });
    const style = StyleSheet.flatten(btn.props.style);
    expect(style.width).toBe(36);
    expect(style.height).toBe(36);
    expect(btn.props.hitSlop).toBe(4);
  });

  it('dims to PRESSED_OPACITY while pressed', async () => {
    const { getByTestId } = await setup();
    const btn = getByTestId('btn');
    expect(StyleSheet.flatten(btn.props.style).opacity).toBe(1);
    await fireEvent(btn, 'responderGrant', { persist: () => {}, nativeEvent: { touches: [], changedTouches: [], identifier: 1, timestamp: 0 }, currentTarget: { measure: jest.fn() } });
    expect(StyleSheet.flatten(getByTestId('btn').props.style).opacity).toBe(PRESSED_OPACITY);
  });

  it('hides the badge when undefined or zero', async () => {
    const a = await setup();
    expect(a.queryByTestId('header-icon-badge', { includeHiddenElements: true })).toBeNull();
    await a.unmount();
    const b = await setup(0);
    expect(b.queryByTestId('header-icon-badge', { includeHiddenElements: true })).toBeNull();
  });

  it('shows the count, capping at 9+, hidden from screen readers', async () => {
    const a = await setup(2);
    const badge = a.getByTestId('header-icon-badge', { includeHiddenElements: true });
    expect(badge.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(badge.props.accessibilityElementsHidden).toBe(true);
    expect(a.getByText('2', { includeHiddenElements: true })).toBeTruthy();
    await a.unmount();
    const b = await setup(12);
    expect(b.getByText('9+', { includeHiddenElements: true })).toBeTruthy();
  });

  it('fires onPress once per press', async () => {
    const { getByRole, onPress } = await setup(1);
    await fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
