import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { EMPTY_FILTER, type ActivityFilter } from '@/engine/activity/filters';
import { useActivitySelection } from '../useActivitySelection';
import { FilterSheet } from '../FilterSheet';
import { SearchBar } from '../SearchBar';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

describe('useActivitySelection', () => {
  it('toggles, counts and clears', () => {
    const { result } = renderHook(() => useActivitySelection(['a', 'b', 'c']));
    expect(result.current.active).toBe(false);
    act(() => result.current.enter());
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected('a')).toBe(true);
    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(false);
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it('selectAll selects every given id; exit clears and deactivates', () => {
    const { result } = renderHook(() => useActivitySelection(['a', 'b']));
    act(() => result.current.enter());
    act(() => result.current.selectAll(['a', 'b']));
    expect(result.current.count).toBe(2);
    act(() => result.current.exit());
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('drops selected ids that are no longer in the visible list', () => {
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useActivitySelection(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    act(() => result.current.enter());
    act(() => result.current.selectAll(['a', 'b', 'c']));
    rerender({ ids: ['a', 'c'] });
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected('b')).toBe(false);
  });
});

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('SearchBar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows scope-specific placeholders and switches scope', () => {
    const onScope = jest.fn();
    const screen = wrap(
      <SearchBar term="" scope="month" monthLabel="September 2026" onTermChange={jest.fn()} onScopeChange={onScope} />
    );
    expect(screen.getByPlaceholderText('Search September 2026')).toBeTruthy();
    fireEvent.press(screen.getByText('Every month'));
    expect(onScope).toHaveBeenCalledWith('all');
  });

  it('uses the every-month placeholder in all scope', () => {
    const screen = wrap(
      <SearchBar term="" scope="all" monthLabel="September 2026" onTermChange={jest.fn()} onScopeChange={jest.fn()} />
    );
    expect(screen.getByPlaceholderText('Search every month')).toBeTruthy();
  });

  it('debounces typing by 250 ms', () => {
    const onTerm = jest.fn();
    const screen = wrap(
      <SearchBar term="" scope="month" monthLabel="September 2026" onTermChange={onTerm} onScopeChange={jest.fn()} />
    );
    fireEvent.changeText(screen.getByPlaceholderText('Search September 2026'), 'cof');
    expect(onTerm).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onTerm).toHaveBeenCalledWith('cof');
  });

  it('clears the term at once with a labelled button', () => {
    const onTerm = jest.fn();
    const screen = wrap(
      <SearchBar term="cof" scope="month" monthLabel="September 2026" onTermChange={onTerm} onScopeChange={jest.fn()} />
    );
    fireEvent.press(screen.getByLabelText('Clear search'));
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

function renderFilter(value: ActivityFilter = EMPTY_FILTER) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const screen = wrap(
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
  it('applies category, account and direction picks', () => {
    const { screen, onApply } = renderFilter();
    fireEvent.press(screen.getByText('Groceries'));
    fireEvent.press(screen.getByText('Uncategorised'));
    fireEvent.press(screen.getByText('Savings'));
    fireEvent.press(screen.getByText('Money out'));
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith({
      categoryIds: ['c1', null],
      accountIds: ['a2'],
      direction: 'out',
      amountMin: null,
      amountMax: null,
    });
  });

  it('offers Transfers as a direction', () => {
    const { screen, onApply } = renderFilter();
    fireEvent.press(screen.getByText('Transfers'));
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ direction: 'transfers' }));
  });

  it('parses amounts with the strict parser into home minor units', () => {
    const { screen, onApply } = renderFilter();
    fireEvent.changeText(screen.getByLabelText('At least'), '12.50');
    fireEvent.changeText(screen.getByLabelText('At most'), '100');
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ amountMin: 1250, amountMax: 10000 }));
  });

  it('shows the parser message for invalid input and does not apply', () => {
    const { screen, onApply } = renderFilter();
    fireEvent.changeText(screen.getByLabelText('At least'), 'abc');
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('refuses a minimum above the maximum', () => {
    const { screen, onApply } = renderFilter();
    fireEvent.changeText(screen.getByLabelText('At least'), '50');
    fireEvent.changeText(screen.getByLabelText('At most'), '10');
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('Clear filters resets to the empty filter', () => {
    const { screen, onApply } = renderFilter({ ...EMPTY_FILTER, direction: 'in', amountMin: 500 });
    fireEvent.press(screen.getByText('Clear filters'));
    expect(onApply).toHaveBeenCalledWith(EMPTY_FILTER);
  });
});
