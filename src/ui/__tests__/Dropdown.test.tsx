import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Dropdown } from '../Dropdown';
import { hapticSelection } from '../haptics';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('../haptics', () => ({ hapticSelection: jest.fn() }));

jest.setTimeout(20000);

const options = [
  { key: 'a', label: 'Alpha', subLabel: 'first', triggerLabel: 'A' },
  { key: 'b', label: 'Beta' },
] as const;

async function setup(extra: { disabled?: boolean } = {}) {
  const onSelect = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <Dropdown title="Pick" options={options} value="a" onSelect={onSelect} triggerA11yLabel="Sort: Alpha, opens a menu" {...extra} />
    </ThemeProvider>,
  );
  return { ...utils, onSelect };
}

describe('Dropdown', () => {
  it('shows the trigger label and a11y label, menu closed', async () => {
    const { getByLabelText, getByText, queryByText } = await setup();
    expect(getByLabelText('Sort: Alpha, opens a menu')).toBeTruthy();
    expect(getByText('A')).toBeTruthy();
    expect(queryByText('Pick')).toBeNull();
  });

  it('opens with title and rows, marking the selected row', async () => {
    const { getByLabelText, getByText } = await setup();
    await fireEvent.press(getByLabelText('Sort: Alpha, opens a menu'));
    expect(getByText('Pick')).toBeTruthy();
    expect(getByLabelText('Alpha, first').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Beta').props.accessibilityState.selected).toBe(false);
  });

  it('selecting a row calls onSelect once, fires haptic and closes', async () => {
    const { getByLabelText, queryByText, onSelect } = await setup();
    await fireEvent.press(getByLabelText('Sort: Alpha, opens a menu'));
    await fireEvent.press(getByLabelText('Beta'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(hapticSelection).toHaveBeenCalled();
    expect(queryByText('Pick')).toBeNull();
  });

  it('disabled does not open', async () => {
    const { getByLabelText, queryByText } = await setup({ disabled: true });
    await fireEvent.press(getByLabelText('Sort: Alpha, opens a menu'));
    expect(queryByText('Pick')).toBeNull();
  });
});
