// 07-10 (INS-06, D-01..D-06, D-19): the Score card. The score describes the figures behind it and is never a rating: the number is ink, the fixed
// sentence says "from these figures", and the only state colour on the card is the Short badge (symbol + word). The score always reads the Mine
// prepared input; in Household the card is replaced by a pointer to Just me and the engine is not called.
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FigureScope } from '@/data/queries/figureScope';
import type { Prepared } from '@/engine/decide/v3';
import { healthInputsOf, healthScore, type HealthMissing, type HealthPart } from '@/engine/health';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { FadeIn } from '@/ui/motion/FadeIn';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ProgressBar } from '@/ui/ProgressBar';
import { Row } from '@/ui/Row';
import { StateBadge } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import { tenthsText } from '../format';
import { Card, ErrorCard, LoadingBlock, TextButton } from './cardBits';

export interface ScoreCardProps {
  scope: FigureScope;
  minePrepared: Prepared | null;
  status: 'loading' | 'error' | 'ready';
  onSwitchToMine: () => void;
  onGapAction: (missing: HealthMissing) => void;
  onRetry: () => void;
}

export function ScoreCard({ scope, minePrepared, status, onSwitchToMine, onGapAction, onRetry }: ScoreCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { locale } = useMoneyFormatter(false);
  const mine = scope === 'mine';
  const result = useMemo(() => (!mine || minePrepared === null ? null : healthScore(healthInputsOf(minePrepared))), [mine, minePrepared]);

  if (!mine) {
    return (
      <Card testID="score-household">
        <Row label={t('insights.score.householdRow')} />
        <TextButton label={t('insights.score.switchToMine')} onPress={onSwitchToMine} testID="score-switch" />
      </Card>
    );
  }
  if (status === 'error') return <ErrorCard onRetry={onRetry} testID="score-error" />;
  if (result === null || status === 'loading') return <LoadingBlock testID="score-loading" height={300} />;

  const title = (
    <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
      {t('insights.score.title')}
    </Text>
  );
  const eyebrow = (badge: boolean) => (
    <View style={styles.eyebrowRow}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, flexShrink: 1 }}>{t('insights.score.eyebrow')}</Text>
      {badge ? <StateBadge tone="short" shape="sDown" label={t('insights.score.shortBadge')} testID="score-short-badge" /> : null}
    </View>
  );
  const figureStyle = { ...textRole(pairing, 'display'), fontSize: fontSize.healthScore, lineHeight: fontSize.healthScore * 1.1, color: colors.ink };

  if (result.kind === 'thin') {
    return (
      <Card testID="score-card">
        {title}
        {eyebrow(false)}
        <Text testID="score-figure" scale="capped" style={figureStyle}>
          {t('insights.score.dash')}
        </Text>
        <Text testID="score-gap" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {t(`insights.score.gap.${result.missing}`)}
        </Text>
        <TextButton label={t(`insights.score.gapAction.${result.missing}`)} onPress={() => onGapAction(result.missing)} testID="score-gap-action" />
      </Card>
    );
  }

  const fixed = t('insights.score.fixed', { score: result.score });
  const figureText = (p: HealthPart): string => {
    switch (p.id) {
      case 'kept':
        return t('insights.score.parts.kept.figure', { percent: p.figure });
      case 'cover':
        return t('insights.score.parts.cover.figure', { count: p.figure / 10, months: tenthsText(p.figure, locale) });
      case 'debt':
        return p.figure === 0 ? t('insights.score.parts.debt.none') : t('insights.score.parts.debt.figure', { percent: p.figure });
      case 'billsToPay':
        return p.figure === 0 ? t('insights.score.parts.billsToPay.none') : t('insights.score.parts.billsToPay.figure', { percent: p.figure });
    }
  };

  return (
    <Card testID="score-card">
      {title}
      {eyebrow(result.short)}
      <FadeIn once="insights-score">
        <View style={styles.figureRow} accessible accessibilityLabel={fixed}>
          <Text testID="score-figure" scale="capped" style={figureStyle}>
            {String(result.score)}
          </Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('insights.score.outOf')}</Text>
        </View>
      </FadeIn>
      <Text testID="score-fixed" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
        {fixed}
      </Text>
      {result.short ? (
        <Text testID="score-short-line" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
          {t('insights.score.shortLine')}
        </Text>
      ) : null}
      <View style={styles.parts}>
        {result.parts.map((p) => {
          const name = t(`insights.score.parts.${p.id}.name`);
          const figure = figureText(p);
          const points = t('insights.score.points', { points: p.points, max: p.max });
          return (
            <View
              key={p.id}
              testID={`score-part-${p.id}`}
              accessible
              accessibilityLabel={t('insights.score.partA11y', { name, figure, points: p.points, max: p.max })}
              style={styles.part}
            >
              <View style={styles.partHead}>
                <View style={styles.partText}>
                  <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{name}</Text>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{figure}</Text>
                </View>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{points}</Text>
              </View>
              <ProgressBar percent={Math.round((p.points * 100) / p.max)} variant="thin" tone="ink" />
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t(`insights.score.parts.${p.id}.sub`)}</Text>
            </View>
          );
        })}
        {result.capped ? (
          <Text testID="score-cap-line" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {t('insights.score.capLine', { points: result.capReduction })}
          </Text>
        ) : null}
      </View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('insights.score.footer')}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: step.tight, flexWrap: 'wrap' },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: step.tight },
  parts: { gap: step.card },
  part: { gap: step.hair },
  partHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: step.row },
  partText: { flexShrink: 1 },
});
