// 09-24 (UI-SPEC 4, D-17b, D-28): what sits above the verdict on the sample Decide answer during the pre-trial look-around.
// Renders nothing outside sample mode (plan status 'sample', plan loaded); SampleFiguresCard checks that itself.
//
// Quick 261124-2bs: the First read treatment is the `sample` prop on AnswerFrame, not a component here. StageTag was removed by
// 08.1-13; the stage word now sits in the answer's top-bar sub-line (forced to first read in sample mode) and the legal block's
// basis line reads onboarding.sample.basis ("Based on sample figures"). This seam keeps only the one-time sample figures card.
import React from 'react';
import { SampleFiguresCard } from '@/features/onboarding/SampleFiguresCard';

export function SampleAnswerIntro(): React.JSX.Element {
  return <SampleFiguresCard />;
}
