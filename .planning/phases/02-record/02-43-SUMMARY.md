---
phase: 02-record
plan: 43
subsystem: fx / edge-functions
tags: [fx, gap-closure, supabase-functions, refactor]
requires: []
provides:
  - supabase/functions/_shared/fx/ (parse, openErApi, plausibility, digest + tests)
affects: [02-44, 02-50]
key-files:
  created:
    - supabase/functions/_shared/fx/digest.ts
    - supabase/functions/_shared/fx/digest.test.ts
  modified:
    - supabase/functions/resolve-rate/resolve.ts
    - supabase/functions/resolve-rate/resolve.test.ts
    - supabase/functions/resolve-rate/index.ts
    - supabase/config.toml
    - src/i18n/__tests__/mandatedCopy.test.ts
    - src/i18n/mandatedCopy.ts
    - src/i18n/locales/en.ts
  moved:
    - supabase/functions/_shared/fx/{parse,openErApi,plausibility}{,.test}.ts (git mv from fx-sync)
  deleted:
    - supabase/functions/fx-sync/, supabase/functions/fx-monitor/
requirements: [MON-11, MON-12, ENV-08]
metrics:
  completed: 2026-10-07
---

# Phase 02 Plan 43: On-demand FX, shared library and function removal Summary

Moved the pure FX modules into `supabase/functions/_shared/fx/` (history preserved via `git mv`), deleted the `fx-sync` and `fx-monitor` function directories from the repo, and re-pointed resolve-rate and the client attribution pin.

## Commits
- 957d263 refactor: move pure FX modules to `_shared/fx` (tasks 1)
- c9db3c6 refactor: delete fx-sync/fx-monitor, re-point resolve-rate + mandatedCopy test, trim config.toml (task 2)

## For plan 02-44
The pre-deletion commit is **957d263**. Recover with:
`git show 957d263:supabase/functions/fx-sync/sync.ts` and `git show 957d263:supabase/functions/fx-sync/sync.test.ts` (witness / confirmHolds logic).

## Verification
- `npx jest --ci supabase/functions src/i18n`: 8 suites, 1768 tests pass
- `npm run typecheck`, `npm run depcruise`: clean; `npm run lint`: 0 errors (254 pre-existing warnings)
- No `functions/fx-sync` references in src or supabase/functions; no references in CI/scripts/config
- `npm run supabase:preflight` skipped: no `.env.local` in this worktree

## Deviations from Plan
None. `npm ci --legacy-peer-deps` was needed (node_modules absent); the worktree HEAD was reset to the intended base 29c9755 first.

## Out-of-scope leftovers (not changed)
Comments naming fx-sync/fx-monitor remain in other plans' territory: SQL migrations and pgTAP tests (02-41), `.env.example` secrets (FX_SYNC_SECRET, FX_MONITOR_SECRET, RESEND_*), `src/db/currencies.ts`, `src/data/queries/currencyOptions.ts`, `src/data/queries/currencies.ts` (02-45), `src/data/mutations/transactionCache.ts`, and wording in resolve-rate/resolve.ts comments. The pg_cron jobs fx-sync-daily / fx-monitor-daily still exist in the migrations and in production; removal is 02-41/02-50.

## Safety
Nothing deployed, undeployed or deleted in Supabase; local git only.

## Self-Check: PASSED
