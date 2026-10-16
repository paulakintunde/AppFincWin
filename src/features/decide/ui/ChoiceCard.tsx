/** UI-SPEC Step 2: a radio card. Selected is an ink fill with surface text. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';

export interface ChoiceCardProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  flag?: string;
  accessibilityLabel: string;
  children?: React.ReactNode;
}

export function ChoiceCard({ selected, onPress, title, flag, accessibilityLabel, children }: ChoiceCardProps) {
  const { colors, pairing } = useTheme();
  const textColor = selected ? colors.surface : colors.ink;
  const flagColor = selected ? colors.inkSoft1 : colors.inkMuted;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: selected ? colors.ink : colors.surface, borderColor: selected ? colors.ink : colors.line2 },
        { opacity: pressed ? PRESSED_OPACITY : 1 },
      ]}
    >
      <View style={styles.head}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: textColor, flexShrink: 1 }}>{title}</Text>
        {flag ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: flagColor }}>{flag}</Text>
        ) : null}
      </View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: space.touchMin,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: space.cardPad,
    gap: space.gapSm,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
});
