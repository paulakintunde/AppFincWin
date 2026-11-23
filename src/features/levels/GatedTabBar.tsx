// 07-11 (D-16): the tab bar with Insights shown from Everyday (level 2). A hook cannot run inside the Tabs tabBar render prop, so this wrapper reads access.
import React, { useMemo } from 'react';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { TAB_AVAILABILITY } from '@/shell/tabBar/availableTabs';
import { TabBar } from '@/shell/tabBar/TabBar';
import { useFeatureAccess } from './useFeatureAccess';

export function GatedTabBar(props: BottomTabBarProps): React.JSX.Element {
  const insights = useFeatureAccess('insights').visible;
  const availability = useMemo(() => ({ ...TAB_AVAILABILITY, insights }), [insights]);
  return <TabBar {...props} availability={availability} />;
}
