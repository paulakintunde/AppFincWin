import React from 'react';
import { processColor } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { chartPalette, stateColors } from '@/theme/tokens';
import { prepare } from '@/engine/decide/v3/prepare';
import { inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import * as focus from '@/state/activityFocus';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import { MoneyInOutSection } from '../MoneyInOutSection';
import { WhereItWentSection } from '../WhereItWentSection';
import { MonthAgainstLastSection } from '../MonthAgainstLastSection';

jest.setTimeout(60000);
const opts = { includeHiddenElements: true };

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a) } }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: null, homeCurrency: 'USD', today: '2026-11-15' }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategories: () => ({
    data: [
      { id: 'food', name: 'Groceries', builtin_key: null, color_key: 'green', icon_key: null },
      { id: 'fun', name: 'Fun', builtin_key: null, color_key: 'plum', icon_key: null },
    ],
  }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}


const inc = (m: string, amount: number) => v3Line({ id: `i-${m}`, date: `${m}-05`, amount, role: 'income', seriesId: 'pay' });
const PAY = [v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount: 300_000 })];
const sp = (m: string, id: string, amount: number, categoryId: string | null) => v3Line({ id: `${id}-${m}`, date: `${m}-06`, amount, categoryId });

function fixture(over: { short?: boolean } = {}) {
  const spend = over.short ? 400_000 : 100_000;
  return prepare(
    inputsOf({
      asOf: '2026-11-15',
      series: PAY,
      months: [
        monthOf('2026-09', [inc('2026-09', 300_000), sp('2026-09', 'a', 100_000, 'food'), sp('2026-09', 'b', 50_000, 'fun')]),
        monthOf('2026-10', [inc('2026-10', 300_000), sp('2026-10', 'a', 150_000, 'food'), sp('2026-10', 'b', 20_000, 'fun'), sp('2026-10', 'n', 5_000, null)]),
        monthOf('2026-11', [inc('2026-11', 300_000), sp('2026-11', 'a', spend, 'food'), sp('2026-11', 'b', 70_000, 'fun')], { full: false }),
      ],
    }),
  );
}

beforeEach(() => {
  resetSessionMotion();
  mockNavigate.mockClear();
});

describe('MoneyInOutSection', () => {
  it('shows the title, three tiles, the bars and a summary', async () => {
    const { getByText, getByTestId } = await wrap(<MoneyInOutSection prepared={fixture()} currency="USD" range="6m" />);
    expect(getByText('Money in and out', opts)).toBeTruthy();
    expect(getByTestId('insights-tile-in', opts)).toBeTruthy();
    expect(getByTestId('insights-tile-out', opts)).toBeTruthy();
    expect(getByTestId('insights-tile-left', opts)).toBeTruthy();
    expect(getByTestId('in-out-bars', opts)).toBeTruthy();
    expect(getByTestId('chart-summary', opts)).toBeTruthy();
  });

  it('shows the readout after tapping a pair', async () => {
    const { getByTestId, queryByTestId } = await wrap(<MoneyInOutSection prepared={fixture()} currency="USD" range="6m" />);
    expect(queryByTestId('insights-in-out-readout', opts)).toBeNull();
    await fireEvent.press(getByTestId('in-out-bars-col-2026-10', opts));
    expect(getByTestId('insights-in-out-readout', opts)).toBeTruthy();
  });

  it('Left each month uses the Decide tone and says short in words for a negative month', async () => {
    const { getByText, getByTestId, getAllByText } = await wrap(<MoneyInOutSection prepared={fixture({ short: true })} currency="USD" range="6m" />);
    await fireEvent.press(getByText('Left each month', opts));
    expect(getByTestId('insights-left-bars', opts)).toBeTruthy();
    const neg = getByTestId('insights-left-bars-bar-2026-11', opts);
    expect(neg.props.fill.payload).toBe(processColor(stateColors.short.stroke));
    expect(getAllByText(/ short$/, opts).length).toBeGreaterThan(0);
  });

  it('a negative Left total carries the short word on the tile', async () => {
    const p = prepare(inputsOf({ asOf: '2026-11-15', series: PAY, months: [monthOf('2026-11', [inc('2026-11', 100_000), sp('2026-11', 'a', 300_000, 'food')], { full: false })] }));
    const { getByTestId } = await wrap(<MoneyInOutSection prepared={p} currency="USD" range="6m" />);
    expect(getByTestId('insights-tile-left', opts).props.accessibilityLabel).toMatch(/short/);
  });

  it('shows the window note only for All', async () => {
    const a = await wrap(<MoneyInOutSection prepared={fixture()} currency="USD" range="all" />);
    expect(a.getByTestId('insights-all-window-note', opts)).toBeTruthy();
    await a.unmount();
    const b = await wrap(<MoneyInOutSection prepared={fixture()} currency="USD" range="6m" />);
    expect(b.queryByTestId('insights-all-window-note', opts)).toBeNull();
  });

  it('one month so far shows the notice and the single pair', async () => {
    const p = prepare(inputsOf({ asOf: '2026-11-15', series: PAY, months: [monthOf('2026-11', [inc('2026-11', 100_000), sp('2026-11', 'a', 20_000, 'food')], { full: false })] }));
    const { getByText, getByTestId } = await wrap(<MoneyInOutSection prepared={p} currency="USD" range="6m" />);
    expect(getByText('One month so far', opts)).toBeTruthy();
    expect(getByTestId('in-out-bars-col-2026-11', opts)).toBeTruthy();
  });

  it('shows the empty state with no records', async () => {
    const { getByText } = await wrap(<MoneyInOutSection prepared={prepare(inputsOf({ asOf: '2026-11-15', series: PAY }))} currency="USD" range="6m" />);
    expect(getByText('Nothing to show yet', opts)).toBeTruthy();
  });
});

