import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors as tokenColors } from '@/theme/tokens';
import type { ActivityRowView } from '@/data/queries/activity';
import { CalendarView } from '../views/CalendarView';

jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
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

  it.each([360, 411.43])('renders 7 cells in the header and in every week at %s wide', async (width) => {
    const dims = jest.requireActual('react-native').Dimensions;
    jest.spyOn(dims, 'get').mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
    const screen = await renderCal(1);
    expect(screen.getByTestId('calendar-header').children.length).toBe(7);
    for (let w = 0; w < 5; w += 1) {
      expect(screen.getByTestId(`calendar-week-${w}`).children.length).toBe(7);
    }
    expect(screen.queryByTestId('calendar-week-5')).toBeNull();
    jest.restoreAllMocks();
  });

  it('puts a tile and one net-coloured dot on days with activity only', async () => {
    const screen = await renderCal(1, [
      ROWS[0]!,
      row({ id: 'in', local_date: '2026-10-20', amountHome: 500 }),
      row({ id: 'z1', local_date: '2026-10-22', amountHome: 100 }),
      row({ id: 'z2', local_date: '2026-10-22', amountHome: -100 }),
    ]);
    const dots = screen.getAllByTestId('calendar-dot');
    expect(dots.length).toBe(3);
    const colours = dots.map((d) => StyleSheet.flatten(d.props.style).backgroundColor);
    expect(colours).toContain(tokenColors.danger);
    expect(colours).toContain(tokenColors.inkFaint);
    expect(colours.some((c) => c !== tokenColors.danger && c !== tokenColors.inkFaint)).toBe(true);
    const active = screen.getByLabelText(/^Oct 14, 1 line/);
    expect(StyleSheet.flatten(active.props.style).backgroundColor).toBe(tokenColors.fill1);
    const empty = screen.getByLabelText(/^Oct 15, no lines/);
    expect(StyleSheet.flatten(empty.props.style).backgroundColor).toBe('transparent');
  });

  it('reports the detail y when a day is selected', async () => {
    const onDetailLayout = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <CalendarView month="2026-10" weekStart={1} rows={ROWS} today="2026-10-25" onRowPress={jest.fn()} onDetailLayout={onDetailLayout} />
      </ThemeProvider>
    );
    await fireEvent.press(screen.getByLabelText(/^Oct 14, 2 lines/));
    const detail = screen.getByText('Oct 14, 2026').parent!.parent!;
    detail.props.onLayout({ nativeEvent: { layout: { x: 0, y: 240, width: 300, height: 100 } } });
    expect(onDetailLayout).toHaveBeenCalledWith(240);
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
