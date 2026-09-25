---
phase: 01-money-core
reviewed: 2026-09-24
depth: standard
status: issues_found
scope: plans 01-01..01-14 (01-15, 01-16 not yet executed — blocked on Phase 0)
files_reviewed: 97
partitions:
  A: client TypeScript (engine, db, data layer)
  B: schema and server-side (migrations, Edge Functions)
  C: CI tooling, UI, copy, config, docs
findings:
  critical: 10
  warning: 32
  info: 13
  total: 55
---

# Phase 1 Code Review — Money Core

Reviewed in three parallel partitions. Finding IDs carry the partition letter (CR-A01, WR-B03, …).

## Critical summary

| ID | Area | Issue |
|----|------|-------|
| CR-A01 | write queue | Network failures (postgrest `status: 0`) classified `rejected` — offline writes rolled back instead of retried |
| CR-A02 | write queue | Two queued edits to the same row self-conflict (optimistic update never bumps `version`) |
| CR-A03 | write queue | Any 23505 treated as already-applied — non-id unique violations silently swallowed, row stuck pending |
| CR-B01 | resolve-rate | Writes Frankfurter rows straight into served `fx_rates`, bypassing plausibility quarantine |
| CR-B02 | fx-sync | Dropped holds resurrected by upsert and auto-accepted, undoing operator drops |
| CR-B03 | SQL | SECURITY DEFINER currency helpers accept any owner UUID — cross-user custom-currency disclosure |
| CR-C01 | migration gate | `squawk-ignore-file` form bypasses the contract-ok floor check |
| CR-C02 | migration gate | Trailing text / space-separated / uppercase rule names bypass the check |
| CR-C03 | migration gate | Floor bump read from comments / no-op statements authorises destructive DDL |
| CR-C04 | migration gate | `shell: true` + unquoted paths: filename command injection and silent lint skip |


---

# Partition A

# Phase 1: Code Review Report (Partition A: client money engine, DB access, data layer)

**Reviewed:** 2026-09-24
**Depth:** standard, plus targeted checks against `node_modules` (postgrest-js 2.116.0 and query-core) and `supabase/migrations/20260924000500_fx_stamping.sql`
**Files Reviewed:** 49 source files. Tests were checked for false confidence.
**Status:** issues_found

## Summary

The pure engine is in good shape. Everything is integer and BigInt with no float parsing. `divideHalfUp` matches `div_half_up` in SQL, including negative ties. The ISO exponent table matches ISO 4217 and the SQL `currency_exponent`. `allocate` preserves the sum and handles negative totals symmetrically. `monthRange` and `localDateIn` are correct across DST changes. The write-key allowlists in `db/` exactly match the column grants in the migrations.

The problems are in the offline write queue:

1. **Network failures are treated as permanent rejections.** postgrest-js reports a network failure as `status: 0`. The classifier only treats `status === null` as transient, so any write that hits a network drop is classified `rejected`. Its optimistic row is rolled back and it is parked as failed.
2. **Two queued edits to the same row always conflict with each other.** The optimistic row's `version` is never advanced, so the second edit carries a stale `expectedVersion`.
3. **Some real unique violations are silently swallowed.** A 23505 from a constraint other than the primary key is misclassified as `already-applied`. The write is dropped with no failed-write entry.

Further warnings cover optimistic-row lifecycle, parse ambiguity (possible 10x or 100x mis-entry), sync-status accuracy, and wipe races.

## Critical Issues

### CR-A01: Real network failures are classified as permanent `rejected` and the write is discarded

**File:** `src/data/sync/writeErrors.ts:23-26, 38-44` (source of the error value: `src/db/errors.ts:61-63`)
**Issue:** When `fetch` rejects (radio drop mid-request, DNS failure, timeout or abort while NetInfo still reports online), postgrest-js 2.116.0 catches it and returns `{ error: { message: 'TypeError: Network request failed', code: '' }, status: 0 }` (verified in `node_modules/@supabase/postgrest-js/dist/index.cjs:418-457`). Every `db/*` function passes that `status` to `toDbError(error, status)`, which produces `DbError(code: '', status: 0)`. `classifyWriteError` then runs these checks:
- `REJECTED_CODES.has('')` is false.
- `isTransientStatus(0)` is false, because it only checks `>= 500`, 408 and 429.
- `err.code === '' && err.status === null` is false, because status is `0`, not `null`.
- So it falls through to `return 'rejected'`.

The `onError` handlers in `mutations/transactions.ts:136-147`, `accounts.ts:76-87` and `customCurrencies.ts:87-98` then remove the optimistic row, record a failed write, and stop retrying. Failure scenario: a user logs a transaction on a flaky connection and it vanishes from the list into the "couldn't save" pile. This is exactly the case the offline queue exists to handle. The same happens for the follow-up `fetchX` inside the 23505 path. `writeErrors.test.ts:38-40` gives false confidence: it asserts transience for `status: null`, a shape that supabase-js never produces for network errors. No mutation test simulates a real network failure.
**Fix:**
```ts
function isTransientStatus(status: number | null): boolean {
  if (status === null || status === 0) return true; // 0 = postgrest-js fetch failure
  return status >= 500 || status === 408 || status === 429;
}
// and in classifyWriteError, before the REJECTED check:
if (err.status === 0 || (err.code === '' && err.status === null)) return 'transient';
```
Add a mutation-level test that feeds the fake client `{ data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 }` and asserts that the mutation retries or pauses rather than landing in the failed list.

### CR-A02: Two queued edits to the same row always cause a false "changed elsewhere" conflict

**File:** `src/data/mutations/transactions.ts:156-185` (same pattern in `src/data/mutations/accounts.ts:95-101` and `src/data/mutations/customCurrencies.ts:107-113`)
**Issue:** `onMutate` applies `{ ...r, ...vars.patch, pending: true }` but leaves `version` unchanged. The caller has to supply `expectedVersion`, and the only source it has is the cached row. Scenario, offline or just two quick taps while online:
1. Edit #1 is queued with `expectedVersion: 1`.
2. The cached row still says `version: 1`, so edit #2 is also queued with `expectedVersion: 1`.
3. On replay, edit #1 succeeds and the server bumps the row to version 2.
4. Edit #2's `.eq('version', 1)` matches zero rows, so `VersionConflictError` is raised. The cache is overwritten with the server row and the user's second edit is parked as "changed elsewhere", although nothing else changed it.

This breaks D-18's meaning: conflicts are for edits from other devices. It also makes the in-order replay promise of D-20 useless for any row edited twice while offline. `offlineWrite.test.tsx:135-180` only covers add followed by a single edit, so it does not catch this.
**Fix:** Chain versions for queued writes. Either:
- (a) in `onMutate`, bump the optimistic row's `version` by 1 and carry a client-side `baseVersion` marker so the caller reads `expectedVersion = cached.version`; or
- (b) have `mutationFn` resolve `expectedVersion` at execution time from the result of the previous successful write to the same id, for example a small `Map<id, lastServerVersion>` that `onSuccess` updates.

Add a test with two queued edits to the same id.

### CR-A03: A unique violation from any constraint other than the primary key is swallowed as `already-applied`, silently dropping the write

**File:** `src/db/customCurrencies.ts:85-90`, `src/db/transactions.ts:96-101`, `src/db/accounts.ts:64-69`; `src/data/sync/writeErrors.ts:39`; `src/data/mutations/customCurrencies.ts:89`
**Issue:** `custom_currencies` has `unique (owner_id, code)` (`20260924000100_custom_currencies.sql:27`). Scenario: the user adds custom currency `GLD` on device A. Device B, offline with a cache that predates it, also adds `GLD`. Local validation passes because `existingCustomCodes` comes from device B's stale cache. On flush, the insert fails with 23505 on `(owner_id, code)`. `fetchCustomCurrency(client, newId)` returns `null`, so the function throws `DbError('23505')`. `classifyWriteError` maps any 23505 to `already-applied`. `onError` returns early because the class is not `rejected` or `not-found`, and `shouldRetryWrite` returns false. As a result:
- the mutation ends in `error`;
- no failed-write entry is recorded;
- nothing is reported;
- the optimistic row keeps `pending: true` until some later refetch silently removes it.

