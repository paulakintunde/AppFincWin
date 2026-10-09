---
phase: 02-record
plan: 50
subsystem: ops
tags: [fx, production, rollout, resolve-rate, cleanup]
requires: [02-41, 02-42, 02-43, 02-44, 02-45, 02-46, 02-47, 02-48, 02-49]
provides:
  - docs/acceptance/phase-02-fx-on-demand.md (filled rollout record)
affects: [production cohmcbdfgqmiwykztrdg]
key-files:
  modified:
    - docs/acceptance/phase-02-fx-on-demand.md
    - .planning/REQUIREMENTS.md
decisions:
  - No OTA published. The fingerprint differs from the last EAS build (Phase 2 native modules), so a new EAS preview build is a follow-up.
  - Device check step 7 (home-currency switch) deferred to 02-HUMAN-UAT.md, because the app has no home-currency setting screen yet.
  - Deprecated fx_pending_rows_count / fx_restamp_pending stay revoked, not dropped, until the next min_supported_version raise (follow-up 22).
metrics:
  tasks: 5
  completed: 2026-10-09
requirements: [MON-06, MON-10, MON-11, ENV-08]
---

# Phase 2 Plan 50: On-demand FX production rollout Summary

The on-demand FX model is live in production. Migrations 20261007000100..000400 are applied and resolve-rate v3 is deployed. The daily fx-sync and fx-monitor jobs, their functions, secrets and vault rows are gone, and both old endpoints return 404.

## Tasks

| Task | Result |
|------|--------|
| 1 Local gate | All gates green on the deploy candidate (one known cold-start Jest flake, which passed when re-run alone). |
| 2 Approval | User approved 2026-10-08, with cleanup only after the device check. |
| 3 Reversible steps | Preflight OK; 4 migrations pushed; resolve-rate v3 deployed 23:02 UTC; read-only checks match expectations (no fx cron, 166 active currencies, 2,404 fx_rates rows, deprecated routines not executable). |
| 4 Device check | Steps 1–6 pass on a Pixel 9 (local debug build, main 3df0828): a THB past-date fetch landed 4 s after save, the same-date line made no second fetch, home-only lines made no lookup, and the offline line stamped on reconnect. Step 7 is pending (no home-currency setting UI). |
| 5 Cleanup | fx-sync and fx-monitor deleted, 2 secrets unset, 4 vault rows deleted, endpoints 404, requirements re-ticked. |

## Follow-ups

- EAS preview build for testers and release (the fingerprint changed in Phase 2).
- "Change home currency" setting under You → Money, which unblocks device step 7.
- The app opened signed out after a Metro reload during the check. Not yet explained.
- The sweep-fetch path was not exercised on device, because the rate was already stored. It is covered by Jest.
- Drop the deprecated FX routines at the next min_supported_version raise (follow-up 22).
