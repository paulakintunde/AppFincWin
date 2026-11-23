import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { StatTile, StatTileRow, VALUE_MIN_SCALE, figureTooWideForHalf } from '@/ui/StatTile';
import { Row } from '@/ui/Row';
import { ProgressBar } from '@/ui/ProgressBar';
import { hapticTick } from '@/ui/haptics';
import { categorySwatch, chartPalette } from '@/theme/tokens';

jest.setTimeout(120000);

jest.mock('@/ui/haptics', () => ({ ...jest.requireActual('@/ui/haptics'), hapticTick: jest.fn() }));
let mockStack = false;
jest.mock('@/ui/textFit', () => ({ ...jest.requireActual('@/ui/textFit'), useShouldStack: () => mockStack }));
jest.mock('@/theme/motion', () => ({ ...jest.requireActual('@/theme/motion'), useReduceMotion: () => true }));

const opts = { includeHiddenElements: true };

async function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const options = [
  { key: 'a', label: 'One' },
  { key: 'b', label: 'Two' },
];

describe('07-06 SegmentedControl haptic', () => {
  beforeEach(() => {
    (hapticTick as jest.Mock).mockClear();
  });
  it('ticks by default', async () => {
    const onChange = jest.fn();
    const { getAllByRole } = await wrap(<SegmentedControl options={options} value="a" onChange={onChange} accessibilityLabel="Pick" />);
    fireEvent.press(getAllByRole('tab', opts)[1]!);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(hapticTick).toHaveBeenCalledTimes(1);
  });
  it('does not tick with haptic={false} but still changes', async () => {
    const onChange = jest.fn();
    const { getAllByRole } = await wrap(<SegmentedControl options={options} value="a" onChange={onChange} accessibilityLabel="Pick" haptic={false} />);
    fireEvent.press(getAllByRole('tab', opts)[1]!);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(hapticTick).not.toHaveBeenCalled();
  });
});

describe('07-06 StatTileRow columns', () => {
  const tiles = [1, 2, 3].map((n) => <StatTile key={n} label={`L${n}`} value={`V${n}`} />);
  beforeEach(() => {
    mockStack = false;
  });
  it('holds at most two tiles by default', async () => {
    const { getAllByTestId } = await wrap(<StatTileRow>{tiles}</StatTileRow>);
    expect(getAllByTestId('stat-tile-cell', opts)).toHaveLength(2);
  });
  it('holds three with columns={3}', async () => {
    const { getAllByTestId } = await wrap(<StatTileRow columns={3}>{tiles}</StatTileRow>);
    expect(getAllByTestId('stat-tile-cell', opts)).toHaveLength(3);
  });
  it('stacks all three when text is large', async () => {
    mockStack = true;
    const { getAllByTestId, getByTestId } = await wrap(<StatTileRow columns={3}>{tiles}</StatTileRow>);
    expect(getAllByTestId('stat-tile-cell', opts)).toHaveLength(3);
    expect(StyleSheet.flatten(getByTestId('stat-tile-row', opts).props.style).flexDirection).toBe('column');
  });
});

// Pixel 9 fix: the In / Out / Left figures broke mid-number three across ("$5,4 / 88.9 / 0").
describe('In / Out / Left figures stay whole', () => {
  const layout = (w: number) => ({ nativeEvent: { layout: { width: w, height: 100, x: 0, y: 0 } } });
  const three = (a: string, b: string, c: string) => (
    <StatTileRow columns={3}>
      <StatTile label="In" value={a} />
      <StatTile label="Out" value={b} />
      <StatTile label="Left" value={c} />
    </StatTileRow>
  );
  beforeEach(() => {
    mockStack = false;
  });

  it('each figure is one line that shrinks to fit, never below the 0.8 floor', async () => {
    const { getAllByTestId } = await wrap(three('$5,488.90', '$154.03', '$5,334.87'));
    for (const v of getAllByTestId('stat-tile-value', opts)) {
      expect(v.props.numberOfLines).toBe(1);
      expect(v.props.adjustsFontSizeToFit).toBe(true);
      expect(v.props.minimumFontScale).toBe(VALUE_MIN_SCALE);
    }
    expect(VALUE_MIN_SCALE).toBeGreaterThanOrEqual(0.8);
  });

  it('at about 411 wide sets In and Out side by side and Left full width under them', async () => {
    const { getByTestId, getAllByTestId } = await wrap(three('$5,488.90', '$154.03', '$5,334.87'));
    await fireEvent(getByTestId('stat-tile-row', opts), 'layout', layout(335));
    const pair = getByTestId('stat-tile-pair', opts);
    expect(StyleSheet.flatten(pair.props.style).flexDirection).toBe('row');
    const cells = getAllByTestId('stat-tile-cell', opts);
    expect(cells).toHaveLength(3);
    expect(StyleSheet.flatten(cells[2]!.props.style ?? {}).flex).toBeUndefined();
  });

  it('stacks one per line when a figure would not fit half the row, rather than shrinking it further', async () => {
    const { getByTestId, queryByTestId } = await wrap(three('-CA$12,345.67', 'CA$0', '-CA$50'));
    await fireEvent(getByTestId('stat-tile-row', opts), 'layout', layout(335));
    expect(queryByTestId('stat-tile-pair', opts)).toBeNull();
    expect(StyleSheet.flatten(getByTestId('stat-tile-row', opts).props.style).flexDirection).toBe('column');
  });

  it('stacks one per line at 320 wide or 2.0x text (rule S)', async () => {
    mockStack = true;
    const { getByTestId, queryByTestId } = await wrap(three('$5', '$1', '$4'));
    expect(queryByTestId('stat-tile-pair', opts)).toBeNull();
    expect(StyleSheet.flatten(getByTestId('stat-tile-row', opts).props.style).flexDirection).toBe('column');
  });

  it('the half-row estimate: a short figure fits at 411, a long one or a narrow row does not', () => {
    expect(figureTooWideForHalf('$5,488.90'.length, 335, 1)).toBe(false);
    expect(figureTooWideForHalf('-CA$12,345.67'.length, 335, 1)).toBe(true);
    expect(figureTooWideForHalf('$5,488.90'.length, 320 - 76, 1)).toBe(true);
    expect(figureTooWideForHalf('$5,488.90'.length, 335, 1.3)).toBe(true);
  });
});

describe('07-06 Row footer', () => {
  it('renders the footer under the text', async () => {
    const { getByTestId, getByText } = await wrap(<Row label="Food" amount="$10" footer={<View testID="row-footer" />} />);
    expect(getByTestId('row-footer', opts)).toBeTruthy();
    expect(getByText('Food', opts)).toBeTruthy();
  });
  it('renders nothing extra without a footer', async () => {
    const { queryByTestId } = await wrap(<Row label="Food" amount="$10" />);
    expect(queryByTestId('row-footer-slot', opts)).toBeNull();
  });
});

describe('07-06 ProgressBar chartColor', () => {
  const fillOf = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) as { backgroundColor: string }).backgroundColor;
  it('uses the chart colour whatever the tone says', async () => {
    const { getByTestId } = await wrap(<ProgressBar percent={50} tone="ink" chartColor={chartPalette[3]} animate={false} />);
    expect(fillOf(getByTestId('grow-progress-fill', opts))).toBe(chartPalette[3]);
  });
  it('keeps the tone fills without chartColor', async () => {
    const blue = await wrap(<ProgressBar percent={50} tone="blue" animate={false} />);
    expect(fillOf(blue.getByTestId('grow-progress-fill', opts))).toBe(categorySwatch.blue.color);
  });
});
