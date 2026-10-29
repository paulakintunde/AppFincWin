// 05.2-16 (DSU-15, DSU-21; D-21, owner decision 4): saving an income type. One user action is ONE queued batch:
//   1. the payer rule is created (client uuid; a duplicate is read back as landed),
//   2. ONE apply_patches call tags this payment and, with "Apply to future payments" on, every earlier untagged payment
//      from that payer, and records the undo step in the same server transaction.
// A refused row refuses the whole batch, so no transaction is ever left half-tagged. Undo reverses every row and
// soft-deletes a rule this save created (a rule that already existed is put back to its old values instead).
// If step 2 is refused after step 1 landed, the new rule stays: it is the answer the user gave for that payer, it
// tags nothing by itself, and the next save for the payer finds it live and patches it. Variables are plain JSON;
// the step id is minted once before mutate() and is the replay key. Failed-write records hold ids, counts and
// column names only, never a payer name or an amount.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  MAX_UNDO_OPS,
  buildStep,
  inverseOfInserts,
  planBulkPatch,
  type BulkPatchItem,
  type PatchOp,
  type PatchValue,
  type UndoConflict,
  type UndoLabelKey,
} from '@/engine/undo';
import { VersionConflictError, type WriteEntity } from '@/db/errors';
import { applyPatches } from '@/db/patches';
import { insertPayerPrompt, type IncomePayerPromptRow, type NewPayerPrompt } from '@/db/incomePayerPrompts';
import type { TransactionRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { writeClient } from './writeClient';
import { upsertRow } from './cacheRows';
import { newStepId } from './undoCapture';
import { invalidateDerivedReads, patchMonthCacheIfLoaded } from './transactionCache';
import { payerKeyOf } from './incomeTagModel';

type PromptList = WithPending<IncomePayerPromptRow>[];

/** Most payments one save may tag: the undo step holds MAX_UNDO_OPS ops, one of them kept for the rule. */
export const MAX_TAGGED_ROWS = MAX_UNDO_OPS - 1;

type RulePlan =
  | { mode: 'insert'; row: NewPayerPrompt }
  | { mode: 'patch'; id: string; version: number; before: Record<string, PatchValue>; patch: Record<string, PatchValue> };

export interface TagIncomeVars {
  ownerId: string;
  householdId: string;
  stepId: string;
  labelKey: UndoLabelKey;
  /** Undo label parameters: the payer as the user knows it, and how many payments the step tags. */
  labelName: string | null;
  labelCount: number;
  /** Transaction items (version-conditional, with their `before` values). */
  items: BulkPatchItem[];
  /** Distinct YYYY-MM months of the items, for the cache. */
  months: string[];
  rule: RulePlan | null;
}

function tagBefore(row: TransactionRow): Record<string, PatchValue> {
  return { income_kind: row.income_kind ?? null, counts_as: row.counts_as ?? null };
}

/** Shared with refund links: merge a patch into the cached month lists, only for months already loaded. */
export function mergeIntoMonths(
  qc: QueryClient,
  householdId: string,
  months: readonly string[],
  byId: ReadonlyMap<string, Record<string, PatchValue>>,
  pending: boolean
): void {
  for (const month of months) {
    patchMonthCacheIfLoaded(qc, householdId, month, (rows) =>
      rows.map((r) => {
        const patch = byId.get(r.id);
        if (!patch) return r;
        return pending ? ({ ...r, ...patch, pending: true } as typeof r) : ({ ...r, ...patch } as typeof r);
      })
    );
  }
}

function invalidateAll(qc: QueryClient, vars: TagIncomeVars): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.incomePayerPrompts(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
  invalidateDerivedReads(qc, vars.householdId);
}

async function runTag(vars: TagIncomeVars) {
  const client = await writeClient();
  const all: BulkPatchItem[] = [...vars.items];
  let inserted: { id: string; version: number } | null = null;

  if (vars.rule?.mode === 'insert') {
    const row = await insertPayerPrompt(client, vars.rule.row);
    const wanted = { income_kind: vars.rule.row.income_kind, counts_as: vars.rule.row.counts_as };
    if (row.id === vars.rule.row.id) {
      inserted = { id: row.id, version: row.version };
    } else if (row.income_kind !== wanted.income_kind || row.counts_as !== wanted.counts_as) {
      // Another device made the rule first: change it to this answer and let Undo put it back.
      all.push({
        entity: 'income_payer_prompts',
        id: row.id,
        expectedVersion: row.version,
        before: { income_kind: row.income_kind, counts_as: row.counts_as },
        patch: wanted,
      });
    }
  } else if (vars.rule?.mode === 'patch') {
    all.push({
      entity: 'income_payer_prompts',
      id: vars.rule.id,
      expectedVersion: vars.rule.version,
      before: vars.rule.before,
      patch: vars.rule.patch,
    });
  }

  const resolved = all.map((i) => ({
    ...i,
    expectedVersion: resolveExpectedVersion(i.entity as WriteEntity, i.id, i.expectedVersion),
  }));
  const { forward, inverse } = planBulkPatch(resolved);
  const undoOps: PatchOp[] = [...inverse];
  if (inserted) undoOps.push(...inverseOfInserts('income_payer_prompts', [inserted]));
  const params = vars.labelName ? { n: vars.labelCount, name: vars.labelName } : { n: vars.labelCount };
  const step = buildStep(vars.stepId, vars.labelKey, params, undoOps);
  const rows = await applyPatches(client, forward, step);
  const bases = new Map(all.map((i, k) => [`${i.entity}\u0000${i.id}`, [i.expectedVersion, resolved[k]!.expectedVersion]] as const));
  for (const row of rows) {
    recordWrittenVersion(row.entity as WriteEntity, row.id, bases.get(`${row.entity}\u0000${row.id}`) ?? [], row.version);
  }
  return rows;
}

export function registerIncomeTagMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.tagIncome, {
    mutationFn: (vars: TagIncomeVars) => guardSession(vars, () => runTag(vars)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: TagIncomeVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      await qc.cancelQueries({ queryKey: queryKeys.incomePayerPrompts(vars.householdId) });
      const byId = new Map(vars.items.map((i) => [i.id, i.patch as Record<string, PatchValue>] as const));
      mergeIntoMonths(qc, vars.householdId, vars.months, byId, true);
      if (vars.rule?.mode === 'insert') {
        const now = new Date().toISOString();
        const optimistic = {
          ...vars.rule.row,
          created_by: null,
          deleted_at: null,
          version: 1,
          pending: true,
          created_at: now,
        } as unknown as WithPending<IncomePayerPromptRow>;
        qc.setQueryData<PromptList>(queryKeys.incomePayerPrompts(vars.householdId), (old) => upsertRow(old ?? [], optimistic, 'end'));
      }
    },
    onSuccess: (_rows: unknown, vars: TagIncomeVars) => {
      invalidateAll(qc, vars);
    },
    onError: async (err: unknown, vars: TagIncomeVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      const attempted = {
        labelKey: vars.labelKey,
        n: vars.items.length,
        fields: [...new Set(vars.items.flatMap((i) => Object.keys(i.patch)))],
      };
      if (err instanceof VersionConflictError) {
        invalidateAll(qc, vars);
        const conflict = err.serverRow as UndoConflict;
        await recordFailedWrite({
          entity: conflict.entity,
          entityId: conflict.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted,
        });
        showToast({ kind: 'refusal', refusal: conflict });
        return;
      }
      const before = new Map(vars.items.map((i) => [i.id, i.before as Record<string, PatchValue>] as const));
      mergeIntoMonths(qc, vars.householdId, vars.months, before, false);
      invalidateAll(qc, vars);
      await recordFailedWrite({
        entity: 'transactions',
        entityId: `bulk:${vars.stepId}`,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted,
      });
    },
  });
}

