---
phase: 09-tiers-onboarding
plan: 24
subsystem: onboarding
tags: [sample-data, look-around, sample-bar, first-run, partial]
requires: [09-14, 09-16, 09-17]
provides: [SampleHost, SampleBar, SampleFiguresCard, SampleAnswerIntro, sampleAnswerCheckId, sampleBarHeight]
affects: [09-25, 08.1-20]
requirements: [TIER-01, TIER-09, TIER-07]
key-files:
  created:
    - src/features/onboarding/SampleHost.tsx
    - src/features/onboarding/SampleBar.tsx
    - src/features/onboarding/SampleFiguresCard.tsx
    - src/features/onboarding/sampleFlags.ts
    - src/features/decide/screens/answer/SampleAnswerIntro.tsx
    - src/features/onboarding/__tests__/SampleHost.test.tsx
    - src/features/onboarding/__tests__/SampleBar.test.tsx
  modified:
    - app/(app)/(tabs)/_layout.tsx
    - src/features/record/samples/SampleBanner.tsx
    - src/features/decide/screens/answer/AnswerFrame.tsx
    - src/features/decide/screens/answer/AnswerScreen.tsx
    - src/shell/layout/ShellLayoutProvider.tsx
    - src/shell/fab/useShellPositions.ts
    - src/i18n/locales/onboarding/index.ts
    - .planning/phases/09-tiers-onboarding/09-WORDING.md
decisions:
  - "PARTIAL by owner choice 2026-11-19: the First read treatment on the sample answer waits for 08.1 plans 19-20; no substitute StageTag"
  - "The sample answer is the oldest live is_sample decide_check; the answer route judges it with the engine on the sample records"
  - "The Sample bar is rendered inside the Tabs tabBar slot, above TabBar, so screens end above it; its height is a separate sampleBarHeight added to the FAB and toast offsets"
  - "The tabs first-account gate holds (renders nothing) while the plan is unknown, because usePlanState reports 'sample' while loading"
metrics:
  tasks: 2
  completed: 2026-11-19
---

# Phase 9 Plan 24: Sample-data look-around Summary

**PARTIAL.** A new person in plan status 'sample' (before the trial) now gets the 02.2 sample data seeded once and opens on the seeded sample Decide answer the first time. A pinned Sample bar on every tab leads to the Plans screen in first-run mode. The first-account gate no longer sends them to /setup/account, and the 02.2 sample banner steps aside. The answer is still missing the First read treatment (StageTag and basis line).

## PARTIAL — owner-approved 2026-11-19: First read intro on the sample answer deferred until 08.1 plans 19–20 merge

- **What is deferred:** the 08.1 First read treatment on the sample Decide answer: `StageTag` "First read" (`onboarding.sample.firstRead`) and the basis line "Based on sample figures" (`onboarding.sample.basis`). 09-UI-SPEC line 221 requires it.
- **Why:** StageTag does not exist yet. A search of `src`, `app` and `feat/08.1-build` (which only reaches 08.1 plan 07) found no StageTag component. The only match was the copy key. It is created by `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-20-PLAN.md` (`src/features/decide/screens/answer/StageTag.tsx`). The plan said to stop rather than build a substitute. The owner chose option (b) through the coordinator's question popup: build everything else and leave a seam.
- **The seam:** `src/features/decide/screens/answer/SampleAnswerIntro.tsx` has a `TODO(08.1-20)` block that cites 08.1-20-PLAN.md and 09-UI-SPEC line 221. When 08.1-20 lands, add the StageTag and basis line there, in sample mode only. Nothing else needs to change. The intro is already mounted above the notices and the verdict through the new `intro` slot on AnswerFrame.
- **What still works without it:** the look-around opens on the engine-computed sample answer and shows the one-time sample figures card above the verdict. Only the First read tag and the basis line are missing.

## Commits

| Task | Commit | Notes |
|------|--------|-------|
| 1 SampleHost, figures card, answer intro seam | 71769e9d | seeds once, opens the sample answer once, card + TODO(08.1-20) seam |
| 2 SampleBar, tabs layout, gate, SampleBanner | 1689cfb2 | bar in the tab bar slot, sampleBarHeight, gate skip, banner hidden |

## What was built

- **SampleHost** (renders nothing; mounted in the tabs layout):
  - Seeds the sample data once per mount. It only seeds when the plan has loaded, the status is 'sample', the record context is ready, and `sample_data_exists` returned false. It calls `seedSampleData` through `useSampleData().seed()` with today's local date.
  - It never seeds while the plan is loading, after a failed read, or in trial, active, tester, grace or locked.
  - On the first time in sample mode on this phone (flag `fincwin:sample-opened:<userId>`), it pushes `/decide/answer/[id]` for the oldest live `is_sample` check (`sampleAnswerCheckId`). Later launches stay on Home.
