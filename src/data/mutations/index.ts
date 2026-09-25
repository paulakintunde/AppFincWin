// The single entry point that registers every write-queue mutation default. Must run once,
// at module scope, before PersistQueryClientProvider restores the persisted cache (Pitfall
// 3, RESEARCH.md) -- a paused mutation resumed from disk has no function to call unless its
// key was already registered here first. Wired from src/data/QueryProvider.tsx.
//
// Plan 01-13 appends registerCustomCurrencyMutations(qc)/registerMoneyPrefsMutations(qc)
// calls here, next to these two.
import type { QueryClient } from '@tanstack/react-query';
import { registerAccountMutations } from './accounts';
import { registerTransactionMutations } from './transactions';

export function registerMutationDefaults(qc: QueryClient): void {
  registerTransactionMutations(qc);
  registerAccountMutations(qc);
}
