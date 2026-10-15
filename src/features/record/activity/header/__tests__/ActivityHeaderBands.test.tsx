import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { MonthPosition } from '@/engine/activity';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityHeaderBands, type ActivityHeaderBandsProps } from '../ActivityHeaderBands';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));

const mockMotion = { reduced: false };
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockMotion.reduced,
      duration: (ms: number) => (mockMotion.reduced ? 0 : ms),
      easing: actual.EASING,
    }),
  };
});

const mockWithTiming = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    withTiming: (...args: unknown[]) => {
      mockWithTiming(...args);
      return (actual.withTiming as (...a: unknown[]) => unknown)(...args);
    },
  };
});

jest.setTimeout(30000);

const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number; currency: string }) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount / 100),
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const position: MonthPosition = {
  paidIn: 200000,
  paidOut: -76500,
  unpaid: 0,
  unpaidCount: 0,
  unconvertedUnpaid: 0,
  left: 123500,
  paidPct: 50,
  pendingPct: 0,
};

function baseProps(over: Partial<ActivityHeaderBandsProps> = {}): ActivityHeaderBandsProps {
  return {
    month: '2026-09',
    months: ['2026-10', '2026-09', '2026-08'],
    locale: 'en-GB',
    onMonthChange: jest.fn(),
    activeFilterCount: 0,
    onOpenFilters: jest.fn(),
    onOpenMore: jest.fn(),
    searchOpen: false,
    onOpenSearch: jest.fn(),
    onCancelSearch: jest.fn(),
    term: '',
    scope: 'month',
    onTermChange: jest.fn(),
    onScopeChange: jest.fn(),
    resultsCount: null,
    monthEmpty: false,
    loading: false,
    card: {
      position,
      unconvertedCount: 0,
      entryCount: { total: 4, shown: 4, narrowed: false },
      formatter,
      homeCurrency: 'GBP',
    },
    view: 'list',
    sort: 'newest',
    onOpenDisplay: jest.fn(),
    displayChipRef: React.createRef(),
    filterChips: [],
    onRemoveFilter: jest.fn(),
    onClearAllFilters: jest.fn(),
    selectionActive: false,
    selectionCount: 0,
    onSelectAll: jest.fn(),
    onSelectNone: jest.fn(),
    onSelectDone: jest.fn(),
    unpaidOnly: false,
    onClearUnpaid: jest.fn(),
    offerCard: <View testID="offer-card" />,
    ...over,
  };
}

async function draw(over: Partial<ActivityHeaderBandsProps> = {}) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={1}>
        <ActivityHeaderBands {...baseProps(over)} />
      </FontScaleProvider>
    </ThemeProvider>,
  );
}

const DISPLAY = 'By day · Newest, display options';

beforeEach(() => {
  mockMotion.reduced = false;
  mockWithTiming.mockClear();
});

