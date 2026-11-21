// 09-21 Q4 to Q6: the shared IncomeProfileSteps, unmodified. Whichever of onboarding or Decide setup runs first saves the
// answers for the other. Mapping (decided in 09-21): Q4 shape -> step 'paid' ("How are you paid?"), Q5 inc -> step 'pay'
// (regular pay amount and schedule), Q6 freq -> step 'season' (does income change by season).
// The body saves through the step's own mutations (owner P3: before the trial the server refuses with PT402 and 09-09 keeps
// the writes on the phone; they sync when the trial starts). `commit()` saves and returns the setup answer to keep.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { IncomeProfileSteps } from '@/features/income/IncomeProfileSteps';
import type { SetupStepHandle, SetupStepReady } from '@/features/income/stepTypes';
import { useIncomeContext } from '@/features/income/useIncomeContext';
import type { OnboardingAnswers } from '@/features/levels/onboardingAnswers';
import { deriveIncomeShape } from '../deriveIncomeShape';

export type IncomeStepKey = 'paid' | 'pay' | 'season';
export type IncomeQuestionKey = 'shape' | 'inc' | 'freq';

/** Which question each income step answers. */
export const INCOME_QUESTION_STEP: Record<IncomeQuestionKey, IncomeStepKey> = { shape: 'paid', inc: 'pay', freq: 'season' };

export interface IncomeQuestionHandle {
  /** Saves the step and returns the answer kept in the setup (undefined when nothing was recorded). */
  commit(): OnboardingAnswers['shape'] | OnboardingAnswers['inc'] | OnboardingAnswers['freq'];
}

export interface IncomeQuestionProps {
  question: IncomeQuestionKey;
  onReadyChange: (ready: SetupStepReady) => void;
}

function freqAnswer(freq: string): OnboardingAnswers['freq'] {
  if (freq === 'weekly' || freq === 'fortnightly' || freq === 'monthly') return freq;
  return 'irregular';
}

export const IncomeQuestion = forwardRef<IncomeQuestionHandle, IncomeQuestionProps>(function IncomeQuestion({ question, onReadyChange }, ref) {
  const ctx = useIncomeContext();
  const stepRef = useRef<SetupStepHandle>(null);

  useImperativeHandle(ref, () => ({
    commit() {
      stepRef.current?.save();
      const pay = ctx.series.find((s) => s.deleted_at === null && s.income_kind != null);
      if (question === 'shape') return deriveIncomeShape(ctx.settings?.income_types, ctx.settings?.income_pattern);
      if (question === 'inc') return pay ? { amountMinor: pay.amount } : undefined;
      return pay ? freqAnswer(pay.freq) : undefined;
    },
  }));

  return <IncomeProfileSteps ref={stepRef} step={INCOME_QUESTION_STEP[question]} mode="standalone" onReadyChange={onReadyChange} />;
});
