/**
 * 06-20 (ARC-16): the body of a setup step whose form moved to Grow (loans, saving, emergency, envelopes). It writes nothing; it
 * says where the thing lives now and opens that Grow home. Lives in src/shell with the other step registry code.
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import { Intro, useCopy, useReportReady } from '@/features/income/steps/shared';
import { growRouteOf, type SetupStepKey } from '@/features/decide/setup/setupFlow';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { space } from '@/theme/layout';
import { Row } from '@/ui/Row';

export interface GrowLinkStepProps extends SetupStepBodyProps {
  step: SetupStepKey;
}

export const GrowLinkStep = forwardRef<SetupStepHandle, GrowLinkStepProps>(function GrowLinkStep({ step, onReadyChange }, ref) {
  const t = useCopy();
  useReportReady(onReadyChange, true, null, false);
  useImperativeHandle(ref, () => ({ save: () => ({ stepId: null }) }));
  const href = growRouteOf(step);
  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey={`decide.setup.growLink.${step}`} />
      {href !== null ? (
        <Row
          label={t('decide.setup.growLink.open')}
          chevron
          accessibilityLabel={t('decide.setup.growLink.open')}
          onPress={() => pushOnce(href as Parameters<typeof pushOnce>[0])}
        />
      ) : null}
    </View>
  );
});
