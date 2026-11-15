// 06.2-13: Home made clearer inside each card (D-02): the This-month bar stretches by scaleX once per session (D-18),
// quick actions and account rows carry real icons (D-10), Coming up shows calm due-soon / overdue badges (D-12, D-14).
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors as base } from '@/theme/tokens';
import { DURATION } from '@/theme/motion';
import type { MonthPosition, MonthTotals } from '@/engine/activity';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { AccountRow } from '@/db/rows';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import { MATRIX, expectFits, matrixName } from '@/test/textFitMatrix';
import type { ComingUpItem } from '../comingUp';
import { ComingUpCard, daysUntil, dueCue } from '../ComingUpCard';
import { ThisMonthCard } from '../ThisMonthCard';
import { QuickActions } from '../QuickActions';
import { AccountsCard } from '../AccountsCard';

jest.setTimeout(30000);

let mockReduced = false;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockReduced,
      duration: (ms: number) => (mockReduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockReduced ? actual.DURATION.press : ms),
    }),
  };
});

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('@/state/activityFocus', () => ({ requestActivityFocus: jest.fn() }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: jest.fn() }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [{ code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null }],
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
    timeZone: 'UTC',
    today: '2026-09-10',
  }),
}));

const formatter: MoneyFormatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number; currency: string }) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount / 100),
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const wrap = (ui: React.ReactElement, scale = 1) => (
  <ThemeProvider>
    <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
  </ThemeProvider>
);

const flat = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => {
  mockReduced = false;
  mockWidth = 402;
  mockScale = 1;
  resetSessionMotion();
});

// ---------------------------------------------------------------- This month bar (D-18)

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

function month(over: Partial<React.ComponentProps<typeof ThisMonthCard>> = {}) {
  return wrap(
    <ThisMonthCard
      position={position}
      totals={totals}
      month="2026-09"
      months={['2026-09']}
      onMonthChange={jest.fn()}
      formatter={formatter}
      homeCurrency="GBP"
      currentMonth="2026-09"
      state="ready"
      {...over}
    />,
  );
}

const scaleX = (testID: string): number => {
  const s = getAnimatedStyle(screen.getByTestId(testID) as never) as { transform?: { scaleX?: number }[] };
  return s.transform?.[0]?.scaleX ?? Number.NaN;
};

describe('This-month bar stretches by scaleX (D-18)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is a full-width bar with a left origin and no width animation', async () => {
    await render(month());
    for (const id of ['home-bar-paid', 'home-bar-pending']) {
      const s = flat(screen.getByTestId(id));
      expect(s.transformOrigin).toBe('left');
      expect(s.position).toBe('absolute');
      expect(s.width).toBeUndefined();
    }
  });

  it('stretches from 0 on the first view this session, over DURATION.fill', async () => {
    jest.useFakeTimers();
    await render(month());
    expect(scaleX('home-bar-paid')).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(DURATION.fill + 50);
    });
    expect(scaleX('home-bar-paid')).toBeCloseTo(0.48, 5);
    // pending is drawn under paid as long as paid + pending
    expect(scaleX('home-bar-pending')).toBeCloseTo(0.66, 5);
  });

  it('a later view in the same session draws the bar at its length at once', async () => {
    const first = await render(month());
    await first.unmount();
    await render(month());
    expect(scaleX('home-bar-paid')).toBeCloseTo(0.48, 5);
  });

  it('a loading first view still stretches when the figures arrive', async () => {
    jest.useFakeTimers();
    const r = await render(month({ state: 'loading' }));
    await r.rerender(month());
    expect(scaleX('home-bar-paid')).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(DURATION.fill + 50);
    });
    expect(scaleX('home-bar-paid')).toBeCloseTo(0.48, 5);
  });

  it('under Reduce Motion the bar is drawn at its length at once, even on the first view', async () => {
    mockReduced = true;
    await render(month());
    expect(scaleX('home-bar-paid')).toBeCloseTo(0.48, 5);
    expect(scaleX('home-bar-pending')).toBeCloseTo(0.66, 5);
  });

  it('a changed figure moves from the old length; the headline number is not counted up', async () => {
    jest.useFakeTimers();
    const r = await render(month());
    await act(async () => {
      jest.advanceTimersByTime(DURATION.fill + 50);
    });
    await r.rerender(month({ position: { ...position, paidPct: 60, left: 90000 } }));
    // the figure is the new one at once
    expect(screen.getByText('+£900.00')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(DURATION.swap + 50);
    });
    expect(scaleX('home-bar-paid')).toBeCloseTo(0.6, 5);
  });
});

// ---------------------------------------------------------------- Quick actions (D-10)

