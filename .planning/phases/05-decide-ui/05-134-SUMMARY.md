---
phase: 05-decide-ui
plan: 134
requirements: [DCU-36]
commits: [f010b2b5]
---
# Phase 5 Plan 134: Pots entry points Summary

You > Money lists Pots after History, and Needs a look reports past-due pots and pots left out for a missing rate.

## Built
- `YouScreen.tsx`: `you.record.pots` row appended to MONEY_ROWS (href `POTS_HREF`). Not an Add action; FAB order and Add group unchanged (asserted).
- `homeProblems.ts`: entry 8 `pot_past_due` (counted, action `{kind:'pots'}`) from `source.pots` through `potSetAside(pot, today).state === 'past_due'` (imported from the `@/engine/decide` barrel, as depcruise requires). Rate entry gains variant `pots` (`potCount` from `meta.unconvertedPots`, `currency` = `source.unconverted.currencies` joined).
- `HomeProblemsSheet.tsx`: copy from 05-131 keys (no new keys); `pots` action closes the sheet and `pushOnce(POTS_HREF)`.

## Deviations / decisions
- Pots live at `source.pots` (top level), not `source.base.pots` as the plan text said. The pot rate source field is `source.meta.unconvertedPots` (with `source.unconverted.currencies`).
- The pot rate variant is `counted: false`, like the `lines` variant: the dark card already shows an unavailable state for it (R18.1/M4). Entry 8 is counted. Spec is ambiguous; flag if the pot rate variant should count.
- The existing `lines` entry's row count still includes the unconverted pots (they are in `unconvertedRows`), so one missing-rate currency can show both the lines and pots entries.
- Entry 8 is ordered just before the sync entry (sync stays last).

## Verify
- Jest `src/features/you src/features/decide/home`: 239/240 pass; the one failure (HomeCurrencyChangeSheet) was a 5 s timeout under load and passes alone (8/8). Named D-101 tests pass.
- typecheck clean; eslint 0 errors; depcruise clean.
- Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-134. Not ticked.

## Self-Check: PASSED
