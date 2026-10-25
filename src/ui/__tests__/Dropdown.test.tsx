import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors } from '@/theme/tokens';
import { BACKDROP_OPACITY } from '../sheetDrag';
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

describe('Dropdown backdrop (D-37)', () => {
  it('renders an ink backdrop at the sheet opacity under the Close pressable, which still closes', async () => {
    const { getByLabelText, getByTestId, queryByText } = await setup();
    await fireEvent.press(getByLabelText('Sort: Alpha, opens a menu'));
    const fill = getByTestId('dropdown-backdrop-fill');
    const style = StyleSheet.flatten(fill.props.style);
    expect(style.backgroundColor).toBe(colors.ink);
    expect(style.opacity).toBe(BACKDROP_OPACITY);
    expect(fill.props.pointerEvents).toBe('none');
    await fireEvent.press(getByLabelText('Close'));
    expect(queryByText('Pick')).toBeNull();
  });
});

describe('Dropdown glyph variant and danger option (D-73)', () => {
  async function setupGlyph() {
    const onSelect = jest.fn();
    const utils = await render(
      <ThemeProvider>
        <Dropdown
          title="Row"
          variant="glyph"
          glyph={<Text>{'GLYPH'}</Text>}
          options={[{ key: 'open', label: 'Open' }, { key: 'delete', label: 'Delete', tone: 'danger' }]}
          onSelect={onSelect}
          triggerA11yLabel="More for Row"
        />
      </ThemeProvider>,
    );
    return { ...utils, onSelect };
  }

  it('glyph variant renders a 44 trigger with only the glyph', async () => {
    const { getByLabelText, getByText, queryByText } = await setupGlyph();
    const style = StyleSheet.flatten(getByLabelText('More for Row').props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(getByText('GLYPH')).toBeTruthy();
    expect(queryByText('Row')).toBeNull();
  });

  it('a danger option renders in the danger colour', async () => {
    const { getByLabelText, getByText } = await setupGlyph();
    await fireEvent.press(getByLabelText('More for Row'));
    expect(StyleSheet.flatten(getByText('Delete').props.style).color).toBe(colors.danger);
    expect(StyleSheet.flatten(getByText('Open').props.style).color).toBe(colors.ink);
  });
});

describe('Dropdown action menu (no value)', () => {
  async function setupAction() {
    const onSelect = jest.fn();
    const utils = await render(
      <ThemeProvider>
        <Dropdown title="Pick" options={options} triggerLabel="More" onSelect={onSelect} triggerA11yLabel="More actions" />
      </ThemeProvider>,
    );
    return { ...utils, onSelect };
  }

  it('shows the trigger label and no selected dots', async () => {
    const { getByLabelText, getByText, queryByTestId } = await setupAction();
    expect(getByText('More')).toBeTruthy();
    await fireEvent.press(getByLabelText('More actions'));
    for (const k of ['a', 'b']) expect(queryByTestId(`dropdown-dot-${k}`)).toBeNull();
    expect(getByLabelText('Beta').props.accessibilityState?.selected).toBeFalsy();
  });

  it('selecting calls onSelect once and closes', async () => {
    const { getByLabelText, queryByText, onSelect } = await setupAction();
    await fireEvent.press(getByLabelText('More actions'));
    await fireEvent.press(getByLabelText('Beta'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(queryByText('Pick')).toBeNull();
  });
});
