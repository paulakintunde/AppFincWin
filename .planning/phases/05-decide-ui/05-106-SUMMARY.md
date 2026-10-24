---
phase: 05-decide-ui
plan: 106
subsystem: decide-flow
tags: [speed, idle, perf, D-88, R16.4, R16.16-M7]
requires: [05-88, 05-102, 05-105]
provides:
  - computeCore(source, inputs, other, { detailFor, prior }) resolves one method plan on a keystroke
  - settledCoreFor / sameInputs (settled core is the live core when inputs are equal)
  - details computed in an idle callback, stored with the core they came from
  - detail folds (setbacks, options, investing-instead) read "Updating" with busy state while pending
  - EXPO_PUBLIC_PERF=1 harness (perfMark, perfReport)
affects: [05-26]
key-files:
  created:
    - src/features/decide/perf/perfMarks.ts
    - src/features/decide/perf/__tests__/perfMarks.test.ts
    - src/features/decide/check/scheduleIdle.ts
    - src/features/decide/check/__tests__/scheduleIdle.test.ts
  modified:
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/check/CheckFlowScreen.tsx
    - src/features/decide/check/step3Folds.tsx
    - src/features/decide/ui/FoldList.tsx
    - src/features/decide/ui/FoldRow.tsx
    - src/features/decide/snapshot/__tests__/computeCheck.test.ts
    - src/features/decide/check/__tests__/CheckFlow.test.tsx
    - src/features/decide/check/__tests__/commit.test.tsx
decisions:
  - "While typing (settled != inputs) the screen passes detailFor = the selected method and prior = the last shown details; the other methods' plans and promo balances carry over until the inputs settle. A settle (typing false) rebuilds a full core, so the other strips refresh then"
  - "settledCore is null while typing and is the live core after the settle (settledCoreFor); computing a second core never happens on the screen path"
  - "Shown details are state {core, details}: seeded in render the first time (nothing on screen to keep), then replaced from an idle callback; pending = settledCore !== shown.core. busy (Go ahead disabled, fold busy state) = typing or pending"
  - "requestIdleCallback is called with a 200 ms deadline so a busy JS thread cannot starve the details; setTimeout 0 where it does not exist (jest)"
  - "Only folds built from computeDetails output say Updating (setbacks, options, investing instead); folds read from the live core (month, cash path, lands, income, who pays) keep their previews"
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 106: D-88 speed, flow side Summary

A keystroke now resolves one method plan and one core; the slow details wait for the 150 ms settle and then an idle callback, and the detail folds say "Updating" until they land.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. settledCore reuse and selected-method detail | 0210287d | `computeCore` options, `settledCoreFor`, `sameInputs`; perf harness included because `computeCheck` marks E4 |
| 2. Idle details, Updating previews, harness wiring | 021f2776 | `scheduleIdle`, screen state, `FoldSpec.busy`, perf marks on verdict and details |

## Verification

- Snapshot coverage command: 100% statements, branches, functions, lines; 12 suites, 248 tests.
- `npx jest src/features/decide`: 108 of 109 suites pass (1540 tests). The one failure is `engineBarrel.test.ts` ("the decide barrel exports exactly this surface"): `CARD_MAX_PURCHASE_USD` was added to the engine barrel by another plan in the shared worktree. Not touched here.
- `npm run typecheck` clean. eslint on the touched directories: 0 errors; warnings are pre-existing (unused `Outcome` in CheckFlowScreen, `require` imports in test mocks). No `react-hooks/refs` or `set-state-in-effect` findings.
- Named tests present and passing: "D-88 settledCore reuses core when inputs settle unchanged", "D-88 keystroke computes full detail for the selected method only" (CheckFlow, spy on `@/engine/decide/plan`), "D-88 detailFor resolves the selected method only and carries the others from the settled core", "D-88 details run after idle and show Updating meanwhile", "D-88 the perf harness is off unless EXPO_PUBLIC_PERF=1". The D-56 tests are kept.

## Deviations from Plan

**1. [Rule 3 - Blocking] D-56 tests flush the idle slot.** Details now arrive after the settle in an idle callback, so "the details settle", "rapid edits" and "a snapshot change" tests advance one more tick (`flushIdle`) before asserting `buildAlternatives`. The 149 ms / 150 ms assertions are unchanged, and a new assertion pins that the settle alone does not run the details. "A snapshot change recomputes the verdict and the details at once" is now "...the verdict at once and the details in the next idle slot" (D-88 speed 5).

**2. [Rule 3 - Blocking] `commit.test.tsx` (not in the plan's list).** The Go ahead stays disabled until the details land (busy covers the pending idle), so the CR-C05 test waits with `waitFor` (5 s) instead of a fixed 200 ms sleep.

**3. [Rule 3] `FoldList.tsx` / `FoldRow.tsx` (not in the plan's list)** gained an optional `busy` prop (accessibilityState `busy: true` only while pending), needed for the Updating preview's accessibility state.

**4. Perf harness shape.** `perfMark('<name>:start')` / `perfMark('<name>:end')` pairs, reported by `perfReport()` as `{count, median, p95}` over the last 30 per name (`verdict`, `details`, `e4`). Only durations are stored; no amounts.

**5. `settledCoreFor` fallback is unreached on the screen.** The screen passes `settledCore = null` while typing, so the helper only returns the live core there; its compute branch (inputs differ, or a narrowed live core) is covered by unit tests and guards a future caller.

## Issues for later plans / the user

- A stale-others trade-off, as D-88 specifies: while typing, the non-selected methods' step 2 strips and promo balances show the last settled plans until the settle; they refresh when the inputs settle.
- Go ahead is disabled slightly longer after an edit (150 ms settle plus the idle slot, at most 200 ms more).
- `engineBarrel.test.ts` failure belongs to the plan that added `CARD_MAX_PURCHASE_USD` (decide barrel list needs the new name).

## Device items

05-EXECUTION-NOTES entry 05-106 stands: on the Pixel 9 release build, run with `EXPO_PUBLIC_PERF=1`, type 30 keystrokes in the demo car check's deposit field, call `perfReport()`; budgets verdict median < 50 ms, details median < 300 ms, E4 < 30 ms at n = 500. "Updating" should show briefly on the folds. `perfReport` has no UI trigger yet; it is exported from `src/features/decide/perf/perfMarks.ts` and logged to the console.

## Known Stubs

None.

## Self-Check: PASSED
