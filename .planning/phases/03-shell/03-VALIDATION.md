---
phase: 3
slug: shell
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
updated: 2026-10-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Refreshed 2026-10-13 from 03-RESEARCH.md "Validation Architecture" for the re-planned set (03-01…03-24). The SheetContainer / `@gorhom/bottom-sheet` row is removed (D-12: the app keeps its own Sheet).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 + jest-expo ~57.0.5 + @testing-library/react-native ^14.0.1; RNGH `react-native-gesture-handler/jest-utils` (`fireGestureHandler`, `getByGestureTestId`); Reanimated `setUpTests`, `getAnimatedStyle`, `advanceAnimationByTime`; `expo-router/testing-library` `renderRouter` |
| **Config file** | `jest.config.js` (roots `src`, `supabase/functions`; `engine/activity` and `engine/entryList` at 100%), `jest.setup.ts` (AsyncStorage, NetInfo, Reanimated, RNGH jestSetup, expo-haptics mocks) |
| **Quick run command** | `npx jest src/shell src/ui src/state src/features/home src/features/navigation` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~10-20 s quick run; ~90 s full suite |
| **Worktree note** | The planning worktree has no `node_modules`; run `npm ci` before executing (03-01 Task 1) |

---

## Sampling Rate

- **After every task commit:** the quick run command (or the task's own `<automated>` command)
- **After every plan wave:** `npm run test:coverage` (engine 100% folders enforced), `npm run lint`, `npm run typecheck`
- **Before `/gsd-verify-work`:** full suite green, plus every manual-only row below run and recorded in `docs/acceptance/phase-03-shell.md` (03-14)
- **Max feedback latency:** 60 seconds per task command

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | NAV-05 | T-03-01-01 | SDK-locked expo-blur only; no @gorhom | unit | `npx jest src/ui/__tests__/haptics.test.ts` | ✅ (extend) | ⬜ pending |
| 03-02-T1 | 03-02 | 1 | NAV-02 | T-03-02-02 | 8-entry cap | unit (pure, 100%) | `npx jest src/shell/backHistory/__tests__/backHistoryReducer.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-02-T2 | 03-02 | 1 | NAV-03 | — | N/A | unit (pure) | `npx jest src/shell/backHistory/__tests__/navLocation.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-03-T1 | 03-03 | 1 | NAV-01 | — | N/A | unit (forward by D-01, back always reverse) | `npx jest src/shell/tabBar/__tests__/direction.test.ts src/shell/tabBar/__tests__/availableTabs.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-03-T2 | 03-03 | 1 | NAV-05 | T-03-03-01 | hidden while signed out / locked | unit | `npx jest src/shell/fab/__tests__/shouldHideFab.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-04-T1 | 03-04 | 1 | HOME-01..04 | T-03-04-01 | no advice wording | unit | `npx jest src/shell/__tests__/shellCopy.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-17-T1 | 03-17 | 1 | HOME-02 | T-03-17-01 | integer UNPAID, income/transfers/refunds excluded | unit (engine, 100%) | `npx jest src/engine/activity/__tests__/monthFigures.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-17-T2 | 03-17 | 1 | HOME-01 | T-03-17-01 | Unpaid filter = bills out only | unit (engine, 100%) | `npx jest src/engine/activity/__tests__/activity.test.ts` | ✅ (extend) | ⬜ pending |
| 03-18-T1 | 03-18 | 1 | NAV-04 | T-03-18-01 | v1 still parses; malformed form dropped | unit (engine, 100%) | `npx jest src/engine/entryList/__tests__/draft.test.ts` | ✅ (extend) | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | DSG-07 | T-03-05-01 | scale clamped 2x / 1.3x | component | `npx jest src/ui/__tests__/Text.test.tsx src/theme/__tests__/fontScale.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-05-T2 | 03-05 | 2 | DSG-07 | T-03-05-03 | 73-file migration gated by lint | lint + full suite | `npm run lint && npm test` | ✅ | ⬜ pending |
| 03-06-T1 | 03-06 | 2 | NAV-02 | T-03-06-03 | bounded goBack loop | unit (mocked router) | `npx jest src/shell/backHistory/__tests__/BackHistoryProvider.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-06-T2 | 03-06 | 2 | NAV-02 / D-16 | T-03-06-01 | BackHandler covers D-06 steps 2-4 only; sheet stack wiped on sign-out | unit | `npx jest src/state/__tests__/sheetStack.test.ts src/shell/backHistory/__tests__/useAndroidBackHandler.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-06-T3 | 03-06 | 2 | NAV-06 | — | N/A | unit (mocked AccessibilityInfo) | `npx jest src/shell/__tests__/a11yFocus.test.tsx src/shell/layout` | ❌ W0 (in task) | ⬜ pending |
| 03-20-T1 | 03-20 | 2 | HOME-02 / D-17 | T-03-20-01 | one in-flight refresh; no toast on error | unit (real QueryClient) | `npx jest src/shell/refresh/__tests__/useShellRefresh.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-21-T1 | 03-21 | 2 | HOME-01 | T-03-21-01 | stores wiped on sign-out | unit | `npx jest src/state/__tests__/activityFocus.test.ts src/features/record/entry/__tests__/entryHost.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-21-T2 | 03-21 | 2 | HOME-01 | T-03-21-02 | Unpaid list matches UNPAID | component | `npx jest src/features/record/activity/__tests__/unpaidFocus.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-07-T1 | 03-07 | 3 | NAV-05 | T-03-07-01 | FAB hidden unless signed in; hidden with any sheet | component | `npx jest src/shell/fab/__tests__/FabProvider.test.tsx src/shell/fab/__tests__/useShellPositions.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-07-T2 | 03-07 | 3 | NAV-05 | — | N/A | component | `npx jest src/shell/fab/__tests__/Fab.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-08-T1 | 03-08 | 3 | NAV-01 | — | N/A | unit + component (slide store, TabSlideIn) | `npx jest src/shell/tabBar/__tests__/tabSlide.test.ts src/shell/tabBar/__tests__/TabSlideIn.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-08-T2 | 03-08 | 3 | NAV-06 | — | N/A | component (role tab, n of total, 1.3x label) | `npx jest src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-09-T1 | 03-09 | 3 | NAV-04 / D-23 | — | no rgba literal; scrim token removed | unit + component | `npx jest src/ui/__tests__/sheetDrag.test.ts src/ui/__tests__/Sheet.scrim.test.tsx src/ui/__tests__/Sheet.gestureRoot.test.tsx src/ui/__tests__/Sheet.keyboard.test.tsx` | ✅ scrim (rewrite), gestureRoot/keyboard (keep) | ⬜ pending |
| 03-09-T2 | 03-09 | 3 | NAV-04 / D-29 | T-03-09-01 | no ghost Modal; top-only back | component (fireGestureHandler, fake timers) | `npx jest src/ui/__tests__/Sheet.drag.test.tsx src/ui/__tests__/Sheet.stack.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-09-T3 | 03-09 | 3 | NAV-04 / D-37 | T-03-09-01 | dismissible instead of no-op dismiss | component | `npx jest src/ui/__tests__/Dropdown.test.tsx src/features/you/__tests__/HomeCurrencyChangeSheet.test.tsx` | ✅ (extend) | ⬜ pending |
| 03-10-T1 | 03-10 | 3 | NAV-03 | T-03-10-02 | sync line on every problem state | component | `npx jest src/shell/header/__tests__/syncProblem.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-10-T2 | 03-10 | 3 | DSG-07 | — | N/A | component (rendered fontSize) | `npx jest src/shell/header/__tests__/TabHeader.fontScale.test.tsx src/shell/header/__tests__/headers.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-22-T1 | 03-22 | 3 | HOME-03 | T-03-22-02 | no new server call | unit + hook | `npx jest src/features/home/__tests__/comingUp.test.ts src/features/home/__tests__/useHomeViewModel.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-22-T2 | 03-22 | 3 | HOME-02 | T-03-22-01 | figures from engine only | component | `npx jest src/features/home/__tests__/ThisMonthCard.test.tsx src/features/home/__tests__/MonthChips.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-11-T1 | 03-11 | 4 | NAV-06 / D-17 | T-03-11-01 | N/A | component | `npx jest src/shell/screen/__tests__/useTabRootChrome.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-11-T2 | 03-11 | 4 | NAV-03 | — | N/A | component | `npx jest src/shell/screen/__tests__/TabRootScreen.test.tsx src/shell/screen/__tests__/DetailScreen.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-12-T1 | 03-12 | 4 | NAV-05 / D-11 | T-03-12-02 | close-then-run on next frame | component | `npx jest src/shell/fab/__tests__/FabQuickMenu.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-16-T1 | 03-16 | 4 | NAV-04 / D-26, D-27 | T-03-16-01 | dirty sheet never closes silently; Cancel never asks | component | `npx jest src/ui/__tests__/Sheet.dismissal.test.tsx src/ui/__tests__/useIsDirty.test.ts` | ❌ W0 (in task) | ⬜ pending |
| 03-16-T2 | 03-16 | 4 | NAV-04 / D-26 | T-03-16-01 | seven edit sheets report dirty | component | `npx jest src/features/record/__tests__/editSheets.dirty.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-19-T1 | 03-19 | 5 | D-16 | T-03-19-03 | overlay only in the top sheet | component | `npx jest src/state/__tests__/undoToast.test.ts src/ui` | ✅ (extend) | ⬜ pending |
| 03-19-T2 | 03-19 | 5 | NAV-06 / D-16 | T-03-19-01 | toast inside top sheet, no timer restart, local onUndo works | component | `npx jest src/features/record/history/__tests__/UndoToastHost.layer.test.tsx src/features/record/history/__tests__/history.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-23-T1 | 03-23 | 5 | HOME-01, HOME-04 | T-03-23-03 | fixed import entry literal | component | `npx jest src/features/home/__tests__/QuickActions.test.tsx src/features/home/__tests__/AccountsCard.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-23-T2 | 03-23 | 5 | HOME-03 | T-03-23-01 | no Pay on projections | component | `npx jest src/features/home/__tests__/ComingUpCard.test.tsx src/features/home/__tests__/HomeScreen.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-24-T1 | 03-24 | 5 | NAV-04 / D-25 | T-03-24-01 | restored ids validated | unit + hook | `npx jest src/features/record/entry/__tests__/draftForm.test.ts src/features/record/entry/__tests__/formDirty.test.ts src/features/record/entry/__tests__/useEntryList.test.tsx` | ✅ useEntryList (extend) | ⬜ pending |
| 03-24-T2 | 03-24 | 5 | NAV-04 / D-25, D-33 | T-03-24-02 | swipe on entry keeps draft; edit asks | component | `npx jest src/features/record/entry/__tests__/TransactionSheet.draft.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-13-T1 | 03-13 | 6 | NAV-03 / D-07, D-38 | T-03-13-02, T-03-13-04 | gate before Home/Activity; (tabs) never edge-swipes | unit + component | `npx jest src/features/navigation/__tests__/swipeBackGesture.test.ts src/features/record/setup` | ✅ (update) | ⬜ pending |
| 03-13-T3 | 03-13 | 6 | NAV-02 / D-22 | T-03-13-01 | shell only under (app) | integration (renderRouter) | `npx jest src/shell/__tests__/shellNavigation.test.tsx` | ❌ W0 (in task) | ⬜ pending |
| 03-15-T1 | 03-15 | 7 | NAV-05 / D-11 | — | N/A | component | `npx jest src/features/record/activity/__tests__/ActivityScreen.test.tsx` | ✅ (update) | ⬜ pending |
| 03-15-T2 | 03-15 | 7 | NAV-05 / D-09 | T-03-15-01 | FAB only signed in; no new write path | component | `npx jest src/features/record/entry/__tests__/ShellEntryHost.test.tsx` | ❌ W0 (in task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every test file is created inside the task that needs it (TDD tasks write the test first), so no separate Wave 0 plan exists. New scaffolds:

- [ ] `src/shell/backHistory/__tests__/*` (03-02, 03-06)
- [ ] `src/shell/tabBar/__tests__/*` (03-03, 03-08)
- [ ] `src/shell/fab/__tests__/*` (03-03, 03-07, 03-12)
- [ ] `src/ui/__tests__/sheetDrag.test.ts`, `Sheet.drag.test.tsx`, `Sheet.stack.test.tsx`, `Sheet.dismissal.test.tsx` (03-09, 03-16) with RNGH jest-utils and fake timers; no `@gorhom` mock (superseded)
- [ ] `src/ui/__tests__/Sheet.scrim.test.tsx` rewrite: ink at 0.38, black-rgba case removed (03-09)
- [ ] `src/state/__tests__/sheetStack.test.ts`, `activityFocus.test.ts` (03-06, 03-21)
- [ ] `src/features/record/history/__tests__/UndoToastHost.layer.test.tsx` (03-19)
- [ ] `src/engine/activity/__tests__/monthFigures.test.ts` (03-17, 100% folder)
- [ ] `src/features/home/__tests__/*` (03-22, 03-23)
- [ ] `src/shell/refresh/__tests__/useShellRefresh.test.tsx` (03-20)
- [ ] `src/shell/__tests__/testUtils.tsx` `renderWithShellProviders()` / `resetShellStores()` (03-06)
- [ ] `src/shell/__tests__/shellNavigation.test.tsx` (03-13; route tests live under src/ because jest roots exclude app/, research Pitfall 13)

---

## Manual-Only Verifications

Recorded in `docs/acceptance/phase-03-shell.md` by 03-14.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag feel, fling, scrolled-body hand-off, SwipeRow inside the entry sheet (A2) | NAV-04, D-12a/b | Gesture feel and arena behaviour on real hardware (research A4, A5) | Pixel: drag sheets from handle, header and body; fling; swipe REMOVE in the entry list |
| Android back chain and top-only sheet dismissal with predictive back off (A1) | NAV-02, D-06, D-29 | OS-level gesture | Discard prompt on a dirty account sheet, then History back to Home, then exit |
| Screen-reader focus on tab change and push, sheet escape, toast announcement over a sheet (A11; iOS I2) | NAV-06, D-20 | No reliable JS seam for OS focus movement | TalkBack (Pixel), VoiceOver (XR) |
| Text caps at the largest accessibility sizes, including inputs (A12; iOS I3) | DSG-07, D-19 | Rendered layout at OS extremes | Largest font size on both platforms |
| Haptics respect the OS setting (A13) | D-18 | OS setting | Touch feedback off; FAB and drag-close haptics silent |
| Reduced motion collapses every shell animation (A14) | D-21 | OS setting | Remove animations on |
| Home figures agree with Activity, Pay, projections, month sync (A9) | HOME-01..04 | Cross-screen behaviour on live data | Compare UNPAID with Activity's Unpaid list |
| Refresh toast copy by data change (A10) | D-17 | Needs a change from another session | Pull before and after a remote change |
| iOS edge swipe on details only, scroll bounce while dragging (I1, I4; pending Apple enrolment) | NAV-03, D-07 | Native gesture | iPhone XR |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are a checkpoint with recorded results
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (created in-task)
- [x] No watch-mode flags
- [x] Feedback latency < 60s per task command
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
