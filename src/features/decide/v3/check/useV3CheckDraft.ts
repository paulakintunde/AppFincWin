// 05.3-24 (DSV-05, D-16, D-19): the Check screen's draft. The first edit creates the decide_checks row (status open); later edits
// debounce into useSaveCheckDraft; leaving flushes and never prompts. The stored answer (answer_v3) is written only by commit(),
// on "Check it" (D-13/D-16), never by an edit. Only plain stored JSON (toStoredV2) reaches the write queue.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useMutationState, useQueryClient } from '@tanstack/react-query';
import { mutationKeys } from '@/data/keys';
import { useCreateCheck, useSaveCheckAnswer, useSaveCheckDraft } from '@/data/mutations/decideChecks';
import { useDecideChecks } from '@/data/queries/decide';
import type { DecideCheckRow, StoredSeenV3 } from '@/db/decideChecks';
import { readStoredCheck, seenOf, toStoredV2 } from '@/engine/decide/v3';
import type { CheckV2, Result } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getAnalytics } from '@/services/analytics';
import { isOfflinePaused } from '@/data/sync/writeQueueState';
import { draftStatus } from '../model/draftStatus';
import type { DraftSaveStatus } from '../model/draftStatus';
import { emptyCheck } from '../model/checkEdits';

export const V3_DRAFT_DEBOUNCE_MS = 400;
const NAME_MAX = 80;

export type { DraftSaveStatus };

export interface V3CheckDraft {
  check: CheckV2;
  name: string;
  row: DecideCheckRow | null;
  status: DraftSaveStatus;
  /** True once the stored row is decided (bought, waiting or passed): the screen shows it but edits are ignored. */
  readOnly: boolean;
  edit(next: CheckV2): void;
  setName(name: string): void;
  commit(result: Result): boolean;
}

interface SaveMutation {
  status: 'idle' | 'pending' | 'success' | 'error';
  isPaused: boolean;
  submittedAt: number;
}

/** The newest create or draft save decides error; offline only when paused with the app offline; any pending save reads saving. */
export function saveStatusOf(mutations: readonly SaveMutation[], online: boolean): DraftSaveStatus {
  const offlinePaused = mutations.some((m) => isOfflinePaused(m, online));
  const pending = mutations.some((m) => m.status === 'pending');
  const newest = mutations.reduce<SaveMutation | null>((a, m) => (a === null || m.submittedAt >= a.submittedAt ? m : a), null);
  if (newest === null) return 'saved';
  return draftStatus({ status: newest.status, offlinePaused, pending });
}

const isSaveKey = (key: readonly unknown[] | undefined): boolean =>
  key !== undefined &&
  key.length === 2 &&
  key[0] === mutationKeys.createCheck[0] &&
  (key[1] === mutationKeys.createCheck[1] || key[1] === mutationKeys.saveCheckDraft[1]);

const NO_ROWS: readonly never[] = [];

