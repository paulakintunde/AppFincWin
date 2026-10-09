import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { MonthSwitcher } from '../MonthSwitcher';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const MONTHS = ['2026-11', '2026-10', '2026-09'];
const COUNTS = new Map([
  ['2026-11', 0],
  ['2026-10', 3],
  ['2026-09', 1],
]);

async function open(props: Partial<React.ComponentProps<typeof MonthSwitcher>> = {}) {
  const onChange = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <MonthSwitcher month="2026-10" months={MONTHS} locale="en-GB" onChange={onChange} counts={COUNTS} {...props} />
    </ThemeProvider>
  );
  await fireEvent.press(utils.getByLabelText('Choose month'));
  return { ...utils, onChange };
}

describe('MonthSwitcher list', () => {
  it('shows entry counts per month', async () => {
    const { getByText } = await open();
    expect(getByText('3 entries')).toBeTruthy();
    expect(getByText('1 entry')).toBeTruthy();
    expect(getByText('0 entries')).toBeTruthy();
  });

  it('marks the current month as selected', async () => {
    const { getByLabelText } = await open();
    expect(getByLabelText(/^October 2026/).props.accessibilityState).toEqual({ selected: true });
  });

  it('offers Add {Month} and selects it', async () => {
    const onAddMonth = jest.fn();
    const { getByText, onChange } = await open({ addMonth: '2026-12', onAddMonth });
    expect(getByText('Repeating lines carry over')).toBeTruthy();
    await fireEvent.press(getByText('Add December'));
    expect(onAddMonth).toHaveBeenCalledWith('2026-12');
    expect(onChange).toHaveBeenCalledWith('2026-12');
  });

  it('has no Add row when no month is addable', async () => {
    const { queryByText } = await open({ addMonth: null, onAddMonth: jest.fn() });
    expect(queryByText('Repeating lines carry over')).toBeNull();
  });
});
