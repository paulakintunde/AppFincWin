---
phase: 01-money-core
partition: A
fixed_at: 2026-09-24
review_path: .planning/phases/01-money-core/01-REVIEW.md
iteration: 1
findings_in_scope: 23
fixed: 23
skipped: 0
no_change_needed: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report (Partition A)

**Fixed at:** 2026-09-24
**Source review:** .planning/phases/01-money-core/01-REVIEW.md (Partition A findings only)
**Iteration:** 1

**Summary:**
- Findings in scope: 23 (3 critical, 15 warning, 5 info)
- Fixed: 23
- Skipped: 0

Each fix was committed on its own as `fix(01): <ID> ...` and came with at least one regression test. For each critical fix, and for most of the warning fixes, the new test was run against the unfixed code first and confirmed to fail (details below).

**Verification after the last fix:**
- `npm run lint`: 0 errors. The 20 warnings are all `import/no-named-as-default-member` on `fast-check`'s `fc.*` in engine test files.
- `npm run typecheck`: clean.
- `npm run depcruise`: no violations.
- The full Jest suite and `jest src/engine --coverage` were run with a disposable, uncommitted config. The results are in the verification section at the end of this report.

## Per-finding outcomes

| ID | Outcome | Commit | Note |
|----|---------|--------|------|
| CR-A01 | fixed | 5bb6292 | `status: 0` (postgrest-js's real fetch-failure shape, `{ code: '', status: 0 }`, confirmed in `@supabase/postgrest-js/dist/index.cjs`) is now classified as a connectivity failure (`transient`). The mutation test uses that exact shape and checks that the row is kept, the write retries, then lands, and nothing is recorded as failed. The test failed before the fix. |
| CR-A02 | fixed | a8f98ef | New `src/data/sync/versionChain.ts`. Each successful version-conditional write records `base -> new version`, and later queued edits resolve their `expectedVersion` through that chain when they run. This applies to transactions, accounts and custom currencies. A test queues two edits against the same row, and both apply (`version` filters `[1, 2]`, no failed entry). That test failed before the fix. A second test checks that an edit from another device still conflicts. The chain is in-memory; the restart gap is covered by WR-A13's "already applied" check. |
| CR-A03 | fixed | 104352b | The `already-applied` class is removed. The `db/` insert functions already turn a duplicate client UUID into the existing row, so any 23505 that gets past them comes from another constraint. It is now `rejected`: rolled back and recorded. The test is the `(owner_id, code)` custom-currency clash from the review: the fetch-by-id returns null, and a failed entry is recorded with code `23505`. It failed before the fix. |
| WR-A01 | fixed | dbdaadf | New `auth` class for HTTP 401 and `PGRST301/302/303`. It retries without a limit, so the write waits instead of being rejected. Every queued write now goes through `writeClient()`, which calls `db/session.ts#assertSession`. That uses `auth.getSession()`, which also refreshes the token, and throws `SessionUnavailableError` (`auth`) when there is no session. As a result, a write is never sent under the anon key and never hits the 42501 grant failure. Tested with a missing session and with a 401 JWT-expired response. Both tests failed before the fix. |
| WR-A02 | fixed | 84e0aca | A server answer (5xx/408/429) is retried at most `MAX_SERVER_ERROR_RETRIES` = 10 times with the existing backoff (about 6.5 minutes in total). After that the optimistic change is rolled back and the write is parked as `rejected` with code `retry-exhausted` (`classifySettledWriteError` / `settledWriteErrorCode`). Connectivity failures and `auth` waits still retry without a limit. The mutation-level test drives 11 responses of 500. |
| WR-A03 | fixed | 36d36d3 | `provisionalStamp` never throws; any failure falls back to the exported `PENDING_UNRESOLVED_STAMP`. This already covers Partition B's new `customPerEur` RangeError. `useEditCustomCurrency` now normalises `unit_value` to the canonical 10-decimal form (region-aware when a locale or separators are passed) and returns `{ ok: false, errors: ['value-invalid'] }` without calling mutate. **The API changed:** `edit()` now returns a result. There are no UI callers yet. |
| WR-A04 | fixed | e463a96 | New `upsertRow` helper. The add-mutation `onSuccess` handlers (transactions, accounts, custom currencies) now upsert the row instead of only replacing it in place. Tested with a refetch that drops the optimistic row before the insert lands. |
| WR-A05 | fixed | a5e6a9c | An edit that moves `local_date` into another month moves the row between month caches. This happens optimistically, on success, and with the server row on conflict. Both months are invalidated when the row moved. A month that was never loaded is never created as a one-row list. |
| WR-A06 | fixed | 0122491 | New `editStamp` keeps the row's own `home_currency` (D-05). An amount-only edit reuses the stored `orig_per_eur`/`home_per_eur` and keeps `rate`, `rate_date` and `rate_pending` (D-04), or copies the amount for a same-currency row. Only a change of date or currency re-rates. `EditTransactionVars.homeCurrency` is now optional and ignored. It is marked `@deprecated` so existing callers still type-check. |
| WR-A07 | fixed | 1303d33 | `trackSyncActivity` ignores `manual` query success actions (from `setQueryData`). The test failed before the fix. |
| WR-A08 | fixed | c4822ca | Four changes: writers wait for any hydration in flight; hydration merges disk and memory instead of replacing; persists run one after another through a promise chain; the wipe waits for queued persists and invalidates a hydration that started before it. Two race tests (hydrate/record, and a slow older persist) both failed before the fix. |
| WR-A09 | fixed | 679040d | Option (a) from the review. New `src/data/sync/sessionEpoch.ts`: the wipe bumps an epoch, and each write's variables are tagged in `onMutate` (or on the first attempt of a restored write). `guardSession` refuses to start a retry from an old session, and turns a result that arrives late into `SessionWipedError`, which is classified `discarded` and ignored by every callback. The epoch is bumped by both the query-cache wipe and the failed-writes wipe, because the order in which handlers run is not guaranteed. Option (b) is also done: the failed-writes wipe handler reports `pendingWriteCount` = number of parked entries. The in-flight test failed before the fix. |
| WR-A10 | fixed | 7bc911b | Product decision taken as instructed: a group mark in the wrong position returns the new `ParseError` `'ambiguous-separator'` and is never reinterpreted. Groups must be exactly primary-sized next to the decimal mark, secondary-sized further left, with a leading group of 1 to secondary digits. The sizes come from `formatToParts` through the new `localeGrouping`: 3/3, or 3/2 for en-IN. Rejected examples: `'12,50'` and `'1,5'` in en-US, `'12.5'` in de-DE. The old test that treated de-DE `'12.5'` as 125 was changed to expect rejection. The fast-check round-trip across all locales still passes. There are no UI consumers of `ParseError` yet, so the UI copy for the new code still needs to be written. |
| WR-A11 | fixed | ae32f23 | `getDeviceLocale`/`useDeviceLocale` build the tag from `languageCode` (+ `languageScriptCode`) + `regionCode`, falling back to `languageTag`. New `getDeviceSeparators` and `useDeviceLocale().separators` come from `getLocales()[0].decimalSeparator`/`digitGroupingSeparator`. `parseAmount`, `parseDecimalString`, `validateCustomCurrency` and the custom-currency edit accept an optional `separators` that takes priority over the tag. **Still needs checking on the iPhone XR with language English and region Germany**, per the review's moderate confidence. **Follow-up for the UI owner:** the amount-entry screens must pass `useDeviceLocale().separators` to `parseAmount`. |
| WR-A12 | fixed | 3c6e6b4 | `fetchTransactionsForMonth` asks for `count: 'exact'` on the first page, then pages with `.range()` (1000 per page, `id` as a stable final sort key) until that count is reached. A short read throws `DbError('read-truncated')`. It also works when the server caps pages below 1000. No server-side change is needed. Optional hardening: set `max_rows` explicitly in `supabase/config.toml` so the value is documented. |
| WR-A13 | fixed | b2bbba7 | `shouldDehydrateMutation` now persists every `pending` mutation. New `resumeRestoredMutations` (used by `QueryProvider`) replays restored pending writes that were not paused, which `resumePausedMutations` skips. New `acceptIfAlreadyApplied`: when a replayed edit that already landed gets a version conflict, and the server row already holds every patched value, it counts as success rather than a false conflict. |
| WR-A14 | fixed | 0f99861 | `as_of` is now `localDateIn(new Date(), getDeviceTimeZone())`. The test uses whichever of UTC+14 or UTC-11 is on a different calendar day from UTC at the moment it runs. |
| WR-A15 | fixed | 0d30015 | The follow-up is now `void followUpIfRatePending(...)` (fire-and-forget), and `requestRateResolution` passes `timeout: RATE_RESOLUTION_TIMEOUT_MS` (15 s) to `functions.invoke`. The test uses a resolve-rate call that never answers and checks that the next queued write still runs. |
| IN-A01 | fixed | 43e128b | `provisionalStamp` takes `localDate`. A same-currency row gets `rate_date = local_date`, and the EUR leg is dated `local_date` (the server's `rate_date := p_on`), so `rate_date` is the earliest of the leg dates, as on the server. |
| IN-A02 | fixed (client side) | d4022e1 | A custom per-EUR rate or cross rate of 0 or less is treated as unresolved in the provisional stamp, so a conversion into it is never silently 0. `validateCustomCurrency` and the custom-currency edit reject `unit_value` outside `MIN_UNIT_VALUE`..`MAX_UNIT_VALUE` (0.000001..1000000, the bound WR-B07 proposes). **Not done here, owned by Partition B:** throwing `RangeError` for a result of 0 or less in `rates.ts` `crossRate`/`customPerEur`. The coordinator reports that B's `customPerEur` now throws, and WR-A03's catch handles it. **Server-side change needed** if B does not already make it: `check (unit_value between 0.000001 and 1000000)` on `custom_currencies.unit_value`. |
| IN-A03 | fixed | d4e53b1 | `lastSynced` registers a wipe handler that resets the in-memory value, notifies subscribers and removes the key. |
| IN-A04 | fixed | 26d6bb4 | `normalizeDigit` covers the Unicode Nd digit blocks that Intl renders: Bengali, Devanagari, Myanmar, Thai, Persian, fullwidth and the other Indic and SE-Asian blocks. The fast-check round-trip now includes bn-BD, my-MM, fa-IR and th-TH-u-nu-thai. |
| IN-A05 | fixed | bfcda39 | The persister tracks each query's last real server fetch, ignoring manual updates, and stores those times inside the persisted blob through custom `serialize`/`deserialize`. Dehydration uses them, falling back to `dataUpdatedAt`. The sign-out wipe clears them. |

## Notes on changes that matter to other partitions and later work

- **Partition B interplay (from the coordinator):** the server now rejects some writes with 23514 (`local_date`/`time_zone`/custom-rate bounds). That code is in `REJECTED_CODES`, so these writes are rejected permanently, never retried. `src/` does not call `per_eur_rate`, `restamp_transaction`, `is_known_currency` or `currency_exponent` through `rpc(...)`; the only RPC is `fx_latest_rates`.
- **New public surface:**
  - `ParseError` now includes `'ambiguous-separator'`.
  - The `parseAmount`, `parseDecimalString` and `CustomCurrencyInput` options take an optional `separators`.
  - New exports: `localeGrouping`, `MIN_UNIT_VALUE`/`MAX_UNIT_VALUE`, and `getDeviceSeparators`.
  - `useEditCustomCurrency().edit` now returns a result.
  - `EditTransactionVars.homeCurrency` is optional and ignored.
  - `WriteErrorClass` is now `transient | auth | conflict | rejected | not-found | discarded`.
- **Test fake:** `src/db/__tests__/fakeSupabase.ts` gained `auth.getSession` (with `session`/`sessionError`/`sessionGate`), `range()`, the `count` response field, and `invokeGate`.
- Engine purity is unchanged: `depcruise` passes, and `engine/` imports nothing from db/data/services/ui/react. All money values stay integer minor units / BigInt.
- `.npmrc` and the disposable Jest config were never committed.

## Verification

Run on the final tree (HEAD `bfcda39`):

- Full Jest suite: **54 suites, 904 tests passed**, exit 0.
- `jest src/engine --coverage`: **251 tests passed** and every threshold met. `engine/money`, `engine/split`, `engine/time` and `engine/guards` are all at 100% statements, branches, functions and lines.
- `npm run lint`: 0 errors. `npm run typecheck`: clean. `npm run depcruise`: no violations (106 modules).
- Both runs used a disposable config because of the Windows worktree "No tests found" issue. It spreads `jest.config.js` and sets `testMatch: ['**/*.test.ts?(x)']`, and was deleted before this report was committed.

---

_Fixed: 2026-09-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
