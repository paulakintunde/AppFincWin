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
 * Safe-area-aware screen container (DSG-03). Top padding is always
 * `insets.top + space.headerExtra`, never a hardcoded value.
 */
export function Screen({ children, scroll = false, style }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useScreenInsets();

  const paddingStyle: ViewStyle = {
    backgroundColor: colors.canvas,
    paddingTop: insets.headerTop,
    paddingBottom: insets.bottom,
    paddingHorizontal: space.screenH,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.base, { backgroundColor: colors.canvas }]}
        contentContainerStyle={[paddingStyle, style]}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.base, paddingStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});
