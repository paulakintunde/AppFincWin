// 05.3-30: the body of /decide/worked. Gated by V3Gate (D-04); app/(app)/decide/worked.tsx re-exports it.
import React from 'react';
import { WorkedScreen } from '@/features/decide/v3/worked/WorkedScreen';
import { V3Gate } from './V3Gate';

export function WorkedRoute(): React.JSX.Element {
  return (
    <V3Gate>
      <WorkedScreen />
    </V3Gate>
  );
}
