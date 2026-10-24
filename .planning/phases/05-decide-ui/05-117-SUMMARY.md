---
phase: 05-decide-ui
plan: 117
subsystem: decide-home
tags: [decide-home, quiet-rows, fab, notice-row, header]
requires: [05-110, 05-111, 05-113, 05-114, 05-115, 05-116]
provides: [DecideHomeScreen (R17), hideSyncLine, useRegisterFab(null) suppression, fieldA11yLabel, homeRowsModel, useSyncNow]
affects: [05-118]
key-files:
  created:
    - src/features/decide/home/homeRowsModel.ts
    - src/features/decide/home/useSyncNow.ts
    - src/features/decide/home/__tests__/homeRowsModel.test.ts
  modified:
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/home/HomeSummaryCard.tsx
    - src/features/decide/quick/QuickCheckForm.tsx
    - src/features/decide/perf/perfMarks.ts
    - src/features/decide/DecideShellHost.tsx
    - src/shell/fab/FabProvider.tsx
    - src/shell/screen/useTabRootChrome.tsx
    - src/shell/header/CompactHeader.tsx
    - tests: TabRootScreen, Fab, DecideHomeScreen, HomeSummaryCard, QuickCheckForm
decisions:
  - useRegisterFab(null) did nothing in the shipped provider (it returned early), so the app-wide default "Add" FAB would still have shown on Decide home. FabProvider now has a ref-counted suppressDefaultFab; null suppresses the default while the screen is focused. No new FabHideReason.
  - perfMark gained an optional second argument (a plain measured value) because the plan's perfMark('home.cardBottom', y + height) did not match the shipped duration-only signature. Bottoms are in scroll-content coordinates (body y + child y + height).
  - homeBasisSeen is read once per visit into screen state (null until read, treated as seen so a returning user never flashes the switch label). The mark is a guarded effect that only calls storage; the state is never updated by it, so the label holds for the rest of the visit.
  - Past decisions row value is the plain count (spec "{{count}}"), not the old "2 decisions" text.
  - changedOpenCount mirrors OpenChecksCard's marker logic in a pure module rather than refactoring the card (kept the card untouched).
requirements: [DCU-34, DCU-01, DCU-03, DCU-14, DCU-15, NAV-05]
metrics:
  completed: 2026-10-24
  tasks: 2
---

# Phase 5 Plan 117: Decide home composition Summary

Decide home is now the dark card first: lean header "Can I afford it" with the avatar, one notice row, the HomeSummaryCard, 32 of space, then up to four quiet rows that open their own screens. No FAB on this screen.

## Commits

- 09b7b11c feat(05-117): hideSyncLine option for a tab root's headers (Task 1)
- 4c8120b9 fix(05-117): useRegisterFab(null) now holds back the default FAB while focused
- 617311f2 feat(05-117): QuickCheckForm fieldA11yLabel prop, passed from the home card
- c2ed1ce9 feat(05-117): Decide home composed dark-card first with quiet rows and one notice row (Task 2)

## What was built

- `hideSyncLine` on `useTabRootChrome` / `CompactHeader` (default false; other tabs unchanged).
- `DecideHomeScreen` rewritten: `TabRootScreen title={decide.home.header} hideSyncLine` (no eyebrow, subtitle or refreshKeys); `HomeNoticeRow` driven by `noticeRowModel(homeProblems({source, openChecks, sync, today, now}))`; `HomeProblemsSheet` with the same live entries plus source, settings, userId, currency; `HomeSummaryCard` (`onOpenDetails` opens `MonthDetailsSheet` with the card label as `title` and the sources note built from `decide.home.sources` / `sourcesRough`); `HomeRow`s linking to `OPEN_HREF`, `CHANGES_HREF`, `PAST_HREF`, `LINES_HREF`; `ChangeSheet` (add mode, from the zero-changes row) and `RoughFiguresSheet` hosted by the screen.
- Row rules: Open checks hidden at 0, second line "{n} changed since you looked"; Changes shows count, or "Add a change coming up" with no value at 0; Past decisions hidden at 0; Lines always ("{n} of 5 set by you" / "All at their defaults").
- `homeRowsModel.ts` (pure): `liveOpenChecks`, `changedOpenCount`, `linesSetCount`. `useSyncNow.ts`: clock for the 5 s sync rule using the same two timers as SyncStatusLine.
- `homeBasisSeen`: marked once via `markHomeBasisSeen`, `homeBasisSeen=false` kept for the card for the rest of the visit (hand-off note 2).
- `QuickCheckForm` optional `fieldA11yLabel` (onboarding unchanged); `HomeSummaryCard` passes `decide.home.field.a11y`. HomeSummaryCard test updated to the new label.
- Budget probe: card and rows `onLayout` call `perfMark('home.cardBottom' | 'home.rowsBottom', bottom)`; no-ops unless EXPO_PUBLIC_PERF=1.
- You > Add > New check still works: `DecideShellHost` registers the `newCheck` quick action independently of the home screen (test added; stale comment fixed).

## Verification

- `npx jest src/features/decide src/shell src/features/you src/i18n`: 163 suites, 16419 tests pass (D-76 text-fit allowlist unchanged, still exact).
- `npm run typecheck` clean; eslint 0 errors (41 pre-existing warnings); `npm run depcruise` no violations.
- Named tests present: D-96 hideSyncLine; D-95 dark card first, at most four rows, budget probe; D-99 hide-at-zero / add row; D-98 no FAB, FAB on another tab root (real provider, Fab.test), You Add New check.

## Deviations from Plan

**1. [Rule 1 - Bug] useRegisterFab(null) was a no-op.** The plan and R17.13 M1 assume null makes `hasAction` false. In the shipped provider the default action from ShellEntryHost still supplies the "Add" FAB. Fixed in FabProvider (`suppressDefaultFab`, ref-counted, applied on focus, released on blur). Commit 4c8120b9. FabProvider and Fab.test were not in the plan's files_modified list.

**2. [Rule 3 - Blocking] perfMark signature.** Extended with an optional value argument (see decisions). File: perfMarks.ts.

**3. [Rule 1] HomeSummaryCard.test** label query changed to "Quick check, something and a price" after note 5.

**4. DecideShellHost comment** updated (it said the Decide screen sets the FAB label).

Device item for 05-26 (entry 05-117) is not done here: FAB absence on a device, 32 gap, header without sync line, and the perf probe readings need a device. Requirements were not ticked in REQUIREMENTS.md for that reason.

## Unused leftovers (for 05-118)

Components no longer rendered by the home:
- `AddChangeRow.tsx` (+ `AddChangeRow.test.tsx`): unused.
- `YourMonthCard` default component (+ parts of `LinesAndMonth.test`): unused; `MonthDetailsBody` and `YourMonthCardProps` from the same file are still used by `MonthDetailsSheet`.
- Still used, by the pushed screens: `OpenChecksCard`, `ChangesCard`, `LinesCard` (`flat`).

Copy keys with no remaining non-test reference:
- `decide.tab.eyebrow`, `decide.tab.subtitle`, `decide.tab.title` (no references found in src or app), `decide.fab.label`, `decide.fab.a11y`
- `decide.home.pastRow`, `decide.home.pastCount_*`
- `decide.home.addChange`, `decide.home.checkInvestment` (only AddChangeRow)
- `decide.home.linesFold.*` is still used by LinesCard (title may be, preview/allDefault duplicates `decide.home.rows.lines*`); `decide.home.noFigures.*` still used by YourMonthCard and QuickCheckForm.

## Known Stubs

None.

## Self-Check: PASSED
