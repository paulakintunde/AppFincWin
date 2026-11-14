// 06.2-10 (D-07, D-12..D-14, L02): category icons on Activity rows, the detail sheet tile and the picker; exception
// badges (overdue, over cap, due, expected) on rows; the over-cap row derivation; swipe icons beside the word.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { categorySwatch, colors, stateColors } from '@/theme/tokens';
import { tile } from '@/theme/layout';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { CategoryRow } from '@/db/rows';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { CategoryPicker } from '@/features/record/entry/pickers/CategoryPicker';
import { ActivityRow } from '../ActivityRow';
import { overCapRows } from '../overCapRows';

jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticTap: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
const mockSwipe: { props: Record<string, any> } = { props: {} };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockSwipe.props = props;
      R.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View>{props.children}</View>;
    }),
  };
});

jest.setTimeout(30000);

const hidden = { includeHiddenElements: true };
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

const cat = (over: Partial<CategoryRow>): CategoryRow =>
  ({ id: 'c1', owner_id: 'u', builtin_key: null, name: 'Thing', color_key: 'teal', is_system: false, archived_at: null, monthly_cap: null, ...over }) as CategoryRow;

const groceries = cat({ id: 'g', builtin_key: 'Groceries' as CategoryRow['builtin_key'], name: null, color_key: 'teal' });
const custom = cat({ id: 'k', name: 'Knitting', color_key: 'plum' });

const lookup = (all: CategoryRow[]): CategoryLookup =>
  ({ all, active: all, byId: new Map(all.map((c) => [c.id, c])), transferCategoryId: 'tc', loading: false }) as unknown as CategoryLookup;

const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string, style?: string) => (style === 'short' ? `short:${d}` : d),
} as unknown as MoneyFormatter;

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: null,
    status: 'paid',
    transfer_id: null,
    amountHome: -1250,
    overdue: false,
    pending: false,
    is_refund: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderRow(r: ActivityRowView, extra: Partial<React.ComponentProps<typeof ActivityRow>> = {}, cats = [groceries, custom]) {
  return render(
    <ThemeProvider>
      <ActivityRow
        row={r}
        categories={lookup(cats)}
        accountName={() => 'Current'}
        formatter={formatter}
        homeCurrency="GBP"
        onPress={jest.fn()}
        onMarkPaid={jest.fn()}
        today="2026-09-30"
        {...extra}
      />
    </ThemeProvider>
  );
}

