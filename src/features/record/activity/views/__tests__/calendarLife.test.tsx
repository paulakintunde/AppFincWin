// 06.2-12 (L03): spend-sized calendar dots (no new colours, size also spoken), the slate bill-due clock, the legend, and
// the day sheet that replaced the inline list.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { assert as fcAssert, nat, property } from 'fast-check';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors as tokenColors, stateColors } from '@/theme/tokens';
import type { ActivityRowView } from '@/data/queries/activity';
import { layOutSheets } from '@/test/sheetLayout';
import { expectFits, MATRIX, matrixName } from '@/test/textFitMatrix';
import { CalendarView } from '../CalendarView';
import { DOT_DIAMETER, dayHasBillDue, daySpentMinor, dotBand, minorPerMajorOf } from '../calendarDots';

jest.setTimeout(30000);

// The Glyph as a plain host view carrying its name, size and colour, so the clock's 16 and its slate can be read.
jest.mock('@/ui/icons/Glyph', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Glyph: (p: { name: string; size?: number; color: string; testID?: string }) =>
      R.createElement(View, { testID: p.testID ?? `glyph-${p.name}`, glyphName: p.name, glyphSize: p.size, glyphColor: p.color }),
  };
});
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
    byId: new Map([['c1', { id: 'c1', name: 'Food', builtin_key: null, color_key: 'green' }]]),
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

const ROWS: ActivityRowView[] = [
  // Oct 5: £12 out -> small
  row({ id: 's', local_date: '2026-10-05', name: 'Coffee', amountHome: -1200, original_amount: -1200 }),
  // Oct 6: £50 out exactly -> medium
  row({ id: 'm', local_date: '2026-10-06', name: 'Shop', amountHome: -5000, original_amount: -5000 }),
  // Oct 7: £200.01 out -> large
  row({ id: 'l', local_date: '2026-10-07', name: 'Phone', amountHome: -20001, original_amount: -20001 }),
  // Oct 8: money in only -> today's plain dot
  row({ id: 'in', local_date: '2026-10-08', name: 'Pay', amountHome: 90000, original_amount: 90000 }),
  // Oct 9: rent due (pending, outgoing) -> clock, and £1,450 -> large
  row({ id: 'rent', local_date: '2026-10-09', name: 'Rent', status: 'pending', amountHome: -145000, original_amount: -145000 }),
  row({ id: 'mk', local_date: '2026-10-09', name: 'Market', amountHome: -2350, original_amount: -2350 }),
];

function renderCal(props: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  return render(
    <ThemeProvider>
      <CalendarView month="2026-10" weekStart={1} rows={ROWS} today="2026-10-25" onRowPress={jest.fn()} {...props} />
    </ThemeProvider>
  );
}

type Node = ReturnType<typeof screen.getByTestId>;
function descendants(node: Node, out: Node[] = []): Node[] {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    out.push(child);
    descendants(child, out);
  }
  return out;
}
const byTestId = (node: Node, id: string): Node[] => descendants(node).filter((n) => n.props.testID === id);
const dotOf = (label: RegExp): Node | undefined => byTestId(screen.getByLabelText(label), 'calendar-dot')[0];
const sizeOf = (label: RegExp): number | undefined => {
  const dot = dotOf(label);
  return dot === undefined ? undefined : (StyleSheet.flatten(dot.props.style).width as number);
};

describe('dotBand (integer minor units)', () => {
  it('bands at 50 and 200 major units', () => {
    const gbp = minorPerMajorOf('GBP');
    expect(gbp).toBe(100);
    expect(dotBand(0, gbp)).toBe('none');
    expect(dotBand(1, gbp)).toBe('small');
    expect(dotBand(4999, gbp)).toBe('small');
    expect(dotBand(5000, gbp)).toBe('medium');
    expect(dotBand(20000, gbp)).toBe('medium');
    expect(dotBand(20001, gbp)).toBe('large');
  });

  it('follows the currency exponent (JPY has no minor unit)', () => {
    const jpy = minorPerMajorOf('JPY');
    expect(jpy).toBe(1);
    expect(dotBand(49, jpy)).toBe('small');
    expect(dotBand(50, jpy)).toBe('medium');
    expect(dotBand(201, jpy)).toBe('large');
  });

  it('draws nothing for a fraction, a negative or an unsafe amount', () => {
    expect(dotBand(10.5, 100)).toBe('none');
    expect(dotBand(-500, 100)).toBe('none');
    expect(dotBand(Number.MAX_SAFE_INTEGER + 2, 100)).toBe('none');
    expect(dotBand(500, 0)).toBe('none');
  });

  it('never shrinks as spending grows', () => {
    const order = { none: 0, small: 1, medium: 2, large: 3 } as const;
    fcAssert(
      property(nat({ max: 10_000_000 }), nat({ max: 10_000_000 }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return order[dotBand(lo, 100)] <= order[dotBand(hi, 100)];
      })
    );
  });

  it('sums only outgoing counted lines and spots an unpaid bill', () => {
    const day = [
      row({ id: 'a', amountHome: -1000 }),
      row({ id: 'b', amountHome: 5000 }),
      row({ id: 't', amountHome: -9999, transfer_id: 'x' }),
      row({ id: 'k', amountHome: -9999, status: 'skipped' }),
      row({ id: 'n', amountHome: null }),
    ];
    expect(daySpentMinor(day)).toBe(1000);
    expect(dayHasBillDue(day)).toBe(false);
    expect(dayHasBillDue([row({ status: 'pending', original_amount: -100 })])).toBe(true);
    expect(dayHasBillDue([row({ status: 'pending', original_amount: 100, amountHome: 100 })])).toBe(false);
  });
});

