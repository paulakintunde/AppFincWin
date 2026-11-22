---
phase: 09-tiers-onboarding
plan: 12
subsystem: i18n, analytics, status
tags: [copy, i18n, analytics, status-badges]
requires: [09-01]
provides: [plans.* / onboarding.* / features.* / lock.* copy, eight plan status words, typed Phase 9 analytics events]
affects: [every Phase 9 UI plan that reads copy keys]
key-files:
  created:
    - src/i18n/locales/plans/index.ts
    - src/i18n/locales/plans/paywall.ts
    - src/i18n/locales/plans/subscription.ts
    - src/i18n/locales/plans/notices.ts
    - src/i18n/locales/plans/household.ts
    - src/i18n/locales/onboarding/index.ts
    - src/i18n/locales/features/index.ts
    - src/i18n/locales/lock/index.ts
    - src/i18n/__tests__/plansCopy.test.ts
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/locales/appLife/status.ts
    - src/i18n/__tests__/appLifeCopy.test.ts
    - src/ui/status/statusMap.ts
    - src/services/analytics/catalogue.ts
    - src/services/analytics/__tests__/catalogue.typecheck.ts
decisions:
  - Apostrophes in app text are typographic; the copy test compares after normalising to the signed straight form
  - Level in analytics events is the string '1' to '4' (the finite-literal guard rejects numbers)
duration: n/a
completed: 2026-11-19
---

# Phase 9 Plan 12: Signed copy, status words and analytics events

All 423 rows of 09-WORDING.md (including every plans.doubleCover.* row, with the "needs owner review" note kept in a comment) are in typed namespaces, with a guard test tying each key to the signed file. Eight plan status words and the Phase 9 analytics events are typed.

## Commits
- 6a199b75: signed copy, namespaces, en.ts wiring, plansCopy test
- 9a89694d: status keys, analytics events, typecheck fixtures, statusBadge test updated for the eight new keys

## Deviations from Plan

1. [Rule 3] Analytics level fields are `'1'|'2'|'3'|'4'` strings, not numbers, because the ANL-03 finite-literal guard rejects numeric types.
2. [Rule 3] The existing catalogue test forbids straight apostrophes, so app text uses the typographic one. plansCopy.test.ts normalises it back and compares to the signed text.
3. [Rule 3] appLifeCopy.test.ts bans the word "free"; the signed badge words "Free trial" and "Free access" are exempted by exact key.
4. features.items.<id> entries come from 09-LEVEL-MAP.md (not in the wording file). Ids containing a dot nest (features.items.hh.weightSplit.label). Feature ids are copied into a literal union in catalogue.ts because 09-11's registry is not in this branch.
5. contrast.test.ts unchanged: inkMuted on fill1 is already tested.
6. The 25-word cap in plansCopy.test.ts has a seven-key allowlist: the rows over 25 words in the signed file (startLine, pledge, doubleCover.body, doubleCover.defaultLine, leave.member, onboarding.q.goal.why, onboarding.q.share.why).

## Known Stubs
None.

## Self-Check: PASSED
