---
phase: 05-decide-ui
plan: 130
subsystem: decide copy and guards
tags: [R18, retire, matrix, reading-order, D-100, D-101, D-102, D-103]
requires: [05-125, 05-126, 05-127, 05-128, 05-129, 05-131, 05-133, 05-134]
provides: [r18Retired guard, r18Fit helper, R18 matrix, R18 reading-order tests]
key-files:
  created:
    - src/i18n/__tests__/r18Retired.test.ts
    - src/features/decide/__tests__/helpers/r18Fit.ts
    - src/features/decide/__tests__/r18Matrix.test.tsx
    - src/features/decide/__tests__/r18MatrixPots.test.tsx
    - src/features/decide/__tests__/r18ReadingOrder.test.tsx
    - src/features/decide/ui/__tests__/FoldRow.test.tsx
  modified:
    - src/i18n/locales/en.ts
    - src/features/decide/ui/FoldRow.tsx
    - src/features/decide/home/homeProblems.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
    - src/i18n/__tests__/decideCopyFit.test.ts
    - src/features/decide/home/__tests__/homeProblems.test.ts
requirements: [DCU-35, DCU-36, DCU-37, DCU-38, DCU-09]
commits: [dac4da70, 47332aae, b9d24dce, 8709821a, 01020c9c, 6b9ceb7a]
completed: 2026-10-24
---

# Phase 5 Plan 130: R18 close-out Summary

The R18 replaced copy is deleted and guarded, and the R18 surfaces are fit-tested at 320 / 402 wide x 1.0x / 2.0x and order-tested. Four additions found during waves 31 to 36 are folded in, each as its own commit.

## What was built

Plan tasks:
- **Retired copy (dac4da70).** Grep first (src and app, outside en.ts and tests): the only remaining readers were test files. Deleted `decide.home.card.labelWorst / labelAverage / labelTightest / labelFigures / labelSwitched`, `card.a11yLeft / a11yShort`, `hero.sub`, `decide.month.in / out / left`, `rows.linesSet_one/_other` and `linesFold.preview_one/_other` (the of-5 text; `Step n of 5` in the check flow is a different string and stays). `infoTerms.test.ts` and `decideCopyFit.test.ts` now read the Nfcf, Six and subWorst twins. `r18Retired.test.ts` fails if any returns ("D-100 the retired card labels and month strip keys no longer exist", "D-103 no of-5 line text remains").
- **Matrix and order tests (6b9ceb7a).** `helpers/r18Fit.ts` reads the rendered tree for what Jest can see without a layout engine: no fixed height on text, no clamp except a shrinking figure or a tail-ellipsised user name, no negative margin around text, declared targets 44 or taller, whole labels (no dangling separator, no raw placeholder). `r18Matrix.test.tsx` covers the card eyebrow row and sub-line (worst, tightest, short), Month details with pots, verdict rows 4b/4c including the fee variant, the housing editor and loan switches (long loan name). `r18MatrixPots.test.tsx` covers the Pots screen (empty, populated with a long name, past-due, reached, Wait, done fold) and the PotSheet new and edit. `r18ReadingOrder.test.tsx` asserts the card order (header, notice row, summary group, ⓘ, Details, field, Check it, Full check or the result group, rows), the key-figures group order (figures, total cost, invested) with its ⓘ order, and the Pots per-state labels.

Additions to the plan (each its own commit):
1. **Unused pots keys (47332aae).** `decide.pots.caption` and `decide.pots.progressA11y` deleted after a grep showed no user; guarded in `r18Retired.test.ts`.
2. **FoldRow dangling separator (b9d24dce).** `FoldRow` speaks the title alone when the preview is empty (the general, smaller fix); the Pots "Done . n" fold now reads "Done . 1". New `FoldRow.test.tsx` covers the empty and non-empty cases.
3. **Needs a look duplicate (8709821a).** The lines missing-rate entry counts `rowCount - meta.unconvertedPots` (never below 0). When that leaves 0 the lines entry is not emitted at all, so a pot-only gap shows only the pots entry. Test added in `homeProblems.test.ts`.
4. **Undo wording (01020c9c).** `undo.refusal.record.savings_goals` reads "this pot"; asserted in `r18Retired.test.ts`. No existing test pinned the old text.

## Deviations from Plan
- **[Rule 3] Pots matrix split into its own file** (`r18MatrixPots.test.tsx`): the Pots screen needs a different set of module mocks (the pots queries, the swipeable and `Sheet` stubs) that conflict with the home and verdict suites in one file.
- **[Rule 3] `YourMonthCard.tsx` not touched.** Its retired-key reads named in the plan no longer exist (earlier R18 plans removed them); only `decide.month.*` keys it still uses remain.
- **[Rule 3] No `noRawColours.test.ts` or `decideCopy.test.ts` edit needed.** The DCU-09 scan already walks every `en.decide` leaf and `noRawColours` already walks the whole tree; both pass with the new files and strings.
- Test-infrastructure note: RNTL 14 has no `UNSAFE_*` queries, so `r18Fit.ts` walks `screen.container` (host elements only). Controls sized by their content declare no height, so the 44 floor is asserted on declared sizes plus explicit `expectTargets` calls for the controls R18 adds or changes. The basis marker (pre-R18, hit-slop only) is exempted by label with the reason in the test.

## Verification
- `npx jest src/i18n src/features/decide` green; the new suites pass: r18Retired 4, FoldRow 2, r18Matrix 5, r18MatrixPots 2, r18ReadingOrder 3, homeProblems +1.
- typecheck 0 errors; lint 0 errors (816 warnings, all pre-existing); depcruise no violations; `check:ignores` OK; `verify:gates` GATES OK. Full `npm run test:coverage -- --maxWorkers=4` result is in the hand-back report.
- INFO_KEYS stays 65 (infoTerms guard passes). The D-76 text-fit allowlists were not changed.
- Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-130. Requirements needing a device check are not ticked.

## Known Stubs
None.

## Decisions for the reviewer
- Pot-only rate gap: the lines entry is omitted when no non-pot rows are left (instead of a "0 lines" entry). Change if a different reading was intended.

## Self-Check: PASSED
