/** Plan 05.2-22 (D-15, D-16): "Does your income change by season?" Optional, asked of everyone, nothing chosen for the user. */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { useIncomeContext } from '../useIncomeContext';
import { Intro, Why, useReportReady, useCopy } from './shared';

type Pattern = 'steady' | 'variable' | 'seasonal';

const OPTIONS: readonly { value: Pattern; titleKey: string; descKey: string }[] = [
  { value: 'steady', titleKey: 'income.season.optionSteady', descKey: 'income.season.optionSteadyDesc' },
  { value: 'variable', titleKey: 'income.season.optionVariable', descKey: 'income.season.optionVariableDesc' },
  { value: 'seasonal', titleKey: 'income.season.optionSeasonal', descKey: 'income.season.optionSeasonalDesc' },
];

export const SeasonStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function SeasonStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const ctx = useIncomeContext();
  const saver = useSaveSetupStep(ctx.userId ?? '');
  const stored = ctx.settings?.income_pattern ?? null;
  const [draft, setDraft] = useState<Pattern | null>(null);
  const chosen = draft ?? stored;

  // Optional: Next is always available. A Skip with nothing chosen writes nothing.
  useReportReady(onReadyChange, true, null, chosen !== null && chosen !== stored);

  useImperativeHandle(ref, () => ({
    save() {
      if (chosen === null || ctx.userId === undefined) return { stepId: null };
      const result = saver.save({ stepTitle: t('income.season.title'), patch: { income_pattern: chosen } });
      return { stepId: result?.stepId ?? null };
    },
  }));

  return (
    <View style={{ gap: space.gapMd }}>
      <Intro textKey="income.season.intro" />
      {OPTIONS.map((o) => {
        const selected = chosen === o.value;
        return (
          <ChoiceCard key={o.value} selected={selected} onPress={() => setDraft(o.value)} title={t(o.titleKey)} accessibilityLabel={`${t(o.titleKey)}. ${t(o.descKey)}`}>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: selected ? colors.inkSoft1 : colors.inkMuted }}>{t(o.descKey)}</Text>
          </ChoiceCard>
        );
      })}
      <Why textKey="income.season.why" />
    </View>
  );
});
