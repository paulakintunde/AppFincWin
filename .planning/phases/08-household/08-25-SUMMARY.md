---
phase: 08-household
plan: 25
subsystem: household-figures
tags: [household, countsForMe, home, decide, HH-09, ARC-17, ARC-18, ENG-25]
requires: [08-03, 08-04, 08-15, 08-30, 05.5]
provides:
  - myShareOfLine (src/engine/household/myShare.ts), the one my-share function
  - countsForMeInput (countsLineOf, mineAmountOf, householdAmountOf, asStored, storedShareInHome)
  - figureScope (src/data/queries/figureScope.ts): Mine / Household rows, Decide Mine source rows, Household snapshot source and small line
  - useSharedSplits (same cached read as the balances)
  - useFigureScope('home') and the Home Mine / Household switch
  - BO-07 point 6 contracts and the phase-8 visibility contract switched on in place
affects: [08-27, 08.1]
key-files:
  created:
    - src/engine/household/myShare.ts
    - src/engine/household/countsForMeInput.ts
    - src/engine/household/__tests__/myShare.test.ts
    - src/data/queries/figureScope.ts
    - src/data/queries/__tests__/figureScope.test.ts
    - src/features/home/useFigureScope.ts
    - src/features/home/__tests__/useFigureScope.test.tsx
  modified:
    - .planning/phases/08-household/08-PRECONDITIONS.md
    - src/engine/month/__tests__/bo07.point6.contract.test.ts
    - src/engine/month/__tests__/bo07.phase8.contract.test.ts
    - src/data/queries/decide.ts
    - src/data/queries/householdBalances.ts
    - src/features/home/HomeScreen.tsx
    - src/features/home/ThisMonthCard.tsx
    - src/features/home/useHomeViewModel.ts
    - src/features/home/__tests__/HomeScreen.test.tsx
    - src/features/home/__tests__/ThisMonthCard.test.tsx
    - src/features/home/__tests__/useHomeViewModel.test.tsx
    - src/i18n/locales/household/home.ts
    - src/ui/SegmentedToggle.tsx
decisions:
  - Gate (D-41) proceed, 2026-11-16. Owner decision 2026-11-17 ran 08-25 before 08-27; the depends_on 08-27 was ordering only. 08-27 has not run; nothing from Phase 8 is in production.
  - A stored share in another currency is turned into home money by scaling the line's own home figure (share / household amount), not by a second rate lookup, so a share never drifts from its line (the line itself was stamped at the nearest rate, owner answer 6).
  - A line with no creator counts as the reader's (pre-Household rows; 08-01 backfills creators and RLS hides any left null).
  - Rows the viewer owns outright come back as the same objects, and a list with nothing to change as the same array, so a household of one keeps every figure and every memo (homeDecideParity unchanged).
  - Household small line = 05.5's builder and month picture over a shared-lines-only source (shared rows at household amounts, joint accounts, no personal series, debts, goals, changes or money settings); no fallback was needed.
metrics:
  completed: 2026-11-16
  tasks: 3
---

# Phase 8 Plan 25: Household joins the 05.5 shared money model Summary

