// 06.1-18 (D-14): the first-answer gate with its write bound. The gate lives under features/decide, which may not reach Grow's write
// hooks (they touch the rate-fetch door), so this shell file calls useSafetyNetAnswer and hands the write down. The answer route
// (plan 23) mounts this before the first answer renders.
// 06.1-66 (FQ5, CS-8): the same bound write behind the answer's "Safety net: not answered yet." line (NetQuestionBound).
import React from 'react';
import { useSafetyNetAnswer } from '@/data/mutations/safetyNetAnswer';
import { FirstAnswerGate, NetQuestionSheet } from '@/features/decide/screens/firstAnswer/FirstAnswerGate';
import { useRecordContext } from '@/features/record/useRecordContext';

export function FirstAnswerGateBound({ onDone }: { onDone: () => void }): React.JSX.Element {
  const rc = useRecordContext();
  const net = useSafetyNetAnswer(rc.userId ?? '', rc.householdId ?? '');
  return <FirstAnswerGate answer={net.answer} onDone={onDone} />;
}

/** The D-14 question opened from the answer's net line; `onClose(true)` once answered, `onClose(false)` when put away. */
export function NetQuestionBound({ onClose }: { onClose: (answered: boolean) => void }): React.JSX.Element | null {
  const rc = useRecordContext();
  const net = useSafetyNetAnswer(rc.userId ?? '', rc.householdId ?? '');
  return <NetQuestionSheet answer={net.answer} visible onDone={() => onClose(true)} onDismiss={() => onClose(false)} />;
}
