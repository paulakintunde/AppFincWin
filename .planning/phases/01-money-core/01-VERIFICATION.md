---
phase: 01-money-core
verified: 2026-09-27T00:23:37Z
status: human_needed
score: 20/20 must-haves verified (all 20 Phase 1 requirement IDs; 7 Success Criteria all met)
overrides_applied: 0
human_verification:
  - test: "WR-A11 region-derived separators on a physical device (language English, region Germany)"
    expected: "parseAmount/formatAmount read '1.234,56' style input/output correctly when region=DE, language=en"
    why_human: "01-REVIEW-FIX.md flags this as still needing on-device confirmation; unit tests exercise the Intl-derived code path but not the real OS region-override plumbing on a device"
  - test: "MON-07 RateAttribution visible on an actual converted-amount screen"
    expected: "Once Record (Phase 2) ships a screen that renders a converted amount, RateAttribution (or equivalent) must be mounted next to it"
    why_human: "No screen in Phase 0/1 renders a transaction amount yet (Record ships in Phase 2), so RateAttribution.tsx exists, is tested, and is deliberately not mounted anywhere yet — there is nothing to attribute a rate to. This is a legitimate phase-boundary defer, not a defect, but a human should confirm Phase 2 actually mounts it against every converted figure once it ships."
  - test: "WR-B05/WR-B06 hold-drop restamp heuristic and static ISO 4217 code list"
    expected: "The row-selection heuristic in fx_drop_hold/fx_restamp_by_rate and the static withdrawn-code list in is_iso4217_code are product-reviewed, not just test-covered"
    why_human: "01-REVIEW-FIX.md explicitly flags both as 'requires human verification' — they are implemented and pgTAP-covered, but the coordinator asked for a second pair of eyes on the heuristic/list content itself"
---

# Phase 1: Money Core Verification Report