describe('WhereItWentSection', () => {
  it('ranks categories with palette bars and always shows the debt and saving note', async () => {
    const { getByTestId, getByText } = await wrap(<WhereItWentSection prepared={fixture()} currency="USD" range="6m" />);
    expect(getByTestId('insights-cat-food', opts)).toBeTruthy();
    expect(getByText('Groceries', opts)).toBeTruthy();
    expect(getByText('Debt payments and saving are not counted here.', opts)).toBeTruthy();
    expect(chartPalette[0]).toBeTruthy();
  });

  it('keeps the note in range mode too', async () => {
    const { getByText } = await wrap(<WhereItWentSection prepared={fixture()} currency="USD" range="6m" />);
    await fireEvent.press(getByText('The range', opts));
    expect(getByText('Debt payments and saving are not counted here.', opts)).toBeTruthy();
  });

  it('a tap opens Activity on that category for the month', async () => {
    const spy = jest.spyOn(focus, 'requestActivityFocus');
    const { getByTestId } = await wrap(<WhereItWentSection prepared={fixture()} currency="USD" range="6m" />);
    await fireEvent.press(within(getByTestId('insights-cat-food', opts)).getByRole('button', opts));
    expect(spy).toHaveBeenCalledWith({ month: '2026-11', filter: expect.objectContaining({ categoryIds: ['food'], direction: 'out' }) });
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
  });

  it('range taps use the latest month; uncategorised passes null', async () => {
    const spy = jest.spyOn(focus, 'requestActivityFocus');
    const { getByTestId, getByText } = await wrap(<WhereItWentSection prepared={fixture()} currency="USD" range="6m" />);
    await fireEvent.press(getByText('A month', opts));
    await fireEvent.press(getByText('October 2026', opts));
    expect(getByText('No category', opts)).toBeTruthy();
    await fireEvent.press(within(getByTestId('insights-cat-none', opts)).getByRole('button', opts));
    expect(spy).toHaveBeenLastCalledWith({ month: '2026-10', filter: expect.objectContaining({ categoryIds: [null] }) });
    await fireEvent.press(getByText('The range', opts));
    await fireEvent.press(within(getByTestId('insights-cat-food', opts)).getByRole('button', opts));
    expect(spy).toHaveBeenLastCalledWith({ month: '2026-11', filter: expect.objectContaining({ categoryIds: ['food'] }) });
  });

  it('shows the left-out note when moves exist and an empty state for a month with no spending', async () => {
    const p = prepare(
      inputsOf({
        asOf: '2026-11-15',
        series: PAY,
        months: [
          monthOf('2026-10', [inc('2026-10', 100_000), v3Line({ id: 't', date: '2026-10-03', amount: 9_000, role: 'own_transfer' })]),
          monthOf('2026-11', [inc('2026-11', 100_000), sp('2026-11', 'a', 1_000, 'food')], { full: false }),
        ],
      }),
    );
    const { getByText, getByTestId } = await wrap(<WhereItWentSection prepared={p} currency="USD" range="6m" />);
    await fireEvent.press(getByText('October 2026', opts));
    expect(getByTestId('insights-where-leftout', opts)).toBeTruthy();
    expect(getByText('No spending in October 2026', opts)).toBeTruthy();
  });

  it('shows the rest bucket without a press, and Show all expands beyond eight', async () => {
    const lines = [sp('2026-11', 'big', 1_000_000, 'food'), sp('2026-11', 'tiny', 10, 'fun')];
    for (let i = 0; i < 9; i += 1) lines.push(sp('2026-11', `c${i}`, 50_000 - i, `cat${i}`));
    const p = prepare(inputsOf({ asOf: '2026-11-15', series: PAY, months: [monthOf('2026-11', [inc('2026-11', 2_000_000), ...lines], { full: false })] }));
    const { getByTestId, queryByTestId } = await wrap(<WhereItWentSection prepared={p} currency="USD" range="6m" />);
    expect(queryByTestId('insights-cat-rest', opts)).toBeNull();
    await fireEvent.press(getByTestId('insights-where-show-all', opts));
    expect(getByTestId('insights-cat-rest', opts)).toBeTruthy();
    expect(queryByTestId('insights-where-show-all', opts)).toBeNull();
  });
});

