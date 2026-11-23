---
phase: 10-system
plan: 19
subsystem: auth
tags: [supabase, auth-hook, edge-function, rate-limit, reviewer-signin]
requires: [10-09]
provides: [reviewer_allowlist, is_reviewer_email, hook_before_user_created, reviewer-signin function]
key-files:
  created:
    - supabase/migrations/20261126000600_reviewer_signin.sql
    - supabase/tests/database/125_reviewer_signin.test.sql
    - supabase/functions/reviewer-signin/index.ts
    - supabase/functions/reviewer-signin/signin.ts
    - supabase/functions/reviewer-signin/signin.test.ts
    - supabase/functions/reviewer-signin/deno.json
  modified:
    - supabase/config.toml
requirements: [ACC-11, ACC-13]
completed: 2026-11-23
---

# Phase 10 Plan 19: Reviewer sign-in server side Summary

Server-only allow-list, a before-user-created hook that refuses email sign-ups for unlisted emails, and a rate-limited reviewer-signin Edge Function with one uniform refusal.

## What was built
- Migration 0600: `reviewer_allowlist` (RLS on, no anon/authenticated grants, select to supabase_auth_admin), `is_reviewer_email` (service_role only, case-folded), `hook_before_user_created` (provider `email` and not listed -> 403 "Sign-up is not available."; Apple, Google and others pass). No emails inserted.
- pgTAP 125 (14 assertions).
- `reviewer-signin`: pure `reviewerSignIn` in signin.ts with injected deps. Limits: `reviewer-ip:<first x-forwarded-for>` 10 per 900 s, `reviewer-email:<lower email>` 5 per 900 s via `hitRateLimit`. Not listed, wrong password and malformed body all return the same 401 `{ok:false,error:'invalid'}`; the unlisted and malformed paths sleep 400 ms and the listed path runs sign-in and a 400 ms sleep together. Only event names are logged, never the body.
- config.toml: `[auth.hook.before_user_created]` and `[functions.reviewer-signin] verify_jwt = false`.

## Docs source
Event payload and response shape checked against https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook (fetched 2026-11-23): `user.app_metadata.provider`, `user.email`, `user.identities` (empty at hook time); reject with `{"error":{"http_code":4xx,"message":...}}`, allow with `{}`. The hook keys on `app_metadata.provider = 'email'`.

## Verification
- `deno test` signin.test.ts: 9 passed. `deno check index.ts`: ok. `npm run lint:migrations`: OK.
- pgTAP: run by orchestrator after merge (shared local stack; not run here). `supabase stop/start` for the hook config also left to the orchestrator.
- Jest: signin.test.ts 9 passed (`npx jest --no-watchman supabase/functions/reviewer-signin`).

## Deviations
- Plan Task 1 said to run `supabase stop/start`, `db reset`, `test db`; skipped per the wave-2 brief (shared stack).
- WebFetch was unavailable; the docs page was fetched with curl (markdown endpoint).

## Orchestrator notes
- Run pgTAP 125 after merge; restart local stack so the hook config loads.
- Production: the hook must also be enabled in the hosted dashboard (Auth > Hooks) or via config push at deploy time (not done here).

## Commits
- 49be09d4 feat(10-19): allow-list, sign-up hook, pgTAP 125, config
- feat(10-19): reviewer-signin Edge Function (second commit)

## Self-Check: PASSED
