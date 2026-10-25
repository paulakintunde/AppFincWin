/**
 * 05-115 (D-95, D-99; UI-SPEC R17.3 "Quiet rows"): a full-width row on the canvas, with no card chrome. Label body 500
 * ink, value meta 600 inkMuted (stacked under the label by rule S), an optional warn1 second line, an 8px inkSoft3
 * chevron. Pressed fill6 with a selection haptic. A11y: "{label}, {value}" as a button. Separators are 1px line1 between
 * rows only (`isLast` drops the one below the last row). Placed by 05-117.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { hapticSelection } from '@/ui/haptics';
import { useShouldStack } from '../ui/textFit';

export interface HomeRowProps {
  label: string;
  value?: string;
  /** A meta line in warn1 under the row (Open checks: "{{count}} changed since you looked"). */
  secondLine?: string;
  onPress: () => void;
  /** No separator below the last row. */
  isLast?: boolean;
}

const CHEVRON = 8;

export function HomeRow({ label, value, secondLine, onPress, isLast = false }: HomeRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack(value?.length);
  const a11yLabel = value ? t('decide.home.rows.a11y', { label, value }) : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.fill6 : 'transparent', borderBottomColor: colors.line1, borderBottomWidth: isLast ? 0 : 1 },
      ]}
    >
      <View style={styles.main}>
        <View style={stacked ? styles.stack : styles.line}>
          <Text style={[stacked ? null : styles.label, { ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }]}>{label}</Text>
          {value ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, fontWeight: '600', color: colors.inkMuted, flexShrink: 1 }}>{value}</Text>
          ) : null}
        </View>
        {secondLine ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{secondLine}</Text>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkSoft3 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    paddingVertical: space.rowPadDense,
  },
  main: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  stack: { gap: 2 },
  label: { flex: 1 },
  chevron: {
    width: CHEVRON,
    aspectRatio: 1,
    borderTopWidth: 2,
    borderRightWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
});
