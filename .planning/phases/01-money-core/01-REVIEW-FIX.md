---
phase: 01-money-core
fixed_at: 2026-09-24
review_path: .planning/phases/01-money-core/01-REVIEW.md
fix_scope: all
iteration: 1
findings_in_scope: 55
fixed: 53
skipped: 2
partially_addressed: [WR-B07, IN-B01]
status: partial
---

# Phase 1 Code Review Fix Report

Fixed in three parallel partitions (A: client TS, B: schema/server, C: CI/UI/copy), merged to main.
Post-merge gate: 972 Jest tests / 56 suites (coverage thresholds met), typecheck, lint (0 errors),
depcruise, lint:migrations, verify:migrations (38 probes), check:money-mirror all green.
pgTAP: 305 tests across 21 files green on partition B's fresh local reset.

## Skipped
- WR-C08 — attribution/sync-status not mounted: wired by plan 01-15 (blocked on Phase 0 00-16/17/18).
- IN-C02 — action/image SHA pinning: SHAs not verifiable offline; not guessed.

## Partially addressed
- WR-B07 — out-of-range custom rates now rejected (TS RangeError / SQL 22003/23514); in-range sub-cent
  drift for very high-value units (1 GOLD = 60,000 USD → 59,999.90) needs a schema decision.
- IN-B01 — resolve-rate returns `{ok:false}` on internal errors; per-user throttling not added.

## Needs human verification
- CR-C03 / WR-C02 — migration floor recognition and contract-ok floor rule (see part C).
- WR-B01, WR-B05, WR-B06 — restamp window, drop-hold repair heuristic, ISO 4217 code list (see part B).
- WR-A11 — region-derived separators: confirm on device (language English, region Germany).
- Cross-partition mismatch: client rejects custom unit_value outside 1e-6..1e6 (IN-A02); server has no
  upper cap (B deliberately omitted it for VND-priced assets). Align one way or the other.

## Follow-ups
- Plan 01-16 deploy: create `FX_MONITOR_SECRET` Edge Function secret + `fx_monitor_secret` Vault row
  (distinct from FX_SYNC_SECRET). `.env.example` updated.
- UI amount entry must pass `useDeviceLocale().separators` to `parseAmount` and add copy for
  `'ambiguous-separator'`; `useEditCustomCurrency().edit` now returns `{ok}|{ok:false,errors}`.

---

# Partition A

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

---

# Partition B

# Phase 1 Partition B: Code Review Fix Report

**Fixed at:** 2026-09-24
**Source review:** .planning/phases/01-money-core/01-REVIEW.md (Partition B only: CR-B*, WR-B*, IN-B*)
**Iteration:** 1

**Summary:**
- Findings in scope: 16 (3 critical, 9 warning, 4 info)
- Fixed: 16. Two are only partly addressed (WR-B07, IN-B01); see their notes.
- Skipped: 0
- Every fix has a regression test that failed before the fix: 11 new pgTAP files (`11_`–`21_`) and new Jest cases in the Edge Function and engine tests. WR-B09 is the exception, because it only adds test coverage.
- Phase 1 migrations were edited in place (not yet pushed). None of the edits adds a `drop`, `rename` or `alter type` statement.

## Findings

