/**
 * Plan 05.2-26 (D-03): "What is each account for?". The list and its sheet write as the user answers (one Undo step each),
 * so this step has nothing left to save; it only holds Continue back until every money account has a confirmed use.
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { space } from '@/theme/layout';
import { Intro, EACH_ACCOUNT_REASON_KEY, Why, useReportReady } from '@/features/income/steps/shared';
import { AccountUseList } from '../AccountUseList';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

export const AccountUseStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function AccountUseStep({ onReadyChange }, ref) {
  const [allConfirmed, setAllConfirmed] = useState(false);
  useReportReady(onReadyChange, allConfirmed, allConfirmed ? null : EACH_ACCOUNT_REASON_KEY, false);
  useImperativeHandle(ref, () => ({
    // The writes already happened in the list and the sheet.
    save: () => ({ stepId: null }),
  }));
  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="decide.setup.accountUse.intro" />
      <AccountUseList onAllConfirmedChange={setAllConfirmed} />
      <Why textKey="decide.setup.accountUse.why" />
    </View>
  );
});
