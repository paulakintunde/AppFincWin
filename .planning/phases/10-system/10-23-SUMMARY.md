---
phase: 10-system
plan: 23
subsystem: alerts-delivery
tags: [push, expo, pg_cron, quiet-hours, digest, edge-function]
requires: [10-02, 10-04, 10-15, 10-19]
provides: [alerts-deliver Edge Function, alert delivery RPCs, alerts-deliver-minute cron]
key-files:
  created:
    - supabase/migrations/20261126000700_alerts_deliver_schedule.sql
    - supabase/tests/database/127_alerts_deliver.test.sql
    - supabase/functions/alerts-deliver/{index,deliver,schedule,text,expo}.ts
    - supabase/functions/alerts-deliver/{deliver,schedule,text}.test.ts
    - supabase/functions/alerts-deliver/deno.json
    - src/i18n/__tests__/pushTextParity.test.ts
  modified: [supabase/config.toml, package.json]
requirements: [ALR-03, ALR-04, ALR-06, ENV-19]
duration: about 1 hour
completed: 2026-11-23
---

# Phase 10 Plan 23: Alert delivery Summary

Raised alerts now reach phones through Expo push with quiet hours held in the person's own time zone (DST-safe), a once-a-day 08:00 digest, batches of at most 100, receipt checks and dead-token cleanup, driven by a one-minute pg_cron call guarded by its own secret.

## Commits
- c81fcfc7 schedule.ts, text.ts, tests, catalogue parity test
- ef8fa79d migration 0700 (RPCs + cron) and pgTAP 127
- 702f352d deliver.ts, expo.ts, index.ts, config.toml entry, package.json test:deno list

## Verification
- Deno: 33 tests pass (schedule, text, deliver); `deno check index.ts` clean.
- Jest: schedule, text, deliver and pushTextParity pass (dual runner).
- `npm run lint:migrations` OK.
- pgTAP 127 (25 assertions) written but NOT run: pgTAP run by orchestrator after merge (wave 2+ rule).

## Decisions and deviations
- **[Rule 2] Added `alerts_requeue(uuid, timestamptz)`** - the plan's `alerts_hold` also sets `held_for_quiet`, which is wrong for a failed-send retry; retries need their own RPC. Also `alerts_receipts_done(uuid)` (marks receipts_checked).
- **[Rule 1] `alerts_finish` has an optional 5th arg `p_ticket_tokens text[]`** plus column `ticket_tokens` - a receipt carries only ticket ids, so without the token alongside, DeviceNotRegistered in a receipt could not name which token to delete. `p_delivery` may be null (a row moving to 'digest' leaves alert_log pending until the summary is sent).
- **[Rule 1] Outcome 'failed'**: alert_outbox.status check (10-15) has no 'failed', so a failure is `finish(id, 'dropped', 'failed')`; the log still reads `failed`.
- Added `claimed_at` so rows left 'sending' by a crashed run are re-claimed after 5 minutes.
- Digest users with no token are marked done (log 'digest'); digest receipts are not tracked, DeviceNotRegistered on a digest ticket drops the token immediately.
- Expo `Authorization: Bearer` is always sent when EXPO_ACCESS_TOKEN is set.
- Added the three Deno test files to `npm run test:deno` in package.json.

## Orchestrator / owner items
- Run pgTAP 124 and 127 after merge.
- Production (plan 10-29): Vault secrets `alerts_deliver_url`, `alerts_deliver_secret`; function secrets `ALERTS_DELIVER_SECRET`, `EXPO_ACCESS_TOKEN`; deploy `alerts-deliver`.
- Real push check on the Pixel is 10-30.

## Known Stubs
None.

## Self-Check: PASSED