describe('CategoryGlyph on IconTile (D-07)', () => {
  it('draws the icon in the swatch colour on a 36 tile, with no letter, hidden from screen readers', async () => {
    const s = await render(
      <ThemeProvider>
        <CategoryGlyph colorKey="teal" icon="groceries" letter="G" testID="tile" />
      </ThemeProvider>
    );
    const tileEl = s.getByTestId('tile', hidden);
    expect(flat(tileEl)).toMatchObject({ width: tile.row, height: tile.row, backgroundColor: categorySwatch.teal.tint });
    expect(tileEl.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(s.queryByText('G', hidden)).toBeNull();
  });

  it('falls back to the letter for a category with no icon, and old callers (colorKey + letter) still render', async () => {
    const s = await render(
      <ThemeProvider>
        <CategoryGlyph colorKey="plum" letter="K" testID="tile" />
      </ThemeProvider>
    );
    expect(flat(s.getByText('K', hidden)).color).toBe(categorySwatch.plum.color);
    expect(flat(s.getByTestId('tile', hidden)).width).toBe(36);
  });

  it('takes the 48 big size', async () => {
    const s = await render(
      <ThemeProvider>
        <CategoryGlyph colorKey="teal" icon="groceries" letter="G" size={48} testID="tile" />
      </ThemeProvider>
    );
    expect(flat(s.getByTestId('tile', hidden)).width).toBe(48);
  });
});

describe('CategoryPicker shows category icons (D-07)', () => {
  it('a built-in category shows its icon, a custom one without an icon shows its letter', async () => {
    const s = await render(
      <ThemeProvider>
        <CategoryPicker visible categories={[groceries, custom]} selectedId={null} onSelect={jest.fn()} onClose={jest.fn()} />
      </ThemeProvider>
    );
    expect(s.getByText('K', hidden)).toBeTruthy();
    expect(s.queryByText('G', hidden)).toBeNull();
  });
});

describe('overCapRows (L02, T-06.2-10-01)', () => {
  const capped = cat({ id: 'd', name: 'Dining', monthly_cap: 10000 });
  const r = (id: string, amount: number, date: string, over: Partial<ActivityRowView> & { created_at?: string } = {}) =>
    row({ id, category_id: 'd', original_amount: amount, amountHome: amount, local_date: date, ...over });

  it('marks the first row whose running total goes past the cap, with the over amount', () => {
    const rows = [r('a', -6000, '2026-11-01'), r('b', -14000, '2026-11-04'), r('c', -2000, '2026-11-05')];
    const m = overCapRows(rows, [capped]);
    expect([...m.entries()]).toEqual([['b', 10000]]);
  });

  it('walks in date order then created order, not input order', () => {
    const rows = [
      r('late', -5000, '2026-11-10'),
      r('second', -5000, '2026-11-02', { created_at: '2026-11-02T10:00:00Z' }),
      r('first', -5000, '2026-11-02', { created_at: '2026-11-02T09:00:00Z' }),
    ];
    expect([...overCapRows(rows, [capped]).entries()]).toEqual([['late', 5000]]);
  });

  it('exactly at the cap is not over', () => {
    expect(overCapRows([r('a', -4000, '2026-11-01'), r('b', -6000, '2026-11-02')], [capped]).size).toBe(0);
  });

  it('a category with no cap gives nothing', () => {
    expect(overCapRows([r('a', -999999, '2026-11-01')], [cat({ id: 'd', monthly_cap: null })]).size).toBe(0);
  });

  it('refunds count net, and a month that ends under the cap after a refund gives nothing', () => {
    const rows = [r('a', -12000, '2026-11-01'), r('ref', 5000, '2026-11-03', { is_refund: true } as Partial<ActivityRowView>)];
    expect(overCapRows(rows, [capped]).size).toBe(0);
    const net = [r('ref', 5000, '2026-11-01', { is_refund: true } as Partial<ActivityRowView>), r('a', -16000, '2026-11-02')];
    // Net spend 16000 - 5000 = 11000 against a 10000 cap.
    expect([...overCapRows(net, [capped]).entries()]).toEqual([['a', 1000]]);
  });

  it('skips transfers, skipped lines, lines without a home figure and other months', () => {
    const rows = [
      r('t', -50000, '2026-11-01', { transfer_id: 'x' }),
      r('s', -50000, '2026-11-01', { status: 'skipped' } as Partial<ActivityRowView>),
      r('n', -50000, '2026-11-01', { amountHome: null }),
      r('oct', -9000, '2026-10-31'),
      r('nov', -9000, '2026-11-01'),
    ];
    expect(overCapRows(rows, [capped]).size).toBe(0);
  });

  it('money in never takes the badge', () => {
    const rows = [r('a', -9000, '2026-11-01'), r('in', 20000, '2026-11-02'), r('b', -25000, '2026-11-03')];
    // Income nets down (it counts like a refund in category usage); the spending row that passes the cap is marked.
    expect([...overCapRows(rows, [capped]).entries()]).toEqual([['b', 4000]]);
  });

  it('counts pending lines (usage counts paid and pending) and returns integers', () => {
    const m = overCapRows([r('a', -10001, '2026-11-01', { status: 'pending' } as Partial<ActivityRowView>)], [capped]);
    expect(m.get('a')).toBe(1);
    expect(Number.isInteger(m.get('a'))).toBe(true);
  });
});

describe('ActivityRow icons, badges and colours (D-07, D-12..D-14)', () => {
  it('shows the category icon (no letter) for a built-in category and the letter for a custom one', async () => {
    const a = await renderRow(row({ category_id: 'g', name: 'FreshCo' }));
    expect(a.getByTestId('activity-tile-r1', hidden)).toBeTruthy();
    expect(a.queryByText('F', hidden)).toBeNull();
    const b = await renderRow(row({ category_id: 'k', name: 'Yarn' }));
    expect(b.getByText('Y', hidden)).toBeTruthy();
    expect(flat(b.getByTestId('activity-tile-r1', hidden)).width).toBe(36);
  });

  it('a normal paid day stays quiet: no badge, spending in ink, Paid tag kept', async () => {
    const s = await renderRow(row({ category_id: 'g' }));
    expect(s.queryByTestId('activity-badge-r1')).toBeNull();
    expect(s.getByText('Paid')).toBeTruthy();
    expect(flat(s.getByText('-£12.50', hidden)).color).toBe(colors.ink);
  });

  it('money in is accent with a "+"', async () => {
    const s = await renderRow(row({ original_amount: 5000, amountHome: 5000 }));
    expect(s.getByText('+£50.00', hidden)).toBeTruthy();
  });

  it('the over-cap row shows a red "£40.00 over cap" badge, keeps its amount in ink and speaks the word', async () => {
    const s = await renderRow(row({ category_id: 'g' }), { overCapBy: 4000 });
    const badge = s.getByTestId('activity-badge-r1');
    expect(badge.props.accessibilityLabel).toBe('£40.00 over cap');
    expect(flat(badge).backgroundColor).toBe(stateColors.short.tint);
    expect(s.queryByText('Paid')).toBeNull();
    expect(flat(s.getByText('-£12.50', hidden)).color).toBe(colors.ink);
    expect(s.getByTestId('activity-row-r1').props.accessibilityLabel).toBe('Coffee, -£12.50, Paid, £40.00 over cap');
  });

  it('due today shows the Due badge in the calm not-yet tone, never red', async () => {
    const s = await renderRow(row({ status: 'pending', local_date: '2026-09-30' }));
    const badge = s.getByTestId('activity-badge-r1');
    expect(badge.props.accessibilityLabel).toBe('Due');
    expect(flat(badge).backgroundColor).toBe(stateColors.notYet.tint);
    expect(flat(s.getByText('Due')).color).not.toBe(colors.danger);
    expect(s.getByTestId('activity-row-r1').props.accessibilityLabel).toBe('Coffee, -£12.50, Due');
  });

  it('a pending bill dated later reads "Due <date>"', async () => {
    const s = await renderRow(row({ status: 'pending', local_date: '2026-10-08' }));
    expect(s.getByTestId('activity-badge-r1').props.accessibilityLabel).toBe('Due short:2026-10-08');
  });

  it('overdue wins over over-cap (one badge per row)', async () => {
    const s = await renderRow(row({ status: 'pending', local_date: '2026-09-29' }), { overCapBy: 4000 });
    expect(s.getAllByTestId(/^activity-badge-/)).toHaveLength(1);
    expect(s.getByTestId('activity-badge-r1').props.accessibilityLabel).toBe('Overdue');
    expect(flat(s.getByTestId('activity-badge-r1')).backgroundColor).toBe(stateColors.short.tint);
  });

  it('pending money in reads Expected through the calm pending badge', async () => {
    const s = await renderRow(row({ status: 'pending', original_amount: 5000, amountHome: 5000, local_date: '2026-09-30' }));
    expect(s.getByTestId('activity-badge-r1').props.accessibilityLabel).toBe('Expected');
    expect(flat(s.getByTestId('activity-badge-r1')).backgroundColor).toBe(stateColors.notYet.tint);
  });

  it('swipe actions draw an icon above the word', async () => {
    const handlers = { onSwipePay: jest.fn(), onSwipeDelete: jest.fn(), onSwipeUnpay: jest.fn() };
    await renderRow(row({ status: 'pending', local_date: '2026-09-30' }), handlers);
    let zones = await render(<ThemeProvider>{mockSwipe.props.renderLeftActions?.()}{mockSwipe.props.renderRightActions?.()}</ThemeProvider>);
    expect(zones.getByTestId('swipe-icon-stateFits', hidden)).toBeTruthy();
    expect(zones.getByTestId('swipe-icon-delete', hidden)).toBeTruthy();
    expect(zones.getByText('PAID', hidden)).toBeTruthy();
    await renderRow(row({ id: 'r2' }), handlers);
    zones = await render(<ThemeProvider>{mockSwipe.props.renderLeftActions?.()}</ThemeProvider>);
    expect(zones.getByTestId('swipe-icon-stateDue', hidden)).toBeTruthy();
  });
});
