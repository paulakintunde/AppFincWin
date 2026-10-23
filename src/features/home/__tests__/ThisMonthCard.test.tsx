import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors as base } from '@/theme/tokens';
import { ACCENTS, DEFAULT_ACCENT } from '@/theme/accents';
import type { MonthPosition, MonthTotals } from '@/engine/activity';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ThisMonthCard } from '../ThisMonthCard';

const colors = { ...base, accent: ACCENTS[DEFAULT_ACCENT] };

jest.setTimeout(30000);

const formatter: MoneyFormatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number; currency: string }) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount / 100),
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const position: MonthPosition = {
  paidIn: 250000,
  paidOut: -120000,
  unpaid: 45000,
  unpaidCount: 2,
  unconvertedUnpaid: 0,
  left: 85000,
  paidPct: 48,
  pendingPct: 18,
};
const totals: MonthTotals = {
  paidIn: 250000,
  paidOut: -120000,
  net: 130000,
  stillToCome: 0,
  pendingCount: 2,
  projectedCount: 0,
  unconvertedCount: 0,
  transferCount: 0,
  count: 5,
};

async function draw(over: Partial<React.ComponentProps<typeof ThisMonthCard>> = {}, scale = 1) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>
        <ThisMonthCard
          position={position}
          totals={totals}
          month="2026-09"
          months={['2026-10', '2026-09']}
          onMonthChange={jest.fn()}
          formatter={formatter}
          homeCurrency="GBP"
          state="ready"
          currentMonth="2026-09"
          {...over}
        />
      </FontScaleProvider>
    </ThemeProvider>
  );
}

