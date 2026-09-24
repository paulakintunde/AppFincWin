# Phase 1: Money Core - Research

**Researched:** 2026-09-24
**Domain:** Integer-money engine, largest-remainder splitting, client-UUID/optimistic-concurrency data layer, TanStack Query offline cache + paused-mutation write queue, server-authoritative FX rate stamping with fallback/staleness/plausibility monitoring, locale-aware formatting, migration-compatibility CI
**Confidence:** HIGH (stack versions, TanStack Query persistence/mutation API, Frankfurter v2 live behavior, ISO 4217 exponents, Resend API, existing-codebase patterns all verified this session) / MEDIUM (the FX-stamping-trigger-vs-backfill interaction design and the SQL/TS rounding-mirror mechanism are original synthesis, not documented anywhere as a named pattern — flagged inline and in Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Foreign-currency records**
- **D-01:** A foreign-currency transaction always stores both figures: original amount and currency, home-currency amount, the rate applied, the rate's publication date and its source. The prototype's "Auto-convert entries" setting becomes a *display* preference (which figure leads), not a storage fork. One row shape.
- **D-02:** The rate applied is the stored rate for the transaction's own local date. If that date has no publication (weekend, holiday), use the nearest earlier one. MON-05's "at the time it was written" means: the rate is fixed on the record when it is written, looked up by transaction date — not today's rate.
- **D-03:** Rates for dates before fx-sync began (Sept 2026) are backfilled on demand. A date that is needed but not stored is fetched server-side from Frankfurter v2's historical endpoint into `fx_rates`, then used. The app still reads only the project's own store (MON-06). No bulk history load.
- **D-04:** Editing a transaction's date re-rates it (the rate for the new date is looked up again). An amount-only edit keeps the rate and recomputes the home amount. The rate always matches the date shown on the record.
- **D-05:** Changing home currency never rewrites history server-side. New totals come from each record's original amount at that record's own dated rate, cross-converted through the stored base (EUR). Past months stay historically true. How totals are derived after a switch (client cross-rate vs a stored base-currency rate on the row) is Claude's Discretion.
- **D-06:** Home currency lives on the user's profile and drives personal totals. The `households` row gets its own reporting currency (defaulting to the owner's home currency) for shared totals and Phase 8 settlements. In a household of one the two are equal.
- **D-07:** Custom currencies (MON-04): user declares a code, symbol, decimal places (MON-13), and what one unit is worth in a currency the user picks (not hard-pinned to USD). Stored per user with their own as-of date, shown the way MON-07 shows publication dates, updated by hand. Exempt from staleness alerts and plausibility holds.
- **D-08:** The currency picker's data source is every currency fx-sync stores from Frankfurter v2 (~171) plus the user's custom currencies. No curated shortlist at the data layer; Record may add search/ordering in its UI.

**FX monitoring and holds**
- **D-09:** Staleness alerts (MON-10) go to the operator by email via Resend (already provisioned), from a scheduled server-side check (pg_cron). Users are not alerted. The rate's visible publication date (MON-07) is their honest signal.
- **D-10:** Staleness limit is business-day aware. One global default of about 4 calendar days (weekend plus one holiday), with a per-currency override column so volatile currencies can be tightened later without a code change.
- **D-11:** While a >10% day-on-day move is held (MON-11), new conversions keep using the last confirmed rate, with its (older) publication date visible. The held value sits in a quarantine table, never in the served rate set.
- **D-12:** A held rate is confirmed when a second source (or a later refresh) lands near it. If nothing confirms it, it is auto-accepted after 2 days. The operator is emailed when a rate is held and again if it is auto-accepted.
- **D-13:** open.er-api attribution (MON-12) sits beside the rate date wherever a converted figure's rate came from the fallback source, plus a permanent line in About/credits. Phase 1 ships the reusable component and its i18n key; Record's screens adopt it.

**Offline and queued writes**
- **D-14:** SYN-06 surface: a `useSyncStatus()` hook (online/offline, queued count, failed count, last-synced time), plus the prototype's status line (`offline · 3 changes queued` / `synced 2 minutes ago`) placed on the existing You screen. Optimistic rows carry a `pending` flag that Record renders.
- **D-15:** The persisted cache stays browsable for 30 days without a successful refetch, then discarded on next boot. The persister's `buster` is tied to the schema version. Cache encrypted at rest with its key in secure storage (SYN-07), reusing the LargeSecureStore pattern.
- **D-16:** The server is the authority on FX rates. A Postgres trigger or RPC stamps `rate`, `rate_date`, `rate_source` and the home amount from `fx_rates` (or the user's custom-currency rate) whenever a row is inserted or its date/amount/currency changes. The client cannot write a wrong rate. `engine/money/`'s conversion and rounding are mirrored in SQL, with a shared fixture set proving both give identical results.
- **D-17:** Offline foreign entries convert provisionally using the nearest rate in the local cache, marked `rate pending`, so totals still add up. On flush the server's stamp (D-16) replaces the provisional rate. Research must design how on-demand backfill (D-03) interacts with synchronous stamping: a trigger cannot block on an HTTP fetch.
- **D-18:** Updates are conditional on `expected_version`. On a mismatch the server copy wins, the cache refetches, and the rejected edit is kept as a visible "couldn't save — changed elsewhere" item. Must not be last-write-wins.
- **D-19:** A permanently rejected write (RLS, check constraint, missing parent) stops retrying. Its optimistic row is rolled back and it is parked in a failed list with its reason, exposed through `useSyncStatus()` and reported to error tracking (scrubbed per Phase 0 D-18).
- **D-20:** Per-row queue collapsing is deferred to Phase 10. Phase 1 replays paused mutations in order.

**Rounding and formatting**
- **D-21:** One rounding mode, half-up (away from zero), symmetric for negatives, defined once in `engine/money/`. Splits always use largest-remainder (MON-03), deterministic tie-break.
- **D-22:** Numbers and dates are formatted by the device region (expo-localization plus `Intl`), even while app copy is English-only.
- **D-23:** Amount style follows the prototype's rules, rendered through Intl. Symbol not code. Outflows use true minus `−` (U+2212). Whole amounts drop decimals unless **Show cents** is on. JPY never shows decimals; KWD shows three whenever decimals show. Ambiguous symbol gets code prefix (US$, CA$). Hide-balances masking is a later UI concern.
- **D-24:** Amount input parsing (MON-02) is strict and region-aware. Region's decimal separator is the decimal mark; grouping separators ignored. More fraction digits than the currency's exponent allows is rejected with a clear message, never silently rounded. Pure string-to-integer, no `parseFloat`, property-tested with fast-check.
- **D-25:** The Show cents preference is stored on the profile row alongside accent/font, with a local cache. The formatter takes it as a parameter; `engine/` never reads preferences.

**Schema scope and migration safety**
- **D-26:** Phase 1 creates the money tables in full shape: `accounts` and `transactions` with every money column (bigint minor units, currency, FX stamp columns, local date plus IANA time zone per MON-14, UUID PK without a server default, `version` using `bump_version()`, `household_id` plus RLS via `user_household_ids()`), plus custom currencies and FX hold/alert tables. Record adds categories/recurrence/UI columns through additive migrations only.
- **D-27:** FND-10 is a CI rule plus a PR checklist (expand/contract discipline). CI flags destructive DDL (dropping/renaming a column or table, narrowing a type, a new `NOT NULL` without a default, and similar) unless the migration carries a reviewed marker checked against `app_config.min_supported_version`. A PR template checklist covers what the rule cannot see.

### Claude's Discretion
- How post-switch home totals are computed (D-05): client-side cross-rate through the EUR base, or also storing a base-currency rate/amount on each row.
- Exact column names, enum and status values (`pending`/`synced`/`failed`, `rate pending`), and table names for custom currencies, FX holds and alerts.
- How "near" counts as confirmation for a held rate (D-12), and the precise staleness default (about 4 days) within the business-day intent.
- Mutation-key naming and `setMutationDefaults` layout, and the NetInfo to `onlineManager` wiring.
- The destructive-DDL detection approach for D-27 (regex/SQL parser, squawk, or similar).
- Whether open.er-api fallback lives inside the existing `fx-sync` function or in a sibling function.

### Deferred Ideas (OUT OF SCOPE)
- Per-row queue collapsing (insert+edit → insert, insert+delete → dropped): Phase 10 with SYN-03/04/05.
- Per-currency staleness tiers for volatile currencies (ARS, NGN, TRY): the override column exists (D-10); populating it is a later ops call.
- User-facing stale-rate notices beyond the visible publication date: not in v1 scope.
- Editable per-transaction rate override ("the rate my bank actually charged"): offered and not chosen.
- Old-client contract test (running the previous release's queries against the new schema in CI): stronger FND-10 option, not chosen for now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MON-01 | Integer minor units, no floats on any path | `engine/money/` arithmetic design (Code Examples), Pattern 7 already locked in ARCHITECTURE.md — bigint columns, branded `MinorUnits` type |
| MON-02 | Amount input parsed to minor units without `parseFloat` | Region-aware strict parser design (Code Examples), `Intl.NumberFormat.formatToParts` technique to derive locale separators |
| MON-03 | Largest-remainder split, shares sum exactly | `engine/split/allocate.ts` algorithm + fast-check property test pattern (Code Examples) |
| MON-04 | Home currency from supported list or custom currency | D-07/D-08 schema design; verified Frankfurter `/v2/currencies` metadata endpoint removes the need to hand-maintain currency names/symbols |
| MON-05 | FX rate recorded at write time | D-01–D-04 stamping-trigger design; SQL trigger pattern (Code Examples) |
| MON-06 | Daily Frankfurter v2 sync into own store, app reads only that store | Existing `fx-sync` function extended; verified live Frankfurter v2 per-currency date behavior |
| MON-07 | Rate's publication date visible wherever shown | Reusable `RateAttribution` component design (Don't Hand-Roll / Code Examples) |
| MON-08 | Client-generated UUID PK before write leaves device | Existing Pattern 2 (ARCHITECTURE.md); `expo-crypto`/`react-native-get-random-values` already installed |
| MON-09 | Integer `version`, server-incremented | Existing `bump_version()` trigger (already built, Phase 0), reused verbatim on `accounts`/`transactions` |
| MON-10 | Staleness alert on rates older than limit | D-09/D-10 design: pg_cron + business-day-aware check + Resend email (Code Examples, verified Resend API) |
| MON-11 | >10% day-on-day move held for second-source confirmation | D-11/D-12 quarantine-table design (Architecture Patterns, Code Examples) |
| MON-12 | open.er-api fallback with attribution | Verified live open.er-api endpoint/response shape + required attribution text (Sources) |
| MON-13 | ISO 4217 decimal places per currency, custom currency declares its own | Verified ISO 4217 exponent exception table (Code Examples) |
| MON-14 | Local date + IANA time zone stored per transaction | `Intl.DateTimeFormat().resolvedOptions().timeZone` capture pattern (Code Examples) |
| SYN-01 | Browse previously loaded data offline | TanStack Query persisted cache design (Architecture Patterns) |
| SYN-02 | Create/edit offline, flush on reconnect | Paused-mutations + `setMutationDefaults` + `resumePausedMutations` (verified TanStack docs, Code Examples) |
| SYN-06 | Offline/queued-count visibility | `useSyncStatus()` hook design (Architecture Patterns) |
| SYN-07 | Encrypted persisted cache, key in secure storage | Existing `LargeSecureStore` reused as the persister's storage backend (Don't Hand-Roll) |
| FND-10 | Migration compatibility check before deploy | Squawk CI-gate design (verified npm package + GitHub Action), PR checklist (Code Examples) |
| DSG-06 | Locale-aware amount/date formatting | `Intl`-based formatter design honoring D-22/D-23 (Code Examples) |
</phase_requirements>

