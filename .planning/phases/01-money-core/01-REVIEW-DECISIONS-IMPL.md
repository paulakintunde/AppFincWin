---
phase: 01-money-core
implemented_at: 2026-09-24
source: .planning/phases/01-money-core/01-REVIEW-DECISIONS.md
decisions_in_scope: [RD-01, RD-02, RD-03, RD-05, RD-07]
status: complete
---

# Phase 1 — Post-Review Product Decisions: Implementation Report

Each decision below landed as its own commit (RD-03 needed only one; the others are
single-commit too, plus one small follow-up fix for RD-02 and a docs commit covering RD-05 and
RD-07). Regression tests were written and run against the pre-fix code first for every
decision, then again after the fix, per the objective's failing-first requirement.

## RD-01 — No upper cap on custom-currency unit_value

**Commit:** `b83b5fb feat(01): RD-01 remove static custom-currency unit_value bounds`

**What changed:**
- `src/engine/money/customCurrency.ts`: removed `MIN_UNIT_VALUE`/`MAX_UNIT_VALUE` and the
  bound check inside `validateCustomCurrency`. The only client-side validation left is
  `parseRate`'s own `> 0` and numeric(24,10)-precision (14 integer digits, 10 fraction digits)
  checks — the same structural limit the column itself has.
- `src/data/mutations/customCurrencies.ts`: the same removal in `normalizeUnitValue` (the
  hand-edit path).
- `src/engine/money/index.ts`: dropped the now-removed exports from the barrel.
- **SQL side needed no change.** `custom_currencies.unit_value` already had only
  `check (unit_value > 0)` — Partition B's WR-B07 fix deliberately did not add an upper bound,
  for exactly the reason RD-01 gives (a VND-referenced asset would need a value the review's
  suggested 1e6 cap would reject). The rate guard (`customPerEur` / SQL
  `guard_custom_currency_rate`) was already the single source of truth on both sides; RD-01
  only had client-side static bounds left to remove.

**Tests:**
- `src/engine/money/__tests__/customCurrency.test.ts`: values the old `MAX_UNIT_VALUE` (1e6)
  and `MIN_UNIT_VALUE` (1e-6) would have rejected (5,000,000; 0.0000009; 0.0000000001;
  1,000,000,000; 99,999,999,999,999 — the numeric(24,10) ceiling) are now accepted; an 11th
  fraction digit is still `value-invalid` (a precision limit, not a value bound); an explicit
  1,000,000,000-unit-value test asserts the canonical 10dp output end to end.
- `src/data/mutations/__tests__/provisional.test.ts`: a 1,000,000,000 `unit_value` still
  resolves a real (non-pending-unresolved) provisional rate.
- Also fixed two other suites' hardcoded expectations of the old bound
  (`src/data/mutations/__tests__/moneyPrefs.test.tsx`, `src/db/__tests__/customCurrencies.test.ts`)
  that the full-suite run surfaced as failing once the bound was removed.

**Anything needing the user:** none.

---

## RD-02 — Region precedence: override > device region > time zone tiebreak

**Commits:** `ac735ac feat(01): RD-02 region precedence…`, `af5b7cc fix(01): RD-02 correct
expected error code…`

**What changed:**
- `supabase/migrations/20260924000200_money_prefs.sql`: nullable `profiles.region char(2)`
  (checked `^[A-Z]{2}$`), client-writable via the existing profiles update grant. Unset (null)
  means "defer to device region / time zone tiebreak", not "no region".
- `src/db/rows.ts`, `src/db/profile.ts`: `MoneyPrefsRow`/column-grant allowlists gain `region`.
- `src/data/queries/moneyPrefs.ts`, `src/data/mutations/moneyPrefs.ts`:
  `DEFAULT_MONEY_PREFS.region = null`; `useUpdateMoneyPrefs().setRegion(region)`.
