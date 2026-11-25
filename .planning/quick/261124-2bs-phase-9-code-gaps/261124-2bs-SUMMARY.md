---
phase: quick-261124-2bs
plan: 01
status: complete
branch: quick/261124-p9-gaps
migration: supabase/migrations/20261125001200_plan_state_left_at.sql
requirements: [09-UAT-C2-1, 09-UAT-C2-2, 09-UAT-C2-3, 09-UAT-C2-4, 09-UAT-B7]
---

# Quick 261124-2bs: Phase 9 code gaps Summary

plan_state() now returns left_at and left_home_name, the sample Decide answer gets the First read treatment, the trial reminder tap routes on a cold start, and the invite waiting screen re-checks and shows the signed expired line.

## Commits

Branch quick/261124-p9-gaps, nothing pushed.

- 5a9ac4e8 Task A: `feat(quick-261124-2bs): plan_state returns left_at and left_home_name`
- 2d60b56a Task B: `feat(quick-261124-2bs): First read on the sample answer; trial reminder tap on cold start`
- 723599cf Task C: `feat(quick-261124-2bs): invite waiting screen re-checks and shows expired line; tick UAT rows`

## Files

- Migration: `supabase/migrations/20261125001200_plan_state_left_at.sql` (additive, same signature/grants, 25 jsonb keys)
- pgTAP: `supabase/tests/database/120_plan_state_left_at.test.sql` (11 assertions)
- Plans: `types.ts`, `usePlanState.ts`, `notices/planNotices.ts`, `PlanEndedScreen.tsx`, `PlanHost.tsx`, new `notices/useTrialReminderTap.ts`
- Decide answer: `AnswerFrame.tsx` (`sample` prop), `AnswerScreen.tsx`, `SampleAnswerIntro.tsx`
- App layout: `app/(app)/_layout.tsx` (TrialReminderObserver)
- Household: `join/JoinScreen.tsx`
- Tests: usePlanState, planNotices, PlanEndedScreen, sampleFirstRead (new), answerScreen (mock), useTrialReminderTap (new), planInviteFlows
- UAT: `09-HUMAN-UAT.md` B7 pass; C2 rows 1-5 marked DONE

## Checks

| Check | Result |
|---|---|
| Jest usePlanState, planNotices, PlanEndedScreen | 47 passed |
| Jest sampleFirstRead, useTrialReminderTap | pass |
| Jest stageAnswer, trialReminder, useNotificationObserver, InviteSheet, planInviteFlows (21 passed, incl. 6 new waiting cases) | pass |
| Jest answerScreen | 88 passed |
| `npx tsc --noEmit` | clean (exit 0, no errors) on the final code |
| eslint on changed files (JoinScreen, plans, decide answer, app layout, tests) | 0 errors; one ref-during-render error in JoinScreen fixed; remaining are pre-existing require()/import-order warnings in test files |
| `npm run lint:migrations` | OK (116 files, floor 0.2.0; pre-existing warnings only) |
| `npm run check:cache-version` | OK, cache shapes unchanged (version 18) |
| pgTAP 120 | NOT RUN: local Supabase stack is not running with this migration applied (applying it would need `db reset` on a shared local DB). Run `npx supabase test db` after `supabase db reset` before pushing. |

## Decisions and defaults taken

- Cache buster: CACHE_SCHEMA_VERSION NOT bumped. The two fields are additive and optional, toPlanView defaults both to null, the plan-state query refetches on mount/foreground, and check-cache-version (which hashes src/db *_COLUMNS, rows.ts, keys.ts) is unchanged and passes.
- Other plan_state readers (plan-refresh function, src/db/plans.ts, data/queries/plan.ts, lockedWrites, firstRun, usePurchaseFlow) read named keys only; none compares the key set. None edited.
- Owner question 1 default: the sample answer shows the answer-wide stage word "First look" (decide.screens.stage.word.first_read), not "First read". `onboarding.sample.firstRead` stays in the locale file, now unused.
- Owner question 2 default: a cancelled request shows the same signed expired line.

## Deviations from Plan

1. [Rule 3 - Blocking] The shared main-checkout node_modules lacks seven runtime packages (expo-haptics, expo-notifications, react-native-purchases, flash-list and others), so no Jest suite could start. In this worktree only, the `node_modules` junction was re-pointed to `C:\dev\fincwin-w1\node_modules` (same commit d3b1add1, identical package-lock.json). C:\dev\fincwin was not touched. node_modules is git-ignored.
2. [Rule 1 - Bug] First version of the admitted re-check left the screen in the waiting phase, so the 30 s timer would run the joined steps twice. Caught by the new test; the re-check now leaves the waiting phase before running them.
3. [Rule 3] answerScreen.test.tsx needed a `usePlanState` mock because AnswerScreen now reads the plan (the plan allowed this).
4. hh_depart (latest definition in 20261124000300) writes the leave-log row and creates the new household of one inside one transaction, so both stamps equal now(); `h.created_at >= l.left_at` with no tolerance is correct.
5. The first run of the planInviteFlows suite had one unrelated test time out at 30 s (cold transform on a loaded machine); it passed on re-run with `--testTimeout=180000`.

## Known stubs

None.

## Left for the owner

- Production push is pending: apply `20261125001200_plan_state_left_at.sql` (orchestrator, after approval), and run pgTAP 120 locally first.
- Owner questions 1 and 2 above can be overturned with a one-line change each (`stageWordOverride` is not built).
- Device check of the cold-start trial reminder tap and the waiting-screen re-check has not been done on a phone.

## Threat flags

None beyond the plan's register (T-2bs-01..05 mitigations applied: caller-only leave log, grants re-issued, fixed route for the reminder tap, one in-flight 30 s re-check while waiting).
