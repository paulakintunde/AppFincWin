---
quick_id: 261101-mxs
status: complete
date: 2026-11-02
commit: 59de1a80
files_modified:
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
  - .planning/research/DECIDE-FIX-PLAN.md
  - .planning/phases/05.4-decide-safety-patch/05.4-HANDOFF-FROM-05.3.md
decisions:
  - "Decide stays off for everyone, testers included, until the Variant C screens are built in 08.1 (BO-08); named testers only from 08.1, behind the per-account switch and the BO-06 release check; the public after 08.2 (owner, 2026-11-02)"
  - "The closed beta (fix plan question 11) is retired"
  - "05.4 hides the 05.2 setup page and engine readout from profiles.decide_v3 accounts; the flag is on only for accounts on the repo tester list (05.4 D-29, D-30), for quiet shadow runs (owner, 2026-11-02)"
---

# Quick Task 261101-mxs: Decide Stage 0 housekeeping

## What changed
- **PR #90 rebased** on main after PR #91. Three clashes were resolved by keeping both sides: the 08.1 goal now carries Variant C and #91's requirement IDs, the STATE table keeps both rows, and the fix-plan Status line keeps both sentences. The jee row now shows the rebased commit 862f3ba6.
- **Fix plan:**
  - Every tester switch-on line is marked withdrawn or retired: Decision 4, the 05.3 exit gate, question 2, section 10 row 6, question 11, APP-21 and appendix ARC-01.
  - The 2-week hold and ARC-01 dependencies are gone from ARC-03, APP-17 and CMP-F10.
  - BO-06 now closes the decide_v3 setup-page gap, and BO-08 says it covers the setup page too.
  - The reading test is about 5 people a round, and Theme O round 1 is Variant C alone.
  - UX-20 moved out of the Release list.
- **ROADMAP:**
  - 05.2 is ticked, the execution order matches the fix plan, and the two missing phases are named.
  - 05.4 criteria 8 (about 70 cases) and 9 (off for everyone, testers included) are updated.
  - 05.5 criteria are renumbered, and the Phase 5 visibility wording is fixed.
- **STATE:** the current focus is 05.4, and 05.3 is recorded as parked. Also added: a visibility decision, a todo to count production decide_v3 accounts, a todo listing the open owner decisions, and session continuity.
- **REQUIREMENTS:**
  - DSU-01..24 are ticked, based on 05.2-VERIFICATION (passed).
  - DSU-01 and DSU-14 now carry the visibility rule.
  - Variant C notes for ARC-26 are added on DSU-04, DCU-07, DCU-20, DEC-30 and DCU-34, 35, 39, 40.
  - A new "Decide — Fix plan" section points to the fix-plan appendix.
  - Coverage is recounted: 316 total, 188 ticked, 316 mapped.
- **05.4 handoff note** copied unchanged from the parked 05.3 branch.

## Verification
- A grep for stale wording finds only lines marked withdrawn, retired or settled.
- Line endings are unchanged: CRLF files stay CRLF.

## Not done
- The production count of `profiles.decide_v3` accounts was not run: the auto-mode classifier blocked a read-only production query. It is a STATE todo and the first step of BO-06.
- The final ARC-26 requirement edits and the PROJECT.md tax line stay in 05.5.

## Deviations
Docs only. The orchestrator made the edits itself with a script that requires each target text to match exactly once, instead of spawning planner and executor agents.
