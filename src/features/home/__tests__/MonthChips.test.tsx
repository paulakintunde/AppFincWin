import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors as lightColors } from '@/theme/tokens';
import { MonthChips } from '../MonthChips';

jest.setTimeout(30000);

async function draw(selected = '2026-09', locale = 'en-GB', months = ['2026-10', '2026-09', '2026-08']) {
  const onChange = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <MonthChips months={months} selected={selected} locale={locale} onChange={onChange} />
    </ThemeProvider>
  );
  return { ...utils, onChange };
}

describe('MonthChips', () => {
  it('lists months oldest first with short names', async () => {
    const { getAllByRole } = await draw();
    const labels = getAllByRole('tab').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['August, 2026', 'September, 2026', 'October, 2026']);
  });

  it('marks the selected chip ink on surface text, others fill1 on inkMuted', async () => {
    const { getByLabelText, getByText } = await draw();
    const selected = getByLabelText('September, 2026');
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(lightColors.ink);
    expect(StyleSheet.flatten(getByText('Sept').props.style).color).toBe(lightColors.surface);
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

  it('keeps neighbouring hit areas from overlapping', async () => {
    const { getByLabelText } = await draw();
    const { left, right } = getByLabelText('October, 2026').props.hitSlop;
    expect(left).toBeLessThanOrEqual(2);
    expect(right).toBeLessThanOrEqual(2);
  });

  it('shows the locale short month name uncut', async () => {
    const fr = await draw('2026-07', 'fr-FR', ['2026-07']);
    const expected = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 6, 1));
    expect(expected.length).toBeGreaterThan(3);
    expect(fr.getByText(expected)).toBeTruthy();
  });

  it('shows the uncut en-GB short name (Sept) for September', async () => {
    const { getByText } = await draw('2026-09');
    expect(getByText('Sept')).toBeTruthy();
  });
});