- `src/services/locale/resolveRegion.ts` (new): pure
  `resolveRegion({ override, deviceRegion, timeZone })` implementing the precedence. The time
  zone tiebreak uses a small, deliberately limited table of unambiguous single-country zones
  (documented in the file) rather than general IANA-to-country data — an unmapped zone
  resolves to no tiebreak, never a guess. No IP geolocation anywhere in the module.
- `src/services/locale/deviceLocale.ts`: `getDeviceLocale`, `getDeviceSeparators` and
  `useDeviceLocale` all take an optional region override and route through `resolveRegion`.
  When the resolved region differs from the device's own (an override won, or the tiebreak
  fired because the device reported none), both the locale tag and the separators are derived
  via `Intl.getCanonicalLocales`/`Intl.NumberFormat(...).formatToParts` for that region —
  **never** read off the device's own `decimalSeparator`/`digitGroupingSeparator`, since those
  reflect the device's own region, not an arbitrary override. When the resolved region equals
  the device's, WR-A11's existing device-native behaviour is unchanged.
- **No UI in this plan**, as specified — the hook and mutation are exposed for a later
  settings screen. No screen currently calls `setRegion` or passes a region override into
  `useDeviceLocale`.

**Tests:**
- `src/services/locale/__tests__/resolveRegion.test.ts`: precedence (override beats device
  beats tiebreak), normalization (case/whitespace), invalid override ignored, tiebreak only
  when device region is absent, unmapped zone resolves to no region.
- `src/services/locale/__tests__/deviceLocale.test.ts`: override wins over device region for
  both tag and separators (and the separators are visibly different from the device's own,
  proving they come from Intl, not the device); device region still wins over a would-be
  tiebreak; tiebreak only fires with no device region; invalid override ignored; the reactive
  hook applies the same precedence. One pre-existing test's fixture was corrected to include
  `languageCode`/`regionCode` (a real `expo-localization` `Locale` always provides them; the
  old fixture only set `languageTag`, which happened to mask what would otherwise now be a
  timezone-tiebreak).
- `src/data/mutations/__tests__/moneyPrefs.test.tsx`: `setRegion('DE')` sends exactly
  `{ region: 'DE' }` and updates the cache optimistically; `setRegion(null)` clears it.
- New pgTAP additions to `08_custom_currencies_prefs.test.sql`: `region` defaults null; a
  valid override is accepted; a 3-letter value is rejected (by the `char(2)` type itself —
  `22001`, corrected from an initial wrong assumption of `23514` once the full pgTAP suite
  actually ran); a lower-case value violates the check constraint (`23514`); region can be
  cleared back to null.

**Anything needing the user:** the settings screen that lets a user actually set a region
override is out of scope for this plan (per the decision text) and is not built yet.

---

## RD-03 — Exact high-value custom-unit conversion

**Commit:** `5be3433 feat(01): RD-03 exact high-value custom-unit conversion`

**What changed:**
- `supabase/migrations/20260924000400_transactions.sql`: four new server-only stamp columns —
  `orig_custom_unit_value`, `orig_custom_ref_per_eur`, `home_custom_unit_value`,
  `home_custom_ref_per_eur` (all `numeric(24,10)`, `> 0` when set) — excluded from the client
  insert/update grants exactly like every other FX stamp column.
