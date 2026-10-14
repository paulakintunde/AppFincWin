import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors as lightColors } from '@/theme/tokens';
import { MonthChips } from '../MonthChips';

jest.setTimeout(30000);

async function draw(selected = '2026-09') {
  const onChange = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <MonthChips months={['2026-10', '2026-09', '2026-08']} selected={selected} locale="en-GB" onChange={onChange} />
    </ThemeProvider>
  );
  return { ...utils, onChange };
}

describe('MonthChips', () => {
  it('lists months oldest first with short names', async () => {
    const { getAllByRole } = await draw();
    const labels = getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['August, 2026', 'September, 2026', 'October, 2026']);
  });

  it('marks the selected chip ink on surface text, others fill1 on inkMuted', async () => {
    const { getByLabelText, getByText } = await draw();
    const selected = getByLabelText('September, 2026');
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(lightColors.ink);
    expect(StyleSheet.flatten(getByText('Sep').props.style).color).toBe(lightColors.surface);
    const other = getByLabelText('October, 2026');
    expect(other.props.accessibilityState).toEqual({ selected: false });
    expect(StyleSheet.flatten(other.props.style).backgroundColor).toBe(lightColors.fill1);
    expect(StyleSheet.flatten(getByText('Oct').props.style).color).toBe(lightColors.inkMuted);
  });

  it('reports the pressed month and has a hit area of at least 44', async () => {
    const { getByLabelText, onChange } = await draw();
    const chip = getByLabelText('October, 2026');
    expect(chip.props.hitSlop.top + chip.props.hitSlop.bottom + 26).toBeGreaterThanOrEqual(44);
    await fireEvent.press(chip);
    expect(onChange).toHaveBeenCalledWith('2026-10');
  });
});
