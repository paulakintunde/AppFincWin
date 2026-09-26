---
phase: 01-money-core
plan: 16
subsystem: infra
tags: [supabase, edge-functions, fx-sync, fx-monitor, resolve-rate, resend, offline-queue, android]

requires:
  - phase: 01-money-core (01-01..01-15)
    provides: integer-money engine, client UUID keys, FX rate storage, TanStack Query data layer with offline write queue
provides:
  - Phase 1's schema and Edge Functions live on the single production Supabase project
  - Live smoke-tested fx-sync, fx-monitor and resolve-rate, with secrets and the fx_monitor_url Vault row created
  - Device-verified offline queue, sync line, FX stamping and locale handling
affects: [phase-2-record, phase-10-system, phase-11-compliance]

tech-stack:
  added: []
  patterns:
    - "Production Edge Function secrets are read via a Node one-liner that never echoes them, written to a scratchpad-only temp env file for `supabase secrets set`, then deleted"

key-files:
  created: []
  modified:
    - docs/acceptance/phase-01-money-core.md

key-decisions:
  - "Task 3's device check ran on a physical Pixel 9 rather than the planned Pixel_8_API_36 emulator, which segfaulted twice on boot on this machine (Intel Iris Xe GPU and swiftshader paths both failed); combined with 00-19 Task 2 in one on-device session"
  - "DSG-06 (locale formatting) is accepted on the strength of the existing Hermes unit-test suite rather than a visual device check, since no screen in the shipped Phase 0/1 build renders a formatted amount yet -- Record (Phase 2) is the first screen that will"

patterns-established: []

requirements-completed: [MON-05, MON-06, MON-09, MON-10, MON-11, MON-12, SYN-01, SYN-02, SYN-07, DSG-06]

duration: ~3h (across Tasks 1-3, this session covers Task 3 plus final consolidation)
completed: 2026-09-26
---

# Phase 1 Plan 16: Production Rollout Summary

**All seven Phase 1 migrations and three FX Edge Functions are live on the single production Supabase project, smoke-tested end to end, and the offline write queue, sync line and FX stamping are confirmed working on a real Android device.**

## Performance

- **Duration:** ~3h total (Tasks 1-2 ran earlier the same day; this session covers Task 3's device check and final consolidation)
- **Completed:** 2026-09-26T22:55:00Z
- **Tasks:** 3 (Task 1 auto-blocking, Task 2 auto, Task 3 checkpoint — already approved by the user before this session)
- **Files modified:** 1 (`docs/acceptance/phase-01-money-core.md`)

## Accomplishments

- Full local gate green (lint, typecheck, depcruise, coverage at 100% on money/split engine folders, migration-compat and migration-gate probes, money-mirror check, a local `db reset` applying all 11 migrations, and 339 pgTAP tests), then all seven `20260924xxxxxx` migrations pushed to production with `local=remote` confirmed for every one.
- `fx-sync`, `fx-monitor` and `resolve-rate` deployed; Resend secrets and the `fx_monitor_url` Vault row created; live smoke tests confirm `fx-sync` and `fx-monitor` both return `ok:true` with the correct secret and 403 with a wrong one, `resolve-rate` returns 401 with no Authorization header, `currencies` has 166 rows, the latest `fx_rates.rate_date` is today, and both `fx-sync-daily`/`fx-monitor-daily` cron jobs are registered.
- On a physical Pixel 9: airplane-mode browse-from-cache, queued-write persistence across a force-quit, and drain-on-reconnect all confirmed. Production shows three queued transactions with `rate_source` `frankfurter-v2`, `rate_date` 2026-09-26, `rate_pending` `false`; −1000 EUR at rate 1.1399 rounds half-up to −1140 USD, matching the engine/SQL mirror (MON-05, MON-06).
- Region switch (Germany and back) loads normally; DSG-06's formatting guarantee is accepted on the strength of the existing unit-test suite, since Record (Phase 2) is the first screen that will actually render a formatted amount.

## Task Commits

1. **Task 1: Full local gate, then push the schema to production** - `e91bf95` (docs)
2. **Task 2: Deploy Edge Functions, set secrets and Vault, smoke-test live** - `483ffbd` (docs)
3. **Task 3: Device check results** - `35cb361` (docs)

**Plan metadata:** captured in this SUMMARY's own commit (see final commit)

## Files Created/Modified

- `docs/acceptance/phase-01-money-core.md` - Tasks 1-3 results: full local gate, production schema push, Edge Function deploy/smoke tests, and the device-check table

## Decisions Made

- Substituted a physical Pixel 9 for the plan's `Pixel_8_API_36` emulator after two boot segfaults, combining this task's device check with `00-19-PLAN.md` Task 2 in one on-device session since both needed the same fresh dev-client rebuild (NetInfo is new native code).
- Accepted DSG-06 on unit-test evidence rather than a visual device check, since no screen in the shipped build renders a formatted amount yet — recorded explicitly rather than silently marking it "passed visually."

## Deviations from Plan

None beyond what Tasks 1-2 already recorded (the flaky 5s Jest timeout under fresh-`npm ci` CPU contention, resolved by re-running the affected files individually, both passing — documented in `docs/acceptance/phase-01-money-core.md` Task 1, not a code defect). Task 3's device check needed no auto-fixes; the two bugs found during the combined on-device session (consent redirect loop, safe-area/status-bar contrast) belong to `00-19-PLAN.md`'s scope and are documented there.

## Issues Encountered

- `Pixel_8_API_36` AVD would not boot on this machine (Intel Iris Xe: GPU and `swiftshader` paths both segfaulted). Resolved by using a physical Pixel 9 for the entire on-device session instead. Environment limitation, not a product defect.

## User Setup Required

None — Resend and Vault secrets were already configured per this plan's `user_setup` block before Task 2 ran; no further action needed.

## Next Phase Readiness

- Phase 1's production data layer is live, smoke-tested and device-proven. Record (Phase 2) can write against it with no further data-layer work.
- ENV-16 (production backups) remains deferred to Phase 10, unchanged by this plan — production still runs without backups while dogfooding, an accepted risk already recorded in STATE.md.

---
*Phase: 01-money-core*
*Completed: 2026-09-26*
