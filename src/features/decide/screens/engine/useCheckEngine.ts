// 06.1-11: the one hook every answer, stepper and sheet uses to reach the v3 engine. It rides on useDecideV3 so nothing is read
// twice: the Prepared is built once per data change (APP-05) and typing a price re-runs only judgeCheck. The bigint-carrying
// Evaluation lives in memory only and is never put in a React Query cache. Engine reached through the barrel only.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import { perfMark, usePerfMount } from '@/features/decide/perf/perfMarks';

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
  /** 06.1-23: the same check judged as bought on this date (Buy later). null while loading or for a home-kind check. */
  judgeOn: (date: LocalDate) => Evaluation | null;
  /** 06.1-23: the pay days inside the 90-day cash path, in date order; empty while loading. */
  paydays: () => readonly LocalDate[];
}

/** D-02: home buying stays hidden; a property check is not judged. */
const isHomeKind = (check: CheckV2): boolean => check.itemType.kind === 'preset' && check.itemType.value === 'property';

const NO_DAYS: readonly LocalDate[] = [];
/** Identity-keyed: a Prepared and a judged check object give one pay-day list for as long as both live. */
const paydayCache = new WeakMap<Prepared, WeakMap<CheckV2, readonly LocalDate[]>>();
function paydaysOf(prepared: Prepared, judged: CheckV2): readonly LocalDate[] {
  let byCheck = paydayCache.get(prepared);
  if (byCheck === undefined) {
    byCheck = new WeakMap();
    paydayCache.set(prepared, byCheck);
  }
  const hit = byCheck.get(judged);
  if (hit !== undefined) return hit;
  const days = new Set<string>();
  for (const row of cashTimeline(prepared, judged).rows) if (row.kind === 'pay') days.add(row.date);
  const list = [...days].sort() as LocalDate[];
  byCheck.set(judged, list);
  return list;
}

export function useCheckEngine(check: CheckV2 | null, opts?: { checkId?: string }): CheckEngine {
  // 06.1-72: perf builds time this hook's first mount (answer.mount) and its first judge (answer.firstJudge); no-ops otherwise.
  usePerfMount('answer.mount');
  useState(() => perfMark('answer.firstJudge:start')); // the first render only
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

  // 06.1-47 (B-6, ANR): the shown verdict judges a deferred copy of the check, so a keystroke renders the field at once and the
  // judge runs in a background render that React drops if the next keystroke arrives first. The on-demand extras below
  // (both, judgeOn, timeline, readyDate) still use the live check: they run only when the user asks for them.
  const deferredJudged = useDeferredValue(judged);
  const evaluation = useMemo<Evaluation | null>(() => {
    if (prepared === null || deferredJudged === null) return null;
    perfMark('answer.judge:start');
    const judgedNow = (deferredJudged.quickLines ?? []).length > 0 ? judgeWithQuickLines(prepared, deferredJudged) : judgeCheck(prepared, deferredJudged);
    perfMark('answer.judge:end');
    return judgedNow;
  }, [prepared, deferredJudged]);

  // 06.1-47: the end of the Check it -> answer timing, once per check id (the start is marked by Decide home's Check it).
  const markedFor = useRef<string | null>(null);
  useEffect(() => {
    if (evaluation === null) return;
    const key = checkId ?? '';
    if (markedFor.current === key) return;
    if (markedFor.current === null) perfMark('answer.firstJudge:end');
    markedFor.current = key;
    perfMark('decide.answer:end');
  }, [evaluation, checkId]);

  const both = useCallback((): BothResults | null => (prepared === null || judged === null ? null : judgeBoth(prepared, judged)), [prepared, judged]);
  // futures extends the shown evaluation, so it reads the same (deferred) check the evaluation was judged on.
  const futures = useCallback((): Futures | null => {
    if (evaluation === null || evaluation.purchase === null || deferredJudged === null) return null;
    const { result, month, funds, purchase } = evaluation;
    return insteadFutures({ result, month, funds, purchase, userRate: null, years: 1, check: { price: deferredJudged.price, value: deferredJudged.value } });
  }, [evaluation, deferredJudged]);
  const readyDate = useCallback((saved: number): LocalDate | null => (prepared === null || judged === null ? null : saveForItReadyDate(prepared, judged, saved)), [prepared, judged]);
  const timeline = useCallback((): CashTimeline | null => (prepared === null || judged === null ? null : cashTimeline(prepared, judged)), [prepared, judged]);

  const judgeOn = useCallback(
    (date: LocalDate): Evaluation | null => {
      if (prepared === null || judged === null) return null;
      const dated: CheckV2 = { ...judged, purchaseDate: date };
      return (dated.quickLines ?? []).length > 0 ? judgeWithQuickLines(prepared, dated) : judgeCheck(prepared, dated);
    },
    [prepared, judged]
  );
  // 06.1-47 (B-7): the 90-day pay-day list is built at most once per Prepared and check (paydaysOf). It stays lazy (nothing
  // runs until an answer asks), and every later call returns the same array, so AnswerScreen re-renders no longer walk the cash path.
  const paydays = useCallback((): readonly LocalDate[] => (prepared === null || judged === null ? NO_DAYS : paydaysOf(prepared, judged)), [prepared, judged]);

  return { status: state.status, errorKind: state.errorKind, missingReads: state.missingReads, refetch: state.refetch, evaluation, both, futures, readyDate, timeline, judgeOn, paydays };
}
