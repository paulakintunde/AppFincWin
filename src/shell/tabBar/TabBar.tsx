// NAV-01 / NAV-06: the custom tab bar. D-01 order, D-02 availability, D-05 back steps slide in
// reverse (the registered switcher marks them), D-08 re-tap only emits tabPress (the root scrolls
// to top), D-18 no haptic on tab change, D-19 capped labels, D-20 "{label}, tab, {n} of {total}".
// Never call useNavigation() here, research Pitfall 4: the navigation prop is the only handle.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { fontSize } from '@/theme/typography';
import { space } from '@/theme/layout';
import { useBackHistory } from '../backHistory/BackHistoryProvider';
import { useShellLayout } from '../layout/ShellLayoutProvider';
import { TabGlyph } from './TabGlyphs';
import { markBackStep } from './tabSlide';
import { TAB_AVAILABILITY, isTabAvailable, tabPosition } from './availableTabs';
import { isTabId, type TabId } from './tabs';

export interface TabBarProps extends BottomTabBarProps {
  availability?: Readonly<Record<TabId, boolean>>;
}

export function TabBar({
  state,
  navigation,
  insets,
  availability = TAB_AVAILABILITY,
}: TabBarProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { registerTabSwitcher } = useBackHistory();
  const { setTabBarHeight } = useShellLayout();

  useEffect(() => {
    // History's goBack is the only caller, so every call is a back step (D-05).
    registerTabSwitcher((tab) => {
      markBackStep();
      navigation.navigate({ name: tab, merge: true } as never);
    });
    return () => registerTabSwitcher(null);
  }, [navigation, registerTabSwitcher]);

  const visible = state.routes.filter(
    (r) => isTabId(r.name) && isTabAvailable(r.name, availability),
  );

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, space.tabBarPadBottomMin),
          borderTopColor: colors.line1,
        },
      ]}
    >
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
      {visible.map((route) => {
        const name = route.name as TabId;
        const focused = state.index === state.routes.indexOf(route);
        const color = focused ? colors.ink : colors.inkMuted;
        const pos = tabPosition(name, availability)!;
        const label = t(`shell.tab.${name}`);
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t('shell.tab.a11y', {
              label,
              position: pos.position,
              total: pos.total,
            })}
            style={styles.item}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate({ name, merge: true } as never);
              }
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          >
            <TabGlyph name={name} color={color} />
            <Text
              scale="capped"
              style={{ fontFamily: FONT_PAIRINGS[pairing].body[600], fontSize: fontSize.tabLabel, color }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.tabBarGap,
    paddingTop: space.tabBarPadTop,
    paddingHorizontal: space.tabBarPadH,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: space.tabItemGap,
    paddingVertical: space.tabItemPadV,
    minHeight: space.touchMin,
  },
});
