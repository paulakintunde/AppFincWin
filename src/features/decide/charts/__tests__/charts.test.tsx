import 'react-native-gesture-handler/jestSetup';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { CashPathReport, MinorUnits, NetWorthPath } from '@/engine/decide';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import { CashPathChart, type ChartMoney } from '../CashPathChart';
import { NetWorthChart } from '../NetWorthChart';

jest.setTimeout(30000);

const m = (n: number) => n as MinorUnits;
const whole: ChartMoney = { formatMoney: (a) => `$${Math.round(a / 100)}` };
const formatDate = (d: string) => d;

const without = Array.from({ length: 91 }, (_, i) => m(300_000 - i * 1_000));
const withP = Array.from({ length: 91 }, (_, i) => m(250_000 - i * 3_000));
function report(lowestAmount: number): CashPathReport {
  return {
    status: 'available',
    withoutPurchase: without,
    withPurchase: withP,
    lowestWithout: { day: 90, date: '2026-12-30', amount: m(210_000) },
    lowestWith: { day: 90, date: '2026-12-30', amount: m(lowestAmount) },
    tightBeforePayday: null,
  };
}

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
const argb = (hex: string) => parseInt('FF' + hex.slice(1), 16);
function nodes(tree: unknown, type: string): Node[] {
  const out: Node[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== 'object') return;
    const node = n as Node;
    if (node.type === type) out.push(node);
    node.children?.forEach(walk);
  };
  walk(tree);
  return out;
}
const colorOf = (n: Node, key: 'fill' | 'stroke') => (n.props[key] as { payload: number } | null)?.payload;

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('CashPathChart', () => {
  it('is one accessible image labelled with the text alternative, also shown as text', async () => {
    const { getByRole, getAllByText } = await wrap(
      <CashPathChart report={report(-5_000)} reserve={m(100_000)} whole={whole} formatDate={formatDate} />
    );
    const label = 'Lowest with this: $-50 on 2026-12-30. Lowest without: $2100 on 2026-12-30.';
    expect(getByRole('image').props.accessibilityLabel).toBe(label);
    expect(getAllByText(label).length).toBeGreaterThan(0);
  });

  it('draws legend words, axis labels and both dash styles', async () => {
    const { getByText, toJSON } = await wrap(
      <CashPathChart report={report(100_000)} reserve={m(100_000)} whole={whole} formatDate={formatDate} />
    );
    for (const s of ['With this', 'Without', 'Today', '+30 d', '+60 d', '+90 d', '0']) expect(getByText(s)).toBeTruthy();
    const paths = nodes(toJSON(), 'RNSVGPath');
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.props.strokeDasharray)).toEqual([['4', '4'], undefined]);
    expect(paths.map((p) => colorOf(p, 'stroke'))).toEqual([argb(colors.inkSoft1), argb(colors.ink)]);
    const hollow = nodes(toJSON(), 'RNSVGCircle').find((c) => c.props.r === 5);
    expect(hollow?.props.fill).toBeNull();
  });

  it('WR-D07: a short path is labelled with the days it shows, and a one-point path draws nothing', async () => {
    const short = (n: number): CashPathReport => ({
      status: 'available',
      tightBeforePayday: null,
      withoutPurchase: without.slice(0, n),
      withPurchase: withP.slice(0, n),
      lowestWith: { day: n - 1, date: '2026-10-03', amount: m(100_000) },
      lowestWithout: { day: n - 1, date: '2026-10-03', amount: m(200_000) },
    });
    const three = await wrap(<CashPathChart report={short(3)} reserve={m(0)} whole={whole} formatDate={formatDate} />);
    for (const s of ['Today', '+1 d', '+2 d']) expect(three.getByText(s)).toBeTruthy();
    expect(three.queryByText('+30 d')).toBeNull();
    await three.unmount();
    const one = await wrap(<CashPathChart report={short(1)} reserve={m(0)} whole={whole} formatDate={formatDate} />);
    expect(one.toJSON()).toBeNull();
  });

  it('colours the marker danger below zero, warn1 below the cushion and ink otherwise', async () => {
    const markFill = async (amount: number, reserve: number) => {
      const r = await wrap(
        <CashPathChart report={report(amount)} reserve={m(reserve)} whole={whole} formatDate={formatDate} />
      );
      const dot = nodes(r.toJSON(), 'RNSVGCircle').find((c) => c.props.r === 6);
      const fill = colorOf(dot as Node, 'fill');
      await r.unmount();
      return fill;
    };
    expect(await markFill(-1, 100_000)).toBe(argb(colors.danger));
    expect(await markFill(50_000, 100_000)).toBe(argb(colors.warn1));
    expect(await markFill(150_000, 0)).toBe(argb(colors.ink));
  });

  it('draws the cushion line only when a cushion exists', async () => {
    const dashedLines = (reserve: number) =>
      wrap(<CashPathChart report={report(1)} reserve={m(reserve)} whole={whole} formatDate={formatDate} />).then(async (r) => {
        const lines = nodes(r.toJSON(), 'RNSVGLine').filter((l) => colorOf(l, 'stroke') === argb(colors.warn1));
        await r.unmount();
        return lines.length;
      });
    expect(await dashedLines(100_000)).toBe(1);
    expect(await dashedLines(0)).toBe(0);
  });

  it('shows a readout only after a pan', async () => {
    const { queryByText, getByText } = await wrap(
      <CashPathChart report={report(1)} reserve={m(0)} whole={whole} formatDate={formatDate} />
    );
    expect(queryByText(/ with, /)).toBeNull();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('cash-path-scrub'), [
        { state: State.BEGAN, x: 36, translationX: 0 },
        { state: State.ACTIVE, x: 36, translationX: 10 },
        { state: State.ACTIVE, x: 322, translationX: 280 },
        { state: State.END, x: 322, translationX: 280 },
      ]);
    });
    expect(getByText('2026-12-30: $-200 with, $2100 without')).toBeTruthy();
  });

  it('renders nothing when the report is unavailable', async () => {
    const { toJSON } = await wrap(
      <CashPathChart
        report={{ status: 'unavailable', code: 'cash_path_unavailable' }}
        reserve={m(0)}
        whole={whole}
        formatDate={formatDate}
      />
    );
    expect(toJSON()).toBeNull();
  });
});