| ID | Outcome | Commit | Note |
|----|---------|--------|------|
| CR-B01 | fixed | 983c6fc | resolve-rate backfill filtering: keeps only requested quotes dated on or before `local_date`, and skips any `(quote, date)` with a held or dropped hold. The remaining rows go through fx-sync's own `classifyRates` against the nearest stored prior, with no age window. Implausible rows go to `fx_rate_holds` with a `held` alert (`via: resolve-rate`). A backfill can never confirm a hold. |
| CR-B02 | fixed | 88134a7 | Resolved holds are now terminal, enforced four ways. (1) A guard trigger on `fx_rate_holds` discards any update other than the operator's drop. (2) The fx-sync hold upsert uses `ignoreDuplicates`. (3) `classifyRates` skips rows whose `(quote, date, source)` is already held or dropped, and never confirms a dropped hold. (4) `fx_auto_accept_holds` requires `resolved_at is null`. The FX runbook is updated. |
| CR-B03 | fixed | 114ac93 | EXECUTE on `is_known_currency`, `currency_exponent` and `per_eur_rate` revoked from public/anon/authenticated; service_role keeps it. No `src/` code calls these via rpc; the triggers call them as definer. pgTAP proves user B cannot read A's custom currency and that A's own triggers still work. |
| WR-B01 | fixed: requires human verification | 705f334 | `restamp_transaction(p_id, p_relax_quotes text[])`: only the quotes whose backfill actually reached `fx_rates` may use a rate older than 7 days. A row dated more than one day past the server date is never exact. `local_date` must fall between 1900-01-01 and `current_date + 366`, else 23514. New `fx_restamp_pending()` runs daily from fx-monitor, so future-dated rows resolve once their day arrives. **Product choices made conservatively:** the one-day slack covers UTC+14 zones; the 1900 lower bound (the review suggested 1999-01-04) avoids rejecting historical same-currency entries. |
| WR-B02 | fixed | a9b37d0 | A custom leg whose reference rate came from open.er-api is now attributed `open-er-api`, which outranks `custom` in the existing precedence. |
| WR-B03 | fixed | 9d2cb51 | Same-run witness confirmation now matches the hold created in this run on `(quote, date, source)` and upserts under the hold's own source. `classifyRates` checks every open hold for the quote. |
| WR-B04 | fixed | 3bde3bb | fx-sync history is now every stored row from the batch's earliest date plus each quote's latest stored rate before it (`fx_latest_rates`, no age window). "No prior" now only means the quote was never stored. resolve-rate got the same no-window prior lookup in CR-B01. |
| WR-B05 | fixed: requires human verification | 8785e65 | `fx_drop_hold` removes the matching `fx_rates` row for any non-dropped status, then calls the new service-role `fx_restamp_by_rate(quote, date)`. That re-stamps rows that could have used the rate, whether pending or not: rows with the quote on either leg (directly or as a custom reference) that are pending, carry that `rate_date`, or are dated within the 7 days the rate served. `version` is not bumped. It adds a new `hold-dropped` alert kind carrying the count, and now returns an integer. **Please verify the row-selection heuristic.** A row made exact by a relaxed backfill on another leg can drop back to pending. |
| WR-B06 | fixed: requires human verification | 640af12 | New static ISO 4217 list, `is_iso4217_code`: active codes plus common withdrawn ones. It is used, together with `fx_rates`, in the custom-code shadow check. New `check (reference_currency <> code)`. `per_eur_rate` now resolves a custom currency's reference with no owner, so it cannot recurse (the pre-fix run reproduced "stack depth limit exceeded"). Custom decimals still take precedence over ISO decimals for an existing custom code, because switching would reinterpret stored minor units. **Please review the static code list.** |
| WR-B07 | fixed (partial) | fa6d8e7 | TS `customPerEur` and SQL `custom_per_eur` now fail identically on a zero result or a numeric(24,10) overflow: RangeError in TS, 22003 in SQL. A new `guard_custom_currency_rate` trigger rejects a custom currency declared or revalued out of range against its reference's latest rate (23514). Two fixture parity cases were added and the mirror regenerated; engine/money coverage is still 100%. **Not fixed: precision loss inside the representable range** (1 GOLD = 60,000 USD still converts to 59,999.90). Fixing it exactly needs the custom leg's unit value and reference rate stored on the transaction, plus a new mirror function the generator script cannot express without editing it. That is a schema decision, so it is left open. No fixed `unit_value` bound was added either: the review's 1e6 cap would reject legitimate units such as a VND-referenced asset. |
| WR-B08 | fixed | 37a9f85 | Server-only `orig_exp`/`home_exp` columns on `transactions`, stamped at insert and reused on edits; only an `original_currency` change re-derives `orig_exp`. Clients cannot write them (column grants). Not done: making custom currencies readable by household members. That depends on Phase 8 household work, and until then the stamped exponents let the client format amounts. |
| WR-B09 | fixed | fac9e8d | Fixture now asserts all 26 ISO exponent exceptions plus 8 default-2 codes. New conversion cases: 4-decimal both ways, negative 3→0 and 0→3, custom 3-decimal both ways, `MAX_ABS_AMOUNT_MINOR`, and ±`MAX_SAFE_INTEGER`. The overflow boundary is asserted with the same inputs on both sides: a Jest RangeError and pgTAP `19_money_bounds` (23514). The generator script is unchanged. This finding is coverage-only, so there is no failing-before test beyond the new cases themselves. |
| IN-B01 | fixed (partial) | 5eccc4d | Any throw after input validation now returns `500 {ok:false,error:'internal'}` with no message echoed. **Per-user throttling was not added:** it needs a rate-limit store, an infrastructure decision. |
| IN-B02 | fixed | eb568a9 | `runFxSync` catches failures after the fetch, writes a best-effort `sync-failed` alert (`stage: 'ingest'`), and rethrows the original error. |
| IN-B03 | fixed | 7d1db01 | fx-monitor has its own `FX_MONITOR_SECRET` / `x-fx-monitor-secret`, checked by a new testable `auth.ts`. The cron job sends the new `fx_monitor_secret` Vault row. fx-monitor emails a daily "all clear" heartbeat when no alerts are pending, so no email at all means fx-monitor failed. |
| IN-B04 | fixed | b2c7b20 | A guard trigger checks `time_zone` against `pg_timezone_names` on insert and on zone change; null is left to NOT NULL. Stale alerts are deduplicated on `(quote, rateDate)`, looking back 90 days. |