describe('ActivityHeaderBands', () => {
  it('renders month row, card, Display chip and offer card by default', async () => {
    const u = await draw();
    expect(u.getByTestId('activity-month-row')).toBeTruthy();
    expect(u.getByTestId('activity-summary-card')).toBeTruthy();
    expect(u.getByLabelText(DISPLAY)).toBeTruthy();
    expect(u.getByTestId('offer-card')).toBeTruthy();
    expect(u.queryByTestId('unpaid-banner')).toBeNull();
    expect(u.queryByTestId('activity-select-bar')).toBeNull();
  });

  it('hides the card and Display chip for an empty month but keeps the month row (D-51)', async () => {
    const u = await draw({ monthEmpty: true });
    expect(u.queryByTestId('activity-summary-card')).toBeNull();
    expect(u.queryByLabelText(DISPLAY)).toBeNull();
    expect(u.getByTestId('activity-month-row')).toBeTruthy();
  });

  it('keeps the card and Display chip while an empty month is loading', async () => {
    const u = await draw({ monthEmpty: true, loading: true });
    expect(u.getByTestId('activity-summary-card')).toBeTruthy();
    expect(u.getByLabelText(DISPLAY)).toBeTruthy();
  });

  it('replaces the month row with the search field and hides the other bands (D-59, D-61)', async () => {
    const u = await draw({ searchOpen: true, unpaidOnly: true });
    expect(u.getByLabelText('Search September 2026')).toBeTruthy();
    expect(u.getByLabelText('Cancel search')).toBeTruthy();
    expect(u.queryByTestId('activity-month-row')).toBeNull();
    expect(u.queryByTestId('activity-summary-card')).toBeNull();
    expect(u.queryByLabelText(DISPLAY)).toBeNull();
    expect(u.queryByTestId('unpaid-banner')).toBeNull();
    expect(u.queryByTestId('offer-card')).toBeNull();
    expect(u.getByText('This month')).toBeTruthy();
    expect(u.getByText('Every month')).toBeTruthy();
  });

  it('Cancel calls onCancelSearch', async () => {
    const onCancelSearch = jest.fn();
    const u = await draw({ searchOpen: true, onCancelSearch });
    await fireEvent.press(u.getByLabelText('Cancel search'));
    expect(onCancelSearch).toHaveBeenCalledTimes(1);
  });

  it('shows the results count under the field once a term is entered, none when null', async () => {
    const withCount = await draw({ searchOpen: true, resultsCount: 3 });
    expect(withCount.getByText('3 transactions')).toBeTruthy();
  });

  it('shows no results count line when resultsCount is null', async () => {
    const without = await draw({ searchOpen: true, resultsCount: null });
    expect(without.queryByText(/transactions?$/)).toBeNull();
  });

  it('shows the SelectBar in place of band 4 and keeps the card (D-63)', async () => {
    const u = await draw({ selectionActive: true, selectionCount: 2 });
    expect(u.getByTestId('activity-select-bar')).toBeTruthy();
    expect(u.getByText('2 selected')).toBeTruthy();
    expect(u.queryByLabelText(DISPLAY)).toBeNull();
    expect(u.getByTestId('activity-summary-card')).toBeTruthy();
  });

  it('WR-02: keeps the SelectBar (count and Done) while searching and in an empty month', async () => {
    const searching = await draw({ searchOpen: true, selectionActive: true, selectionCount: 1 });
    expect(searching.getByTestId('activity-select-bar')).toBeTruthy();
    expect(searching.getByText('1 selected')).toBeTruthy();
    expect(searching.getByText('Done')).toBeTruthy();
    expect(searching.queryByTestId('activity-summary-card')).toBeNull();
    await searching.unmount();
    const empty = await draw({ monthEmpty: true, selectionActive: true, selectionCount: 0 });
    expect(empty.getByTestId('activity-select-bar')).toBeTruthy();
    expect(empty.getByText('0 selected')).toBeTruthy();
    expect(empty.queryByLabelText(DISPLAY)).toBeNull();
  });

  it('shows the Unpaid banner after the Display row and before the offer card (D-66)', async () => {
    const onClearUnpaid = jest.fn();
    const u = await draw({ unpaidOnly: true, onClearUnpaid });
    const banner = u.getByTestId('unpaid-banner');
    expect(banner).toBeTruthy();
    expect(u.getByTestId('offer-card')).toBeTruthy();
    const order = u.toJSON();
    const flat = JSON.stringify(order);
    expect(flat.indexOf('unpaid-banner')).toBeGreaterThan(flat.indexOf('display options'));
    expect(flat.indexOf('unpaid-banner')).toBeLessThan(flat.indexOf('offer-card'));
    await fireEvent.press(u.getByLabelText('Clear the unpaid filter'));
    expect(onClearUnpaid).toHaveBeenCalledTimes(1);
  });

  it('places filter chips after the Display chip', async () => {
    const u = await draw({ filterChips: [{ kind: 'category', label: 'Groceries' }] });
    const flat = JSON.stringify(u.toJSON());
    expect(flat.indexOf('Groceries')).toBeGreaterThan(flat.indexOf('display options'));
  });

  it('keeps the tree order equal to the visual order (D-69)', async () => {
    const u = await draw();
    const names = u.getAllByRole('button').map((b) => b.props.accessibilityLabel as string | undefined);
    expect(names.slice(0, 6)).toEqual([
      'Previous month',
      'September 2026, choose month',
      'Next month',
      'Search',
      'Filter',
      'More actions. Opens a menu.',
    ]);
    expect(names[6]).toBe(DISPLAY);
  });

  it('cross-fades over 150 ms (D-62)', async () => {
    const u = await draw();
    const durations = () =>
      mockWithTiming.mock.calls.map((c) => (c[1] as { duration: number }).duration);
    expect(durations()).toContain(150);
    expect(u.getByTestId('activity-month-row')).toBeTruthy();
  });

  it('is instant with Remove animations on (D-62)', async () => {
    const durations = () =>
      mockWithTiming.mock.calls.map((c) => (c[1] as { duration: number }).duration);
    mockMotion.reduced = true;
    const r = await draw({ searchOpen: true });
    expect(durations().length).toBeGreaterThan(0);
    expect(durations().every((d) => d === 0)).toBe(true);
    expect(r.getByLabelText('Search September 2026')).toBeTruthy();
  });
});