describe('NetWorthChart', () => {
  const nw = (over: Partial<NetWorthPath> = {}): NetWorthPath =>
    ({
      rate: { basisPoints: 500 } as never,
      withoutPurchase: [m(100_000), m(110_000), m(120_000), m(130_000), m(140_000)],
      withPurchase: [m(90_000), m(95_000), m(100_000), m(105_000), m(110_000)],
      rangeCode: null,
      ...over,
    }) as NetWorthPath;

  it('draws both lines, end labels, quarter ticks and the alternative', async () => {
    const { getByRole, getByText, getAllByText, toJSON } = await wrap(
      <NetWorthChart path={nw()} horizonMonths={4} rateLabel="5" whole={whole} />
    );
    const alt = 'After 4 months: $1100 with this, $1400 without, at 5%.';
    expect(getByRole('image').props.accessibilityLabel).toBe(alt);
    expect(getAllByText(alt).length).toBeGreaterThan(0);
    expect(getByText('Without: $1400')).toBeTruthy();
    expect(getByText('With this: $1100')).toBeTruthy();
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('4 mo')).toBeTruthy(); // WR-D08: the month index carries its unit
    const paths = nodes(toJSON(), 'RNSVGPath');
    expect(paths.map((p) => p.props.strokeDasharray)).toEqual([['4', '4'], undefined]);
  });

  it('an out-of-range path draws its in-range part and says so', async () => {
    const part = nw({
      rangeCode: 'exceeds_range',
      withoutPurchase: [m(100_000), m(110_000), null, null, null],
      withPurchase: [m(90_000), m(95_000), m(99_000), null, null],
    });
    const { getByRole, getAllByText, getAllByText: all } = await wrap(
      <NetWorthChart path={part} horizonMonths={4} rateLabel="9" whole={whole} />
    );
    const alt = 'After 4 months the path is too large to project at 9%.';
    expect(getByRole('image').props.accessibilityLabel).toBe(alt);
    expect(getAllByText(alt).length).toBeGreaterThan(0);
    expect(all('Without: Too large to project at this rate').length).toBe(1);
    expect(all('With this: Too large to project at this rate').length).toBe(1);
  });

  it('with every point out of range shows only the sentence', async () => {
    const none = nw({
      rangeCode: 'exceeds_range',
      withoutPurchase: [null, null],
      withPurchase: [null, null],
    });
    const { queryByRole, getByText } = await wrap(
      <NetWorthChart path={none} horizonMonths={2} rateLabel="9" whole={whole} />
    );
    expect(queryByRole('image')).toBeNull();
    expect(getByText('After 2 months the path is too large to project at 9%.')).toBeTruthy();
  });

  it('when only the first line is out of range at its end it still labels the other', async () => {
    const mixed = nw({
      rangeCode: 'exceeds_range',
      withoutPurchase: [m(100_000), null],
      withPurchase: [m(90_000), m(95_000)],
    });
    const { getByText } = await wrap(<NetWorthChart path={mixed} horizonMonths={1} rateLabel="9" whole={whole} />);
    expect(getByText('With this: $950')).toBeTruthy();
    expect(getByText('Without: Too large to project at this rate')).toBeTruthy();
  });

  it('WR-D08: one line all out of range without the range code never leaves an empty slot in the alt text', async () => {
    const gap = nw({ withoutPurchase: [null, null], withPurchase: [m(90_000), m(95_000)] });
    const { getByRole } = await wrap(<NetWorthChart path={gap} horizonMonths={1} rateLabel="5" whole={whole} />);
    expect(getByRole('image').props.accessibilityLabel).toBe(
      'After 1 months: $950 with this, Too large to project at this rate without, at 5%.'
    );
  });
});

describe('tokens only, no animation', () => {
  it.each(['CashPathChart.tsx', 'NetWorthChart.tsx'])('%s has no colour literal and no animation', (file) => {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(src).not.toMatch(/Animated|withTiming|useSharedValue/);
  });
});