/**
 * Save an income type. `earlier` is the list the sheet showed ("Also tag 3 earlier payments"); it is used only with
 * `applyToFuture`, minus the payment itself and any row that already carries a tag of its own. At most
 * MAX_TAGGED_ROWS payments are tagged in one save.
 */
export function useTagIncome(
  householdId: string,
  ownerId: string
): {
  tag(input: {
    tx: TransactionRow;
    incomeKind: string;
    countsAs: 'available' | 'kept';
    applyToFuture: boolean;
    earlier: readonly TransactionRow[];
  }): { stepId: string; tagged: number };
} {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, unknown, TagIncomeVars>({ mutationKey: mutationKeys.tagIncome, scope: WRITE_SCOPE });
  return {
    tag({ tx, incomeKind, countsAs, applyToFuture, earlier }) {
      const patch: Record<string, PatchValue> = { income_kind: incomeKind, counts_as: countsAs };
      const seen = new Set<string>([tx.id]);
      const rows: TransactionRow[] = [tx];
      if (applyToFuture) {
        for (const r of earlier) {
          if (rows.length >= MAX_TAGGED_ROWS) break;
          if (seen.has(r.id) || (r.income_kind ?? null) !== null) continue;
          seen.add(r.id);
          rows.push(r);
        }
      }
      const items: BulkPatchItem[] = rows.map((r) => ({
        entity: 'transactions',
        id: r.id,
        expectedVersion: r.version,
        before: tagBefore(r),
        patch,
      }));

      let rule: RulePlan | null = null;
      const payerKey = payerKeyOf(tx.name);
      if (applyToFuture && payerKey !== null) {
        const live = (qc.getQueryData<PromptList>(queryKeys.incomePayerPrompts(householdId)) ?? []).find(
          (p) => p.payer_key === payerKey && p.deleted_at === null
        );
        if (!live) {
          rule = {
            mode: 'insert',
            row: {
              id: Crypto.randomUUID(),
              household_id: householdId,
              payer_key: payerKey,
              income_kind: incomeKind,
              counts_as: countsAs,
              apply_to_future: true,
            },
          };
        } else if (live.income_kind !== incomeKind || live.counts_as !== countsAs) {
          rule = {
            mode: 'patch',
            id: live.id,
            version: live.version,
            before: { income_kind: live.income_kind, counts_as: live.counts_as },
            patch: { income_kind: incomeKind, counts_as: countsAs },
          };
        }
      }

      const stepId = newStepId();
      mutation.mutate({
        ownerId,
        householdId,
        stepId,
        labelKey: applyToFuture ? 'incomeTagged' : 'incomeTypeSaved',
        labelName: applyToFuture ? tx.name : null,
        labelCount: items.length,
        items,
        months: [...new Set(rows.map((r) => r.local_date.slice(0, 7)))],
        rule,
      });
      return { stepId, tagged: items.length };
    },
  };
}
