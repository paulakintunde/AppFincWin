---
phase: 09-tiers-onboarding
plan: 06
subsystem: payments
tags: [revenuecat, webhook, supabase-edge-function, deno, hmac]
requires: ["09-02"]
provides:
  - "_shared/revenuecat/subscriber.ts: fetchSubscriber, toSnapshot, scrubEvent, isUuid, PlanSnapshot"
  - "plan-webhook edge function (verify.ts, sync.ts, index.ts)"
affects: [09-05, 09-07, 09-08]
key-files:
  created:
    - supabase/functions/_shared/revenuecat/subscriber.ts
    - supabase/functions/_shared/revenuecat/subscriber.test.ts
    - supabase/functions/plan-webhook/verify.ts
    - supabase/functions/plan-webhook/verify.test.ts
    - supabase/functions/plan-webhook/sync.ts
    - supabase/functions/plan-webhook/sync.test.ts
    - supabase/functions/plan-webhook/index.ts
    - supabase/functions/plan-webhook/deno.json
    - supabase/functions/_fixtures/revenuecat/ (16 json files)
  modified:
    - supabase/config.toml
    - package.json
requirements-completed: [TIER-07, ENV-12]
completed: 2026-11-18
---

# Phase 9 Plan 06: RevenueCat webhook receiver Summary

A RevenueCat webhook doorbell: HMAC (or Authorization-only) check, event stored once with a scrubbed payload, 200 sent before work, then a fresh subscriber fetch normalised to a snapshot and passed to `plan_apply`.

## Commits
- 9e571f9c feat(09-06): shared module, HMAC verify, 16 fixtures
- 317323de feat(09-06): plan-webhook processEvent, index, config and test:deno

## Behaviour
- Mode selection: HMAC secret set means HMAC only (300 s window, constant-time); else Authorization bearer; neither means 403.
- Duplicate with applied_at set is skipped; unapplied duplicate is processed again; TEST and anonymous events are marked with a note and applied_at.
- TRANSFER applies for each UUID in transferred_from and transferred_to.
- Logs carry type and result only.

## Verification
- `npm run test:deno`: 51 passed. `deno check plan-webhook/index.ts` clean.
- The three new test files also pass under Jest (32 tests), since jest.config.js globs supabase/functions tests. Tests use the dual-runner style from delete.test.ts, not `jsr:@std/assert`, so no network import is needed.
- Not run: the function against a real Supabase project or the real `plan_apply` RPC (09-05 supplies it; tests stub it).

## Deviations from Plan
- Worktree HEAD was not at the base commit at start; reset --hard to 632b1655 per the startup check.
- Test imports: dual-runner assertions instead of `jsr:@std/assert` (matches existing tests, runs under both Deno and Jest).

## Known Stubs
None.

## Self-Check: PASSED
