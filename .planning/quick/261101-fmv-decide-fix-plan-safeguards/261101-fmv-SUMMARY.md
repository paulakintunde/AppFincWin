---
phase: quick-261101-fmv
plan: 01
subsystem: planning
tags: [decide, fix-plan, testing, quality]
requires: []
provides: [Theme M, QA-01..QA-04]
affects: [Phase 05.4, Phase 08.1, Phase 08.2]
key-files:
  created: []
  modified:
    - .planning/research/DECIDE-FIX-PLAN.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Owner approved all four safeguards by popup on 2026-11-01: design freeze, right-answer table, cross-check calculator, mutation testing"
  - "Safeguards add about 1 week to 05.4 (now 5 to 6 weeks); running totals and the short version moved by 1 week"
  - "Mutation gate: 90% at the end of 05.4, 95% by 08.2; per-change runs on changed files, full run nightly"
  - "Prototype-made golden files are kept as a record only and deleted with the old engine in 05.5; the right-answer table is the source of truth"
status: complete
---

# Quick Task 261101-fmv: Summary

Added Theme M, "Getting it right the first time", to the Decide fix plan.

- **Root causes recorded, with evidence from origin/main:**
  - 459 of 3,025 commits are fixes, 199 of them in Decide.
  - The screen spec had 18 revisions, and the engine was rewritten after the screens were built.
  - The golden tests were generated from the prototype, so 100% coverage locked in the too-kind rules.
  - Decide runs before Grow and Household exist.
  - The same figures are worked out twice.
  - Bugs are found late.
- **QA-01..QA-04 added:**
  - to the 05.4 fixes, length and exit gate;
  - to the 08.1 and 08.2 exit gates;
  - to the financial and engine auditor checklists;
  - to the risk table (scope growth, slow mutation runs, a calculator that copies the engine's mistakes);
  - to the theme key and the appendix.
- **Timeline:** shifted by 1 week.
- **ROADMAP:** 05.4, 08.1 and 08.2 list the QA IDs in their requirements and success criteria. Phase numbering is unchanged.

Checks: 19 QA mentions in the plan. Line endings stay CRLF. No proposed screen copy was added.
