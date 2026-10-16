---
phase: 05-decide-ui
plan: 22
subsystem: decide-past-decisions
tags: [decide, journal, estimate-vs-actual, attach, unlink, remove, reopen]
requires: [05-08, 05-09, 05-11, 05-12, 05-19, 05-21, 05-39]
provides: [PastDecisionsScreen, DecisionDetailSheet, AttachLineSheet, usePastDecisions, usePastContext, useReopenDecision, useAttachCandidates, "/decide/past route file"]
affects: [05-24, 05-30]
key-files:
  created:
    - app/(app)/decide/past.tsx
    - src/features/decide/past/PastDecisionsScreen.tsx
    - src/features/decide/past/DecisionDetailSheet.tsx
    - src/features/decide/past/AttachLineSheet.tsx
    - src/features/decide/past/usePastDecisions.ts
    - src/features/decide/past/__tests__/PastDecisionsScreen.test.tsx
    - src/features/decide/past/__tests__/DecisionDetailSheet.test.tsx
    - src/features/decide/past/__tests__/helpers/pastFixtures.ts
  modified:
    - src/data/queries/decide.ts
requirements-completed: []
---

# Phase 5 Plan 22: Past decisions Summary

Past decisions list and decision detail sheet: every bought, waiting and passed decision newest first, a 30/90-day estimate-vs-actual from the linked lines (numbers only, words always beside colour), attach and unlink lines, and remove (asks once, undoable) or reopen with reminders cancelled.

## What was built
- **List** (`PastDecisionsScreen`): state chip in words, sub-lines per status, Waiting rows with the goal progress bar, a delta strip on Bought rows (monthly estimate against actual with "+$x over / at / -$x under", or "Payments matched the schedule for n of m" for loan and instalment), a Reopen pill on Waiting and Passed only, empty state, all behind `canUse('decisionJournal')`. No "twelve months" or "kept on file" wording.
- **View model** (`usePastDecisions.ts`): `usePastContext` (identity, home, stored rates, formatters), `usePastDecisions` (decided checks, links, linked lines, goals), pure `estimateInputFor` / `deltaFor`, and `useReopenDecision` (cancel reminders, reopen, toast, push step 1). Estimates convert at stored rates; an unconvertible estimate leaves the comparison out.
- **Detail** (`DecisionDetailSheet`): label/value tile, "Compared at 30 days — {date}" before day 30, `compareEstimate` lines at each reached checkpoint, neutral "Running $x a month over the estimate." note, linked rows with a 44px unlink (Undo toast), Attach a line, Remove through `ConfirmSheet` (destructive; passes the live Wait goal to `useRemoveDecision`, cancels reminders, toast with Undo), Reopen the check for waiting and passed. Passed detail: Quoted, Why it was passed, Decided {date}, "Kept until you delete it".
- **Attach** (`AttachLineSheet`): own-household lines from the last 90 days, already linked ones left out; passes `decidedAt` and `lineDate` to `useAttachLine` (role set by date, no picker).
- `useAttachCandidates` added to `src/data/queries/decide.ts` (05-12 key `decideAttachCandidates`) so the feature does not import the Supabase client.
- Route file only (`app/(app)/decide/past.tsx`); its Stack.Screen registration is 05-24's.

## Verification
- `npx jest src/features/decide/past --forceExit`: 2 suites, 16 tests pass; `noRawColours`, i18n and data/queries suites pass (20 suites, 8542 tests).
- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean.
- Acceptance greps: `canUse('decisionJournal')` 1 in the screen; no twelve-months wording; `cancelCheckReminders` and `destructive` present in the detail sheet.
- No migrations; pgTAP skipped (Docker down).

## Deviations from Plan
- **[Rule 3 - Blocking]** Added `useAttachCandidates` to `src/data/queries/decide.ts` (not in the plan's file list) so the picker reads through the data layer.
- Added `__tests__/helpers/pastFixtures.ts` and `usePastContext` / `useReopenDecision` exports to share the list and sheet logic; `AttachLineSheet` takes `userId` and `decidedAt` props in addition to the plan's signature (needed by `useAttachLine`).
- "Final price" uses the check's entered price; "Actual on the day" / "Actual a month" show a dash until day 30.
- A series link shows as one linked row (first line's name, summed amount) with one unlink; transaction links show their line.
- No engine edits.

## Human/device items
- Visual check of the list rows, delta strip and detail sheet on device; TalkBack on the 44px unlink and Reopen controls.

## Known Stubs
None.

## Self-Check: PASSED
