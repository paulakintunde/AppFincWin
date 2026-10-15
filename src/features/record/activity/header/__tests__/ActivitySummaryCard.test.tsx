import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors as base } from '@/theme/tokens';
import { ACCENTS, DEFAULT_ACCENT } from '@/theme/accents';
import type { MonthPosition } from '@/engine/activity';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivitySummaryCard, type ActivitySummaryCardProps } from '../ActivitySummaryCard';

const colors = { ...base, accent: ACCENTS[DEFAULT_ACCENT] };

jest.setTimeout(30000);

const formatter: MoneyFormatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number; currency: string }) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount / 100),
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const position: MonthPosition = {
  paidIn: 200000,
  paidOut: -76500,
  unpaid: 61200,
  unpaidCount: 2,
  unconvertedUnpaid: 0,
  left: 123400,
  paidPct: 50,
  pendingPct: 10,
};

async function draw(over: Partial<ActivitySummaryCardProps> = {}, scale = 1) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>
        <ActivitySummaryCard
          position={position}
          unconvertedCount={0}
          entryCount={{ total: 48, shown: 48, narrowed: false }}
          loading={false}
          formatter={formatter}
          homeCurrency="GBP"
          {...over}
        />
      </FontScaleProvider>
    </ThemeProvider>
  );
}

