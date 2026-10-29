/**
 * Plan 05.2-32 (DSU-04): the one table from a setup step key to its body and its title. `renderSetupStep` is what the
 * stepper's `renderStep` calls; it is never called for 'welcome' (the shell draws Welcome itself, so that case is null).
 * Summary has a body whose handle writes nothing.
 *
 * Lives in src/shell (not features/decide) because the income steps reach the series write path, which features/decide
 * may not import (depcruise fx-fetch-never-from-reads).
 */
import React from 'react';
import { IncomeProfileSteps } from '@/features/income/IncomeProfileSteps';
import type { SetupStepKey } from '@/features/decide/setup/setupFlow';
import { AccountUseStep } from '@/features/decide/setup/steps/AccountUseStep';
import { DetailStep } from '@/features/decide/setup/steps/DetailStep';
import { EmergencyStep } from '@/features/decide/setup/steps/EmergencyStep';
import { EnvelopesStep } from '@/features/decide/setup/steps/EnvelopesStep';
import { EverydayStep } from '@/features/decide/setup/steps/EverydayStep';
import { LoansStep } from '@/features/decide/setup/steps/LoansStep';
import { RegularStep } from '@/features/decide/setup/steps/RegularStep';
import { RemindersStep } from '@/features/decide/setup/steps/RemindersStep';
import { SavingStep } from '@/features/decide/setup/steps/SavingStep';
import { ShareStep } from '@/features/decide/setup/steps/ShareStep';
import { SummaryStep } from '@/features/decide/setup/steps/SummaryStep';
import { UnspentStep } from '@/features/decide/setup/steps/UnspentStep';
import { UnusualStep } from '@/features/decide/setup/steps/UnusualStep';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';

export function renderSetupStep(step: SetupStepKey, ref: React.Ref<SetupStepHandle>, props: SetupStepBodyProps): React.ReactNode {
  switch (step) {
    case 'welcome':
      return null;
    case 'paid':
      return <IncomeProfileSteps ref={ref} step="paid" {...props} />;
    case 'pay':
      return <IncomeProfileSteps ref={ref} step="pay" {...props} />;
    case 'season':
      return <IncomeProfileSteps ref={ref} step="season" {...props} />;
    case 'method':
      return <IncomeProfileSteps ref={ref} step="method" {...props} />;
    case 'other':
      return <IncomeProfileSteps ref={ref} step="other" {...props} />;
    case 'regular':
      return <RegularStep ref={ref} {...props} />;
    case 'loans':
      return <LoansStep ref={ref} {...props} />;
    case 'saving':
      return <SavingStep ref={ref} {...props} />;
    case 'everyday':
      return <EverydayStep ref={ref} {...props} />;
    case 'unusual':
      return <UnusualStep ref={ref} {...props} />;
    case 'accountUse':
      return <AccountUseStep ref={ref} {...props} />;
    case 'emergency':
      return <EmergencyStep ref={ref} {...props} />;
    case 'envelopes':
      return <EnvelopesStep ref={ref} {...props} />;
    case 'unspent':
      return <UnspentStep ref={ref} {...props} />;
    case 'share':
      return <ShareStep ref={ref} {...props} />;
    case 'detail':
      return <DetailStep ref={ref} {...props} />;
    case 'reminders':
      return <RemindersStep ref={ref} {...props} />;
    case 'summary':
      return <SummaryStep ref={ref} {...props} />;
  }
}

/** The i18n key of each step's title (the shell draws it, the "{Step title} saved" toast and the focus use it). */
export function stepTitleKey(step: SetupStepKey): string {
  switch (step) {
    case 'welcome':
      return 'decide.setup.welcome.title';
    case 'paid':
      return 'income.paid.title';
    case 'pay':
      return 'income.pay.title';
    case 'season':
      return 'income.season.title';
    case 'method':
      return 'income.method.title';
    case 'other':
      return 'income.other.title';
    case 'regular':
      return 'decide.setup.regular.title';
    case 'loans':
      return 'decide.setup.loans.title';
    case 'saving':
      return 'decide.setup.saving.title';
    case 'everyday':
      return 'decide.setup.everyday.title';
    case 'unusual':
      return 'decide.setup.unusual.title';
    case 'accountUse':
      return 'decide.setup.accountUse.title';
    case 'emergency':
      return 'decide.setup.emergency.title';
    case 'envelopes':
      return 'decide.setup.envelopes.title';
    case 'unspent':
      return 'decide.setup.unspent.title';
    case 'share':
      return 'decide.setup.share.title';
    case 'detail':
      return 'decide.setup.detail.title';
    case 'reminders':
      return 'decide.setup.reminders.title';
    case 'summary':
      return 'decide.setup.summary.title';
  }
}
