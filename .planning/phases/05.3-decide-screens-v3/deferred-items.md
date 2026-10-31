# Deferred items (out of scope, found during execution)

## Found during 05.3-64

- `npm run depcruise` reports 1 error, not caused by 05.3-64: `fx-fetch-never-from-reads`:
  `src/features/decide/v3/ready/useReadinessAnswer.ts` -> `src/data/mutations/transactions.ts` ->
  `src/data/mutations/transactionCache.ts` -> `src/db/fxResolve.ts`. The file came in with 05.3-56 (d4aa6d60).
  The engine side is clean: nothing in `src/engine/` imports from db/, state/, services/, ui/ or react.
