// REC-21 (CONTEXT D-20, D-21): "Paste lines" inserts every parsed line as pending, with an
// The insert itself is insertRowsAsOneStep in batchInsert.ts, shared with clone month.
// optional per-line category, as exactly one undo step labelled `pasted`. More than
// MAX_UNDO_OPS lines are refused before any write.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ParsedLine } from '@/engine/paste/parseLines';
import { MAX_UNDO_OPS } from '@/engine/undo';
import type { NewTransaction } from '@/db/rows';
import { mutationKeys, WRITE_SCOPE } from '@/data/keys';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { hapticSuccess } from '@/ui/haptics';
import { registerBatchInsert, type BatchInsertVars } from './batchInsert';
import { newStepId } from './undoCapture';

export type PasteLinesVars = BatchInsertVars;

export function registerPasteLinesMutations(qc: QueryClient): void {
  registerBatchInsert(qc, mutationKeys.pasteLines, 'pasted');
}

export function usePasteLines(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  add(input: {
    lines: readonly (ParsedLine & { categoryId: string | null })[];
    householdId: string;
    ownerId: string;
    accountId: string;
    currency: string;
    homeCurrency: string;
    timeZone: string;
    month: string;
  }): string;
} {
  const mutation = useMutation<unknown, unknown, PasteLinesVars>({
    mutationKey: mutationKeys.pasteLines,
    scope: WRITE_SCOPE,
  });

  return {
    add(input): string {
      const n = input.lines.length;
      if (n === 0 || n > MAX_UNDO_OPS) {
        throw new RangeError(`usePasteLines: ${n} lines is outside 1..${MAX_UNDO_OPS}`);
      }
      const rows: NewTransaction[] = input.lines.map((line) => ({
        id: Crypto.randomUUID(),
        household_id: input.householdId,
        account_id: input.accountId,
        original_amount: line.amount,
        original_currency: input.currency,
        local_date: line.localDate,
        time_zone: input.timeZone,
        note: null,
        name: line.name,
        category_id: line.categoryId,
        payment_type: null,
        status: 'pending',
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
      showToast({ kind: 'ordinary', text: undoLabelText('pasted', { n }), stepId });
      hapticSuccess();
      return stepId;
    },
  };
}
