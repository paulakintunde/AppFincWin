// ACT-11 (CONTEXT D-19): "Mark all monthly" (and the Monthly pill on Review each) sends every
// offer to create_recurring_series_batch in ONE RPC, each series anchored to that line's latest
// logged row. The server records the single undo step in the same transaction, so nothing here
// calls insertUndoStep / recordUndoStepSafely; the step id is minted once, before mutate(), and
// is the server's replay key (a replay comes back 'already-applied', which is success).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { SeriesOffer } from '@/engine/recurring';
import {
  SERIES_BATCH_MAX,
  createRecurringSeriesBatch,
  type SeriesBatchItem,
  type SeriesBatchResult,
  type SeriesUndoLabel,
} from '@/db/recurringSeries';
import type { TransactionRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { hapticSuccess } from '@/ui/haptics';
import { writeClient } from './writeClient';
import { suggestionToSeries } from './recurringSeries';

export interface MarkMonthlyVars {
  householdId: string;
  ownerId: string;
  items: SeriesBatchItem[];
  undo: SeriesUndoLabel;
}

export function registerMarkMonthlyMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.markMonthly, {
    mutationFn: (vars: MarkMonthlyVars) =>
      guardSession(vars, async () => createRecurringSeriesBatch(await writeClient(), vars.items, vars.undo)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: MarkMonthlyVars) => {
      markSession(vars);
    },
    onSuccess: async (_result: SeriesBatchResult, vars: MarkMonthlyVars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) }),
        qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) }),
        // The server recorded the step in the same transaction; refresh the History list.
        qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) }),
      ]);
    },
    onError: async (err: unknown, vars: MarkMonthlyVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      // Ids and counts only (T-02.2-20-03): never names or amounts.
      await recordFailedWrite({
        entity: 'recurring_series',
        entityId: vars.undo.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { count: vars.items.length },
      });
      showToast({ kind: 'refusal', text: { key: 'undo.batchRefused' } });
    },
  });
}

interface MarkInput {
  offers: readonly SeriesOffer[];
  rowsById: ReadonlyMap<string, TransactionRow>;
  householdId: string;
  ownerId: string;
  timeZone: string;
}

function buildItems(input: MarkInput): SeriesBatchItem[] {
  const n = input.offers.length;
  if (n === 0 || n > SERIES_BATCH_MAX) {
    throw new RangeError(`useMarkMonthly: ${n} offers is outside 1..${SERIES_BATCH_MAX}`);
  }
  return input.offers.map((offer) => {
    const rows = offer.suggestion.rowIds.flatMap((id) => {
      const r = input.rowsById.get(id);
      return r === undefined
        ? []
        : [{ id: r.id, localDate: r.local_date, categoryId: r.category_id, accountId: r.account_id, isAutomatic: r.is_automatic }];
    });
    const anchor = input.rowsById.get(offer.latestRowId);
    if (anchor === undefined) throw new RangeError('useMarkMonthly: an offer\'s latest row is not loaded');
    const spec = suggestionToSeries(
      { ...offer.suggestion, freq: 'monthly' },
      rows,
      { householdId: input.householdId, accountId: anchor.account_id, timeZone: input.timeZone },
      Crypto.randomUUID()
    );
    return {
      series: spec.series,
      anchorTransactionId: spec.anchorTransactionId,
      linkTransactionIds: spec.linkTransactionIds,
    };
  });
}

export function useMarkMonthly(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  markAll(input: MarkInput): string;
  markOne(input: Omit<MarkInput, 'offers'> & { offer: SeriesOffer }): string;
} {
  const mutation = useMutation<SeriesBatchResult, unknown, MarkMonthlyVars>({
    mutationKey: mutationKeys.markMonthly,
    scope: WRITE_SCOPE,
  });

  const send = (input: MarkInput): string => {
    const items = buildItems(input);
    const stepId = Crypto.randomUUID();
    mutation.mutate({
      householdId: input.householdId,
      ownerId: input.ownerId,
      items,
      undo: { id: stepId, labelKey: 'markedMonthly', labelParams: { n: items.length } },
    });
    showToast({ kind: 'ordinary', text: undoLabelText('markedMonthly', { n: items.length }), stepId });
    hapticSuccess();
    return stepId;
  };

  return {
    markAll: send,
    markOne({ offer, ...rest }): string {
      return send({ ...rest, offers: [offer] });
    },
  };
}
