// S-CR-05: list pickers keep their header (title and Cancel) outside a scrollable body, so a
// long list (about 170 currencies, many categories, years of months) never pushes Cancel
// off screen.
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { CategoryRow } from '@/db/rows';
import { MonthSwitcher } from '@/features/record/activity/MonthSwitcher';
import { OptionPicker } from '../pickers/OptionPicker';
import { CategoryPicker } from '../pickers/CategoryPicker';
import { AccountPicker } from '../pickers/AccountPicker';
import { EditScopePrompt } from '../EditScopePrompt';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

async function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('long pickers scroll under a fixed header (S-CR-05)', () => {
  it('OptionPicker: 170 currencies sit in the scroll body; Cancel stays outside it', async () => {
    const options = Array.from({ length: 170 }, (_, i) => ({ value: `C${i}`, label: `Currency ${i}` }));
    const onClose = jest.fn();
    const { getByTestId, getByLabelText } = await wrap(
      <OptionPicker visible title="Currency" options={options} selected="C0" onSelect={jest.fn()} onClose={onClose} />
    );
    const body = getByTestId('sheet-scroll');
    expect(within(body).getByText('Currency 0')).toBeTruthy();
    expect(within(body).getByText('Currency 169')).toBeTruthy();
    expect(within(body).queryByLabelText('Cancel')).toBeNull();
    await fireEvent.press(getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('CategoryPicker: categories scroll; Cancel stays outside', async () => {
    const categories = Array.from(
      { length: 40 },
      (_, i) =>
        ({ id: `c${i}`, builtin_key: null, name: `Cat ${i}`, color_key: 'teal', is_system: false, archived_at: null }) as unknown as CategoryRow
    );
    const { getByTestId } = await wrap(
      <CategoryPicker visible categories={categories} selectedId={null} onSelect={jest.fn()} onClose={jest.fn()} />
    );
    const body = getByTestId('sheet-scroll');
    expect(within(body).getByText('Cat 39')).toBeTruthy();
    expect(within(body).queryByLabelText('Cancel')).toBeNull();
  });

  it('AccountPicker: accounts scroll; Cancel stays outside', async () => {
    const accounts = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, name: `Acc ${i}`, currency: 'GBP', archived_at: null }));
    const { getByTestId } = await wrap(
      <AccountPicker visible title="Account" accounts={accounts} selectedId={null} onSelect={jest.fn()} onClose={jest.fn()} />
    );
    const body = getByTestId('sheet-scroll');
    expect(within(body).getByText('Acc 29')).toBeTruthy();
    expect(within(body).queryByLabelText('Cancel')).toBeNull();
  });

  it('MonthSwitcher: the month list scrolls and has a header that closes it', async () => {
    const months = Array.from({ length: 36 }, (_, i) => `${2026 - Math.floor(i / 12)}-${String(12 - (i % 12)).padStart(2, '0')}`);
    const { getByLabelText, getByTestId, queryByTestId } = await wrap(
      <MonthSwitcher month="2026-12" months={months} locale="en-GB" onChange={jest.fn()} />
    );
    await fireEvent.press(getByLabelText('Choose month'));
    const body = getByTestId('sheet-scroll');
    expect(within(body).getByText('January 2024')).toBeTruthy();
    expect(within(body).queryByLabelText('Cancel')).toBeNull();
    await fireEvent.press(getByLabelText('Cancel'));
    expect(queryByTestId('sheet-scroll')).toBeNull();
  });

  it('S-IN-09: the current choice is a selected state, not only a check mark', async () => {
    const options = [
      { value: 'GBP', label: 'GBP · Pound' },
      { value: 'EUR', label: 'EUR · Euro' },
    ];
    const { getByRole } = await wrap(
      <OptionPicker visible title="Currency" options={options} selected="EUR" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    expect(getByRole('button', { name: 'EUR · Euro' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(getByRole('button', { name: 'GBP · Pound' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('S-IN-09: the scope question is a header', async () => {
    const { getByRole } = await wrap(
      <EditScopePrompt visible onThisOne={jest.fn()} onThisAndFuture={jest.fn()} onCancel={jest.fn()} />
    );
    expect(getByRole('header', { name: 'Edit this one, or this and future?' })).toBeTruthy();
  });
});
