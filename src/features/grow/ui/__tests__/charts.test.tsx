import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { BarChart } from '../BarChart';
import { LineChart, linePath } from '../LineChart';
import { StackedBar, wholePercents } from '../StackedBar';

jest.setTimeout(30000);

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

describe('wholePercents', () => {
  it('always sums to 100', () => {
    expect(wholePercents([84, 16])).toEqual([84, 16]);
    expect(wholePercents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(wholePercents([0, 0])).toEqual([0, 0]);
  });
});

describe('StackedBar', () => {
  it('shows the legend text and one chart-level label', async () => {
    const { getByText, getByTestId, getAllByTestId } = await wrap(
      <StackedBar
        segments={[
          { key: 'ret', value: 8400, swatch: 'green' },
          { key: 'bro', value: 1600, swatch: 'blue' },
        ]}
        legend="Retirement 84% · Brokerage 16%"
        accessibilityLabel="Where your investments sit: Retirement 84%, Brokerage 16%"
      />,
    );
    expect(getByText('Retirement 84% · Brokerage 16%', opts)).toBeTruthy();
    expect(getByTestId('stacked-bar', opts).props.accessibilityLabel).toContain('Retirement 84%');
    expect(getAllByTestId(/stacked-seg-/, opts)).toHaveLength(2);
  });
});

describe('LineChart', () => {
  it('draws one path for many points with the label carrying the end value', async () => {
    const { getByTestId } = await wrap(<LineChart points={[0, 100, 250]} accessibilityLabel="Grows to $2.50 by 2030" />);
    expect(getByTestId('line-chart', opts).props.accessibilityLabel).toContain('$2.50');
    expect(getByTestId('line-chart-path', opts)).toBeTruthy();
  });

  it('draws a dot for a single point and nothing for none', async () => {
    const one = await wrap(<LineChart points={[500]} accessibilityLabel="One point" />);
    expect(one.getByTestId('line-chart-dot', opts)).toBeTruthy();
    await one.unmount();
    const none = await wrap(<LineChart points={[]} accessibilityLabel="None" />);
    expect(none.queryByTestId('line-chart', opts)).toBeNull();
    expect(linePath([5], 300, 100)).toBe('');
  });
});

describe('BarChart', () => {
  it('has a chart-level label with the end figure and put-in amount, and both legends', async () => {
    const { getByTestId, getByText, getAllByTestId } = await wrap(
      <BarChart
        bars={[
          { key: 'y1', putIn: 1000, growth: 50 },
          { key: 'y2', putIn: 2000, growth: 200 },
        ]}
        putInLegend="What you put in"
        growthLegend="Growth"
        accessibilityLabel="Ends at $2,200, of which you put in $2,000"
      />,
    );
    const label = getByTestId('bar-chart', opts).props.accessibilityLabel as string;
    expect(label).toContain('$2,200');
    expect(label).toContain('$2,000');
    expect(getByText('What you put in', opts)).toBeTruthy();
    expect(getByText('Growth', opts)).toBeTruthy();
    expect(getAllByTestId(/bar-putin-/, opts)).toHaveLength(2);
  });
});

describe('no animation loop', () => {
  it.each(['StackedBar', 'LineChart', 'BarChart'])('%s has no loop or timer', (name) => {
    const src = fs.readFileSync(path.join(__dirname, '..', `${name}.tsx`), 'utf8');
    expect(src).not.toMatch(/withRepeat|setInterval|requestAnimationFrame|useReduceMotion/);
  });
});
