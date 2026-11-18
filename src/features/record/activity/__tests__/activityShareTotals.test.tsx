// 08.1-04 (D-04): in a household of 2+ Activity's month total counts the viewer's share, the same figure as Home's Mine.
// The figure goes through one helper (data/queries/figureScope + monthPositionOf); a shared row keeps its full amount and
// gains a "Your share" line; a household of one is unchanged.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import { figureTotalsOf, mineMonthRows, splitsByLineOf } from '@/data/queries/figureScope';
import { monthTotals } from '@/engine/activity';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow } from '../ActivityRow';
import { ActivitySummaryCard } from '../header/ActivitySummaryCard';
import { monthPositionOf } from '../monthFigureInputs';

jest.setTimeout(30000);
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn() }));
jest.mock('@/features/household/sharing/SharedRowCue', () => ({ SharedRowCue: () => null }));

const ME = 'u1';
const categories = { all: [], active: [], byId: new Map(), transferCategoryId: 'tc', loading: false } as unknown as CategoryLookup;
const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function line(over: Partial<ActivityRowView> & Record<string, unknown>): ActivityRowView {
  return {
    id: 'r',
    account_id: 'a1',
    original_amount: -1000,
    original_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Line',
    category_id: null,
    status: 'paid',
    transfer_id: null,
    amountHome: -1000,
    is_refund: false,
    rate_pending: false,
    is_shared: false,
    created_by: ME,
    household_amount: null,
    household_currency: null,
    overdue: false,
    pending: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

const own = line({ id: 'own', original_amount: -1_000, amountHome: -1_000 });
const rent = line({ id: 'rent', name: 'Rent', created_by: 'u2', is_shared: true, original_amount: -80_000, amountHome: -80_000, household_amount: -80_000, household_currency: 'GBP' });
const splits = splitsByLineOf([
  { transaction_id: 'rent', member_id: ME, former_member_key: null, position: 0, share: -30_000 },
  { transaction_id: 'rent', member_id: 'u2', former_member_key: null, position: 1, share: -50_000 },
]);

describe('Activity month total equals Home Mine (D-04)', () => {
  it('counts the viewer share of a shared line, through the same rows and totals Home uses', () => {
    const rows = [own, rent];
    const mine = mineMonthRows(rows, splits, ME, 'GBP');
    const home = figureTotalsOf(mine, []);
    expect(home.paidOut).toBe(-31_000);
    // Activity's month figure is the same call chain.
    expect(monthPositionOf({ rows: mine, projections: [], totals: home }).paidOut).toBe(-31_000);
  });

  it('the narrowed totals (share function) agree with the month figure on the same lines', () => {
    const rows = [own, rent];
    const mine = mineMonthRows(rows, splits, ME, 'GBP');
    const shareById = new Map(mine.map((r) => [r.id, r.amountHome]));
    const narrowed = monthTotals(
      rows.map((r) => ({ id: r.id, amountHome: r.amountHome, status: r.status, isTransfer: false })),
      [],
      (r) => (shareById.has(r.id) ? (shareById.get(r.id) ?? null) : r.amountHome)
    );
    expect(narrowed.paidOut).toBe(figureTotalsOf(mine, []).paidOut);
  });

  it('a household of one keeps the very same rows and totals', () => {
    const rows = [own];
    expect(mineMonthRows(rows, new Map(), ME, 'GBP')).toBe(rows);
  });
});

describe('shared row and summary note', () => {
  const draw = (r: ActivityRowView, yourShare: number | null) =>
    render(
      <ThemeProvider>
        <ActivityRow
          row={r}
          categories={categories}
          accountName={() => 'Current'}
          formatter={formatter}
          homeCurrency="GBP"
          onPress={jest.fn()}
          onMarkPaid={jest.fn()}
          today="2026-09-30"
          yourShare={yourShare}
        />
      </ThemeProvider>
    );

  it('keeps the full amount, adds the Your share line and ends the spoken label with it', async () => {
    const { getByText, getByTestId } = await draw(rent, -30_000);
    expect(getByText('Your share -£300.00')).toBeTruthy();
    expect(getByText('-£800.00', { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId('activity-row-rent').props.accessibilityLabel).toMatch(/, your share -£300\.00$/);
  });

  it('shows no share line in a household of one', async () => {
    const { queryByText, getByTestId } = await draw(own, null);
    expect(queryByText(/Your share/)).toBeNull();
    expect(getByTestId('activity-row-own').props.accessibilityLabel).not.toMatch(/your share/);
  });

  const card = (shareNote: boolean) =>
    render(
      <ThemeProvider>
        <ActivitySummaryCard
          position={{ paidIn: 0, paidOut: -31_000, unpaid: 0, unpaidCount: 0, unconvertedUnpaid: 0, left: -31_000, paidPct: 100, pendingPct: 0 }}
          unconvertedCount={0}
          entryCount={{ total: 2, shown: 2, narrowed: false }}
          loading={false}
          shareNote={shareNote}
          formatter={formatter}
          homeCurrency="GBP"
        />
      </ThemeProvider>
    );

  it('shows the note in a household of 2 and not in a household of one', async () => {
    const two = await card(true);
    expect(two.getByText('Your share of shared lines.')).toBeTruthy();
    expect(two.getByTestId('activity-summary-card').props.accessibilityLabel).toMatch(/Your share of shared lines\.$/);
    two.unmount();
    const one = await card(false);
    expect(one.queryByText('Your share of shared lines.')).toBeNull();
  });
});