describe('Quick actions with real icons', () => {
  it('draws 48 tiles with the add, payBills and import icons in the accent', async () => {
    await render(wrap(<QuickActions month="2026-09" />));
    for (const [key, icon] of [
      ['add', 'add'],
      ['pay', 'payBills'],
      ['import', 'import'],
    ] as const) {
      const tile = screen.getByTestId(`quick-tile-${key}`, { includeHiddenElements: true });
      expect(flat(tile).width).toBe(48);
      expect(flat(tile).height).toBe(48);
      expect(screen.getByTestId(`glyph-${icon}`, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it('keeps the same three actions and words, each target at least 48 tall', async () => {
    await render(wrap(<QuickActions month="2026-09" />));
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      const s = StyleSheet.flatten(
        typeof b.props.style === 'function' ? b.props.style({ pressed: false }) : b.props.style,
      ) as Record<string, unknown>;
      expect(Number(s.minHeight)).toBeGreaterThanOrEqual(48);
    }
    for (const w of ['Add', 'Pay bills', 'Import']) expect(screen.getByText(w)).toBeTruthy();
  });

  it('Pay bills shows the unpaid count and speaks it', async () => {
    await render(wrap(<QuickActions month="2026-09" unpaidCount={5} />));
    expect(screen.getByLabelText('Pay bills, 5 unpaid')).toBeTruthy();
    expect(screen.getByTestId('quick-pay-count', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('5', { includeHiddenElements: true })).toBeTruthy();
  });

  it('with nothing unpaid there is no count', async () => {
    await render(wrap(<QuickActions month="2026-09" unpaidCount={0} />));
    expect(screen.queryByTestId('quick-pay-count', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Pay bills, shows unpaid items in Activity')).toBeTruthy();
  });

  for (const m of MATRIX) {
    it(`fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(wrap(<QuickActions month="2026-09" unpaidCount={12} />, m.scale));
      expectFits();
    });
  }
});

// ---------------------------------------------------------------- Accounts (D-10)

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1',
    deleted_at: null,
    household_id: 'h1',
    name: 'Everyday',
    kind: 'checking',
    currency: 'GBP',
    archived_at: null,
    sort_order: 0,
    ...over,
  } as unknown as AccountRow;
}

describe('Accounts card rows with type icons', () => {
  it('each row leads with a 36 tile carrying its account-type icon and ends in a real arrow', async () => {
    const accounts = [
      account({ id: 'a', name: 'Everyday', kind: 'checking' }),
      account({ id: 'b', name: 'Rainy day', kind: 'savings' }),
      account({ id: 'c', name: 'Card', kind: 'credit' }),
      account({ id: 'd', name: 'Wallet', kind: 'cash' }),
    ];
    await render(wrap(<AccountsCard accounts={accounts} balances={new Map()} homeCurrency="GBP" loading={false} />));
    for (const id of ['a', 'b', 'c', 'd']) {
      const t = screen.getByTestId(`account-tile-${id}`, { includeHiddenElements: true });
      expect(flat(t).width).toBe(36);
    }
    for (const icon of ['acctCurrent', 'acctSavings', 'acctCard', 'acctCash']) {
      expect(screen.getByTestId(`glyph-${icon}`, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(screen.getAllByTestId('glyph-arrowRight', { includeHiddenElements: true })).toHaveLength(4);
    // no letter tile and no old cash overlay
    expect(screen.queryByTestId('accent-tint', { includeHiddenElements: true })).toBeNull();
  });
});

// ---------------------------------------------------------------- Coming up badges (D-12, D-14)

describe('daysUntil / dueCue (T-06.2-13-01)', () => {
  it('counts whole local days at 0, 1, 3 and 4', () => {
    expect(daysUntil('2026-09-10', '2026-09-10')).toBe(0);
    expect(daysUntil('2026-09-11', '2026-09-10')).toBe(1);
    expect(daysUntil('2026-09-13', '2026-09-10')).toBe(3);
    expect(daysUntil('2026-09-14', '2026-09-10')).toBe(4);
    expect(daysUntil('2026-09-02', '2026-09-10')).toBe(-8);
  });

  it('counts across a month end, a year end and a clock change', () => {
    expect(daysUntil('2026-10-01', '2026-09-30')).toBe(1);
    expect(daysUntil('2026-10-02', '2026-09-29')).toBe(3);
    expect(daysUntil('2027-01-02', '2026-12-31')).toBe(2);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2);
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2);
  });

  it('due soon is today to three days out; overdue wins; the rest are quiet', () => {
    expect(dueCue('2026-09-10', '2026-09-10', false)).toEqual({ status: 'dueSoon', days: 0 });
    expect(dueCue('2026-09-11', '2026-09-10', false)).toEqual({ status: 'dueSoon', days: 1 });
    expect(dueCue('2026-09-13', '2026-09-10', false)).toEqual({ status: 'dueSoon', days: 3 });
    expect(dueCue('2026-09-14', '2026-09-10', false)).toBeNull();
    expect(dueCue('2026-09-02', '2026-09-10', true)).toEqual({ status: 'overdue', days: 8 });
    expect(dueCue('2026-09-09', '2026-09-10', false)).toBeNull();
  });
});

const categories = { all: [], active: [], byId: new Map(), builtinIds: new Map(), transferCategoryId: null, loading: false } as unknown as CategoryLookup;

function row(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    name: 'Rent',
    category_id: null,
    original_amount: -90000,
    original_currency: 'GBP',
    amountHome: -90000,
    overdue: false,
    is_automatic: false,
    local_date: '2026-09-28',
    status: 'pending',
    transfer_id: null,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}
const proj: ProjectionView = {
  key: 'p1',
  seriesId: 's1',
  date: '2026-09-11',
  name: 'Gym',
  amount: -3000,
  currency: 'GBP',
  categoryId: null,
  accountId: 'a1',
  amountHome: -3000,
};

const items: ComingUpItem[] = [
  { kind: 'row', row: row({ id: 'r0', name: 'Electric', overdue: true, local_date: '2026-09-02' }), date: '2026-09-02' },
  { kind: 'row', row: row({ id: 'r1', name: 'Water', local_date: '2026-09-10' }), date: '2026-09-10' },
  { kind: 'projection', projection: proj, date: '2026-09-11' },
  { kind: 'row', row: row({ id: 'r3', name: 'Phone', local_date: '2026-09-13' }), date: '2026-09-13' },
  { kind: 'row', row: row({ id: 'r4', name: 'Rent', local_date: '2026-09-14' }), date: '2026-09-14' },
];

function coming(scale = 1) {
  return wrap(
    <ComingUpCard
      items={items}
      today="2026-09-10"
      total={items.length}
      month="2026-09"
      formatter={formatter}
      homeCurrency="GBP"
      categories={categories}
      state="ready"
      onPay={jest.fn()}
      onOpenRow={jest.fn()}
      onOpenProjection={jest.fn()}
      onSeeAll={jest.fn()}
    />,
    scale,
  );
}

describe('Coming up due-soon and overdue badges', () => {
  it('overdue shows the red Overdue badge with its days; the row speaks it', async () => {
    await render(coming());
    const badge = screen.getByTestId('coming-up-badge-r0', { includeHiddenElements: true });
    expect(badge.props.accessibilityLabel).toBe('Overdue 8 days');
    expect(flat(badge).backgroundColor).toBe('#F8E2DA');
    expect(screen.getByLabelText('Electric, -£900.00, Overdue 8 days, was due 2026-09-02')).toBeTruthy();
  });

  it('due today, tomorrow and in 3 days show the amber Due soon badge with plain words', async () => {
    await render(coming());
    expect(screen.getByTestId('coming-up-badge-r1', { includeHiddenElements: true }).props.accessibilityLabel).toBe('Due today');
    expect(screen.getByTestId('coming-up-badge-p1', { includeHiddenElements: true }).props.accessibilityLabel).toBe('Due tomorrow');
    expect(screen.getByTestId('coming-up-badge-r3', { includeHiddenElements: true }).props.accessibilityLabel).toBe('Due in 3 days');
    expect(screen.getByLabelText('Water, -£900.00, Due today, due 2026-09-10')).toBeTruthy();
    expect(screen.getByLabelText('Phone, -£900.00, Due in 3 days, due 2026-09-13')).toBeTruthy();
  });

  it('a bill four days out stays quiet: no badge, the plain label', async () => {
    await render(coming());
    expect(screen.queryByTestId('coming-up-badge-r4', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Rent, -£900.00, due 2026-09-14')).toBeTruthy();
  });

  it('no text in the card is drawn in the danger colour', async () => {
    await render(coming());
    const json = JSON.stringify(screen.toJSON());
    expect(json).not.toContain(`"color":"${base.danger}"`);
  });

  for (const m of MATRIX) {
    it(`fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(coming(m.scale));
      // Exempt, unchanged by this plan: the bill names (user-typed, two lines), the date block's one-line month word
      // (capped scale, short by design) and the Pay pill, whose 44 comes from its padded word plus hit slop.
      expectFits({
        clamped: [/^(Electric|Water|Gym|Phone|Rent)$/, /^[A-Z]{3,4}$/],
        smallTargets: [/^Pay .+, mark as paid$/],
      });
    });
  }
});
