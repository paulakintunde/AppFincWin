// 06-15 (G01): the Debts segment's empty state. Plan 06-17 fills the populated segment (hero, payoff plan, rows) behind this.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

export interface DebtsSegmentProps {
  onAdd: () => void;
}

export function DebtsSegment({ onAdd }: DebtsSegmentProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="grow-debts-empty" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
      <GrowGlyph name="debt" color={colors.accent} size={28} />
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.debts.emptyTitle')}</Text>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.debts.emptyBody')}</Text>
      <Pill label={t('grow.debts.emptyAction')} variant="primary" onPress={onAdd} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.gapSm, borderWidth: 1, borderRadius: radii.card, padding: space.cardPadLg },
});
