// 06.1-18 (D-14): the first-answer gate with its write bound. The gate lives under features/decide, which may not reach Grow's write
// hooks (they touch the rate-fetch door), so this shell file calls useSafetyNetAnswer and hands the write down. The answer route
// (plan 23) mounts this before the first answer renders.
import React from 'react';
import { useSafetyNetAnswer } from '@/data/mutations/safetyNetAnswer';
import { FirstAnswerGate } from '@/features/decide/screens/firstAnswer/FirstAnswerGate';
import { useRecordContext } from '@/features/record/useRecordContext';

export function FirstAnswerGateBound({ onDone }: { onDone: () => void }): React.JSX.Element {
  const rc = useRecordContext();
  const net = useSafetyNetAnswer(rc.userId ?? '', rc.householdId ?? '');
  return <FirstAnswerGate answer={net.answer} onDone={onDone} />;
}
