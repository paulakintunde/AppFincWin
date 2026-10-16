---
phase: 05-decide-ui
plan: 19
subsystem: decide-mutations
tags: [decide, mutations, write-queue, undo, offline]
requires: [05-02, 05-05, 05-12, 05-38, 05-39]
provides: [registerDecideCheckMutations, useCreateCheck, useSaveCheckDraft, useAbandonCheck, useMarkCheckSeen, useRemoveDecision, useReopenCheck, registerDecideSettingsMutations, useUpdateDecideSettings, registerDecideLinkMutations, useAttachLine, useUnlinkLine, useSaveCardRate, useSaveCardTerms, useRecordStatementPeriod]
affects: [05-20, 05-21, 05-22]
key-files:
  created:
    - src/data/mutations/decideChecks.ts
    - src/data/mutations/decideSettings.ts
    - src/data/mutations/decideLinks.ts
    - src/data/mutations/__tests__/decideChecks.test.tsx
    - src/data/mutations/__tests__/decideSettings.test.tsx
    - src/data/mutations/__tests__/decideLinks.test.tsx
  modified:
    - src/data/mutations/index.ts
    - src/data/mutations/sampleData.ts
    - src/features/record/import/useStatementImport.ts
    - src/db/errors.ts
requirements-completed: []
---

# Phase 5 Plan 19: Decide mutations Summary

Queued, undo-aware writes for Decide checks, settings, links, card rates and terms, and statement periods, all registered with `setMutationDefaults` so paused mutations replay after a restart.

## What was built
- **Checks** (`decideChecks.ts`): create (client id, duplicate id is success), autosave (last write wins, no undo step, a decided or deleted check is parked as not-found), abandon (`checkAbandoned` step, returns the step id), mark seen (version-conditional, only when state/basis differ, no undo), remove decision (`decisionRemoved`; part 2 also soft-deletes the check's live goal in the same step and the inverse ops restore both), reopen (new open check, `reopened_from`, outcome and wait amount reset). No verdict is ever written.
- **Settings** (`decideSettings.ts`): unconditional per-user upsert with optimistic merge over `EMPTY_DECIDE_SETTINGS` and rollback; null saves null.
- **Links** (`decideLinks.ts`): attach (role by date via `attachRoleFor`), unlink (`lineUnlinked` step, drops the link from cached lists at once), card rate and D-40 card terms (both on the card's own debt record, one shared write path registered under `saveCardRate` and `saveCardTerms`), statement periods (duplicate id is success).
- **Wiring**: `index.ts` registers all three; `sampleData.ts` refresh also invalidates checks, debts and links; `useStatementImport.ts` records a stated period right after a successful commit.
- Failed-write records carry ids, kinds, field names and counts only.

## Verification
- `npx jest src/data/mutations src/features/record/import --silent --forceExit`: 46 suites, 740 tests pass (new: 12 + 3 + 12).
- `npm run typecheck` clean; `npm run lint` 0 errors (684 pre-existing warnings); `npm run depcruise` clean.
- Local pgTAP/DB tests skipped (Docker down); no migrations created.

## Deviations from Plan
- **[Rule 3 - Blocking]** `WriteEntity` in `src/db/errors.ts` gained `'decide_settings'` and `'statement_periods'` so failed-write records are typed correctly (no other entity fit). Type-only change.
- Hooks take the identifiers their cache keys need that the plan signatures omitted: `useCreateCheck().create` takes `userId`; other check hooks use `row.created_by`/`row.household_id`; `useAttachLine().attach` takes `userId`; card hooks take `userId`. `useReopenCheck().reopen(row, _today)` keeps `today` in the signature but does not use it; inputs are reset on the raw JSON (no engine or features import, per "mutations carry JSON only").
- Card writes reuse an already queued card debt from the cache instead of inserting a second record for the same card (a second offline save would otherwise duplicate it).
- `useRecordStatementPeriod().record` returns `false` and queues nothing for a period that ends before it starts, so a bad import period cannot disturb the import.
- Mutation modules import `attachRoleFor` from `features/decide/journal/pastDecisions` (the only place it exists); depcruise reports no cycle.
- No engine edits.

## Human/device items
None.

## Known Stubs
None.

## Self-Check: PASSED
