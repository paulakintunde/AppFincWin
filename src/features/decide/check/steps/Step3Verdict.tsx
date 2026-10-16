/**
 * 05-15 Step 3, the top: the verdict card and the warnings (D-05). Holds no sections: the flow screen (05-30) places every
 * collapsible section below it. One haptic per visit (success for fits, warning otherwise), keyed by `revealKey`.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { hapticSuccess, hapticWarning } from '@/ui/haptics';
import { space } from '@/theme/layout';
import { moneyFn } from './stepUi';
import { VerdictCard } from '../VerdictCard';
import { WarningList } from '../WarningList';
import type { StepProps } from '../stepTypes';

export interface Step3Props extends StepProps {
  lastSeenBasis: 'logged_months' | 'first_read_rough_figures' | null;
  revealKey: string;
}

export function Step3Verdict(props: Step3Props) {
  const { computation, source, whole, lastSeenBasis, revealKey } = props;
  const fmt = moneyFn(whole, source.currency);
  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const state = verdict ? verdict.state : computation.status === 'first_read' && computation.firstRead ? computation.firstRead.state : null;
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (state === null || fired.current === revealKey) return;
    fired.current = revealKey;
    if (state === 'fits') hapticSuccess();
    else hapticWarning();
  }, [state, revealKey]);
  return (
    <View style={styles.wrap}>
      <VerdictCard computation={computation} lastSeenBasis={lastSeenBasis} fmt={fmt} />
      <WarningList verdict={verdict} fmt={fmt} fmtDate={(d) => whole.formatDate(d)} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space.gapMd } });
