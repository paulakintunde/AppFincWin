import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { focusAccessibility } from '@/shell/a11yFocus';
import { FilterChipRow } from '../FilterChipRow';
import type { FilterChipModel } from '../activeFilters';

jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));
jest.setTimeout(20000);

const DISPLAY = "Display";
const cat: FilterChipModel = { kind: 'category', label: 'Groceries' };
const dir: FilterChipModel = { kind: 'direction', label: 'Money out' };
const acc: FilterChipModel = { kind: 'account', label: 'Cash' };

type Fns = { open: jest.Mock; remove: jest.Mock; clear: jest.Mock };

function build(chips: FilterChipModel[], fns: Fns, ref: React.RefObject<View | null>) {
  return (
    <ThemeProvider>
      <FilterChipRow
        leading={
          <View ref={ref} accessible testID="display-chip">
            <Text>{DISPLAY}</Text>
          </View>
        }
        leadingFocusRef={ref}
        chips={chips}
        onOpenFilters={fns.open}
        onRemove={fns.remove}
        onClearAll={fns.clear}
      />
    </ThemeProvider>
  );
}

async function setup(chips: FilterChipModel[]) {
  const fns: Fns = { open: jest.fn(), remove: jest.fn(), clear: jest.fn() };
  const ref = React.createRef<View | null>();
  const utils = await render(build(chips, fns, ref));
  return { ...utils, fns, ref, rebuild: (c: FilterChipModel[]) => utils.rerender(build(c, fns, ref)) };
}

beforeEach(() => (focusAccessibility as jest.Mock).mockClear());

describe('FilterChipRow', () => {
  it('renders only the leading node with no chips', async () => {
    const { getByTestId, queryByText, queryByTestId } = await setup([]);
    expect(getByTestId('display-chip')).toBeTruthy();
    expect(queryByText('Clear all')).toBeNull();
    expect(queryByTestId('filter-chip-scroll')).toBeNull();
  });

  it('two chips: one sideways-scrolling line, no Clear all (WR-06)', async () => {
    const { getByTestId, getByText, queryByText } = await setup([cat, dir]);
    const row = getByTestId('filter-chip-row');
    // A horizontal ScrollView never wraps and lets a clipped trailing chip and its x scroll into view.
    expect(row.props.horizontal).toBe(true);
    expect(row.props.showsHorizontalScrollIndicator).toBe(false);
    expect(getByText('Groceries')).toBeTruthy();
    expect(getByText('Money out')).toBeTruthy();
    expect(queryByText('Clear all')).toBeNull();
  });

  it('each chip has an open button and a 44pt remove button', async () => {
    const { getByRole, getAllByTestId } = await setup([cat]);
    expect(getByRole('button', { name: 'Filter: Groceries. Opens filters.' })).toBeTruthy();
    const x = getByRole('button', { name: 'Remove filter Groceries' });
    const raw = x.props.style;
    const style = StyleSheet.flatten(typeof raw === 'function' ? raw({ pressed: false }) : raw);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(getAllByTestId('accent-tint')).toHaveLength(1);
  });

  it('label opens filters; x removes only its own kind', async () => {
    const { getByRole, fns } = await setup([cat, dir]);
    await fireEvent.press(getByRole('button', { name: 'Filter: Groceries. Opens filters.' }));
    expect(fns.open).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByRole('button', { name: 'Remove filter Money out' }));
    expect(fns.remove).toHaveBeenCalledTimes(1);
    expect(fns.remove).toHaveBeenCalledWith('direction');
    expect(fns.open).toHaveBeenCalledTimes(1);
  });

  it('three chips scroll and end in Clear all', async () => {
    const { getByTestId, getByRole, fns } = await setup([cat, dir, acc]);
    const sv = getByTestId('filter-chip-scroll');
    expect(sv.props.horizontal).toBe(true);
    expect(sv.props.showsHorizontalScrollIndicator).toBe(false);
    await fireEvent.press(getByRole('button', { name: 'Clear all' }));
    expect(fns.clear).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the next chip after removal', async () => {
    const { getByRole, rebuild } = await setup([cat, dir]);
    await fireEvent.press(getByRole('button', { name: 'Remove filter Groceries' }));
    await rebuild([dir]);
    const next = getByRole('button', { name: 'Filter: Money out. Opens filters.' });
    expect(focusAccessibility).toHaveBeenCalledTimes(1);
    const arg = (focusAccessibility as jest.Mock).mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(next).toBeTruthy();
    expect(String(arg?.props?.accessibilityLabel ?? arg?._internalFiberInstanceHandleDEV?.memoizedProps?.accessibilityLabel)).toBe("Filter: Money out. Opens filters.");
  });

  it('moves focus to the Display chip when none remain', async () => {
    const { getByRole, rebuild, ref } = await setup([cat]);
    await fireEvent.press(getByRole('button', { name: 'Remove filter Groceries' }));
    await rebuild([]);
    expect(ref.current).not.toBeNull();
    expect(focusAccessibility).toHaveBeenCalledWith(ref.current);
  });

  it('WR-07: Clear all moves focus to the Display chip', async () => {
    const { getByRole, rebuild, ref } = await setup([cat, dir, acc]);
    await fireEvent.press(getByRole('button', { name: 'Clear all' }));
    await rebuild([]);
    expect(ref.current).not.toBeNull();
    expect(focusAccessibility).toHaveBeenCalledTimes(1);
    expect(focusAccessibility).toHaveBeenCalledWith(ref.current);
  });
});
