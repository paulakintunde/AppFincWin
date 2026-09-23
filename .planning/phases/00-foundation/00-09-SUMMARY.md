---
phase: 00-foundation
plan: 09
subsystem: database
tags: [supabase, edge-functions, pg_cron, pg_net, vault, frankfurter, fx]

# Dependency graph
requires:
  - phase: 00-foundation (plan 06)
    provides: linked production Supabase project (Fincwin United, ref cohmcbdfgqmiwykztrdg), migrations-only workflow, pgTAP fixture pattern
provides:
  - "public.fx_rates table (ENV-08): authenticated-read-only reference FX rate store, numeric(24,10), written only by the fx-sync Edge Function's service-role key"
  - "fx-sync Edge Function, deployed to production, verify_jwt=false, authenticated by a constant-time-compared shared secret header"
  - "pg_cron job fx-sync-daily (30 16 * * *) invoking fx-sync via pg_net, with the URL and secret read from Vault at invoke time"
  - "A tested, zero-import Frankfurter v2 parser (parse.ts) shared verbatim between Deno and Jest"
affects: [money-core-phase (MON-06, MON-12 consume fx_rates and add the open.er-api fallback + jump-hold logic)]

# Tech tracking
tech-stack:
  added: [Frankfurter v2 (api.frankfurter.dev), pg_cron, pg_net, Supabase Vault, Deno.serve Edge Function runtime]
  patterns:
    - "Zero-import pure-logic module (parse.ts) loaded identically by Deno (fx-sync/index.ts) and Jest (parse.test.ts) -- no runtime-specific glue, no mocking needed to unit-test the parser"
    - "Edge Function auth via a constant-time-compared shared-secret header (x-fx-sync-secret), not a user JWT, for endpoints invoked by pg_cron rather than by clients (config.toml verify_jwt = false)"
    - "pg_cron + pg_net + Vault: the cron job's SQL reads url/secret from vault.decrypted_secrets at invoke time, so no secret value is ever written into a migration or git; Vault rows themselves are created out-of-band via the Management API, not a migration"
    - "fx_rates check constraint whitelists both 'frankfurter-v2' and the not-yet-built 'open-er-api' source up front, so Money Core's MON-12 fallback needs no constraint migration of its own"

key-files:
  created:
    - supabase/migrations/20260922000300_fx_rates.sql
    - supabase/migrations/20260922000400_fx_sync_schedule.sql
    - supabase/functions/fx-sync/index.ts
    - supabase/functions/fx-sync/parse.ts
    - supabase/functions/fx-sync/parse.test.ts
    - supabase/functions/fx-sync/deno.json
    - supabase/tests/database/04_fx_rates.test.sql
  modified:
    - supabase/config.toml

key-decisions:
  - "Task 1 (tdd=true) shipped the migration, pgTAP test, parser and parser test in one commit rather than strict RED-then-GREEN commits, because the plan's own <action> block specifies all four as one numbered sequence, not a failing-test-first split, and the plan's frontmatter type is execute, not the plan-level tdd gate. See TDD Gate Compliance below."
  - "04_fx_rates.test.sql adds a 6th assertion beyond the plan's literal 5 (an unknown source value also violates the check constraint), for symmetry with the currency-shape and rate-sign assertions already required."
  - "Task 3 (the BLOCKING production push, secrets, deploy and live proof) was executed by the orchestrator, not this executor agent, at the user's explicit instruction, after the sandbox's Bash auto-mode classifier refused the executor's own attempt at `supabase db push --linked` with reason [Production Deploy]. No secret value was ever echoed, logged or committed by either the executor or the orchestrator's run."

patterns-established:
  - "Any future scheduled Edge Function follows this shape: verify_jwt = false, a constant-time shared-secret header check, Vault-held URL/secret referenced from the cron job's SQL body, and a zero-import parser module unit-testable outside Deno."

requirements-completed: [ENV-08, ENV-04]

# Metrics
duration: ~40min
completed: 2026-09-23
---

# Phase 00 Plan 09: Frankfurter v2 FX Rate Sync Summary

**Deployed a scheduled fx-sync Edge Function to the production Supabase project that pulls Frankfurter v2 daily, validates it against a strict zero-import parser, and upserts into a new authenticated-read-only fx_rates table -- proven locally with 10 Jest cases and 6 new pgTAP assertions, then proven live with a real invoke returning 165 rates.**

## Performance

- **Duration:** ~40 min (Tasks 1-2 by this executor; Task 3 run by the orchestrator after a sandbox permission denial, see Deviations)
- **Completed:** 2026-09-23
- **Tasks:** 3 (2 `type=auto` by this executor, 1 `type=auto [BLOCKING]` executed by the orchestrator)
- **Files modified:** 7 created, 1 modified