const style = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('ThisMonthCard', () => {
  it('shows the headline in accent with a leading plus, and the three figures', async () => {
    const { getByText, getAllByText } = await draw();
    expect(style(getByText('+£850.00')).color).toBe(colors.accent);
    expect(getByText('left after everything')).toBeTruthy();
    expect(getByText('£2,500.00')).toBeTruthy();
    expect(getByText('£1,200.00')).toBeTruthy();
    expect(style(getByText('£450.00')).color).toBe(colors.danger);
    expect(getAllByText('Unpaid').length).toBeGreaterThan(0);
    expect(style(getByText('Unpaid')).textTransform).toBe('uppercase');
  });

  it('D-76 rule N: the IN, OUT and UNPAID figures stay on one line and fit down to 0.8', async () => {
    const { getByText } = await draw({ position: { ...position, paidIn: 244738 } });
    for (const text of ['£2,447.38', '£1,200.00', '£450.00']) {
      const props = getByText(text).props;
      expect(props.numberOfLines).toBe(1);
      expect(props.adjustsFontSizeToFit).toBe(true);
      expect(props.minimumFontScale).toBe(0.8);
    }
  });

  it('WR-04: a month of net refunds shows Out with a plus, same as Activity', async () => {
    const { getByLabelText } = await draw({ position: { ...position, paidOut: 5000 } });
    expect(getByLabelText('Out, +£50.00')).toBeTruthy();
  });

  it('uses danger for a negative left', async () => {
    const { getByText } = await draw({ position: { ...position, left: -2500 } });
    expect(style(getByText(formatter.formatMoney({ amount: -2500, currency: 'GBP' } as never))).color).toBe(colors.danger);
  });

  it('reads the headline as one unit', async () => {
    const { getByLabelText } = await draw();
    expect(getByLabelText('+£850.00 left after everything')).toBeTruthy();
  });

  it('describes the bar and draws a 8px fill1 track with a 0.3 pending segment', async () => {
    const { getByLabelText, getByTestId } = await draw();
    const bar = getByLabelText('£1,200.00 of £2,500.00 paid, £450.00 still to come');
    expect(style(bar).height).toBe(8);
    expect(style(bar).backgroundColor).toBe(colors.fill1);
    expect(style(getByTestId('home-bar-paid')).backgroundColor).toBe(colors.accent);
    expect(style(getByTestId('home-bar-pending')).opacity).toBe(0.3);
  });

  it('labels unconverted lines', async () => {
    const { getByText } = await draw({ totals: { ...totals, unconvertedCount: 2 } });
    expect(getByText('2 lines waiting for a rate')).toBeTruthy();
  });

  it('shows a busy placeholder while loading', async () => {
    const { getByLabelText, queryByText } = await draw({ state: 'loading' });
    expect(getByLabelText('Loading overview').props.accessibilityState).toEqual({ busy: true });
    expect(queryByText('left after everything')).toBeNull();
    expect(queryByText('£2,500.00')).toBeNull();
  });

  it('reads an empty month', async () => {
    const { getByText, getAllByText } = await draw({
      totals: { ...totals, count: 0, paidIn: 0, paidOut: 0 },
      position: { ...position, paidIn: 0, paidOut: 0, unpaid: 0, unpaidCount: 0, left: 0, paidPct: 0, pendingPct: 0 },
    });
    expect(getByText('Nothing recorded in September yet.')).toBeTruthy();
    expect(style(getAllByText('£0.00')[0]!).color).toBe(colors.inkMuted);
  });

  it('G1: no recorded rows but an expected bill shows the real negative figure', async () => {
    const { getByText, queryByText } = await draw({
      totals: { ...totals, count: 0, paidIn: 0, paidOut: 0 },
      position: { ...position, paidIn: 0, paidOut: 0, unpaid: 4500, unpaidCount: 1, left: -4500, paidPct: 0, pendingPct: 100 },
    });
    expect(style(getByText('-£45.00')).color).toBe(colors.danger);
    expect(queryByText(/Nothing recorded/)).toBeNull();
  });

  it('an unconverted unpaid line is not empty', async () => {
    const { queryByText } = await draw({
      totals: { ...totals, count: 0, paidIn: 0, paidOut: 0 },
      position: { ...position, paidIn: 0, paidOut: 0, unpaid: 0, unpaidCount: 0, unconvertedUnpaid: 1, left: 0 },
    });
    expect(queryByText(/Nothing recorded/)).toBeNull();
  });

  it.each([
    ['error', 'This month couldn’t load. Pull down to try again.'],
    ['offline', 'You’re offline, and this month hasn’t loaded on this device yet.'],
  ] as const)('G4: %s shows the line and no figures', async (state, line) => {
    const { getByText, queryByText, queryByTestId } = await draw({ state });
    expect(getByText(line)).toBeTruthy();
    expect(queryByText('left after everything')).toBeNull();
    expect(queryByText('£2,500.00')).toBeNull();
    expect(queryByTestId('home-bar-paid')).toBeNull();
  });

  it('M6: heading follows the month', async () => {
    expect((await draw({ month: '2026-10', currentMonth: '2026-10' })).getByText('This month')).toBeTruthy();
    expect((await draw({ month: '2026-09', currentMonth: '2026-10' })).getByText('September')).toBeTruthy();
    const d = await draw({ month: '2025-12', currentMonth: '2026-10' });
    expect(d.getByText('December 2025')).toBeTruthy();
    expect(d.getByRole('header')).toBeTruthy();
  });

  it('M6: empty past month drops yet', async () => {
    const empty = {
      totals: { ...totals, count: 0, paidIn: 0, paidOut: 0 },
      position: { ...position, paidIn: 0, paidOut: 0, unpaid: 0, unpaidCount: 0, left: 0, paidPct: 0, pendingPct: 0 },
    };
    const past = await draw({ ...empty, month: '2026-09', currentMonth: '2026-10' });
    expect(past.getByText('Nothing recorded in September.')).toBeTruthy();
    const cur = await draw({ ...empty, month: '2026-10', currentMonth: '2026-10' });
    expect(cur.getByText('Nothing recorded in October yet.')).toBeTruthy();
  });

  it('lays figures in a row at 1x and a column above 1.3x, capped at 1.3x', async () => {
    const one = await draw();
    expect(style(one.getByLabelText('In, £2,500.00').parent as never).flexDirection).toBe('row');
    one.unmount();
    const big = await draw({}, 2);
    expect(style(big.getByLabelText('In, £2,500.00').parent as never).flexDirection).toBe('column');
    const fig = style(big.getByText('£2,500.00'));
    expect(fig.fontSize as number).toBeCloseTo(16 * 1.3);
  });
});
