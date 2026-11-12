---
phase: 06-grow
plan: 11
subsystem: database
tags: [supabase, production, migration]
requires: [06-04, 06-06, 06-07]
provides: [grow schema live in production]
key-files:
  created: []
  modified: []
completed: 2026-11-07
---

# Phase 6 Plan 11: Grow production push

The three Grow migrations are applied to production (`Fincwin United`, ref in `.env.local`), with owner approval.

## Stop rules (all clear before the push)

| Rule | Result |
|------|--------|
| a. CI `supabase test db` green on the PR | Pass, run 42334142679 on commit 6d0f5c24 (pgTAP 89-93 plus the later undo fixes; full `checks` job also green) |
| b. Dry run lists exactly the three Grow migrations | Pass: 20261106000100, 20261106000200, 20261106000300, nothing else |
| c. `decide_settings.safety_net_locked = false` count | 0 |
| Extra (06-04 note): bucket pots with a `ready_by` | 0 |

## Push

- Owner reply: "Push approved" (2026-11-07).
- Pushed 2026-11-07T04:03Z from worktree `C:\dev\fincwin-g6` with `npm run supabase:preflight` then `supabase db push`. The preflight was pointed at the main checkout's env file via `SUPABASE_PREFLIGHT_ENV_FILE`, and the worktree was linked locally with `supabase link` (local `.temp` files only).
- `supabase migration list --linked` shows all three versions with local and remote filled.
- After the push: 1 live safety-net goal, locked; 0 unlocked goals (D-22: existing goals start Locked).

## Deviations

- Before the push, the migrations gained undo fixes after their plans ran:
  - debt plan undo restores `payoff_extra` and `extra_series_id`;
  - `save_goal_plan` and `confirm_goal_contribution` build their own undo steps;
  - chained Undo after system steps;
  - `undo_log_fill` accepts holdings and holding_lots.
- All of these were in the CI run that cleared rule a.

## Self-Check: PASSED