## Follow-ups outside Partition B ownership

- **`.env.example`** (not mine to edit): add `FX_MONITOR_SECRET=`. Also change the `FX_SYNC_SECRET` comment, which still says fx-sync and fx-monitor share it.
- **Plan 01-16 deploy steps:** create Edge Function secret `FX_MONITOR_SECRET` and Vault row `fx_monitor_secret`, with a value different from `FX_SYNC_SECRET`. `docs/ops/fx-operations.md` is already updated.
- **Partition A (client), behaviours the server now enforces:**
  - `local_date` must fall between 1900-01-01 and one year ahead, else 23514.
  - `time_zone` must be an IANA zone, else 23514.
  - A custom currency whose per-EUR rate would round to zero or overflow is rejected (23514).
  - `customPerEur` now throws a RangeError in those same cases; `provisional.ts` should catch it (see IN-A02 and WR-A03).
  - Transactions now carry `orig_exp`/`home_exp`.
- **WR-B07 exact custom conversion:** needs a schema decision (store the unit value and reference rate per leg) and a generator extension.

## Verification

- pgTAP, full suite on a freshly reset local stack: 21 files, 305 tests, PASS.
- Jest `supabase/functions` + `src/engine`: 20 suites, 340 tests, PASS. engine/money coverage 100/100/100/100.
- Jest `src/data` + `src/db`: 144 tests, PASS. Nothing regressed from the `customPerEur` change.
- `npm run check:money-mirror`: up to date. `npm run lint`: 0 errors. `npm run typecheck`: pass.
- `npm run lint:migrations` and `npm run verify:migrations`: OK.
- `deno check` on all three Edge Function entry points: pass.

---

_Fixed: 2026-09-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

---

# Partition C

# Phase 1: Code Review Fix Report (Partition C)

**Fixed at:** 2026-09-24
**Source review:** .planning/phases/01-money-core/01-REVIEW.md (Partition C)
**Iteration:** 1

