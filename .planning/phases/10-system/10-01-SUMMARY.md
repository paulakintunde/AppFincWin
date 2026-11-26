---
phase: 10-system
plan: 01
status: checkpoint
subsystem: ops
tags: [owner-setup, backups, r2, fcm, runbook]
requires: []
provides:
  - docs/ops/phase-10-owner-setup.md (single owner runbook)
  - dependency register rows (R2, age key, FCM, APNs, Expo token)
  - .env.example names (reviewer credentials, EXPO_ACCESS_TOKEN)
key-files:
  created: [docs/ops/phase-10-owner-setup.md]
  modified: [docs/dependency-register.md, .env.example]
requirements: [ENV-19, ENV-16, DAT-05, IMP-06, ACC-11]
---

# Phase 10 Plan 01: Owner setup runbook Summary

Status: checkpoint. Task 1 done and committed. Task 2 (owner does the setup in one sitting) is pending the owner.

## Task 1 (done) - c79165e4

- Wrote `docs/ops/phase-10-owner-setup.md`: 9 numbered owner steps plus a Done table, in plain English, linking the owner-facing artifact copy.
- Folded in the orchestrator's 2026-11-22 doc-verified corrections: R2 purchase prompt, us jurisdiction, lifecycle path, `.us.r2` endpoint, Account API token; age via winget (no Docker, no `-pq`); Supabase Session pooler and publishable key stored as `SUPABASE_ANON_KEY`; GitHub Path A (environment `restore`) and Path B (repo secrets, tell Claude "path B"); Firebase package `com.fincwin.app`, FCM V1 upload routes, key-creation policy note; Expo token with enhanced security left OFF until 10-29; wallet export menu paths; Cloudflare Email Routing MX warning.
- The `supabase db dump --remote` backup-guide note is recorded for plan 10-20, not as an owner step.
- Register: FCM row (pending-owner), APNs row (blocked on ENV-10), R2, age key, Expo push token rows.
- `.env.example`: REVIEWER_EMAIL, REVIEWER_PARTNER_EMAIL, REVIEWER_PASSWORD, EXPO_ACCESS_TOKEN (empty).
- Verification: runbook keyword check passed; register has R2 and Firebase rows; no `age1...` or `AIza` strings.

## Task 2 (pending owner)

Owner follows the runbook steps 1-9. Then Claude runs the name-only checks (`gh secret list`, `gh variable list`, `gh secret list --env restore` for Path A, `ls` of the wallet folder, `test -f google-services.json`, `grep -c` of the REVIEWER_ names) and records the answers in the runbook Done table. The gitleaks exact-path yes/no is also needed.

## Deviations

- Base: the worktree started at 7afd42f2; reset to the supplied base 493c04d9 as the brief allows.
- Register step references use the plan's step numbers (Firebase step 5, Expo step 7).
- Reviewer email step warns to add routes to the existing Cloudflare Email Routing rather than re-onboard, since fincwin.com already routes support@.
- Repo was public since 2026-09-23 per the register, so Path A is expected.

## Notes for the orchestrator

No installs needed. STATE.md and ROADMAP.md untouched.