## Summary

Money Core has three genuinely separate engineering problems that the CONTEXT.md decisions have already mostly resolved — this research fills in the *how*, verifies the external services actually behave as assumed, and flags the two places (backfill-vs-trigger, SQL/TS rounding mirror) where CONTEXT.md explicitly asked for a design rather than a decision.

**1. The engine (`engine/money/`, `engine/split/`).** Pure TypeScript, zero dependencies, hand-rolled per PROJECT.md. Money is `{ amount: MinorUnits, currency: CurrencyCode }` where `MinorUnits` is a branded integer. All arithmetic goes through named functions (`add`, `subtract`, `multiplyAndRound`, `allocate`) that internally round half-up-away-from-zero. Input parsing derives the locale's decimal/grouping characters from `Intl.NumberFormat(...).formatToParts(...)` rather than hardcoding `.`/`,`, then does pure string-to-integer conversion — never `parseFloat`. Splitting uses the standard largest-remainder method with a deterministic tie-break. `src/engine/money/` and `src/engine/split/` already exist as empty directories with an auto-configuring 100%-branch-coverage Jest threshold (`scripts/verify-gates.mjs`/`jest.config.js` already wired from Phase 0) — no test-infra setup needed beyond installing `fast-check`.

**2. Server-authoritative money and FX (Postgres).** `accounts` and `transactions` land in full shape per D-26, both versioned via the existing `bump_version()` trigger and RLS'd via the existing `user_household_ids()` helper. A `BEFORE INSERT OR UPDATE` trigger on `transactions` is the right mechanism for D-16's rate-stamping (not an RPC): it fires uniformly regardless of call site, mirrors the existing `bump_version` pattern, and can distinguish "date/currency changed → re-rate" from "amount-only edit → keep rate, recompute home amount" (D-04) by comparing `NEW`/`OLD`. The one real design gap CONTEXT.md flagged (D-17) — a trigger cannot block on an HTTP fetch for on-demand backfill (D-03) — is resolved by reusing the *same* `rate pending` mechanism D-17 already establishes for offline entries: if no rate exists at all for a currency before the needed date, the trigger stamps the row `rate_pending = true` with the nearest available rate as a provisional value (or null if none exists yet), and a `resolve-rate` Edge Function — called by the client immediately after a successful insert whenever the response comes back `rate_pending` — performs the Frankfurter historical fetch, backfills `fx_rates`, and re-stamps the row via a second conditional update. One mechanism, two triggers (offline-provisional and missing-history), same UI treatment.

**3. FX ingestion, fallback and monitoring.** Frankfurter v2's actual live behavior (verified this session) is more forgiving than assumed: requesting `/v2/rates?date=X` returns **each currency's own actual last-published date** in that row when a specific currency wasn't updated on the requested date — so "nearest earlier rate" (D-02) is largely Frankfurter's own behavior already, not something the app must reimplement, though the app-side lookup still needs a fallback for a currency with *no* row at or before the needed date (the backfill case above). Frankfurter's `/v2/currencies` endpoint (also verified live) returns full metadata — code, ISO number, name, symbol — for its 166 currencies, which removes the need to hand-maintain currency names/symbols for the D-08 picker; only the ISO 4217 minor-unit exponent (a ~20-currency exception table) needs to be embedded, since Frankfurter doesn't expose it. The plausibility check (MON-11) has to run *inside* the ingest step, comparing each incoming rate to the prior day's before upserting — not as a downstream job — so it belongs in `fx-sync` itself (or a shared module it and the open.er-api fallback both import), writing anything beyond ~10% day-on-day to a quarantine table instead of `fx_rates`. Staleness checking (MON-10) and held-rate auto-acceptance (D-12) are independent, simpler scheduled jobs on top of the same tables.

**4. The offline data layer.** None of `@tanstack/react-query`, its persister packages, or `@react-native-community/netinfo` are installed yet — this phase installs and wires them for the first time. The verified current API (`persistQueryClient`/`PersistQueryClientProvider` + `queryClient.setMutationDefaults(mutationKey, { mutationFn })` + `queryClient.resumePausedMutations()` on reconnect) is exactly the mechanism STACK.md already specified; the persister's storage backend should be `LargeSecureStore` (already built in Phase 0 for the Supabase session) rather than a second bespoke encryption layer, satisfying SYN-07 and D-15's `buster`/`maxAge` requirements together. `useSyncStatus()` reads TanStack Query's own mutation cache (`useMutationState`) plus `NetInfo`/`onlineManager`, requiring no separate queue-tracking data structure.