describe('MonthAgainstLastSection', () => {
  it('shows tiles with the change on last month and neutral change rows', async () => {
    const { getByTestId, getByText, getAllByText } = await wrap(<MonthAgainstLastSection prepared={fixture()} currency="USD" onAddEntry={() => undefined} />);
    expect(getByTestId('insights-compare-in', opts).props.accessibilityLabel).toMatch(/Same as October 2026/);
    expect(getByTestId('insights-compare-out', opts).props.accessibilityLabel).toMatch(/October 2026/);
    expect(getByText('This month so far.', opts)).toBeTruthy();
    expect(getAllByText(/More ·/, opts).length).toBeGreaterThan(0);
    expect(getByTestId('insights-change-food', opts)).toBeTruthy();
  });

  it('lists new and none words and expands past six rows', async () => {
    const mk = (m: string, ids: string[]) => ids.map((id, i) => sp(m, id, 1_000 + i, id));
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const p = prepare(
      inputsOf({
        asOf: '2026-11-15',
        series: PAY,
        months: [monthOf('2026-10', [inc('2026-10', 100_000), ...mk('2026-10', ['gone'])]), monthOf('2026-11', [inc('2026-11', 100_000), ...mk('2026-11', names)], { full: false })],
      }),
    );
    const { getByText, getByTestId, queryByTestId } = await wrap(<MonthAgainstLastSection prepared={p} currency="USD" onAddEntry={() => undefined} />);
    expect(queryByTestId('insights-change-gone', opts)).toBeNull();
    await fireEvent.press(getByTestId('insights-compare-show-all', opts));
    expect(getByTestId('insights-change-gone', opts)).toBeTruthy();
    expect(getByText('None this month', opts)).toBeTruthy();
  });

  it('asks to add an entry when the month before has nothing', async () => {
    const onAdd = jest.fn();
    const p = prepare(inputsOf({ asOf: '2026-11-15', series: PAY, months: [monthOf('2026-11', [inc('2026-11', 100_000), sp('2026-11', 'a', 1_000, 'food')], { full: false })] }));
    const { getByText } = await wrap(<MonthAgainstLastSection prepared={p} currency="USD" onAddEntry={onAdd} />);
    expect(getByText('Nothing recorded in October 2026', opts)).toBeTruthy();
    await fireEvent.press(getByText('Add an entry', opts));
    expect(onAdd).toHaveBeenCalled();
  });

  it('picking an earlier month drops the current-month note', async () => {
    const { getByText, queryByText } = await wrap(<MonthAgainstLastSection prepared={fixture()} currency="USD" onAddEntry={() => undefined} />);
    await fireEvent.press(getByText('October 2026', opts));
    expect(queryByText('This month so far.', opts)).toBeNull();
  });

  it('shows the empty state with no recorded month', async () => {
    const { getByText } = await wrap(<MonthAgainstLastSection prepared={prepare(inputsOf({ asOf: '2026-11-15', series: PAY }))} currency="USD" onAddEntry={() => undefined} />);
    expect(getByText('Nothing to show yet', opts)).toBeTruthy();
  });
});
