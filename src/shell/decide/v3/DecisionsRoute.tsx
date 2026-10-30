// 05.3-36: shell body for /decide/decisions (Past decisions under v3), behind V3Gate.
import React from 'react';
import { DecisionsScreen } from '@/features/decide/v3/lists/DecisionsScreen';
import { V3Gate } from './V3Gate';

export function DecisionsRoute(): React.JSX.Element {
  return (
    <V3Gate>
      <DecisionsScreen />
    </V3Gate>
  );
}
