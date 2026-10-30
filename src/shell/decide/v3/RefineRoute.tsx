// 05.3-34 (DSV-14): the body of /decide/refine. Gate, then the review screen.
import React from 'react';
import { RefineScreen } from '@/features/decide/v3/refine/RefineScreen';
import { useSetupSheetHost } from '../SetupSheetHost';
import { V3Gate } from './V3Gate';

export function RefineRoute(): React.JSX.Element {
  // The series writes (pay and regular-payment amounts, pausing) are registered here; features/decide cannot import them directly.
  useSetupSheetHost();
  return (
    <V3Gate>
      <RefineScreen />
    </V3Gate>
  );
}
