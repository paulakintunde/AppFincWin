---
phase: 01-money-core
plan: 10
subsystem: database

tags: [supabase-js, tanstack-query, postgrest, expo-localization, jest, testing-library]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-02: accounts/transactions schema and column grants; 01-04: engine/time's monthRange; 01-09: src/db/errors.ts's DbError/VersionConflictError/NotFoundError/toDbError"
provides:
  - "src/db/rows.ts: TransactionRow/AccountRow/CurrencyRow/FxLatestRow/CustomCurrencyRow/MoneyPrefsRow types, NewTransaction/TransactionPatch/NewAccount/AccountPatch, CUSTOM_CURRENCY_COLUMNS, assertAllowedKeys guard"
  - "src/db/transactions.ts: fetchTransaction/fetchTransactionsForMonth/insertTransaction/updateTransaction/requestRateResolution, TRANSACTION_COLUMNS with rate::text casts"
  - "src/db/accounts.ts: fetchAccount/fetchAccounts/insertAccount/updateAccount, version-conditional writes"
  - "src/db/currencies.ts, src/db/fxRates.ts, src/db/household.ts: read-only access to currencies/fx_latest_rates/household_members"
  - "src/data/keys.ts: queryKeys/mutationKeys registry, WRITE_SCOPE"
  - "src/data/types.ts: WithPending<T>"
  - "src/data/queries/*: useHouseholdId/useAccounts/useTransactionsForMonth/useCurrencies/useFxLatest read hooks"
  - "src/services/locale/deviceLocale.ts: getDeviceLocale/getDeviceTimeZone/useDeviceLocale"
