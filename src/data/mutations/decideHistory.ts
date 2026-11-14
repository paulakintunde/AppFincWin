// 06.1-12 (CO-D-64 (6)): one history row per decided check, "What Decide said on {date}". Written once through the queue; the row
// carries the JSON-safe Result only (no Evaluation, no bigint). A second row for the same check, day, code and variant is skipped.
// Failed-write records carry the check id and kind only, never the Result.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { insertCheckHistory, type DecideCheckHistoryRow } from '@/db/decideCheckHistory';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface RecordHistoryVars {
  ownerId: string;
  id: string;
  checkId: string;
  saidOn: string;
  code: string;
  variant: string | null;
  result: Record<string, unknown>;
}

/** The device's local calendar day, yyyy-mm-dd. */
function localToday(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A bigint-free copy: anything that is not plain JSON (bigint, undefined, functions) is refused up front. */
function jsonSafe(result: unknown): Record<string, unknown> {
  const text = JSON.stringify(result, (_k, v) => {
    if (typeof v === 'bigint') throw new TypeError('check history: the result holds a bigint');
    return v;
  });
  return JSON.parse(text) as Record<string, unknown>;
}

export function registerDecideHistoryMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.decideHistory, {
    mutationFn: (vars: RecordHistoryVars) =>
      guardSession(vars, async () =>
        insertCheckHistory(await writeClient(), {
          id: vars.id,
          check_id: vars.checkId,
          said_on: vars.saidOn,
          code: vars.code,
          variant: vars.variant,
          result: vars.result,
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: RecordHistoryVars) => {
      markSession(vars);
    },
    onSuccess: (_row: DecideCheckHistoryRow, vars: RecordHistoryVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.decideCheckHistory(vars.ownerId, vars.checkId) });
    },
    onError: async (err: unknown, vars: RecordHistoryVars) => {
      const cls = classifySettledWriteError(err);
      // A replay of the same row id (a unique violation) is the first write having landed: not a failure.
      if (cls !== 'rejected' && cls !== 'not-found') return;
      await recordFailedWrite({
        entity: 'decide_check_history',
        entityId: vars.checkId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { fields: ['code', 'variant', 'result'] },
      });
    },
  });
}

/** Records what Decide said for a check. Returns false when the same day, code and variant is already recorded (nothing written). */
export function useRecordCheckHistory(ownerId: string): {
  mutate(a: { checkId: string; result: { code: string; variant?: string | null }; now?: Date }): boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, unknown, RecordHistoryVars>({ mutationKey: mutationKeys.decideHistory, scope: WRITE_SCOPE });
  return {
    mutate(a) {
      const saidOn = localToday(a.now ?? new Date());
      const code = a.result.code;
      const variant = a.result.variant ?? null;
      const known = qc.getQueryData<DecideCheckHistoryRow[]>(queryKeys.decideCheckHistory(ownerId, a.checkId));
      if (known?.some((r) => r.said_on === saidOn && r.code === code && r.variant === variant)) return false;
      mutation.mutate({
        ownerId,
        id: Crypto.randomUUID(),
        checkId: a.checkId,
        saidOn,
        code,
        variant,
        result: jsonSafe(a.result),
      });
      return true;
    },
  };
}
