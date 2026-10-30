// 05.3-24 (DSV-05): the body of /decide/purchase/[id], behind the v3 gate (D-04).
// 05.3-40: the layer cards plug into CheckScreen's renderLayers slot.
import React from 'react';
import { CheckScreen } from '@/features/decide/v3/check/CheckScreen';
import { LayerStack } from '@/features/decide/v3/layers/LayerStack';
import { V3Gate } from './V3Gate';

export function PurchaseRoute({ id, focus }: { id: string; focus: 'price' | null }): React.JSX.Element {
  return (
    <V3Gate>
      <CheckScreen id={id} focus={focus} renderLayers={(args) => <LayerStack {...args} checkId={id} />} />
    </V3Gate>
  );
}
