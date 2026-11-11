// 06.1-11: the one hook every answer, stepper and sheet uses to reach the v3 engine. It rides on useDecideV3 so nothing is read
// twice: the Prepared is built once per data change (APP-05) and typing a price re-runs only judgeCheck. The bigint-carrying
// Evaluation lives in memory only and is never put in a React Query cache. Engine reached through the barrel only.
import { useCallback, useMemo } from 'react';
import {
  cashTimeline,
  insteadFutures,
  judgeBoth,
  judgeCheck,
  judgeWithQuickLines,
  saveForItReadyDate,
  type BothResults,
  type CashTimeline,
  type CheckV2,
  type Evaluation,
  type Futures,
  type LocalDate,
  type Prepared,
} from '@/engine/decide/v3';
import type { DbErrorKind } from '@/db/errors';
import { useDecideV3, type DecideV3State } from '@/data/queries/decideV3';

export interface CheckEngine {
  status: DecideV3State['status'];
  errorKind: DbErrorKind | null;
  missingReads: readonly string[];
  refetch(): void;
  /** null while loading, for a home-kind check (D-02), or for no check. */
  evaluation: Evaluation | null;
  both: () => BothResults | null;
  futures: () => Futures | null;
  readyDate: (saved: number) => LocalDate | null;
  timeline: () => CashTimeline | null;
}

/** D-02: home buying stays hidden; a property check is not judged. */
const isHomeKind = (check: CheckV2): boolean => check.itemType.kind === 'preset' && check.itemType.value === 'property';

export function useCheckEngine(check: CheckV2 | null, opts?: { checkId?: string }): CheckEngine {
  const state = useDecideV3();
  const prepared: Prepared | null = state.prepared;
  const checkId = opts?.checkId;
  const answers = state.v3?.answers;

  // D-48: the saved answer to "can you cover it in your low months", applied as computeV3 does.
  const judged = useMemo<CheckV2 | null>(() => {
    if (check === null || isHomeKind(check)) return null;
    if (checkId === undefined) return check;
    const hit = (answers ?? []).find((a) => a.kind === 'volatile_cover' && a.check_id === checkId && a.bool_value !== null);
    return hit === undefined ? check : { ...check, volatileCover: hit.bool_value };
  }, [check, checkId, answers]);

  const evaluation = useMemo<Evaluation | null>(() => {
    if (prepared === null || judged === null) return null;
    return (judged.quickLines ?? []).length > 0 ? judgeWithQuickLines(prepared, judged) : judgeCheck(prepared, judged);
  }, [prepared, judged]);

  const both = useCallback((): BothResults | null => (prepared === null || judged === null ? null : judgeBoth(prepared, judged)), [prepared, judged]);
  const futures = useCallback((): Futures | null => {
    if (evaluation === null || evaluation.purchase === null || judged === null) return null;
    const { result, month, funds, purchase } = evaluation;
    return insteadFutures({ result, month, funds, purchase, userRate: null, years: 1, check: { price: judged.price, value: judged.value } });
  }, [evaluation, judged]);
  const readyDate = useCallback((saved: number): LocalDate | null => (prepared === null || judged === null ? null : saveForItReadyDate(prepared, judged, saved)), [prepared, judged]);
  const timeline = useCallback((): CashTimeline | null => (prepared === null || judged === null ? null : cashTimeline(prepared, judged)), [prepared, judged]);

  return { status: state.status, errorKind: state.errorKind, missingReads: state.missingReads, refetch: state.refetch, evaluation, both, futures, readyDate, timeline };
}
