/**
 * 05-30 (DCU-02, UI-SPEC Bottom action bar): pinned above the keyboard and the safe area. An optional hint line, 'Save and
 * close' and the primary button: 'Next: ...' on steps 1 to 4; on step 5 the outcome's own words, calling `onCommit` with the
 * chosen outcome (05-29's useCommitDecision). A decided (read-only) check has no primary button on step 5.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import type { CheckInputs } from '../snapshot/types';
import type { StepNumber } from './stepTypes';

type Outcome = NonNullable<CheckInputs['outcome']>;

const NEXT_KEY = {
  1: 'decide.flow.next.price',
  2: 'decide.flow.next.impact',
  3: 'decide.flow.next.alternatives',
  4: 'decide.flow.next.decide',
} as const satisfies Record<1 | 2 | 3 | 4, string>;

const COMMIT_KEY = { go: 'decide.flow.commit.go', wait: 'decide.flow.commit.wait', pass: 'decide.flow.commit.pass' } as const satisfies Record<Outcome, string>;

export interface CheckActionBarProps {
  step: StepNumber;
  hint: string | null;
  /** The primary button is disabled (steps 1 and 2 need their fields; step 5 needs an outcome). */
  nextDisabled: boolean;
  outcome: CheckInputs['outcome'];
  readOnly: boolean;
  onNext: () => void;
  onSaveClose: () => void;
  onCommit: (outcome: Outcome) => void;
  /** A decided check's one action (Reopen the check / Back to Decide, 05-29): replaces the primary button from step 3 on. */
  decidedAction?: { label: string; onPress: () => void } | null;
}

export function CheckActionBar({ step, hint, nextDisabled, outcome, readOnly, onNext, onSaveClose, onCommit, decidedAction = null }: CheckActionBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const last = step === 5;
  const primary = readOnly && decidedAction !== null && step >= 3 ? (
    <Pill variant="primary" label={decidedAction.label} onPress={decidedAction.onPress} />
  ) : last ? (
    readOnly ? null : (
      <Pill
        variant="primary"
        label={outcome === null ? t('decide.flow.commit.none') : t(COMMIT_KEY[outcome])}
        disabled={outcome === null || nextDisabled}
        onPress={() => {
          if (outcome !== null) onCommit(outcome);
        }}
      />
    )
  ) : (
    <Pill variant="primary" label={t(NEXT_KEY[step as 1 | 2 | 3 | 4])} disabled={nextDisabled} onPress={onNext} />
  );
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.canvas, borderTopColor: colors.line1, paddingBottom: Math.max(insets.bottom, space.tabBarPadBottomMin), paddingHorizontal: space.screenH },
      ]}
    >
      {hint ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{hint}</Text> : null}
      <View style={styles.buttons}>
        <View style={styles.secondary}>
          <Pill variant="secondary" label={t('decide.flow.saveClose')} onPress={onSaveClose} />
        </View>
        {primary ? <View style={styles.primary}>{primary}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, paddingTop: space.gapMd, gap: space.gapSm },
  buttons: { flexDirection: 'row', gap: space.gapSm },
  secondary: { flex: 1 },
  primary: { flex: 1.4 },
});
