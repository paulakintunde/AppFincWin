import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors as base, warnTint } from '@/theme/tokens';
import { ConfidenceChip } from '../ConfidenceChip';
import { EdgeTag } from '../EdgeTag';
import { CombineToggle } from '../CombineToggle';
import { GoalProgress, wholePercent } from '../GoalProgress';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { CurrencyCode } from '@/engine/decide';

jest.setTimeout(30000);
const ACCENT = '#1B4D3E'; // default accent from the theme provider

let mockReduced = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useReduceMotion: () => mockReduced,
}));

const mockSelection = jest.fn();
jest.mock('@/ui/haptics', () => ({ hapticSelection: () => mockSelection() }));

const style = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={1}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
}

describe('ConfidenceChip', () => {
  it.each([
    ['strong', 'Strong basis'],
    ['fair', 'Fair basis'],
    ['rough', 'Rough basis'],
  ] as const)('reads %s in words, named for the sheet, and presses', async (level, word) => {
    const onPress = jest.fn();
    const { getByText, getByLabelText } = await wrap(<ConfidenceChip level={level} onPress={onPress} />);
    expect(getByText(word)).toBeTruthy();
    const button = getByLabelText(`Basis: ${word}, tap for reasons`);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.hitSlop).toEqual({ top: 9, bottom: 9, left: 9, right: 9 });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the ochre pair for rough and an accent tint for strong', async () => {
    const rough = await wrap(<ConfidenceChip level="rough" onPress={() => undefined} />);
    expect(style(rough.getByText('Rough basis').parent as never).color ?? style(rough.getByText('Rough basis')).color).toBe(base.warn1);
    expect(style(rough.getByText('Rough basis').parent as never).backgroundColor).toBe(warnTint);
    await rough.unmount();
    const strong = await wrap(<ConfidenceChip level="strong" onPress={() => undefined} />);
    expect(strong.getByTestId('accent-tint')).toBeTruthy();
  });
});

describe('EdgeTag', () => {
  it('renders the words as a plain pill, not a button', async () => {
    const { getByText, queryByRole } = await wrap(<EdgeTag />);
    expect(getByText('On the edge')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
    expect(style(getByText('On the edge').parent as never).backgroundColor).toBe(warnTint);
  });
});

describe('CombineToggle', () => {
  beforeEach(() => mockSelection.mockClear());

  it('is a switch that flips, fires the selection haptic once, and shows the state dot', async () => {
    const onChange = jest.fn();
    const off = await wrap(<CombineToggle value={false} onChange={onChange} />);
    const sw = off.getByLabelText('With my other open checks');
    expect(sw.props.accessibilityRole).toBe('switch');
    expect(sw.props.accessibilityState).toEqual({ checked: false });
    expect(style(off.getByTestId('combine-dot')).backgroundColor).toBe(base.line4);
    expect(off.getByText('With other checks')).toBeTruthy();
    await fireEvent.press(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(mockSelection).toHaveBeenCalledTimes(1);
    await off.unmount();
    const on = await wrap(<CombineToggle value onChange={onChange} />);
    expect(on.getByLabelText('With my other open checks').props.accessibilityState).toEqual({ checked: true });
    expect(style(on.getByTestId('combine-dot')).backgroundColor).toBe(ACCENT);
    await fireEvent.press(on.getByLabelText('With my other open checks'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe('wholePercent', () => {
  it('uses integer maths, caps at 100 and treats a missing target as zero', () => {
    expect(wholePercent(1, 3)).toBe(33);
    expect(wholePercent(2, 3)).toBe(66);
    expect(wholePercent(500, 400)).toBe(100);
    expect(wholePercent(100, 0)).toBe(0);
    expect(wholePercent(100, null)).toBe(0);
    expect(wholePercent(null, 100)).toBe(0);
  });

  it('WR-D09: a nearly saved goal past the safe-integer range is not empty', () => {
    const target = Number.MAX_SAFE_INTEGER;
    expect(wholePercent(target - 1, target)).toBe(99);
    expect(wholePercent(Math.floor(target / 2), target)).toBe(49);
  });
});

function Goal({ saved, target }: { saved: number | null; target: number | null }) {
  const whole = useMoneyFormatter(false);
  return <GoalProgress saved={saved} target={target} whole={whole} currency={'USD' as CurrencyCode} />;
}

describe('GoalProgress', () => {
  beforeEach(() => {
    mockReduced = false;
  });

  it('shows the caption and a percent value and sizes the fill from the ratio', async () => {
    mockReduced = true;
    const { getByTestId, getByText } = await wrap(<Goal saved={25000} target={100000} />);
    expect(getByText(/saved$/)).toBeTruthy();
    const track = getByTestId('goal-track');
    expect(track.props.accessibilityValue).toEqual({ text: '25 percent' });
    expect(style(track).height).toBe(8);
    expect(style(track).backgroundColor).toBe(base.fill1);
    expect(style(getByTestId('goal-fill')).width).toBe('25%');
    expect(style(getByTestId('goal-fill')).backgroundColor).toBe(ACCENT);
  });

  it('caps at full and shows an empty bar for no target', async () => {
    mockReduced = true;
    const full = await wrap(<Goal saved={300} target={100} />);
    expect(full.getByTestId('goal-track').props.accessibilityValue).toEqual({ text: '100 percent' });
    await full.unmount();
    const none = await wrap(<Goal saved={300} target={null} />);
    expect(none.getByTestId('goal-track').props.accessibilityValue).toEqual({ text: '0 percent' });
    // WR-D09: no target, so no "of 0"
    expect(none.queryByText(/ of /)).toBeNull();
    expect(none.getByText(/saved$/)).toBeTruthy();
  });

  it('says it is waiting for a rate when saved is null', async () => {
    mockReduced = true;
    const { getByText, getByTestId } = await wrap(<Goal saved={null} target={100000} />);
    expect(getByText('Waiting for a rate')).toBeTruthy();
    expect(style(getByTestId('goal-fill')).width).toBe('0%');
  });

  it('mounts with motion enabled', async () => {
    const { getByTestId } = await wrap(<Goal saved={50000} target={100000} />);
    expect(getByTestId('goal-fill')).toBeTruthy();
  });
});
