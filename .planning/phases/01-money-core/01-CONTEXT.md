# Phase 1: Money Core - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Money Core delivers the money and data-layer foundation that Record (Phase 2) writes through on day one:

- `engine/money/` (integer minor units, ISO 4217 exponents, string-to-minor-units parsing, conversion, rounding) and `engine/split/` (largest-remainder allocation).
- The first real money tables (`accounts`, `transactions`), plus custom currencies and FX hold/alert state. Every row has a client-generated UUID and a server-incremented `version`.
- Server-side FX rate stamping; the open.er-api fallback; staleness monitoring; the plausibility hold.
- The TanStack Query data layer: an encrypted persisted cache and paused mutations as the offline write queue, plus a sync-status hook.
- Locale-aware amount and date formatting.
- FND-10's migration-compatibility check.

No product screens ship. The only visible surface is the sync status line added to the existing You screen, plus a reusable rate-date/attribution component that Record adopts. Queue hardening (SYN-03 idempotency, SYN-04 force-quit durability, SYN-05 bounded growth, per-row collapsing) stays in Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Foreign-currency records
- **D-01:** A foreign-currency transaction **always stores both figures**: original amount and currency, home-currency amount, the rate applied, the rate's publication date and its source. The prototype's "Auto-convert entries" setting (line 5340) becomes a *display* preference (which figure leads), not a storage fork. One row shape.
- **D-02:** The rate applied is the **stored rate for the transaction's own local date**. If that date has no publication (weekend, holiday), use the nearest earlier one. MON-05's "at the time it was written" is read as: the rate is fixed on the record when it is written, looked up by transaction date. It does not mean today's rate.
- **D-03:** **Rates for dates before fx-sync began (Sept 2026) are backfilled on demand**. A date that is needed but not stored is fetched server-side from Frankfurter v2's historical endpoint into `fx_rates`, then used. The app still reads only the project's own store (MON-06). There is no bulk history load.
- **D-04:** **Editing a transaction's date re-rates it** (the rate for the new date is looked up again). An amount-only edit keeps the rate and recomputes the home amount. The rate always matches the date shown on the record.
- **D-05:** **Changing home currency never rewrites history server-side.** New totals come from each record's original amount at that record's own dated rate, cross-converted through the stored base (EUR). Past months stay historically true. The stored home amount is valid for the home currency in force at write time. How totals are derived after a switch (client cross-rate vs a stored base-currency rate on the row) is for research/planning; see Claude's Discretion.
- **D-06:** **Home currency lives on the user's profile** and drives personal totals. The `households` row gets its own **reporting currency** (defaulting to the owner's home currency) for shared totals and Phase 8 settlements. In a household of one the two are equal.
- **D-07:** **Custom currencies** (MON-04): the user declares a code, a symbol, decimal places (MON-13), and what one unit is worth in a **currency the user picks** (not hard-pinned to USD as in the prototype). They are stored per user with their own as-of date, shown the way MON-07 shows publication dates, and updated by hand. They are **exempt from staleness alerts and plausibility holds**, since there is no feed to check them against.
- **D-08:** The currency picker's data source is **every currency fx-sync stores from Frankfurter v2 (~171) plus the user's custom currencies**. There is no curated shortlist at the data layer; Record may add search or ordering in its UI.

### FX monitoring and holds
- **D-09:** **Staleness alerts (MON-10) go to the operator by email via Resend** (already provisioned for outbound mail), from a scheduled server-side check (pg_cron). Users are not alerted. The rate's visible publication date (MON-07) is their honest signal.
- **D-10:** **Staleness limit is business-day aware.** One global default of about 4 calendar days (weekend plus one holiday, since Frankfurter/ECB publish nothing on weekends), with a **per-currency override column** so volatile currencies can be tightened later without a code change.
- **D-11:** **While a >10% day-on-day move is held (MON-11), new conversions keep using the last confirmed rate**, with its (older) publication date visible. The held value sits in a quarantine table, never in the served rate set.
- **D-12:** A held rate is **confirmed when a second source (or a later refresh) lands near it**. If nothing confirms it, it is **auto-accepted after 2 days**. The operator is **emailed when a rate is held and again if it is auto-accepted**, which leaves a window to drop a bad value by hand (a documented SQL/function call).
- **D-13:** **open.er-api attribution (MON-12) sits beside the rate date** wherever a converted figure's rate came from the fallback source, plus a permanent line in About/credits. Phase 1 ships the reusable component and its i18n key; Record's screens adopt it. The researcher must confirm open.er-api's exact attribution wording and placement terms.

