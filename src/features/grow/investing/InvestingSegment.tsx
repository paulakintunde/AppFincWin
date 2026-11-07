// 06-15 (G01): the Investing segment's empty state. Plan 06-18 fills the populated segment (hero, allocation, holdings) behind this.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

export interface InvestingSegmentProps {
  onAdd: () => void;
}

export function InvestingSegment({ onAdd }: InvestingSegmentProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="grow-investing-empty" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
      <GrowGlyph name="invest" color={colors.accent} size={28} />
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.investing.emptyTitle')}</Text>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.investing.emptyBody')}</Text>
      <Pill label={t('grow.investing.emptyAction')} variant="primary" onPress={onAdd} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.gapSm, borderWidth: 1, borderRadius: radii.card, padding: space.cardPadLg },
});
