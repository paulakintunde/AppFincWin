/** Plan 05.2-22 (D-17): "How are you paid?" Six check rows; "No fixed income right now" is exclusive. */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { CheckRow } from '@/features/decide/ui/CheckRow';
import { space } from '@/theme/layout';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { useIncomeContext } from '../useIncomeContext';
import { Intro, NEEDED_REASON_KEY, Why, useReportReady, useCopy } from './shared';

/** The six setup values, in display order. */
export const PAID_OPTIONS: readonly { value: string; labelKey: string }[] = [
  { value: 'salary_or_wages', labelKey: 'income.paid.optionSalary' },
  { value: 'commission_or_tips', labelKey: 'income.paid.optionCommission' },
  { value: 'freelance', labelKey: 'income.paid.optionFreelance' },
  { value: 'own_business', labelKey: 'income.paid.optionBusiness' },
  { value: 'pension_or_benefits', labelKey: 'income.paid.optionPension' },
  { value: 'none', labelKey: 'income.paid.optionNone' },
];

const ORDER: readonly string[] = PAID_OPTIONS.map((o) => o.value);

const inOrder = (values: readonly string[]): string[] => ORDER.filter((v) => values.includes(v));
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export const PaidStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function PaidStep({ onReadyChange }, ref) {
  const t = useCopy();
  const ctx = useIncomeContext();
  const saver = useSaveSetupStep(ctx.userId ?? '');
  const stored = inOrder(ctx.settings?.income_types ?? []);
  const [draft, setDraft] = useState<string[] | null>(null);
  const chosen = draft ?? stored;

  const toggle = (value: string) => {
    const has = chosen.includes(value);
    if (value === 'none') setDraft(has ? [] : ['none']);
    else setDraft(inOrder(has ? chosen.filter((v) => v !== value) : [...chosen.filter((v) => v !== 'none'), value]));
  };

  const canContinue = chosen.length > 0;
  useReportReady(onReadyChange, canContinue, canContinue ? null : NEEDED_REASON_KEY, !same(chosen, stored));

  useImperativeHandle(ref, () => ({
    save() {
      if (!canContinue || ctx.userId === undefined) return { stepId: null };
      const result = saver.save({ stepTitle: t('income.paid.title'), patch: { income_types: chosen } });
      return { stepId: result?.stepId ?? null };
    },
  }));

  return (
    <View style={{ gap: space.gapMd }}>
      <Intro textKey="income.paid.intro" />
      {PAID_OPTIONS.map((o) => (
        <CheckRow key={o.value} checked={chosen.includes(o.value)} onToggle={() => toggle(o.value)} name={t(o.labelKey)} amount="" removeA11yLabel={t('decide.setup.shell.remove')} />
      ))}
      <Why textKey="income.paid.why" />
    </View>
  );
});
