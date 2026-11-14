// 06.1-59 (G-10): the shared Why? link and More row. Both start closed, open in place on a press, say so in their expanded state,
// and read "Less" while open. No animation is involved, so Reduce Motion needs no branch.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { MoreRow } from '../MoreRow';
import { WhyLine } from '../WhyLine';

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const flatStyle = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('WhyLine', () => {
  it('starts closed: the link says Why?, the reason is hidden', async () => {
    await wrap(<WhyLine testID="w">Judged on what comes in.</WhyLine>);
    const link = screen.getByTestId('w');
    expect(link).toHaveTextContent('Why?');
    expect(link.props.accessibilityRole).toBe('button');
    expect(link.props.accessibilityState).toEqual({ expanded: false });
    expect(link.props.accessibilityHint).toBe('Shows the reason');
    expect(screen.queryByText('Judged on what comes in.')).toBeNull();
  });

  it('a press shows the reason below, the link reads Less, and a second press hides it again', async () => {
    await wrap(<WhyLine testID="w">Judged on what comes in.</WhyLine>);
    await fireEvent.press(screen.getByTestId('w'));
    expect(screen.getByText('Judged on what comes in.')).toBeTruthy();
    expect(screen.getByTestId('w')).toHaveTextContent('Less');
    expect(screen.getByTestId('w').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByTestId('w').props.accessibilityHint).toBeUndefined();
    await fireEvent.press(screen.getByTestId('w'));
    expect(screen.queryByText('Judged on what comes in.')).toBeNull();
  });

  it('draws content that is not a string as given, and is at least 44 pt tall', async () => {
    await wrap(
      <WhyLine>
        <Text testID="custom">Custom</Text>
      </WhyLine>,
    );
    const link = screen.getByTestId('why-line');
    const style = flatStyle(typeof link.props.style === 'function' ? link.props.style({ pressed: false }) : link.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(space.touchMin);
    await fireEvent.press(link);
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(screen.getByTestId('why-line-body')).toBeTruthy();
  });
});

describe('MoreRow', () => {
  it('starts closed with More and a down chevron; a press opens it with Less and an up chevron', async () => {
    await wrap(<MoreRow testID="m">Records up to Nov 5.</MoreRow>);
    const row = screen.getByTestId('m');
    expect(row).toHaveTextContent('More');
    expect(row.props.accessibilityState).toEqual({ expanded: false });
    expect(row.props.accessibilityHint).toBe('Shows more detail');
    expect(screen.getByTestId('m-chevron-down')).toBeTruthy();
    expect(screen.queryByText('Records up to Nov 5.')).toBeNull();

    await fireEvent.press(row);
    expect(screen.getByText('Records up to Nov 5.')).toBeTruthy();
    expect(screen.getByTestId('m')).toHaveTextContent('Less');
    expect(screen.getByTestId('m').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByTestId('m-chevron-up')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('m'));
    expect(screen.queryByText('Records up to Nov 5.')).toBeNull();
  });

  it('keeps a caller label in both states and is at least 44 pt tall', async () => {
    await wrap(<MoreRow label="How this was worked out">Body</MoreRow>);
    const row = screen.getByTestId('more-row');
    expect(row).toHaveTextContent('How this was worked out');
    const style = flatStyle(typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(space.touchMin);
    await fireEvent.press(row);
    expect(screen.getByTestId('more-row')).toHaveTextContent('How this was worked out');
    expect(screen.getByText('Body')).toBeTruthy();
  });
});
