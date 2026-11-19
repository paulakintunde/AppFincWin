---
phase: 09-tiers-onboarding
plan: 05
subsystem: database
tags: [supabase, plpgsql, pgtap, revenuecat, plans, cron]
requires: [09-03, 09-04]
provides:
  - public.plan_apply (service_role only)
  - public.plan_double_cover_choose / plan_double_cover_state (authenticated)
  - public.plan_sweep, public.plan_sweep_targets, cron jobs plan-sweep-daily and plan-reconcile-daily
affects: [09-06, 09-19]
key-files:
  created:
    - supabase/migrations/20261124000400_plans_apply.sql
    - supabase/tests/database/115_plans_apply.test.sql
metrics:
  tasks: 2
  files: 2
---

# Phase 9 Plan 05: plan_apply, double-cover choice and sweep Summary

One SQL entry point turns a RevenueCat subscriber snapshot into one covering plan row per household, with takeover, the owner's P4 double-cover choice (both payers pick, 7-day default keeps the takeover plan, home never uncovered), grace, trial ledger, and a daily sweep.

## Commits
- 37fb2d25 test(09-05): failing pgTAP 115 (RED)
- b53abd93 feat(09-05): migration 20261124000400_plans_apply.sql (GREEN)

## What was built
- Double-cover columns on `household_plans` (`dc_*`, `dc_new_payer`, `double_cover_since`, `chosen_payer`, `chosen_by`, `chosen_at`). dc_* always holds the subscription that is not covering. No new table.
- `plan_apply(uuid, jsonb, text)` is a wrapper over `plan_apply_inner`. The wrapper marks the webhook row applied on every return path, supersedes earlier unapplied rows for the same user, admits waiting joiners and resets the bypass setting. Paths and notes: applied, takeover, grace, lapsed, double_cover (extra buyer), double_cover_opened, double_cover_updated, double_cover_ended, double_cover_fallback, not_chosen, not_entitled, unknown_product, no_household.
- `plan_double_cover_choose`: only the two payers (42501 otherwise), keep-payer must be one of them (22023), idempotent (first pick, default or fallback wins), D-44 fit check (`plan_too_small`), old-plan pick swaps covering and dc_* in one UPDATE. Tells the payer who was not picked.
- `plan_double_cover_state`: shape from the plan interface, null unless the caller is one of the two payers and dc is live.
- `plan_sweep`: plan_locked notices once per lapse, 7-day default (keeps the takeover plan, tells the old payer), 13-month leave-log purge. `plan_sweep_targets`: payers near expiry or stale, unapplied stored events (uuid-shaped, not TEST, 10 min to 7 days old, even with no plan row), and dc payers.
- Cron: `plan-sweep-daily` (00:35) and `plan-reconcile-daily` (00:50, posts mode sweep with vault secrets).

## Deviations from Plan
- [Rule 3] plan_apply split into `plan_apply` and `plan_apply_inner` plus `plan_events_mark_applied`, so the closing step runs once for every return path (the plan allowed a helper). Inner and mark helper are revoked from all client roles.
- Fallback and swap paths also clear `trial_started_at` / `trial_ends_at`, so a stale trial window does not follow a swapped-in paid plan.
- `plan_double_cover_state` returns null once the dc subscription has ended (no second plan to choose from), which the plan did not spell out.
- Acceptance greps that are literal counts: `plan_apply(` appears 3 times in the test file (the test calls it through a `t115_apply` helper, which does not match that literal). Every other listed grep is met (117 assertions, plan(117) matches; cancel grep outside comments = 0; 2 cron.schedule calls).

## Verification
- Not run locally: no local Supabase stack in this environment. pgTAP 115 (117 assertions, `plan(117)` counted by script) and the full suite are to be run by CI (rls job). The migration and test were checked by reading against the 09-02/09-04 definitions only; a first CI run may surface typos.

## Known Stubs
None. Vault secrets `plan_refresh_url` and `plan_sweep_secret` are created in 09-07; until then the reconcile job posts to a null URL and fails harmlessly (as planned).

## Threat Flags
None beyond the plan's register (T-09-18..T-09-21 covered: service_role-only apply, payer-only choose with 42501/22023, once-only pick under household row lock, fallback keeps the home writable).

## Self-Check
- supabase/migrations/20261124000400_plans_apply.sql: FOUND
- supabase/tests/database/115_plans_apply.test.sql: FOUND
- commits 37fb2d25, b53abd93: FOUND
- Result: PASSED (files and commits; database tests unrun, see Verification)