**Primary recommendation:** Build the engine first and fully isolated (it has zero dependency on anything else in this phase and the highest-value coverage gate), then the schema + stamping trigger + fixture-mirrored SQL rounding, then FX ingestion/fallback/monitoring, then the TanStack Query wiring, then formatting/locale utilities and the two visible surfaces (sync status line, rate attribution component) last, since both are thin consumers of everything built before them.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Money arithmetic, rounding, parsing (MON-01/02) | Engine (pure TS) | — | Must be I/O-free and 100%-branch-tested; no calling layer may reimplement it |
| Largest-remainder split (MON-03) | Engine (pure TS) | — | Same purity requirement; consumed later by Household (Phase 8) |
| Currency exponent/metadata | Engine (static data) | Database/Storage (`currencies` table synced from Frankfurter) | Exponent table is pure data, belongs in `engine/money/`; display metadata (name/symbol) is fetched/cached server-side, not hand-typed client-side |
| Accounts/transactions schema, versioning, RLS | Database/Storage | — | Postgres is the source of truth; RLS is the only authorization boundary (FND-12) |
| FX rate stamping on write (MON-05, D-01–D-04) | Database/Storage (trigger) | API/Backend (`resolve-rate` Edge Function for the missing-history case) | Trigger fires uniformly regardless of call site and can't be bypassed by a client; the one case it can't handle synchronously (no HTTP) hands off to an Edge Function |
| FX daily sync + fallback + plausibility hold (MON-06/11/12) | API/Backend (Edge Function) | Database/Storage (`fx_rates`, `fx_rate_holds` tables) | Ingest-time comparison against prior rates must happen before the upsert, i.e. in the function, not in a downstream trigger |
| Staleness alert, held-rate auto-accept (MON-10, D-12) | API/Backend (scheduled Edge Function or SQL function via pg_cron) | — | Independent of the write path; pure monitoring jobs |
| Persisted query cache, offline reads (SYN-01) | Client (TanStack Query + AsyncStorage via `LargeSecureStore`) | — | No server component; this is what makes stale-but-cached data survive app restarts |
| Write queue / paused mutations (SYN-02, MON-08/09) | Client (TanStack Query paused mutations) | Database/Storage (`version`-conditional update rejects stale writes) | Client owns queuing/replay; server owns the final authoritative accept/reject |
| Sync status surface (SYN-06) | Client (`useSyncStatus()` hook + You-screen line) | — | Pure read of TanStack Query's own mutation cache + NetInfo, no new storage |
| Locale-aware formatting (DSG-06, D-22/D-23) | Client (`Intl` + `expo-localization`) | Engine (pure formatter functions, given locale/preference as parameters) | Formatting logic can be pure and engine-testable if it never reads device/profile state itself — matches D-25's "engine never reads preferences" |
| Migration compatibility gate (FND-10) | CI/tooling (squawk + PR checklist) | Database/Storage (`app_config.min_supported_version` as the reference value) | Enforcement is a build-time gate, not a runtime component |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@tanstack/react-query` | `5.103.2` [VERIFIED: npm registry] | Persisted read cache, `onlineManager`, paused mutations | Already the locked STACK.md/PROJECT.md choice; version confirmed current, matches the 5.10x line STACK.md documented (5.102.8) |
| `@tanstack/query-async-storage-persister` | `5.103.2` [VERIFIED: npm registry] | AsyncStorage-backed persister for the query cache | Official TanStack persistence package; same major/minor line as react-query, keep them in lockstep |
| `@tanstack/react-query-persist-client` | `5.103.2` [VERIFIED: npm registry] | `PersistQueryClientProvider` React wiring | Official React integration for the persister above |
| `@react-native-community/netinfo` | `12.0.1` [VERIFIED: npm registry] | Feeds TanStack Query's `onlineManager` (not automatic on RN) | Standard, only maintained connectivity module for RN; required per STACK.md, confirmed current |
| `fast-check` | `4.10.2` [VERIFIED: npm registry] | Property-based tests for money round-trips, split invariants, parser round-trips | Already used in project plans; pure TS, no RN dependency, runs inside `engine/`'s no-I/O boundary |
| `@fast-check/jest` | `2.3.0` [VERIFIED: npm registry] | Jest integration for fast-check (`it.prop`) | Optional convenience wrapper, confirmed current |
| `expo-localization` | `57.0.2` [VERIFIED: npm registry, already installed] | Device locale/timezone/calendar for `Intl` formatting | Already in `package.json` dependencies; SDK-locked versioning, no install needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `squawk-cli` | `2.66.0` [VERIFIED: npm registry] | Postgres-parser-based migration linter (FND-10/D-27) | CI step against every new file in `supabase/migrations/`; flags destructive DDL (drop/rename column or table, type narrowing, `NOT NULL` without default) using the real Postgres grammar, not regex |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled ISO 4217 exponent table (~20 entries, static) | `currency-codes` npm package (`2.2.0` [VERIFIED: npm registry]) | The package gives the full ISO 4217 table including exponents and country mappings, saving hand-typing, but PROJECT.md's "hand-rolled, no third-party dependency" intent for `engine/money/` and the small size of the actual exception list (everything else defaults to 2) favor a static const — recommend hand-rolling, cross-checked against this package's data during implementation as a verification source only, not a runtime dependency |
| Squawk for destructive-DDL detection | Hand-written regex/AST check in a Node script | A regex check is fragile against valid-but-varied SQL syntax (`ALTER TABLE ... DROP COLUMN` vs `alter table ... drop column`, multi-statement files); squawk parses with the actual Postgres grammar and is purpose-built for exactly this CI use case — recommend squawk unless its Rust-binary install proves awkward in this CI's ubuntu-latest runner, in which case fall back to a scoped regex check on `DROP COLUMN\|DROP TABLE\|ALTER COLUMN.*TYPE\|SET NOT NULL` as a floor, not a replacement |
| Postgres trigger for FX stamping | A `security definer` RPC (`create_transaction(...)`) that every client call routes through | An RPC needs every INSERT/UPDATE call site (now and in later phases) to remember to call it instead of a plain `.insert()`/`.update()`; a trigger is transparent to the call site and mirrors the already-built `bump_version()` pattern — recommend the trigger; keep the RPC approach in mind only if the trigger's `NEW`/`OLD` comparison logic for D-04 proves awkward in practice |

**Installation:**
```bash
npm install @tanstack/react-query @tanstack/query-async-storage-persister @tanstack/react-query-persist-client @react-native-community/netinfo
npm install --save-dev fast-check @fast-check/jest squawk-cli
```

**Version verification:** confirmed live via `npm view <package> version` against the npm registry on 2026-09-24 (see table above). All match or slightly exceed STACK.md's September-2026 findings — no staleness detected.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENT (Expo app)                                                        │
│                                                                           │
│  User enters an amount ──▶ engine/money/parseAmount()  (pure, no I/O)    │
│         │                     region-aware, no parseFloat                │
│         ▼                                                                │
│  data/mutations/addTransaction.ts                                       │
│    - generates client UUID (crypto.randomUUID via expo-crypto)          │
│    - if offline or no cached rate for this currency+date: convert       │
│      provisionally using nearest cached rate, mark `rate_pending`       │
│    - applies optimistic row to TanStack Query cache (status: pending)   │
│    - queued via setMutationDefaults() + paused mutation                 │
│         │                                                                │
│         ▼                                                                │
│  TanStack Query persisted cache (AsyncStorage via LargeSecureStore)     │
│    - SYN-01: browsable offline, 30-day maxAge, schema-versioned buster  │
│    - SYN-02: mutation auto-pauses when NetInfo reports offline          │
│         │  (online, or reconnect fires resumePausedMutations)           │
│         ▼                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ DATABASE (Postgres / Supabase)                                          │
│                                                                           │
│  INSERT/UPDATE transactions                                              │
│         │                                                                │
│         ▼                                                                │
│  BEFORE INSERT/UPDATE trigger: stamp_fx_rate()                          │
│    - date or currency changed? ─▶ look up fx_rates for                  │
│      (currency pair, nearest rate_date <= local_date)                   │
│         │ found              │ not found (needs backfill)               │
│         ▼                    ▼                                          │
│    stamp rate/date/source   stamp rate_pending=true, provisional value  │
│    home_amount computed     (or null) — client calls resolve-rate next  │
│         │                    │                                          │
│         ▼                    ▼                                          │
│  BEFORE UPDATE trigger: bump_version() (existing, unchanged)            │
│         │                                                                │
│         ▼                                                                │
│  version-conditional accept/reject (expected_version check, D-18)       │
│         │                                                                │
│         ▼                                                                │
│  Row committed ──▶ client's paused mutation resolves ──▶ status: synced │
│                                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│ EDGE FUNCTIONS (Deno, scheduled by pg_cron or called by client)         │
│                                                                           │
│  fx-sync (daily, existing + extended)                                   │
│    Frankfurter v2 reachable? ──yes──▶ parse, plausibility-check each    │
│         │no                            row vs prior day, upsert clean   │
│         ▼                              rows into fx_rates, quarantine   │
│  open.er-api fallback                  >10% moves into fx_rate_holds   │
│    (per-base-currency latest only, no historical)                       │
│                                                                           │
│  resolve-rate (called by client after an insert comes back rate_pending)│
│    Frankfurter v2 historical fetch for the needed date ──▶ insert into │
│    fx_rates ──▶ re-stamp the transaction row (second conditional UPDATE)│
│                                                                           │
│  fx-monitor (daily, after fx-sync)                                      │
│    staleness check (business-day-aware limit) ──▶ Resend email          │
│    held-rate age check (>2 days unconfirmed) ──▶ auto-accept + email    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── engine/
│   ├── money/
│   │   ├── types.ts              # MinorUnits brand, Money, CurrencyCode
│   │   ├── arithmetic.ts         # add, subtract, multiplyAndRound, convert
│   │   ├── rounding.ts           # halfUpAwayFromZero — the one rounding fn
│   │   ├── currencyExponents.ts  # static ISO 4217 exception table (MON-13)
│   │   ├── parseAmount.ts        # region-aware string→MinorUnits (MON-02)
│   │   ├── formatAmount.ts       # MinorUnits→display string (DSG-06/D-23)
│   │   └── __tests__/
│   └── split/
│       ├── allocate.ts           # largest-remainder split (MON-03)
│       └── __tests__/
├── data/
│   ├── client.ts                 # QueryClient singleton + persister wiring
│   ├── onlineManager.ts          # NetInfo → TanStack onlineManager bridge
│   ├── queries/
│   │   ├── accounts.ts
│   │   └── transactions.ts
│   ├── mutations/
│   │   ├── addTransaction.ts     # setMutationDefaults registration
│   │   └── editTransaction.ts
│   ├── cache/
│   │   └── persister.ts          # LargeSecureStore-backed AsyncStorage persister
│   └── sync/
│       └── useSyncStatus.ts      # SYN-06 hook
├── services/
│   └── fx/
│       └── currencyPicker.ts     # reads currencies table (D-08)
└── ui/
    ├── RateAttribution.tsx       # MON-07/D-13 reusable component
    └── SyncStatusLine.tsx        # D-14 You-screen surface
supabase/
├── migrations/
│   ├── ..._accounts.sql
│   ├── ..._transactions.sql       # includes stamp_fx_rate trigger
│   ├── ..._custom_currencies.sql
│   ├── ..._currencies.sql         # Frankfurter metadata cache (D-08)
│   └── ..._fx_holds.sql           # fx_rate_holds quarantine table
├── functions/
│   ├── fx-sync/                   # extended: plausibility check, fallback
│   ├── resolve-rate/              # new: backfill + re-stamp (D-17 design)
│   └── fx-monitor/                # new: staleness + auto-accept (D-09/D-10/D-12)
└── tests/database/
    ├── 05_accounts_transactions.test.sql
    ├── 06_fx_stamping.test.sql
    └── 07_money_rounding_mirror.test.sql   # shared fixture cross-check (D-16)
```

