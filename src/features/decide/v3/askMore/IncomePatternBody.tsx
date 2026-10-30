/**
 * 05.3-33 (D-34, D-07): the income-pattern swing question. Three rows in the 05.2 season-card look; choosing one saves
 * { income_pattern, income_pattern_confirmed: true } through useSaveSetupStep, one undo step, the question card shows the "Income pattern saved" toast.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Pattern = 'steady' | 'variable' | 'seasonal';

const OPTIONS: readonly { value: Pattern; labelKey: string }[] = [
  { value: 'steady', labelKey: 'decide.v3.ui.ask.pattern.steady' },
  { value: 'variable', labelKey: 'decide.v3.ui.ask.pattern.variable' },
  { value: 'seasonal', labelKey: 'decide.v3.ui.ask.pattern.seasonal' },
];

export function IncomePatternBody({ userId, onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const saver = useSaveSetupStep(userId);

  const choose = (value: Pattern): void => {
    const result = saver.save({ labelKey: 'incomePatternSaved', patch: { income_pattern: value, income_pattern_confirmed: true } });
    onSaved(result?.stepId ?? null);
  };

  return (
    <View style={styles.column} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => (
        <ChoiceCard key={o.value} selected={false} onPress={() => choose(o.value)} title={t(o.labelKey)} accessibilityLabel={t(o.labelKey)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