## Accomplishments
- `public.fx_rates` (`numeric(24,10)`, composite PK on `base, quote, rate_date, source`, index on `(quote, rate_date desc)`): RLS lets any authenticated user `select`, revokes all client writes and all anon access, and its `source` check already whitelists `open-er-api` for Money Core's future fallback (ENV-08, ENV-04)
- `parse.ts`: a zero-import Frankfurter v2 validator/mapper -- rejects the v1 object shape, empty arrays, non-ISO dates, non-3-letter or lowercase currency codes, and non-finite or non-positive rates (each naming the offending array index), while silently skipping `base === quote` entries; loads identically under Deno and Jest with no glue code
- `fx-sync/index.ts`: a `Deno.serve` handler gated by a constant-time-compared `x-fx-sync-secret` header, fetching `frankfurter.dev/v2/rates?base=EUR`, parsing via `parse.ts`, and upserting into `fx_rates` with the service-role key Supabase injects into the function runtime (never set by client code)
- `20260922000400_fx_sync_schedule.sql`: `pg_cron` job `fx-sync-daily` at `30 16 * * *` UTC, calling `fx-sync` via `pg_net` with the URL and secret read from `vault.decrypted_secrets` at invoke time -- no secret value in any migration or in git
- Local proof: `npx jest supabase/functions/fx-sync` -- 10/10 passing; `supabase db reset` applies all four migrations (000100-000400) cleanly; `supabase test db` -- 41/41 pgTAP assertions across 4 files, `Result: PASS`
- Production proof (run by the orchestrator, see Deviations): migrations 000300 and 000400 applied remotely (`supabase migration list --linked` shows 000100-000400 both local and remote); `FX_SYNC_SECRET` set as a function secret; `fx-sync` deployed (`--no-verify-jwt`, 758 kB bundle); Vault rows `fx_sync_url` and `fx_sync_secret` created via the Management API (HTTP 201); a correct-secret invoke returned `{"ok":true,"count":165,"date":"2026-09-23"}`; a wrong-secret invoke returned `403`; `fx_rates` holds 165 `frankfurter-v2` rows with `max(rate_date) = 2026-09-23`; `cron.job` has exactly one `fx-sync-daily` row with schedule `30 16 * * *`

## Task Commits

Each task was committed atomically:

1. **Task 1: fx_rates migration, pgTAP test, and the tested Frankfurter v2 parser** - `1917fd9` (test)
2. **Task 2: fx-sync Edge Function and the pg_cron schedule migration** - `3e8667e` (feat)
3. **Task 3: [BLOCKING] Push migrations, set secrets, deploy fx-sync to production, and prove fx_rates fills** - no commit from this task; the two migration files pushed were already committed in Tasks 1-2 above (see Deviations for how this task was actually executed)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `supabase/migrations/20260922000300_fx_rates.sql` - `fx_rates` table, RLS, index, comment
- `supabase/migrations/20260922000400_fx_sync_schedule.sql` - `pg_cron`/`pg_net` extensions, `fx-sync-daily` schedule reading Vault at invoke time
- `supabase/functions/fx-sync/index.ts` - `Deno.serve` handler: secret check, fetch, parse, upsert
- `supabase/functions/fx-sync/parse.ts` - pure Frankfurter v2 validator/mapper, zero imports
- `supabase/functions/fx-sync/parse.test.ts` - 10 Jest cases against the plan's own fixture
- `supabase/functions/fx-sync/deno.json` - minimal `{ "imports": {} }`
- `supabase/tests/database/04_fx_rates.test.sql` - 6 pgTAP assertions (read/write RLS, 3 check-constraint cases)
- `supabase/config.toml` - added `[functions.fx-sync]` with `verify_jwt = false`

## Decisions Made
- Kept Task 1's migration, pgTAP test, parser and parser test as one commit rather than splitting into RED/GREEN commits -- the plan's `<action>` block lists all four as a single numbered sequence rather than a failing-test-first split, and the plan's frontmatter `type` is `execute` (the plan-level TDD gate only applies to `type: tdd` plans). Documented under TDD Gate Compliance below rather than treated as a silent omission.
- Added a 6th pgTAP assertion (unknown `source` value also violates the check constraint) beyond the plan's literal 5, for the same reason the plan itself widened the `source` check to include `open-er-api` up front -- cheap to prove now, and it protects the same constraint MON-12 will later rely on.
- `20260922000400_fx_sync_schedule.sql`'s cron job runs and fails harmlessly against the local stack (Vault secrets are null there), exactly as the plan specifies -- no local-only guard was added, since a harmless failure is the intended local behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - completeness] Added a 6th pgTAP assertion for an unknown `source` value**
- **Found during:** Task 1
- **Issue:** The plan's `<behavior>` lists 5 assertions for `04_fx_rates.test.sql`; the migration's `source` check constraint (`in ('frankfurter-v2', 'open-er-api')`) is exercised nowhere.
- **Fix:** Added a 6th `throws_ok` assertion inserting a row with `source = 'bogus-source'`, expecting `23514`.
- **Files modified:** `supabase/tests/database/04_fx_rates.test.sql`
- **Verification:** `supabase test db` -- `04_fx_rates.test.sql` passes all 6 assertions.
- **Committed in:** `1917fd9`

