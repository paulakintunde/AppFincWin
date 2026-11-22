// 09-22 (UI-SPEC 12, D-36, D-37): the in-context offer. A fill1 card with the feature's glyph, a question, one sentence of what it
// does, a small primary "Turn on" and two text links. Inline only: never a popup, never over content. Nothing turns on without
// the yes.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { Pill } from '@/ui/Pill';
import { RiseIn } from '@/ui/RiseIn';
import { Text } from '@/ui/Text';
import { accentTintOver } from '@/ui/EmptyState';
import { IconTile } from '@/ui/icons/IconTile';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { featureById, type FeatureId } from './featureRegistry';

type L = (key: string, params?: Record<string, string | number>) => string;

export interface OfferCardProps {
  featureId: FeatureId;
  onTurnOn: () => void;
  onNotNow: () => void;
  onDontSuggest: () => void;
}

/** "Balances, rates and minimums" reads inside the sentence as "balances, rates and minimums". */
function lowerFirst(s: string): string {
  return s === '' ? s : s.charAt(0).toLocaleLowerCase() + s.slice(1);
}

export function OfferCard({ featureId, onTurnOn, onNotNow, onDontSuggest }: OfferCardProps) {
  const t = useT() as unknown as L;
  const { colors, pairing } = useTheme();
  const def = featureById(featureId);
  const feature = t(`features.items.${featureId}.label`);
  const what = lowerFirst(t(`features.items.${featureId}.sub`));
  return (
    <RiseIn>
      <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID={`offer-${featureId}`}>
        <View style={styles.head}>
          <IconTile icon={def?.glyph ?? null} color={colors.accent} tint={accentTintOver(colors.fill1, colors.accent)} />
          <Text accessibilityRole="header" style={[{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }, styles.title]}>
            {t('features.offer.title', { feature })}
          </Text>
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('features.offer.body', { feature, what })}</Text>
        <View style={styles.actions}>
          <Pill label={t('features.offer.turnOn')} variant="primary" onPress={onTurnOn} />
          <PlanLink label={t('features.offer.notNow')} onPress={onNotNow} testID="offer-not-now" />
          <PlanLink label={t('features.offer.dontSuggest')} onPress={onDontSuggest} testID="offer-dont-suggest" />
        </View>
      </View>
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  title: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapMd },
});
