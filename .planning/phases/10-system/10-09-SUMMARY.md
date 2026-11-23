---
phase: 10-system
plan: 09
subsystem: edge-functions
tags: [rate-limit, postgres, deno, ACC-13]
requires: []
provides: [rate_limit_hit, hitRateLimit, tooManyRequests]
affects: [delete-account, read-pdf-statement, resolve-rate, plan-refresh]
key-files:
  created:
    - supabase/migrations/20261126000200_rate_limits.sql
    - supabase/tests/database/121_rate_limits.test.sql
    - supabase/functions/_shared/rateLimit.ts
    - supabase/functions/_shared/rateLimit.test.ts
  modified:
    - supabase/functions/delete-account/index.ts
    - supabase/functions/read-pdf-statement/index.ts
    - supabase/functions/resolve-rate/index.ts
    - supabase/functions/plan-refresh/index.ts
requirements: [ACC-13]
completed: 2026-11-22
---

# Phase 10 Plan 09: Edge Function rate limits Summary

Postgres fixed-window per-user counter (`rate_limit_hit`, service role only, nightly purge) with a Deno helper that fails open and answers 429 + Retry-After, wired into four client-invoked functions using the verified caller id.

## Limits
delete-account 3/3600 s; read-pdf-statement 30/3600 s; resolve-rate 120/3600 s (alongside the existing RD-05 throttle); plan-refresh caller mode 30/3600 s (sweep mode unlimited).

## Verification
- Deno: rateLimit.test.ts (5), delete.test.ts, refresh.test.ts: 19 passed.
- `deno check` passes for delete-account, resolve-rate, plan-refresh.
- `npm run lint:migrations`: OK.
- pgTAP 121 NOT run locally: Docker daemon and the supabase CLI are not available here. Needs `supabase db reset` + `supabase test db` by the orchestrator.
- `deno check` on read-pdf-statement not run: `npm:unpdf@1.8.1` is not resolvable in this environment (pre-existing; same edit pattern as the others).

## Deviations
- [Rule 3] `RpcClient.rpc` returns `PromiseLike` instead of `Promise`, because the Supabase client's rpc builder is a thenable, not a Promise; otherwise deno check failed.
- pgTAP plan has 10 assertions (dropped a redundant window-count check); next-window isolation is tested by seeding an exhausted older-window row.
- delete-account: getCallerId memoised; the limit is checked only when a caller id resolves, otherwise deleteAccount answers 401 as before.

## Self-Check: PASSED (files and commits present)
