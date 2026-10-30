// 05.3-36: shell body for /decide/envelopes: the shipped Pots screen titled "Envelopes", behind V3Gate.
import React from 'react';
import { PotsScreen } from '@/features/decide/pots/PotsScreen';
import { GoalTagEditProvider } from '../GoalTagEditProvider';
import { V3Gate } from './V3Gate';

export function EnvelopesRoute(): React.JSX.Element {
  return (
    <V3Gate>
      <GoalTagEditProvider>
        <PotsScreen titleKey="decide.v3.ui.home.envelopes" />
      </GoalTagEditProvider>
    </V3Gate>
  );
}