This violates D-19 ("A user never silently loses an entry"). The same path applies to any future unique constraint on `transactions` or `accounts`.
**Fix:** Handle 23505 as "already applied" only when the re-fetch by id actually finds the row, which the `db/` functions already do. When the fallback fetch returns `null`, throw a distinct error that classifies as `rejected`:
```ts
if (error.code === UNIQUE_VIOLATION) {
  const existing = await fetchCustomCurrency(client, currency.id);
  if (existing) return existing;
  throw new DbError(error.message, '23505-other', status); // not our id: permanent
}
```
Then either drop the blanket `'23505' -> 'already-applied'` rule in `classifyWriteError` or narrow it to that case.

## Warnings

### WR-A01: An expired or missing session after reconnect permanently rejects the whole queue

**File:** `src/data/sync/writeErrors.ts:21, 38-44`
**Issue:** After a long offline period the access token has usually expired. When the queue resumes on reconnect, either:
- PostgREST answers `401` (`PGRST301`/`PGRST303`, JWT expired), or
- if supabase-js's refresh attempt fails transiently, the request goes out with the anon key and hits the `revoke ... from anon` column grants, giving `42501`.

Both classify as `rejected`, because 401 is not transient and 42501 is in `REJECTED_CODES`. Every queued write is then rolled back into the failed list, although none was invalid.
**Fix:** Classify `status === 401` and the JWT codes (`PGRST301`, `PGRST302`, `PGRST303`) as `transient`, or as a new `auth` class that pauses the queue until a session is available. Before resuming, check that `supabase.auth.getSession()` returns a session.

### WR-A02: A deterministic 5xx retries forever and blocks every later write in the single scope

**File:** `src/data/sync/writeErrors.ts:23-26, 58-60`; `src/data/keys.ts:29`
**Issue:** `shouldRetryWrite` is unbounded for `transient`, and every mutation shares one scope (`WRITE_SCOPE`). A write that always gets a 5xx (for example a trigger error that surfaces as HTTP 500, or a PostgREST bug on a particular payload) retries every 60 seconds forever. No later write in the queue ever runs. This contradicts the module's own "never loop forever" comment.
**Fix:** Bound retries for 5xx responses, for example to 10 attempts, and then classify as `rejected` with code `retry-exhausted` so the write is parked with a visible reason. Keep unbounded retry only for true connectivity failures (status 0), which pause while offline anyway.

### WR-A03: A throw in provisional stamping aborts the real write

**File:** `src/data/mutations/provisional.ts:81, 89, 125`; `src/data/mutations/transactions.ts:92-102, 171-182`; `src/data/mutations/customCurrencies.ts:187-199`
**Issue:** `provisionalStamp` runs inside `onMutate`. In query-core, `onMutate` runs before `retryer.start()`, and a throw there goes straight to the `catch`/`onError` path (`mutation.js:170-196`). It can throw in several ways:
- `parseRate` throws on any malformed `unit_value` or `rate`. `useEditCustomCurrency` writes an unvalidated `patch.unit_value` straight into the cache optimistically.
- `customPerEur` can round to `0n`, and `convertMinor` then throws "denominator must be positive".
- `convertMinor` throws beyond `MAX_SAFE_INTEGER`.

When any of these happens, the `RangeError` is classified `rejected` and the transaction insert is never sent. That turns a failure in a display-only estimate into a lost write.
**Fix:** Wrap the call so provisional failures degrade to the unresolved stamp:
```ts
let stamp: ProvisionalStamp;
try { stamp = provisionalStamp(...); } catch { stamp = PENDING_UNRESOLVED_STAMP; }
```
Export `PENDING_UNRESOLVED_STAMP`, or do the try/catch inside `provisionalStamp`. Also run `useEditCustomCurrency` patches through the same `parseDecimalString`/`parseRate`/`formatRate` normalization as add.

### WR-A04: A queued add whose optimistic row is dropped by a refetch never reappears after success

**File:** `src/data/mutations/transactions.ts:129-132`, `src/data/mutations/accounts.ts:73-75`, `src/data/mutations/customCurrencies.ts:84-86`
**Issue:** On reconnect, TanStack refetches stale queries through reconnect, mount or focus triggers, at the same time as `resumePausedMutations`. `QueryProvider`'s `onSuccess` ordering only covers its own `invalidateQueries`. If the month refetch completes before the queued insert lands, the server list replaces the cache and the optimistic row disappears. The insert's `onSuccess` then does `rows.map(r => r.id === row.id ? row : r)`, which only replaces an existing entry and never re-inserts. The saved transaction is missing from the month list and its totals until another refetch, which with `staleTime` of 60s may be much later.
**Fix:** Upsert in `onSuccess`, for example `rows.some(r => r.id === row.id) ? rows.map(...) : [row, ...rows]`, and/or `invalidateQueries` for the affected key in `onSettled`. Consider cancelling or suppressing refetches of keys that have pending mutations.

### WR-A05: Editing a transaction's date into another month leaves it in the wrong month's cache

**File:** `src/data/mutations/transactions.ts:156-188`
**Issue:** `onMutate` and `onSuccess` patch only `vars.month`, the row's original month. When `patch.local_date` moves the row to a different month:
- the old month's list still holds it, now showing a date outside that month;
- the new month's list never gets it.

Month totals are wrong while offline, and online until both months refetch, since nothing invalidates the new month.
**Fix:** When `patch.local_date` changes `monthOf(...)`, remove the row from the old month's cache and prepend it to the new month's cache in `onMutate`. In `onSuccess`/`onSettled`, invalidate both `transactionsMonth` keys, or simply `transactionsRoot(householdId)`.

### WR-A06: Optimistic re-stamp on edit breaks the server's D-04 and D-05 rules and can mislabel the home amount

**File:** `src/data/mutations/transactions.ts:171-182`
**Issue:**
- (a) It converts to `vars.homeCurrency`, the current preference, while the row's `home_currency` stays as it was at write time (D-05; the trigger pins `new.home_currency := old.home_currency`). After a home-currency switch, an amount edit writes, for example, a USD figure into `home_amount` on a row labelled GBP.
- (b) For an amount-only edit, D-04 and the trigger keep the stored rate and recompute from `old.orig_per_eur`/`old.home_per_eur`. The client instead uses today's `fx-latest` rate and flips `rate_pending: true`.

Both leave optimistic totals wrong until the server responds, which can be a long time offline.
**Fix:** Use `r.home_currency`, not `vars.homeCurrency`. For an amount-only patch, compute `convertMinor(amount, parseRate(r.orig_per_eur), ..., parseRate(r.home_per_eur), ...)`, or copy `original_amount` for `same-currency`. Keep `r.rate`, `r.rate_date` and `r.rate_pending`. Only re-run `provisionalStamp` when `local_date` or `original_currency` changes.

### WR-A07: "Last synced" advances on local optimistic writes, including while offline

**File:** `src/data/sync/lastSynced.ts:57-59`
**Issue:** `Query.setData` dispatches `{ type: 'success', manual: true }` (`query-core/build/modern/query.js:86-94`). Every optimistic `setQueryData` in the mutation modules therefore passes the `event.action.type === 'success'` check and calls `markSynced()`. Offline, adding a transaction resets "synced just now" although nothing reached the server. The SYN-06 status line then reports a false fresh sync.
**Fix:** Ignore manual updates, for example `event.action.type === 'success' && !event.action.manual`. For queries, also require that `fetchStatus` was `fetching`.

