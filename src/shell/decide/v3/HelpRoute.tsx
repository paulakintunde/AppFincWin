// 05.3-31 (D-17): the body of /decide/help/[id]. Gated on the v3 switch; where a month is fully recorded the form is never
// shown (a rough answer would be a false claim, P-09) and the route goes to the answer instead.
import React from 'react';
import { Redirect } from 'expo-router';
import { useChecksV3 } from '@/data/queries/decideCheckV3';
import { HelpScreen } from '@/features/decide/v3/help/HelpScreen';
import { helpOffered } from '@/features/decide/v3/model/helpOffered';
import { answerHref } from '@/features/decide/v3/nav/hrefs';
import { V3Skeleton } from '@/features/decide/v3/nav/V3Skeleton';
import { V3Gate } from './V3Gate';

function HelpBody({ id }: { id: string }): React.JSX.Element {
  const { inputs } = useChecksV3();
  if (inputs === null) return <V3Skeleton />;
  if (!helpOffered(inputs)) return <Redirect href={answerHref(id)} />;
  return <HelpScreen id={id} inputs={inputs} />;
}

export function HelpRoute({ id }: { id: string }): React.JSX.Element {
  return (
    <V3Gate>
      <HelpBody id={id} />
    </V3Gate>
  );
}
