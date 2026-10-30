// 05.3-13 (DSV-13, D-16): supplies Record as bought / Plan it / Not buying to the v3 record sheets, which may not import
// the writes themselves (depcruise fx-fetch-never-from-reads). Every action saves answer_v3 first.
import React, { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useRecordBought } from '@/data/mutations/boughtWrite';
import { useSaveCheckAnswer } from '@/data/mutations/decideChecks';
import { usePass, useWaitAndSave } from '@/data/mutations/decideOutcome';
import {
  RecordMutationsContext,
  type RecordArgs,
  type RecordMutations,
} from '@/features/decide/v3/record/recordMutations';

/** A month-only ready-by reads as the first of that month. */
function readyByDate(r: RecordArgs['evaluation']['result']['readyBy']): string | null {
  if (r === null) return null;
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

export function V3RecordProvider({ children }: { children: ReactNode }) {
  const bought = useRecordBought();
  const wait = useWaitAndSave();
  const pass = usePass();
  const answer = useSaveCheckAnswer();
  // The hooks hand back new objects every render; the value reads them through a ref and stays one object.
  const latest = useRef({ bought, wait, pass, answer });
  useEffect(() => {
    latest.current = { bought, wait, pass, answer };
  });
  const value = useMemo<RecordMutations>(
    () => ({
      canRecordBought: ({ evaluation, ctx }) =>
        latest.current.bought.canRecord({ purchase: evaluation.purchase, result: evaluation.result, ctx }),
      recordBought: ({ check, evaluation, seen, ctx }) => {
        if (evaluation.purchase === null) return null;
        latest.current.answer.save(check, seen);
        return latest.current.bought.record({ check, purchase: evaluation.purchase, result: evaluation.result, ctx });
      },
      planIt: ({ check, evaluation, seen, ctx, goalTarget, reminderOn }) => {
        latest.current.answer.save(check, seen);
        const readyBy = readyByDate(evaluation.result.readyBy);
        return latest.current.wait.save({
          check,
          verdict: evaluation.result.legacyState,
          currency: ctx.currency,
          monthlyAmount: evaluation.purchase?.monthly ?? 0,
          readyBy: reminderOn ? readyBy : null,
          today: ctx.today,
          goalTarget,
          coolingOff: false,
        });
      },
      notBuying: ({ check, evaluation, seen }) => {
        latest.current.answer.save(check, seen);
        return latest.current.pass.pass({ check, verdict: evaluation.result.legacyState, coolingOff: false });
      },
    }),
    []
  );
  return <RecordMutationsContext.Provider value={value}>{children}</RecordMutationsContext.Provider>;
}
