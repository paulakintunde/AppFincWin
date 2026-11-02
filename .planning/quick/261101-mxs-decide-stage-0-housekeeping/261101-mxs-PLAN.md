---
quick_id: 261101-mxs
type: quick
status: planned
files_modified:
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
  - .planning/research/DECIDE-FIX-PLAN.md
  - .planning/phases/05.4-decide-safety-patch/05.4-HANDOFF-FROM-05.3.md
must_haves:
  truths:
    - "PR #90 sits on top of PR #91 with no conflicts, and the Theme O reading-test row says Variant C alone, about 5 people"
    - "Every doc says Decide stays off for everyone, testers included, until the Variant C screens are built in 08.1 (BO-08); named testers only from 08.1; the public after 08.2"
    - "The closed beta (question 11), the 05.3-46 tester switch-on (Decision 4, question 2), the 2-week hold and the ARC-01 dependencies are marked withdrawn"
    - "05.4 closes the gap where a profiles.decide_v3 account can open the 05.2 setup page and engine readout (owner, 2026-11-02)"
    - "STATE points at 05.4 next and records 05.3 as parked; ROADMAP and REQUIREMENTS match what is built"
    - "The 05.4 handoff note from the parked 05.3 branch is on main"
---

# Quick Task 261101-mxs: Decide Stage 0 housekeeping

Docs only, no code. Owner answers on 2026-11-02: keep the approved rule (testers first see Decide on the Variant C screens in 08.1), and close the decide_v3 setup-page gap in 05.4.

## Task 1: Rebase PR #90 on main
Resolve the ROADMAP 08.1 goal and requirements lines, the STATE quick table and the fix-plan Status line by keeping both sides.

## Task 2: Fix plan follows BO-08
Decision 4, the 05.3 exit gate and dependency, APP-21, UX-26, the Theme O reading-test row, BO-06 (test-flag gap), BO-08, section 10 row 6, section 11 questions 2 and 11, the flag risk row, appendix rows ARC-01, ARC-03, APP-17, CMP-F10, APP-21, UX-20, UX-26, and a progress note on ARC-26.

## Task 3: ROADMAP, STATE, REQUIREMENTS
- ROADMAP: tick 05.2, Phase 5 visibility wording, real execution order, 05.4 criteria 8 and 9, 05.5 numbering, 08.2 reading-test size.
- STATE: frontmatter, current focus and position (05.4 next, 05.3 parked), a visibility decision, two todos, the corrected jee commit, session continuity.
- REQUIREMENTS: tick DSU-01..24 on 05.2-VERIFICATION evidence, Variant C notes for ARC-26, a fix-plan section, recount coverage.

## Task 4: Copy the 05.4 handoff note
From `origin/phase/05.3-decide-screens-v3`, unchanged.

## Verify
`grep "closed beta|5 + 5|earlier if beta|until 05.1-05.3"` finds only lines marked retired, withdrawn or settled.
