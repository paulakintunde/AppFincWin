import React, { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';

export interface ScreenProps {
  children: ReactNode;
  /** Renders inside a ScrollView instead of a plain View. Defaults to false. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Safe-area-aware screen container (DSG-03). The first header block's top offset is always
 * `insets.top + space.headerExtra`, never a hardcoded value.
 *
 * In scroll mode the `insets.top` part is applied to a fixed canvas-coloured band OUTSIDE the
 * ScrollView, so the scroll viewport itself starts below the status bar and scrolled content is
 * clipped there rather than drawn beneath it (Android forced edge-to-edge). Only `headerExtra`
 * stays as content padding, so the resting layout is identical to the non-scroll case.
 */
export function Screen({ children, scroll = false, style }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useScreenInsets();

  if (scroll) {
    return (
      <View style={[styles.base, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
        <ScrollView
          style={[styles.base, { backgroundColor: colors.canvas }]}
          contentContainerStyle={[
            { paddingTop: space.headerExtra, paddingBottom: insets.bottom, paddingHorizontal: space.screenH },
            style,
          ]}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  const paddingStyle: ViewStyle = {
    backgroundColor: colors.canvas,
    paddingTop: insets.headerTop,
    paddingBottom: insets.bottom,
    paddingHorizontal: space.screenH,
  };

  return <View style={[styles.base, paddingStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});
