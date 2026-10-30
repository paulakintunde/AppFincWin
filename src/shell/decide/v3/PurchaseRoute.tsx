// 05.3-24 (DSV-05): the body of /decide/purchase/[id], behind the v3 gate (D-04).
import React from 'react';
import { CheckScreen } from '@/features/decide/v3/check/CheckScreen';
import { V3Gate } from './V3Gate';

export function PurchaseRoute({ id, focus }: { id: string; focus: 'price' | null }): React.JSX.Element {
  return (
    <V3Gate>
      <CheckScreen id={id} focus={focus} />
    </V3Gate>
  );
}