const style = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('ActivitySummaryCard', () => {
  it('shows the signed figure in accent with the caption', async () => {
    const { getByTestId, getByText } = await draw();
    expect(getByTestId('activity-summary-card')).toBeTruthy();
    expect(style(getByText('+£1,234.00')).color).toBe(colors.accent);
    expect(getByText('left after everything · 48 entries')).toBeTruthy();
  });

  it('uses danger for a negative left', async () => {
    const { getByText } = await draw({ position: { ...position, left: -5000 } });
    const node = getByText(/£50\.00/);
    expect(node.props.children).toMatch(/^-|−/);
    expect(style(node).color).toBe(colors.danger);
  });

  it('narrows the caption count but not the figure (D-70)', async () => {
    const { getByText } = await draw({ entryCount: { total: 48, shown: 12, narrowed: true } });
    expect(getByText('left after everything · 12 of 48 entries')).toBeTruthy();
    expect(getByText('+£1,234.00')).toBeTruthy();
    expect(getByText('£2,000.00')).toBeTruthy();
  });

  it('shows still to come in warn1, hidden at zero', async () => {
    const a = await draw();
    const still = a.getByTestId('activity-summary-still');
    expect(a.getByText('£612.00 still to come')).toBeTruthy();
    expect(style(still).color).toBe(colors.warn1);
    await a.unmount();
    const b = await draw({ position: { ...position, unpaid: 0 } });
    expect(b.queryByTestId('activity-summary-still')).toBeNull();
  });

  it('shows the In / Out line', async () => {
    const { getByTestId, getByText } = await draw();
    expect(getByTestId('activity-summary-inout')).toBeTruthy();
    expect(getByText('£2,000.00')).toBeTruthy();
    expect(getByText('£765.00')).toBeTruthy();
  });

  it('WR-04: a month of net refunds shows Out with a plus, in the line and the label', async () => {
    const { getByText, getByTestId } = await draw({ position: { ...position, paidOut: 5000, unpaid: 0 } });
    expect(getByText('+£50.00')).toBeTruthy();
    expect(getByTestId('activity-summary-card').props.accessibilityLabel).toBe(
      '+£1,234.00 left after everything, 48 entries. In £2,000.00. Out +£50.00.'
    );
  });

  it('replaces In / Out with the balance note', async () => {
    const all = await draw({ balanceNote: { allAccounts: true, inexact: false } });
    expect(all.getByText('Balance across all accounts')).toBeTruthy();
    expect(all.queryByTestId('activity-summary-inout')).toBeNull();
    expect(all.getByText('+£1,234.00')).toBeTruthy();
    await all.unmount();
    const waiting = await draw({ balanceNote: { allAccounts: false, inexact: true } });
    expect(waiting.getByText('Waiting for a rate')).toBeTruthy();
    await waiting.unmount();
    const none = await draw({ balanceNote: { allAccounts: false, inexact: false } });
    expect(none.queryByTestId('activity-summary-note')).toBeNull();
    expect(none.queryByTestId('activity-summary-inout')).toBeNull();
    expect(none.getByText('+£1,234.00')).toBeTruthy();
  });

  it('counts lines waiting for a rate', async () => {
    const { getByText } = await draw({ unconvertedCount: 2 });
    expect(getByText('2 lines waiting for a rate')).toBeTruthy();
  });

  it('has no bar and is one accessible stop', async () => {
    const { getByTestId, queryByTestId } = await draw();
    expect(queryByTestId('home-bar-paid')).toBeNull();
    expect(queryByTestId('home-bar-pending')).toBeNull();
    const root = getByTestId('activity-summary-card');
    expect(root.props.accessible).toBe(true);
    expect(root.props.onPress).toBeUndefined();
    expect(root.props.accessibilityLabel).toBe(
      '+£1,234.00 left after everything, 48 entries. In £2,000.00. Out £765.00. £612.00 still to come.'
    );
  });

  it('omits the still-to-come sentence at zero and uses the balance label', async () => {
    const a = await draw({ position: { ...position, unpaid: 0 } });
    expect(a.getByTestId('activity-summary-card').props.accessibilityLabel).toBe(
      '+£1,234.00 left after everything, 48 entries. In £2,000.00. Out £765.00.'
    );
    await a.unmount();
    const b = await draw({ balanceNote: { allAccounts: true, inexact: false }, position: { ...position, unpaid: 0 } });
    expect(b.getByTestId('activity-summary-card').props.accessibilityLabel).toBe(
      '+£1,234.00 left after everything, 48 entries. Balance across all accounts.'
    );
    await b.unmount();
    const c = await draw({ balanceNote: { allAccounts: false, inexact: false }, position: { ...position, unpaid: 0 } });
    expect(c.getByTestId('activity-summary-card').props.accessibilityLabel).toBe(
      '+£1,234.00 left after everything, 48 entries. Running balance.'
    );
  });

  it('shows a busy placeholder while loading', async () => {
    const { getByTestId, queryByText } = await draw({ loading: true });
    const root = getByTestId('activity-summary-card');
    expect(root.props.accessibilityLabel).toBe('Loading overview');
    expect(root.props.accessibilityState).toEqual({ busy: true });
    expect(queryByText('+£1,234.00')).toBeNull();
  });

  it('CR-01: shows the Home error / offline copy and no figure when the month read is unavailable', async () => {
    const err = await draw({ unavailable: 'error' });
    expect(err.getByText('This month couldn’t load. Pull down to try again.')).toBeTruthy();
    expect(err.queryByText('+£1,234.00')).toBeNull();
    expect(err.queryByTestId('activity-summary-inout')).toBeNull();
    expect(err.queryByTestId('activity-summary-still')).toBeNull();
    await err.unmount();
    const off = await draw({ unavailable: 'offline' });
    expect(off.getByText('You’re offline, and this month hasn’t loaded on this device yet.')).toBeTruthy();
    expect(off.queryByText('+£1,234.00')).toBeNull();
  });

  it('stacks the corner under the caption at large text', async () => {
    const { getByTestId } = await draw({}, 2);
    let node = getByTestId('activity-summary-still').parent;
    while (node && style(node as never).flexDirection === undefined) node = node.parent;
    expect(style(node as never).flexDirection).toBe('column');
  });

  it('matches snapshots', async () => {
    const def = await draw();
    expect(def.toJSON()).toMatchSnapshot('default');
    await def.unmount();
    const bal = await draw({ balanceNote: { allAccounts: true, inexact: false } });
    expect(bal.toJSON()).toMatchSnapshot('running-balance');
    await bal.unmount();
    const load = await draw({ loading: true });
    expect(load.toJSON()).toMatchSnapshot('loading');
  });
});