**Phase Goal:** The money and data-layer foundation is correct and complete, so Record has somewhere to write on day one.
**Verified:** 2026-09-27T00:23:37Z
**Status:** human_needed (all automated checks pass; three items below are legitimate human-verification asks already flagged by the phase's own review, not new gaps found by this verification)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every amount is stored/computed as integer minor units, parsed without `parseFloat`, on every path | ✓ VERIFIED | `grep -rn parseFloat src/ supabase/` → zero hits (two comments *referencing* the rule, no calls). `src/engine/money/arithmetic.ts`, `rounding.ts` operate only through `minorUnits()`/BigInt. `src/engine/money/parseAmount.ts` never calls `Number()`/`parseInt` on anything but a digit-only string it built itself char-by-char; final `Number(digits)` is bounds-checked against `MAX_ABS_AMOUNT_MINOR` via BigInt first. `npx jest src/engine/money src/engine/split src/engine/time` → 11 suites, 295 tests passed. |
| 2 | Splitting an amount across members always sums exactly to the total, largest-remainder rounding | ✓ VERIFIED | `src/engine/split/allocate.ts` — BigInt floor/remainder allocation, deterministic tie-break, `100%` branch coverage per REVIEW-FIX Partition A verification. `npx jest src/engine/split/__tests__/allocate.test.ts` passed as part of the run above. |
| 3 | Home currency + custom currency; FX rate stamped at write time from the project's own store, refreshed daily from Frankfurter v2, publication date shown wherever a converted figure appears | ✓ VERIFIED | Schema: `supabase/migrations/20260924000100_custom_currencies.sql`, `...000500_fx_stamping.sql` (server-only stamp columns, `stamp_fx_rate` trigger). `docs/acceptance/phase-01-money-core.md` Task 3 step 5: live production transaction shows `rate=1.1399000000`, `rate_source='frankfurter-v2'`, `rate_date=2026-09-26`, arithmetic verified by hand. `src/ui/RateAttribution.tsx` renders the stamped date/attribution and is unit-tested (`src/ui/__tests__/RateAttribution.test.tsx`), but is not yet mounted on any screen because no Phase 0/1 screen renders a converted amount — see human_verification item 2. |
| 4 | Every record gets a client-generated UUID before the write leaves the device, and an integer `version` incrementing server-side | ✓ VERIFIED | `src/data/mutations/transactions.ts:312`, `accounts.ts:155`, `customCurrencies.ts:190` — `Crypto.randomUUID()` assigned to the row object before `mutation.mutate()` is called. `supabase/migrations/...accounts.sql` / `...transactions.sql` — `version integer not null default 1` with `bump_version()` trigger on update; pgTAP `05_accounts_transactions.test.sql` and `06_fx_stamping.test.sql` (part of the 24-file/339-test PASS run below). |
| 5 | Offline: previously loaded data browsable, new writes queue and are visibly marked, flush automatically on reconnect | ✓ VERIFIED | `docs/acceptance/phase-01-money-core.md` Task 3 steps 3-5, physical Pixel 9 against production: cold restart under airplane mode rendered from cache (PASS); queued write persisted a force-quit/reopen cycle (PASS); reconnect drained the queue and re-synced (PASS). Code: `src/data/QueryProvider.tsx`, `src/data/mutations/writeClient.ts`, `src/data/sync/*` (paused-mutation resume, session-epoch guard, version-chain resolution — all reviewed and fixed in 01-REVIEW-FIX Partition A). |
| 6 | open.er-api fallback with attribution; staleness alert; >10% overnight move held pending second-source confirmation | ✓ VERIFIED | Live smoke test in acceptance doc: `fx-monitor` returns `{"ok":true,"stale":0,...}`; pgTAP `09_fx_monitoring.test.sql`, `11_fx_hold_lifecycle.test.sql`, `04_fx_rates.test.sql` all pass. `supabase/functions/fx-sync` implements `open-er-api` fallback + `fx_rate_holds` plausibility gate (CR-B01/CR-B02/WR-B02/WR-B03/WR-B04 in 01-REVIEW-FIX). |
| 7 | JPY 0dp / KWD 3dp; 23:30-local stays in local month; locale-formatted amounts/dates; offline cache unreadable without the secure-storage key | ✓ VERIFIED | `src/engine/money/currencyExponents.ts` — full ISO 4217 exception table (0/3/4dp), exhaustive test (`currencyExponents.test.ts`, part of the 295-test pass). `src/engine/time/localDate.ts` — `localDateIn()` derives the calendar day from an IANA zone via `Intl.DateTimeFormat`, never UTC; `transactions.local_date`/`time_zone` columns exist and are NOT NULL with a zone-validity trigger (pgTAP `21_time_zone_validation.test.sql`). `src/data/cache/persister.ts` + `src/services/supabase/largeSecureStore.ts` — AES-CTR encrypted blob, key in `SecureStore` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). |

**Score:** 7/7 roadmap success criteria verified.

### Requirement-by-Requirement Table (all 20 Phase 1 IDs)

