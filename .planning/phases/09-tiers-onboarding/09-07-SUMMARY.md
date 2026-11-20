---
phase: 09-tiers-onboarding
plan: 07
subsystem: payments
tags: [revenuecat, supabase-edge-function, deno, promotional-entitlement]
requires: ["09-06"]
provides:
  - "plan-refresh edge function: caller re-sync and daily sweep"
  - "plan-grant edge function: operator-only tester and owner promotional grants"
affects: [09-10, 09-14]
key-files:
  created:
    - supabase/functions/plan-refresh/{index.ts,refresh.ts,refresh.test.ts,deno.json}
    - supabase/functions/plan-grant/{index.ts,grant.ts,grant.test.ts,deno.json}
  modified:
    - supabase/config.toml
    - package.json
requirements-completed: [TIER-07, TIER-08]
completed: 2026-11-19
---

# Phase 9 Plan 07: plan-refresh and plan-grant Summary

Two Edge Functions around the webhook: `plan-refresh` re-reads the caller (and household payer) or, with the cron secret, every sweep target; `plan-grant` posts RevenueCat promotional entitlements for testers (with an end time) and the owner (to 2100-01-01), then re-applies the plan.

## Commits
- 0e44faf4 feat(09-07): plan-refresh caller re-sync and daily sweep
- 2f555b1a feat(09-07): plan-grant operator tester and owner grants

## Behaviour
- Caller mode: identity only from `auth.getUser()`; body is read only for `mode`. Payer is also refreshed when different. Fetch failure applies nothing and returns `{ok:false,error:'upstream'}` (HTTP 502). Success returns `{ok:true, state}` from `plan_state`.
- Sweep mode: needs `x-plan-sweep-secret` equal to `PLAN_SWEEP_SECRET` (else 403); continues past failures, returns applied and failed counts.
- plan-grant: `x-plan-grant-secret` only (user JWT not accepted, 403); validates end time (future integer) and user id (400); records `grant:<user>:<endMs>` in plan_events before posting; skips a user whose promo already ends at the same time; sets `plan_settings.tester_until`; owner sets `promo_kind = 'owner'`. Logs counts only.
- Runbook curl calls are in the header comment of `plan-grant/index.ts`.

## Verification
- `npm run test:deno`: 63 passed. `deno check` clean for both index files.
- Not run: the functions against a real project, RevenueCat, or the real `plan_apply` RPC.

## Deviations from Plan
- Worktree HEAD was not at the base commit at start; reset --hard to d92247c0 per the startup check.
- Added a `recordGrant` dependency to `GrantDeps` (the plan's list omitted it, but the plan requires recording the grant before posting).
- Test files use the dual-runner style (no `jsr:@std/assert`), same as 09-06.
- Owner grant: if the promo already ends at 2100-01-01 the post is skipped but the household is still marked owner.

## Notes for the owner
- Set secrets `PLAN_SWEEP_SECRET` (must match the cron job from 09-05) and `PLAN_GRANT_SECRET` before deploy; nothing deployed here.

## Known Stubs
None.

## Self-Check: PASSED