### WR-A08: The failed-writes store can lose entries through a hydrate/record race and unordered persists

**File:** `src/data/sync/failedWrites.ts:37-39, 46-59, 66-74`; `src/data/QueryProvider.tsx:22`
**Issue:** `hydrateFailedWrites()` is fire-and-forget at module load, and nothing gates `recordFailedWrite` on it. If a resumed mutation is rejected while hydration's read is still in flight, either outcome loses data:
- If the read completes after the record, it overwrites `entries` with the disk copy, which drops the new entry from memory.
- If the read completes before the record, `persist()` writes `[new]` over the disk list, which drops the older entries on the next boot.

Separately, `persist()` calls are not serialized. LargeSecureStore's async encrypt-then-write means an older snapshot can land after a newer one. This contradicts D-19's promise that a failed entry is never lost.
**Fix:** Keep a `hydrated` promise and `await` it at the top of `recordFailedWrite`/`dismissFailedWrite`. Serialize persists through a promise chain (`persistChain = persistChain.then(() => store.setItem(...))`).

### WR-A09: A sign-out wipe does not stop in-flight mutations and does not warn about failed entries

**File:** `src/data/queryClient.ts:38-52`; `src/data/sync/failedWrites.ts:113-119`
**Issue:**
- (a) `getMutationCache().clear()` removes mutations but does not stop a request that is already executing. When it settles, its `onSuccess`/`onError` still run `setQueryData` into the freshly cleared client and `recordFailedWrite` into the freshly wiped list. That re-creates the previous user's rows and attempted payloads (amounts, notes), which then persist into the next user's session on a shared device.
- (b) `pendingWriteCount` counts only `pending` mutations. The failed-writes list, which the wipe deletes, has no `pendingWriteCount`, so the "unsynced changes" warning never mentions the parked entries the user is about to lose.

**Fix:**
- (a) Add a session epoch that the wipe increments. Mutation callbacks capture the epoch in `onMutate` or through the vars, and become no-ops when it has changed. Alternatively, have `wipe()` await in-flight mutations before clearing.
- (b) Add `pendingWriteCount: async () => entries.length` to the failed-writes wipe handler, or expose a separate count to the warning UI.

### WR-A10: Group separators are accepted anywhere, so a wrong-convention entry parses as 10x or 100x the intended amount

**File:** `src/engine/money/parseAmount.ts:112-118`
**Issue:** Any group mark in the whole part is silently dropped, whatever its position:
- `parseAmount('12,50', { locale: 'en-US', exponent: 2 })` gives `125000` ($1,250.00).
- `'1,5'` gives `$15.00`.
- `'12.50'` in de-DE gives €1,250.00.

A European user whose device language is en-US, or a user pasting a figure copied from elsewhere, enters 100x the amount with no error. `parseAmount.test.ts:80-85` enshrines the de-DE `'12.5'` becoming 125.000 case. D-24 calls the parser "strict", but the D-24/T-01-03-02 mitigation relies on the user noticing an echo. This app's core value is a trustworthy answer, and 100x mis-entry is the stated top concern.
**Fix:** Validate group placement. After the first group, every group must be exactly the locale's primary grouping size: 3, or 2 for secondary groups in en-IN, derivable from `formatToParts(1234567.5)`. Reject `'12,50'`, `'1,5'` and `'1,2,3'` with `invalid`, or a new `ambiguous-separator` error. Keep accepting `'1,234.56'` and `'12,34,567.5'` (en-IN).

### WR-A11: The parse and format locale comes from the language tag, not the region's decimal separator

**File:** `src/services/locale/deviceLocale.ts:12-14, 26-32`
**Issue:** D-22 says numbers are formatted by the device region. `getLocales()[0].languageTag` is the first preferred language, for example `en-US`, and can disagree with the region's number format, for example region Germany. expo-localization exposes `decimalSeparator`/`digitGroupingSeparator` on the same object precisely for this case. The iOS decimal keypad emits the region's separator (`,`), and `localeSeparators('en-US')` treats `,` as a group mark. Combined with WR-A10, `12,50` typed on the native keypad is stored as 1,250.00. This depends on how expo-localization builds `languageTag` on each OS (moderate confidence), so verify on the iPhone XR with language English and region Germany.
**Fix:** Pass explicit separators through. Add an optional `separators?: LocaleSeparators` to `parseAmount`/`parseDecimalString` opts, populated from `getLocales()[0].decimalSeparator`/`digitGroupingSeparator`, with a fallback to `localeSeparators(locale)`. Alternatively, build a locale tag from `languageCode` + `regionCode`.

### WR-A12: Month fetch is silently capped at PostgREST `max_rows`, which truncates totals

**File:** `src/db/transactions.ts:65-83`
**Issue:** There is no pagination or range, and `supabase/config.toml` does not set `max_rows`, so the hosted default of 1000 applies. A household month with more than 1000 rows is returned truncated with no error. Every total derived from it, including Decide's inputs later, is wrong without any warning.
**Fix:** Page with `.range(from, from + PAGE - 1)` until a short page comes back, or request `count: 'exact'` and assert `rows.length === count`, throwing if truncated.

### WR-A13: A mutation mid-retry or in flight at app kill is not persisted, and its optimistic row is later dropped silently

**File:** `src/data/cache/persister.ts:41`
**Issue:** `shouldDehydrateMutation: m.state.isPaused` excludes the first in-flight attempt and online retry backoff (`isPaused: false`). The optimistic row is persisted (the query is `success`) but the mutation is not. After a force-quit, the row shows `pending: true` with nothing behind it. The next refetch removes it, and the entry is lost with no failed-write record. SYN-04 is deferred to Phase 10, but Phase 1 still shouldn't persist an orphaned optimistic row.
**Fix:** Dehydrate all `status === 'pending'` mutations. TanStack resumes restored pending mutations with `onContinue`, and inserts are idempotent through the 23505-by-id path. At minimum, on restore, strip `pending: true` rows whose id has no matching restored mutation and record them as failed.

### WR-A14: A custom currency's `as_of` uses the UTC date, not the local date

**File:** `src/data/mutations/customCurrencies.ts:179`
**Issue:** `new Date().toISOString().slice(0, 10)` is the UTC calendar day. At 08:00 in Sydney it records yesterday; at 20:00 in Vancouver it records tomorrow. `as_of` feeds `rate_date` for custom conversions through `least(ref.rate_date, c.as_of)` on the server and `earlierDate` on the client. A tomorrow `as_of` is visible as a future publication date (MON-07). This contradicts MON-14's rule that local dates never derive from UTC.
**Fix:** `as_of: localDateIn(new Date(), getDeviceTimeZone())`.

### WR-A15: `followUpIfRatePending` is awaited inside `onSuccess` and blocks the whole write queue

**File:** `src/data/mutations/transactions.ts:66-76, 129-134, 186-189`
**Issue:** query-core awaits `options.onSuccess` before `runNext` releases the scope (`mutation.js:178-217`). Every `rate_pending` write therefore holds the single `WRITE_SCOPE` until the resolve-rate Edge Function returns, which includes an upstream Frankfurter backfill. A slow or hanging function call, with no timeout, stalls every later queued write and keeps `queued` high in the status line.
**Fix:** Do not await the follow-up. Use `void followUpIfRatePending(...)`, and give the call an `AbortSignal` timeout. Resolution is best-effort, as the code comment already says.

## Info

### IN-A01: Provisional stamp `rate_date` differs from the server for same-currency rows and the EUR leg

