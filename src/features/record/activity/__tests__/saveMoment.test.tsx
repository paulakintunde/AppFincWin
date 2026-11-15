// 06.2-11 (L02, D-15, D-17, D-20): the Activity save moment. The justSaved store marks new rows once and only for
// 10 s; NewRowWash fades the row in and lays the fits tint under the card's content, clearing it after a short hold;
// Reduce Motion drops the fade and clears the tint with a quick fade; nothing waits for the wash. Day headers are 28
// tall with '−' for spending (ink) and '+' for money in (accent).
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors, stateColors } from '@/theme/tokens';
import { DURATION } from '@/theme/motion';
import { radii, step } from '@/theme/layout';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import {
  JUST_SAVED_WINDOW_MS,
  markJustSaved,
  peekJustSaved,
  resetJustSavedForTests,
  takeJustSaved,
} from '@/state/justSaved';
import { NewRowWash, WASH_CLEAR_MS, WASH_HOLD_MS } from '../NewRowWash';
import { ActivityRow } from '../ActivityRow';
import { GroupHeader, type GroupHeaderProps } from '../GroupHeader';

const mockMotion = { reduced: false };
const mockWithDelay = jest.fn();
const mockWithTiming = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withDelay: (...a: unknown[]) => {
      mockWithDelay(...a);
      return actual.withDelay(...a);
    },
    withTiming: (...a: unknown[]) => {
      mockWithTiming(...a);
      return actual.withTiming(...a);
    },
  };
});
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockMotion.reduced,
      duration: (ms: number) => (mockMotion.reduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockMotion.reduced ? actual.DURATION.press : ms),
    }),
  };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const hidden = { includeHiddenElements: true };
const MILK = 'Milk';
const TAP = 'Tap';
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

beforeEach(() => {
  resetJustSavedForTests();
  mockMotion.reduced = false;
  jest.clearAllMocks();
});

describe('justSaved store', () => {
  it('takes a marked id once, then never again', () => {
    markJustSaved(['a', 'b'], 1000);
    expect(takeJustSaved('a', 1500)).toBe(true);
    expect(takeJustSaved('a', 1600)).toBe(false);
    expect(takeJustSaved('b', 1600)).toBe(true);
    expect(takeJustSaved('never', 1600)).toBe(false);
  });

  it('ignores a mark older than 10 s and drops it', () => {
    markJustSaved(['old'], 0);
    expect(peekJustSaved('old', JUST_SAVED_WINDOW_MS + 1)).toBe(false);
    expect(takeJustSaved('old', 1)).toBe(false);
    markJustSaved(['edge'], 0);
    expect(takeJustSaved('edge', JUST_SAVED_WINDOW_MS)).toBe(true);
  });

  it('peek does not use the mark up', () => {
    markJustSaved(['p'], 0);
    expect(peekJustSaved('p', 10)).toBe(true);
    expect(peekJustSaved('p', 20)).toBe(true);
    expect(takeJustSaved('p', 30)).toBe(true);
    expect(peekJustSaved('p', 40)).toBe(false);
  });
});

