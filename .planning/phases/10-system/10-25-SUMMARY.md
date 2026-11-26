---
phase: 10-system
plan: 25
subsystem: auth
tags: [reviewer-account, pg_cron, ops-script, welcome-screen]
requires: [10-04, 10-12, 10-19]
provides: [reset_reviewer_account, reviewer-reset-nightly, create-reviewer-accounts script, ReviewerSignInSheet, reviewerSignIn service]
key-files:
  created:
    - supabase/migrations/20261126000800_reviewer_seed.sql
    - supabase/tests/database/128_reviewer_seed.test.sql
    - scripts/ops/create-reviewer-accounts.mjs
    - docs/ops/reviewer-account.md
    - src/services/auth/reviewerSignIn.ts
    - src/services/auth/__tests__/reviewerSignIn.test.ts
    - src/features/auth/ReviewerSignInSheet.tsx
    - src/features/auth/__tests__/ReviewerSignIn.test.tsx
  modified:
    - docs/ops/decide-never-on.json
    - src/features/auth/WelcomeScreen.tsx
    - src/features/auth/__tests__/WelcomeScreen.test.tsx
requirements: [ACC-11]
completed: 2026-11-23
---

# Phase 10 Plan 25: Reviewer account life and visible sign-in Summary

A visible "App review sign-in" link and sheet on the signed-out screen, a nightly `reset_reviewer_account()` that restores a full sample life for the two store-review accounts, an operator script that creates them, and never-on entries so they can never be Decide testers.

## What was built
- Migration 0800: `reset_reviewer_account()` (security definer, service_role only). Finds both users through `reviewer_allowlist.note`; no-op if either is missing. Wipes every household-scoped row of the reviewer household (retry passes for FK order), upserts the top plan (extended, 12, promo/owner, 400 days), adds the partner as a member, runs `seed_sample_data` as the reviewer, adds a goal/debt if the demo made none, makes the everyday account joint and marks up to 6 latest spends shared and paid by the partner, then clears `is_sample` everywhere. Cron `reviewer-reset-nightly` at 09:30 UTC. Never writes the Decide-testing flag.
- pgTAP 128 (13 assertions): skipped without allow-list, 3 past months, goal, debt, 2 members, top plan, partner-paid line, zero sample rows, idempotent counts, unrelated user untouched, Decide flag not on, no authenticated/anon execute.
- Ops script: refuses unless the env ref equals `supabase/config.toml` project_id; fetches the service key in memory; allow-list first, then admin user create with fixed ids (409/422 tolerated), link, reset. Prints step names, HTTP codes and masked emails only. Reads the five variables from `C:/dev/fincwin/.env.local` (or `ENV_FILE`), else the environment. `--dry-run` makes no network calls. Not run against production.
- `docs/ops/reviewer-account.md` runbook and review-notes text; never-on list has both fixed ids.
- Client: `reviewerSignIn()` (invoke `reviewer-signin`, then `setSession`, every failure is 'invalid'), `ReviewerSignInSheet` (Email, Password secure, Sign in, Cancel, one refusal line, fields cleared on close), WelcomeScreen link (44 pt, label style, inkMuted, no tap-count gesture) and the signed-out reason line ('remote' / 'deleted').

## Verification
- `npx jest --no-watchman -i src/features/auth src/services/auth`: 11 suites, 91 tests passed.
- eslint on touched files clean; `npm run lint:migrations` OK; `npm run check:decide-switch` OK (2 never-on); script `--dry-run` OK.
- pgTAP 128: **run by orchestrator after merge** (shared local stack, not run here).

## Deviations
- [Rule 1] The sign-out reason is read in a `useState` initializer through the non-consuming `lastSignOutReason()` and cleared in an effect (lint rule forbids setState in effects).
- Plan said clearing `is_sample` by update; the guard triggers pin `is_sample`, so step 6 runs with `session_replication_role = replica` (inside a begin/exception; only touches `is_sample`, no foreign keys). Untested against the real local stack: if postgres lacks the privilege the exception is swallowed and pgTAP "nothing is marked sample" will fail, which is the signal to fix.

## Orchestrator notes
- Run pgTAP 128 after merge; things to watch: the wipe loop (a delete blocked by a trigger would be swallowed and show as leftover rows), `household_members` insert triggers, and the replica-role step.
- Owner steps remain: reviewer emails and password in `.env.local` (10-01), run the ops script, enable the before-user-created hook in the hosted dashboard.

## Known Stubs
None.

## Commits
- 4be03ae5 feat(10-25): reset_reviewer_account, nightly cron, pgTAP 128
- a4424e84 feat(10-25): operator script, runbook, never-on entries
- 13bf3ba1 feat(10-25): visible App review sign-in link, sheet, signed-out reason line

## Self-Check: PASSED