**File:** `src/data/mutations/provisional.ts:106-115, 53-58`
**Issue:** The server sets `rate_date := new.local_date` for same-currency rows, while the client sets `null`. For the EUR leg, the server uses `rate_date := p_on` and `least(...)`, so with a later provisional rate it yields `local_date`. The client ignores the EUR leg (`''`). The rate-date/attribution component will show different dates before and after sync.
**Fix:** Pass `local_date` into `provisionalStamp`. Use it for same-currency rows and for the EUR leg to mirror `per_eur_rate`.

### IN-A02: `crossRate`/`customPerEur` can return `0n`, which breaks the ScaledRate invariant

**File:** `src/engine/money/rates.ts:76-82`
**Issue:** `formatRate`'s comment assumes a ScaledRate is always positive. Very large `unitValue` values or extreme cross rates round to `0n`, which later throws in `divideHalfUp`, or, as `toPerEur`, silently converts to 0. The same holds for SQL `custom_per_eur`.
**Fix:** Throw a `RangeError` when the result is `<= 0n`. Consider an upper bound on `unit_value` in `validateCustomCurrency`.

### IN-A03: The in-memory `lastSyncedAt` survives sign-out

**File:** `src/data/sync/lastSynced.ts:9`
**Issue:** The AsyncStorage key is swept by the `fincwin:` prefix, but the module variable is not reset. The next user sees the previous user's "synced N minutes ago" until their first sync.
**Fix:** Register a wipe handler that sets `lastSyncedAt = null` and notifies listeners.

### IN-A04: Native digits other than the two Arabic ranges are rejected

**File:** `src/engine/money/parseAmount.ts:63-74`
**Issue:** Bengali, Devanagari, Thai and Myanmar digits, which Intl emits for `bn-BD` and `my-MM`, return `invalid`, so users on those locales cannot type amounts with native keyboards.
**Fix:** Normalize with a `\p{Nd}` check plus a per-block zero offset, or document the supported set.

### IN-A05: Optimistic writes extend the 30-day cache freshness window

**File:** `src/data/cache/persister.ts:38`
**Issue:** `setQueryData` bumps `dataUpdatedAt`, so a month that is only ever written to optimistically, and never refetched successfully, keeps being persisted past D-15's "30 days without a successful refetch".
**Fix:** Track the last server-fetch time separately, for example in query `meta` or from `dataUpdateCount` versus fetches, or accept this and note it in D-15.

---

_Reviewed: 2026-09-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Partition B

# Phase 1 (Partition B): Code Review Report

**Reviewed:** 2026-09-24
**Depth:** standard (static only; no database connection)
**Files Reviewed:** 27
**Status:** issues_found

## Summary

I reviewed the Phase 1 schema (custom currencies, money preferences, accounts, transactions, FX stamping, FX monitoring, cron jobs), the three Edge Functions and the pgTAP tests and fixture behind them. The engine parity reference was `src/engine/money/{rounding,rates,currencyExponents}.ts`.

**What holds up:**
- **SQL mirror.** `div_half_up`, `convert_minor`, `cross_rate` and `custom_per_eur` match the TypeScript engine exactly, including negative numerators. The SQL exponent `CASE` matches `ISO_EXPONENT_EXCEPTIONS` entry for entry.
- **Column grants.** They correctly keep every FX stamp column, `created_by`, `household_id` (on update) and `home_currency` out of client reach.
- **Account link.** The composite FK stops a transaction pointing at another household's account.
- **`fincwin.system_restamp`.** The GUC cannot be set through PostgREST, and no client-callable function sets it.
- **Endpoint auth.** The shared-secret checks on `fx-sync` and `fx-monitor` are constant-time. `resolve-rate` reads under the caller's own RLS before any service-role write, so it is not an IDOR.

**What fails:**
- **The FX quarantine can be bypassed in two ways.** `resolve-rate` writes unvetted rates straight into the served table (CR-B01). A hold the operator drops is revived and then auto-accepted (CR-B02).
- **Custom currencies leak across tenants.** Several SECURITY DEFINER lookup functions take an arbitrary owner UUID and are callable by any signed-in user. That breaks the owner-only RLS on custom currencies (CR-B03).
- **Restamp overstates certainty.** It marks rates as final when they are very old or older than the transaction's date.
- **A custom leg loses its open.er-api attribution.**

## Critical Issues

### CR-B01: resolve-rate writes unvetted Frankfurter rows into the served `fx_rates`, bypassing the MON-11/D-11 quarantine

**File:** `supabase/functions/resolve-rate/resolve.ts:181-194`, `supabase/functions/resolve-rate/index.ts:67-76`

**Issue:** When a pending transaction is resolved, every row returned by `GET /v2/rates?date=…&quotes=…` goes straight into `fx_rates` (the served set) with `source='frankfurter-v2'`. Nothing checks it first:
- it is never run through `classifyRates`;
- it is never checked against open `fx_rate_holds` for the same `(quote, rate_date)`;
- nobody checks that the returned dates are on or before `local_date`, or that the quotes are the ones requested.

D-11 says a held value "sits in a quarantine table, never in the served rate set". Here any signed-in user can move it into the served set.

**Failure scenario:**
1. fx-sync holds a bad Frankfurter publication for quote Q on date D.
2. A user has a transaction in Q dated D, or shortly after, with no Q row in the 7 days before it. This is common for the sporadically published v2 currencies (Pitfall 4). Future-dated entries hit the same path.
3. The client calls `resolve-rate` automatically on flush (`src/db/transactions.ts:140`).
4. Frankfurter returns the D publication, which is upserted as a served `frankfurter-v2` row.
5. `restamp_transaction` stamps it as exact.

From then on the held rate is served to every user. `fx_auto_accept_holds` later hits `on conflict do nothing`, and `fx_drop_hold` deletes nothing because the hold's status is still `held`, so the operator cannot remove the bad row through the runbook.

**Fix:**
- Before upserting, drop any row whose `(quote, rate_date)` has an open or dropped hold.
- Run the remaining rows through the plausibility check against the nearest stored prior. Anything that fails goes to `fx_rate_holds`, not `fx_rates`.
- Reject rows whose `date > row.local_date` or whose quote was not requested.

```ts
const holds = await deps.holdsFor(quotes, row.local_date); // status in ('held','dropped')
fxRows = fxRows.filter((r) =>
  quotesToFetch.has(r.quote) && r.date <= row.local_date &&
  !holds.some((h) => h.quote === r.quote && h.heldDate === r.date));
// then classifyRates(fxRows, priorRowsFor(quotes), [], 'frankfurter-v2') and only upsert .accept
```

### CR-B02: an operator-dropped hold is revived by the next fx-sync and then auto-accepted at once

**File:** `supabase/functions/fx-sync/index.ts:72-90`, `supabase/functions/fx-sync/plausibility.ts:372-401`, `supabase/migrations/20260924000700_fx_monitor_jobs.sql:150-162`

**Issue:** `upsertHolds` upserts on `(quote, held_rate_date, source)` and sends `status: 'held'`. It does not send `held_at` or `resolved_at`. Under PostgREST merge-duplicates, a conflicting `dropped` row therefore goes back to `status='held'` but keeps its original `held_at`.

`classifyRates` does not know about dropped holds: `openHolds()` filters to `status='held'`, and the dropped value was never written to `fx_rates`. So when Frankfurter's `/v2/rates` still returns the same bad publication, it is held again. That happens every weekend and holiday, and every day for a sporadically published currency.

`fx_auto_accept_holds` then selects `status='held' and held_at < now() - 2 days`. Because `held_at` is the original time, the revived row qualifies at the next 17:00 run.

**Failure scenario:**
1. Friday: a bad JPY rate for Friday is held.
2. Saturday: the operator runs `fx_drop_hold`.
3. Saturday 16:30: fx-sync gets the same Friday JPY value and the upsert revives the row as `held`.
4. Sunday 17:00: fx-monitor auto-accepts it into `fx_rates`.