- **SampleFiguresCard**: a one-time `fill1` card with the `view` glyph, "You are looking at sample figures. They are not yours." and the link "Explore the app". The link hides the card for good (flag `fincwin:sample-card:<userId>`) and goes Home. The card shows in sample mode only.
- **SampleAnswerIntro**: wraps the card. It is mounted through `AnswerFrame`'s new optional `intro` prop (one line in AnswerScreen), and it holds the TODO(08.1-20) seam.
- **SampleBar**: shown in sample status only, once the plan has loaded.
  - Layout: `fill1`, the `view` glyph with "Sample", the label "Free for 14 days", and the primary Pill "Start 14-day free trial" (hapticTap). The link "Choose a different plan" sits under the Pill.
  - Both the Pill and the link push `plansHref({ mode: 'first_run', trigger: 'sample_bar' })`.
  - Screen-reader label: "Sample figures. Start 14-day free trial." with role button.
  - It reports its height as `sampleBarHeight`, which goes back to 0 when the bar is gone.
- **Shell**: `ShellLayoutProvider` gained `sampleBarHeight` / `setSampleBarHeight`. `useFabOffsets` and `useToastSlot` add it to the tab bar height, so the FAB and toasts clear the bar. Screens are not covered, because the bar is laid out in flow inside the Tabs `tabBar` slot, above `TabBar`.
- **Tabs layout**: mounts `<SampleBar />` (in the tabBar render) and `<SampleHost />`. The gate is now `if (gate && plan.loading) return null; if (gate && plan.status !== 'sample') return <Redirect .../>`.
- **SampleBanner**: returns null when `usePlanState().status === 'sample'`, so only one sample marker shows.

## Deviations from Plan

1. **[Owner-approved scope cut]** The First read treatment is not built (see PARTIAL above).
2. **[Rule 2] The gate holds while the plan is unknown.** `usePlanState()` reports status 'sample' with `loading: true` before the plan is known. A bare `status !== 'sample'` would let a paying user without an account past the gate while the plan loads. The layout now renders nothing in that window.
3. **[Rule 3] Added an `intro` slot to AnswerFrame** (4 lines). The answer screen body (`children`) renders below the verdict, but UI-SPEC 4 puts the card above the verdict. AnswerScreen changes by one line plus the import.
4. **[Rule 3] Test mocks.** `answerScreen.test.tsx` mocks `SampleAnswerIntro`, which otherwise pulls auth and Google sign-in natives. `SampleBanner.test.tsx`, `setup.test.tsx`, `shellNavigation.test.tsx` and `tabsLayoutStable.test.tsx` mock `usePlanState`. `setup.test.tsx` gains a test that sample status (and an unknown plan) does not redirect.
5. **Sample bar height:** the main row is 64 at font scale 1.0. The "Choose a different plan" link (09-WORDING: "Text link under the trial button") adds one text line under the Pill, so the whole bar is taller than 64. **Needs a UI/owner look on device.**
6. **"Explore the app"** hides the card and navigates Home. UI-SPEC does not say where the link goes; Home was chosen as the natural place to start exploring. **Needs owner confirmation.**
7. **Copy key renamed:** the reader label key is `onboarding.sample.bar.readerLabel`, not `a11y`. The plansCopy guard's key pattern allows letters only.

## Copy needing owner review

- `onboarding.sample.bar.readerLabel`: "Sample figures. Start 14-day free trial." This is the screen-reader label on the Sample bar button, from UI-SPEC/plan text. It was added to 09-WORDING.md marked "needs owner review".

## Verification

- `npx jest src/features/onboarding/__tests__/SampleHost.test.tsx`: 16 passed.
- Touched folders (onboarding, record/samples, record/setup, shell, GrowHome, UndoToastHost layer, plansCopy): 46 suites / 998 tests passed, run with dummy local `EXPO_PUBLIC_*` values (no network, not production).
- Without those values, `setup.test`, `shellNavigation.test` and `tabsLayoutStable.test` still throw EnvError through LockHost, LockBanner and household imports. That was already true at base 2d716833; the separate env fixer owns it.
- Decide answer suites, plus useCheckEngine, envelopeAccountSheet and answerRoute: all passed.
- `npx tsc --noEmit`: clean apart from the known purchasesClient errors (react-native-purchases is missing from the junction).
- `npm run depcruise`: no violations.
- eslint on changed files: 0 errors. The only warnings are older require/import-order ones in existing test files.
- Acceptance greps: `seedSampleData(` is called through `useSampleData().seed()`, which calls `seedSampleData(await writeClient(), ...)` in `src/data/mutations/sampleData.ts`. SampleHost itself does not contain the literal `seedSampleData(`. It reuses the existing mutation so the seeded keys are refreshed in one place. `<SampleBar` / `<SampleHost` and `status !== 'sample'` are present in the tabs layout. The SampleBar test asserts trigger 'sample_bar' and the reader label.

## Threat model

- **T-09-80:** the client writes nothing to the person's own records. The only write is `seed_sample_data`, which writes is_sample rows and is let through by the 09-03 lock. Write entry points still go through `useWriteGate` ('sample' variant from 09-16 and 09-17).
- **T-09-81:** the rows carry is_sample. The existing clear prompts remove them after the trial starts.

No server change is needed. No migration was touched.

## Left for 09-25 / follow-ups

- Add the First read StageTag and basis line in `SampleAnswerIntro` once 08.1 plans 19-20 merge.
- A device check of the Sample bar at large font scale, and of where "Explore the app" goes.

## Self-Check: PASSED

- Created files exist: SampleHost.tsx, SampleBar.tsx, SampleFiguresCard.tsx, sampleFlags.ts, SampleAnswerIntro.tsx, both tests.
- Commits 71769e9d and 1689cfb2 are on the branch.
