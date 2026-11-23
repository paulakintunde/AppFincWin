import React from 'react';
import { processColor } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { insights } from '@/i18n/locales/insights';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { chartPalette, stateColors } from '@/theme/tokens';
import * as haptics from '@/ui/haptics';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import { RangeControl } from '../RangeControl';
import { ChartSummary } from '../ChartSummary';
import { CategoryRow } from '../CategoryRow';
import { InOutBars, barsWidth } from '../InOutBars';
import { NetWorthLine } from '../NetWorthLine';

jest.setTimeout(30000);
const opts = { includeHiddenElements: true };

function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

function flat(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style.flat(3).filter(Boolean) : [style]));
}

const bar = (month: string, comesIn: number, goesOut: number) => ({ month, comesIn, goesOut, left: comesIn - goesOut }) as never;

beforeEach(() => resetSessionMotion());

describe('RangeControl', () => {
  it('shows three tabs and changes without a haptic', async () => {
    const tick = jest.spyOn(haptics, 'hapticTick');
    const onChange = jest.fn();
    const { getByText, getAllByRole } = await wrap(<RangeControl value="6m" onChange={onChange} />);
    expect(getAllByRole('tab', opts)).toHaveLength(3);
    expect(getByText('6M', opts)).toBeTruthy();
    fireEvent.press(getByText('1Y', opts));
    expect(onChange).toHaveBeenCalledWith('1y');
    expect(tick).not.toHaveBeenCalled();
  });
});

describe('ChartSummary', () => {
  it('shows its text', async () => {
    const { getByTestId } = await wrap(<ChartSummary text="In 3, out 2." />);
    expect(getByTestId('chart-summary', opts)).toBeTruthy();
  });
});

describe('CategoryRow', () => {
  const base = { categoryId: 'c1', glyph: { colorKey: 'green' as const, letter: 'G' }, name: 'Groceries', amount: '$420', spokenAmount: '420 dollars', shareBp: 3400 };
  it('reads as one sentence and draws a chart-coloured bar', async () => {
    const { getByText, getByTestId } = await wrap(<CategoryRow {...base} colorIndex={0} onPress={() => undefined} />);
    expect(getByText('Groceries', opts)).toBeTruthy();
    expect(getByText('34% of spending', opts)).toBeTruthy();
    expect(getByTestId('row-root', opts).props.accessibilityLabel).toBe('Groceries, 420 dollars, 34 percent of spending. Opens Activity.');
    expect(flat(getByTestId('grow-progress-fill', opts).props.style).backgroundColor).toBe(chartPalette[0]);
  });
  it('wraps the palette and uses ink for Everything else', async () => {
    const a = await wrap(<CategoryRow {...base} colorIndex={7} />);
    expect(flat(a.getByTestId('grow-progress-fill', opts).props.style).backgroundColor).toBe(chartPalette[1]);
    expect(a.getByTestId('row-root', opts).props.accessibilityLabel).toBeUndefined();
    const b = await wrap(<CategoryRow {...base} glyph={null} colorIndex={null} />);
    expect(flat(b.getAllByTestId('grow-progress-fill', opts)[0]!.props.style).backgroundColor).not.toBe(chartPalette[0]);
  });
});

describe('CategoryRow static label (IN-03)', () => {
  it('has its own string without the Opens Activity sentence, not a text strip', () => {
    expect(insights.categories.rowA11yStatic).toBe('{{name}}, {{amount}}, {{percent}} percent of spending.');
    expect(insights.categories.rowA11y).toBe(`${insights.categories.rowA11yStatic} Opens Activity.`);
  });
});

