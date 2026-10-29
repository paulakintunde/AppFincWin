/**
 * Plan 05.2-35 (D-19, UI-SPEC "Test-account setup page", item 3): the engine readout. A fill1 card with the eyebrow
 * "WHAT DECIDE RECEIVES" and a "Test accounts only" chip, then a two-column list: label in inkMuted, value in ink 600.
 * The columns stack above 1.3x text, under 360 dp, or when a value is long (the shared D-76 rule S). Text is selectable so
 * the owner can copy a figure. inkFaint is not used on this card (the inkMuted pairing is 4.70:1 on fill1).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { useShouldStack } from '../ui/textFit';

export interface ReadoutDisplayRow {
  id: string;
  label: string;
  value: string;
}

function ReadoutRowView({ row }: { row: ReadoutDisplayRow }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const t = useT();
  const stacked = useShouldStack(row.value.length);
  const metaStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  return (
    <View
      accessible
      accessibilityLabel={t('decide.setupPage.rowA11y', { label: row.label, value: row.value })}
      style={stacked ? styles.stack : styles.line}
    >
      <Text selectable style={[stacked ? null : styles.label, metaStyle, { fontWeight: '400', color: colors.inkMuted }]}>
        {row.label}
      </Text>
      <Text selectable style={[stacked ? null : styles.value, metaStyle, { fontWeight: '600', color: colors.ink }]}>
        {row.value}
      </Text>
    </View>
  );
}

export function EngineReadoutCard({ rows }: { rows: readonly ReadoutDisplayRow[] }): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View
      accessibilityLabel={t('decide.setupPage.readoutA11y')}
      style={[styles.card, { backgroundColor: colors.fill1 }]}
    >
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted, letterSpacing: 1.2, flexShrink: 1 }}
        >
          {t('decide.setupPage.readoutEyebrow')}
        </Text>
        <View style={[styles.chip, { backgroundColor: colors.fill2 }]}>
          <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.inkDim }}>
            {t('decide.setupPage.readoutChip')}
          </Text>
        </View>
      </View>
      <View style={styles.rows}>
        {rows.map((row) => (
          <ReadoutRowView key={row.id} row={row} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.gapMd, rowGap: space.gapSm },
  chip: { alignSelf: 'flex-start', paddingHorizontal: space.gapMd, paddingVertical: 4, borderRadius: radii.pill },
  rows: { gap: space.gapMd },
  line: { flexDirection: 'row', alignItems: 'flex-start', columnGap: space.gapMd },
  stack: { gap: 2 },
  label: { flex: 1 },
  value: { flex: 1, textAlign: 'right' },
});