The operator's drop is silently undone. The same thing happens after dropping an auto-accepted hold: the row is deleted from `fx_rates`, revived by the next sync, then auto-accepted again.

**Fix:** Treat dropped `(quote, date, source)` tuples as terminal.
- In `sync.ts`, load them (`status in ('held','dropped')`) and skip any matching incoming row.
- In `upsertHolds`, use `ignoreDuplicates: true` so an existing row's status is never overwritten.
- As defence in depth, have `fx_auto_accept_holds` refuse any row whose `resolved_at is not null`.

### CR-B03: SECURITY DEFINER lookups take an arbitrary owner UUID and bypass the owner-only RLS on `custom_currencies`

**File:** `supabase/migrations/20260924000100_custom_currencies.sql:44-58`, `supabase/migrations/20260924000500_fx_stamping.sql:95-126, 143-224, 407-411`

**Issue:** Three functions are SECURITY DEFINER, exposed as PostgREST RPCs, granted to `authenticated`, and accept any `p_owner`/`p_user`:
- `is_known_currency(p_code, p_user)`
- `currency_exponent(p_code, p_owner)`
- `per_eur_rate(p_code, p_on, p_owner, …)`

The `custom_currencies` policies are strictly `owner_id = auth.uid()` (D-07, "stored per user"). With another user's UUID, any signed-in user can learn:
- which custom codes that user has (from `is_known_currency`);
- their declared decimals (from `currency_exponent`);
- their unit value and reference currency (`per_eur_rate` returns `reference_per_eur / unit_value` and `least(ref_date, as_of)`).

User UUIDs are visible to household members via `household_members.user_id` and `transactions.created_by`. They are not secret identifiers.

No client code calls these RPCs (`grep rpc( src` returns nothing). The triggers call them as the definer, so the grants to `authenticated` are not needed at all.

**Failure scenario:** `POST /rest/v1/rpc/per_eur_rate {"p_code":"PTS","p_on":"2026-09-24","p_owner":"<victim uuid>"}` returns the victim's private custom-currency valuation.

**Fix:**
```sql
revoke execute on function public.is_known_currency(text, uuid) from authenticated;
revoke execute on function public.currency_exponent(text, uuid) from authenticated;
revoke execute on function public.per_eur_rate(text, date, uuid, boolean) from authenticated;
-- keep service_role; triggers run as definer and are unaffected
```
If a client-facing version is ever needed, add a wrapper that ignores the parameter and uses `(select auth.uid())`.

## Warnings

### WR-B01: restamp (`p_any_earlier`) stamps stale or pre-date rates as exact, including for future-dated rows

**File:** `supabase/migrations/20260924000500_fx_stamping.sql:184-194, 369-386`, `supabase/migrations/20260924000400_transactions.sql:275`

**Issue:** With `p_any_earlier = true`, the first query in `per_eur_rate` has no age limit and sets `exact := true` on any earlier row, whatever its age. `restamp_transaction` also always runs with this flag. That is true even for legs the backfill did not return: Frankfurter can cover only some of the requested quotes, and when `quotesToFetch` is empty no backfill happens at all.

`local_date` also has no bounds.

