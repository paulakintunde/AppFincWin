// 06-21: "Make this the plan" before -> after rows. Each row reads as one sentence; the arrow is decorative.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';

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

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** P4-IN-04: the row's one spoken sentence, translated ("Each month, from 50 dollars to 82 dollars 86 cents"). */
export function changeRowLabel(row: ChangeRow, t: Translate): string {
  return t('grow.calc.changeRowA11y', { label: row.label, before: row.beforeSpoken ?? row.before, after: row.afterSpoken ?? row.after });
}

export function ChangeRows({ rows }: { rows: readonly ChangeRow[] }) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  return (
    <View>
      {rows.map((row) => (
        <View
          key={row.key}
          testID={`change-row-${row.key}`}
          accessible
          accessibilityLabel={changeRowLabel(row, t)}
          style={[styles.row, { minHeight: space.touchMin }]}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{row.label}</Text>
          <View style={styles.values} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.label, color: colors.inkMuted }}>{row.before}</Text>
            <StateGlyph name="chev" color={colors.inkMuted} size={14} />
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
