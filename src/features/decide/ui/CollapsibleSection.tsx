/** UI-SPEC Collapsible sections: a 56px header button exposing `expanded`; children mount only
 * when open. Entrance animation is skipped under reduced motion. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';

const SECTION_HEADER_MIN = 56; // UI-SPEC collapsible header height

export interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  dark?: boolean;
  children?: React.ReactNode;
}

export function CollapsibleSection({ title, summary, expanded, onToggle, dark = false, children }: CollapsibleSectionProps) {
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const titleColor = dark ? colors.surface : colors.ink;
  const summaryColor = dark ? colors.inkSoft1 : colors.inkMuted;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: titleColor, flexShrink: 1 }}>{title}</Text>
        {summary ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: summaryColor }}>{summary}</Text>
        ) : null}
      </Pressable>
      {expanded ? (
        reduced ? (
          <View>{children}</View>
        ) : (
          <Animated.View entering={FadeIn.duration(DURATION.entrance)}>{children}</Animated.View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: SECTION_HEADER_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapMd,
  },
});
