// The single entry point that registers every write-queue mutation default. Must run once,
// at module scope, before PersistQueryClientProvider restores the persisted cache (Pitfall
// 3, RESEARCH.md) -- a paused mutation resumed from disk has no function to call unless its
// key was already registered here first. Wired from src/data/QueryProvider.tsx.
//
// 01-13 appends its own custom-currency and money-preference registration calls here, next
// to the original two (see registerCustomCurrencyMutations/registerMoneyPrefsMutations below).
import type { QueryClient } from '@tanstack/react-query';
import { registerAccountMutations } from './accounts';
import { registerUndoCaptureMutations } from './undoCapture';
import { registerTransactionMutations } from './transactions';
import { registerImportFinalizeMutations } from './importFinalize';
import { registerCustomCurrencyMutations } from './customCurrencies';
import { registerMoneyPrefsMutations } from './moneyPrefs';
import { registerPatchMutations } from './patches';
import { registerUndoMutations } from './undo';

export function registerMutationDefaults(qc: QueryClient): void {
  // 02-15: undo capture must be registered before the transaction/import mutations that
  // call recordUndoStepSafely's queued fallback, so a paused-mutation replay restored from
  // disk always has a registered mutationFn to resume with (Pitfall 3, RESEARCH.md).
  registerUndoCaptureMutations(qc);
  registerTransactionMutations(qc);
  registerImportFinalizeMutations(qc);
  registerAccountMutations(qc);
  registerCustomCurrencyMutations(qc);
  registerMoneyPrefsMutations(qc);
  // 02-16: bulk actions and undo/rollback. The remaining unregistered keys (categories,
  // recurring series, transfers, saveImportProfile) land with their own plans.
  registerPatchMutations(qc);
  registerUndoMutations(qc);
}
