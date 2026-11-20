---
quick_id: 261119-as7
status: complete
date: 2026-11-19
commit: 72b035dc
---

# Quick 261119-as7 Summary

## Done
- **05.4-45 SUMMARY written.** The scheduled Nightly runs on main for 2026-11-16, 17, 18 and 19 were all green (cross-check at 20,000 cases, properties at 2,000), so QA-03 is met. The full Stryker run is no longer part of the nightly (mutation-full.yml, weekly since PR #132), so QA-04's score comes from 05.4-43's full run (PR #168, still running). 05.4-45 is ticked in ROADMAP with that note.
- **08.1 trimmed from 21 plans in 13 waves to 18 plans in 10 waves:**
  - Deleted 16 (reading test round 2), 17 (fix pass, freeze, compliance gate) and 18 (named testers).
  - Plan 14: Task 2 (carry-over audit, Create-from-Decide check) removed. Task 3 (wording sign-off) kept.
  - Plan 15: Task 4 added (new tester ids). It is now the last plan.
- **The moved items are listed under Phase 08.2** in ROADMAP. The owner's choices are recorded as R1-R5 in 08.1-OWNER-QUESTIONS, and CONTEXT has an amendment note.
- **Stale references fixed:**
  - "plan 16 pushes" in plans 02, 03 and 05 now says plan 15.
  - The plan-17 references in plan 20's threat row and in UI-SPEC now point to 08.2.
  - VALIDATION rows 17-03 and 18-02 removed.

## Deviation from the owner's first choice
The owner first chose to move the wording sign-off to 08.2, then kept it in 08.1 (R5). The wording lock (src/i18n/__tests__/wordingSignoff.test.ts) has been active since the 06.1 sign-off. It fails CI on any unsigned Decide key, so 08.1 could not merge without the sign-off.

## Checks
- `git merge-tree` against origin/feat/08.1-build gives no new conflicts. The only conflict is in STATE.md, and it already exists between main and the build branch.
- No live reference to 08.1-16, 17 or 18 remains in the 08.1 folder or ROADMAP.
- ROADMAP's progress row and checkboxes 01-07 were left for feat/08.1-build to update.
