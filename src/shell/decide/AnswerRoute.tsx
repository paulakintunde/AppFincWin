/**
 * 06.1-23: the answer route container. The answer screen lives under features/decide, which may not import the write hooks that
 * reach the rate-fetch door, so the shell binds "I'm not buying it" (useNotBuying) and the first-answer gate (FirstAnswerGateBound)
 * and hands both down.
 */
import React from 'react';
import { useNotBuying } from '@/data/mutations/decideOutcome';
import { AnswerScreen, type AnswerWrites } from '@/features/decide/screens/answer/AnswerScreen';
import { FirstAnswerGateBound } from './FirstAnswerGateBound';

export function AnswerRoute({ id, side = null }: { id: string; side?: 'cash' | 'installments' | null }): React.JSX.Element {
  const notBuying = useNotBuying();
  const writes: AnswerWrites = {
    notBuying: ({ row, evaluation }) => notBuying.pass({ check: row, evaluation }),
  };
  return <AnswerScreen id={id} side={side} writes={writes} renderGate={(onDone) => <FirstAnswerGateBound onDone={onDone} />} />;
}
