// 05.3-29 (DSV-10): the body of /decide/instead/[id]. Gate, then the check's evaluation; an unknown check or one with no
// purchase is the not-found screen. The id is validated by the route file (T-05.3-29-03).
import React from 'react';
import { useCheckV3 } from '@/data/queries/decideCheckV3';
import { InsteadScreen } from '@/features/decide/v3/instead/InsteadScreen';
import { V3NotFound } from '@/features/decide/v3/nav/V3NotFound';
import { V3Skeleton } from '@/features/decide/v3/nav/V3Skeleton';
import { V3Gate } from './V3Gate';

function InsteadBody({ id }: { id: string }): React.JSX.Element {
  const { status, evaluation } = useCheckV3(id);
  if (status === 'loading') return <V3Skeleton />;
  if (evaluation === null || evaluation.purchase === null) return <V3NotFound />;
  return <InsteadScreen ev={evaluation} />;
}

export function InsteadRoute({ id }: { id: string }): React.JSX.Element {
  return (
    <V3Gate>
      <InsteadBody id={id} />
    </V3Gate>
  );
}
