# Phase 1 (money-core) — Production + Device Acceptance Record

Plan: `.planning/phases/01-money-core/01-16-PLAN.md`. Executed against the
single (production) Supabase project, ref `cohmcbdfgqmiwykztrdg`. No secret
value appears anywhere in this document.

---

## Task 1: Full local gate, then push the schema to production

**Date:** 2026-09-26

### Full local gate

First pass (`npm run lint && npm run typecheck && npm run depcruise && npm run check:ignores && npm run test:coverage && npm run verify:gates && npm run lint:migrations && npm run verify:migrations && npm run check:money-mirror && npx supabase db reset --local && npx supabase test db`):
lint/typecheck/depcruise/check:ignores all passed; `test:coverage` failed
with **2 of 1192 tests failing on Jest's 5000ms async timeout** (not a
logic failure) under parallel-worker CPU contention right after a fresh
`npm ci`:
- `src/features/you/__tests__/YouScreen.test.tsx` — "renders the user's full name and email sub-label"
- `src/features/auth/__tests__/WelcomeScreen.test.tsx` — "shows the sign-in-failed error and calls captureError when a sign-in rejects"

Both files are outside this plan's scope (`files_modified: docs/acceptance/phase-01-money-core.md` only) — no code or test was touched to cause this. Re-ran each file individually: **23/23 passed** (28.7s total, well under the 5s per-test budget when not contending with 70 other suites). Re-ran the remaining gate steps as a second pass starting from `test:coverage`:

**Result: full local gate green.**
- `npm run test:coverage`: **72 suites / 1192 tests passed**, coverage thresholds met (money/split engine folders at 100%).
- `npm run verify:gates`: `GATES OK` (5 probes: engine purity via depcruise + eslint, coverage gate, coverage-ignore reasoning).
- `npm run lint:migrations`: `MIGRATION COMPAT OK (11 files, floor 0.1.0)`.
- `npm run verify:migrations`: `MIGRATION GATE OK` (38 probes P1–P38 plus the CLI-version-parity check, all as expected).
- `npm run check:money-mirror`: `up to date`.
- `npx supabase db reset --local`: all 11 migrations (000100–000400 from Phase 0, 20260924000100–000700 from Phase 1) applied cleanly.
- `npx supabase test db`: **24 files, 339 tests, `Result: PASS`**.

### Production schema push

Linked the worktree to the production project (`supabase link --project-ref cohmcbdfgqmiwykztrdg`, token read from `.env.local` into the CLI's environment by a Node one-liner that never echoes it), then:

```
npm run supabase:db:push -- --yes
```

Preflight passed (`config.toml` project_id matches `SUPABASE_PROD_PROJECT_REF`). The push was **not refused by the sandbox** this time (contrast with the 00-09 precedent) and applied all seven Phase 1 migrations:

```
Applying migration 20260924000100_custom_currencies.sql...
Applying migration 20260924000200_money_prefs.sql...
Applying migration 20260924000300_accounts.sql...
Applying migration 20260924000400_transactions.sql...
Applying migration 20260924000500_fx_stamping.sql...
Applying migration 20260924000600_fx_monitoring.sql...
Applying migration 20260924000700_fx_monitor_jobs.sql...
{"upToDate":false,"dryRun":false,"message":"Finished supabase db push."}
```

`npx supabase migration list --linked` (excerpt — every entry shows the same value in both columns):

```
20260922000100  local=remote  2026-09-22 00:01:00
20260922000200  local=remote  2026-09-22 00:02:00
20260922000300  local=remote  2026-09-22 00:03:00
20260922000400  local=remote  2026-09-22 00:04:00
20260924000100  local=remote  2026-09-24 00:01:00
20260924000200  local=remote  2026-09-24 00:02:00
20260924000300  local=remote  2026-09-24 00:03:00
20260924000400  local=remote  2026-09-24 00:04:00
20260924000500  local=remote  2026-09-24 00:05:00
20260924000600  local=remote  2026-09-24 00:06:00
20260924000700  local=remote  2026-09-24 00:07:00
```

Every Phase 1 migration (20260924000100 through **20260924000700**) is now
applied to production. The production schema matches git for every Phase 1
migration.

---

## Task 2: Deploy Edge Functions, set secrets and Vault, smoke-test live

_(recorded below once complete)_