- `supabase/migrations/20260924000500_fx_stamping.sql`:
  - `convert_minor_exact(amount, from_per_eur, from_exp, from_custom_unit_value,
    from_custom_ref_per_eur, to_per_eur, to_exp, to_custom_unit_value, to_custom_ref_per_eur)`
    — a single-ratio generalization of `convert_minor`. The four extra params are null for a
    plain leg, in which case `coalesce` reduces the formula to exactly `convert_minor`'s own
    ratio (proven by fixture cases where both sides are null). `convert_minor` itself is
    untouched.
  - `per_eur_rate()` gains two OUT params, `custom_unit_value`/`custom_ref_per_eur`, populated
    only when that leg resolved through a custom currency (the raw `unit_value` and the
    resolved reference currency's own per-EUR rate — itself never a custom leg, since a
    custom currency's reference must be ISO). `rate`/`orig_per_eur`/`home_per_eur` keep their
    existing (10dp-rounded) meaning for display; the new columns are what
    `convert_minor_exact` substitutes directly instead.
  - `stamp_fx_rate()` stamps the four new columns on insert/re-rate and **reuses** them
    (never re-derives) on an amount-only edit (D-04), and both `home_amount` computations
    (re-rate and amount-only-edit) now call `convert_minor_exact()` instead of
    `convert_minor()`.
- `src/engine/money/rates.ts`: `convertMinorExact()`, the TS mirror. Same substitution; uses
  `EUR_PER_EUR` (the scaled representation of real `1`) — not an unscaled `1n` — as the
  identity for a plain leg's missing `unitValue` term, which is what makes the `ScaledRate`
  scale factors cancel correctly on both sides of the ratio (verified by hand and against the
  fixture; an unscaled identity would silently introduce a 1e10 factor error whenever exactly
  one side is custom).
- `supabase/tests/fixtures/money-conversion-cases.json`: new `convertExact` array — the
  GOLD-60,000-USD case exactly (per WR-B07's own example), its inverse (the custom leg on the
  home side), a 1e9-unit asset, a negative amount, both legs custom, a 3-decimal custom leg
  into a 0-decimal ISO currency, and a neither-custom case that must equal `convertMinor`'s
  existing "USD 10.00 to JPY" result. `scripts/gen-money-mirror-test.mjs` was extended (not
  rewritten) to emit `convert_minor_exact` pgTAP assertions from the same fixture; the
  generated `07_money_rounding_mirror.test.sql` was regenerated and `--check` is green.

**Tests:**
- `src/engine/money/__tests__/rates.test.ts`: the fixture cases, `RangeError` bounds
  (`MAX_SAFE_INTEGER`, out-of-range exponents), and a direct test that first reproduces the
  WR-B07 drift with the *old* `convertMinor`+`customPerEur` path (59,999.90) before asserting
  `convertMinorExact` gives exactly 60,000.00 for the same inputs.
- New pgTAP `24_exact_custom_conversion.test.sql`: registers a GOLD custom currency
  (1 GOLD = 60,000 USD), inserts a 1.00 GOLD transaction, and asserts `home_amount` is exactly
  6,000,000 (not 5,999,990), the row is stamped exact, the raw stamp columns hold the values
  actually used, the home (plain USD) leg has no custom stamp, and a subsequent amount-only
  edit (to 2.50 GOLD) still converts exactly by reusing the stored stamp rather than
  re-deriving it.
- Full pgTAP suite (24 files, 336 tests) and full Jest suite (57 suites, 1009 tests) both
  green on the final tree; `engine/money` and `engine/split` stayed at 100%
  statements/branches/functions/lines.

**Scope note — `src/data/mutations/provisional.ts` intentionally left unchanged:** the
client's optimistic/provisional estimate still computes through the old
`convertMinor`+`customPerEur` path, so a high-value custom-currency transaction can show a
visibly wrong optimistic total offline (this was already true before RD-03; my RD-01 testing
incidentally surfaced how wrong — 105,900,000,000 vs. the exact 1,000,000,000 for a synthetic
1e9-unit-value example). The provisional stamp is always superseded by the server's own stamp
(D-16/D-17) and the module already documents itself as an estimate the server corrects. Wiring
the new stamp columns into the client's estimate would require exposing four more server-only
columns through `TRANSACTION_COLUMNS`/`TransactionRow` (currently excluded, matching how
`orig_exp`/`home_exp` are already server-only-and-unread by the client) and reworking
`provisionalStamp`/`editStamp`'s conversion calls — a larger, separately-scoped change I did
not make in order to keep this pass's blast radius to what RD-03 actually asked for (the
stored, server-authoritative conversion). **Flagging for a follow-up plan or explicit
sign-off:** if a very-high-value custom currency's *offline* display accuracy matters before
sync, this should be picked up as its own task.

---

## RD-05 — resolve-rate per-user throttle

