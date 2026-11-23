---
phase: 10-system
plan: 04
subsystem: i18n
tags: [copy, i18n, status-badges, you-rows]
requires: []
provides:
  - system.* copy namespace (appLock, security, alerts, push, archive, ownData, queue, reviewer)
  - STATUS keys thisDevice, archived, locked, quietHeld, check
  - YouRowId security, alerts, archive, importCsv, diagnostic
affects: [10-system UI plans in later waves]
key-files:
  created:
    - src/i18n/locales/system/index.ts
    - src/i18n/locales/system/appLock.ts
    - src/i18n/locales/system/security.ts
    - src/i18n/locales/system/alerts.ts
    - src/i18n/locales/system/push.ts
    - src/i18n/locales/system/archive.ts
    - src/i18n/locales/system/ownData.ts
    - src/i18n/locales/system/queue.ts
    - src/i18n/locales/system/reviewer.ts
    - src/i18n/__tests__/systemCopy.test.ts
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts
    - src/i18n/locales/appLife/status.ts
    - src/ui/status/statusMap.ts
    - src/features/you/components/youRowIcons.ts
requirements-completed: [DSG-08, ACC-08, ACC-09, ACC-06, ACC-07, ALR-01, ALR-05, DAT-01, DAT-03, DAT-04, DAT-06, SYN-05, IMP-06, ACC-11]
duration: long (machine busy, jest runs about 10 min)
completed: 2026-11-22
---

# Phase 10 Plan 04: System copy, status keys and You row icons Summary

All Phase 10 copy lives under `system.*` in the typed catalogue, with five new status badges and five new You row icons, so later UI plans only read keys.

## Commits
- 8f1028a2 feat(10-04): system copy namespace with exact-string and voice tests (task 1)
- Task 2: feat(10-04) status keys, You row icons, statusBadge test lists updated (see git log)

## Deviations from Plan
1. **Typographic apostrophes.** The catalogue guard forbids straight apostrophes in any leaf. The Wise EUR/GBP exact sentence has none in the template; the quotes are in the `names` param supplied at runtime, so the exact string is reproduced.
2. **Plural keys.** `queue.noteTitle`, `queue.fullBody`, `queue.saveDisabledA11y`, `security.signOutOthers*`, `appLock.wrongPin` and similar use i18next `_one/_other`, so 1 reads "1 change". At count 500 `fullBody` is the owner's exact sentence. `EXACT_SYSTEM_KEYS` lists both fullBody forms.
3. **Delete body trimmed.** `ownData.saveCopyBody` was 28 words in UI-SPEC; shortened to "Saves all your records as CSV files. You choose where to keep them. After deletion the app keeps no copy." to meet the 25-word rule. Flag for owner sign-off.
4. **Push namespace** is a separate file `push.ts` (plan listed seven files but the index and interfaces require `push`).
5. TDD: implementation and test were written in one pass, so there was no separate RED commit.

## Known Stubs
None. Copy keys exist but screens that use them are in later plans.

## Verification
- jest systemCopy, copyGuard, catalogue: 14896 passed
- npm run typecheck: no errors
- status + you jest: 109 tests pass after updating the three exhaustive lists in statusBadge.test.tsx; check:icons green

## Self-Check: PASSED (files created, commit 8f1028a2 present)
