/**
 * 05.3-32 (D-07, D-59): "Did your pay arrive?" Yes / No saved as a pay_arrival answer for the first unseen pay of the month
 * (series id and pay date come from the engine's unseenPay entry, never from user text). The buttons stack so a long label
 * never clips at 320 wide or 2.0x text. With no pay entry the question stays and both buttons are disabled.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';
import { hapticSelection } from '@/ui/haptics';
import { space } from '@/theme/layout';

export function PayArrivalBody({ question, userId, householdId, onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT();
  const saver = useSaveDecideAnswer(userId, householdId);
  const pay = question.pay;
  const answer = (arrived: boolean): void => {
    if (pay === null) return;
    hapticSelection();
    const result = saver.save({ kind: 'pay_arrival', seriesId: pay.seriesId, payDate: pay.payDate, arrived });
    onSaved(result === null ? null : result.stepId);
  };
  return (
    <View style={styles.column}>
      <Pill label={t('decide.v3.ui.ask.payYes')} variant="secondary" disabled={pay === null} onPress={() => answer(true)} />
      <Pill label={t('decide.v3.ui.ask.payNo')} variant="secondary" disabled={pay === null} onPress={() => answer(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
