---
phase: 09-tiers-onboarding
plan: 21
subsystem: onboarding
tags: [onboarding, tiers, consent, income-steps, partner, rerun]
requires: [09-11, 09-12, 09-13]
provides: [OnboardingFlow, useOnboardingFlow, stepsFor, ConsentContent, deriveIncomeShape]
affects: [09-22, 09-23]
key-files:
  created:
    - src/features/onboarding/useOnboardingFlow.ts
    - src/features/onboarding/deriveIncomeShape.ts
    - src/features/onboarding/useCopy.ts
    - src/features/onboarding/QuestionScreen.tsx
    - src/features/onboarding/SummaryScreen.tsx
    - src/features/onboarding/OnboardingFlow.tsx
    - src/features/onboarding/questions/OptionQuestion.tsx
    - src/features/onboarding/questions/optionTables.ts
    - src/features/onboarding/questions/CurrencyQuestion.tsx
    - src/features/onboarding/questions/AccountQuestion.tsx
    - src/features/onboarding/questions/IncomeQuestion.tsx
    - src/features/onboarding/questions/SaveGoalQuestion.tsx
    - src/features/onboarding/__tests__/useOnboardingFlow.test.ts
    - src/features/onboarding/__tests__/OnboardingFlow.test.tsx
    - src/features/consent/__tests__/ConsentContent.test.tsx
  modified:
    - src/features/consent/ConsentScreen.tsx
    - src/ui/LabelValueRow.tsx
decisions:
  - Q4/Q5/Q6 map to the shared income steps paid/pay/season; titles are the income steps' own titles
  - Re-run does not save per step and never changes the home currency
  - Question answers for the income steps are read back from the saved profile at apply time
metrics:
  tasks: 2
completed: 2026-11-19
---

# Phase 9 Plan 21: The 11-question setup flow Summary

The onboarding flow in three modes (first run, partner, re-run): chrome, 11 question bodies, the unnumbered analytics step from the consent content, the summary, resume, and apply through `levelFor` and `applyOnb`. Routing is left to 09-23.

## Commits
- 2e5db521: ConsentContent split, `useOnboardingFlow`, `deriveIncomeShape`, tests (Task 1)
- a1e167db: QuestionScreen, question bodies, SummaryScreen, OnboardingFlow, LabelValueRow `muted` tone, flow test

## What was built
- `ConsentContent({ onDone, lastStep })` renders the existing consent content with no redirect; `ConsentScreen` wraps it and still redirects to Home (existing tests pass).
- `useOnboardingFlow({ mode })`: `stepsFor`, `progressOf`, `buildApply` are pure and exported. Skip stores nothing, Skip the rest jumps to analytics (if shown) then summary, each answer saves `answers` and `resume_step` through `useSaveUserSetup({ userId, patch, baseVersion })`, reopening resumes. Apply runs `levelFor` and `applyOnb`, `replaceFeatureSwitches`, saves level and source (`skipped` when everything was skipped), writes the home currency for Q2 (first run only), and tracks `onboarding_level_assigned`, `onboarding_finished` and, on re-run, `level_changed`. Events carry step keys, levels and booleans only.
- Analytics step: latched once consent is seen unanswered, so answering it does not remove it mid-flow; never in re-run; not counted in "n of 11".
- Partner version: 9 questions (no currency, no sharing), a privacy line under each title, and `abandon()` which saves Everyday with no notice if the person leaves before finishing.
- Re-run: answers pre-filled from the last run, nothing saved per step, "Keep what I have" at the top right (and on the summary) writes nothing and shows the "Nothing changed" toast; apply keeps features that hold records on.
- Owner P3: Q3 account and Q11 goal live only in `user_setup.answers`; no account or goal record is created here (09-23 applies them when the trial starts).

## Deviations from Plan

**1. [Rule 2 - Missing] LabelValueRow tone** The spec shows "Skipped" in inkMuted; `LabelValueRow` had no muted value tone. Added `valueTone: 'muted'` (one line, other tones untouched).

**2. [Rule 3 - Blocking] Question headings for Q4 to Q6** The income steps draw no title and the signed `onboarding.q.shape/inc/freq` titles describe different questions than the steps ask. Headings use the steps' own titles (`income.paid.title`, `income.pay.title`, `income.season.title`); the steps draw their own "why", so the Why link is omitted on those three.

**3. [Decision] Income answers** `shape` is derived at apply time from the saved `income_types` and `income_pattern` (`deriveIncomeShape`), so a Decide-setup answer given earlier counts. `inc` stores the first pay line's per-pay amount and `freq` its schedule, or nothing if no pay line was saved.

**4. [Decision] Re-run never writes the home currency** Changing it later rewrites caps (a separate action), so only first run writes Q2.

**5. [Rule 3] Review lint** Two `react-hooks/set-state-in-effect` disables with reasons (one-shot hydrate, consent latch).

## Verification
- jest: ConsentContent (4), ConsentScreen (existing, pass), useOnboardingFlow (28 including helpers), OnboardingFlow (8) pass. Whole LabelValueRow-using suites were not re-run (jest is slow); the change only adds a union member.
- typecheck: clean apart from the missing `react-native-purchases` package in this worktree's node_modules.
- eslint on src/features/consent, src/features/onboarding and LabelValueRow: clean. `npm run depcruise`: no violations.

## Known Stubs
- `onSeeWhatIsOn` pushes `FEATURES_HREF`; the Features screen has no preview mode yet (09-22). The link opens the normal screen.
- Partner privacy line falls back to "the account owner" when `payerName` is not passed; 09-23 passes the real name.

## Self-Check: PASSED
All listed files exist; commits 2e5db521 and a1e167db are in the log.
