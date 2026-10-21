---
phase: 05-decide-ui
plan: 25
subsystem: release-gate
tags: [gate, coverage, migrations, production-push]
status: complete
tasks_completed: 2
tasks_total: 2
completed: 2026-10-21
---

# Phase 5 Plan 25: Local gate and production push — Summary

**Both tasks are done. Task 1 (full local gate) was green on 2026-10-21. Task 2 (the production `supabase db push`) was run on 2026-10-21 from the main session by the orchestrator, with the user's explicit approval.**

## Task 1: full local gate — DONE (2026-10-21, worktree C:\dev\fincwin-p5, branch phase/05-decide-ui)

Run in the plan's order; every command exited 0. No fixes were needed.

| # | Command | Result |
|---|---------|--------|
| 1 | `npm run lint` | exit 0 — 0 errors, 721 warnings |
| 2 | `npm run typecheck` | exit 0 |
| 3 | `npm run depcruise` | exit 0 — no dependency violations (656 modules, 4429 dependencies) |
| 4 | `npm run check:ignores` | exit 0 — "no unreasoned coverage ignores in 100% folders" |
| 5 | `npm run test:coverage` | exit 0 — 528/528 suites, 16186 passed, 14 skipped; no coverage threshold failures |
| 6 | `npm run verify:gates` | exit 0 — GATES OK |
| 7 | `npm run lint:migrations` | exit 0 — MIGRATION COMPAT OK (41 files, floor 0.1.0); two pre-existing warnings on 20261007000300 (comment text mentions min_supported_version) |
| 8 | `npm run verify:migrations` | exit 0 — MIGRATION GATE OK (supabase pinned 2.117.0, matches ci.yml) |
| 9 | `npm run check:money-mirror` | exit 0 — up to date |
| 10 | `npm run check:recurring-mirror` | exit 0 — up to date |
| 11 | `npm run check:decide-demo-mirror` | exit 0 — DECIDE DEMO MIRROR OK (38 keys) |
| 12 | `npx supabase db reset --local` | SKIPPED — Docker not running on this machine |
| 13 | `npx supabase test db` | SKIPPED — Docker not running; CI's `rls` job stands in (below) |

### Coverage on the 100% paths (from `coverage/coverage-final.json`, test files excluded)

| Path | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| src/engine/decide/ | 100% (1517/1517) | 100% (1137/1137) | 100% (201/201) | 100% (1368/1368) |
| src/engine/payoff/ | 100% (288/288) | 100% (163/163) | 100% (33/33) | 100% (274/274) |
| src/engine/undo/ | 100% (95/95) | 100% (51/51) | 100% (17/17) | 100% (92/92) |
| src/features/decide/snapshot/ | 100% (774/774) | 100% (787/787) | 100% (132/132) | 100% (630/630) |
| src/features/decide/journal/ | 100% (128/128) | 100% (100/100) | 100% (29/29) | 100% (100/100) |
| src/features/decide/charts/chartGeometry.ts | 100% (51/51) | 100% (25/25) | 100% (11/11) | 100% (41/41) |
| src/engine/ (all, 136 files) | 100% | 100% | 100% | 100% |

### pgTAP stand-in

Local pgTAP could not run (Docker down). CI's `rls` job on PR #82 runs `supabase db reset` plus `supabase test db` against a fresh local stack on every push. Run 39526523141 (head dddb863, the last code-identical-for-SQL run) reports `54_decide_tables`, `55_decide_patches`, `56_decide_outcomes`, `57_decide_demo_seed`, `58_decide_depth_tables` and `59_record_one_off_goal_tag` all `ok`. The run for this commit is recorded in STATE.md / the PR.

## Task 2: push the Phase 5 migrations to production — DONE (2026-10-21)

Run by the orchestrator in the main session with the user's explicit approval (not by an executor).

- Preflight passed: `supabase/config.toml` project_id matched `SUPABASE_PROD_PROJECT_REF` (cohmcbdfgqmiwykztrdg, the single production project).
- A dry run listed exactly the six Phase 5 migrations as pending; the push applied all six: 20261016000100, 20261016000110, 20261016000120, 20261016000200, 20261016000300, 20261016000400.
- Verified: `npx supabase migration list --linked` shows all six in both Local and Remote, and a second dry run reports "Remote database is up to date."
- No token or password appears in any log or this SUMMARY; the Supabase MCP connector was not used. The worktree was linked by copying the gitignored `supabase/.temp` from the main checkout.

The command as run, for the record. From `C:\dev\fincwin-p5` in Git Bash:

```
cd /c/dev/fincwin-p5 && set -a && . C:/dev/fincwin/.env.local && set +a && npm run supabase:db:push
```

The preflight (`scripts/supabase-preflight.mjs`) must report that `supabase/config.toml`'s project_id matches `SUPABASE_PROD_PROJECT_REF` before `supabase db push` lists pending migrations. Accept only if exactly these six are pending:

1. `20261016000100_decide_tables.sql`
2. `20261016000110_decide_depth_tables.sql`
3. `20261016000120_record_one_off_goal_tag.sql`
4. `20261016000200_decide_patches.sql`
5. `20261016000300_decide_outcomes.sql`
6. `20261016000400_decide_demo_seed.sql`

Then `npx supabase migration list --linked` (same export) must show all six in Local and Remote. Never print the token or password; never use the Supabase MCP connector.
