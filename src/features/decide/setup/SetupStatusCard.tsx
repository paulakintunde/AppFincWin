/**
 * Plan 05.2-35 (UI-SPEC "Test-account setup page", item 1): the setup status card. Three states from the setup facts:
 * not started (primary "Set up Decide"), partly done ("Rough" chip, the steps still needed by name, "Finish setup") and
 * done (success check, secondary "Change an answer"). Words carry every state; colour only backs them.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { StateChip } from '../ui/StateChip';
import type { SetupStepKey } from './setupFlow';
import { SuccessCircle } from './SuccessCircle';

export type SetupCardStatus = 'not_started' | 'rough' | 'done';

/** The Decide settings row that names each step that can be required. */
const STEP_ROW: Partial<Record<SetupStepKey, string>> = {
  paid: 'incomeCounted',
  pay: 'regularPay',
  method: 'steadyAmount',
  regular: 'regularPayments',
  everyday: 'everyday',
  accountUse: 'accountUse',
  unspent: 'unspent',
};

export interface SetupStatusCardProps {
  status: SetupCardStatus;
  /** Required steps still unanswered, in flow order. */
  remaining: readonly SetupStepKey[];
  onStart: () => void;
  /** Opens the flow at the first required step. Null when there is none to open. */
  onFinish: (() => void) | null;
  onChange: () => void;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function SetupStatusCard({ status, remaining, onStart, onFinish, onChange }: SetupStatusCardProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const K = 'decide.setupPage.';

  let heading: string;
  let body: string;
  if (status === 'not_started') {
    heading = t(`${K}notStartedHeading`);
    body = t(`${K}notStartedBody`);
  } else if (status === 'rough') {
    heading = t(`${K}roughHeading`);
    const names = remaining.map((s) => t(`decide.settings.row.${STEP_ROW[s] ?? s}.label`)).join(', ');
    body = remaining.length > 0 ? t(`${K}roughBody`, { count: remaining.length, names }) : t(`${K}roughBodyFigures`);
  } else {
    heading = t(`${K}doneHeading`);
    body = t(`${K}doneBody`);
  }

  return (
    <View
      accessible
      accessibilityLabel={t(`${K}statusA11y`, { heading, body })}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}
    >
      {status === 'rough' ? <StateChip tone="adjust" label={t(`${K}roughChip`)} /> : null}
      {status === 'done' ? <SuccessCircle /> : null}
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {heading}
      </Text>
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{body}</Text>
      <View style={styles.action}>
        {status === 'not_started' ? <Pill label={t(`${K}notStartedCta`)} variant="primary" onPress={onStart} /> : null}
        {status === 'rough' && onFinish !== null ? <Pill label={t(`${K}roughCta`)} variant="primary" onPress={onFinish} /> : null}
        {status === 'rough' && onFinish === null ? <Pill label={t(`${K}doneCta`)} variant="secondary" onPress={onChange} /> : null}
        {status === 'done' ? <Pill label={t(`${K}doneCta`)} variant="secondary" onPress={onChange} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, gap: space.gapMd },
  action: { alignSelf: 'flex-start', maxWidth: '100%' },
});
