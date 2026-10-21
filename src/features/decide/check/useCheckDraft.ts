// 05-24 (DCU-02, DCU-03, ANL-06, D-15, D-20, D-37): loads a check and autosaves every edit through the write queue.
// A new check is created on its FIRST edit, never on open; later edits debounce into the draft save. A decided
// check is read-only. Leaving flushes a pending save and nothing here creates an undo step (A5).
// Only the typed inputs (plain JSON) are stored or held here; nothing computed ever reaches the queue.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCreateCheck, useSaveCheckDraft } from '@/data/mutations/decideChecks';
import { useDecideChecks, useDecideSnapshot } from '@/data/queries/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getAnalytics } from '@/services/analytics';
import { SAMPLE_CURRENCY } from '../snapshot/checkCurrency';
import { emptyCheckInputs, parseCheckInputs } from '../snapshot/checkInputs';
import type { CheckInputs } from '../snapshot/types';

export const DRAFT_DEBOUNCE_MS = 600;

export interface CheckDraft {
  status: 'loading' | 'ready' | 'not_found';
  row: DecideCheckRow | null;
  inputs: CheckInputs;
  update(patch: Partial<CheckInputs>, opts?: { step?: number }): void;
  saveNow(): Promise<void>;
  isNew: boolean;
}

const clampStep = (n: number): number => Math.min(5, Math.max(1, Math.trunc(n)));

export function useCheckDraft(id: string, kind: 'buy' | 'invest', today: string): CheckDraft {
  const rc = useRecordContext();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const snapshot = useDecideSnapshot();
  const { create } = useCreateCheck();
  const { save } = useSaveCheckDraft();

  const row = useMemo(() => checks.data?.find((r) => r.id === id) ?? null, [checks.data, id]);
  const [edited, setEdited] = useState<CheckInputs | null>(null);

  const created = useRef(false);
  const [seenRow, setSeenRow] = useState(false);
  const [createdState, setCreatedState] = useState(false);
  const started = useRef(false);
  const furthest = useRef(1);
  const pending = useRef<CheckInputs | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Derived-state pattern: remember that the row existed, so its later disappearance reads as not_found.
  if (row && !seenRow) setSeenRow(true);

  const currency = snapshot.result?.currency ?? null;
  const live = useRef({ rc, row, create, save, currency });
  useEffect(() => {
    live.current = { rc, row, create, save, currency };
  });

  const flush = useCallback((): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const inputs = pending.current;
    if (!inputs) return;
    const { rc: ctx, row: current, create: doCreate, save: doSave, currency: homeCurrency } = live.current;
    // D-37: a check records the currency its amounts were typed in once, on first save, and never changes it. An unstamped
    // sample check is USD (IN-A01, D-67). CR-C06: the stamp is written back into the held inputs, so a later save in the
    // same session re-uses it rather than stamping again from a home currency that may have changed since.
    const typed = inputs.currency ?? (current?.is_sample === true ? SAMPLE_CURRENCY : homeCurrency);
    const stamped: CheckInputs = inputs.currency === null && typed !== null ? { ...inputs, currency: typed } : inputs;
    if (stamped !== inputs) setEdited((e) => (e !== null && e.currency === null ? { ...e, currency: stamped.currency } : e));
    const step = Math.max(furthest.current, current?.furthest_step ?? 1);
    const json = stamped as unknown as Record<string, unknown>;
    if (!current && !created.current) {
      if (!ctx.userId || !ctx.householdId) return;
      pending.current = null;
      created.current = true;
      setCreatedState(true);
      doCreate({
        userId: ctx.userId,
        id,
        householdId: ctx.householdId,
        kind,
        name: stamped.name.slice(0, 80),
        inputs: json,
        furthestStep: step,
      });
      return;
    }
    pending.current = null;
    doSave({ id, name: stamped.name.slice(0, 80), inputs: json, furthestStep: step });
  }, [id, kind]);

  // A first edit made before the user and household ids resolve stays pending (flush returns early and keeps
  // it); create it as soon as both ids arrive rather than waiting for a second edit.
  useEffect(() => {
    if (rc.userId && rc.householdId && pending.current && !row && !created.current) flush();
  }, [rc.userId, rc.householdId, row, flush]);

  // Leaving never loses work: the pending save is flushed on unmount.
  useEffect(
    () => () => {
      flush();
    },
    [flush]
  );

  const decided = row !== null && row.status !== 'open';
  const loaded = checks.data !== undefined && rc.ready;
  const status: CheckDraft['status'] = !loaded
    ? 'loading'
    : row === null && seenRow && !createdState
      ? 'not_found'
      : 'ready';

  const inputs = useMemo<CheckInputs>(() => {
    if (edited) return edited;
    return row ? parseCheckInputs(row.inputs, today) : emptyCheckInputs(kind, today);
  }, [edited, row, kind, today]);

  // CR-C01: every `update` closure, including one a toast's Undo kept from an earlier render, reads the latest inputs and
  // guards from these refs, so an Undo never rebuilds the check from a stale render and never edits a decided check.
  const latestInputs = useRef<CheckInputs>(inputs);
  const guard = useRef({ status, decided, row });
  useEffect(() => {
    latestInputs.current = inputs;
    guard.current = { status, decided, row };
  });

  const update = useCallback(
    (patch: Partial<CheckInputs>, opts?: { step?: number }): void => {
      const { status: nowStatus, decided: nowDecided, row: nowRow } = guard.current;
      if (nowStatus !== 'ready' || nowDecided) return;
      const base = pending.current ?? latestInputs.current;
      const next: CheckInputs = { ...base, ...patch };
      if (opts?.step !== undefined) furthest.current = Math.max(furthest.current, clampStep(opts.step));
      setEdited(next);
      pending.current = next;
      latestInputs.current = next;
      if (!nowRow && !created.current) {
        // First edit of a new check: create now (ANL-06, D-20).
        if (!started.current) {
          started.current = true;
          getAnalytics().track('check_started', {});
        }
        flush();
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DRAFT_DEBOUNCE_MS);
    },
    [flush]
  );

  const saveNow = useCallback(async (): Promise<void> => {
    flush();
  }, [flush]);

  return { status, row, inputs, update, saveNow, isNew: row === null && !createdState };
}
