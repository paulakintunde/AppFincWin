// 08.1-24 (owner Q6 A, 2026-11-21): the "What this means" tip shows FincWin's own info glyph before its words. The glyph is
// decorative; the spoken label, the expanded state, the live region and the 44-pt target are unchanged from 08.1-23.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { ExplainTip } from '../ExplainTip';

jest.setTimeout(20000);
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticFailed: jest.fn(), hapticWarn: jest.fn() }));

const opts = { includeHiddenElements: true };
const NAME = 'A set spending split';
const TIP = 'Each person pays a fixed part.';

const setup = () =>
  render(
    <ThemeProvider>
      <ExplainTip name={NAME} text={TIP} testID="tip" />
    </ThemeProvider>,
  );

describe('ExplainTip info glyph (08.1-24 Q6 A)', () => {
  it('shows the info glyph before the words, decorative', async () => {
    await setup();
    const icon = screen.getByTestId('tip-icon', opts);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.accessibilityLabel).toBeUndefined();
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByText('What this means')).toBeTruthy();
    // icon first, then the words, in one row
    let node = icon.parent;
    let rowFound = false;
    while (node && !rowFound) {
      rowFound = (StyleSheet.flatten(node.props.style) ?? {}).flexDirection === 'row';
      node = node.parent;
    }
    expect(rowFound).toBe(true);
  });

  it('keeps the spoken label, expanded state, live region and touch target', async () => {
    await setup();
    const button = screen.getByTestId('tip');
    expect(button.props.accessibilityLabel).toBe(`What ${NAME} means`);
    expect(button.props.accessibilityState).toMatchObject({ expanded: false });
    const style = StyleSheet.flatten(typeof button.props.style === 'function' ? button.props.style({ pressed: false }) : button.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(space.touchMin);
    await fireEvent.press(button);
    expect(screen.getByTestId('tip').props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByTestId('tip-text').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText(TIP)).toBeTruthy();
    expect(screen.getByTestId('tip-icon', opts)).toBeTruthy();
  });
});
