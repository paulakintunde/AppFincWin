import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { TabBar } from '../TabBar';
import { markBackStep } from '../tabSlide';
import { renderWithShellProviders } from '@/shell/__tests__/testUtils';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors } from '@/theme/tokens';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import * as haptics from '@/ui/haptics';

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@/ui/haptics');
jest.mock('../tabSlide', () => ({
  ...jest.requireActual('../tabSlide'),
  markBackStep: jest.fn(),
}));

const TWO = { home: true, activity: true, decide: false, grow: false, insights: false };
const ALL = { home: true, activity: true, decide: true, grow: true, insights: true };

function makeProps(names: string[], index: number, extra?: Record<string, unknown>) {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const props = {
    state: { index, routes: names.map((name) => ({ key: `${name}-k`, name })) },
    descriptors: {},
    navigation,
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
    availability: TWO,
    ...extra,
  };
  return { props: props as unknown as BottomTabBarProps, navigation };
}

describe('TabBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders exactly the available tabs with n of total labels', async () => {
    const { props } = makeProps(['home', 'activity'], 0);
    await renderWithShellProviders(<TabBar {...props} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByLabelText('Home, tab, 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Activity, tab, 2 of 2')).toBeTruthy();
  });

  it('ships Home, Activity and Decide by default (05-21)', async () => {
    const { props } = makeProps(['home', 'activity', 'decide'], 2, { availability: undefined });
    await renderWithShellProviders(<TabBar {...props} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByLabelText('Decide, tab, 3 of 3').props.accessibilityState.selected).toBe(true);
  });

  it('labels the centre Decide button 3 of 5 when all are available', async () => {
    const { props } = makeProps(['home', 'activity', 'decide', 'grow', 'insights'], 0, {
      availability: ALL,
    });
    await renderWithShellProviders(<TabBar {...props} />);
    expect(screen.getByLabelText('Decide, tab, 3 of 5')).toBeTruthy();
  });

  it('colours the focused label ink and the rest inkMuted, and marks selected', async () => {
    const { props } = makeProps(['home', 'activity'], 0);
    await renderWithShellProviders(<TabBar {...props} />);
    expect(screen.getByLabelText('Home, tab, 1 of 2').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Activity, tab, 2 of 2').props.accessibilityState.selected).toBe(false);
    expect(StyleSheet.flatten(screen.getByText('Home').props.style).color).toBe(colors.ink);
    expect(StyleSheet.flatten(screen.getByText('Activity').props.style).color).toBe(colors.inkMuted);
  });

  it('navigates on an unfocused press after emitting tabPress', async () => {
    const { props, navigation } = makeProps(['home', 'activity'], 0);
    await renderWithShellProviders(<TabBar {...props} />);
    await fireEvent.press(screen.getByLabelText('Activity, tab, 2 of 2'));
    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'activity-k',
      canPreventDefault: true,
    });
    expect(navigation.navigate).toHaveBeenCalledWith({ name: 'activity', merge: true });
  });

  it('emits but does not navigate on the focused tab', async () => {
    const { props, navigation } = makeProps(['home', 'activity'], 0);
    await renderWithShellProviders(<TabBar {...props} />);
    await fireEvent.press(screen.getByLabelText('Home, tab, 1 of 2'));
    expect(navigation.emit).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when tabPress is default-prevented', async () => {
    const { props, navigation } = makeProps(['home', 'activity'], 0);
    navigation.emit.mockReturnValue({ defaultPrevented: true });
    await renderWithShellProviders(<TabBar {...props} />);
    await fireEvent.press(screen.getByLabelText('Activity, tab, 2 of 2'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('fires no haptic on tab press', async () => {
    const { props } = makeProps(['home', 'activity'], 0);
    await renderWithShellProviders(<TabBar {...props} />);
    await fireEvent.press(screen.getByLabelText('Activity, tab, 2 of 2'));
    for (const fn of Object.values(haptics)) {
      if (jest.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it('registers a back-step switcher and clears it on unmount', async () => {
    const { props, navigation } = makeProps(['home', 'activity'], 1);
    const registerTabSwitcher = jest.fn();
    const r = await renderWithShellProviders(<TabBar {...props} />, {
      backHistory: { registerTabSwitcher },
    });
    const fn = registerTabSwitcher.mock.calls[0][0];
    fn('home');
    expect(markBackStep).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith({ name: 'home', merge: true });
    await r.unmount();
    expect(registerTabSwitcher).toHaveBeenLastCalledWith(null);
  });

  it('reports its height and pads the bottom by the inset', async () => {
    const { props } = makeProps(['home', 'activity'], 0);
    function Probe() {
      return <Text testID="h">{String(useShellLayout().tabBarHeight)}</Text>;
    }
    await renderWithShellProviders(
      <>
        <TabBar {...props} />
        <Probe />
      </>,
    );
    const bar = screen.getByTestId('tab-bar');
    expect(StyleSheet.flatten(bar.props.style).paddingBottom).toBe(34);
    await fireEvent(bar, 'layout', { nativeEvent: { layout: { height: 83, width: 390, x: 0, y: 0 } } });
    expect(screen.getByTestId('h').props.children).toBe('83');
  });

  it('caps the label at 1.3x', async () => {
    const { props } = makeProps(['home', 'activity'], 0);
    await renderWithShellProviders(
      <FontScaleProvider value={3}>
        <TabBar {...props} />
      </FontScaleProvider>,
    );
    expect(StyleSheet.flatten(screen.getByText('Home').props.style).fontSize).toBeCloseTo(13.65);
  });
});