**Failure scenario:** A user logs a planned USD expense dated 30 days ahead with home currency GBP.
1. The insert is pending, since there is no row within 7 days before the date.
2. The client calls `resolve-rate`, then `restamp_transaction`.
3. The latest stored rates (today's) are stamped `rate_pending=false`, `exact`.

When the date arrives, the row never re-rates because it is no longer pending. That contradicts D-02 (the rate for the transaction's own date). Separately, a leg Frankfurter did not return in the backfill is stamped exact from a row that can be years old.

**Fix:**
- Only relax the window for quotes that `resolve-rate` actually received. For example, pass the set of backfilled quotes into `restamp_transaction`, or have it accept only rows whose `fetched_at` is after the call began.
- Never mark exact when `local_date > current_date`: keep future rows pending until their date passes.
- Add a check such as `local_date between '1999-01-04' and current_date + 366`.

### WR-B02: the custom-currency leg overwrites open.er-api attribution (MON-12 / D-13)

**File:** `supabase/migrations/20260924000500_fx_stamping.sql:170-181, 320-324`

**Issue:** For a custom currency, `per_eur_rate` sets `source := 'custom'` unconditionally, throwing away `ref.source`. If the reference currency's rate came from open-er-api (for example on a Frankfurter outage day, or for a reference only open.er-api carries), the stamped `rate_source` is `'custom'`. The attribution component then never shows "Rates By Exchange Rate API". The comment at line 316 says attribution "must never be lost", but the precedence `case` never sees `'open-er-api'`.

**Fix:** Keep the reference source when it is `open-er-api`:
```sql
source := case when ref.source = 'open-er-api' then 'open-er-api' else 'custom' end;
```
Or add a separate `attribution_source` column. Add a pgTAP case: custom referencing an open-er-api-only quote.

### WR-B03: same-run witness confirmation matches holds by quote only, so it can confirm the wrong hold and mislabel its source

**File:** `supabase/functions/fx-sync/sync.ts:261-272`, `supabase/functions/fx-sync/plausibility.ts:372`

**Issue:**
- `freshHolds.find((h) => h.quote === witness.quote)` returns whichever open hold for that quote comes first, in unspecified DB order. That can be an older hold on a different date, or an `open-er-api`-sourced hold left from a fallback day.
- The confirmed row is then upserted with `source` (`'frankfurter-v2'`) rather than `held.source`.
- An open.er-api hold can end up "confirmed" by an open.er-api witness, which is the same source, and served as `frankfurter-v2`. That loses MON-12 attribution and defeats the "second source" rule.
- `classifyRates` likewise only looks at the first open hold per quote.

**Fix:** Match on `quote`, `source === 'frankfurter-v2'` and `heldDate === <the hold just created>`, taken from `classified.hold`, not from `freshHolds.find`. Upsert under `held.source`. In `classifyRates`, check every open hold for the quote.

### WR-B04: the plausibility check is silently skipped when the prior rate is more than 14 days older than the batch's earliest date

**File:** `supabase/functions/fx-sync/sync.ts:172, 213`, `supabase/functions/fx-sync/plausibility.ts:386-393`

**Issue:** History is loaded only from `earliestDate(rows) - 14 days`, and "no prior" means "accept". In two cases a move of any size goes straight into `fx_rates` with no hold:
- a currency whose previous publication is older than that window (sporadic v2 sources, or any currency after an fx-sync outage longer than 14 days);
- a currency that disappears and comes back.

**Fix:** Get the prior per quote with no window, for example with `fx_latest_rates(p_on_or_before => row.date - 1)`, or a `distinct on (quote)` query with `rate_date < incoming date`. Reserve "accept without prior" for quotes that have never been stored.

### WR-B05: `fx_drop_hold` cannot fully undo a bad rate

**File:** `supabase/migrations/20260924000600_fx_monitoring.sql:98-119`

**Issue:**
1. Dropping a `confirmed` hold only changes its status: the rate stays in `fx_rates` and keeps being served.
2. Transactions stamped from a bad auto-accepted or confirmed rate are `rate_pending=false`, and `restamp_transaction` only touches pending rows. So there is no supported way to repair them, and they stay wrong permanently.
3. When the rate was already in `fx_rates` for another reason (see CR-B01), the hold is still `held`, so nothing is deleted.

**Fix:**
- Delete the `fx_rates` row for any non-dropped status.
- Add a service-role `fx_restamp_by_rate(quote, rate_date, source)` that re-stamps rows whose `rate_date`/`rate_source` point at the dropped rate. This needs a restamp variant that is not limited to pending rows.
- Record the affected row count in the operator alert.

### WR-B06: a custom code can later shadow an ISO code, and a self-reference then recurses without end

**File:** `supabase/migrations/20260924000100_custom_currencies.sql:70-83`, `supabase/migrations/20260924000500_fx_stamping.sql:170-172`

**Issue:** The shadow check only runs at insert, and only against the codes in `fx_rates` at that moment. Two things can later add a code: open.er-api fallback rows (which carry currencies Frankfurter lacks) and new Frankfurter currencies. Once that happens:
- `per_eur_rate` and `currency_exponent` check custom definitions first, so the user's definition silently overrides the ISO rate and exponent.
- The update branch then lets `reference_currency` be set to the currency's own code, because `is_iso_currency(code)` is now true. `per_eur_rate(X)` then calls itself forever until it hits "stack depth limit exceeded". Every insert or update of a transaction in X, or by a user whose home currency is X, fails.
- On a fresh DB, where `fx_rates` is still empty, even `USD` can be registered as a custom code.

**Fix:**
- Add `check (reference_currency <> code)`.
- In `per_eur_rate`, pass a depth argument and raise past depth 1, or resolve custom currencies non-recursively, since the reference must be ISO.
- Validate the code against a static ISO-4217 list (the `currencies` table or the exponent table) rather than the current contents of `fx_rates`.

### WR-B07: the custom per-EUR rate is rounded to 10 decimal places, so high-value custom units do not round-trip and can reach zero or overflow

**File:** `supabase/migrations/20260924000500_fx_stamping.sql:79-88`, `supabase/migrations/20260924000100_custom_currencies.sql:22`

**Issue:** `custom_per_eur` quantises `reference_per_eur / unit_value` to 10 decimal places before it is used. The TS engine does the same, so parity holds, but the maths is wrong for plausible inputs:
- **Round-trip loss.** With `1 GOLD = 60000 USD`, 2 decimals, home USD and USD per EUR 1.1734: per-EUR = 0.0000195567. Then 1.00 GOLD converts to 59,999.90 USD instead of 60,000.00, and the error grows with the amount.
- **Zero rate.** `unit_value` has only a `> 0` bound. When `ref/unit < 5e-11` the rate rounds to 0, `convert_minor` raises 22012, and the user's insert is permanently rejected.
- **Overflow.** A tiny `unit_value` against a high-per-EUR reference (VND, IDR) overflows `numeric(24,10)`, error 22003.

**Fix:**
- Put bounds on `unit_value`, for example `between 0.000001 and 1000000`.
- Better, convert the custom leg exactly: `amount * unit_value` into the reference currency, then cross to home, so there is no 10-decimal intermediate. Update the TS mirror and fixture together.

### WR-B08: custom-currency rows depend on the author's private definition and silently fall back to exponent 2 without it

**File:** `supabase/migrations/20260924000500_fx_stamping.sql:266, 309-310, 340-346`

**Issue:** `owner := coalesce(new.created_by, auth.uid())`, and `transactions.created_by` is `on delete set null`. If the author's account is deleted (their `custom_currencies` rows cascade away) while the household survives, or if `created_by` is otherwise null, an amount-only edit by another member runs:
- `currency_exponent('PTS', <editor>)`, which returns the default 2 instead of the declared 0;
- `convert_minor` with that exponent, which corrupts `home_amount` by 100x.

Household members also cannot read the author's custom currency at all (owner-only RLS), so they cannot format these amounts. This is latent in Phase 1 (households of one) but is baked into the schema now.

**Fix:** Stamp the exponents on the row at write time (`orig_exp`/`home_exp` smallint columns, server-only), and use the stored values on amount-only edits. Or make custom currencies readable by the household that uses them.

### WR-B09: the mirror fixture does not cover the full exponent table or boundary amounts

**File:** `supabase/tests/fixtures/money-conversion-cases.json` (exponent section), `supabase/tests/database/07_money_rounding_mirror.test.sql:44-58`

**Issue:** The migration comment (`20260924000500_fx_stamping.sql:91`) says the exponent `CASE` is kept "in lockstep" with the TS table, but the fixture only asserts 11 of the 26 exceptions. These are never asserted: BIF, DJF, GNF, KMF, PYG, RWF, UGX, UYI, VUV, XAF, XOF, XPF, IQD, LYD, UYW. The two tables agree today, but a drift in any of those would not be caught.

The fixture also has no conversion case for:
- a 4-decimal currency;
- a negative 3-decimal to 0-decimal conversion;
- a custom currency with non-zero decimals;
- the `MAX_SAFE_INTEGER` / `home_amount` bound, where TS throws a `RangeError` and SQL raises a 23514 check violation.

**Fix:** Generate the exponent cases from `ISO_EXPONENT_EXCEPTIONS` in `scripts/gen-money-mirror-test.mjs`, plus a few default-2 codes. Add the boundary conversions listed above.

## Info

### IN-B01: resolve-rate returns an untyped 500 on DB errors and has no rate limiting

**File:** `supabase/functions/resolve-rate/index.ts:46-81, 91`

**Issue:** When `readPending`, `upsertRates` or `restamp` throws (including for an anon-key JWT, which passes `verify_jwt`), the error is not caught. The response is a bare 500, not the `{ok:false}` shape that the client's D-19 classifier expects. Any signed-in user can also trigger unlimited outbound Frankfurter fetches.

**Fix:** Wrap `resolveRate` in try/catch and return `{ok:false,error:'internal'}` with a 500. Consider a per-user throttle.

### IN-B02: fx-sync failures after the fetch step leave no `sync-failed` alert

**File:** `supabase/functions/fx-sync/sync.ts:210-244`, `supabase/functions/fx-sync/index.ts:125-130`

**Issue:** Any error in `recentRates`, `upsertRates` or `upsertHolds` only returns a 502 to pg_net, and nobody reads that response. The operator finds out only when the staleness check fires about 4 days later.

**Fix:** Catch at the top level of `runFxSync` and insert a `sync-failed` alert before rethrowing. This is best-effort: swallow any error from the insert itself.

### IN-B03: fx-monitor shares fx-sync's secret, and its own failure is silent

**File:** `supabase/migrations/20260924000700_fx_monitor_jobs.sql:200-212`, `supabase/functions/fx-monitor/index.ts:23-31`

**Issue:** One leaked secret authorises both endpoints. If fx-monitor itself fails (for example Resend returns 401 or config is missing), nothing reports it.

**Fix:** Give fx-monitor its own secret. Add a heartbeat, for example an external uptime check on the digest, or a daily "all clear" email.

### IN-B04: `time_zone` is not validated as an IANA zone, and staleness alerts repeat daily

**File:** `supabase/migrations/20260924000400_transactions.sql:276`, `supabase/functions/fx-monitor/monitor.ts:174-190`

**Issue:** Any 1–64 character string is accepted as `time_zone`, although MON-14 calls for an IANA zone. `findStale` also inserts a new `stale` alert every day for each currency Frankfurter stopped publishing without setting `end_date`, which adds noise to the digest.

**Fix:** Validate `time_zone` with `exists (select 1 from pg_timezone_names where name = time_zone)` in a trigger. Deduplicate `stale` alerts per quote while the condition persists.

---

_Reviewed: 2026-09-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Partition C

# Phase 1 (partition C): Code Review Report

**Reviewed:** 2026-09-24
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

The migration compatibility gate (FND-10) is the main problem. I ran probe migrations against a temp copy of `supabase/migrations` using the real `scripts/check-migration-compat.mjs` and squawk 2.66.0 on Node 24.15. Four different destructive migrations all printed `MIGRATION COMPAT OK` and exited 0:

| Probe | Result |
|---|---|
| `-- squawk-ignore-file ban-drop-column` + `drop column` | **OK, exit 0** (bypass) |
| `-- squawk-ignore ban-drop-column -- reason: legacy` + `drop column` | **OK, exit 0** (bypass) |
| Earlier file with the floor `update` only in a `--` comment, then a marked drop | **OK, floor 9.0.0** (bypass) |
| Floor `insert ... on conflict do nothing`, which changes no row | **OK, floor 9.0.0** (bypass) |
| Filename `29990101000100_x&ver&rem .sql` containing `drop column` (Windows) | **OK, exit 0**. Squawk never saw the file, and the injected `ver` ran |
| `drop function public.convert_minor(...)` / `drop view` | OK, exit 0. Outside squawk's scope, and neither the docs nor the PR template mention it |
| `-- contract-ok: min_version >= 0.1.0` (the current floor) + `drop table public.accounts` | OK, exit 0 |

The self-test (`verify-migration-gate.mjs`) covers none of these, so it proves nothing beyond the happy-path failure cases.

`gen-money-mirror-test.mjs --check` holds up. It normalises CRLF on the file read from disk and always generates LF, so a Windows checkout with `autocrlf` and Linux CI agree. It reports "up to date" on the current tree, and the fixture holds no integers that would lose precision (none has 15+ digits). The i18n copy has no compliance problems: no "advice", "recommendation" or "should" in any string, and the attribution string matches the open.er-api mandated text. `.env.example` has no values. The UI findings are smaller: an unhandled `openURL` rejection, a tap target and accessibility structure below guidelines, and no screen renders the attribution yet even though the fallback is live.

## Critical Issues

### CR-C01: `-- squawk-ignore-file` skips the contract-ok check entirely

**File:** `scripts/check-migration-compat.mjs:48`, `:75-86`
**Issue:** `SQUAWK_IGNORE_RE = /--\s*squawk-ignore\s+(...)/` needs whitespace directly after `squawk-ignore`, so it never matches squawk's file-level directive `-- squawk-ignore-file <rule>`. Squawk does honour that directive, suppresses the violation and exits 0. The gate then finds no ignored kept rule, so it never asks for a `contract-ok` marker. Verified: a file with `-- squawk-ignore-file ban-drop-column` and `alter table public.transactions drop column note;` gives `MIGRATION COMPAT OK (12 files, floor 0.1.0)`. With this, any destructive statement can reach production with no floor bump at all.
**Fix:** Match both forms, and treat a file-level ignore of a kept rule as needing a marker (or ban it outright):
```js
const SQUAWK_IGNORE_RE = /--\s*squawk-ignore(?:-file)?\b\s*([^\r\n]*)/gi;
// and separately:
if (/--\s*squawk-ignore-file\b/i.test(content)) errors.push(`${fileName}: squawk-ignore-file is not allowed; ignore per statement`);
```
Add a probe for it to `verify-migration-gate.mjs`.

### CR-C02: Any trailing text after the rule name disables the contract-ok check

**File:** `scripts/check-migration-compat.mjs:80-83`
**Issue:** The capture runs to end of line, is split only on `,`, and each piece is compared exactly against `KEPT_COMPAT_RULES`. Squawk tokenises the rule list more loosely, so it still honours `ban-drop-column` in `-- squawk-ignore ban-drop-column -- reason: legacy`. The gate instead gets the piece `"ban-drop-column -- reason: legacy"`, which is not in the set, so no marker is needed. Verified: that probe passes with exit 0. A developer adding a justification comment on the same line (a very natural habit) silently turns off the floor check. The same applies to `ban-drop-column  ban-drop-table` (space-separated) and to case differences, because the regex is `/i` but `Set.has` is case-sensitive.
**Fix:** Pull rule names out as tokens instead of splitting on commas:
```js
for (const rule of m[1].toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? []) rules.add(rule);
```
Or, more robustly, fail if any squawk-ignore token is not a known squawk rule name.

### CR-C03: The floor is taken from regex text, so a commented-out or no-op `min_supported_version` statement raises it

**File:** `scripts/check-migration-compat.mjs:42-45`, `:63-73`, `:188-190`
**Issue:** `findFloorBumps` runs its regexes over raw file content, comments included, and does not check whether the statement actually changes the row.
- Verified: an earlier file containing only `-- TODO later: update public.app_config set value = '9.0.0' where key = 'min_supported_version';` followed by `-- contract-ok: min_version >= 9.0.0` + a drop gives `MIGRATION COMPAT OK (13 files, floor 9.0.0)`. The real floor in production stays at 0.1.0.
- Verified: `insert into public.app_config (key, value) values ('min_supported_version', '9.0.0') on conflict do nothing;` is counted as floor 9.0.0. The row already exists (seeded in `20260922000200_app_config.sql:20`), so in production this is a no-op.

Either way, the gate authorises a destructive change while app versions below the claimed floor are still allowed to connect.
**Fix:** Strip `--` line comments and `/* */` blocks before running `findFloorBumps` (and before the marker/ignore scans, keeping the comment text separately for those). Reject an `insert ... on conflict do nothing` form, or only accept `insert` in the file that creates `app_config`, and use `update` everywhere else. Add both as failing probes.

### CR-C04: `shell: true` with unescaped file paths allows command injection and a gate bypass through a filename

**File:** `scripts/check-migration-compat.mjs:110-115`
**Issue:** With `shell: true`, Node joins `args` with spaces and applies no quoting. Node 24 flags this at runtime with `DEP0190: Passing args to a child process with shell option true can lead to security vulnerabilities`. Every migration path goes straight onto a cmd.exe command line (Windows) or `/bin/sh` command line (CI). Verified on Windows: a migration named `29990101000100_x&ver&rem .sql` containing `drop column` made squawk lint only the 11 legitimate files. `ver` ran as an injected command, `rem` discarded the rest of the line, and the gate printed `MIGRATION COMPAT OK` with exit 0. Supabase CLI accepts any `<digits>_<anything>.sql`, so the file would still be applied by `db push`. On Linux CI the equivalent is a name containing `;true #`. The same unquoted join also breaks the gate (fails closed) for any checkout path with spaces, such as `C:\Users\harki\agentic r antigravity\...` on this machine.
**Fix:** Do not use a shell. On Windows, call the real binary instead of the `.cmd` shim:
```js
// node_modules/squawk-cli ships the native binary; resolve it directly
const bin = require.resolve('squawk-cli/bin/squawk' /* or the platform binary path */);
spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', shell: false });
```
Or keep the shim with `spawnSync(process.env.ComSpec, ['/d', '/s', '/c', quoteAll([bin, ...args])], { windowsVerbatimArguments: true })`. Also reject any migration filename that does not match `/^\d{14}_[a-z0-9_]+\.sql$/`. That check alone closes the injection route and enforces a naming convention as well.

## Warnings

### WR-C01: The self-test does not cover any of the bypasses, the same-file rule, or a missing squawk

**File:** `scripts/verify-migration-gate.mjs:62-145`
**Issue:** P1 to P6 only exercise the straightforward cases. There is no probe for `squawk-ignore-file` (CR-C01), trailing text (CR-C02), a commented-out or no-op floor bump (CR-C03), a hostile filename (CR-C04), or the rule the docs stress: "never the same file's own bump" (`docs/ops/migration-compatibility.md:54`). There is also no probe proving the gate fails closed when squawk cannot run. `resolveSquawkBinary()` falls back to `npx --yes squawk-cli`, which downloads an unpinned version at CI time. The header claims the self-test means "the gate cannot silently rot", but these gaps show it can.
**Fix:** Add a failing-expectation probe for each case above, plus one that runs the gate with `PATH` stripped and `node_modules/.bin/squawk*` hidden and asserts non-zero exit. Remove the `npx` fallback and fail with "squawk-cli not installed" instead.

### WR-C02: A `contract-ok` marker at the current floor authorises a destructive change immediately, and one marker covers every ignore in the file

**File:** `scripts/check-migration-compat.mjs:165-178`
**Issue:** The marker version is chosen by the author and only has to be `<=` the current floor. Verified: `-- contract-ok: min_version >= 0.1.0` + `-- squawk-ignore ban-drop-table` + `drop table public.accounts;` passes today, with no floor bump at all. In practice this is a self-signed waiver, not expand/contract. Checks are also per file, not per statement. One marker anywhere in the file satisfies every kept-rule ignore in it, so a second drop added later in the same file needs no marker of its own.
**Fix:** Require the marker version to be strictly greater than the floor that was in effect at the migration introducing the object, or at least strictly greater than the baseline floor (`0.1.0`). Pair each marker with the statement that follows it (marker, then ignore, then statement), not with the file as a whole.

### WR-C03: The gate and PR checklist miss RPC, view and function contract breaks

**File:** `docs/ops/migration-compatibility.md:79-84`, `.github/pull_request_template.md:5-7`
**Issue:** The app calls Postgres functions directly (write-queue RPCs, `convert_minor`, `fx_latest_rates`, and others). Verified: `drop function public.convert_minor(bigint, numeric, integer, numeric, integer); drop view if exists public.x;` passes the gate. A `create or replace function` that changes an argument list or a return shape also passes. The "Not caught by the linter" section and the checklist only mention RLS and grants, so authors are never prompted about the most likely way to break an installed app in a Supabase-direct design.
**Fix:** Add `drop function|drop view|drop type|alter function .* rename` to the script's own destructive-pattern list, with the same contract-ok requirement. Add "No RPC/function signature, return shape, or view column is removed or changed" to the PR checklist and the doc.

### WR-C04: `KEPT_COMPAT_RULES` is hard-coded separately from `.squawk.toml`

**File:** `scripts/check-migration-compat.mjs:30-40`, `.squawk.toml:17-48`
**Issue:** The kept set is defined implicitly in `.squawk.toml` (every rule not excluded) but listed explicitly in the script. If a rule is removed from `excluded_rules`, squawk starts enforcing it, but ignoring it needs no marker. Squawk rules added by a `^2.66.0` minor bump are also kept by default, yet the script treats ignores of them as free. The two lists will drift without anything noticing.
**Fix:** Read `excluded_rules` from `.squawk.toml` and treat any ignored rule not in that list as kept. Pin `squawk-cli` exactly (`2.66.0`), since `.squawk.toml:15` claims the rule list was verified against that version.

### WR-C05: CI's `rls` job uses an unpinned Supabase CLI

**File:** `.github/workflows/ci.yml:48-49`
**Issue:** `supabase/setup-cli@v1` with `version: latest` means the pgTAP run (including the D-16 rounding mirror `07_money_rounding_mirror.test.sql`) uses whichever CLI and Postgres image is newest on the day, while `package.json:70` pins `supabase` 2.117.0 for local runs. A CLI release that changes the local Postgres major version or its defaults can turn CI red or green with no repo change. It also breaks `.squawk.toml`'s assumption `pg_version = "17.0"`.
**Fix:** `with: { version: 2.117.0 }`, kept in sync with `package.json`. Consider pinning actions by commit SHA as well (IN-C02).

### WR-C06: The promise from `Linking.openURL` is dropped, so its rejection goes unhandled

**File:** `src/ui/RateAttribution.tsx:44-46`
**Issue:** `void Linking.openURL(ATTRIBUTION_URL)` discards a promise that rejects when no handler exists (for example an Android work profile with no browser, or a restricted device). That becomes an unhandled promise rejection, which shows a red box in development and goes to error tracking in production, with no feedback to the user. The test mocks `openURL` to resolve, so this path is never exercised.
**Fix:**
```ts
const handlePress = () => {
  Linking.openURL(ATTRIBUTION_URL).catch(() => { /* no browser available; nothing to do */ });
};
```
Add a test with `mockRejectedValue`.

### WR-C07: The attribution link's tap target is far below 44pt, and the row-level label does nothing on iOS and duplicates on Android

**File:** `src/ui/RateAttribution.tsx:57-62`
**Issue:** The `Pressable` wraps a single line of `fontSize.meta` text with no `hitSlop` or minimum size, so the target is roughly 14-16pt tall. That is below Apple HIG (44pt) and Android (48dp), and an accessibility-review risk for a link that is legally required to be there. Separately, `accessibilityLabel` on the outer `View` without `accessible` is ignored on iOS. On Android it becomes a focusable `contentDescription`, so TalkBack reads the attribution twice: once in the row label, once on the link.
**Fix:** Add `hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}` (or `minHeight: 44`) to the `Pressable`, and remove the `View`'s `accessibilityLabel`. The date `Text` and the link are already separate accessible elements.

### WR-C08: open.er-api is marked "provisioned" and live, but no screen renders the mandatory attribution

**File:** `docs/dependency-register.md:23`, `src/ui/RateAttribution.tsx`, `src/i18n/locales/en.ts` (`credits.exchangeRateApi`)
**Issue:** Nothing outside tests imports `RateAttribution`, and nothing references `credits.exchangeRateApi` in `src/` or `app/` (grep). Yet the register lists open.er-api as `provisioned` and "wired into `fx-sync`", and `docs/ops/fx-operations.md:92-105` says the UI "must show" the attribution and a permanent credits line. As soon as fx-sync falls back, user-visible converted figures use open.er-api rates with no attribution. That breaks the provider's terms (D-13). `SyncStatusLine` is also not mounted anywhere, so SYN-06 is not user-visible.
**Fix:** Either mount the credits line and `RateAttribution` in this phase (plan 01-15), or mark the register row `pending` until it is rendered and keep the fallback disabled in `fx-sync` until then.

## Info

### IN-C01: The mandated attribution text and URL are duplicated in four places with no cross-check

**File:** `src/ui/RateAttribution.tsx:17`, `src/i18n/locales/en.ts` (`money.rate.attribution`, `credits.exchangeRateApi`), `supabase/functions/fx-sync/openErApi.ts:15-16`
**Issue:** `docs/ops/fx-operations.md:100-102` calls `openErApi.ts` "the canonical strings", but the client does not use it (Deno and RN are separate bundles). A future edit to one copy would not be caught.
**Fix:** Add a Jest test that imports `openErApi.ts` constants and asserts both en keys and the component URL equal them.

### IN-C02: Actions and gitleaks image are pinned by mutable tag

**File:** `.github/workflows/ci.yml:16-17, 38, 42, 48`
**Issue:** `actions/checkout@v4`, `actions/setup-node@v4`, `supabase/setup-cli@v1` and `gitleaks:v8.30.1` are all mutable tags. The risk is small with `permissions: contents: read`, but pinning by SHA or digest is the norm for a repo that ships a finance app.
**Fix:** Pin by commit SHA or image digest, with a Dependabot `github-actions` ecosystem entry.

### IN-C03: `RateAttribution` accepts prop combinations that render "Rate of " with no date

**File:** `src/ui/RateAttribution.tsx:34-39`
**Issue:** With `ratePending=false` and `rateDate=null` (or `rateSource=null`), the component renders `Rate of ` with an empty date. The DB check constraint (`transactions.sql:46`) prevents this for stored rows, but optimistic or cache rows and other callers are not bound by it.
**Fix:** Treat `rateDate == null || rateSource == null` as pending, or use a discriminated-union prop type.

### IN-C04: The 30-second refresh in `SyncStatusLine` is untested

**File:** `src/ui/__tests__/SyncStatusLine.test.tsx`
**Issue:** No test uses fake timers to check that "minutes ago" advances, or that the interval is cleared on unmount. The implementation (`SyncStatusLine.tsx:22-25`) looks correct, but the behaviour the header promises is not tested.
**Fix:** Add a `jest.useFakeTimers()` test that advances 60s and checks the new label, then unmounts and checks `jest.getTimerCount() === 0`.

---

_Reviewed: 2026-09-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
