// 05.3-24 (DSV-05): the body of /decide/purchase/[id], behind the v3 gate (D-04).
// 05.3-40: the layer cards plug into CheckScreen's renderLayers slot.
// 05.3-100: a reopen copy the server answered with an existing live copy moves there; a copy that did not save says so.
import React, { useEffect } from 'react';
import { CheckScreen } from '@/features/decide/v3/check/CheckScreen';
import { LayerStack } from '@/features/decide/v3/layers/LayerStack';
import { purchaseHref } from '@/features/decide/v3/nav/hrefs';
import { useReopenOutcome } from '@/features/decide/v3/nav/useReopenOutcome';
import { V3CopyNotSaved } from '@/features/decide/v3/nav/V3CopyNotSaved';
import { replaceOnce } from '@/shell/navigation/pushOnce';
import { V3Gate } from './V3Gate';

export function PurchaseRoute({ id, focus }: { id: string; focus: 'price' | null }): React.JSX.Element {
  const { redirectTo, failed } = useReopenOutcome(id);
  useEffect(() => {
    if (redirectTo !== null) replaceOnce(purchaseHref(redirectTo, { focus: 'price' }));
  }, [redirectTo]);
  return (
    <V3Gate>
      {failed ? (
        <V3CopyNotSaved />
      ) : (
        <CheckScreen id={id} focus={focus} renderLayers={(args) => <LayerStack {...args} checkId={id} />} />
      )}
    </V3Gate>
  );
}
