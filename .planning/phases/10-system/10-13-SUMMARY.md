---
phase: 10-system
plan: 13
subsystem: data/sync
tags: [offline-queue, cap, SYN-03, SYN-04, SYN-05]
requires: [10-03, 10-04]
provides: [queueCap, useQueueGuard, QueueNote]
affects: [10-18 data import, 10-26 wallet import (reuse useQueueGuard)]
key-files:
  created:
    - src/data/sync/queueCap.ts
    - src/data/sync/useQueueGuard.ts
    - src/data/sync/__tests__/queueCap.test.ts
    - src/features/record/entry/QueueNote.tsx
    - src/features/record/entry/__tests__/TransactionSheet.queueCap.test.tsx
    - src/data/__tests__/persisterQueue500.test.ts
  modified:
    - jest.setup.ts
    - src/data/__tests__/idempotentRetry.test.tsx
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/activity/CloneMonthSheet.tsx
    - src/features/record/activity/useActivityViewModel.ts
    - src/features/record/import/PasteSheet.tsx
    - src/features/record/import/useStatementImport.ts
    - src/features/record/import/MatchesStep.tsx
    - src/features/record/import/ReviewStep.tsx
decisions:
  - Cap lives only at entry points; no change to any mutationFn, mutation default or the persister.
  - A clone, paste or import that would pass 500 is refused up front with the full D-28 message (owner default).
  - Neutral NoticeCard, no badge, no warning colour.
completed: 2026-11-23
---

# Phase 10 Plan 13: Write-queue cap Summary

The offline write queue is capped at the entry points (note at 400, new entries blocked at 500 with the owner's sentence), and the SYN-03 and SYN-04 guarantees are re-proven by named tests.

## Commits
- 67617cd4 feat(10-13): queueCap, guard hook, QueueNote, SYN-03 and 500-entry tests
- 1d2327d5 feat(10-13): guard the create surfaces at the 500-change cap

## What was built
- `queueCap` (<400 ok, 400-499 note, >=500 blocked), `canAdd(queued, adding)`, `useQueueGuard()` over `useSyncStatus().queued`, `QueueNote` (NoticeCard, no badge, nothing for 'ok').
- Guards: TransactionSheet (create only: note shown, Save disabled with a11y hint "disabled, N changes waiting", form stays editable; edits unaffected), CloneMonthSheet (count = ticked rows; refusal shows QueueNote in the sheet, no mutation), add month in useActivityViewModel (counts as 1 change; refusal shows the full message as a toast), PasteSheet (count = ready lines), statement import commit (count = rows to write; new CommitProblem 'queueFull' shown in ReviewStep and MatchesStep).
- Tests: `SYN-03: killed mid-flush then resumed writes one server row` (server commits, answer never arrives, queue persisted, new client restores and resumes, one row, one undo step); `persisterQueue500.test.ts` (500 realistic creates through the real encrypted persister, restore into a new client as 500 pending, all replay with their own ids).

## Verification (quick checks, milestone rule)
- queueCap, idempotentRetry, offlineWrite, persisterQueue500, TransactionSheet.queueCap, CloneMonthSheet, PasteSheet: pass.
- Full `src/features/record/import` plus TransactionSheet.test and .list.test: 20 suites, 479 tests pass.
- `tsc --noEmit`: clean (apart from the known expo-local-authentication error, not even shown). eslint on touched files: 0 errors (2 pre-existing warnings).
- Acceptance greps: no cap code in `src/data/mutations/`; no amber/danger styling in QueueNote.

## Findings
- 500 realistic creates serialise to about 407 KB, under the persister's main-row budget, so no overflow rows are used and `persister.ts` is untouched (no dropped writes).
- In the 500-entry replay each insert id reached the server stand-in twice (resumeRestoredMutations plus the online listener both continuing a restored write). Harmless by design (23505 then read-back, the SYN-03 path) so the test asserts every id is sent and none is invented. Worth a look in a later plan if double sends matter for rate limits.
- The 500 test does not exercise the multi-row overflow path (persisterBudget.test already covers that).

## Deviations from Plan
- [Rule 3] Added a default mock of `@/data/sync/useQueueGuard` in `jest.setup.ts` (empty queue, `setMockQueued(n)` to change it): most record suites render create surfaces with no QueryClient, and the guard reads the mutation cache. New tests use it.
- [Rule 3] Added the queue note and a `useQueueGuard` call to MatchesStep.tsx and ReviewStep.tsx (not in files_modified) so the 'queueFull' import refusal is visible.
- Add month counts as 1 queued change (it is one RPC mutation), not a line count.
- Save a11y text is delivered as the Save button's accessibilityHint (disabled state is set), not its label, because EntryListFooter owns the label.
- The two import suites were not given a dedicated queueFull test (covered by the shared guard and the PasteSheet/Clone tests); flagged for the verifier.

## Known Stubs
None.

## Orchestrator notes
No installs, no migrations, no pgTAP. Self-Check: PASSED (files exist, commits present).