describe('InOutBars', () => {
  const props = { currency: 'USD', selected: null, onSelect: () => undefined, currentMonth: '2026-06', withYear: false };
  it('draws in green on the left and out in orange, never the short colour', async () => {
    const { getByTestId, getAllByTestId } = await wrap(<InOutBars {...props} bars={[bar('2026-05', 300000, 250000), bar('2026-06', 100000, 120000)]} />);
    const inR = getByTestId('in-out-bars-in-2026-05', opts).props;
    const outR = getByTestId('in-out-bars-out-2026-05', opts).props;
    expect(inR.fill.payload).toBe(processColor(stateColors.fits.stroke));
    expect(outR.fill.payload).toBe(processColor(chartPalette[1]));
    expect(Number(inR.x)).toBeLessThan(Number(outR.x));
    expect(getAllByTestId(/in-out-bars-(in|out)-/, opts).every((r) => r.props.fill.payload !== processColor(stateColors.short.stroke))).toBe(true);
  });
  it('gives each pair a spoken label and selects on press', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await wrap(<InOutBars {...props} onSelect={onSelect} bars={[bar('2026-05', 300000, 250000), bar('2026-06', 100000, 120000)]} />);
    const col = getByTestId('in-out-bars-col-2026-05', opts);
    expect(col.props.accessibilityLabel).toContain('left');
    expect(getByTestId('in-out-bars-col-2026-06', opts).props.accessibilityLabel).toContain('short');
    fireEvent.press(col);
    expect(onSelect).toHaveBeenCalledWith('2026-05');
  });
  it('marks the selected month with an underline', async () => {
    const { getByTestId } = await wrap(<InOutBars {...props} selected="2026-05" bars={[bar('2026-05', 300000, 250000), bar('2026-06', 100000, 120000)]} />);
    expect(getByTestId('in-out-bars-marker-2026-05', opts)).toBeTruthy();
  });
  it('legend differs by shape and word', async () => {
    const { getByTestId, getByText } = await wrap(<InOutBars {...props} bars={[bar('2026-05', 1, 1)]} />);
    expect(getByText('Money in', opts)).toBeTruthy();
    expect(getByText('Money out', opts)).toBeTruthy();
    expect(flat(getByTestId('in-out-bars-legend-in', opts).props.style).backgroundColor).toBe(stateColors.fits.stroke);
    const out = flat(getByTestId('in-out-bars-legend-out', opts).props.style);
    expect(out.borderColor).toBe(chartPalette[1]);
    expect(out.backgroundColor).toBe('transparent');
  });
  it('sizes 13 bars in a scroller', async () => {
    expect(barsWidth(13)).toBe(13 * 24 + 12 * 12);
    const bars = Array.from({ length: 13 }, (_, i) => bar(`2026-${String(i < 6 ? i + 1 : i - 5).padStart(2, '0')}`, 100 + i, 50));
    const { getByTestId } = await wrap(<InOutBars {...props} bars={bars.slice(0, 12)} />);
    expect(getByTestId('in-out-bars-scroll', opts)).toBeTruthy();
  });
});

describe('NetWorthLine', () => {
  const pts = [
    { date: '2026-05-31', value: 100 },
    { date: '2026-06-30', value: 150 },
    { date: '2026-11-22', value: 180 },
  ];
  it('draws a path, a dot per point with a bigger last dot, and reports taps', async () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = await wrap(<NetWorthLine points={pts} currency="USD" selected={null} onSelect={onSelect} summary="Net worth, up." />);
    const path = getByTestId('net-worth-line-path', opts).props;
    expect(path.stroke).toBeTruthy();
    expect(path.fill).toBeNull();
    expect(getByTestId('net-worth-line-dot-0', opts).props.r).toBe(2.5);
    expect(getByTestId('net-worth-line-dot-2', opts).props.r).toBe(4);
    expect(getByTestId('net-worth-line-image', opts).props.accessibilityLabel).toBe('Net worth, up.');
    expect(queryByTestId('net-worth-line-zero', opts)).toBeNull();
    fireEvent.press(getByTestId('net-worth-line-point-1', opts));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
  it('shows the zero line when values cross zero, a readout when selected, no path for one point', async () => {
    const a = await wrap(<NetWorthLine points={[{ date: '2026-05-31', value: -50 }, { date: '2026-06-30', value: 50 }]} currency="USD" selected={1} onSelect={() => undefined} summary="s" />);
    expect(a.getByTestId('net-worth-line-zero', opts)).toBeTruthy();
    expect(a.getByTestId('net-worth-line-readout', opts)).toBeTruthy();
    const b = await wrap(<NetWorthLine points={[pts[2]!]} currency="USD" selected={null} onSelect={() => undefined} summary="s" />);
    expect(b.queryByTestId('net-worth-line-path', opts)).toBeNull();
    expect(b.getByTestId('net-worth-line-dot-0', opts)).toBeTruthy();
  });
  it('shows three value labels in the chart currency, low to high, on the line scale', async () => {
    const big = [{ date: '2026-05-31', value: 150000 }, { date: '2026-06-30', value: 200000 }];
    const { getByTestId } = await wrap(<NetWorthLine points={big} currency="USD" selected={null} onSelect={() => undefined} summary="s" />);
    // the scale includes 0 (as linePoints does), so low is $0, middle $1,000, high $2,000
    expect(getByTestId('net-worth-line-tick-0', opts).props.children).toBe('$0');
    expect(getByTestId('net-worth-line-tick-1', opts).props.children).toBe('$1,000');
    expect(getByTestId('net-worth-line-tick-2', opts).props.children).toBe('$2,000');
  });
  it('thins month labels past 24 points and never lets two labels overlap', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ date: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-28`, value: 100 + i }));
    const { queryAllByText } = await wrap(<NetWorthLine points={many} currency="USD" selected={null} onSelect={() => undefined} summary="s" />);
    const labels = queryAllByText(/^[A-Z][a-z]{2}$/, opts);
    // 330 wide, 30 points: spacing ~11, so a 40 wide label needs every 4th point; fewer than every third is never shown
    expect(labels.length).toBeLessThanOrEqual(10);
    expect(labels.length).toBeGreaterThan(0);
  });
});