---

**2. [Rule 3 - blocking, execution-environment] Task 3 executed by the orchestrator, not this executor**
- **Found during:** Task 3
- **Issue:** This executor's own attempt to run `supabase db push --linked` (the first command of the BLOCKING production-push task) was refused by the sandbox's Bash auto-mode classifier with reason `[Production Deploy]`, before the command ran. Per this run's instructions ("If a push or deploy fails in a way you'd need to work around by changing the target, STOP and return a checkpoint rather than improvising"), the executor stopped and returned a `human-action` checkpoint with the exact remaining commands, rather than attempting any workaround.
- **Fix:** The orchestrator ran Task 3 on the user's explicit instruction ("if possible run on my behalf") and reported the results back verbatim, which are recorded in this SUMMARY's Accomplishments and Production proof sections. No secret value (the generated `FX_SYNC_SECRET`, the Vault-held `fx_sync_url`/`fx_sync_secret`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, or the service-role key) was echoed, logged or committed at any point by either the executor or the orchestrator's run. `FX_SYNC_SECRET` was generated by this executor via `node -e "require('crypto').randomBytes(32).toString('hex')"` and appended to the gitignored `.env.local` before the handoff; `.env.local` remains untracked (`git ls-files | grep '^\.env'` shows only `.env.example`).
- **Files modified:** None beyond what Tasks 1-2 already committed; the migrations pushed in Task 3 are the same files committed in Tasks 1-2.
- **Verification:** Orchestrator-reported: `supabase migration list --linked` shows 20260922000100 through 20260922000400 present both local and remote; correct-secret invoke returned `{"ok":true,"count":165,"date":"2026-09-23"}`; wrong-secret invoke returned `403`; Management API query shows `fx_rates` count 165 (`source='frankfurter-v2'`, `max(rate_date) = 2026-09-23`) and one `cron.job` row (`fx-sync-daily`, schedule `30 16 * * *`).
- **Committed in:** N/A (no new file changes attributable to Task 3 itself; the deployed function and pushed migrations are the files from `1917fd9`/`3e8667e`)

---

**Total deviations:** 2 (1 auto-fixed test-completeness addition, 1 execution-environment handoff -- no scope, architecture or security-posture change)
**Impact on plan:** None on scope, schema, or the shipped code. ENV-08 and ENV-04 both hold on the production project exactly as the plan specifies; only the *operator* of Task 3's commands changed (orchestrator instead of this executor), driven by a sandbox permission boundary, not a plan or code defect.

## TDD Gate Compliance

Task 1 carries `tdd="true"` but this plan's frontmatter `type` is `execute`, not `tdd` -- the strict plan-level RED-then-GREEN gate enforcement in the executor workflow applies only to `type: tdd` plans. Task 1's own `<action>` block specifies the migration, pgTAP test, parser and parser test as one numbered sequence rather than a failing-test-first split, and all four were written and verified together in a single `test(00-09): ...` commit (`1917fd9`). Both test suites (Jest and pgTAP) were run and passed before the commit, satisfying the substance of "prove it with tests" even though the commit history does not show a separate `test(...)` (failing) commit followed by a `feat(...)` (passing) commit. Flagged here for visibility rather than left silent.

## Issues Encountered
- The sandbox's Bash auto-mode classifier blocks any command that touches `.env.local` by path when combined in the same reasoning context as a preceding denied production-deploy command (a plain `git status --short` succeeded immediately afterward with no `.env.local` reference, confirming the block was specific to the file reference plus the prior denial, not a blanket Bash lockout). No workaround was attempted; this is documented for anyone debugging a similar denial in a future session.

## User Setup Required

None further. The one manual/orchestrator-run step this plan required (the production push, secret set, function deploy, Vault writes and live invoke) is already complete per the orchestrator's report above. No pending external configuration remains for ENV-08 or ENV-04.

## Next Phase Readiness
- `fx_rates` is live in production with 165 currency pairs as of 2026-09-23 and refreshes daily at 16:30 UTC -- Money Core's MON-06 (rate storage per transaction/settlement) and MON-12 (open.er-api fallback, staleness/jump-hold logic) can build directly on this table and its `source` check constraint with no migration of their own needed to add the fallback source.
- The zero-import `parse.ts` pattern (pure logic, loadable by both Deno and Jest) is available as a template for any future scheduled Edge Function that needs the same dual-runtime testability.
- No blockers for the next phase.

---
*Phase: 00-foundation*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 8 created/modified files verified present on disk; both executor task commits (`1917fd9`, `3e8667e`) verified present in `git log`. Task 3's production results (migration list, invoke responses, Management API query results) are as reported by the orchestrator and are not independently re-verifiable by this executor per the "do NOT re-run any production commands" instruction.
