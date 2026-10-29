/**
 * Plan 05.2-27 (D-04): "Your emergency fund". Optional. The body is shared with the sheet (EmergencyFundFields); this
 * step only reports readiness and writes through the form's one save.
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import { space } from '@/theme/layout';
import { Intro, useCopy, useReportReady } from '@/features/income/steps/shared';
import { PrefillNote } from '../PrefillNote';
import { EmergencyFundFields, useEmergencyFundForm } from '../EmergencyFundFields';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

export const EmergencyStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function EmergencyStep({ onReadyChange }, ref) {
  const t = useCopy();
  const form = useEmergencyFundForm('step');
  useReportReady(onReadyChange, true, null, form.dirty);
  useImperativeHandle(ref, () => ({
    save() {
      const result = form.save();
      return { stepId: result === null ? null : result.stepId };
    },
  }));
  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="decide.setup.emergency.intro" />
      {form.prefilled !== null ? <PrefillNote text={t('decide.accountUse.emergencyPrefill', { account: form.prefilled.name })} /> : null}
      <EmergencyFundFields form={form} />
    </View>
  );
});
