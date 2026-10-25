---
phase: 05-decide-ui
plan: 05
subsystem: database
tags: [supabase, typed-db, decide, rpc, replay-safe]
requires: [05-03]
provides:
  - typed db modules for decide_checks, decide_settings, debts, decide_links, statement_periods
  - recordDecideGo / recordDecideOutcome RPC wrappers
affects: [05-12, 05-19, 05-20]
key-files:
  created:
    - src/db/decideChecks.ts
    - src/db/decideSettings.ts
    - src/db/debts.ts
    - src/db/decideLinks.ts
    - src/db/statementPeriods.ts
    - src/db/decideOutcomes.ts
    - src/db/__tests__/decideChecks.test.ts
    - src/db/__tests__/decideSettings.test.ts
    - src/db/__tests__/debtsLinksPeriods.test.ts
    - src/db/__tests__/decideOutcomes.test.ts
  modified:
    - src/db/__tests__/fakeSupabase.ts
metrics:
  completed: 2026-10-16
requirements-completed: []
---

# Phase 5 Plan 05: Decide db modules Summary

Six grant-mirroring, replay-safe db modules for the Decide tables plus validated wrappers for the Go ahead and Wait/Pass RPCs; no engine imports.

## Tasks
- Task 1: decideChecks.ts and decideSettings.ts, commit 7fc2de7
- Task 2: debts.ts, decideLinks.ts, statementPeriods.ts, commit f0e414e
- Task 3: decideOutcomes.ts, commit d7e5a45

## Notes
- Insert and patch key lists exclude status, decision, estimate, cooling_off_at and is_sample columns (RPC-only). `kind` is patchable while open and `saveDecideCheckDraft` sets it from `inputs.kind` in the same update.
- Inserts treat 23505 as replay success (statement periods return null); updates are version-conditional with VersionConflictError/NotFoundError. Draft autosave is last-write-wins on status 'open'.
- `fetchLinkedLines` interpolates only regex-validated uuids into the PostgREST `or` filter (max 200 each).
- Part 2 and planning-review additions delivered: link `role`, `fetchPaymentLinks`, `fetchWrittenRowLinks`, debt `paid_in_full` and minimum-terms columns, RPC roles/split estimates/cooling_off/Wait goal.
- Requirement IDs (DCU-03, DCU-04, DCU-07, DCU-24) left pending in REQUIREMENTS.md: they span later plans.

## Verification
- `npx jest src/db` 24 suites / 352 tests pass; `npm run typecheck` clean; `npm run lint` 0 errors (pre-existing warnings); `npm run depcruise` no violations.
- No migrations created; no database tests needed (CI's `rls` job covers SQL).

## Deviations from Plan
- [Rule 3 - Blocking] Added an `or()` method to `src/db/__tests__/fakeSupabase.ts` so `fetchLinkedLines` can be tested. Test helper only.

## Human verification
None.

## Self-Check: PASSED
