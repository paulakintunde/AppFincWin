// 10.1-26 (SCN-06, SCN-07; D-14..D-17): splitting a shared line by its receipt items, and its Undo. Like the other line writes
// both wait in the offline queue and replay version-checked. Only the items, people and extras are sent; the server works out
// every share (T-10.1-26-01). The cached line is patched at once (a hand-set 'amount' split with the new parts), and the
// server's before-state comes back so Undo can send it to restore_line_split with `restoreSplitVars`.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { fromParts } from '@/db/categoryParts';
import {
  restoreLineSplit,
  setSplitByItem,
  type ItemSplitBefore,
  type ItemSplitExtras,
  type ItemSplitItem,
} from '@/db/itemSplit';
import type { TransactionRow } from '@/db/rows';
import type { SplitRule } from '@/db/transactionSplits';
import type { Part } from '@/engine/parts';
import { primaryCategory } from '@/engine/parts';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { handleFailure, patchLine, refreshAfterLineWrite, unwrapRpc } from './householdSharing';
import { writeClient } from './writeClient';

interface LineVars {
  householdId: string;
  /** The line's month ('YYYY-MM'), so its cache entry can be patched and refreshed. */
  month: string;
  id: string;
  /** The line's version in the cache when the change was made. */
  expectedVersion: number;
}

export interface SetSplitByItemVars extends LineVars {
  items: ItemSplitItem[];
  extras: ItemSplitExtras;
  /** Signed like the line; null when the items come to one category. */
  parts: Part[] | null;
  /** With null parts: the line's category (null keeps the one it has). */
  category: string | null;
  store: string | null;
  date: string | null;
}

export interface SetSplitByItemResult {
  version: number | null;
  /** The line as it was before this change: what Undo sends back. Null when the server gave none. */
  before: ItemSplitBefore | null;
  /** Each person's total as the server worked it out. */
  shares: Record<string, number> | null;
}

export interface RestoreLineSplitVars extends LineVars {
  before: ItemSplitBefore;
}

/** The call that puts the line's split, parts and item list back; null when the server gave no before-state or version. */
export function restoreSplitVars(
  original: Pick<LineVars, 'householdId' | 'month' | 'id'>,
  result: SetSplitByItemResult
): RestoreLineSplitVars | null {
  if (!result.before || result.version === null) return null;
  return { householdId: original.householdId, month: original.month, id: original.id, expectedVersion: result.version, before: result.before };
}

function linePatchFor(vars: SetSplitByItemVars): Partial<TransactionRow> {
  const base: Partial<TransactionRow> = { split_rule: 'amount', split_manual: true };
  if (vars.parts !== null && vars.parts.length > 0) {
    return { ...base, category_parts: fromParts(vars.parts), category_id: primaryCategory(vars.parts) };
  }
  return { ...base, category_parts: null, ...(vars.category ? { category_id: vars.category } : {}) };
}

export function registerItemSplitDefaults(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.setSplitByItem, {
    mutationFn: (vars: SetSplitByItemVars) =>
      guardSession(vars, async (): Promise<SetSplitByItemResult> => {
        const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const ok = unwrapRpc(
          await setSplitByItem(client, {
            id: vars.id,
            expectedVersion: expected,
            items: vars.items,
            extras: vars.extras,
            parts: vars.parts,
            category: vars.category,
            store: vars.store,
            date: vars.date,
          }),
          vars.id
        );
        const version = typeof ok.version === 'number' ? ok.version : null;
        if (version !== null) recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], version);
        return { version, before: ok.before ?? null, shares: ok.shares ?? null };
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetSplitByItemVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      patchLine(qc, vars, linePatchFor(vars));
    },
    onSuccess: (_res: SetSplitByItemResult, vars: SetSplitByItemVars) => refreshAfterLineWrite(qc, vars),
    // version_conflict arrives as a VersionConflictError carrying updated_by: the month is re-read, the failure parked, and
    // the caller sees the same error (it names who changed the line and keeps the user's choices).
    onError: (err: unknown, vars: SetSplitByItemVars) => handleFailure(qc, err, vars, vars.id, 'setSplitByItem'),
  });

  qc.setMutationDefaults(mutationKeys.restoreLineSplit, {
    mutationFn: (vars: RestoreLineSplitVars) =>
      guardSession(vars, async (): Promise<{ version: number | null }> => {
        const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const ok = unwrapRpc(await restoreLineSplit(client, vars.id, expected, vars.before), vars.id);
        const version = typeof ok.version === 'number' ? ok.version : null;
        if (version !== null) recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], version);
        return { version };
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: RestoreLineSplitVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      const b = vars.before;
      patchLine(qc, vars, {
        split_rule: b.rule,
        split_manual: b.manual,
        category_parts: b.parts,
        category_id: b.category_id,
        item_split: b.item_split,
      });
    },
    onSuccess: (_res: { version: number | null }, vars: RestoreLineSplitVars) => refreshAfterLineWrite(qc, vars),
    onError: (err: unknown, vars: RestoreLineSplitVars) => handleFailure(qc, err, vars, vars.id, 'restoreLineSplit'),
  });
}

export function useSetSplitByItem() {
  return useMutation<SetSplitByItemResult, unknown, SetSplitByItemVars>({ mutationKey: mutationKeys.setSplitByItem, scope: WRITE_SCOPE });
}

export function useRestoreLineSplit() {
  return useMutation<{ version: number | null }, unknown, RestoreLineSplitVars>({
    mutationKey: mutationKeys.restoreLineSplit,
    scope: WRITE_SCOPE,
  });
}

/**
 * 10.1-27 (D-17): the before-state this phone's own split by item got back from the server, when the line has not changed since
 * (the result's version is the line's version now). Undo then puts the split, parts, category and item list back exactly.
 */
export function latestItemSplitBefore(qc: QueryClient, lineId: string, lineVersion: number): ItemSplitBefore | null {
  const mine = qc
    .getMutationCache()
    .findAll({ mutationKey: mutationKeys.setSplitByItem, status: 'success' })
    .filter((m) => (m.state.variables as SetSplitByItemVars | undefined)?.id === lineId)
    .sort((a, b) => a.state.submittedAt - b.state.submittedAt);
  const data = mine.at(-1)?.state.data as SetSplitByItemResult | undefined;
  return data && data.version === lineVersion ? data.before : null;
}

const RULES: readonly SplitRule[] = ['even', 'weight', 'amount', 'mine'];

/**
 * 10.1-27 (D-17): Undo from the household event alone (someone else's phone). The event carries the split before the change
 * (rule, participants, shares); the line keeps the parts and category it has now, and the item list is cleared, since the
 * split no longer follows the items. Null when the event's before-state is not usable.
 */
export function itemSplitBeforeFromEvent(
  raw: unknown,
  line: Pick<TransactionRow, 'category_parts' | 'category_id'>
): ItemSplitBefore | null {
  if (raw === null || typeof raw !== 'object') return null;
  const b = raw as { rule?: unknown; participants?: unknown; shares?: unknown };
  const rule = RULES.find((r) => r === b.rule) ?? null;
  if (rule === null || !Array.isArray(b.participants) || b.participants.length === 0) return null;
  if (!b.participants.every((p) => typeof p === 'string')) return null;
  if (b.shares === null || typeof b.shares !== 'object') return null;
  const shares: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.shares as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isInteger(v)) return null;
    shares[k] = v;
  }
  return {
    split: { rule, participants: [...(b.participants as string[])], shares },
    rule,
    manual: rule === 'amount',
    parts: line.category_parts ?? null,
    category_id: line.category_id ?? null,
    item_split: null,
  };
}
