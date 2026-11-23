// 07-10 (INS-01, D-09..D-11, D-22, D-23, D-24): the Net worth card. The figure and the change line are ink with a glyph and a word; the only
// colour on the card is NetWorthLine's theme-colour line. Every number comes from the engine's series; the one change from the engine is a sign flip for the words.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FigureScope } from '@/data/queries/figureScope';
import { useNetWorthSeries, type NetWorthSeriesState } from '@/data/queries/insightsNetWorth';
import type { InsightsRange } from '@/engine/insights';
import { useDetailFormat } from '@/features/decide/screens/answer/detail/detailKit';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';
import { NetWorthLine } from '../charts/NetWorthLine';
import { Card, ErrorCard, LoadingBlock } from './cardBits';

export interface NetWorthSectionViewProps {
  state: NetWorthSeriesState;
  scope: FigureScope;
  range: InsightsRange;
  currency: string;
  onAddAccount: () => void;
}

const PERIOD_KEY = { '6m': 'insights.range.periodSixMonths', '1y': 'insights.range.periodOneYear', all: 'insights.range.periodAll' } as const;

export function NetWorthSectionView({ state, scope, range, currency, onAddAccount }: NetWorthSectionViewProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const [selected, setSelected] = useState<number | null>(null);

  if (state.status === 'error') return <ErrorCard onRetry={state.retry} testID="net-worth-error" />;
  if (state.status === 'loading') return <LoadingBlock testID="net-worth-loading" height={260} />;

  const title = (
    <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
      {t('insights.netWorth.title')}
    </Text>
  );
  if (state.noAccounts || state.current === null) {
    return (
      <Card testID="net-worth-section">
        {title}
        <EmptyState
          heading={t('insights.netWorth.emptyHeading')}
          body={t('insights.netWorth.emptyBody')}
          icon="info"
          actionLabel={t('insights.netWorth.emptyAction')}
          onAction={onAddAccount}
          testID="net-worth-empty"
        />
      </Card>
    );
  }

  const { current, change, points } = state;
  const period = t(PERIOD_KEY[range]);
  let changeLine: string | null = null;
  let glyph: 'stateUp' | 'stateDown' | null = null;
  if (change !== null) {
    if (change.change > 0) {
      changeLine = t('insights.netWorth.up', { amount: f.money(change.change), period });
      glyph = 'stateUp';
    } else if (change.change < 0) {
      changeLine = t('insights.netWorth.down', { amount: f.money(-change.change), period });
      glyph = 'stateDown';
    } else {
      changeLine = t('insights.netWorth.flat', { period });
    }
    if (current < 0) changeLine = `${changeLine}, ${t('insights.netWorth.owedMore')}`;
  }
  const summary = change !== null ? t('insights.netWorth.summary', { period, from: f.spoken(change.from), to: f.spoken(change.to) }) : t('insights.netWorth.chartA11y');

  const notes: { key: string; text: string }[] = [
    { key: 'rates', text: t('insights.netWorth.notes.rates') },
    { key: 'scope', text: scope === 'household' ? t('insights.netWorth.notes.householdScope') : t('insights.netWorth.notes.mineScope') },
  ];
  if (state.debtsHeldFlat) notes.push({ key: 'debts', text: t('insights.netWorth.notes.debtsHeldFlat') });
  if (state.holdingsLeftOut) notes.push({ key: 'holdings', text: t('insights.netWorth.notes.holdingsFromFirstValue') });
  if (state.unconverted > 0) notes.push({ key: 'unconverted', text: t('insights.netWorth.notes.unconverted', { count: state.unconverted }) });

  return (
    <Card testID="net-worth-section">
      {title}
      <View style={styles.figureBlock}>
        <Text
          testID="net-worth-figure"
          scale="capped"
          accessibilityLabel={f.spoken(current)}
          style={{ ...textRole(pairing, 'display'), fontSize: fontSize.netWorth, lineHeight: fontSize.netWorth * 1.1, color: colors.ink, fontVariant: ['tabular-nums'] }}
        >
          {f.money(current)}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('insights.netWorth.asOfToday')}</Text>
        {changeLine !== null ? (
          <View style={styles.changeRow}>
            {glyph !== null ? <Glyph name={glyph} size={16} color={colors.inkDim} testID="net-worth-change-glyph" /> : null}
            <Text testID="net-worth-change" style={{ ...textRole(pairing, 'label'), color: colors.inkDim, flexShrink: 1 }}>
              {changeLine}
            </Text>
          </View>
        ) : null}
      </View>
      {points.length >= 2 ? (
        <NetWorthLine
          points={points}
          currency={currency}
          selected={selected}
          onSelect={(i) => setSelected((cur) => (cur === i ? null : i))}
          summary={summary}
        />
      ) : (
        <EmptyState heading={t('insights.netWorth.onePointHeading')} body={t('insights.netWorth.onePointBody')} testID="net-worth-one-point" />
      )}
      <View style={styles.notes}>
        {notes.map((n) => (
          <View key={n.key} style={styles.changeRow}>
            <Glyph name="info" size={16} color={colors.inkMuted} />
            <Text testID={`net-worth-note-${n.key}`} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1 }}>
              {n.text}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function NetWorthSection({ range, scope, currency, onAddAccount }: { range: InsightsRange; scope: FigureScope; currency: string; onAddAccount: () => void }) {
  const state = useNetWorthSeries({ range, scope, currency });
  return <NetWorthSectionView state={state} scope={scope} range={range} currency={currency} onAddAccount={onAddAccount} />;
}

const styles = StyleSheet.create({
  figureBlock: { gap: step.hair },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: step.tight },
  notes: { gap: step.tight },
});
