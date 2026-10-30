/**
 * 05.3-33 (D-35, D-07): expected money in for the first month still needed. A MoneyInput and "Save expected income",
 * saved through useSaveDecideAnswer({ kind: 'expected_income', month, amount, at }), one undo step, toast
 * "Expected income saved". "and N more months" counts the months still needed after this one.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useV3Format } from '@/features/decide/v3/shared/useV3Format';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const within = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

export function ExpectedIncomeBody({ question, userId, householdId, onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const fmt = useV3Format();
  const saver = useSaveDecideAnswer(userId, householdId);
  const [value, setValue] = useState<number | null>(null);
  const month = question.months[0] ?? null;
  const more = Math.max(0, question.months.length - 1);
  const caption = t('decide.v3.ui.ask.expectedCaption', { month: month === null ? '' : fmt.month(month) });

  const save = (): void => {
    if (value === null || month === null) return;
    const result = saver.save({ kind: 'expected_income', month, amount: value, at: rc.today });
    if (result !== null) showToast({ kind: 'ordinary', text: undoLabelText('expectedIncomeSaved', {}), stepId: result.stepId });
    onSaved(result?.stepId ?? null);
  };

  return (
    <View style={styles.column}>
      <MoneyInput value={value} currency={rc.homeCurrency} onChange={(m) => setValue(within(m))} label={caption} accessibilityLabel={caption} />
      {more > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkMuted }}>
          {more === 1 ? t('decide.v3.ui.ask.expectedMore_one') : t('decide.v3.ui.ask.expectedMore_other', { count: more })}
        </Text>
      ) : null}
      <Pill label={t('decide.v3.ui.ask.saveExpectedIncome')} variant="primary" disabled={value === null || month === null} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
