---
phase: 08-household
plan: 12
subsystem: i18n
tags: [copy, i18n, compliance]
requires: []
provides: [household.* typed copy namespace]
affects: [08-13, 08-15, 08-19, UI plans in waves 6-8]
key-files:
  created:
    - src/i18n/locales/household/{index,home,members,join,sharing,rules,settle,leave,account,notices}.ts
    - src/i18n/__tests__/householdCopy.test.ts
  modified:
    - src/i18n/locales/en.ts
decisions:
  - "Debt and goal-linked lines stay personal: reason sharing.reasons.linked_line_personal plus meta sharing.linkedLineMeta 'Debt and goal payments stay personal.' (08-GATES owner answer 2)"
requirements: [HH-01, HH-03, HH-10]
completed: 2026-11-15
---

# Phase 8 Plan 12: Household copy catalogue Summary

Typed `household.*` copy namespace in ten area files (one per area, plus index), wired into en.ts next to `appLife`, guarded by a compliance test.

## Commits
- ac6b6174: scaffold, en.ts wiring, home/members/join/notices/account
- 11876973: sharing/rules/settle/leave copy and householdCopy.test.ts

## Verification
- `npx tsc --noEmit`: clean
- `npx jest src/i18n`: 23 suites passed, 2 skipped, 19599 tests passed (includes householdCopy.test.ts)

## Deviations from Plan
None of substance. Notes:
- Copy follows the 2026-11-15 UI-SPEC revision only where it affects words; haptic/icon changes are for the UI plans.
- Key names beyond the plan's fixed ones (e.g. `sharing.reasons.*`, `notices.<event_kind>`) are my choice; consumers (08-15, 08-19) should read them from the files.
- `household.home.rename_sheet` uses snake case; harmless but could be renamed before consumers appear.
- Write-rejection reason keys other than `linked_line_personal` (not_creator, settled_line, stale_version, not_in_household, household_full, needs_connection, shared_lines_exist) are provisional until 08-10/08-15 fix the server reason codes.

## Known Stubs
None.

## Self-Check: PASSED
