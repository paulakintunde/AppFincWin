import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { loggedSource, month, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { canChooseJudgeOn, JudgeOnButton, JudgeOnSheet } from '../JudgeOnControl';

jest.setTimeout(30000);

const mockHaptic = jest.fn();
jest.mock('@/ui/haptics', () => ({ hapticSelection: () => mockHaptic() }));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (node: React.ReactNode) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
const four = ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));

describe('JudgeOnControl', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-107 canChooseJudgeOn needs a logged source with 3 or more full months', () => {
    expect(canChooseJudgeOn(loggedSource({ months: four }))).toBe(true);
    expect(canChooseJudgeOn(loggedSource({ months: four.slice(2) }))).toBe(false);
    expect(canChooseJudgeOn(roughSource())).toBe(false);
    expect(canChooseJudgeOn(noneSource())).toBe(false);
    expect(canChooseJudgeOn(null)).toBe(false);
  });

  it('D-107 the button names the choice with an arrow and is a button', async () => {
    const onPress = jest.fn();
    await wrap(<JudgeOnButton selected="worst" canChoose onPress={onPress} />);
    await fireEvent.press(screen.getByText('Worst month ▾'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Judged on Worst month. Opens the choices.').props.accessibilityRole).toBe('button');
  });

  it('D-107 nothing shows until the choice has been read, and a plain label under 3 months', async () => {
    const view = await wrap(<JudgeOnButton selected={null} canChoose onPress={jest.fn()} />);
    expect(screen.queryByText(/This month/)).toBeNull();
    await view.unmount();
    await wrap(<JudgeOnButton selected="month" canChoose={false} onPress={jest.fn()} />);
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('D-107 the sheet lists three radios, marks the selected one and closes on a choice with a haptic', async () => {
    const onChoose = jest.fn();
    const onClose = jest.fn();
    await wrap(<JudgeOnSheet visible selected="average" fallback={null} onChoose={onChoose} onClose={onClose} />);
    expect(screen.getByText('The card and every check use this choice.')).toBeTruthy();
    const rows = screen.getAllByRole('radio');
    expect(rows.map((r) => r.props.accessibilityState.checked)).toEqual([false, false, true]);
    for (const r of rows) expect(StyleSheet.flatten(r.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(screen.getByLabelText('Worst month'));
    expect(onChoose).toHaveBeenCalledWith('worst');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });
});
