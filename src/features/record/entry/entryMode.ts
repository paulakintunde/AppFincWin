// The entry sheet's open modes, kept apart from transactionForm.ts so that a screen which only
// opens the shared sheet (entryHost.openEntry, e.g. Decide's "Add a recurring series") does not
// reach the write path, and through it the FX fetch door (depcruise fx-fetch-never-from-reads).
// Types only; transactionForm.ts re-exports them for its existing callers.
import type { PaymentType, TransactionRow } from '@/db/rows';

export type Direction = 'out' | 'in' | 'transfer';

export type EntryMode =
  | {
      kind: 'new';
      direction: Direction;
      accountId?: string | null;
      localDate?: string | null;
      /** CONTEXT D-15: a clone of an existing line, opened as a new pending line; nothing is written until Save. */
      prefill?: EntryPrefill;
    }
  | { kind: 'edit'; row: TransactionRow }
  | { kind: 'edit-transfer'; out: TransactionRow; in: TransactionRow };

export interface EntryPrefill {
  amountMinor: number;
  currency: string;
  name: string | null;
  categoryId: string | null;
  accountId: string;
  paymentType: PaymentType | null;
  isRefund: boolean;
  isAutomatic: boolean;
}
