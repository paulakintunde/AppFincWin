// 06.1-52 (C-8): a step opened before its new check reaches the cache, while the create is still queued or in flight. The step's
// own frame with the "still saving" line, never a blank screen. Nothing here can be edited yet; Next stays put.
import React from 'react';
import { useT } from '@/i18n';
import { NeedLine } from '../ui/NeedLine';
import { StepFrame } from './StepFrame';
import type { StepNumber } from './useStepCheck';

const TITLE = { 1: 'kind', 2: 'price', 3: 'running' } as const;

export function StepStillSaving({ step, name, onBack }: { step: StepNumber; name: string; onBack: () => void }) {
  const t = useT();
  const area = TITLE[step];
  return (
    <StepFrame
      step={step}
      title={t(`decide.screens.stepper.${area}.title`)}
      why={t(`decide.screens.stepper.${area}.why`)}
      meta={name}
      onBack={onBack}
      onJump={() => undefined}
      onNext={() => undefined}
      nextDisabled
    >
      <NeedLine testID="step-still-saving" text={t('decide.screens.common.need.stillSaving')} />
    </StepFrame>
  );
}

/** True when the step's check is missing only because its create has not landed yet. */
export function isStillSaving(status: 'loading' | 'ready' | 'not_found', id: string, pendingIds: readonly string[]): boolean {
  return status === 'not_found' && pendingIds.includes(id);
}
