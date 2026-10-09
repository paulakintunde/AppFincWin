import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import { CalendarView } from '../views/CalendarView';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Current' }] }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    all: [],
    active: [],
    byId: new Map([
      ['c1', { id: 'c1', name: 'Food', builtin_key: null, color_key: 'green' }],
      ['c2', { id: 'c2', name: 'Fun', builtin_key: null, color_key: 'plum' }],
    ]),
    builtinIds: new Map(),
    transferCategoryId: null,
    loading: false,
  }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-10-25',
    weekStart: 1,
  }),
}));

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1000,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-10-14',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: null,
    status: 'paid',
    note: null,
    transfer_id: null,
    version: 1,
    created_at: '2026-10-14T10:00:00Z',
    amountHome: -1000,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

const ROWS = [
  row({ id: 'r1', amountHome: -1000, category_id: 'c1' }),
  row({ id: 'r2', name: 'Cinema', amountHome: -200, category_id: 'c2' }),
];

function renderCal(weekStart: 0 | 1, rows: ActivityRowView[] = ROWS) {
  return render(
    <ThemeProvider>
      <CalendarView month="2026-10" weekStart={weekStart} rows={rows} today="2026-10-25" onRowPress={jest.fn()} />
    </ThemeProvider>
  );
}

describe('CalendarView', () => {
  it('orders weekday initials and leading blanks by week start', async () => {
    const mon = await renderCal(1);
    expect(mon.getAllByText(/^[MTWFS]$/).map((n) => n.props.children)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    // 2026-10-01 is a Thursday: 3 leading blanks from Monday (plus 1 trailing: 3 + 31 = 34 -> 35)
    expect(mon.getAllByTestId('calendar-blank').length).toBe(3 + 1);
    await mon.unmount();

    const sun = await renderCal(0);
    expect(sun.getAllByText(/^[MTWFS]$/)[0]!.props.children).toBe('S');
    expect(sun.getAllByTestId('calendar-blank').length).toBe(4 + 0);
  });

  it('shows category dots and an accessible label per day', async () => {
    const screen = await renderCal(1);
    expect(screen.getAllByTestId('calendar-dot').length).toBe(2);
    const cell = screen.getByLabelText(/^Oct 14, 2 lines, net −£12\.00/);
    expect(cell.props.accessibilityState.selected).toBe(false);
  });

  it('selects a day, lists its lines, and deselects on a second tap', async () => {
    const screen = await renderCal(1);
    await fireEvent.press(screen.getByLabelText(/^Oct 14, 2 lines/));
    expect(screen.getByText('Oct 14, 2026')).toBeTruthy();
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByLabelText(/^Oct 14, 2 lines/).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText(/^Oct 14, 2 lines/));
    expect(screen.queryByText('Coffee')).toBeNull();
  });

  it('says so when a selected day is empty and marks only the rows passed in', async () => {
    const screen = await renderCal(1, [ROWS[0]!]);
    expect(screen.getAllByTestId('calendar-dot').length).toBe(1);
    await fireEvent.press(screen.getByLabelText(/^Oct 15, no lines/));
    expect(screen.getByText('Nothing on this day.')).toBeTruthy();
  });
});
