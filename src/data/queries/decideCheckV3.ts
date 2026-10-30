// 05.3 criterion 1: the one module that turns cached reads into v3 Evaluations for every screen. Evaluations hold bigints and are never cached.
import { useCallback, useMemo } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { buildV3Inputs } from '@/features/decide/snapshot/v3/buildV3Inputs';
import { computeV3, computeV3Many, computeV3WithoutRefunds } from '@/features/decide/snapshot/v3/computeV3';
import { settingsSourceOf } from '@/features/decide/snapshot/v3/settingsSource';
import { hasRefundLinks } from '@/features/decide/snapshot/v3/stripRefunds';
import type { V3SettingsSource } from '@/features/decide/snapshot/v3/types';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { Evaluation, V3Inputs } from '@/engine/decide/v3';
import { useDecideChecks, useDecideLinks, useDecideSettings, useDecideSnapshot } from './decide';
import { useDecideAnswers } from './decideAnswers';
import { planLiveOf } from './decideV3';
import { useRecurringDismissals } from './recurringDismissals';

/** L-09: writes queued or in flight (a paused offline mutation is still pending). Re-renders as they settle. */
export function usePendingWriteCount(): number {
  return useIsMutating();
}

type Status = 'loading' | 'error' | 'ready';

interface V3Reads {
  status: Status;
  source: SnapshotSource | null;
  v3: V3SettingsSource | null;
  rows: readonly DecideCheckRow[] | null;
  refetch(): void;
}

const NO_CHECKS: readonly DecideCheckRow[] = [];

/** The shared read composition, so useChecksV3 and useCheckV3 cannot drift. */
function useV3Reads(): V3Reads {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const snapshot = useDecideSnapshot();
  const settings = useDecideSettings(userId);
  const answers = useDecideAnswers(userId, householdId);
  const dismissals = useRecurringDismissals(householdId);
  const checks = useDecideChecks(userId, householdId);
  const checkIds = useMemo(() => (checks.data ?? NO_CHECKS).map((c) => c.id).sort(), [checks.data]);
  const links = useDecideLinks(userId, householdId, checkIds);

  const reads = [settings, answers, dismissals, checks, links];
  const failed = snapshot.status === 'error' || reads.some((q) => q.data === undefined && q.isError);
  const missing = reads.some((q) => q.data === undefined);

  const source = snapshot.source;
  const settingsRow = settings.data;
  const answerRows = answers.data;
  const dismissalRows = dismissals.data;
  const checkRows = checks.data;
  const linkRows = links.data;
  const v3 = useMemo(() => {
    if (source === null || missing || settingsRow === undefined || answerRows === undefined || dismissalRows === undefined || checkRows === undefined || linkRows === undefined) return null;
    return settingsSourceOf({ settings: settingsRow, answers: answerRows, dismissals: dismissalRows, checks: checkRows, planLive: planLiveOf(linkRows, source) });
  }, [source, missing, settingsRow, answerRows, dismissalRows, checkRows, linkRows]);

  const retrySnapshot = snapshot.retry;
  const refetchers = reads.map((q) => q.refetch);
  const refetch = useCallback(() => {
    retrySnapshot();
    refetchers.forEach((r) => void r());
    // the query refetch functions are stable per query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrySnapshot]);

  const status: Status = failed ? 'error' : source === null || v3 === null ? 'loading' : 'ready';
  return { status, source, v3, rows: v3 === null ? null : (checkRows ?? NO_CHECKS), refetch };
}

export interface ChecksV3State {
  status: Status;
  rows: readonly DecideCheckRow[];
  inputs: V3Inputs | null;
  home: Evaluation | null;
  byId: ReadonlyMap<string, Evaluation>;
  withoutRefunds: ReadonlyMap<string, Evaluation>;
  refetch(): void;
}

const EMPTY_MAP: ReadonlyMap<string, Evaluation> = new Map();

export function useChecksV3(): ChecksV3State {
  const { status, source, v3, rows, refetch } = useV3Reads();
  const pending = usePendingWriteCount();
  const computed = useMemo(() => {
    if (source === null || v3 === null || rows === null) return null;
    const live = rows.filter((r) => r.deleted_at === null);
    const inputs = buildV3Inputs(source, v3, undefined, undefined, pending);
    const byId = computeV3Many(source, v3, live, pending);
    const withoutRefunds = new Map<string, Evaluation>();
    if (hasRefundLinks(inputs)) for (const r of live) withoutRefunds.set(r.id, computeV3WithoutRefunds(source, v3, r.inputs, r.id, pending));
    return { live, inputs, byId, withoutRefunds, home: computeV3(source, v3, {}, undefined, null, pending) };
  }, [source, v3, rows, pending]);
  return {
    status,
    rows: computed?.live ?? NO_CHECKS,
    inputs: computed?.inputs ?? null,
    home: computed?.home ?? null,
    byId: computed?.byId ?? EMPTY_MAP,
    withoutRefunds: computed?.withoutRefunds ?? EMPTY_MAP,
    refetch,
  };
}

export interface CheckV3State {
  status: Status;
  row: DecideCheckRow | null;
  inputs: V3Inputs | null;
  evaluation: Evaluation | null;
  withoutRefunds: Evaluation | null;
  refetch(): void;
}

/** One check's answer. `opts.inputs` evaluates a draft (the Check screen's live answer) instead of the stored inputs. */
export function useCheckV3(checkId: string | null, opts?: { readonly inputs?: unknown }): CheckV3State {
  const { status, source, v3, rows, refetch } = useV3Reads();
  const pending = usePendingWriteCount();
  const draft = opts?.inputs;
  const computed = useMemo(() => {
    if (source === null || v3 === null || rows === null) return null;
    const row = checkId === null ? undefined : rows.find((r) => r.id === checkId && r.deleted_at === null);
    const inputs = buildV3Inputs(source, v3, undefined, undefined, pending);
    if (row === undefined) return { row: null, inputs, evaluation: null, withoutRefunds: null };
    const stored = draft === undefined ? row.inputs : draft;
    return {
      row,
      inputs,
      evaluation: computeV3(source, v3, stored, undefined, row.id, pending),
      withoutRefunds: hasRefundLinks(inputs) ? computeV3WithoutRefunds(source, v3, stored, row.id, pending) : null,
    };
  }, [source, v3, rows, checkId, draft, pending]);
  return {
    status,
    row: computed?.row ?? null,
    inputs: computed?.inputs ?? null,
    evaluation: computed?.evaluation ?? null,
    withoutRefunds: computed?.withoutRefunds ?? null,
    refetch,
  };
}