### Pattern 1: Branded integer money type with centralized arithmetic

**What:** `MinorUnits` is a nominal `number` type; every operation that could introduce a float goes through a named function in `engine/money/arithmetic.ts`, never raw `+`/`-`/`*` on `.amount`.

**When to use:** Every money value anywhere in the app — engine, data layer, UI.

**Example:**
```typescript
// Source: ARCHITECTURE.md Pattern 7 (already locked), adapted for hand-rolled build
export type MinorUnits = number & { readonly __brand: 'MinorUnits' };
export type CurrencyCode = string & { readonly __currencyBrand: unique symbol };

export interface Money {
  readonly amount: MinorUnits;
  readonly currency: CurrencyCode;
}

export function minorUnits(n: number): MinorUnits {
  if (!Number.isInteger(n)) throw new Error('Money amounts must be integers');
  return n as MinorUnits;
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('Cannot add different currencies');
  return { amount: minorUnits(a.amount + b.amount), currency: a.currency };
}

// The only place division/rounding happens. Half-up, away from zero, symmetric (D-21).
export function halfUpAwayFromZero(exact: number): MinorUnits {
  const rounded = exact >= 0 ? Math.floor(exact + 0.5) : Math.ceil(exact - 0.5);
  return minorUnits(rounded);
}
```

### Pattern 2: Region-aware, parseFloat-free amount parsing

**What:** Derive the locale's actual decimal and grouping separator characters from `Intl.NumberFormat`, then do pure string manipulation — never hand the string to `parseFloat`/`Number()`.

**When to use:** Every amount input field (MON-02, D-24).

**Example:**
```typescript
// Source: standard Intl.NumberFormat.formatToParts technique (MDN), applied to MON-02/D-24
function localeSeparators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  return {
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
  };
}

export function parseAmount(
  raw: string,
  locale: string,
  currencyExponent: number
): { ok: true; value: MinorUnits } | { ok: false; error: 'too-many-fraction-digits' | 'invalid' } {
  const { decimal, group } = localeSeparators(locale);
  const stripped = raw.split(group).join('').trim();
  const [wholePart, fractionPart = ''] = stripped.split(decimal);

  if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fractionPart)) return { ok: false, error: 'invalid' };
  if (fractionPart.length > currencyExponent) return { ok: false, error: 'too-many-fraction-digits' };

  const paddedFraction = fractionPart.padEnd(currencyExponent, '0');
  const digits = `${wholePart || '0'}${paddedFraction}`;
  return { ok: true, value: minorUnits(parseInt(digits, 10)) };
}
```
**Note:** `parseInt` on a pure-digit string is not `parseFloat` and introduces no float arithmetic — the entire conversion is string manipulation until the final integer parse. `fast-check` should property-test this against generated locale/value pairs, including round-tripping through `formatAmount`.

### Pattern 3: Largest-remainder split with deterministic tie-break

**What:** Compute exact rational shares, floor to minor units, distribute the remainder one unit at a time to the largest fractional remainders.

**When to use:** Any household/member split (MON-03); reused by Phase 8 settlements.

**Example:**
```typescript
// Source: ARCHITECTURE.md Pattern 7, standard largest-remainder method
export function allocate(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  const sumWeights = weights.reduce((s, w) => s + w, 0);
  const exact = weights.map((w) => (total * w) / sumWeights);
  const floors = exact.map((e) => Math.floor(e));
  const remainders = exact.map((e, i) => e - floors[i]);
  let leftover = total - floors.reduce((s, f) => s + f, 0);

  // Deterministic tie-break: stable sort by remainder desc, then by original index
  // (household-member join order) so identical inputs always produce identical output.
  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r || a.i - b.i);

  const shares = [...floors];
  for (let k = 0; k < leftover; k++) shares[order[k].i] += 1;
  return shares.map((s) => minorUnits(s));
}
```
**Property test invariant:** `sum(allocate(total, weights)) === total` for every generated `total`/`weights` pair — this is the single fast-check property that matters most for MON-03.

### Pattern 4: FX-stamping trigger with re-rate-on-date-change

**What:** A `BEFORE INSERT OR UPDATE` trigger compares `NEW` to `OLD` to decide whether to re-look-up the rate (date or currency changed, D-04) or just recompute the home amount (amount-only edit).

**When to use:** `transactions` table writes (MON-05, D-01–D-04, D-16).