### Offline and queued writes
- **D-14:** SYN-06 surface: a **`useSyncStatus()` hook** (online/offline, queued count, failed count, last-synced time), plus the prototype's status line (`offline · 3 changes queued` / `synced 2 minutes ago`, line 5329) placed on the existing You screen, which is where the prototype puts it. Optimistic rows carry a `pending` flag that Record renders.
- **D-15:** The **persisted cache stays browsable for 30 days** without a successful refetch, then it is discarded on next boot. The persister's `buster` is tied to the schema version so stale shapes are discarded on upgrade. The cache is encrypted at rest with its key in secure storage (SYN-07), reusing the LargeSecureStore pattern.
- **D-16:** **The server is the authority on FX rates.** A Postgres trigger or RPC stamps `rate`, `rate_date`, `rate_source` and the home amount from `fx_rates` (or the user's custom-currency rate) whenever a row is inserted or its date, amount or currency changes. The client cannot write a wrong rate. `engine/money/`'s conversion and rounding are mirrored in SQL, with a shared fixture set proving that both give identical results.
- **D-17:** **Offline foreign entries convert provisionally** using the nearest rate in the local cache, marked `rate pending`, so totals still add up. On flush the server's stamp (D-16) replaces the provisional rate. **Research must design how on-demand backfill (D-03) interacts with synchronous stamping**: a trigger cannot block on an HTTP fetch. Options include stamping the nearest earlier rate as provisional then re-stamping asynchronously, or a resolve-rate RPC/Edge Function called on flush.
- **D-18:** **Updates are conditional on `expected_version`.** On a mismatch (for example the same user edited the row on another device) the server copy wins, the cache refetches, and the rejected edit is kept as a visible "couldn't save — changed elsewhere" item. This is deliberately the same mechanism undo (Phase 2) and Household reconciliation (Phase 8) reuse. It must not be built as last-write-wins.
- **D-19:** **A permanently rejected write** (RLS, check constraint, missing parent) **stops retrying**. Its optimistic row is rolled back and it is parked in a failed list with its reason, exposed through `useSyncStatus()` and reported to error tracking (scrubbed per Phase 0 D-18). A user never silently loses an entry.
- **D-20:** **Per-row queue collapsing is deferred to Phase 10** with the rest of the SYN-03/04/05 hardening. Phase 1 replays paused mutations in order.

### Rounding and formatting
- **D-21:** **One rounding mode, half-up (away from zero), symmetric for negatives**, defined once in `engine/money/` and used for every conversion and scaling. Splits always use largest-remainder (MON-03), with a deterministic tie-break.
- **D-22:** **Numbers and dates are formatted by the device region** (via expo-localization plus `Intl`), even while app copy is English-only: grouping, decimal mark, date order, and symbol placement for that region and currency.
- **D-23:** **The amount style follows the prototype's rules, rendered through Intl.** Use the symbol, not the code. Outflows use a true minus sign `−` (U+2212), never a hyphen. Whole amounts drop their decimals unless **Show cents** is on (prototype line 5920). A zero-exponent currency (JPY) never shows decimals, and a three-exponent one (KWD) shows three whenever decimals show. An ambiguous symbol gets its code prefix (US$, CA$). **Hide balances** masking is a later UI concern, but the formatter should not preclude it.
- **D-24:** **Amount input parsing (MON-02) is strict and region-aware.** The region's decimal separator is the decimal mark and grouping separators are ignored. More fraction digits than the currency's exponent allows is **rejected with a clear message, never silently rounded**. The conversion is pure string-to-integer with no `parseFloat`, property-tested with fast-check.
- **D-25:** **The Show cents preference is stored on the profile row** alongside accent and font (Phase 0 D-14), with a local cache. The formatter takes it as a parameter; `engine/` never reads preferences.

### Schema scope and migration safety
- **D-26:** **Phase 1 creates the money tables in full shape**: `accounts` and `transactions` with every money column (bigint minor units, currency, FX stamp columns, local date plus IANA time zone per MON-14, UUID PK without a server default, `version` using the existing `bump_version()` trigger, `household_id` plus RLS in the `user_household_ids()` form), plus custom currencies and FX hold/alert tables. Record adds categories, recurrence and UI-driven columns through additive migrations only.
- **D-27:** **FND-10 is a CI rule plus a PR checklist** (expand/contract discipline). CI flags destructive DDL (dropping or renaming a column or table, narrowing a type, a new `NOT NULL` without a default, and similar) unless the migration carries a reviewed marker such as `-- contract-ok: min_version >= X` that is checked against `app_config.min_supported_version`. A PR template checklist covers what the rule cannot see.

### Claude's Discretion
- How post-switch home totals are computed (D-05): client-side cross-rate through the EUR base, or also storing a base-currency rate or amount on each row. Pick whichever keeps `engine/money/` pure and the SQL mirror (D-16) small.
- Exact column names, enum and status values (`pending`/`synced`/`failed`, `rate pending`), and table names for custom currencies, FX holds and alerts.
- How "near" counts as confirmation for a held rate (D-12), and the precise staleness default (about 4 days) within the business-day intent.
- Mutation-key naming and `setMutationDefaults` layout, and the NetInfo to `onlineManager` wiring.
- The destructive-DDL detection approach for D-27 (regex/SQL parser, squawk, or similar).
- Whether open.er-api fallback lives inside the existing `fx-sync` function or in a sibling function.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §"Phase 1: Money Core": goal, 7 success criteria, requirement list
- `.planning/REQUIREMENTS.md`: MON-01..MON-14, SYN-01, SYN-02, SYN-06, SYN-07, FND-10, DSG-06 (SYN-03/04/05 are Phase 10, not here)
- `.planning/PROJECT.md` §"Key Decisions": locked choices on client UUID + `version`, hand-rolled `engine/money/`, FX fallback with staleness/plausibility, Frankfurter **v2 pinned**, rates stored per transaction, ISO 4217 exponents, local date + time zone, encrypted cache, migration compatibility

### Architecture patterns
- `.planning/research/ARCHITECTURE.md` Pattern 2 (client-generated UUIDs, optimistic rows), Pattern 3 (write queue; collapsing is deferred per D-20), Pattern 4 (version-keyed reconciliation, which D-18 lays groundwork for), Pattern 6 (RLS shape: `(select auth.uid())`, index join columns), Pattern 7 (bigint money, branded `MinorUnits`, largest-remainder). **Note:** Pattern 7's dinero.js suggestion is superseded by PROJECT.md's hand-rolled decision.
- `.planning/research/STACK.md` Data Layer section: TanStack Query 5 persister, `onlineManager` + NetInfo wiring (not automatic on RN), paused mutations + `setMutationDefaults` as the queue
- `.planning/research/PITFALLS.md`: relevant money/offline pitfalls
- `BUILD-PROMPT.md` §3 "Data layer", §6 "Architecture" and "Testing": engine purity, testing strategy

### Prior phase decisions
- `.planning/phases/00-foundation/00-CONTEXT.md`: D-14 (preferences on profile + local cache), D-15 (sign-out wipes cache, key and queue, with an unsynced-writes warning), D-18/D-19 (scrubbed error tracking), D-21 (100% branch coverage on `engine/money/` and `engine/split/`), D-25 (`app_config` min version)
- `docs/design/token-exceptions.md`: the only sanctioned DSG-02 exceptions (the status line and attribution use tokens only)
- `docs/dependency-register.md`: add open.er-api and Resend-alert usage here

### Prototype (visual and copy reference, not structure)
- `FincWin United.dc.html` line 3606–3615: money formatter (`m`, `native`, `snative`) and conversion; source of D-23's display rules
- line 5329: sync status line copy; line 5364: "Work offline" toggle copy
- line 5337–5341: home currency + "Auto-convert entries" setting copy
- line 5655–5664: entry FX note copy ("Saves as … at … The original … stays on the record.")
- line 5770–5790: home currency picker + add-custom-currency flow and its validation messages
- line 5919–5920: "Hide balances" / "Show cents" settings copy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supabase/migrations/20260922000100_household_of_one.sql`: `bump_version()` trigger function (version starts at 1, also sets `updated_at`), `user_household_ids()` membership helper for RLS, and the `profiles` table (where home currency and show cents go as additive columns).
- `supabase/migrations/20260922000300_fx_rates.sql`: `fx_rates(base, quote, rate numeric(24,10), rate_date, source, fetched_at)`. `source` already allows `'open-er-api'`, so no constraint migration is needed for MON-12. Base is EUR.
- `supabase/functions/fx-sync/` (`index.ts`, `parse.ts`, `parse.test.ts`): Frankfurter v2 daily sync, shared-secret auth, pg_cron-invoked. Extend it (or add a sibling) for the fallback, the plausibility check and historical backfill.
- `supabase/migrations/20260922000400_fx_sync_schedule.sql`: existing pg_cron + vault pattern to copy for the staleness-check job.
- `src/services/supabase/largeSecureStore.ts`: AES key in SecureStore plus ciphertext in AsyncStorage. Reuse it as the storage backing the TanStack Query persister for SYN-07.
- `src/services/storage/wipe.ts`: wipe registry (`registerSecureKey`). The query cache, its key and the mutation queue must register so sign-out wipes them (Phase 0 D-15).
- `src/theme/themeCache.ts` + `ThemeProvider.tsx`: the "profile row + local cache, ready-gated" pattern to copy for show cents and home currency.
- `src/engine/guards/assertNever.ts`: the only existing engine file; engine purity is enforced by `.dependency-cruiser.cjs` + `eslint.config.js`.
- `supabase/tests/database/*.test.sql`: pgTAP pattern for RLS isolation and triggers. Add tests for money tables, version increments, FX stamping and the SQL/TS rounding mirror.
- `scripts/check-coverage-ignores.mjs`, `scripts/verify-gates.mjs`: coverage gate tooling (100% on `engine/money/` and `engine/split/`).

### Established Patterns
- Every schema change goes through `supabase/migrations/*.sql` + `npm run supabase:db:push` (preflight ref check). There is a single production project; no dashboard edits.
- RLS: `to authenticated`, `(select auth.uid())` initPlan form via `user_household_ids()`, indexed join columns.
- `src/` layout per `src/README.md`: `engine/` pure; `db/` query builders; `data/` TanStack hooks, persister and paused mutations; `services/` SDK wrappers.
- Not yet installed: `@tanstack/react-query`, the persist-client/async-storage persister packages, `@react-native-community/netinfo`, `expo-localization`. `expo-crypto` is installed (usable for `randomUUID()`); `react-native-get-random-values` is present.

### Integration Points
- The You screen (Phase 0 plan 00-18) hosts the sync status line.
- `AuthProvider` (00-15) supplies the user and household id that scope query keys, and sign-out triggers the wipe.
- The min-version gate (00-17) reads `app_config`, which is FND-10's reference value.
- Phase 4's Decide engine will consume `engine/money/`. Keep its API stable and documented.

</code_context>

<specifics>
## Specific Ideas

- Port the prototype's FX-related copy verbatim into the i18n catalogue: the entry FX note, "Every total converts into this. Foreign lines keep their own amount and show both.", and the custom-currency validation lines ("Give the currency a code.", "… already exists."). Adjust "worth in USD" wording to the user-chosen reference currency (D-07).
- The prototype formatter hardcodes `en-US` and mixes `-` and `−`. Both are corrected here (D-22, D-23), not ported.
- The prototype's `conv()` rounds to 2 decimals regardless of currency. That is the exact bug MON-13 exists to prevent; the exponent always comes from the currency.
- Phase 0 pending-work note: Phase 0 plans 00-07 and 00-14..00-20 are not yet complete. Plans here that touch the You screen, AuthProvider or the wipe flow depend on 00-15/00-17/00-18 landing first.

</specifics>

<deferred>
## Deferred Ideas

- Per-row queue collapsing (insert+edit → insert, insert+delete → dropped): Phase 10 with SYN-03/04/05.
- Per-currency staleness tiers for volatile currencies (ARS, NGN, TRY): the override column exists (D-10); populating it is a later ops call.
- User-facing stale-rate notices beyond the visible publication date: not in v1 scope.
- Editable per-transaction rate override ("the rate my bank actually charged"): offered and not chosen. A possible later Record enhancement.
- Old-client contract test (running the previous release's queries against the new schema in CI): stronger FND-10 option, not chosen for now.

</deferred>

---

*Phase: 01-money-core*
*Context gathered: 2026-09-24*
