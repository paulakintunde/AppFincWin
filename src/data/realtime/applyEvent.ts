/**
 * HH-11: one Realtime postgres_changes event -> one cache action. No I/O of its own; every decision on a row goes through
 * reconcileEvent (version only, never arrival order). A queued local edit is never overwritten (hold), an own-write echo or
 * an older event is dropped, and an event for another household (a stale channel after leave or removal) is dropped.
 *
 * Partial rows: the client reads some tables through column grants, so an event's `new` may carry fewer columns than a cached
 * row. A cached row is merged over; a row that is not cached yet is never inserted from the event, its month is refetched.
 */
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../keys';
import { resetHouseholdScope } from '../queries/household';
import { reconcileEvent, type ReconcileDecision } from './reconcile';

export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

export interface ApplyContext {
  activeHouseholdId: string | null;
  viewerId: string;
}

export type ApplyAction = ReconcileDecision | 'invalidate' | 'remove' | 'reset';

/** Versions seen in a held event (a write to the same row was queued). Cleared when a later event applies. */
export const remoteVersions = new Map<string, number>();

type Versioned = { id: string; version?: number; pending?: boolean };

function isRow(v: unknown): v is Versioned {
  return typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string';
}

function monthOf(localDate: unknown): string | null {
  return typeof localDate === 'string' && /^\d{4}-\d{2}/.test(localDate) ? localDate.slice(0, 7) : null;
}

/** The version of a row in any cached list under `root`, undefined when it is not cached. */
function cachedVersion(qc: QueryClient, root: readonly unknown[], id: string): number | undefined {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: root })) {
    if (!Array.isArray(data)) continue;
    for (const r of data) {
      if (isRow(r) && r.id === id && typeof r.version === 'number') return r.version;
    }
  }
  return undefined;
}

/** True when a pending or paused mutation names the row id in its variables. */
export function hasPendingWrite(qc: QueryClient, id: string): boolean {
  for (const m of qc.getMutationCache().getAll()) {
    if (m.state.status !== 'pending') continue;
    try {
      if (JSON.stringify(m.state.variables ?? null).includes(id)) return true;
    } catch {
      // unserialisable variables name no row we can match
    }
  }
  return false;
}

function mergeRow(rows: readonly unknown[], row: Record<string, unknown>): unknown[] {
  return rows.map((r) => {
    if (!isRow(r) || r.id !== row.id) return r;
    const { pending: _pending, ...rest } = r as Record<string, unknown> & Versioned;
    return { ...rest, ...row };
  });
}

function removeFromLists(qc: QueryClient, root: readonly unknown[], id: string): void {
  qc.setQueriesData<unknown>({ queryKey: root }, (data: unknown) =>
    Array.isArray(data) && data.some((r) => isRow(r) && r.id === id) ? data.filter((r) => !(isRow(r) && r.id === id)) : data,
  );
}

function applyVersionedRow(
  qc: QueryClient,
  ctx: ApplyContext,
  payload: RealtimePayload,
  row: Record<string, unknown>,
  root: readonly unknown[],
  kind: 'transactions' | 'accounts',
): ApplyAction {
  const id = String(row.id);
  const version = typeof row.version === 'number' ? row.version : 0;
  const had = cachedVersion(qc, root, id);
  const decision = reconcileEvent(
    { table: payload.table, householdId: String(row.household_id ?? ''), id, version },
    ctx.activeHouseholdId,
    had,
    hasPendingWrite(qc, id),
  );
  if (decision === 'hold') {
    remoteVersions.set(id, version);
    return 'hold';
  }
  if (decision === 'drop') return 'drop';
  remoteVersions.delete(id);
  const hid = ctx.activeHouseholdId as string;

  if (row.deleted_at) {
    removeFromLists(qc, root, id);
  } else if (had !== undefined) {
    qc.setQueriesData<unknown>({ queryKey: root }, (data: unknown) =>
      Array.isArray(data) && data.some((r) => isRow(r) && r.id === id) ? mergeRow(data, row) : data,
    );
  } else if (kind === 'transactions') {
    const month = monthOf(row.local_date);
    void qc.invalidateQueries({ queryKey: month ? queryKeys.transactionsMonth(hid, month) : root });
  } else {
    void qc.invalidateQueries({ queryKey: root });
  }
  if (kind === 'transactions') {
    // a version increase may mean the splits changed (split changes bump the parent row)
    void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.settlements(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.jointAccountFactsRoot(hid) }); // 08.1-22: a joint account's balance and month totals moved
  }
  return 'apply';
}

