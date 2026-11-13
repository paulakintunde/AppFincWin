/**
 * 06.1-23: the answer route container. The answer screen lives under features/decide, which may not import the write hooks that
 * reach the rate-fetch door, so the shell binds "I'm not buying it" (useNotBuying) and the first-answer gate (FirstAnswerGateBound)
 * and hands both down. 06.1-44: Grow's goal writer (useEditGoal) for the envelope fix (D-54) and
 * the readiness skip (useSkipOccurrence) are bound here for the same reason.
 * 06.1-66 (FQ5): the safety-net question behind the answer's net line (NetQuestionBound) is bound here too.
 */
import React from 'react';
import { useNotBuying } from '@/data/mutations/decideOutcome';
import { useEditGoal } from '@/data/mutations/growGoals';
import { useSkipOccurrence } from '@/data/mutations/transactions';
import { AnswerScreen, type AnswerWrites } from '@/features/decide/screens/answer/AnswerScreen';
import { FirstAnswerGateBound, NetQuestionBound } from './FirstAnswerGateBound';

export function AnswerRoute({ id, side = null }: { id: string; side?: 'cash' | 'installments' | null }): React.JSX.Element {
  const notBuying = useNotBuying();
  const goal = useEditGoal();
  const skipper = useSkipOccurrence();
  const writes: AnswerWrites = {
    notBuying: ({ row, evaluation }) => notBuying.pass({ check: row, evaluation }),
    setEnvelopeAccount: (row, accountId, ownerId) => goal.edit(row, { account_id: accountId }, ownerId, 0),
    skipLine: (row, ownerId) => skipper.skip(row, ownerId),
  };
  return (
    <AnswerScreen
      id={id}
      side={side}
      writes={writes}
      renderGate={(onDone) => <FirstAnswerGateBound onDone={onDone} />}
      renderNetQuestion={(onClose) => <NetQuestionBound onClose={onClose} />}
    />
  );
}