**Commits:** `8b0eb47 feat(01): RD-05 per-user throttle on resolve-rate`,
`15b4959 docs(01): document RD-05…` (docs)

**What changed:**
- `supabase/migrations/20260924000600_fx_monitoring.sql`: new `fx_resolve_calls(user_id,
  window_start, count)` table (primary key `(user_id, window_start)`, no client grants, RLS
  on) and `fx_resolve_rate_check_limit(p_user_id, p_limit default 60)` — a single
  insert-or-increment statement keyed by the current UTC hour, so concurrent calls from the
  same user serialize on the row's own unique constraint rather than racing a read-then-write.
  Service-role only.
- `supabase/functions/resolve-rate/resolve.ts`: `resolveRate` calls the new
  `deps.checkRateLimit()` before any other work (before `readPending`, before any fetch or
  write) and returns `429 {ok:false,error:'rate-limited'}` when over the limit. An
  invalid-input request never reaches the check at all.
- `supabase/functions/resolve-rate/index.ts`: resolves the caller's own id via
  `userClient.auth.getUser()` (never from client-supplied input) and calls the new RPC.
- **Client:** `src/data/sync/resolveRateBackoff.ts` (new) — a light in-memory cooldown
  (5 minutes by default). `src/db/transactions.ts`'s `requestRateResolution` notes the
  backoff on a 429 (still returns `null`, never throws — unchanged permanent-failure
  behaviour, matching how every other HTTP-layer error from this call is already handled).
  `src/data/mutations/transactions.ts`'s `followUpIfRatePending` skips the call entirely while
  the backoff is active, so a burst of pending writes does not keep independently hammering an
  endpoint that already answered 429. This satisfies "classify as transient-with-backoff,
  never a permanent failure, never blocks the write queue": resolve-rate's follow-up was
  already outside the mutation retry system (WR-A15, fire-and-forget), so "never blocks the
  write queue" was already structurally true; the backoff module is the "with-backoff" half.
- `docs/ops/fx-operations.md`: new "resolve-rate's per-user rate limit (RD-05)" section with
  an operator query and guidance on when a 429 does (and mostly does not) warrant attention.

**Tests:**
- `supabase/functions/resolve-rate/resolve.test.ts`: a throttled caller gets 429 with no
  read/fetch/write; invalid input is rejected before the rate limit is even checked.
- `src/db/__tests__/transactions.test.ts`: a 429 returns `null` (never throws) and notes the
  client backoff; a plain 500 does not trigger the backoff.
- `src/data/mutations/__tests__/transactions.test.tsx`: a throttled follow-up never calls
  `functions.invoke` at all (proven by leaving only one fake response queued — if the
  follow-up ran anyway, `fakeSupabase.next()` would run out and throw).
- New pgTAP `22_fx_resolve_rate_limit.test.sql`: no client role can read, write or execute
  around `fx_resolve_calls`/`fx_resolve_rate_check_limit`; calls are allowed up to a small
  test limit and then blocked; a different user has an independent budget; a new UTC hour
  starts a fresh window even after the previous hour was exhausted.

