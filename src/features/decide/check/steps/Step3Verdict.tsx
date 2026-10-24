/**
 * 05-15 Step 3, the top: the verdict card, the basis row and the notices (D-05, D-74). The warnings live in the "What breaks" fold;
 * the flow screen places the hint and the FoldList below this. One haptic per visit (success for fits, warning otherwise), keyed by `revealKey`.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { basisDetailItems } from '../../copy/depthVerdictCopy';
import { BasisDetailRow } from '../BasisDetailRow';
import { hapticSuccess, hapticWarning } from '@/ui/haptics';
import { space } from '@/theme/layout';
import { moneyA11yFn, moneyFn } from './stepUi';
import { VerdictCard } from '../VerdictCard';
import { expectedReturnProjection } from '../../snapshot/expectedReturn';
import { WarningList } from '../WarningList';
import type { StepProps } from '../stepTypes';

export interface Step3Props extends StepProps {
  lastSeenBasis: 'logged_months' | 'first_read_rough_figures' | null;
  revealKey: string;
  /** D-40: opens the card terms sheet (05-30 wires CardMinimumSheet); the basis row is tappable only when given. */
  onEditCardMinimum?: () => void;
}

export function Step3Verdict(props: Step3Props) {
  const { computation, source, whole, lastSeenBasis, revealKey, onEditCardMinimum } = props;
  const fmt = moneyFn(whole, source.currency);
  const fmtCents = moneyFn(props.exact, source.currency);
  const fmtA11y = moneyA11yFn(whole, source.currency);
  const fmtCentsA11y = moneyA11yFn(props.exact, source.currency);
  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const state = verdict ? verdict.state : computation.status === 'first_read' && computation.firstRead ? computation.firstRead.state : null;
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (state === null || fired.current === revealKey) return;
    fired.current = revealKey;
    if (state === 'fits') hapticSuccess();
    else hapticWarning();
  }, [state, revealKey]);
  const decision = computation.status === 'logged' ? computation.decision : null;
  const formatDate = (d: string) => whole.formatDate(d);
  const monthName = (month: string) => {
    const [y, m] = month.split('-') as [string, string];
    return new Intl.DateTimeFormat(whole.locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(Number(y), Number(m) - 1, 1));
  };
  const basisItems = decision
    ? basisDetailItems({ decision, conversions: source.conversions, provisional: source.provisional, basisNotes: source.basisNotes, cardsWithoutMinimum: source.meta.cardsWithoutMinimum, fmt, monthName, formatDate })
    : [];
  const stackedApplied = decision ? decision.stacked.filter((s) => s.status === 'applied').length : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.cardGroup}>
        <VerdictCard
          computation={computation}
          lastSeenBasis={lastSeenBasis}
          fmt={fmt}
          fmtCents={fmtCents}
          fmtA11y={fmtA11y}
          fmtCentsA11y={fmtCentsA11y}
          roughBurn={source.kind === 'rough' ? source.figures.monthlySpending : null}
          conversions={source.conversions}
          fullMonths={source.meta.fullMonths}
          formatDate={formatDate}
          locale={whole.locale}
          projection={expectedReturnProjection(props.inputs, computation.check)}
        />
        <BasisDetailRow items={basisItems} onPressCardMinimum={onEditCardMinimum} />
      </View>
      <WarningList verdict={verdict} fmt={fmt} fmtA11y={fmtA11y} fmtDate={formatDate} stackedApplied={stackedApplied} warnings={false} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space.gapMd }, cardGroup: { gap: space.gapSm } });