One "my share" function (stored split or a departure copy's copy_share, never recomputed), an adapter that turns every readable line into 05.5's `CountsLine` so `countsForMe` alone decides what counts, the BO-07 point 6 contracts on, and a Mine / Household switch on Home's This month card that moves both the big "left after everything" figure and the small "left after the month's plans" line.

## Run order

Owner decision 2026-11-17: 08-25 ran now, before 08-27. Its `depends_on: 08-27` was ordering only (so a gate stop could not block earlier waves); every other wave was done. 08-27 has not run, and nothing from Phase 8 is in production.

## Task 1: gate (D-41)

- `countsForMe` on origin/main: `src/engine/month/countsForMe.ts` (`countsForMe(line: CountsLine): MinorUnits`, `countsForMeTotal`). BO-07 contract files present (point6, phase8, manifest).
- origin/main (bb27d24b, 05.5 close docs, PR #144) merged into phase/08-household with no conflict (6 docs-only commits).
- Interfaces compared: (1) `CountsLine.amount` is per line and documented as "already the viewer's stored share" for a shared line: fits. (2) Point 6 todos and the visibility todo are in place with frozen titles: fits. (3) Home's big figure is `monthPositionOf(monthView rows)` and the small line `monthPicture(useDecideV3().prepared).leftAfterPlans`: fits. (4) `preparedV3` / `buildInputs` take any `SnapshotSource`, and the builder already skips settlements, so a shared-lines-only source runs through the same builder and picture: fits, no second rule.
- **Decision: proceed** (owner pre-authorised on all four fitting). Gate lines appended to 08-PRECONDITIONS.md (`05_5_GATE_2026-11-16: landed`).

## Commits

| Step | Commit | What |
|------|--------|------|
| merge | 6260bfbc | origin/main into phase/08-household (05.5 close docs) |
| gate | a6883bd5 | 08-PRECONDITIONS gate lines, decision proceed |
| Task 2 | 9cbfc1fd | myShareOfLine, countsForMe input adapter, point 6 + visibility contracts on |
| Task 3 | 7968239d | figureScope, Decide Mine source, Home switch |

## What was built

- **Engine** (`src/engine/household`): `myShareOfLine(line, splits, viewerKey)` returns the amount and where it came from (`line` or `stored`): settlement 0 (isSettlement); shared line = the viewer's stored split (0 when not on it); own personal line = its amount, or `copy_share` for a departure copy; a partner's personal line 0. `countsLineOf` builds the `CountsLine` (drops a partner's personal line, T-08-90; `partnerOptIn` left absent for 08.1); `mineAmountOf` = `countsForMe(countsLineOf(...))`; `householdAmountOf` = shared lines at their household amount; `asStored` marks the rows that need no change. 100% statements, branches, functions and lines on both files. No `allocate(` or `memberParts(` in either.
- **Contracts**: the four point-6 titles and 'database rules gate reading; countsForMe gates counting; no screen adds its own filter' switched on in place, exact titles, headers updated. The visibility test also reads every source file in `src/features/home` and fails on `is_shared`, `created_by`, `isShared` or `createdBy`. Only the 08.1 income-profile todo remains.
- **Data** (`src/data/queries/figureScope.ts`): Mine and Household rows for the Activity month rows (Home's big figure), Mine rows for Decide's source (a changed row carries the viewer's figure as its home stamp; a shared line no rate converts is left out so its full amount never stands in for a share), and `householdSnapshotSource` / `householdLeftAfterPlans` for the Household small line. `useSharedSplits` selects splits by line from the balances read (one fetch, one key).
- **Decide** (`decide.ts`): the source rows go through the Mine scope, then 08-30's settlement flag. The splits read is required only when a row needs it; it joins `missing` / `failed` / `missingReads` ('sharedSplits'), the retry list and the shared-snapshot deps, and the source key now includes the viewer. Decide always reads Mine, so its lead stays equal to Home's small line in Mine.
- **Home**: `useFigureScope('home')` (default Mine, kept in `fincwin:figureScope.home`). The switch shows only for 2+ people; hidden means Mine. Mine: the month rows go through the adapter, totals recomputed only when something changed. Household: shared rows at household amounts, no projections, the card formatted in the household currency, and the small line from the shared-lines-only build. The `SegmentedToggle` sits at the top of the card inside the existing FadeIn, with no haptic; the 08-12 copy ("Your records plus your share of shared lines" / "Shared lines only, in {{currency}}") shows under the figure.

## Verification

- `npx tsc --noEmit`: clean
- eslint on every touched file: 0 errors (warnings only: the repo-wide fast-check `fc` import style and existing test lines)
- `npm run -s depcruise`: no dependency violations (1193 modules)
- jest (app config) src/features/home, src/test/contracts, src/features/decide/snapshot, src/data/queries, src/ui/__tests__, src/i18n: 135 suites passed, 2 skipped; 21117 tests passed
- jest (engine config) src/engine/household and src/engine/month bo07 contracts: 14 suites, 88 passed, 3 todo; household coverage 100%
- `npm run test:engine -- --coverage` (coverage gate): exit 0; 277 suites passed, 1 skipped; 5242 tests passed, 10 todo, 2 skipped
- `npm run check:cache-version`: shapes unchanged (version 14); no bump needed (no new persisted shape; splits are a `select` over the existing balances read)
- No database, no package changes, no pushes.

## Deviations from Plan

1. **[Rule 3] Split read reused, not added.** Mine needs each shared line's stored splits; `useSharedSplits` selects them from the 08-15 balances read (same key), so no new query key and no cache bump.
2. **[Rule 2] `SegmentedToggle` gained `haptic?: boolean` (default true).** UI-SPEC Screen 9 says no haptic on a scope switch; the shared toggle always ticked. Other callers are unchanged. The toggle keeps the kit's radiogroup / radio roles rather than the plan's tablist / tab (one switch component for the app).
3. **[Rule 2] Storage key `fincwin:figureScope.home`** instead of `fincwin.figureScope.home`, so `wipeDeviceData()` clears it on sign-out and account deletion.
4. **Copy reused.** 08-12 had already added `household.home.scope.*` (mine, household, mineLabel, householdLabel); only `a11y` ("Whose figures to show") was added.
5. **Extra files** beyond `files_modified`: `src/data/queries/figureScope.ts` (+ test) and `src/data/queries/householdBalances.ts` (the adapter has to sit where rows enter both figures, outside `src/features/home`, so the screen adds no filter).
6. **TDD:** the engine files and their tests were committed together (no separate RED commit), as in 08-03 and 08-04.
7. **Decide snapshot key** now includes the viewer id (Mine rows depend on who is looking).

## Known limits (for the owner and 08.1)

- **Activity's own month figure is unchanged** (full amounts of every readable line). Home's Mine figure now counts only your share, so on a 2+ household the two can differ. 03.1 D-47 kept them equal; whether Activity should switch too is an owner question.
- **Household small line has no income** unless an income line is itself shared, and uses only joint accounts' balances, so it will usually read as a shortfall equal to the shared plans. It is what "shared lines only" means, built by the same builder.
- **Household scope shows no recurring projections** (series are personal), and a shared line whose household rate is still pending is left out of the Household figures until stamped.
- **A departure copy's copy_share** is read in the viewer's home currency (the copy's new household is a household of one in their home currency); a leaver whose old household used another currency would see that share unconverted.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or table; the adapter only narrows what RLS already lets the viewer read (T-08-90 mitigated by the drop rule and the contract; T-08-91 by the grep acceptance).

## Self-Check: PASSED

Files exist (myShare.ts, countsForMeInput.ts, figureScope.ts, useFigureScope.ts and tests); commits 6260bfbc, a6883bd5, 9cbfc1fd, 7968239d are in `git log`.

## Owner answers (2026-11-17)

1. Activity's month total keeps adding every listed line at full amount. "Your share" lives on Home.
2. The small "left after the month's plans" line is hidden in Household scope, so Household shows the big figure only. `householdLeftAfterPlans` stays in figureScope.ts with its test and nothing on screen uses it. Changed in useHomeViewModel.ts and its test.
3. Accepted for now: a leaver's copy in a different currency shows unconverted. Noted for later.
4. Accepted for now: a shared line waiting for an exchange rate is left out of the figures until the rate arrives.