**Anything needing the user:** none. The 60/hour default is a constant
(`fx_resolve_rate_check_limit`'s `p_limit` default); tune via a future migration if real usage
data suggests otherwise.

---

## RD-07 — ISO 4217 shadow list seeded from the currency-metadata sync

**Commits:** `c5f8e1c feat(01): RD-07 seed the ISO 4217 shadow list…`,
`15b4959 docs(01): document RD-05 resolve-rate throttle and RD-07 custom-shadowed alert` (docs)

**What changed:**
- `supabase/migrations/20260924000100_custom_currencies.sql`: `guard_custom_currency()`'s
  insert-time shadow check now also queries `public.currencies` (the table fx-sync's daily
  currency-metadata sync already populates, `20260924000600_fx_monitoring.sql`), on top of the
  existing static `is_iso4217_code` floor and the live `fx_rates` quotes. This is a plpgsql
  forward reference to a table created by a later migration in the same set — safe, since
  plpgsql function bodies are validated at first call, not at `CREATE FUNCTION` time (verified
  by a clean `supabase db reset --local`).
- `supabase/migrations/20260924000600_fx_monitoring.sql`: `fx_alerts.kind` gains
  `'custom-shadowed'`.
- `supabase/functions/fx-sync/sync.ts` / `index.ts`: `FxSyncDb` gains
  `newCurrencyCodes(codes)` (the subset not yet in `currencies` — checked *before* the upsert,
  since the upsert is what makes a code "seen" from then on) and `shadowedCustomCodes(codes)`
  (the subset some `custom_currencies` row already uses, any owner). `ingest()` checks newly-seen
  codes against custom currencies right after fetching metadata and inserts a `custom-shadowed`
  alert per match — never fails the metadata sync, and never touches the affected user's data
  (the shadow check is insert-only, so their existing custom currency is unaffected either
  way).

**Tests:**
- `supabase/functions/fx-sync/sync.test.ts`: a newly-synced code that shadows an existing
  custom currency alerts (and the sync still succeeds); a code the `currencies` table already
  carried before this sync never re-alerts (only genuinely new codes are checked); a
  newly-synced code that matches no custom currency alerts nothing.
- New pgTAP `23_currency_shadow_seed.test.sql`: a code not yet in `currencies` or `fx_rates`
  is accepted as a custom currency; once fx-sync's metadata feed reports that code (simulated
  by inserting into `currencies` directly, matching what the sync does), the already-registered
  custom currency keeps resolving (`per_eur_rate` still returns its rate correctly — the
  shadow check never runs on UPDATE); a *new* registration of that now-synced code is rejected
  (`23514`); a code never seen at all remains valid.

**Anything needing the user:** none. The static `is_iso4217_code` floor is unchanged and still
in place — RD-07 only adds the live feed on top of it, per the decision.

---

## Full verification (final tree, all five decisions applied)

