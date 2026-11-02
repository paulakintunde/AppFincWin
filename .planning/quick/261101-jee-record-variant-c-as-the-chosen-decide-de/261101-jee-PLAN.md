---
quick_id: 261101-jee
type: quick
status: planned
files_modified:
  - .planning/ROADMAP.md
  - .planning/research/DECIDE-FIX-PLAN.md
  - .planning/STATE.md
must_haves:
  truths:
    - "ROADMAP 08.1 says Variant C was chosen on 2026-11-01, not 'proposed'"
    - "The fix plan's status line, Decision 7, section 8, QA-01, UX-26, risk table and question 7 say Variant C is chosen and A and B are retired"
    - "Reading-test round 1 runs on Variant C alone (about 5 people) to find what confuses people, then the screens are frozen (QA-01)"
    - "Grow stays out of the Decide reading test"
    - "STATE records the decision and the quick task"
---

# Quick Task 261101-jee: Record Variant C as the chosen Decide design

The owner chose Variant C on 2026-11-01, ahead of reading-test round 1. The planning docs still say "Variant C proposed, confirmed after round 1, which tests A, B and C". Docs only; no code.

## Task 1: ROADMAP.md
- Phase list line for 08.1: "Variant C proposed, confirmed after reading-test round 1" becomes "Variant C chosen 2026-11-01; reading-test round 1 on Variant C finds fixes before the freeze".
- Phase 08.1 goal: replace the "Design: Variant C is proposed ... tests Variants A, B and C" sentences with the chosen wording.

## Task 2: DECIDE-FIX-PLAN.md
- Status line: add the Variant C decision.
- Decision 7: add the 1 November update.
- 05.4 clarity list: UX-26 round 1 is on the Variant C mockups.
- Theme J reading test (UX-26): round 1 on Variant C, to find what confuses people.
- QA-01: round 1 no longer picks a design; fix its findings, then sign off and freeze.
- Section 8: retitle, add a decision note and a short Variant C summary from the canvas board titles; mark the A+B blend dropped. Keep the A and B text for the record.
- Section 12 risk "Variant B cost": closed, with Variant C's graphs sized at 08.1 planning.
- Section 11 question 7: settled.
- Appendix row UX-26: Variant C mockups.

## Task 3: STATE.md
- Roadmap Evolution line for 08.1: chosen, not proposed.
- Decisions: add the decision.
- Quick Tasks Completed: add 261101-jee.

## Verify
`grep -n "Variant C proposed\|Variant C is proposed\|not yet chosen\|picks a design"` over the three files returns nothing.