const MEMBER_KINDS = new Set(['joined', 'left', 'removed', 'weights_changed', 'renamed', 'owner_changed', 'departure_undone', 'currency_changed']);
const SPLIT_KINDS = new Set(['split_changed', 'default_changed', 'category_default_changed']);

function applyHouseholdEvent(qc: QueryClient, ctx: ApplyContext, row: Record<string, unknown>): ApplyAction {
  const hid = ctx.activeHouseholdId as string;
  const kind = String(row.kind ?? '');
  void qc.invalidateQueries({ queryKey: queryKeys.householdEvents(hid) });

  if (kind === 'made_private') {
    if (typeof row.ref_id === 'string') removeFromLists(qc, queryKeys.transactionsRoot(hid), row.ref_id);
    void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
    return 'remove';
  }
  if (MEMBER_KINDS.has(kind)) {
    if ((kind === 'removed' || kind === 'left') && row.subject_id === ctx.viewerId) {
      resetHouseholdScope(qc, ctx.viewerId, hid);
      return 'reset';
    }
    void qc.invalidateQueries({ queryKey: queryKeys.householdMembers(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.householdDetail(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
    return 'invalidate';
  }
  if (SPLIT_KINDS.has(kind)) {
    void qc.invalidateQueries({ queryKey: queryKeys.splitDefaults(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
    return 'invalidate';
  }
  if (kind === 'spend_rule_changed') {
    void qc.invalidateQueries({ queryKey: queryKeys.householdSpendRule(hid) });
    return 'invalidate';
  }
  if (kind === 'joint_purpose_changed') {
    void qc.invalidateQueries({ queryKey: queryKeys.accounts(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.jointAccountFactsRoot(hid) });
    return 'invalidate';
  }
  if (kind.startsWith('settle') || kind === 'written_off') {
    void qc.invalidateQueries({ queryKey: queryKeys.settlements(hid) });
    void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
  }
  return 'invalidate';
}

/** Applies one event and reports what was done. Unknown tables and other-household events are dropped. */
export function applyRealtimeEvent(qc: QueryClient, payload: RealtimePayload, ctx: ApplyContext): ApplyAction {
  const hid = ctx.activeHouseholdId;
  if (!hid) return 'drop';
  // DELETE events carry primary keys only (no household id): a purge or cascade. Refetch rather than trust.
  if (payload.eventType === 'DELETE') {
    switch (payload.table) {
      case 'transactions':
        void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(hid) });
        return 'invalidate';
      case 'accounts':
        void qc.invalidateQueries({ queryKey: queryKeys.accounts(hid) });
        return 'invalidate';
      case 'settlements':
      case 'settlement_lines':
        void qc.invalidateQueries({ queryKey: queryKeys.settlements(hid) });
        void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
        return 'invalidate';
      case 'household_former_members':
      case 'member_departures':
        void qc.invalidateQueries({ queryKey: queryKeys.householdMembers(hid) });
        return 'invalidate';
      case 'household_events':
        void qc.invalidateQueries({ queryKey: queryKeys.householdEvents(hid) });
        return 'invalidate';
      default:
        return 'drop';
    }
  }
  const row = payload.new ?? {};
  if (row.household_id !== hid) return 'drop';

  switch (payload.table) {
    case 'transactions':
      return applyVersionedRow(qc, ctx, payload, row, queryKeys.transactionsRoot(hid), 'transactions');
    case 'accounts':
      return applyVersionedRow(qc, ctx, payload, row, queryKeys.accounts(hid), 'accounts');
    case 'settlements':
    case 'settlement_lines':
      void qc.invalidateQueries({ queryKey: queryKeys.settlements(hid) });
      void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
      return 'invalidate';
    case 'household_former_members':
    case 'member_departures':
      void qc.invalidateQueries({ queryKey: queryKeys.householdMembers(hid) });
      void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(hid) });
      return 'invalidate';
    case 'household_events':
      return payload.eventType === 'INSERT' ? applyHouseholdEvent(qc, ctx, row) : 'drop';
    default:
      return 'drop';
  }
}
