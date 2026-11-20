// 09-24 (UI-SPEC 4, D-17b, D-28): what sits above the verdict on the sample Decide answer during the pre-trial look-around.
// Renders nothing outside sample mode (plan status 'sample', plan loaded); SampleFiguresCard checks that itself.
//
// PARTIAL, owner-approved 2026-11-19: only the one-time sample figures card is built here.
// TODO(08.1-20): the 08.1 First read treatment goes in this seam once 08.1 plans 19-20 merge. 09-UI-SPEC line 221: `StageTag`
// "First read" (onboarding.sample.firstRead) and the basis line "Based on sample figures" (onboarding.sample.basis), with the
// verdict and fact lines from the engine copy keys. StageTag is created by .planning/phases/08.1-decide-rebuild-on-real-data/
// 08.1-20-PLAN.md (src/features/decide/screens/answer/StageTag.tsx). Do not build a substitute tag here.
import React from 'react';
import { SampleFiguresCard } from '@/features/onboarding/SampleFiguresCard';

export function SampleAnswerIntro(): React.JSX.Element {
  return (
    <>
      <SampleFiguresCard />
      {/* TODO(08.1-20): <StageTag stage="firstRead" /> and the "Based on sample figures" basis line, sample mode only. */}
    </>
  );
}
