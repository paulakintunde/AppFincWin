// 06.1-28: the old DECIDE_SETUP_VISIBLE gate is gone (it hid the new Decide's own screen); DECIDE_OPEN in the layout is the gate.
// 06.1-18 (D51): the body of the /decide/safety-net route. Same per-account gate as /decide/settings (decide_v3). It binds the two
// writes the screen needs (unlock/lock, and the first-answer net question) and hands them down, because features/decide may not
// reach Grow's write hooks (fx-fetch-never-from-reads).
import React from 'react';
import { Redirect, type Href } from 'expo-router';
import { useSetNetAnswerUse } from '@/data/mutations/decideNetUse';
import { useSafetyNetAnswer } from '@/data/mutations/safetyNetAnswer';
import { SafetyNetSettings } from '@/features/decide/screens/safetyNet/SafetyNetSettings';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { useRecordContext } from '@/features/record/useRecordContext';

export function SafetyNetRoute(): React.JSX.Element {
  const { v3 } = useDecideAccess();
  const rc = useRecordContext();
  const net = useSetNetAnswerUse();
  const answer = useSafetyNetAnswer(rc.userId ?? '', rc.householdId ?? '');
  if (!v3) return <Redirect href={'/decide' as Href} />;
  return <SafetyNetSettings net={net} answer={answer.answer} />;
}
