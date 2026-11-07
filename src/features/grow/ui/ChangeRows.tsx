// 06-21: "Make this the plan" before -> after rows. Each row reads as one sentence; the arrow is decorative.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { GrowGlyph } from './GrowGlyph';

export interface ChangeRow {
  key: string;
  label: string;
  /** Display text, e.g. "$50.00". */
  before: string;
  after: string;
  /** Spoken amounts, e.g. "50 dollars". Default to the display text. */
  beforeSpoken?: string;
  afterSpoken?: string;
}

export function changeRowLabel(row: ChangeRow): string {
  return `${row.label}, from ${row.beforeSpoken ?? row.before} to ${row.afterSpoken ?? row.after}`;
}

export function ChangeRows({ rows }: { rows: readonly ChangeRow[] }) {
  const { colors, pairing } = useTheme();
  return (
    <View>
      {rows.map((row) => (
        <View
          key={row.key}
          testID={`change-row-${row.key}`}
          accessible
          accessibilityLabel={changeRowLabel(row)}
          style={[styles.row, { minHeight: space.touchMin }]}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{row.label}</Text>
          <View style={styles.values} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.label, color: colors.inkMuted }}>{row.before}</Text>
            <GrowGlyph name="chev" color={colors.inkMuted} size={14} />
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{row.after}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  values: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
