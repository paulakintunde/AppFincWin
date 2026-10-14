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
          loading={false}
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
    const { getByLabelText, queryByText } = await draw({ loading: true });
    expect(getByLabelText('Loading overview').props.accessibilityState).toEqual({ busy: true });
    expect(queryByText('left after everything')).toBeNull();
    expect(queryByText('£2,500.00')).toBeNull();
  });

  it('reads an empty month', async () => {
    const { getByText, getAllByText } = await draw({
      totals: { ...totals, count: 0, paidIn: 0, paidOut: 0 },
      position: { ...position, paidIn: 0, paidOut: 0, unpaid: 0, left: 0, paidPct: 0, pendingPct: 0 },
    });
    expect(getByText('Nothing recorded in September yet.')).toBeTruthy();
    expect(style(getAllByText('£0.00')[0]!).color).toBe(colors.inkMuted);
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
