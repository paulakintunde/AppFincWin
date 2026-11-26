---
phase: 10-system
plan: 03
subsystem: data-layer
tags: [alerts, archived-months, devices, write-queue, cache-version, export-manifest]
requires: [10-02 DDL contract (names only)]
provides: [src/db/alerts, src/db/archivedMonths, src/db/devices, queued alert/archive mutations, cache version 17]
affects: [10-12, 10-15 and every later plan using these hooks]
key-files:
  created:
    - src/db/alerts.ts
    - src/db/archivedMonths.ts
    - src/db/devices.ts
    - src/db/__tests__/systemTables.test.ts
    - src/data/queries/alerts.ts
    - src/data/queries/archivedMonths.ts
    - src/data/mutations/alertSettings.ts
    - src/data/mutations/archivedMonths.ts
    - src/data/mutations/__tests__/systemMutations.test.tsx
  modified:
    - src/data/keys.ts
    - src/data/mutations/index.ts
    - src/data/cache/persister.ts
    - scripts/cache-shape.lock.json
    - src/data/exportManifest.ts
    - src/data/__tests__/persister.test.ts
    - supabase/tests/database/101_household_privacy_two_user.test.sql
metrics:
  completed: 2026-11-22
---

# Phase 10 Plan 03: Client data layer for System tables Summary

Typed db access, queued optimistic mutations, one cache bump (16 to 17) and export manifest entries for the Phase 10 alert, archive and device tables.

## Commits
- cde0a158 feat(10-03): db modules for alerts, archived months and devices
- feat(10-03): keys, query hooks and queued mutations (task 2)
- feat(10-03): cache version 17, never persist devices, export manifest entries (task 3)

## Tests run
- `npx jest src/db/__tests__/systemTables.test.ts`: 8 passed
- `npx jest src/data/mutations/__tests__/systemMutations.test.tsx src/data/__tests__/offlineWrite.test.tsx`: 18 passed
- `npx jest src/data/__tests__/exportManifest.test.ts src/data/__tests__/persister.test.ts`: 24 passed
- `npm run check:cache-version`: passes (version 17); `npx tsc --noEmit -p .`: clean; eslint on new files: clean

## Deviations from Plan
1. [Rule 3] The mutations test is `systemMutations.test.tsx`, not `.ts`, because it renders hooks (JSX wrapper).
2. [Rule 3] `src/data/__tests__/persister.test.ts` hard-coded version 16; updated to 17 (collateral of the planned bump).
3. [Rule 3] The export manifest guard test requires every manifest table to be named in the `-- export-tables:` marker of `supabase/tests/database/101_household_privacy_two_user.test.sql`; added four comment lines (`archived_months`, `alert_settings`, `alert_prefs`, `alert_log`, tagged 120). Comments only, pgTAP plan count unchanged. Plan 10-02's pgTAP 120 should cover those tables' two-user privacy (it does per its behaviours).
4. alert_prefs version and merge: the prefs mutation merges its patch over the cached prefs at send time so a queued patch cannot drop a newer field.

## Notes for the orchestrator
- pgTAP not run (10-03 has no SQL beyond comment lines).
- No packages installed.

## Known Stubs
None.

## Self-Check: PASSED
