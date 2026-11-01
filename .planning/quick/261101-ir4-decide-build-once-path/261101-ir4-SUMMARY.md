---
phase: quick-261101-ir4
plan: 01
subsystem: planning
tags: [decide, fix-plan, roadmap, variant-c]
requires: []
provides: [Theme N, BO-01..BO-09]
affects: [Phase 05.3, Phase 05.4, Phase 05.5, Phase 6, Phase 8, Phase 08.1, Phase 08.2]
key-files:
  created: []
  modified:
    - .planning/research/DECIDE-FIX-PLAN.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "05.3 stopped and parked, not merged; the 8 in-flight plans finish (owner, 2026-11-01)"
  - "Decide off for everyone, testers included, until 08.1; shadow runs on testers' records instead"
  - "08.1 estimated at 4 to 6 weeks, to be set at planning; running total 16 to 20 weeks"
  - "Phase directory and ROADMAP phase name for 08.1 are unchanged to avoid gsd-sdk renumbering; the content says Variant C built once"
status: complete
---

# Quick Task 261101-ir4: Summary

- Recorded the owner's build-once decision as fix plan Theme N (BO-01..BO-09) and wired it into the phases and the roadmap.
- 05.3 is marked stopped. 05.4 gains the harvest, the Variant C engine types, the switch check and shadow runs, and its screen-side items move to 08.1.
- 05.5 gains the six connection points. Grow and Household are marked as designed for Variant C.
- 08.1 builds Variant C once, and 08.2 switches it on and deletes the old screens in the same release.
- Follow-up: the Variant C full audit (running now) may add more fix IDs in a later change.
