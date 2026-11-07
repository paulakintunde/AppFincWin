// 06-15 (G01, D-21): the "Tools · Calculators" row at the foot of every Grow segment. Opens the Calculators page (06-13).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useT } from '@/i18n';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';

export const CALCULATORS_HREF = '/grow/calculators' as Href;
export const LINES_HREF = '/grow/lines' as Href;

export function ToolsRow() {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
        {t('grow.home.toolsSection')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
        <Row
          leading={<GrowGlyph name="bills" color={colors.accent} size={22} />}
          label={t('grow.home.toolsCalculators')}
          sublabel={t('grow.home.toolsCalculatorsSub')}
          accessibilityLabel={`${t('grow.home.toolsSection')}, ${t('grow.home.toolsCalculators')}`}
          chevron
          onPress={() => pushOnce(CALCULATORS_HREF)}
        />
        <Row
          leading={<GrowGlyph name="lock" color={colors.accent} size={22} />}
          label={t('grow.lines.title')}
          sublabel={t('grow.home.toolsRulesSub')}
          accessibilityLabel={`${t('grow.home.toolsSection')}, ${t('grow.lines.title')}`}
          chevron
          onPress={() => pushOnce(LINES_HREF)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapSm },
  card: { borderWidth: 1, borderRadius: radii.card, paddingHorizontal: space.cardPad },
});
