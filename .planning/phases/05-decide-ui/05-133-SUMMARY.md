---
phase: 05-decide-ui
plan: 133
subsystem: decide-ui
tags: [decide_settings, housing_line, LimitKey]
requires: [05-119, 05-131]
provides: [housing_line settings plumbing, LimitKey 'housing' records]
key-files:
  modified:
    - src/db/decideSettings.ts
    - src/features/decide/home/LimitEditorSheet.tsx
    - src/features/decide/home/LinesCard.tsx
    - src/features/decide/home/settingsPatch.ts
requirements-completed: [DCU-38]
completed: 2026-10-24
---

# Phase 5 Plan 133: housing_line plumbing and LimitKey records Summary

housing_line now flows through the settings row, column list, patch keys and empty row like dsr_line, and LimitKey carries 'housing' in the editor and LinesCard records; the sixth row and count stay with 05-126.

## Commits
- 2fccdca2 feat(05-133): row, patch keys, db and mutation tests
- c2f221e3 feat(05-133): LimitKey housing in the editor and Lines records, UI tests, fixtures

## What was built
- `DecideSettingsRow`, `DECIDE_SETTINGS_COLUMNS`, `DECIDE_SETTINGS_PATCH_KEYS`, `EMPTY_DECIDE_SETTINGS` gain `housing_line` (string | null). The mutation file needed no change: it spreads the patch and uses the shared key list.
- `LimitEditorSheet`: `'housing'` in LimitKey, `LIMIT_INFO_KEY.housing = 'housingLine'`, column `housing_line`, start text, `isHousingLine` pre-flight (dsr grammar, <= 100, mirrors the 05-119 column check), generic save writes `{ housing_line: text }`, Use the default writes null. Uses the RateInput like dsr.
- `LinesCard`: `stored` and `fallback` switches handle `housing` (stored reads `housing_line`; fallback returns null, so no dependency on 05-121's limits). KEYS unchanged (five rows), `linesSetCount` untouched.
- `settingsPatch.ts`: no logic change. housing_line is a percentage, not a money column, so it never stamps currency; a comment records this.

## Verification
- Named tests pass: D-103 round trip and null clear (db and mutation), D-103 housing limit validates 0 to 100 and writes housing_line, D-103 Use the default clears, D-103 Lines card still renders five rows.
- `npx jest src/db src/data/mutations/__tests__/decideSettings.test.tsx src/features/decide/home`: 538 tests, 2 failures, both in `src/db/__tests__/savingsGoals.test.ts` (05-122's uncommitted pots work), not this plan.
- eslint: 0 errors. depcruise: no violations.
- typecheck: errors only in `src/db/savingsGoals.ts`, `src/db/__tests__/savingsGoals.test.ts` and `pastFixtures.ts` (05-122's in-flight `kind`/NewPot types). None in this plan's files.

## Deviations
- [Rule 3] Added `housing_line: null` to the settings fixtures in `homeCardModel.test.ts` and `homeDepth.test.tsx` (not in files_modified); they failed typecheck once the row type grew.
- The mutation source and its file list entry needed no edit.

## Device item
05-EXECUTION-NOTES, "05-26 device checklist additions (Money concepts R18)", entry 05-133: nothing to see on device yet; the housing editor has no entry point until 05-126.

## Self-Check: PASSED