export function useV3CheckDraft(id: string): V3CheckDraft {
  const rc = useRecordContext();
  const qc = useQueryClient();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const { create, pendingRows = NO_ROWS } = useCreateCheck();
  const { save: saveDraft } = useSaveCheckDraft();
  const answer = useSaveCheckAnswer();

  const row = useMemo<DecideCheckRow | null>(
    () => checks.data?.find((r) => r.id === id) ?? pendingRows.find((r) => r.id === id) ?? null,
    [checks.data, pendingRows, id],
  );
  const base = useMemo(
    () => (row === null ? { check: emptyCheck(), name: '' } : { check: readStoredCheck(row.inputs).check, name: row.name }),
    [row],
  );
  const [edited, setEdited] = useState<{ check: CheckV2; name: string } | null>(null);
  const current = edited ?? base;

  const latest = useRef(current);
  const dirty = useRef(false);
  const created = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ rc, row, create, saveDraft, answer });
  useEffect(() => {
    live.current = { rc, row, create, saveDraft, answer };
    // until the first edit, the stored row (as it loads) is the base every edit builds on
    if (edited === null && !dirty.current) latest.current = base;
  });

  const readOnly = row !== null && row.status !== 'open';
  const guard = useRef(readOnly);
  useEffect(() => {
    guard.current = readOnly;
  });

  const flush = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    const { rc: ctx, row: stored, create: doCreate, saveDraft: doSave } = live.current;
    const { check, name } = latest.current;
    const inputs = toStoredV2(check) as unknown as Record<string, unknown>;
    if (stored === null && !created.current) {
      // the first edit before the account ids resolve stays held and is created when they arrive
      if (!ctx.userId || !ctx.householdId) return;
      created.current = true;
      dirty.current = false;
      getAnalytics().track('decide_check_started', {});
      doCreate({ userId: ctx.userId, id, householdId: ctx.householdId, kind: 'buy', name: name.slice(0, NAME_MAX), inputs, furthestStep: 1 });
      return;
    }
    dirty.current = false;
    doSave({ id, name: name.slice(0, NAME_MAX), inputs, furthestStep: Math.max(1, stored?.furthest_step ?? 1) });
  }, [id]);

  useEffect(() => {
    if (rc.userId && rc.householdId && dirty.current && row === null && !created.current) flush();
  }, [rc.userId, rc.householdId, row, flush]);

  // The app leaving the foreground queues the pending edit at once, before the OS can end the process.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') flush();
    });
    return () => sub.remove();
  }, [flush]);

  // Leaving never loses work.
  useEffect(
    () => () => {
      flush();
    },
    [flush],
  );

  const touch = useCallback(
    (next: { check: CheckV2; name: string }): void => {
      if (guard.current) return;
      latest.current = next;
      dirty.current = true;
      setEdited(next);
      if (live.current.row === null && !created.current) {
        flush();
        return;
      }
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, V3_DRAFT_DEBOUNCE_MS);
    },
    [flush],
  );

  const edit = useCallback((next: CheckV2): void => touch({ check: next, name: latest.current.name }), [touch]);
  const setName = useCallback((name: string): void => touch({ check: latest.current.check, name }), [touch]);

  const commit = useCallback(
    (result: Result): boolean => {
      if (dirty.current) {
        // 05.3-85 (UAT step 22): the queued draft save's onMutate waits behind earlier writes in WRITE_SCOPE, so the answer screen would
        // read the stale row; the latest inputs go into the cache now, the same patch the save's onMutate makes later.
        const { check, name } = latest.current;
        const inputs = toStoredV2(check) as unknown as Record<string, unknown>;
        qc.setQueriesData<readonly (DecideCheckRow & { pending?: boolean })[]>({ queryKey: ['decide-checks'] }, (old) => {
          if (!Array.isArray(old)) return old;
          const i = old.findIndex((r) => r.id === id);
          if (i < 0) return old;
          const prev = old[i]!;
          const out = old.slice();
          out[i] = { ...prev, name: name.slice(0, NAME_MAX), inputs, furthest_step: Math.max(1, prev.furthest_step ?? 1), pending: true };
          return out;
        });
      }
      flush();
      const stored = live.current.row;
      if (stored === null) return false;
      const seen = seenOf(result);
      live.current.answer.save(stored, { ...seen, lineFacts: [...seen.lineFacts] } as StoredSeenV3);
      return true;
    },
    [flush, qc, id],
  );

  const online = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline());
  const mutations = useMutationState<SaveMutation>({
    filters: {
      predicate: (m) => isSaveKey(m.options.mutationKey) && (m.state.variables as { id?: string } | undefined)?.id === id,
    },
    select: (m) => ({ status: m.state.status, isPaused: m.state.isPaused, submittedAt: m.state.submittedAt }),
  });

  return { check: current.check, name: current.name, row, status: saveStatusOf(mutations, online), readOnly, edit, setName, commit };
}