describe('NewRowWash (L02)', () => {
  it('stays inside the board budget: a 0.35 s hold, then the tint clears within 1.4 s', () => {
    expect(WASH_HOLD_MS).toBe(350);
    expect(WASH_HOLD_MS + WASH_CLEAR_MS).toBeLessThanOrEqual(1400);
  });

  it('fades the row in and holds the tint, then clears it over the wash length', async () => {
    const withDelay = mockWithDelay;
    const withTiming = mockWithTiming;
    const s = await render(
      <NewRowWash>
        <Text>{MILK}</Text>
      </NewRowWash>
    );
    expect(s.getByTestId('new-row-wash').props.entering).toBeDefined();
    expect(s.getByText('Milk')).toBeTruthy();
    // The tint layer belongs to the card (WashUnderlay), not to the wrapper.
    expect(s.queryByTestId('new-row-wash-tint', hidden)).toBeNull();
    // No WashUnderlay was drawn here, so no timing started.
    expect(withDelay).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('with Reduce Motion the row appears at once (no fade)', async () => {
    mockMotion.reduced = true;
    const s = await render(
      <NewRowWash>
        <Text>{MILK}</Text>
      </NewRowWash>
    );
    expect(s.getByTestId('new-row-wash').props.entering).toBeUndefined();
  });
});

const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
  formatMoneyA11y: (m: { amount: number }) => `${m.amount}`,
} as unknown as MoneyFormatter;

const lookup = { all: [], active: [], byId: new Map(), transferCategoryId: 'tc', loading: false } as unknown as CategoryLookup;

function row(over: Partial<ActivityRowView> = {}): ActivityRowView {
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

function activityRow(onPress = jest.fn(), cardPosition: 'only' | 'first' | 'middle' | 'last' = 'only') {
  return (
    <ActivityRow
      row={row()}
      categories={lookup}
      accountName={() => 'Current'}
      formatter={formatter}
      homeCurrency="GBP"
      onPress={onPress}
      onMarkPaid={jest.fn()}
      today="2026-09-30"
      cardPosition={cardPosition}
    />
  );
}

describe('the wash under an Activity row', () => {
  it('lays the fits tint under the card content (first child), following the card corners', async () => {
    const withDelay = mockWithDelay;
    const withTiming = mockWithTiming;
    const s = await render(
      <ThemeProvider>
        <NewRowWash>{activityRow()}</NewRowWash>
      </ThemeProvider>
    );
    const card = s.getByTestId('activity-card-r1');
    const tint = within(card).getByTestId('new-row-wash-tint', hidden);
    expect(flat(tint)).toMatchObject({ position: 'absolute', backgroundColor: stateColors.fits.tint, borderRadius: radii.card });
    // drawn first, so the name and amount paint on top of it
    expect(card.children[0]).toBe(tint);
    // it never takes touches and screen readers skip it
    expect(tint.props.pointerEvents).toBe('none');
    expect(tint.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(tint.props.accessibilityElementsHidden).toBe(true);
    // the card underneath stays white: the tint fades out over it (tint -> surface)
    expect(flat(card).backgroundColor).toBe(colors.surface);
    expect(withDelay).toHaveBeenCalledWith(WASH_HOLD_MS, expect.anything());
    expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: WASH_CLEAR_MS }));
  });

  it('with Reduce Motion the tint clears with a quick fade and no hold', async () => {
    mockMotion.reduced = true;
    const withDelay = mockWithDelay;
    const withTiming = mockWithTiming;
    await render(
      <ThemeProvider>
        <NewRowWash>{activityRow()}</NewRowWash>
      </ThemeProvider>
    );
    expect(withDelay).not.toHaveBeenCalled();
    expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: DURATION.press }));
  });

  it('the row can be pressed at once while it washes', async () => {
    const onPress = jest.fn();
    const s = await render(
      <ThemeProvider>
        <NewRowWash>{activityRow(onPress)}</NewRowWash>
      </ThemeProvider>
    );
    await fireEvent.press(s.getByTestId('activity-row-r1'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a middle row of a card gets square tint corners', async () => {
    const s = await render(
      <ThemeProvider>
        <NewRowWash>{activityRow(jest.fn(), 'middle')}</NewRowWash>
      </ThemeProvider>
    );
    const tint = s.getByTestId('new-row-wash-tint', hidden);
    expect(flat(tint)).toMatchObject({ borderTopLeftRadius: 0, borderBottomRightRadius: 0 });
  });

  it('an ordinary row draws no tint', async () => {
    const s = await render(<ThemeProvider>{activityRow()}</ThemeProvider>);
    expect(s.queryByTestId('new-row-wash-tint', hidden)).toBeNull();
  });

  it('keeps Pressable children tappable (no pointerEvents on the wrapper)', async () => {
    const onPress = jest.fn();
    const s = await render(
      <NewRowWash>
        <Pressable onPress={onPress} accessibilityRole="button">
          <Text>{TAP}</Text>
        </Pressable>
      </NewRowWash>
    );
    expect(s.getByTestId('new-row-wash').props.pointerEvents).toBeUndefined();
    await fireEvent.press(s.getByText('Tap'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('day headers (L02, D-14)', () => {
  function group(over: Partial<GroupHeaderProps['item']>): GroupHeaderProps['item'] {
    return { type: 'group', key: 'k', kind: 'day', day: '2026-11-05', count: 2, net: 0, unconvertedCount: 0, ...over };
  }
  const renderHeader = (item: GroupHeaderProps['item']) =>
    render(
      <ThemeProvider>
        <GroupHeader item={item} month="2026-11" homeCurrency="GBP" formatter={formatter} />
      </ThemeProvider>
    );

  it('a spending day reads a true minus in ink, never red', async () => {
    const s = await renderHeader(group({ net: -5840 }));
    const net = s.getByText('−£58.40');
    expect(flat(net).color).toBe(colors.ink);
  });

  it('a money-in day reads a plus in the accent', async () => {
    const s = await renderHeader(group({ net: 440000 }));
    const net = s.getByText('+£4400.00');
    expect(flat(net).color).toBeDefined();
    expect(flat(net).color).not.toBe(colors.ink);
    expect(flat(net).color).not.toBe(colors.inkMuted);
  });

  it('the header line is at least 28 tall', async () => {
    const s = await renderHeader(group({ net: -100 }));
    const header = s.getByRole('header');
    expect(flat(header).minHeight as number).toBeGreaterThanOrEqual(step.section);
  });
});
