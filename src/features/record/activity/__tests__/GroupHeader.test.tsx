// 06 device check: a day of only transfers (or only skipped lines) counts nothing, so its header
// must not read "0 transactions $0" over the lines drawn under it.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { GroupHeader, type GroupHeaderProps } from '../GroupHeader';

const formatter = {
  locale: 'en-CA',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}$${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function group(over: Partial<GroupHeaderProps['item']>): GroupHeaderProps['item'] {
  return { type: 'group', key: 'paid:group:2026-11-16', kind: 'day', day: '2026-11-16', count: 0, net: 0, unconvertedCount: 0, ...over };
}

async function renderHeader(item: GroupHeaderProps['item']) {
  return render(
    <ThemeProvider>
      <GroupHeader item={item} month="2026-11" homeCurrency="CAD" formatter={formatter} />
    </ThemeProvider>
  );
}

describe('GroupHeader', () => {
  it('shows the count and the net when the group counts lines', async () => {
    const screen = await renderHeader(group({ count: 2, net: -35000 }));
    expect(screen.getByText('2 transactions')).toBeTruthy();
    expect(screen.getByText('-$350.00')).toBeTruthy();
    expect(screen.getByLabelText('2026-11-16, 2 transactions, net -$350.00')).toBeTruthy();
  });

  it('shows the date only when nothing in the group counts (transfers or skipped lines)', async () => {
    const screen = await renderHeader(group({ count: 0, net: 0 }));
    expect(screen.getByText('2026-11-16')).toBeTruthy();
    expect(screen.queryByText('0 transactions')).toBeNull();
    expect(screen.queryByText('$0.00')).toBeNull();
    expect(screen.getByLabelText('2026-11-16')).toBeTruthy();
  });
});