describe('CalendarView (L03)', () => {
  it('sizes the dot by spending in three sizes and keeps the plain dot for money-in days', async () => {
    await renderCal();
    expect(sizeOf(/^Oct 5,/)).toBe(DOT_DIAMETER.small);
    expect(sizeOf(/^Oct 6,/)).toBe(DOT_DIAMETER.medium);
    expect(sizeOf(/^Oct 7,/)).toBe(DOT_DIAMETER.large);
    expect(sizeOf(/^Oct 8,/)).toBe(5);
    expect(sizeOf(/^Oct 15,/)).toBeUndefined();
    expect([DOT_DIAMETER.small, DOT_DIAMETER.medium, DOT_DIAMETER.large]).toEqual([4, 6, 9]);
  });

  it('adds no colour: every dot is one of the existing net colours', async () => {
    await renderCal();
    // the money-in day's dot is the theme accent (the existing positive-net colour)
    const accent = StyleSheet.flatten(dotOf(/^Oct 8,/)!.props.style).backgroundColor as string;
    expect(typeof accent).toBe('string');
    const allowed = [accent, tokenColors.danger, tokenColors.inkFaint];
    const colours = screen.getAllByTestId('calendar-dot').map((d) => StyleSheet.flatten(d.props.style).backgroundColor);
    expect(colours.length).toBe(5);
    for (const c of colours) expect(allowed).toContain(c);
  });

  it('speaks the band and the bill due in each cell label', async () => {
    await renderCal();
    expect(screen.getByLabelText(/^Oct 5, 1 line, net .*, spent under £50$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Oct 6, 1 line, net .*, spent £50 to £200$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Oct 7, 1 line, net .*, spent over £200$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Oct 9, 2 lines, net .*, spent over £200, bill due$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Oct 8, 1 line, net \+£900\.00$/)).toBeTruthy();
  });

  it('shows a 16 slate clock on a bill-due day only', async () => {
    await renderCal();
    const clocks = screen.getAllByTestId('calendar-bill-due', { includeHiddenElements: true });
    expect(clocks.length).toBe(1);
    expect(byTestId(screen.getByLabelText(/^Oct 9,/), 'calendar-bill-due').length).toBe(1);
    expect(clocks[0]!.props).toMatchObject({ glyphName: 'stateDue', glyphSize: 16, glyphColor: stateColors.notYet.color });
  });

  it('draws a legend under the grid with the three sizes in whole units and the clock', async () => {
    await renderCal();
    const legend = screen.getByTestId('calendar-legend');
    expect(screen.getByText('Under £50')).toBeTruthy();
    expect(screen.getByText('£50 to £200')).toBeTruthy();
    expect(screen.getByText('Over £200')).toBeTruthy();
    expect(screen.getByText('Bill due')).toBeTruthy();
    expect(legend.props.accessibilityLabel).toBe('Dot size shows what was spent that day, Under £50, £50 to £200, Over £200, Bill due');
    // the legend clock is the same slate as the cell clock
    const clock = byTestId(legend, 'glyph-stateDue')[0];
    expect(clock?.props).toMatchObject({ glyphSize: 16, glyphColor: stateColors.notYet.color });
  });

  it('opens a day sheet with the long date and the day rows instead of an inline list', async () => {
    const onDetailLayout = jest.fn();
    await renderCal({ onDetailLayout });
    expect(screen.queryByTestId('calendar-day-sheet')).toBeNull();
    expect(screen.queryByText('Rent')).toBeNull();
    await fireEvent.press(screen.getByLabelText(/^Oct 9,/));
    await layOutSheets();
    expect(screen.getByTestId('calendar-day-sheet')).toBeTruthy();
    expect(screen.getByText('Friday, Oct 9')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('Market')).toBeTruthy();
    expect(screen.getByLabelText(/^Oct 9,/).props.accessibilityState.selected).toBe(true);
    expect(onDetailLayout).not.toHaveBeenCalled();
  });

  it('lists the rows through renderRow and a row press reaches onRowPress', async () => {
    const onRowPress = jest.fn();
    const renderRow = (r: ActivityRowView) => (
      <Text accessibilityRole="button" onPress={() => onRowPress(r)}>{`row ${r.name ?? ''}`}</Text>
    );
    await renderCal({ onRowPress, renderRow });
    await fireEvent.press(screen.getByLabelText(/^Oct 9,/));
    await layOutSheets();
    await fireEvent.press(screen.getByText('row Rent'));
    expect(onRowPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'rent' }));
  });

  it('closing the sheet clears the selection', async () => {
    await renderCal();
    await fireEvent.press(screen.getByLabelText(/^Oct 5,/));
    await layOutSheets();
    expect(screen.getByText('Coffee')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.getByLabelText(/^Oct 5,/).props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId('calendar-day-sheet')).toBeNull();
  });

  it('says so in the sheet when the day is empty', async () => {
    await renderCal();
    await fireEvent.press(screen.getByLabelText(/^Oct 15, no lines/));
    await layOutSheets();
    expect(screen.getByText('Thursday, Oct 15')).toBeTruthy();
    expect(screen.getByText('Nothing on this day.')).toBeTruthy();
  });

  it.each(MATRIX.map((m) => [matrixName(m), m] as const))('keeps 44+ day cells and whole labels at %s', async (_name, m) => {
    const dims = jest.requireActual('react-native').Dimensions;
    jest.spyOn(dims, 'get').mockReturnValue({ width: m.width, height: 800, scale: 2, fontScale: m.scale });
    await renderCal();
    for (const cell of screen.getAllByLabelText(/^Oct \d+,/)) {
      expect(Number(StyleSheet.flatten(cell.props.style).minHeight)).toBeGreaterThanOrEqual(44);
    }
    expectFits();
    jest.restoreAllMocks();
  });
});
