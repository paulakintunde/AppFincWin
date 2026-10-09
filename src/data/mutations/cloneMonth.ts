// REC-19 (CONTEXT D-13, D-14): "Clone last month" inserts the chosen candidates as pending
// The insert itself is insertRowsAsOneStep in batchInsert.ts, shared with paste lines.
// rows on their clamped day and records exactly one undo step labelled `cloned`.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { CloneCandidate } from '@/engine/recurring';
import { MAX_UNDO_OPS } from '@/engine/undo';
import type { NewTransaction, PaymentType } from '@/db/rows';
import { mutationKeys, WRITE_SCOPE } from '@/data/keys';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { hapticSuccess } from '@/ui/haptics';
import { registerBatchInsert, type BatchInsertVars } from './batchInsert';
import { newStepId } from './undoCapture';

export type CloneMonthVars = BatchInsertVars;

export function registerCloneMonthMutations(qc: QueryClient): void {
  registerBatchInsert(qc, mutationKeys.cloneMonth, 'cloned');
}

export function useCloneMonth(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  clone(input: {
    candidates: readonly CloneCandidate[];
    householdId: string;
    ownerId: string;
    homeCurrency: string;
    timeZone: string;
    month: string;
  }): string;
} {
  const mutation = useMutation<unknown, unknown, CloneMonthVars>({
    mutationKey: mutationKeys.cloneMonth,
    scope: WRITE_SCOPE,
  });

  return {
    clone(input): string {
      const n = input.candidates.length;
      if (n === 0 || n > MAX_UNDO_OPS) {
        throw new RangeError(`useCloneMonth: ${n} candidates is outside 1..${MAX_UNDO_OPS}`);
      }
      const rows: NewTransaction[] = input.candidates.map((c) => ({
        id: Crypto.randomUUID(),
        household_id: input.householdId,
        account_id: c.accountId,
        original_amount: c.amount,
        original_currency: c.currency,
        local_date: c.localDate,
        time_zone: input.timeZone,
        note: null,
        name: c.name,
        category_id: c.categoryId,
        payment_type: c.paymentType as PaymentType | null,
        status: 'pending',
        is_refund: c.isRefund,
      }));
      const stepId = newStepId();
      mutation.mutate({
        householdId: input.householdId,
        ownerId: input.ownerId,
        homeCurrency: input.homeCurrency,
        timeZone: input.timeZone,
        month: input.month,
        rows,
        stepId,
      });
      showToast({ kind: 'ordinary', text: undoLabelText('cloned', { n }), stepId });
      hapticSuccess();
      return stepId;
    },
  };
}
