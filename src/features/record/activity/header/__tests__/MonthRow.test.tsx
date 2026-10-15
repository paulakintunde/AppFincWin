import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { MonthRow } from '../MonthRow';
import { HeaderIconCluster } from '../HeaderIconCluster';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const MONTHS = ['2026-10', '2026-09', '2026-08'];

async function setup(activeFilterCount = 0) {
  const handlers = { onSearch: jest.fn(), onFilter: jest.fn(), onMore: jest.fn() };
  const utils = await render(
    <ThemeProvider>
      <MonthRow
        month="2026-09"
        months={MONTHS}
        locale="en-GB"
        onMonthChange={jest.fn()}
        activeFilterCount={activeFilterCount}
        {...handlers}
      />
    </ThemeProvider>,
  );
  return { ...utils, ...handlers };
}

const hidden = { includeHiddenElements: true } as const;

async function measure(
  utils: Awaited<ReturnType<typeof setup>>,
  row: number,
  long: number,
  short: number,
) {
  const lay = (width: number) => ({ nativeEvent: { layout: { width, height: 44, x: 0, y: 0 } } });
  await fireEvent(utils.getByTestId('activity-month-row'), 'layout', lay(row));
  await fireEvent(utils.getByTestId('month-measure-long', hidden), 'layout', lay(long));
  await fireEvent(utils.getByTestId('month-measure-short', hidden), 'layout', lay(short));
}

describe('MonthRow', () => {
  it('defaults to the long name with inline icons before any layout', async () => {
    const u = await setup();
    expect(u.getByText('September 2026')).toBeTruthy();
    expect(u.queryByTestId('activity-month-icons-row')).toBeNull();
  });

  it('keeps long + inline when it fits', async () => {
    const u = await setup();
    await measure(u, 368, 110, 70);
    expect(u.getByText('September 2026')).toBeTruthy();
    expect(u.queryByTestId('activity-month-icons-row')).toBeNull();
  });

  it('shortens the name before moving icons', async () => {
    const u = await setup();
    await measure(u, 368, 150, 80);
    expect(u.getByText('Sept 2026')).toBeTruthy();
    expect(u.queryByTestId('activity-month-icons-row')).toBeNull();
  });

  it('moves icons to their own right-aligned row on a 320pt screen', async () => {
    const u = await setup();
    await measure(u, 276, 110, 70);
    const row = u.getByTestId('activity-month-icons-row');
    expect(StyleSheet.flatten(row.props.style).justifyContent).toBe('flex-end');
    expect(u.getByText('September 2026')).toBeTruthy();
  });

  it('uses the short name and wraps icons at 2x text', async () => {
    const u = await setup();
    await measure(u, 276, 200, 150);
    expect(u.getByTestId('activity-month-icons-row')).toBeTruthy();
    expect(u.getByText('Sept 2026')).toBeTruthy();
  });

  it('keeps 44pt targets', async () => {
    const u = await setup();
    expect(u.getByLabelText('Search').props.hitSlop).toBe(4);
    expect(u.getByLabelText('Filter').props.hitSlop).toBe(4);
    expect(u.getByLabelText('More actions. Opens a menu.').props.hitSlop).toBe(4);
    const prev = u.getByLabelText('Previous month');
    expect(StyleSheet.flatten(prev.props.style).minWidth).toBe(44);
  });

  it('hides the measuring texts from accessibility and touches', async () => {
    const u = await setup();
    const parent = u.getByTestId('month-measure-long', hidden).parent!;
    expect(parent.props.accessibilityElementsHidden).toBe(true);
    expect(parent.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(parent.props.pointerEvents).toBe('none');
  });

  it('exposes controls in screen-reader order', async () => {
    const u = await setup();
    const names = u.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names).toEqual([
      'Previous month',
      'September 2026, choose month',
      'Next month',
      'Search',
      'Filter',
      'More actions. Opens a menu.',
    ]);
  });
});

describe('HeaderIconCluster', () => {
  async function cluster(count: number) {
    const h = { onSearch: jest.fn(), onFilter: jest.fn(), onMore: jest.fn() };
    const ref = React.createRef<import('react-native').View>();
    const u = await render(
      <ThemeProvider>
        <HeaderIconCluster activeFilterCount={count} searchRef={ref} {...h} />
      </ThemeProvider>,
    );
    return { ...u, ...h, ref };
  }

  it('labels the buttons in order with no badge when no filters', async () => {
    const u = await cluster(0);
    expect(u.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Search',
      'Filter',
      'More actions. Opens a menu.',
    ]);
    expect(u.queryByTestId('header-icon-badge')).toBeNull();
  });

  it('reports active filters in label and badge', async () => {
    const u = await cluster(2);
    expect(u.getByLabelText('Filter, 2 active')).toBeTruthy();
    expect(u.getByText('2', { includeHiddenElements: true })).toBeTruthy();
  });

  it('calls handlers and fills searchRef', async () => {
    const u = await cluster(0);
    await fireEvent.press(u.getByLabelText('Search'));
    await fireEvent.press(u.getByLabelText('Filter'));
    await fireEvent.press(u.getByLabelText('More actions. Opens a menu.'));
    expect(u.onSearch).toHaveBeenCalledTimes(1);
    expect(u.onFilter).toHaveBeenCalledTimes(1);
    expect(u.onMore).toHaveBeenCalledTimes(1);
    expect(u.ref.current).not.toBeNull();
  });
});
