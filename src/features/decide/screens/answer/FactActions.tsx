// 06.1-23 (CO-D-38, CO-D-43, N21): what sits under a fact or a missing figure. The engine says which facts offer an answer
// (FACT_ACTION_KEYS); the buttons here are equal, and every missing figure is its own row with a Fix link (ask, don't block).
// Pure view: it reports the choice and the screen decides where it goes.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FACT_ACTION_KEYS } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

export type FactActionChoice =
  | { kind: 'addLimit'; accountId: string | null }
  | { kind: 'noOverdraft'; accountId: string | null }
  | { kind: 'addIt' }
  | { kind: 'none' }
  | { kind: 'setDueDay' }
  | { kind: 'fixMissing'; code: string }
  | { kind: 'changeAnswer' }
  | { kind: 'unlockNet' };

export interface FactActionsProps {
  /** The line's code: a fact code, or a missing code when `missing` is set. */
  code: string;
  /** The fact's values (accountId and so on); empty for a missing row. */
  values?: Readonly<Record<string, unknown>>;
  /** The line is a missing figure: it gets a Fix link. */
  missing?: boolean;
  /** The sentence of the line, so a Fix link can say which figure it fixes. */
  item?: string;
  onChoose: (choice: FactActionChoice) => void;
}

export function FactActions({ code, values = {}, missing = false, item = '', onChoose }: FactActionsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-62 (CB-5 / CB-6): links show a press at once and reach 52 dp tall.
  const press = usePressFeedback('row');
  const text = (key: string): string => String(t(key as never));
  const link = (testID: string, label: string, choice: FactActionChoice, a11y?: string) => (
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={a11y ?? label} onPress={() => onChoose(choice)} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{label}</Text>
    </Pressable>
  );
  const accountId = typeof values['accountId'] === 'string' ? values['accountId'] : null;

  if (missing) {
    return link(`answer-fix-${code}`, t('decide.screens.answer.missing.fix'), { kind: 'fixMissing', code }, t('decide.screens.answer.missing.fixA11y', { item }));
  }
  if (code === 'no_overdraft_limit') {
    const keys = FACT_ACTION_KEYS.no_overdraft_limit;
    return (
      <View testID="answer-fact-actions-no_overdraft_limit" style={styles.pair}>
        <View style={styles.half}>
          <Pill variant="secondary" label={text(keys.addLimit)} onPress={() => onChoose({ kind: 'addLimit', accountId })} />
        </View>
        <View style={styles.half}>
          <Pill variant="secondary" label={text(keys.noOverdraft)} onPress={() => onChoose({ kind: 'noOverdraft', accountId })} />
        </View>
      </View>
    );
  }
  if (code === 'ask_debts_not_recorded') {
    const keys = FACT_ACTION_KEYS.ask_debts_not_recorded;
    return (
      <View testID="answer-fact-actions-ask_debts_not_recorded" style={styles.pair}>
        <View style={styles.half}>
          <Pill variant="secondary" label={text(keys.addIt)} onPress={() => onChoose({ kind: 'addIt' })} />
        </View>
        <View style={styles.half}>
          <Pill variant="secondary" label={text(keys.none)} onPress={() => onChoose({ kind: 'none' })} />
        </View>
      </View>
    );
  }
  if (code === 'debt_due_day_assumed') {
    return (
      <View testID="answer-fact-actions-debt_due_day_assumed" style={styles.pair}>
        <View style={styles.half}>
          <Pill variant="secondary" label={text(FACT_ACTION_KEYS.debt_due_day_assumed.setDueDay)} onPress={() => onChoose({ kind: 'setDueDay' })} />
        </View>
      </View>
    );
  }
  if (code === 'rests_on_your_answer') return link('answer-change-answer', t('decide.screens.answer.onYourAnswer.changeAnswer'), { kind: 'changeAnswer' });
  if (code === 'net_locked') return link('answer-unlock-net', t('decide.screens.answer.netLocked.unlockLink'), { kind: 'unlockNet' });
  return null;
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.gapSm, flexWrap: 'wrap', marginTop: space.gapSm },
  half: { flexGrow: 1, flexBasis: 140 },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