- Full Jest suite: **57 suites, 1009 tests**, all passing. `engine/money` and `engine/split`
  both at 100% statements/branches/functions/lines (the project's coverage gate).
- Full pgTAP suite on a fresh `supabase db reset --local`: **24 files, 336 tests**, all
  passing.
- `npm run lint` (`eslint .`): 0 errors, 20 pre-existing warnings (all `fast-check`/`i18next`
  named-export cautions in engine test files and `src/i18n/index.ts`, unrelated to this pass).
- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run depcruise`: no violations (109 modules, 272 dependencies).
- `npm run verify:gates`: OK (engine purity/coverage probes).
- `npm run check:ignores`: OK (no unreasoned coverage ignores in the 100% folders).
- `npm run lint:migrations` / `npm run verify:migrations`: OK (11 files, floor 0.1.0; 38+
  probes plus the CLI-version check).
- `npm run check:money-mirror`: up to date.
- `deno check` on all three Edge Function entry points (`resolve-rate`, `fx-sync`,
  `fx-monitor`): clean.

## Notes for the orchestrator

- The disposable Jest config (`jest.disposable.config.js`, Windows worktree "No tests found"
  workaround) and `.npmrc` (`legacy-peer-deps=true`) were used throughout and are deleted
  before this report is committed, per the worktree setup instructions.
- No STATE.md or ROADMAP.md changes were made, per the objective's instruction.
- Every commit in this pass is `feat(01): RD-0x …` (or a small same-decision `fix(01):` /
  `docs(01):` follow-up), one decision (or a decision plus its docs) per commit, each with its
  own regression tests written and run against the pre-fix code first.

---

## Follow-up: offline estimate

RD-03 landed the exact server-side conversion (`convert_minor_exact()` / `convertMinorExact()`)
but left one client path on the old rounded-per-EUR-intermediate conversion:
`src/data/mutations/provisional.ts`'s offline estimate (`provisionalStamp` /
`computeProvisionalStamp`) still called `convertMinor` for custom-currency legs, so an offline
entry of a high-value custom unit (e.g. 1.00 GOLD at 1 GOLD = 60,000 USD) displayed the same
59,999.90 drift RD-03 fixed server-side, until the server's own stamp (D-16) landed and
corrected it.

**Commit:** `56cff29 feat(01): RD-03 exact conversion in offline provisional stamp` (test
commit `06333ae` first, per the failing-first requirement).

**What changed:**
- `src/data/mutations/provisional.ts`: `resolvePerEur`'s custom-currency branch now also
  returns the leg's raw stamp (`custom: { unitValue, referencePerEur }` — the currency's own
  declared `unit_value` plus its reference currency's resolved per-EUR rate), alongside the
  existing rounded `customPerEur` value still used for `orig_per_eur`/`home_per_eur`/`rate`
  display. `computeProvisionalStamp` builds a `ConversionLeg` per side and calls
  `convertMinorExact` instead of `convertMinor`, mirroring `stamp_fx_rate()`'s use of
  `convert_minor_exact()` in the FX migration.
- `editStamp`'s amount-only-edit fallback (D-04) is unchanged and still calls `convertMinor`
  against the row's stored `orig_per_eur`/`home_per_eur`: `TransactionRow` does not expose the
  raw custom-leg columns (`orig_custom_unit_value`/`orig_custom_ref_per_eur` and their `home_`
  equivalents) to the client, so there is nothing exact to substitute there. This path already
  re-derives through `provisionalStamp` (and so gets the exact conversion) whenever the edit
  actually re-rates (a currency or date change); only the pure amount-edit-at-the-stored-rate
  case keeps the rounded intermediate, same as before this change.
- No changes to `src/engine/**` — `convertMinorExact` already existed from RD-03.

**Tests:**
- `src/data/mutations/__tests__/provisional.test.ts`: a new `RD-03: exact conversion for
  custom-currency legs` block, written and run against the pre-fix code first (RED: the two
  GOLD-leg cases failed with `5999990`/`-5999990` instead of `6000000`/`-6000000`, matching the
  WR-B07 drift exactly). Cases mirror `supabase/tests/fixtures/money-conversion-cases.json`'s
  `convertExact` fixture: 1.00 GOLD → USD (the required exact-not-rounded case), a negative
  amount, the inverse direction (home leg custom), a 1e9-unit-value asset (0dp), both legs
  custom against the same reference, and a 3-decimal custom leg into a 0-decimal ISO currency.
  All pre-existing `provisionalStamp`/`editStamp` cases (same-currency, non-custom legs, the
  zero/overflow-rate pending fallback, `rate_date`/`rate_source` semantics) pass unchanged.

**Verification:** `npx jest src/data` (15 suites, 173 tests), full `npx jest` (57 suites, 1015
tests), `npm run lint` (0 errors, the same 20 pre-existing `fast-check`/`i18next` warnings),
`npm run typecheck`, `npm run depcruise` (no violations, 109 modules/272 dependencies) — all
pass.

**Anything needing the user:** none.

---

## Follow-up: offline amount-only edits

The previous follow-up fixed `provisionalStamp` (a brand-new offline entry). It left
`editStamp`'s D-04 amount-only-edit fallback on the rounded path, since `TransactionRow` did
not expose the raw custom-leg columns RD-03's stamp trigger writes. This closes that gap: an
offline amount-only edit of an *already-stamped* custom-currency transaction (e.g. changing
1.00 GOLD to 2.00 GOLD, 1 GOLD = 60,000 USD) now also converts exactly instead of drifting
through the same 59,999.90-style rounding WR-B07 found.

**Commits:** `8fc9efc test(01): RD-03 follow-up failing-first exact offline amount-only edits`,
`50febe8 feat(01): RD-03 exact offline amount-only edits for custom-currency rows`.

**What changed:**
- `supabase/migrations/20260924000400_transactions.sql`: doc-only comment. The table's
  `grant select on public.transactions to authenticated` (no column list, unlike the
  insert/update grants) already covered `orig_custom_unit_value`/`orig_custom_ref_per_eur`/
  `home_custom_unit_value`/`home_custom_ref_per_eur` — a whole-table `GRANT SELECT` in
  PostgreSQL applies to every column, present or future, unless a column-scoped grant is used
  instead. Nothing needed to change in the grant itself; the comment now says so explicitly,
  so a future reader does not assume these four columns need a new grant statement the way
  the insert/update lists would.
- `src/db/rows.ts`: `TransactionRow` gains the four columns as `string | null` (RD-03's own
  numeric(24,10) stamp columns, cast to text like every other rate column so a value never
  crosses into JS as a float, MON-01). Server-written only — still absent from
  `TRANSACTION_INSERT_KEYS`/`TRANSACTION_PATCH_KEYS`.
- `src/db/transactions.ts`: `TRANSACTION_COLUMNS` selects all four, each cast `::text`.
- `src/data/mutations/transactions.ts`: `useAddTransaction`'s optimistic insert row sets all
  four to `null` — an insert's optimistic stamp is only ever `provisionalStamp`'s own
  (already-exact, per the previous follow-up) estimate; the raw columns are unknown until the
  server's own stamp lands (D-16), exactly as `rate_pending` was already `true` in the interim.
- `src/data/mutations/provisional.ts`: `editStamp`'s amount-only-edit fallback (previously the
  one path RD-03 explicitly left unchanged) now builds a `ConversionLeg` per side via a new
  `legFromRow` helper — the row's own `orig_per_eur`/`home_per_eur` plus, when both raw
  columns for that side are present, the `custom` stamp — and calls `convertMinorExact`
  instead of `convertMinor`. Mirrors `stamp_fx_rate()`'s own amount-only-edit branch, which
  already reuses these same stored columns via `convert_minor_exact()`. A row with no raw
  stamp (a plain ISO leg on either side, or a row written before this raw stamp existed) still
  falls back to exactly the previous `convertMinor`-equivalent ratio — `legFromRow` returns a
  plain leg, and `convertMinorExact` with no `custom` on either side reduces to the same
  ratio `convertMinor` always computed, so this path is unchanged in every case it already
  covered.
- No changes to `src/engine/**` — `convertMinorExact` already existed from RD-03.

**Tests:**
- `src/data/mutations/__tests__/provisional.test.ts`: a new `RD-03 follow-up` block under
  `editStamp`, written and run against the pre-fix code first (RED: 1.00 → 2.00 GOLD gave
  11,999,980, not the exact 12,000,000 — the same WR-B07 drift, doubled). Cases: the required
  exact amount-only edit, a negative amount, a non-custom row (both raw columns null)
  confirming the existing D-04 path is unchanged, and a row whose raw columns are null despite
  otherwise being a custom-currency row (simulating a pre-existing/never-stamped-with-the-raw-
  columns row) falling back safely to the old rounded result rather than throwing.
- `src/db/__tests__/transactions.test.ts`: `TRANSACTION_COLUMNS` casts all four new columns to
  text; all four stay absent from `TRANSACTION_INSERT_KEYS`/`TRANSACTION_PATCH_KEYS`.
- New pgTAP assertions in `supabase/tests/database/05_accounts_transactions.test.sql`
  (extending the existing D-16 grant test, plan 20 → 23): `authenticated` can `select` all
  four raw custom-leg stamp columns for its own household's row; inserting or updating any one
  of them still fails `42501`, unchanged from every other stamp column.

**Verification:** full pgTAP on a fresh `supabase db reset --local` (24 files, 339 tests, all
passing), full `npx jest` (57 suites, 1021 tests), `npm run lint` (0 errors, the same 20
pre-existing `fast-check`/`i18next` warnings), `npm run typecheck`, `npm run depcruise` (no
violations, 109 modules/272 dependencies), `npm run lint:migrations` / `npm run
verify:migrations` (both OK), `npm run check:money-mirror` (up to date), `npm run verify:gates`
and `npm run check:ignores` (both OK), and a targeted coverage run confirming `engine/money`
and `engine/split` are still 100% statements/branches/functions/lines (untouched by this pass,
per the objective's constraint).

**Anything needing the user:** none.