affects: [01-12 (mutations build on db/ + keys.ts + WRITE_SCOPE), 01-13 (custom currency CRUD reuses CUSTOM_CURRENCY_COLUMNS/assertAllowedKeys), Record phase (Phase 2, activity list consumes useTransactionsForMonth), Decide phase (Phase 4, reads through these same hooks)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "db/ functions take `client: DbClient` as their first parameter and never import the real Supabase client -- tests pass a FakeSupabase cast to DbClient instead of mocking @/services/supabase at the module level"
    - "Version-conditional update: .update(patch).eq('id', id).eq('version', expectedVersion).select(COLUMNS); zero rows back re-fetches the row to distinguish VersionConflictError (row exists at a different version) from NotFoundError (row is gone)"
    - "Duplicate-id insert (23505) is treated as success: fetch the existing row by client-generated id and return it, since the client UUID proves it's the same record (idempotent replay of a paused mutation)"
    - "Allowed-key guards (TRANSACTION_INSERT_KEYS etc.) live next to the functions that use them (not in rows.ts), mirroring the exact SQL column grants; assertAllowedKeys throws a TypeError before any network call"
    - "Read hooks are thin useQuery wrappers: db function + queryKeys entry + enabled gated on the hook's own id/month arguments being non-empty"

key-files:
  created:
    - src/db/rows.ts
    - src/db/accounts.ts
    - src/db/transactions.ts
    - src/db/currencies.ts
    - src/db/fxRates.ts
    - src/db/household.ts
    - src/db/__tests__/fakeSupabase.ts
    - src/db/__tests__/transactions.test.ts
    - src/db/__tests__/accounts.test.ts
    - src/data/keys.ts
    - src/data/types.ts
    - src/data/queries/accounts.ts
    - src/data/queries/transactions.ts
    - src/data/queries/currencies.ts
    - src/data/queries/fxLatest.ts
    - src/data/queries/household.ts
    - src/data/queries/__tests__/queries.test.tsx
    - src/services/locale/deviceLocale.ts
    - src/services/locale/__tests__/deviceLocale.test.ts
  modified: []

key-decisions:
  - "Column lists and allowed-key constants (TRANSACTION_COLUMNS, TRANSACTION_INSERT_KEYS, TRANSACTION_PATCH_KEYS, ACCOUNT_COLUMNS, ACCOUNT_INSERT_KEYS, ACCOUNT_PATCH_KEYS) were moved from rows.ts into transactions.ts/accounts.ts respectively, matching the plan's own <interfaces> contract for rows.ts (types only) and satisfying the acceptance grep (rate::text must appear literally in transactions.ts, not just be re-exported from rows.ts). Only CUSTOM_CURRENCY_COLUMNS stays in rows.ts, per the plan's explicit note that 01-13 needs it there."
  - "requestRateResolution branches on `error instanceof FunctionsFetchError` (imported from @supabase/supabase-js) rather than duck-typing error.name, matching the real class the installed supabase-js exports"
  - "fakeSupabase.ts's createFakeSupabase() returns `FakeSupabase & DbClient` via a documented cast, since the plan's <interfaces> contract pins DbClient = SupabaseClient (a large concrete class) -- this keeps every db/ function's public signature exactly as specified while still letting tests pass a lightweight fake"

patterns-established:
  - "Test-only fake Supabase client (fakeSupabase.ts) as the one canonical harness for db/ tests: chainable builder recording every call, a response queue, cast to DbClient at the one boundary (createFakeSupabase), reused unchanged by 01-13's custom-currency tests"

requirements-completed: [MON-06, SYN-01]

# Metrics
duration: ~80min (includes ~10min npm ci in a from-scratch worktree, plus a mid-implementation refactor moving column constants out of rows.ts to match the plan's own type-only interfaces contract)
completed: 2026-09-24
---

# Phase 01 Plan 10: Database Access Layer, Query Keys, Read Hooks and Device Locale Summary

**Typed `db/` access functions for accounts, transactions, currencies, FX rates and the household (client-injected, version-conditional writes, duplicate-id-safe inserts), the Phase 1 query/mutation key registry, five thin read hooks over TanStack Query, and the device locale/time-zone service -- all reading only the project's own Supabase store.**

## Performance

- **Duration:** ~80 min (includes ~10 min `npm ci` in a from-scratch worktree with no `node_modules`)
- **Tasks:** 2/2 completed
- **Files modified:** 19 created, 0 modified

## Accomplishments
- `src/db/rows.ts`: every Phase 1 row/insert/patch type from the plan's `<interfaces>` contract verbatim, plus the one shared `assertAllowedKeys` write-time guard and `CUSTOM_CURRENCY_COLUMNS` (kept here for 01-13, per the plan's own note)
- `src/db/transactions.ts`: `fetchTransaction`, `fetchTransactionsForMonth` (month-bounded via `engine/time`'s `monthRange`, never `created_at`), `insertTransaction` (exact 8-key payload, duplicate-id-safe via `23505`), `updateTransaction` (version-conditional, `VersionConflictError`/`NotFoundError`), `requestRateResolution` (calls the `resolve-rate` Edge Function, rethrows `FunctionsFetchError` as transient, swallows HTTP-layer errors to `null`); `TRANSACTION_COLUMNS` casts `rate`/`orig_per_eur`/`home_per_eur` to text (MON-01)
- `src/db/accounts.ts`: the same fetch/insert/version-conditional-update shape for accounts
- `src/db/currencies.ts`, `src/db/fxRates.ts`, `src/db/household.ts`: read-only access to the project's own `currencies` table, the `fx_latest_rates` RPC, and `household_members` -- no FX provider URL anywhere in `src/` (grep-proven, MON-06)
- `src/db/__tests__/fakeSupabase.ts`: a ~100-line chainable recorder/response-queue harness, cast to `DbClient` at one documented boundary so every `db/` test stays off the real client
- 28 new `db/` tests (Task 1) covering every behavior bullet in the plan: exact insert payload, duplicate-id recovery, permission-error propagation, version-conditional update success/conflict/not-found, the pre-network `TypeError` guard on a non-granted patch key, month-range filtering/ordering, and `requestRateResolution`'s three outcomes
- `src/data/keys.ts`/`types.ts`: the complete `queryKeys`/`mutationKeys` registry and `WRITE_SCOPE` from the plan's `<interfaces>` block verbatim, plus `WithPending<T>`
- Five read hooks (`useHouseholdId`, `useAccounts`, `useTransactionsForMonth`, `useCurrencies`, `useFxLatest`), each a thin `useQuery` over its `db/` function, `enabled`-gated on its own id/month arguments
- `src/services/locale/deviceLocale.ts`: `getDeviceLocale`/`getDeviceTimeZone`/`useDeviceLocale` via `expo-localization`, with `en-US`/`UTC` fallbacks
- 14 more tests (Task 2) across `queries.test.tsx` (mocked `@/services/supabase`, proving each hook's table/filter/RPC and its returned data) and `deviceLocale.test.ts` (fallback behavior for empty locale/calendar arrays and a null `timeZone`)
- Full verification green: `npx jest src/db src/data/queries src/services/locale` (42 tests), `npm run lint` (0 errors, only pre-existing unrelated warnings), `npm run typecheck` (clean), `npm run depcruise` (0 violations, 84 modules)

## Task Commits

Each task was committed atomically, Task 1 as a genuine TDD RED-then-GREEN pair (verified by moving the not-yet-restored implementation files aside and confirming a real "Cannot find module" failure before restoring them):

1. **Task 1: Row types and db access functions with a fake-client harness** - `c7f34e5` (test, RED) then `3789af2` (feat, GREEN)
2. **Task 2: Keys, read hooks and the device locale service** - `e6318c7` (feat)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete.

## Files Created/Modified
- `src/db/rows.ts` - shared row/insert/patch types, `CUSTOM_CURRENCY_COLUMNS`, `assertAllowedKeys`
- `src/db/transactions.ts` - transaction reads, insert, version-conditional update, `resolve-rate` invoke
- `src/db/accounts.ts` - account reads, insert, version-conditional update
- `src/db/currencies.ts` - `fetchCurrencies` (active ISO currencies, ordered by code)
- `src/db/fxRates.ts` - `fetchFxLatest` (the `fx_latest_rates` RPC)
- `src/db/household.ts` - `fetchCurrentHouseholdId`
- `src/db/__tests__/fakeSupabase.ts` - chainable fake Supabase client test harness
- `src/db/__tests__/transactions.test.ts` - 15 tests covering every Task 1 behavior bullet for transactions
- `src/db/__tests__/accounts.test.ts` - 8 tests covering the equivalent behavior for accounts
- `src/data/keys.ts` - `queryKeys`, `mutationKeys`, `WRITE_SCOPE`
- `src/data/types.ts` - `WithPending<T>`
- `src/data/queries/accounts.ts` - `useAccounts`
- `src/data/queries/transactions.ts` - `useTransactionsForMonth`
- `src/data/queries/currencies.ts` - `useCurrencies`
- `src/data/queries/fxLatest.ts` - `useFxLatest`
- `src/data/queries/household.ts` - `useHouseholdId`
- `src/data/queries/__tests__/queries.test.tsx` - 8 tests proving each hook's query/filters and returned data
- `src/services/locale/deviceLocale.ts` - `getDeviceLocale`, `getDeviceTimeZone`, `useDeviceLocale`
- `src/services/locale/__tests__/deviceLocale.test.ts` - 6 tests covering both reads and fallback behavior

## Decisions Made
- Moved `TRANSACTION_COLUMNS`/`TRANSACTION_INSERT_KEYS`/`TRANSACTION_PATCH_KEYS` and the equivalent account constants out of `rows.ts` into `transactions.ts`/`accounts.ts` respectively. The plan's own `<interfaces>` code block shows `rows.ts` containing only type declarations, and Task 1's acceptance criteria (`grep -c "rate::text" src/db/transactions.ts`) require the literal string to appear in `transactions.ts` itself, not just be re-exported from `rows.ts`. Discovered this by running the acceptance-criteria greps after the first implementation pass and finding `rate::text` returned 0 in `transactions.ts` -- fixed before committing Task 1's GREEN commit, so no separate fix commit exists.
- `requestRateResolution` checks `error instanceof FunctionsFetchError` (imported from `@supabase/supabase-js`) rather than a string-based `error.name` check, since the real class is a stable, typed export and `instanceof` is more precise than duck-typing.
- `fakeSupabase.ts`'s `createFakeSupabase()` returns `FakeSupabase & DbClient` via one documented cast (`as unknown as FakeSupabase & DbClient`), rather than narrowing every `db/` function's parameter type to a smaller structural interface. The plan's `<interfaces>` contract explicitly pins `DbClient = SupabaseClient`, so the cast lives at the one test-harness boundary instead of changing any function signature plan 01-12/01-13 depend on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Column/key constants placed in the wrong file relative to the plan's own interfaces contract**
- **Found during:** Task 1, running the acceptance-criteria greps after the first implementation pass
- **Issue:** The plan's `<action>` prose describes `TRANSACTION_COLUMNS` etc. without stating a file, so the first pass put all column lists and allowed-key arrays in `rows.ts` alongside the types. That contradicts the plan's own `<interfaces>` code block (which shows `rows.ts` containing only type declarations) and fails Task 1's own acceptance criterion `grep -c "rate::text" src/db/transactions.ts` (returned 0, since the string only existed in the imported `rows.ts`).
- **Fix:** Moved `TRANSACTION_COLUMNS`/`TRANSACTION_INSERT_KEYS`/`TRANSACTION_PATCH_KEYS` into `transactions.ts` and `ACCOUNT_COLUMNS`/`ACCOUNT_INSERT_KEYS`/`ACCOUNT_PATCH_KEYS` into `accounts.ts`, next to the functions that use them. `rows.ts` now holds only types, `assertAllowedKeys`, and `CUSTOM_CURRENCY_COLUMNS` (which the plan explicitly said belongs there for 01-13).
- **Files modified:** `src/db/rows.ts`, `src/db/transactions.ts`, `src/db/accounts.ts`
- **Verification:** All Task 1 acceptance-criteria greps pass (`rate::text` = 1, `eq('version'` = 1 in both files, `'23505'` = 1, no `@/services/supabase` import in `src/db`); `npx jest src/db` green (28/28)
- **Committed in:** `3789af2` (Task 1 GREEN commit; caught and fixed before the commit was made, no separate fix commit needed)

**2. [Rule 3 - Blocking] `FakeSupabase` was not structurally assignable to `DbClient` (`SupabaseClient`)**
- **Found during:** Task 1, first `npm run typecheck` pass after GREEN
- **Issue:** `DbClient = SupabaseClient` per the plan's `<interfaces>` contract is a large concrete class type. A plain `FakeSupabase` instance passed to `insertTransaction(client, ...)` etc. failed `tsc --noEmit` with `error TS2345: Argument of type 'FakeSupabase' is not assignable to parameter of type 'DbClient'` at every call site across both test files (20 errors).
- **Fix:** `createFakeSupabase()` now returns `FakeSupabase & DbClient` via one documented `as unknown as` cast inside `fakeSupabase.ts`, so every call site in the test files stays fully typed without a per-call cast, and no `db/` function's public signature changed.
- **Files modified:** `src/db/__tests__/fakeSupabase.ts`
- **Verification:** `npm run typecheck` clean (0 errors) after the fix
- **Committed in:** `3789af2` (Task 1 GREEN commit)

**3. [Rule 1 - Bug] Dynamic `import()` inside a test body failed under Jest's CommonJS transform**
- **Found during:** Task 2, first verification run of `deviceLocale.test.ts`
- **Issue:** `useDeviceLocale`'s two tests used `const { renderHook } = await import('@testing-library/react-native');` inside the test body, which threw `TypeError: A dynamic import callback was invoked without --experimental-vm-modules` under this project's CommonJS Jest config (not an ESM setup).
- **Fix:** Switched to a normal static `import { renderHook } from '@testing-library/react-native';` at the top of the file, matching every other test file in the codebase (e.g. `offlineRead.test.tsx`).
- **Files modified:** `src/services/locale/__tests__/deviceLocale.test.ts`
- **Verification:** `npx jest src/services/locale` -- all 6 tests pass
- **Committed in:** `e6318c7` (Task 2 commit; caught and fixed before the commit was made, no separate fix commit needed)

---

**Total deviations:** 3 auto-fixed (1 acceptance-criteria/contract-alignment fix, 1 type-only test-harness fix, 1 test-construction bug). None change any `db/`, `data/queries/` or `services/locale/` function's public behavior or signature from what the plan's `<interfaces>` block specifies.
**Impact on plan:** No scope creep. All three fixes were caught and resolved before their respective task's commit, so git history shows only clean, correct commits.

## Issues Encountered
None beyond the three items already documented above under Deviations.

## User Setup Required

None - no external service configuration required. All work is local TypeScript with a fake Supabase client in tests; nothing here calls the real Supabase project.

## Next Phase Readiness

- `src/db/transactions.ts` and `src/db/accounts.ts` are stable and named exactly per the plan's `<interfaces>` contract, so plan 01-12 (mutations, `setMutationDefaults` registrations) can import `insertTransaction`/`updateTransaction`/`insertAccount`/`updateAccount`/`requestRateResolution` directly without any further shape change.
- `src/data/keys.ts`'s `queryKeys`/`mutationKeys`/`WRITE_SCOPE` are the exact registry 01-12's mutation defaults and 01-13's custom-currency/money-prefs hooks will key against.
- `CUSTOM_CURRENCY_COLUMNS` and `assertAllowedKeys` in `src/db/rows.ts` are ready for 01-13's custom-currency CRUD to reuse without duplicating the `unit_value::text` cast rule or the write-time guard logic.
- `fetchFxLatest`/`fetchCurrencies` were coded against 01-08's documented interface (`fx_latest_rates(p_on_or_before date default null)` RPC and the `currencies` table) since 01-08 runs concurrently in this wave and had not yet landed migrations on this worktree's base at execution time. If 01-08's actual shipped shape differs from the documented interface, `src/db/fxRates.ts`/`src/db/currencies.ts` are the only two files that would need updating -- everything downstream (the two read hooks) is insulated by this file boundary.
- No blockers for downstream plans.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 19 created source/test files plus this SUMMARY.md confirmed present on disk. All 3 task commit hashes (`c7f34e5`, `3789af2`, `e6318c7`) confirmed present in `git log`.
