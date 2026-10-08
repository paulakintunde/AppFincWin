import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { EMPTY_FILTER, type ActivityFilter } from '@/engine/activity/filters';
import { contrastRatio } from '@/theme/contrast';
import { colors } from '@/theme/tokens';
import { useActivitySelection } from '../useActivitySelection';
import { FilterSheet } from '../FilterSheet';
import { SearchBar } from '../SearchBar';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

describe('useActivitySelection', () => {
  it('toggles, counts and clears', async () => {
    const { result } = await renderHook(() => useActivitySelection(['a', 'b', 'c']));
    expect(result.current.active).toBe(false);
    await act(() => result.current.enter());
    await act(() => result.current.toggle('a'));
    await act(() => result.current.toggle('b'));
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected('a')).toBe(true);
    await act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(false);
    await act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it('selectAll selects every given id; exit clears and deactivates', async () => {
    const { result } = await renderHook(() => useActivitySelection(['a', 'b']));
    await act(() => result.current.enter());
    await act(() => result.current.selectAll(['a', 'b']));
    expect(result.current.count).toBe(2);
    await act(() => result.current.exit());
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('drops selected ids that are no longer in the visible list', async () => {
    const { result, rerender } = await renderHook(({ ids }: { ids: string[] }) => useActivitySelection(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    await act(() => result.current.enter());
    await act(() => result.current.selectAll(['a', 'b', 'c']));
    await rerender({ ids: ['a', 'c'] });
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected('b')).toBe(false);
  });
});

async function wrap(ui: React.ReactElement) {
  return await render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('SearchBar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows scope-specific placeholders and switches scope', async () => {
    const onScope = jest.fn();
    const screen = await wrap(
      <SearchBar term="" scope="month" monthLabel="September 2026" onTermChange={jest.fn()} onScopeChange={onScope} />
    );
    expect(screen.getByPlaceholderText('Search September 2026')).toBeTruthy();
    await fireEvent.press(screen.getByText('Every month'));
    expect(onScope).toHaveBeenCalledWith('all');
  });

  it('uses the every-month placeholder in all scope', async () => {
    const screen = await wrap(
      <SearchBar term="" scope="all" monthLabel="September 2026" onTermChange={jest.fn()} onScopeChange={jest.fn()} />
    );
    expect(screen.getByPlaceholderText('Search every month')).toBeTruthy();
  });

  it('debounces typing by 250 ms', async () => {
    const onTerm = jest.fn();
    const screen = await wrap(
      <SearchBar term="" scope="month" monthLabel="September 2026" onTermChange={onTerm} onScopeChange={jest.fn()} />
    );
    await fireEvent.changeText(screen.getByPlaceholderText('Search September 2026'), 'cof');
    expect(onTerm).not.toHaveBeenCalled();
    await act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onTerm).toHaveBeenCalledWith('cof');
  });

  it('clears the term at once with a labelled button', async () => {
    const onTerm = jest.fn();
    const screen = await wrap(
      <SearchBar term="cof" scope="month" monthLabel="September 2026" onTermChange={onTerm} onScopeChange={jest.fn()} />
    );
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(onTerm).toHaveBeenCalledWith('');
  });
});

const categories = [
  { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null },
  { id: 'c2', builtin_key: null, name: 'Rent', color_key: 'slate', is_system: false, archived_at: null },
] as never;
const accounts = [
  { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
  { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
] as never;

async function renderFilter(value: ActivityFilter = EMPTY_FILTER) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const screen = await wrap(
    <FilterSheet
      visible
      value={value}
      homeCurrency="GBP"
      categories={categories}
      accounts={accounts}
      onApply={onApply}
      onClose={onClose}
    />
  );
  return { screen, onApply, onClose };
}

describe('FilterSheet', () => {
  it('applies category, account and direction picks', async () => {
    const { screen, onApply } = await renderFilter();
    await fireEvent.press(screen.getByText('Groceries'));
    await fireEvent.press(screen.getByText('Uncategorised'));
    await fireEvent.press(screen.getByText('Savings'));
    await fireEvent.press(screen.getByText('Money out'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith({
      categoryIds: ['c1', null],
      accountIds: ['a2'],
      direction: 'out',
      amountMin: null,
      amountMax: null,
      unpaidOnly: false,
    });
  });

  it('offers Unpaid only as a toggle that combines with the other filters', async () => {
    const { screen, onApply } = await renderFilter();
    await fireEvent.press(screen.getByText('Unpaid only'));
    await fireEvent.press(screen.getByText('Money out'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ unpaidOnly: true, direction: 'out' }));
  });

  it('Unpaid only reflects the applied value and can be switched back off', async () => {
    const { screen, onApply } = await renderFilter({ ...EMPTY_FILTER, unpaidOnly: true });
    expect(screen.getByText('Unpaid only')).toBeTruthy();
    await fireEvent.press(screen.getByText('Unpaid only'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ unpaidOnly: false }));
  });

  it('offers Transfers as a direction', async () => {
    const { screen, onApply } = await renderFilter();
    await fireEvent.press(screen.getByText('Transfers'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ direction: 'transfers' }));
  });

  it('parses amounts with the strict parser into home minor units', async () => {
    const { screen, onApply } = await renderFilter();
    await fireEvent.changeText(screen.getByLabelText('At least'), '12.50');
    await fireEvent.changeText(screen.getByLabelText('At most'), '100');
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ amountMin: 1250, amountMax: 10000 }));
  });

  it('shows the parser message for invalid input and does not apply', async () => {
    const { screen, onApply } = await renderFilter();
    await fireEvent.changeText(screen.getByLabelText('At least'), 'abc');
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('refuses a minimum above the maximum', async () => {
    const { screen, onApply } = await renderFilter();
    await fireEvent.changeText(screen.getByLabelText('At least'), '50');
    await fireEvent.changeText(screen.getByLabelText('At most'), '10');
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('S-CR-01: de-DE, KWD: reapplying a stored range round-trips through the region notation', async () => {
    const onApply = jest.fn();
    const screen = await wrap(
      <FilterSheet
        visible
        value={{ ...EMPTY_FILTER, amountMin: 1500, amountMax: 250000 }}
        homeCurrency="KWD"
        region="DE"
        categories={categories}
        accounts={accounts}
        onApply={onApply}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByLabelText('At least').props.value).toBe('1,500');
    expect(screen.getByLabelText('At most').props.value).toBe('250,000');
    await fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ amountMin: 1500, amountMax: 250000 }));
  });

  it('Clear filters resets to the empty filter', async () => {
    const { screen, onApply } = await renderFilter({ ...EMPTY_FILTER, direction: 'in', amountMin: 500 });
    await fireEvent.press(screen.getByText('Clear filters'));
    expect(onApply).toHaveBeenCalledWith(EMPTY_FILTER);
  });
});

describe('placeholder contrast (02-polish item 4)', () => {
  it('SearchBar placeholder meets WCAG AA (4.5:1) on its fill1 field', async () => {
    const screen = await wrap(
      <SearchBar term="" scope="month" monthLabel="September 2026" onTermChange={jest.fn()} onScopeChange={jest.fn()} />
    );
    const colour = screen.getByPlaceholderText('Search September 2026').props.placeholderTextColor as string;
    expect(contrastRatio(colour, colors.fill1)).toBeGreaterThanOrEqual(4.5);
  });

  it('FilterSheet amount placeholders meet WCAG AA (4.5:1) on fill1', async () => {
    const { screen } = await renderFilter();
    for (const label of ['At least', 'At most']) {
      const colour = screen.getByPlaceholderText(label).props.placeholderTextColor as string;
      expect(contrastRatio(colour, colors.fill1)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