| Requirement | REQUIREMENTS.md status (pre-verify) | Verdict | Evidence |
|---|---|---|---|
| **FND-10** | Pending (unticked) | **SATISFIED** | `npm run lint:migrations` → `MIGRATION COMPAT OK (11 files, floor 0.1.0)`. `npm run verify:migrations` → `MIGRATION GATE OK` (38 probes P1-P38 + CLI-version-parity check, all pass live). `scripts/check-migration-compat.mjs` / `scripts/verify-migration-gate.mjs` implement the destructive-DDL probe, floor-bump matching, contract-ok markers per 01-REVIEW-FIX Partition C (CR-C01..CR-C04, WR-C01..WR-C05). CI job `.github/workflows/ci.yml` runs both steps on every push/PR and is green on `main` (`gh run list` shows the last 5 CI runs on main all `success`). |
| **MON-01** | Pending (unticked) | **SATISFIED** | `grep -rn "parseFloat" src/ supabase/` → 0 calls (2 comments citing the rule only). All money arithmetic (`src/engine/money/arithmetic.ts`, `rounding.ts`, `types.ts::minorUnits`) is BigInt/integer-only; `multiplyByInteger` rejects non-safe-integer factors. `npx jest src/engine/money src/engine/split src/engine/time` → 295/295 passed. REVIEW-FIX confirms `engine/money`, `engine/split`, `engine/time`, `engine/guards` at 100% branch/statement/function/line coverage. |
| **MON-02** | Pending (unticked) | **SATISFIED** | `src/engine/money/parseAmount.ts` builds a canonical digit-only string via a character-by-character scan (`normalizeDigit`, Unicode digit blocks) and only calls `Number()`/`BigInt()` on that already-validated string — never on raw user input. Ambiguous grouping is rejected (`'ambiguous-separator'`), not guessed (WR-A10). `npx jest src/engine/money/__tests__/parseAmount.test.ts` passed (property-based round-trip across locales incl. bn-BD/my-MM/fa-IR/th-TH). |
| **MON-03** | Pending (unticked) | **SATISFIED** | `src/engine/split/allocate.ts` — BigInt floor + largest-remainder distribution of the exact leftover, deterministic tie-break (remainder desc, then index asc). `npx jest src/engine/split/__tests__/allocate.test.ts` passed; REVIEW-FIX confirms 100% branch coverage on `engine/split`. |
| MON-04 | Complete | confirmed | `20260924000100_custom_currencies.sql`; pgTAP `08_custom_currencies_prefs.test.sql` passes live. |
| MON-05 | Complete | confirmed | `20260924000500_fx_stamping.sql` (`stamp_fx_rate` trigger); acceptance doc Task 3 step 5 shows a live production transaction with rate/rate_source/rate_date stamped and hand-verified arithmetic. |
| MON-06 | Complete | confirmed | `supabase/functions/fx-sync`; `grep -rn "frankfurter\|open.er-api" src/` shows no client-side provider calls outside comments/RateSource literal — the app reads only `fx_rates`/`fx_latest_rates`. Live smoke: `POST fx-sync` → `200 {"ok":true,"source":"frankfurter-v2"}`. |
| **MON-07** | Pending (unticked) | **SATISFIED** (component); **flagged for human confirmation at wiring time** | `src/ui/RateAttribution.tsx` renders the stamped `rate_date`/attribution or 'Rate pending', tested in `src/ui/__tests__/RateAttribution.test.tsx`. `grep -rn RateAttribution src --include=*.tsx --include=*.ts` shows it is not imported by any screen yet — correctly so, because no Phase 0/1 screen renders a converted amount (Record, which does, ships in Phase 2; confirmed explicitly in `docs/acceptance/phase-01-money-core.md` step 6). The component is built, tested and ready; nothing exists yet for it to be missing from. See human_verification item 2. |
| **MON-08** | Pending (unticked) | **SATISFIED** | `src/data/mutations/transactions.ts:312`, `accounts.ts:155`, `customCurrencies.ts:190` — `const id = Crypto.randomUUID()` is generated and placed on the row object before `mutation.mutate(...)` is invoked, i.e. before the write is even enqueued, let alone leaves the device. `transactions` / `accounts` / `custom_currencies` all declare `id uuid primary key` with no server-side default. |
| MON-09 | Complete | confirmed | `version integer not null default 1` + `bump_version()` trigger on `accounts`/`transactions`/`custom_currencies`; pgTAP passes (24 files/339 tests). |
| MON-10 | Complete | confirmed | `supabase/functions/fx-monitor`; pgTAP `09_fx_monitoring.test.sql`; live smoke `POST fx-monitor` → `200 {"ok":true,"stale":0,...}`. |
| MON-11 | Complete | confirmed | `fx_rate_holds` table + `classifyRates`; pgTAP `11_fx_hold_lifecycle.test.sql`; CR-B01/CR-B02/WR-B03 in REVIEW-FIX. |
| MON-12 | Complete | confirmed | `supabase/functions/fx-sync` open.er-api fallback; `RateAttribution` shows attribution link when `rate_source === 'open-er-api'`; `src/i18n/mandatedCopy.ts` holds the required attribution string, cross-checked by a test against `openErApi.ts`. |
| MON-13 | Complete | confirmed | `src/engine/money/currencyExponents.ts` full ISO 4217 exception table; `currencyExponents.test.ts` asserts all 26 non-2dp codes plus 8 default-2 controls (WR-B09). |
| **MON-14** | Pending (unticked) | **SATISFIED** | `src/engine/time/localDate.ts::localDateIn()` derives the calendar day from an IANA zone via `Intl.DateTimeFormat.formatToParts`, never from a UTC timestamp. `transactions.local_date date not null` / `time_zone text not null` columns exist, with a trigger validating the zone against `pg_timezone_names` (IN-B04). `npx jest src/engine/time/__tests__/localDate.test.ts` passed; WR-A14 test explicitly uses UTC+14/UTC-11 edge zones to prove the day doesn't drift. |
| SYN-01 | Complete | confirmed | Live device acceptance (Task 3 step 3): cold restart under airplane mode rendered from persisted cache. |
| SYN-02 | Complete | confirmed | Live device acceptance (Task 3 steps 4-5): queued write survived force-quit, flushed and synced on reconnect with correct FX stamping. |
| SYN-06 | Complete | confirmed | `useSyncStatus()` (`src/data/sync`); wired into `YouScreen` per 01-15-SUMMARY; live device acceptance step 2 shows "synced just now" / offline text. |
| SYN-07 | Complete | confirmed | `src/data/cache/persister.ts` + `src/services/supabase/largeSecureStore.ts` — AES-CTR ciphertext in AsyncStorage, key in `expo-secure-store` `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. |
| DSG-06 | Complete | confirmed | `formatAmount.ts`/`formatDate.ts`, locale-aware via `Intl`; `currencyExponents`/`formatAmount` tests pass; acceptance doc notes the region-switch device check passed (no visual amount check possible yet since no screen renders one, but unit-test coverage stands in per the doc's own note). |

**Requirement score:** 20/20 accounted for (13 previously ticked reconfirmed with fresh evidence, 7 previously-unticked all resolve to SATISFIED). No requirement is orphaned — every ID in the ROADMAP's Phase 1 `Requirements:` line appears in at least one plan's `requirements:` frontmatter (spot-checked via `grep -n "requirements:" .planning/phases/01-money-core/*-PLAN.md`).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/engine/money/*.ts` | Integer-only money engine | ✓ VERIFIED | 11 files, 295 tests pass, 100% branch coverage per REVIEW-FIX |
| `src/engine/split/allocate.ts` | Largest-remainder split | ✓ VERIFIED | 100% branch coverage, deterministic tie-break |
| `src/engine/time/localDate.ts` | Local-date/timezone maths | ✓ VERIFIED | IANA-zone-aware, no UTC leakage |
| `supabase/migrations/2026092400{01..07}00_*.sql` | Money schema, FX stamping, monitoring | ✓ VERIFIED, applied to production | `docs/acceptance/phase-01-money-core.md` Task 1 — all 7 migrations pushed and confirmed `local=remote` |
| `supabase/functions/{fx-sync,fx-monitor,resolve-rate}` | FX ingest/monitor/backfill Edge Functions | ✓ VERIFIED, deployed | Task 2 — all three deployed, secrets/Vault rows present, live smoke tests pass |
| `src/data/QueryProvider.tsx`, `src/data/mutations/*`, `src/data/sync/*` | Offline write queue, sync bookkeeping | ✓ VERIFIED, wired | Mounted in `app/_layout.tsx` per 01-15-SUMMARY; device-verified end-to-end |
| `src/ui/RateAttribution.tsx` | Rate publication-date display | ✓ VERIFIED (component); ⚠️ not yet mounted anywhere | No Phase 0/1 screen shows a converted figure yet — correctly deferred to Phase 2, not a stub |
| `scripts/check-migration-compat.mjs`, `scripts/verify-migration-gate.mjs` | FND-10 gate | ✓ VERIFIED, wired into CI | Both run live, both pass; CI green on main |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/data/mutations/transactions.ts` | `public.transactions` | `writeClient()` → `db/session.ts::assertSession` → postgrest write | WIRED | Session-guarded write path; auth/transient/rejected/conflict/discarded error classes all tested (01-REVIEW-FIX Partition A) |
| Offline mutation queue | TanStack Query `resumePausedMutations`/`resumeRestoredMutations` | Persisted `pending` mutations replay in original order on reconnect | WIRED | Device-verified (Task 3 steps 4-5); `versionChain.ts` resolves `expectedVersion` across queued edits against the same row |
| `stamp_fx_rate` trigger | `fx_rates`/`fx_latest_rates` | Server-side stamping on insert, `restamp_transaction` on backfill | WIRED | pgTAP `06_fx_stamping.test.sql`, `13_restamp_window.test.sql` pass; production smoke shows a real stamped row |
| `fx-sync`/`fx-monitor` Edge Functions | `pg_cron` | `fx-sync-daily` (16:30 UTC), `fx-monitor-daily` (17:00 UTC) | WIRED | `select jobname, schedule from cron.job` in acceptance doc confirms both jobs scheduled on production |
| `app/_layout.tsx` | `QueryProvider` | Mounted inside `ThemeProvider`, around `AuthProvider` | WIRED | 01-15-SUMMARY + `npx jest app src/features` (10 suites/78 tests) |
| `YouScreen.tsx` | `useSyncStatus()` / `SyncStatusLine` | Direct import and render | WIRED | 01-15-SUMMARY; device-verified sync line text |
| `RateAttribution.tsx` | Any transaction/amount screen | *(none exists yet)* | NOT YET APPLICABLE | Legitimate phase-boundary gap: nothing to wire it to until Phase 2 ships an amount-rendering screen |

### Data-Flow Trace (Level 4)

Not applicable in the traditional sense — Phase 1 ships no UI screens that render dynamic financial data (`UI hint: no` per ROADMAP). The one exception, `YouScreen`'s sync status line and rate-credit link, was traced above and confirmed live on a physical device against production data (real queue counts, real "synced just now" timestamps, real FX-stamped row values).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Engine money/split/time suite green | `npx jest src/engine/money src/engine/split src/engine/time --silent` | 11 suites / 295 tests passed | ✓ PASS |
| Migration compatibility gate | `npm run lint:migrations` | `MIGRATION COMPAT OK (11 files, floor 0.1.0)` | ✓ PASS |
| Migration self-test gate | `npm run verify:migrations` | `MIGRATION GATE OK` (38 probes) | ✓ PASS |
| Engine purity (no db/state/services/ui/react imports) | `npm run depcruise` | `no dependency violations found (150 modules, 436 dependencies)` | ✓ PASS |
| SQL rounding mirror matches TS fixture | `npm run check:money-mirror` | `up to date` | ✓ PASS |
| Full pgTAP suite against linked production schema | `npx supabase test db` | `Files=24, Tests=339, Result: PASS` | ✓ PASS |
| No `parseFloat` anywhere in app/server code | `grep -rn parseFloat src/ supabase/` | 0 calls (2 rule-citing comments only) | ✓ PASS |
| `npm run typecheck` (local sandbox) | `tsc --noEmit` | 4 errors, all in `app/*.tsx`/`ConsentScreen.tsx` route-string literals | ⚠️ SEE NOTE |

**Typecheck note:** the 4 local errors are caused by a stale, gitignored `.expo/types/router.d.ts` (14 lines, only `/` and `/_sitemap` registered) that has not been regenerated on this machine since Phase 0's routes were added — confirmed by `git diff --stat HEAD -- app/` showing zero uncommitted changes to the erroring files, and by `gh run list --branch main` showing the last 5 CI runs on `main` (including the Phase 1 closeout merge) all green, with `npm run typecheck` as an unconditional CI step. This is a local machine artifact, not a Phase 1 (or Phase 0) code defect — none of the 4 errors are in any Phase 1 file, and Phase 1 ships no `app/` routes at all. Not counted as a gap.

### Requirements Coverage

All 20 Phase 1 requirement IDs are declared across the 16 plans' frontmatter (`MON-01`..`MON-14`, `SYN-01/02/06/07`, `FND-10`, `DSG-06`) — see the requirement table above. No orphaned requirements found: cross-referencing `.planning/REQUIREMENTS.md`'s "Phase 1 - Money Core" rows against the union of every plan's `requirements:` array shows a 1:1 match.

### Anti-Patterns Found

None blocking. Two intentionally-partial items carried forward from 01-REVIEW-FIX, both already scoped as deferred/out-of-range edge cases rather than defects in the required path:
- WR-B07 (partial): exact custom-currency conversion inside the representable range has sub-cent drift for extreme unit values (e.g. 1 GOLD = 60,000 USD → 59,999.90); fixing it exactly needs a schema decision, explicitly left open by the reviewer, not required by any Phase 1 success criterion.
- IN-B01 (partial): `resolve-rate` returns a scrubbed `{ok:false}` on internal errors but has no per-user rate limiting yet; flagged as an infrastructure decision, not required by any Phase 1 must-have.

### Human Verification Required

### 1. WR-A11 region-derived separators on a physical device

**Test:** Set device language to English, region to Germany; enter an amount using the German-style separators.
**Expected:** `parseAmount`/`formatAmount` read/render `1.234,56`-style figures correctly using the device's actual region override, not just the language tag.
**Why human:** 01-REVIEW-FIX explicitly flags this as still needing on-device confirmation. The `Intl`-derived code path is unit-tested, but the real OS locale-override behavior can only be confirmed on a device.

### 2. MON-07 RateAttribution mounted once Phase 2 ships an amount-rendering screen

**Test:** Once Record (Phase 2) ships a transaction list/detail screen showing a converted amount, confirm `RateAttribution` (or an equivalent) is rendered next to every such figure.
**Expected:** No converted figure appears anywhere without its rate's publication date visible.
**Why human:** Not a Phase 1 defect — no screen in Phase 0/1 renders a transaction amount at all, so there is nothing to attribute yet. Recorded here so it isn't lost as an implicit Phase 2 obligation.

### 3. WR-B05 / WR-B06 hold-drop restamp heuristic and static ISO 4217 code list

**Test:** Review the row-selection heuristic in `fx_drop_hold`/`fx_restamp_by_rate` and the static withdrawn-currency-code list in `is_iso4217_code` for correctness against real-world edge cases.
**Expected:** The heuristic doesn't silently drop a row back to pending after a relaxed backfill on an unrelated leg, and the code list doesn't miss or wrongly include a withdrawn ISO code.
**Why human:** 01-REVIEW-FIX explicitly marks both "fixed: requires human verification" — implemented and pgTAP-covered, but the reviewer asked for a second pair of eyes on the content, not just the mechanism.

### Gaps Summary

No blocking gaps found. All 7 ROADMAP Success Criteria for Phase 1 are met with direct code, test and production-acceptance evidence. All 20 requirement IDs resolve to SATISFIED, including the 7 that REQUIREMENTS.md still shows unticked (FND-10, MON-01, MON-02, MON-03, MON-07, MON-08, MON-14) — each has concrete file/test/grep evidence above; the orchestrator can tick all 7.

The only reason this report is not a plain `passed` is three items that were already flagged by the phase's own review process as needing a human's eyes (device region check, a schema/product-judgment call on an FX heuristic and code list, and a forward-looking note that MON-07's UI component has nothing to attach to until Phase 2 ships). None of these represent unimplemented or broken Phase 1 work — they are legitimate escalations already on record in `01-REVIEW-FIX.md`.

---

_Verified: 2026-09-27T00:23:37Z_
_Verifier: Claude (gsd-verifier)_