**Example (design, not yet implemented — confidence MEDIUM, original synthesis grounded in the existing `bump_version()` pattern in `20260922000100_household_of_one.sql`):**
```sql
create or replace function public.stamp_fx_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  needs_rerate boolean;
  found_rate public.fx_rates%rowtype;
begin
  needs_rerate := (tg_op = 'INSERT')
    or (new.local_date is distinct from old.local_date)
    or (new.original_currency is distinct from old.original_currency);

  if new.original_currency = new.home_currency_at_write then
    new.rate := 1; new.rate_date := new.local_date; new.rate_source := 'same-currency';
    new.home_amount := new.original_amount;
    new.rate_pending := false;
    return new;
  end if;

  if needs_rerate then
    select * into found_rate from public.fx_rates
      where quote = new.original_currency and rate_date <= new.local_date
      order by rate_date desc limit 1; -- nearest earlier, per D-02

    if found_rate.rate is null then
      new.rate := null; new.rate_source := null; new.rate_date := null;
      new.rate_pending := true; -- D-17: needs resolve-rate backfill
      new.home_amount := new.original_amount; -- best-effort provisional (Claude's Discretion: 0 vs original)
    else
      new.rate := found_rate.rate; new.rate_date := found_rate.rate_date; new.rate_source := found_rate.source;
      new.rate_pending := false;
      new.home_amount := (new.original_amount * found_rate.rate)::bigint; -- SQL mirror of engine/money rounding, D-16
    end if;
  else
    -- amount-only edit: keep stored rate, recompute home_amount only
    new.home_amount := (new.original_amount * new.rate)::bigint;
  end if;

  return new;
end;
$$;

create trigger stamp_fx_rate before insert or update on public.transactions
  for each row execute function public.stamp_fx_rate();
```
**Open design question this leaves:** the exact rounding cast (`::bigint` truncates; the engine's `halfUpAwayFromZero` does not) must be reimplemented as a SQL function, not assumed equivalent — see Common Pitfalls and Open Questions.

### Pattern 5: TanStack Query persisted cache + paused-mutation write queue

**What:** `PersistQueryClientProvider` wraps the app; `queryClient.setMutationDefaults` registers a resumable mutation function per mutation key; `onSuccess` (cache restored) calls `resumePausedMutations()`.

**When to use:** All of SYN-01/SYN-02/SYN-06/SYN-07.

**Example:**
```tsx
// Source: TanStack Query v5 official docs (tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient), verified live 2026-09-24
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { LargeSecureStore } from '@/services/supabase/largeSecureStore'; // reused, SYN-07

const queryClient = new QueryClient();
const persister = createAsyncStoragePersister({ storage: new LargeSecureStore() as unknown as Storage });

// SCHEMA_VERSION bumps whenever the cached shape changes — old caches are discarded, not
// deserialized into a shape the app no longer expects (D-15).
const SCHEMA_VERSION = '1';

queryClient.setMutationDefaults(['transactions', 'add'], {
  mutationFn: addTransactionToServer, // the actual supabase.from('transactions').insert(...)
});

<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 30, buster: SCHEMA_VERSION }}
  onSuccess={() => {
    // Cache has been restored; now it's safe to let paused mutations replay (order preserved).
    void queryClient.resumePausedMutations();
  }}
>
  <App />
</PersistQueryClientProvider>;
```
**Gotcha verified from docs:** "when persisting to an external storage, only the state of mutations is persisted, as functions cannot be serialized" — `setMutationDefaults` must be called (synchronously, before the provider mounts) for every mutation key that might be paused, or a paused mutation restored from disk has no function to resume with. MEDIUM confidence on the exact default of `dehydrateOptions.shouldDehydrateMutation` (docs excerpt fetched this session did not state it explicitly) — verify at implementation time that paused mutations are actually included in dehydration by default, or set `dehydrateOptions: { shouldDehydrateMutation: () => true }` explicitly to be safe.

### Pattern 6: `useSyncStatus()` from TanStack Query's own state — no parallel bookkeeping

**What:** Queued/failed counts come from `useMutationState()` filtering by `status`, not a separately maintained counter.

**When to use:** SYN-06.

**Example:**
```typescript
import { useMutationState, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected && state.isInternetReachable)))
);

export function useSyncStatus() {
  const isOnline = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), onlineManager.isOnline);
  const queued = useMutationState({ filters: { status: 'pending' } }).length;
  const failed = useMutationState({ filters: { status: 'error' } }).length; // D-19: permanently rejected
  return { isOnline, queued, failed };
}
```
**Gotcha verified across sources (STACK.md):** `onlineManager`'s NetInfo wiring is not automatic on React Native — omitting `onlineManager.setEventListener` silently leaves TanStack Query assuming "always online," which would make SYN-01/02/06 appear to work in a simulator (usually online) and fail on a real device in airplane mode.

### Anti-Patterns to Avoid
- **Reimplementing FX conversion or rounding in a screen or a mutation function:** any arithmetic outside `engine/money/` (client) or the single mirrored SQL function (server) is the exact bug MON-13's "prototype hardcodes 2 decimals" note exists to prevent — enforce via the existing dual lint gate, which already covers this for the client side.
- **Trusting the client's computed home_amount:** D-16 is explicit that the server is authoritative; a client-computed rate must never be accepted by the trigger — the trigger recomputes `home_amount` from its own `fx_rates` lookup regardless of what the client sent, and should not read a client-supplied `rate` column at all except to detect an offline `rate_pending` provisional row.
- **Treating open.er-api as a historical-backfill source:** verified live, open.er-api's free endpoint (`/v6/latest/{BASE}`) has no historical/date-specific mode — only Frankfurter v2 supports the D-03 backfill; open.er-api is latest-only fallback for the daily sync (MON-12), never for backfill.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Offline write queue / retry / replay-on-reconnect | A custom AsyncStorage-backed FIFO queue with manual retry logic | TanStack Query paused mutations + `setMutationDefaults` + `resumePausedMutations` | First-party, actively maintained, exactly matches "cached reads, queued writes flushed on reconnect" — a hand-rolled queue duplicates this for no benefit and is the thing STACK.md explicitly warns against re-deriving |
| Query cache persistence + encryption | A bespoke AsyncStorage read/write wrapper for cached query data | `createAsyncStoragePersister` with `LargeSecureStore` as its storage backend | `LargeSecureStore` (AES-CTR, key in SecureStore, ciphertext in AsyncStorage) already exists from Phase 0 for the Supabase session — reusing it for the query cache satisfies SYN-07 with zero new crypto code |
| Currency display metadata (name, symbol) for ~166 currencies | A hand-typed `currencies.ts` const | Frankfurter v2's `/v2/currencies` endpoint, synced into a `currencies` table alongside the existing `fx_rates` sync | Verified live this session: the endpoint returns `{iso_code, iso_numeric, name, symbol, start_date, end_date}` for all 166 currencies it serves — hand-typing this is pure transcription risk for zero benefit |
| Destructive-DDL detection for FND-10 | A regex scan of migration SQL text | `squawk-cli`, parsed against the real Postgres grammar | Regex against SQL syntax variance (case, whitespace, multi-statement files, `IF EXISTS` clauses) is a well-known false-negative trap; squawk is purpose-built and has a maintained GitHub Action |
| Business-day-aware staleness calculation | Custom date-arithmetic accounting for weekends | A simple weekday-count function is still appropriate here (no market-holiday calendar library needed for a ~4-day default) — but do not build a full holiday calendar; the ~4-day default already absorbs one holiday per D-10, and per-currency tiers are explicitly deferred | The precision a holiday-calendar library would add is explicitly out of scope (Deferred Ideas: per-currency staleness tiers) |

**Key insight:** every "don't hand-roll" here already has a first-party or already-built-in-this-repo answer — this phase should add remarkably little genuinely new client-side infrastructure beyond the engine itself; the leverage is in wiring existing pieces (TanStack Query's documented persistence pattern, Phase 0's `LargeSecureStore`/`bump_version()`, Frankfurter's own metadata endpoint) correctly, not in building new mechanisms.

## Common Pitfalls

### Pitfall 1: SQL and TypeScript rounding silently diverge
**What goes wrong:** `engine/money/`'s `halfUpAwayFromZero` and the trigger's `::bigint` cast (which truncates toward zero, not half-up) round differently on exactly the inputs that matter — `.5` boundaries — producing a home_amount from the server that doesn't match what the client would have computed for the same inputs.
**Why it happens:** Postgres's numeric-to-bigint cast is truncation, not rounding; `round()` in Postgres also defaults to a banker's-rounding-adjacent behavior depending on type, which is not what D-21 specifies.
**How to avoid:** Write an explicit SQL function `half_up_away_from_zero(numeric) returns bigint` mirroring the TypeScript function exactly, and drive both from the same fixture table (D-16's "shared fixture set"). Concretely: keep one canonical fixtures file (e.g. `supabase/tests/fixtures/money-rounding-cases.md` or a small JSON checked into both `src/engine/money/__tests__/` and `supabase/tests/database/`) with input/expected-output pairs, referenced by both the Jest test and the pgTAP test, with a code comment in each pointing at the other so a future edit to one is caught by review.
**Warning signs:** A pgTAP test and a Jest test computing the same `.5`-boundary case disagree; home_amount totals off by exactly 1 minor unit on specific transactions.

### Pitfall 2: `rate_pending` provisional value never gets resolved
**What goes wrong:** D-17's design (provisional rate now, real stamp on flush) requires *something* to call `resolve-rate` for the missing-history case — if the client only calls it after an online insert and the insert itself happened while offline, the row can sit `rate_pending` forever with no trigger to fix it.
**Why it happens:** The natural client code path is "call resolve-rate right after insert succeeds," but an offline insert doesn't "succeed" synchronously — it goes into the paused-mutation queue and only actually reaches the server on flush.
**How to avoid:** Trigger the `resolve-rate` call from the *mutation's own success handler* (which fires whether the mutation ran immediately or was resumed from the paused queue on reconnect), not from the UI code that initiated the insert — `onSuccess` in `setMutationDefaults` is the right place, since TanStack Query calls it exactly once per mutation regardless of whether it paused first.
**Warning signs:** Transactions with old historical dates permanently stuck showing "rate pending" in the UI with no background process ever clearing it.

### Pitfall 3: `useMutationState` counts survive across app restarts incorrectly
**What goes wrong:** If the query cache is persisted (SYN-01) but paused mutations aren't correctly re-registered via `setMutationDefaults` before `resumePausedMutations()` runs, mutations restored from disk can silently fail to resume (no mutationFn to call) while `useSyncStatus()` still reports them as "queued" forever, or they vanish without ever flushing — contradicting D-19's "a user never silently loses an entry."
**Why it happens:** `setMutationDefaults` calls must happen before the persisted client is hydrated/before mutations attempt to resume; if the wiring order is wrong (e.g., defaults registered inside a component that mounts after `PersistQueryClientProvider`'s `onSuccess` already fired), the resume silently no-ops.
**How to avoid:** Register all `setMutationDefaults` calls at module scope in `data/client.ts` (imported before the provider tree renders), not inside a component's render/effect.
**Warning signs:** A queued write from a previous session that never appears as synced or failed after reconnecting.

### Pitfall 4: Frankfurter's per-currency date field is not the requested date
**What goes wrong:** Code that assumes every row in a Frankfurter v2 response shares the same `date` (e.g., using the response's *first* row's date as "the" rate date for the whole batch, which the existing `fx-sync/index.ts` currently does via `rows[0]?.date` in its success-log response) will misreport the actual publication date for currencies that didn't update on the requested day.
**Why it happens:** Verified live this session: requesting `/v2/rates?date=2026-09-20&base=EUR` returns `"date":"2026-09-20"` for most currencies but `"date":"2026-09-18"` for ones that hadn't published since Friday — the array is heterogeneous, not uniform.
**How to avoid:** Already correct at the row level — `parseFrankfurterRates` in the existing `parse.ts` stores each row's own `date` field, and the trigger's lookup (`order by rate_date desc limit 1`) reads per-currency, per-row dates from `fx_rates` — this is inherently safe. The only place to double-check is any *logging or monitoring* code (like the existing `index.ts`'s response body `date: rows[0]?.date`) that summarizes "the sync date" as a single value — that value describes only the first currency in the batch, not the sync as a whole, and should not be relied on for staleness calculations. MON-10's staleness check must query `max(rate_date)` per currency independently, never assume one batch date covers all currencies.
**Warning signs:** A staleness alert that never fires for a currency that has, in fact, gone stale, because the check used a single "last sync ran on date X" flag instead of per-currency `max(rate_date)`.

### Pitfall 5: `parseInt` on an empty or all-zero fraction string
**What goes wrong:** `parseAmount`'s `padEnd(currencyExponent, '0')` on an empty fraction and an empty whole part (user enters just "." or an empty string) can produce `digits = '00'` or similar, silently parsing to a valid zero rather than rejecting an invalid entry.
**Why it happens:** The string-manipulation approach in Pattern 2 above is safe for well-formed digit strings but needs an explicit non-empty/format check *before* the numeric parse, not just a digit-shape regex on each half independently (both halves can independently be all-digits and empty, which passes the regex).
**How to avoid:** Reject when `wholePart === '' && fractionPart === ''`, and reject any input containing a second decimal separator (the split-on-`decimal` approach already produces more than 2 array elements in that case — check `stripped.split(decimal).length <= 2` explicitly, or it silently drops extra `.`s). Cover both with fast-check generators that include empty strings, multiple separators, and separator-only input.
**Warning signs:** A user typing just the decimal key produces a silently-accepted "$0.00" entry instead of a validation error.

## Code Examples

### ISO 4217 minor-unit exception table (MON-13)
```typescript
// Source: ISO 4217 official standard, cross-verified against Wikipedia's ISO 4217 table and
// web search results 2026-09-24 [CITED: en.wikipedia.org/wiki/ISO_4217]. Confidence: MEDIUM —
// this transcription should be spot-checked against Frankfurter's 166-currency list during
// implementation (some 0-exponent currencies below, e.g. XAF/XOF/XPF/VUV/UYI, may not appear
// in Frankfurter's set at all and can be omitted; conversely confirm none are missing).
const EXPONENT_EXCEPTIONS: Readonly<Record<string, number>> = {
  // Zero decimal places
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three decimal places
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Four decimal places
  CLF: 4, UYW: 4,
};

export function currencyExponent(code: string): number {
  return EXPONENT_EXCEPTIONS[code] ?? 2; // ISO 4217 default
}
```

### Region-aware amount formatting honoring D-23
```typescript
// Source: standard Intl.NumberFormat currency formatting, adapted for D-23's specific rules
// (true minus sign, symbol not code, ambiguous-symbol code prefix, show-cents toggle)
const AMBIGUOUS_SYMBOL_CURRENCIES = new Set(['USD', 'CAD', 'AUD', 'NZD', 'HKD', 'SGD', 'MXN']); // US$, CA$, etc.

export function formatAmount(
  money: Money,
  locale: string,
  { showCents }: { showCents: boolean }
): string {
  const exponent = currencyExponent(money.currency);
  const showDecimals = showCents && exponent > 0;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    currencyDisplay: AMBIGUOUS_SYMBOL_CURRENCIES.has(money.currency) ? 'narrowSymbol' : 'symbol',
    minimumFractionDigits: showDecimals ? exponent : 0,
    maximumFractionDigits: showDecimals ? exponent : 0,
  });
  const majorUnits = money.amount / Math.pow(10, exponent); // display-only division, never used for storage
  return formatter.format(majorUnits).replace('-', '−'); // D-23: true minus, not hyphen
}
```
**Note:** `AMBIGUOUS_SYMBOL_CURRENCIES` + `narrowSymbol` is a reasonable starting approximation for "an ambiguous symbol gets its code prefix (US$, CA$)" but `Intl`'s `narrowSymbol` behavior varies by ICU data version bundled with Hermes — verify actual rendered output for USD/CAD/AUD on-device during implementation rather than trusting this in isolation; flag as MEDIUM confidence.

### Local date + IANA time zone capture (MON-14)
```typescript
// Source: standard Intl API, universally supported in Hermes/RN's JS engine
export function captureLocalDateAndZone(instant: Date = new Date()): { localDate: string; timeZone: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. 'America/Vancouver'
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant); // en-CA locale = YYYY-MM-DD
  return { localDate, timeZone };
}
```

### Squawk CI step (FND-10/D-27)
```yaml
# Source: squawk-cli npm package + step-security/squawk-action, verified 2026-09-24
- name: Lint migrations for destructive DDL (FND-10)
  run: npx squawk-cli --exclude-files='**/seed.sql' supabase/migrations/*.sql
```
```sql
-- FND-10 escape hatch: a migration that IS destructive but is safe because
-- app_config.min_supported_version already excludes any client that reads the old shape.
-- squawk-ignore rule-name
-- contract-ok: min_version >= 1.3.0
alter table public.transactions drop column legacy_note;
```
**Note:** squawk's own ignore syntax (`-- squawk-ignore rule-name`) silences the linter; the `-- contract-ok: min_version >= X` marker is a project-specific convention layered on top that a small companion script should check against `app_config.min_supported_version` at CI time (parse the marker, compare semver, fail if the migration ships before the app version it depends on is actually the floor) — squawk alone does not understand this project's versioning scheme.

### open.er-api fallback parser (MON-12), mirroring the existing Frankfurter parser
```typescript
// Source: verified live response shape from open.er-api.com/v6/latest/{BASE}, 2026-09-24
// [VERIFIED: open.er-api.com docs + live fetch]. Required attribution text is exact —
// do not paraphrase: '<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>'
export const OPEN_ER_API_URL = 'https://open.er-api.com/v6/latest';
export const OPEN_ER_API_ATTRIBUTION = 'Rates By Exchange Rate API'; // pair with a link to exchangerate-api.com

interface OpenErApiResponse {
  result: string;
  base_code: string;
  time_last_update_utc: string;
  rates: Record<string, number>;
}

export function parseOpenErApiRates(json: unknown, requestedDate: string): FxRow[] {
  const body = json as OpenErApiResponse;
  if (body.result !== 'success') throw new Error(`open.er-api returned result=${body.result}`);
  return Object.entries(body.rates)
    .filter(([quote]) => quote !== body.base_code)
    .map(([quote, rate]) => ({ base: body.base_code, quote, rate: String(rate), date: requestedDate }));
}
```
**Note:** open.er-api has no historical endpoint on the free tier (verified) — `requestedDate` here should always be "today," never used for backfill.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `home_amount` provisional value during `rate_pending` should be `original_amount` cast as if rate=1, not zero or null | Pattern 4 code example | If the intended UX is to show "—" rather than a misleadingly-precise wrong total for a pending-rate row, this needs to be an explicit product decision, not an engineering default — flag for discuss-phase or planner judgment |
| A2 | "Near" confirmation threshold for a held rate (D-12) is roughly 3% of the held value | Architecture Patterns / Summary | If the actual intended threshold is tighter or looser, the auto-confirm logic either confirms bad rates too eagerly or never confirms good ones, always falling through to the 2-day auto-accept regardless |
| A3 | Staleness default is exactly 4 calendar days (business-day aware = weekend + 1 holiday) | Standard Stack / Summary | Off by one day either direction changes how aggressively the operator gets emailed; D-10 explicitly leaves the exact number to research/discretion within "about 4" |
| A4 | The ISO 4217 exponent exception table (Code Examples) is complete and accurate for every currency Frankfurter v2 actually serves | Code Examples | A missed exception (e.g., a currency this table defaults to 2 decimals but ISO 4217 says 0 or 3) directly corrupts amounts by 10x/100x — this is exactly the bug MON-13 exists to prevent, so this table must be spot-checked against an authoritative source (or the `currency-codes` npm package's data) during implementation, not trusted from this research alone |
| A5 | `dehydrateOptions.shouldDehydrateMutation` defaults to including paused mutations in TanStack Query v5's persister | Pattern 5 | If the default excludes them, paused mutations silently do not survive an app restart — contradicts SYN-02's "flush automatically on reconnect" for the force-quit-while-offline case; must be verified with a real dehydrate/rehydrate test during implementation, not assumed from docs alone |
| A6 | A `BEFORE INSERT OR UPDATE` trigger (not a `security definer` RPC) is the right mechanism for FX stamping | Standard Stack (Alternatives Considered), Pattern 4 | This is an architectural recommendation reasoned from the existing `bump_version()` precedent, not sourced from a documented FincWin-specific decision; if trigger `NEW`/`OLD` comparison proves too limited for D-04's re-rate-on-date-change logic (e.g. needing to call out to `resolve-rate` synchronously in some edge case), the RPC alternative should be revisited |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

1. **Exact mechanism for the missing-history backfill (D-17's explicit ask)**
   - What we know: a trigger cannot synchronously call Frankfurter's historical endpoint; the client must trigger a follow-up `resolve-rate` call after any write that comes back `rate_pending`.
   - What's unclear: whether `resolve-rate` should be a plain Edge Function invoked once per affected row (simple, but N calls for N old transactions entered in a batch/CSV-import-like flow) or should support batching multiple pending row IDs in one call (more efficient, more complex). Phase 1 has no CSV import yet (that's Phase 2), so single-row is likely sufficient for now.
   - RESOLVED (plan 01-11): single-row `resolve-rate`. Recommendation: build single-row `resolve-rate` for Phase 1; flag batching as a Phase 2 (CSV import) follow-up when the volume of pending rows in one flush becomes realistic.

2. **Whether `fx-sync` and the open.er-api fallback should be one function or two (explicitly Claude's Discretion in CONTEXT.md)**
   - What we know: both need to write into the same `fx_rates` table with a different `source` value, and the plausibility check needs to run against whichever source is being ingested.
   - What's unclear: whether Supabase Edge Function cold-start cost or code-sharing is a meaningful factor at this scale (a single household's worth of traffic, one daily cron trigger).
   - RESOLVED (plan 01-08): one `fx-sync` function with an internal fallback branch. Recommendation: one function (`fx-sync`) that tries Frankfurter first and falls back to open.er-api internally, sharing the plausibility-check logic as one internal function called from both branches — simpler deployment, one cron job, and the existing `fx-sync` function is already the natural home per its own file header comment ("Extend it (or add a sibling) for the fallback").

3. **SQL/TypeScript rounding fixture format (D-16's "shared fixture set")**
   - What we know: both a Jest test and a pgTAP test need to assert the same input/output pairs.
   - What's unclear: the exact file format that both a Node test runner and a `psql`-invoked pgTAP script can consume without a shared parser. A JSON file is easy for Jest (`JSON.parse`) but pgTAP/plpgsql has no native JSON-file-import ergonomics in a `.sql` test file without extra tooling.
   - RESOLVED (plans 01-01, 01-05): canonical JSON fixture `supabase/tests/fixtures/money-conversion-cases.json` consumed by Jest, with a generated pgTAP mirror checked in CI. Original recommendation: keep the canonical case list as a small TypeScript const array (`fixtures/moneyRoundingCases.ts`) exported for Jest, and hand-transcribe the same cases into the pgTAP test's literal `INSERT`/`SELECT` statements with a comment referencing the TS file and its case count — a lightweight CI check (or just PR review discipline) that the two case counts match is enough given the fixture set is small (a few dozen boundary cases, not hundreds).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Supabase CLI | Local migration development, `supabase db push`, `supabase test db` | ✓ | 2.117.0 [VERIFIED] | — |
| Docker | `supabase db start` (local Postgres for pgTAP tests, matches existing `rls` CI job) | ✓ | 29.7.2 [VERIFIED] | — |
| Node.js | Build tooling, Jest, scripts | ✓ | 24.15.0 [VERIFIED] | — |
| Frankfurter v2 API | Daily FX sync, historical backfill, currency metadata | ✓ (network-reachable, verified live this session) | v2, no auth required | open.er-api (MON-12, already the designed fallback) |
| open.er-api | FX fallback when Frankfurter unreachable | ✓ (network-reachable, verified live this session) | v6 | None needed — this is itself the fallback; if both are down, staleness alert (MON-10) is the safety net |
| Resend API | Operator staleness/held-rate emails (D-09/D-12) | ✓ (domain verified, provisioned per `docs/dependency-register.md`) | REST API, no SDK needed | — |
| `squawk-cli` | FND-10 CI gate | Not yet installed, but confirmed present on npm registry (`2.66.0`) | — | Plain regex CI check on migration diffs if the binary proves awkward on `ubuntu-latest` |

**Missing dependencies with no fallback:** none — every external dependency for this phase is either already provisioned or has a designed fallback within the phase's own scope.

**Missing dependencies with fallback:** `squawk-cli` is not yet an installed devDependency; installation is part of this phase's own work, not a blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `~29.7.0` (`jest-expo` preset, already configured) for TS; pgTAP (already configured, invoked via Supabase CLI) for SQL |
| Config file | `jest.config.js` (existing — `src/engine/money/` and `src/engine/split/` already auto-enable 100% branch-coverage thresholds the moment source files land, no config change needed) |
| Quick run command | `npx jest src/engine/money src/engine/split --silent` |
| Full suite command | `npm run test:coverage && npm run verify:gates && npm run supabase:preflight && supabase db start && supabase test db` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MON-01 | No float arithmetic escapes `engine/money/`; every arithmetic function returns an integer | unit + property | `npx jest src/engine/money/arithmetic.test.ts` | ❌ Wave 0 |
| MON-02 | Amount parsing never calls `parseFloat`; round-trips correctly per locale | property | `npx jest src/engine/money/parseAmount.test.ts` | ❌ Wave 0 |
| MON-03 | `sum(allocate(total, weights)) === total` for any generated input | property | `npx jest src/engine/split/allocate.test.ts` | ❌ Wave 0 |
| MON-04 | Custom currency insert respects user-declared exponent and reference currency | pgTAP | `supabase test db` (`07_custom_currencies.test.sql`) | ❌ Wave 0 |
| MON-05 | Foreign transaction stamps rate/date/source/home_amount on insert | pgTAP | `supabase test db` (`06_fx_stamping.test.sql`) | ❌ Wave 0 |
| MON-06 | `fx-sync` writes only from Frankfurter/open.er-api parsers, never a live client-side call | unit + grep | `npx jest supabase/functions/fx-sync` + `! grep -rn "frankfurter\|open.er-api" src/` | parse tests exist ✓ (`parse.test.ts`), fallback parser ❌ Wave 0 |
| MON-07 | `RateAttribution` renders the stamped `rate_date` | component | `npx jest src/ui/RateAttribution.test.tsx` | ❌ Wave 0 |
| MON-08 | Client generates the UUID before the mutation is enqueued | unit | `npx jest src/data/mutations/addTransaction.test.ts` | ❌ Wave 0 |
| MON-09 | `version` increments on every update, via the existing `bump_version()` trigger applied to `transactions`/`accounts` | pgTAP | `supabase test db` (`05_accounts_transactions.test.sql`) | ❌ Wave 0 |
| MON-10 | Staleness check flags a currency whose `max(rate_date)` exceeds the business-day-aware limit | unit (pure calc) + integration (Edge Function, mocked Resend) | `npx jest supabase/functions/fx-monitor` | ❌ Wave 0 |
| MON-11 | A >10% day-on-day move lands in `fx_rate_holds`, not `fx_rates` | unit + pgTAP | `npx jest supabase/functions/fx-sync/plausibility.test.ts` + `supabase test db` | ❌ Wave 0 |
| MON-12 | open.er-api fallback fires when Frankfurter is unreachable, attribution shown | unit + component | `npx jest supabase/functions/fx-sync/openErApi.test.ts` + `npx jest src/ui/RateAttribution.test.tsx` | ❌ Wave 0 |
| MON-13 | `currencyExponent()` returns the correct value for every listed exception and defaults to 2 otherwise | unit (exhaustive table) | `npx jest src/engine/money/currencyExponents.test.ts` | ❌ Wave 0 |
| MON-14 | `captureLocalDateAndZone` keeps a 23:30-local entry in the local calendar day across a simulated timezone | unit | `npx jest src/engine/money/localDate.test.ts` | ❌ Wave 0 |
| SYN-01 | Cached reads resolve with NetInfo mocked offline | integration | `npx jest src/data/client.test.tsx` | ❌ Wave 0 |
| SYN-02 | A mutation made while offline queues, then flushes on a simulated reconnect | integration | `npx jest src/data/mutations/addTransaction.offline.test.tsx` | ❌ Wave 0 |
| SYN-06 | `useSyncStatus()` reports correct queued/failed/online state | unit | `npx jest src/data/sync/useSyncStatus.test.ts` | ❌ Wave 0 |
| SYN-07 | Persister storage is never plaintext in AsyncStorage (reuses existing `LargeSecureStore` coverage) | unit | `npx jest src/services/supabase/largeSecureStore.test.ts` (existing) + `npx jest src/data/cache/persister.test.ts` | persister test ❌ Wave 0 |
| FND-10 | A destructive-DDL probe migration fails the squawk CI step | CI probe (mirrors `scripts/verify-gates.mjs` pattern) | `npx squawk-cli supabase/migrations/*.sql` | ❌ Wave 0 |
| DSG-06 | `formatAmount`/date formatting produce correct output across sample locales (en-US, en-GB, de-DE, ja-JP, ar-KW) | unit | `npx jest src/engine/money/formatAmount.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest <touched-dir> --silent` (fast, scoped)
- **Per wave merge:** `npm run test:coverage && npm run verify:gates` (client) + `supabase test db` (SQL)
- **Phase gate:** Full suite green (`npm run lint && npm run typecheck && npm run depcruise && npm run test:coverage && npm run verify:gates && npx squawk-cli supabase/migrations/*.sql && supabase test db`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/engine/money/*` — no source or test files yet (directory exists, empty)
- [ ] `src/engine/split/*` — does not exist yet
- [ ] Install `fast-check`, `@fast-check/jest` — `npm install --save-dev fast-check @fast-check/jest`
- [ ] Install `@tanstack/react-query`, `@tanstack/query-async-storage-persister`, `@tanstack/react-query-persist-client`, `@react-native-community/netinfo` — `npm install @tanstack/react-query @tanstack/query-async-storage-persister @tanstack/react-query-persist-client @react-native-community/netinfo`
- [ ] Install `squawk-cli` and add its CI step to `.github/workflows/ci.yml`
- [ ] `supabase/tests/database/05_accounts_transactions.test.sql`, `06_fx_stamping.test.sql`, `07_money_rounding_mirror.test.sql`, `08_custom_currencies.test.sql` — none exist yet
- [ ] `RESEND_API_KEY` (or equivalent) needs to be added to `.env.example` and provisioned as a Supabase Vault secret for `fx-monitor`, following the existing `FX_SYNC_SECRET` pattern in `20260922000400_fx_sync_schedule.sql`

*(No existing test infrastructure gaps beyond "phase has not started yet" — Phase 0's Jest/pgTAP/CI scaffolding fully covers what this phase needs structurally.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No (unchanged from Phase 0) | — |
| V3 Session Management | No (unchanged from Phase 0) | — |
| V4 Access Control | Yes | RLS via `user_household_ids()` on every new table (`accounts`, `transactions`, custom currencies, FX hold tables), `to authenticated` scoping, no client insert/update grant on `fx_rates`/`fx_rate_holds`/`currencies` (service-role only) |
| V5 Input Validation | Yes | `parseAmount` strict region-aware parsing (MON-02/D-24) rejects malformed input rather than coercing it; Postgres `check` constraints on currency codes (`^[A-Z]{3}$`, existing pattern), positive-amount/exponent bounds |
| V6 Cryptography | Yes | Query-cache encryption reuses `LargeSecureStore` (AES-CTR, per-key random IV, key in SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) — no new crypto code, no new algorithm choice to make |
| V13 API and Web Service | Yes | `resolve-rate` and `fx-monitor` Edge Functions must not be publicly callable without auth — `resolve-rate` should require the caller's own Supabase JWT (row must belong to their household) rather than a shared secret like `fx-sync`'s pg_cron-only auth, since it's invoked from the client, not from a scheduled job |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Client-supplied `rate`/`home_amount` accepted at face value on insert | Tampering | Trigger recomputes `home_amount` server-side from its own `fx_rates` lookup regardless of client payload (D-16); never trust a client-sent rate column |
| `resolve-rate` called with an arbitrary transaction ID to force-refresh another household's row | Tampering / Elevation of Privilege | RLS on the underlying `update` (the function should still go through a client honoring RLS, or explicitly re-check `household_id` membership inside the function before acting, since Edge Functions using the service-role key bypass RLS by design) |
| Version-conflict rejection silently overwriting a concurrent edit | Tampering | `expected_version`-conditional update (D-18) already specified; server rejects rather than last-write-wins |
| Quarantined (held) FX rate accidentally served to a client before confirmation | Integrity | `fx_rate_holds` is a physically separate table from `fx_rates`, never unioned into the read path the app queries (D-11) |

## Sources

### Primary (HIGH confidence)
- npm registry, `npm view <pkg> version`, checked live 2026-09-24 — `@tanstack/react-query` 5.103.2, `@tanstack/query-async-storage-persister` 5.103.2, `@tanstack/react-query-persist-client` 5.103.2, `@react-native-community/netinfo` 12.0.1, `fast-check` 4.10.2, `@fast-check/jest` 2.3.0, `expo-localization` 57.0.2, `squawk-cli` 2.66.0, `currency-codes` 2.2.0
- `https://api.frankfurter.dev/v2/rates?date=...` and `https://api.frankfurter.dev/v2/currencies` — live fetches 2026-09-24, confirmed per-currency heterogeneous publication dates and full currency metadata (166 currencies)
- `https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient` and `.../guides/mutations` — fetched live 2026-09-24, confirmed `persistQueryClient`/`PersistQueryClientProvider`/`setMutationDefaults`/`resumePausedMutations` API surface
- `https://resend.com/docs/api-reference/emails/send-email` — fetched live 2026-09-24, confirmed REST endpoint/body shape
- This repository: `supabase/migrations/*.sql`, `supabase/functions/fx-sync/*.ts`, `supabase/tests/database/*.test.sql`, `src/services/supabase/largeSecureStore.ts`, `src/services/storage/wipe.ts`, `jest.config.js`, `scripts/verify-gates.mjs`, `.dependency-cruiser.cjs`, `eslint.config.js`, `.github/workflows/ci.yml`, `.planning/phases/00-foundation/00-*-PLAN.md` — read directly this session

### Secondary (MEDIUM confidence)
- `https://www.exchangerate-api.com/docs/free` — fetched live 2026-09-24, open.er-api endpoint/attribution/rate-limit/response-shape (WebFetch-summarized, not raw HTML re-verified line by line)
- `https://en.wikipedia.org/wiki/ISO_4217` + web search cross-check — ISO 4217 minor-unit exception table; recommend cross-checking against `currency-codes` npm package data or the official ISO 4217 published list during implementation
- `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md` — this project's own prior research pass (2026-09-21), read in full, 3 days old at time of this research

### Tertiary (LOW confidence)
- `dehydrateOptions.shouldDehydrateMutation` default behavior (Assumption A5) — not confirmed from a primary source this session, flagged for implementation-time verification
- The FX-stamping-trigger vs. `resolve-rate`-Edge-Function split (Pattern 4, D-17's design ask) — original synthesis grounded in verified Postgres trigger constraints (no synchronous HTTP from a trigger) and the existing `bump_version()` precedent, not itself a documented pattern from any external source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified live against the npm registry this session, matches or slightly exceeds the 3-day-old STACK.md research
- Architecture: MEDIUM-HIGH — the TanStack Query/persister/paused-mutation mechanism is HIGH (verified live docs); the FX-stamping-trigger-vs-backfill design and the SQL/TS rounding-mirror mechanism are MEDIUM (original synthesis addressing an explicit CONTEXT.md research ask, not sourced from a named external pattern)
- Pitfalls: HIGH for the Frankfurter heterogeneous-date behavior (directly observed via live API calls) and the TanStack Query wiring-order pitfalls (grounded in verified docs + this project's own existing code patterns); MEDIUM for the rounding-divergence and rate_pending-never-resolved pitfalls (reasoned from the design, not observed in a running system)

**Research date:** 2026-09-24
**Valid until:** 30 days for the stack/library versions and architecture patterns (stable ecosystem); 7 days for the live-fetched Frankfurter/open.er-api response-shape observations if any implementation detail depends on exact behavior at the boundary (re-verify with a fresh live call before writing the parser, since these are unversioned public APIs that could change without notice)

---
*Phase: 01-money-core*
*Researched: 2026-09-24*
