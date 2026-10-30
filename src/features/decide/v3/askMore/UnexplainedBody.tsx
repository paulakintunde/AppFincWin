/**
 * 05.3-33 (D-50, D-07): what extra money is for. Four rows; choosing one saves at once through the 05.2
 * useSaveUnexplainedAnswer ({ amount, use, at }), one undo step, the question card shows the "Saved" toast. An identical answer writes nothing (null).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useSaveUnexplainedAnswer } from '@/data/mutations/decideSetup';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Use = 'spare' | 'envelope_or_goal' | 'set_aside_for_bill' | 'someone_elses';

const OPTIONS: readonly { use: Use; labelKey: string }[] = [
  { use: 'spare', labelKey: 'decide.v3.ui.ask.unexplained.spare' },
  { use: 'envelope_or_goal', labelKey: 'decide.v3.ui.ask.unexplained.envelope' },
  { use: 'set_aside_for_bill', labelKey: 'decide.v3.ui.ask.unexplained.bill' },
  { use: 'someone_elses', labelKey: 'decide.v3.ui.ask.unexplained.someone' },
];

export function UnexplainedBody({ question, userId, onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const rc = useRecordContext();
  const saver = useSaveUnexplainedAnswer(userId);
  const amount = Number(question.params.amount ?? 0);

  const choose = (use: Use): void => {
    const result = saver.save({ amount, use, at: rc.today });
    onSaved(result?.stepId ?? null);
  };

  return (
    <View style={styles.column} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => (
        <ChoiceCard key={o.use} selected={false} onPress={() => choose(o.use)} title={t(o.labelKey)} accessibilityLabel={t(o.labelKey)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