**Summary:**
- Findings in scope: 16 (4 critical, 8 warning, 4 info)
- Fixed: 14
- Skipped: 2 (WR-C08 by instruction, IN-C02 because the SHAs can't be checked offline)

## Per-finding outcome

| ID | Outcome | Commit | Note |
|---|---|---|---|
| CR-C01 | fixed | b8d1e1f | A new SQL lexer finds real comments. Any `squawk-ignore-file` that names an enforced rule, or names no rule (squawk treats that as every rule), is rejected outright. Probes P7-P9. |
| CR-C02 | fixed | 4d7211e | Rule lists drop trailing `-- ...` text, split on commas and whitespace, and are lower-cased. Unknown tokens count as enforced. Covers `--squawk-ignore` and `/* squawk-ignore */`. Probes P10-P15. Squawk's real parsing was checked by probing squawk 2.66.0 directly. |
| CR-C03 | fixed: requires human verification | c2b0fb3 | Floor bumps are matched only as whole top-level statements with comments stripped. Two forms count: the exact `update ... set value = 'X' where key = 'min_supported_version'`, and `insert (key, value) values (...)`, optionally with `on conflict (key) do update set value = excluded.value`. These do not count: bumps in comments, `on conflict do nothing`, bumps inside DO blocks, and bumps with extra predicates. Any of those prints a warning. Probes P16-P21. |
| CR-C04 | fixed | 323c8c6 | squawk's native binary is resolved through `squawk-cli/js/index.js` `getBinaryPath()` and spawned with an argv array and `shell: false`. The `npx --yes` fallback is gone. A missing squawk-cli fails closed. Filenames must match `^\d{14}_[a-z0-9_]+\.sql$`. Every probe now runs from a temp path that contains a space. Probes P22-P24. |
| WR-C01 | fixed | a5991d1 | Adds P25 (same-file bump and drop must fail). The bypass probes, missing-squawk probe (P24) and npx removal landed with CR-C01..C04. |
| WR-C02 | fixed: requires human verification | 0ab49db | Markers are paired per statement: every destructive statement needs its own marker among the comments directly above it. Rule: `floorBeforeLastRaise < X <= floor`. The finding's literal wording ("strictly greater than the floor before its file") contradicts `X <= floor`, so this reads it as: X must cite a floor that an earlier migration actually raised to. A marker at the seed floor or at a stale older floor fails. Malformed markers are errors. Documented in docs/ops/migration-compatibility.md. Probes P26-P29. |
| WR-C03 | fixed | 0fb9aca | The script flags contract breaks: drop function/procedure/routine/aggregate, drop (materialized) view, drop type/domain, drop schema, `alter ... rename`, and `alter type ... drop/alter attribute`. It checks each whole statement, including DO bodies and strings. Each match needs its own contract-ok marker. Docs and the PR checklist now cover RPC signatures, return shapes and view columns. Probes P30-P36. |
| WR-C04 | fixed | 2e901d1 | The hard-coded `KEPT_COMPAT_RULES` list is gone. The script reads `excluded_rules` from `.squawk.toml` (strict parse, fails closed), and any other rule name counts as enforced. `squawk-cli` is pinned to exactly `2.66.0` in package.json and package-lock.json. Probes P37-P38. |
| WR-C05 | fixed | f4cd0f4 | `supabase/setup-cli` now uses `version: 2.117.0`, matching package.json. `verify:migrations` fails if the two drift. |
| WR-C06 | fixed | d28180e | `Linking.openURL(...).catch(() => undefined)`. A test covers a rejected openURL; it failed before the fix with an unhandled rejection. |
| WR-C07 | fixed | df57b10 | `hitSlop` is derived from `space.touchMin` and `fontSize.meta` (vertical target at least 44pt), with `space.gapSm` horizontally. The row View's `accessibilityLabel` is removed, so TalkBack reads the attribution once. Two tests. |
| WR-C08 | skipped | — | Wired by plan 01-15 (blocked on Phase 0 00-16/17/18). No components were mounted. |
| IN-C01 | fixed | 92a2538 | New `src/i18n/mandatedCopy.ts` feeds both en keys and RateAttribution's URL. `src/i18n/__tests__/mandatedCopy.test.ts` asserts it equals `supabase/functions/fx-sync/openErApi.ts`. That file was imported, not edited. |
| IN-C02 | skipped | — | The repo has no lockfile or metadata recording action commit SHAs or the gitleaks image digest, so they can't be checked offline, and a guessed SHA would break or mis-pin CI. Pin them online (for example `gh api repos/actions/checkout/commits/v4`, `docker buildx imagetools inspect ghcr.io/gitleaks/gitleaks:v8.30.1`) and add a Dependabot `github-actions` entry. |
| IN-C03 | fixed | 2bcfc66 | `pending = ratePending \|\| !rateDate \|\| !rateSource`. It shows 'Rate pending' and never 'Rate of ' with no date or link. Two tests. |
| IN-C04 | fixed | 40d297b | Fake-timer test: the label goes from 'just now' to '1 minute ago' to '2 minutes ago', and the component's own 30s interval id is cleared on unmount. Checked by mutation: with the cleanup removed, the test fails. |

## Verification

- `npm run lint`: 0 errors. The 20 warnings were already there, in src/engine tests and src/i18n/index.ts.
- `npm run typecheck`: clean.
- `npm run lint:migrations`: `MIGRATION COMPAT OK (11 files, floor 0.1.0)`.
- `npm run verify:migrations`: `MIGRATION GATE OK` (38 probes plus the CLI-version check).
- `npm run check:money-mirror`: up to date.
- `npx jest src/ui src/i18n` (disposable config, deleted afterwards): 5 suites, 296 tests passed.

## Notes for the orchestrator

- **Parallel migration fixers:** the gate now flags `drop function`, `drop view` and `drop type`. If a Partition B fix drops an old function signature (for example to change the CR-B03 lookup arguments), the gate will require a `contract-ok` marker that cites a floor raised in an earlier migration. The simplest route is `create or replace` with the same signature, or leaving the old overload in place. This is intended expand/contract behaviour, not a regression.
- The gate still can't see a `create or replace function` that changes a return shape, or a dynamic `execute` that drops a column or table. Both are documented under "Not caught by the linter", and the PR checklist asks about them.
- `docs/ops/fx-operations.md` still calls `openErApi.ts` "the canonical strings". That is still true, and the new test enforces it. The file is outside this fixer's ownership, so it was not edited.

---

_Fixed: 2026-09-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
