/**
 * 05-15: the warning cards under the verdict (D-05). Card-reason cards first, then the engine's warnings in the order it
 * returned them (shortfall descending, at most six with cash_dip), then the neutral debt-rate fact. Nothing here decides;
 * it renders what warningCard / cardReasonCards return. Renders nothing without a verdict.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Assessment, Verdict } from '@/engine/decide';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { cardReasonCards, warningCard } from '../copy/warningCopy';
import { percentText } from '../copy/percentText';
import type { Fmt, WarnCard } from '../copy/types';
import { WarningCard } from '../ui/WarningCard';
import { refText, type Translate } from './refText';

const MAX_ENGINE_WARNINGS = 6;

export interface WarningListProps {
  verdict: Verdict | null;
  fmt: Fmt;
  fmtDate: (localDate: string) => string;
}

export function WarningList({ verdict, fmt, fmtDate }: WarningListProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  if (!verdict) return null;
  const reasons = cardReasonCards(verdict, fmt);
  const a: Assessment | null = verdict.state === 'missing' ? null : verdict;
  const engine: WarnCard[] = a ? a.warnings.slice(0, MAX_ENGINE_WARNINGS).map((w) => warningCard(w, a, fmt, fmtDate)) : [];
  const fact = a?.facts.find((f) => f.code === 'debt_rate_exceeds_return');
  const cards = [...reasons, ...engine];
  if (cards.length === 0 && !fact) return null;
  const factBody = fact && fact.code === 'debt_rate_exceeds_return' ? t('decide.warn.factBody', { apr: percentText(fact.debtApr), rate: percentText(fact.projectionReturn) }) : null;
  return (
    <View style={styles.list}>
      {cards.map((c, i) => (
        <WarningCard
          key={`${c.title.key}-${i}`}
          tone={c.tone}
          title={refText(t, c.title)}
          value={c.value ? refText(t, c.value) : ''}
          body={c.body.map((b) => refText(t, b))}
        />
      ))}
      {factBody ? (
        <View
          accessible
          style={[styles.fact, { borderColor: colors.line2, backgroundColor: colors.surface }]}
          accessibilityLabel={`${t('decide.warn.factTitle')}. ${factBody}`}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.warn.factTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{factBody}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  fact: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
});
