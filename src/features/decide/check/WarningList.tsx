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
import { cashTightFactCopy } from '../copy/depthVerdictCopy';
import { promoCopy } from '../copy/depthInputsCopy';
import { percentText } from '../copy/percentText';
import type { Fmt, WarnCard } from '../copy/types';
import { WarningCard } from '../ui/WarningCard';
import { refText, type Translate } from './refText';

const MAX_WARNINGS = 6;

export interface WarningListProps {
  verdict: Verdict | null;
  fmt: Fmt;
  fmtDate: (localDate: string) => string;
  /** D-59: how many of the other open checks the combined position applies (picks the stacked wording). */
  stackedApplied?: number;
}

export function WarningList({ verdict, fmt, fmtDate, stackedApplied = 0 }: WarningListProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  if (!verdict) return null;
  const reasons = cardReasonCards(verdict, fmt);
  const a: Assessment | null = verdict.state === 'missing' ? null : verdict;
  const engine: WarnCard[] = a ? a.warnings.slice(0, MAX_WARNINGS).map((w) => warningCard(w, a, fmt, fmtDate)) : [];
  const fact = a?.facts.find((f) => f.code === 'debt_rate_exceeds_return');
  const cards = [...reasons, ...engine];
  const tight = a?.facts.find((f) => f.code === 'cash_tight_before_payday');
  const tightRef = tight && tight.code === 'cash_tight_before_payday' ? cashTightFactCopy(tight, stackedApplied, fmt, fmtDate) : null;
  const tightBody = tightRef ? refText(t, tightRef) : null;
  // D-42: a neutral notice, never a warning; the engine reports the charge only when the toggle is on.
  const promo = a?.plan.promo ?? null;
  const notice = promo && promo.deferredInterestCode === 'deferred_interest_charged' ? promoCopy(null, '', promo, null, fmt, fmt).notice : null;
  if (cards.length === 0 && !fact && !tightBody && !notice) return null;
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
      {tightBody ? (
        <View accessible style={[styles.fact, { borderColor: colors.line2, backgroundColor: colors.surface }]} accessibilityLabel={tightBody}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{tightBody}</Text>
        </View>
      ) : null}
      {notice ? (
        <View
          accessible
          style={[styles.fact, { borderColor: colors.line2, backgroundColor: colors.surface }]}
          accessibilityLabel={`${refText(t, notice.title)}. ${refText(t, notice.body)}`}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{refText(t, notice.title)}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{refText(t, notice.body)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  fact: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
});
