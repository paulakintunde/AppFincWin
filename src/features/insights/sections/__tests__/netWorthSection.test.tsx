import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { fontSize } from '@/theme/typography';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import type { NetWorthSeriesState } from '@/data/queries/insightsNetWorth';
import { NetWorthSectionView } from '../NetWorthSection';

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

const pt = (date: string, value: number) => ({ date, value, debtsHeldFlat: false, holdingsLeftOut: 0 });
const six = [
  pt('2026-05-31', 1420000),
  pt('2026-06-30', 1500000),
  pt('2026-07-31', 1600000),
  pt('2026-08-31', 1650000),
  pt('2026-09-30', 1700000),
  pt('2026-10-31', 1800000),
  pt('2026-11-22', 1840000),
];

function state(over: Partial<NetWorthSeriesState> = {}): NetWorthSeriesState {
  return {
    status: 'ready',
    points: six,
    current: 1840000,
    change: { from: 1420000, to: 1840000, change: 420000 },
    unconverted: 0,
    unconvertedAccounts: 0,
    unconvertedHoldings: 0,
    unconvertedDebts: 0,
    debtsHeldFlat: false,
    holdingsLeftOut: false,
    noAccounts: false,
    retry: jest.fn(),
    ...over,
  };
}

const view = (s: NetWorthSeriesState, p: Partial<React.ComponentProps<typeof NetWorthSectionView>> = {}) =>
  wrap(<NetWorthSectionView state={s} scope="mine" range="6m" currency="USD" onAddAccount={jest.fn()} {...p} />);

beforeEach(() => resetSessionMotion());

describe('NetWorthSectionView', () => {
  it('shows the title, the figure at the net worth size, the change in words with a glyph, the line and the rates note', async () => {
    const { getByText, getByTestId, queryByTestId } = await view(state());
    expect(getByText('Net worth', opts)).toBeTruthy();
    const figure = getByTestId('net-worth-figure', opts);
    expect(figure.props.children).toBe('$18,400');
    expect(JSON.stringify(figure.props.style)).toContain(String(fontSize.netWorth));
    expect(getByText('as of today', opts)).toBeTruthy();
    expect(getByTestId('net-worth-change', opts).props.children).toBe('Up $4,200 over the last 6 full months and this month so far');
    expect(getByTestId('net-worth-change-glyph', opts)).toBeTruthy();
    expect(getByTestId('net-worth-line', opts)).toBeTruthy();
    expect(getByText('At today’s exchange rates.', opts)).toBeTruthy();
    expect(queryByTestId('net-worth-note-debts', opts)).toBeNull();
  });

  it('words a fall', async () => {
    const { getByTestId } = await view(state({ change: { from: 1840000, to: 1420000, change: -420000 }, current: 1420000 }));
    expect(getByTestId('net-worth-change', opts).props.children).toBe('Down $4,200 over the last 6 full months and this month so far');
  });

  it('words a flat range over a year', async () => {
    const { getByTestId } = await view(state({ change: { from: 100, to: 100, change: 0 } }), { range: '1y' });
    expect(getByTestId('net-worth-change', opts).props.children).toBe('No change over the last 12 full months and this month so far');
  });

  it('adds owed-more when the total is negative', async () => {
    const { getByTestId } = await view(state({ current: -50000, change: { from: 0, to: -50000, change: -50000 } }), { range: 'all' });
    expect(getByTestId('net-worth-change', opts).props.children).toContain('owed more than owned');
  });

  it('adds the held-flat, holdings and plural unconverted notes', async () => {
    const a = await view(state({ debtsHeldFlat: true, holdingsLeftOut: true, unconverted: 2, unconvertedAccounts: 2 }));
    expect(a.getByTestId('net-worth-note-debts', opts)).toBeTruthy();
    expect(a.getByTestId('net-worth-note-holdings', opts)).toBeTruthy();
    expect(a.getByText('2 accounts could not be converted and are left out.', opts)).toBeTruthy();
  });

  it('adds the singular unconverted note', async () => {
    const b = await view(state({ unconverted: 1, unconvertedAccounts: 1 }));
    expect(b.getByText('1 account could not be converted and is left out.', opts)).toBeTruthy();
  });

  it('names a left-out debt or holding as such, not as an account (WR-01)', async () => {
    const v = await view(state({ unconverted: 3, unconvertedDebts: 1, unconvertedHoldings: 2 }));
    expect(v.getByText('1 debt could not be converted and is left out.', opts)).toBeTruthy();
    expect(v.getByText('2 holdings could not be converted and are left out.', opts)).toBeTruthy();
    expect(v.queryByText(/accounts? could not be converted/, opts)).toBeNull();
  });

  it('names what the card counts in Just me', async () => {
    const mine = await view(state());
    expect(mine.getByText('Your own accounts. Joint accounts count in Household.', opts)).toBeTruthy();
  });

  it('names what the card counts in Household', async () => {
    const hh = await view(state(), { scope: 'household' });
    expect(hh.getByText('Joint accounts only, each counted once.', opts)).toBeTruthy();
  });

  it('shows the empty state with an add-account action', async () => {
    const onAdd = jest.fn();
    const a = await view(state({ noAccounts: true, points: [], current: null, change: null }), { onAddAccount: onAdd });
    expect(a.getByText('No accounts yet', opts)).toBeTruthy();
    fireEvent.press(a.getByText('Add an account', opts));
    expect(onAdd).toHaveBeenCalled();
  });

  it('shows the one-point state without a chart', async () => {
    const b = await view(state({ points: [six[6]!], change: null }));
    expect(b.getByText('The line needs a second month', opts)).toBeTruthy();
    expect(b.queryByTestId('net-worth-line', opts)).toBeNull();
    expect(b.getByTestId('net-worth-figure', opts)).toBeTruthy();
  });

  it('shows a placeholder while loading', async () => {
    const a = await view(state({ status: 'loading', points: [], current: null, change: null }));
    expect(a.getByTestId('net-worth-loading', opts)).toBeTruthy();
  });

  it('shows the error card with a working retry', async () => {
    const retry = jest.fn();
    const b = await view(state({ status: 'error', retry }));
    expect(b.getByText('Couldn’t load this right now', opts)).toBeTruthy();
    fireEvent.press(b.getByText('Try again', opts));
    expect(retry).toHaveBeenCalled();
  });

  it('shows the readout when a point is tapped', async () => {
    const { getByTestId, queryByTestId, findByTestId } = await view(state());
    expect(queryByTestId('net-worth-line-readout', opts)).toBeNull();
    fireEvent.press(getByTestId('net-worth-line-point-1', opts));
    expect(await findByTestId('net-worth-line-readout', opts)).toBeTruthy();
  });

  it('drops the tapped point when the range changes (IN-04)', async () => {
    const tree = (range: '6m' | '1y') => (
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
        <ThemeProvider>
          <FontScaleProvider value={1}>
            <NetWorthSectionView state={state()} scope="mine" range={range} currency="USD" onAddAccount={jest.fn()} />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const r = await render(tree('6m'));
    fireEvent.press(r.getByTestId('net-worth-line-point-1', opts));
    expect(await r.findByTestId('net-worth-line-readout', opts)).toBeTruthy();
    await r.rerender(tree('1y'));
    expect(r.queryByTestId('net-worth-line-readout', opts)).toBeNull();
  });
});
