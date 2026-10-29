/**
 * Plan 05.2-22 (ROADMAP criterion 2): the one shared income component. It renders the content of one income step and
 * forwards the step-contract ref, so the Decide stepper, the Activity "Set it up" standalone flow and Phase 9 onboarding
 * all mount the same bodies. It draws no rail, footer or navigation.
 */
import React, { forwardRef } from 'react';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { MethodStep } from './steps/MethodStep';
import { OtherStep } from './steps/OtherStep';
import { PaidStep } from './steps/PaidStep';
import { PayStep } from './steps/PayStep';
import { SeasonStep } from './steps/SeasonStep';

export const INCOME_STEPS = ['paid', 'pay', 'season', 'method', 'other'] as const;
export type IncomeStepKey = (typeof INCOME_STEPS)[number];

export const IncomeProfileSteps = forwardRef<SetupStepHandle, { step: IncomeStepKey } & SetupStepBodyProps>(function IncomeProfileSteps({ step, ...body }, ref) {
  switch (step) {
    case 'paid':
      return <PaidStep ref={ref} {...body} />;
    case 'pay':
      return <PayStep ref={ref} {...body} />;
    case 'season':
      return <SeasonStep ref={ref} {...body} />;
    case 'method':
      return <MethodStep ref={ref} {...body} />;
    case 'other':
      return <OtherStep ref={ref} {...body} />;
  }
});
