// 05.3-28: shell body for /decide/plan/[id]. T-05-30-01: the id comes from a link, so it is checked before it reaches the screen.
import React from 'react';
import { WholePlanScreen } from '@/features/decide/v3/plan/WholePlanScreen';
import { V3NotFound } from '@/features/decide/v3/nav/V3NotFound';
import { isUuid } from '@/features/navigation/routeParams';
import { V3Gate } from './V3Gate';

export function PlanRoute({ id }: { id: string | undefined }): React.JSX.Element {
  if (!isUuid(id)) return <V3Gate><V3NotFound /></V3Gate>;
  return (
    <V3Gate>
      <WholePlanScreen id={id} />
    </V3Gate>
  );
}
