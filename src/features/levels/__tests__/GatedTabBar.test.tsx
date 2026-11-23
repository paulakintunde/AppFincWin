// 07-11 (D-16): Insights shows in the bar only when useFeatureAccess('insights') is visible.
import React from 'react';
import { screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { renderWithShellProviders } from '@/shell/__tests__/testUtils';
import { GatedTabBar } from '../GatedTabBar';

jest.setTimeout(60000);
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
let mockVisible = false;
jest.mock('../useFeatureAccess', () => ({ useFeatureAccess: () => ({ visible: mockVisible }) }));

function props(names: string[]): BottomTabBarProps {
  return {
    state: { index: 0, routes: names.map((name) => ({ key: `${name}-k`, name })) },
    descriptors: {},
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
}

describe('GatedTabBar', () => {
  it('hides Insights below Everyday: four tabs', async () => {
    mockVisible = false;
    await renderWithShellProviders(<GatedTabBar {...props(['home', 'activity', 'decide', 'grow'])} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByLabelText('Decide, tab, 3 of 4')).toBeTruthy();
    expect(screen.queryByLabelText('Insights, tab, 5 of 5')).toBeNull();
  });

  it('shows Insights as 5 of 5 from Everyday', async () => {
    mockVisible = true;
    await renderWithShellProviders(<GatedTabBar {...props(['home', 'activity', 'decide', 'grow', 'insights'])} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByLabelText('Insights, tab, 5 of 5')).toBeTruthy();
  });
});
