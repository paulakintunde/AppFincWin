---
phase: 05-decide-ui
plan: 30
subsystem: decide-ui
tags: [check-flow, route, back-handling, debounced-recompute, card-terms]
requires: [05-14, 05-15, 05-16, 05-17, 05-19, 05-20, 05-21, 05-24, 05-36, 05-42, 05-52, 05-53]
provides: [CheckFlowScreen, CheckFlowHeader, CheckActionBar, CheckNotFound, useDebouncedValue, check flow route]
affects: [05-29, 05-26]
key-files:
  created:
    - app/(app)/decide/check/[id].tsx
    - src/features/decide/check/CheckFlowScreen.tsx
    - src/features/decide/check/CheckFlowHeader.tsx
    - src/features/decide/check/CheckActionBar.tsx
    - src/features/decide/check/useDebouncedValue.ts
    - src/features/decide/check/__tests__/CheckFlow.test.tsx
    - src/features/decide/check/__tests__/useDebouncedValue.test.ts
  modified:
    - src/i18n/locales/en.ts
requirements-completed: []
duration: 90min
completed: 2026-10-20
---

# Phase 5 Plan 30: Check flow screen Summary

The five-step check flow (route, header with step bar and combine pill, action bar, step composition, back handling) with a live `computeCore` verdict and `computeDetails` on inputs settled for 150 ms.

## Tasks
1. Route, CheckFlowScreen, header, action bar, useDebouncedValue and tests (18f50b0f).
2. Task 2 deferred: decided by 05-26 step 13 (the device result arrives in wave 10). No change made.

## What it does
- Route validates `id` (uuid), `step` ('1'..'5') and `kind` ('buy' | 'invest'); anything else renders the not-found state (`CheckNotFound`).
- Opens on the route step, else step 3 when a price and a method exist, else step 1. A jump to step 3 or later without both lands on the first incomplete step with "A price and a payment method come first."
- Back (header, Android button, edge swipe) steps back past step 1 and leaves at step 1; never prompts. The swipe interceptor and `hardwareBackPress` are claimed only past step 1 and released in the effect cleanup (also on unmount). Save and close flushes the draft, toasts "Saved" and leaves.
- Step 3: `Step3Verdict`, then month, where it lands, day by day, who pays what, against your lines, if something goes wrong, with the expected income, what would make it work, assumptions in play. Each collapsed by default, expanded state kept for the visit.
- D-56: `computeCore(source, inputs, stack.otherChecks)` on every edit; `computeDetails` on the 150 ms settled inputs (`settledCore` memo, no ref). Detail sections carry `accessibilityState.busy` while settling.
- D-40: Step 2 `onSaveCardRate`/`onSaveCardTerms` call `useSaveCardRate`/`useSaveCardTerms` (existing debt found by `terms.debtId`); step 3 basis row and the Assumptions "Card payments" row open `CardMinimumSheet` for `meta.cardsWithoutMinimumIds[0]` on an open check.
- Bought checks compute through `useBoughtCheckComputation` (05-52), so the purchase is never counted twice.
- Analytics: `check_step_viewed` (string step, once per step per visit), `check_completed` (state enum, first reveal on step 3); `useMarkCheckSeen` stores (state, basis) on the same first reveal. No store-review import anywhere in `src/features/decide`.

## Carry-overs
Done here: route file; swipe-back interceptor release with the test `releases the swipe-back interceptor on unmount`; `onSaveCardTerms` wired; `meta`, `stack`, `conversions`, `basisItems`, `formatDate` passed to AssumptionsSection; `checkId`/`checkStatus` to Step5Decision; household props for ScopeToggle/WhoPaysSection (`currency`, `memberNames`, `share`, day-one and monthly totals, `readOnly`); bought checks via `useBoughtCheckComputation`; D-56 settled memo and source-module spies as specified; section placement per the plan.

### Left for 05-29
- `onCommit` is a prop of `CheckFlowScreen`, not yet supplied by the route: the Step 5 primary button is inert in the app until 05-29 passes `useCommitDecision` from the route file.
- Resolving debt/savings categories and the card account before the Go ahead confirm (05-20 `buildGoAheadWrite` throws when null).
- Passing `today`/`investAccountName` to `writtenLines` for the confirm sheet.
- Committing decisions and decided-check opening rules. Here a decided check opens as a read-only flow (inputs inert, no Step 5 primary, no combine pill, no seen-state write); bought uses the 05-52 hook, waiting and passed use the live path.

## Decisions
- Household name label: no source exists before Phase 8, so `decide.scope.household` ("Household") is used.
- `recurringBills` for Step 1 come from the snapshot's home-currency bills (names from `useRecurringSeries`), so foreign-currency series are already converted.
- `lineName` for the options section maps a category id to `categoryName(...)`, else "Uncategorised".

## Deviations from Plan
**1. [Rule 3 - Blocking] New copy keys.** `decide.flow.loadFailed`, `decide.flow.retry` (snapshot read failed with nothing cached) and `decide.scope.household` (ScopeToggle needs a household label). Files: `src/i18n/locales/en.ts`. Commit 18f50b0f.

Otherwise plan executed as written. No engine edits, no migrations.

## Known Stubs
None. `onCommit` defaults to a no-op until 05-29 (listed above).

## Deferred Issues
- `npm run lint` warnings rose 713 to 718 (0 errors): the new test uses `require()` in `jest.mock` factories like the neighbouring tests.

## Human / device items
- DayByDaySection's "add a pay series" link opens Record's entry sheet through `entryHost`, but `ShellEntryHost` is mounted in the tabs layout, behind this outer route: confirm the sheet appears over the check flow on device (05-26); if not, mount a host in the route or return to the tab first.
- Keyboard and the pinned action bar on iOS (`KeyboardAvoidingView` padding) and Android (adjustResize); Android back and edge swipe stepping; large-font header at 402x874; the combine pill in the header right slot.
- Screen-reader focus to the title on step change; busy state on the detail sections.

## Self-Check: PASSED
