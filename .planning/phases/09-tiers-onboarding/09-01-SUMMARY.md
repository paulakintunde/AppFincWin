---
phase: 09-tiers-onboarding
plan: 01
subsystem: planning-documents
tags: [owner-signoff, level-map, wording, owner-questions]
requires: []
provides:
  - "09-LEVEL-MAP.md signed (levels 1-4: 5/19/29/32 features)"
  - "09-WORDING.md signed (424 rows, no banned words)"
  - "09-OWNER-QUESTIONS.md signed (P1-P8 answered)"
affects: [09-05, 09-10, 09-11, 09-12, 09-19]
key-files:
  created:
    - .planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md
    - .planning/phases/09-tiers-onboarding/09-WORDING.md
    - .planning/phases/09-tiers-onboarding/09-OWNER-QUESTIONS.md
key-decisions:
  - "Levels accepted as drafted; search every month (Everything), Reconcile one row (Full picture) listed; forecast stays in Decide; household rows at Everyday"
  - "P1-P3, P5-P8 take the recommended option"
  - "P4 changed: both payers choose when two plans cover one home; 7-day default keeps the takeover plan"
metrics:
  completed: 2026-11-19
---

# Phase 9 Plan 01: Owner sign-off documents Summary

The level-to-feature map, the wording file and the planner's open questions are drafted, answered and signed by the owner on 2026-11-19, which opens the gate for plans 09-10, 09-11 and 09-12.

## Commits

- 15c83ed4: level map draft (Task 1)
- 13b63f01: wording file and owner questions draft (Task 2)
- 612c4178: owner sign-off and answers (Task 3)

## Startup note

The worktree base was reset to 244fff44 (phase planned) at startup before work continued.

## Owner decisions recorded

- Level map: accepted as drafted. Section 5: Q2, Q3, Q7 yes; Q1, Q4, Q5, Q6, Q8-Q11 no; Q12 Everyday.
- Questions: P1, P2, P3, P5, P6, P7, P8 recommended option. P7 plan reference corrected 09-06 to 09-04 (leave grace and invite rules); P8 corrected 09-03 to 09-02 (trial_ledger table, on delete cascade).
- **P4 changed from the draft.** When two plans cover one home after a takeover, both payers are shown "Two plans cover this home. Pick one." If neither picks in 7 days the takeover plan stays and the old payer is told to cancel or ask the store for a refund. The unchosen plan's payer is always told that; the app never cancels anything. **This affects 09-05 (plan_apply double-cover state and the 7-day default via sweep) and 09-19 (notice and choice UI); the orchestrator will patch those plans.**

## Wording additions needing owner review

Five new rows under `plans.doubleCover.*` (title, body, choiceNew, choiceOld, defaultLine), status sign-off, marked "added after owner sign-off 2026-11-19 - needs owner review". Banned-word check re-run: 424 rows, 0 hits.

## Deviations from Plan

None beyond the owner's P4 change and the plan-number corrections above.

## Self-Check: PASSED
