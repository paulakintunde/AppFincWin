---
phase: 05-decide-ui
plan: 79
subsystem: testing
tags: [decide, text-fit, D-76, rule-T, rule-F, rule-N, rule-O, jest, gate]
requires: [05-77, 05-78]
provides:
  - decideTextFit.test.ts (static rules T, F, N, O over src/features/decide/**/*.tsx)
  - decideStackedRender.test.tsx (stacked forms at fontScale 2 and 320 wide)
  - jest environment that exits on its own (TanStack gc timers unref'd)
  - deterministic cover for the transfer-matching deltaDays tie-break
affects: [05-26]
key-files:
  created:
    - src/features/decide/__tests__/decideTextFit.test.ts
    - src/features/decide/__tests__/decideStackedRender.test.tsx
  modified:
    - src/features/decide/check/BasisDetailRow.tsx
    - src/features/decide/ui/CombineToggle.tsx
    - src/features/decide/quick/QuickCheckForm.tsx
    - src/features/decide/check/__tests__/verdictDepth.test.tsx
    - src/i18n/locales/en.ts
    - src/i18n/__tests__/decideCopyFit.test.ts
    - jest.setup.ts
    - src/engine/transfer/__tests__/match.test.ts
decisions:
  - "decide.alt.spendTitle is 'Cheaper, and what it leaves' (27 chars); rule E's 32-character cap has no exception (user decision 2026-10-23)"
  - "The open handle was TanStack gc timers in tests, not the persister; fixed once in jest.setup.ts, app code untouched"
requirements: [DCU-27, DCU-11]
metrics:
  tasks: 2
  followups: 4
  completed: 2026-10-23
---

# Phase 5 Plan 79: Text-fit guards Summary

Static and render guards for UI-SPEC R6 now fail CI on any new clamp, fixed height, absolute text or negative margin in Decide, and on a stacked form that stops stacking; plus four follow-ups.

## Commits

| Item | Commit |
|------|--------|
| Task 1: decideTextFit.test.ts + residual fixes | d5c00022 |
| Task 2: decideStackedRender.test.tsx | 7e76b5a4 |
| Follow-up 1: eyebrow | 968dd10e |
| Follow-up 2: jest open handle | fef116f5 |
| Follow-up 3: transfer coverage | 17e25323 |
| Follow-up 4 and this summary | docs(05-79) commit |

## Task 1: decideTextFit.test.ts

Named tests: rule T, rule N, rule F, rule O (exact titles from the plan). Comments are stripped; counts are exact per file, stale entries fail, and violations report file and line. A numberOfLines occurrence is classed by its JSX tag window: `adjustsFontSizeToFit` = figure (must also set `minimumFontScale`), `ellipsizeMode` = user-name, otherwise input or forwarded prop.

Fixed in place (not allowlisted):
- `check/BasisDetailRow.tsx`: `numberOfLines={1}` removed; the basis line wraps (its test in `verdictDepth.test.tsx` now asserts no clamp).
- `ui/CombineToggle.tsx`: pill `height: VISUAL` became `minHeight` plus 2 vertical padding (it holds the label).
- `quick/QuickCheckForm.tsx`: the amount pill (holds the amount input) `height` became `minHeight`; found by the scan, not named in the plan.

Allowlist, numberOfLines (all reasons recorded in the test):
- user-name: ChangesCard 1, OpenChecksCard 1, PastDecisionsScreen 1, DecisionDetailSheet 1, QuickResult 1, LabelValueRow 1 (valueLines only for user text).
- forwarded: Step1Item 1 (Chip prop for the custom type name; Chip applies the tail ellipsis).
- input: stepUi 1 (TextInput).
- figure (rule N): LedgersSection 1, Step2PriceAndPay 2, QuickResult 1, FigureStrip 1.

Allowlist, height (drawing geometry or no text): CashPathChart 2, NetWorthChart 2, sectionUi 1 (dot), SetbacksSection 2 (checkbox, remove target), SplitOverrideSheet 1 (radio dot), CardMinimumSheet 1 (chevron), MethodPanels 1 (stepper target), AddChangeRow 2 (plus bars), QuickCheckForm 3 (loading skeletons), CheckRow 4 (box, remove glyph), CollapsibleSection 1, CombineToggle 1 (dot), FoldHint 1 (chevrons), GoalProgress 2 (progress bar), InfoButton 1, StepBar 1 (segments), StepSlider 4 (track and thumb).

Allowlist, position absolute (rule O): CashPathChart 1, NetWorthChart 1 (axis labels), AddChangeRow 2 (plus glyph bars, no text), StepSlider 1 (thumb). No negative margins exist. `StyleSheet.absoluteFill` tint layers are not literal `position: 'absolute'`, so they need no entry.

## Task 2: decideStackedRender.test.tsx

Three named tests (fontScale 2, 320 wide, 402 at 1.0x) over LedgersBody (Now/After container), FigureStrip (key figures) and SegmentedToggle (radio list vs equal segments).

## Follow-ups

1. **Eyebrow.** `decide.alt.spendTitle` is now "Cheaper, and what it leaves". The exception map and its "only exception" test were removed from `decideCopyFit.test.ts`, so rule E's 32-character cap holds everywhere. UI-SPEC copy entries (card heading and rewrite table) updated. No other test asserted the old string.
2. **Jest open handle.** Cause: not the persister or AppState. `--detectOpenHandles` reported nothing (it forces in-band and exits); `process.getActiveResourcesInfo()` showed five Timeouts, all 300000 ms TanStack `scheduleGc` timers from the tests' own QueryClients (mutation gcTime). This predates 05-57 (02.2-26 already noted jest not exiting) and was masked by multi-worker runs. Fix: `jest.setup.ts` installs a `timeoutManager` provider whose timers are `unref`'d (reading global setTimeout at call time, so fake timers still work). App code unchanged; no module-scope change in QueryProvider. Verified without `--forceExit`: markMonthly alone exits (6.5 s, was a hang), persister.test and useCheckDraft.test exit alone, and the full `test:coverage` runs without `--forceExit`.
3. **Flaky transfer coverage.** Without the two fast-check properties, `match.ts` sits at 99.07% branches: the `deltaDays` tie-break in `compareCandidates` (line 203) needs two candidates with equal score a day apart (2 and 3 days away both score 1). The properties hit it only when a generated case did. Added the deterministic example "between equally scored candidates ... the nearer date wins before id order"; coverage is now 100% with the properties excluded. Six default runs earlier all read 100%, so the CI 99.28% was the chance case.
4. **Bookkeeping.** 05-EXECUTION-NOTES entries 05-63, 65, 71, 73, 74, 84 and 85 now carry the device items from their SUMMARYs (the entries existed but were shorter). ROADMAP ticks for 05-54..05-87 done by hand (33 flipped; 05-81 was already ticked; only 05-26 stays open). STATE.md shows all refresh plans built with 05-26 next.

## Deviations from Plan

**1. [Rule 1] QuickCheckForm amount pill had a fixed height on a text input** - changed to minHeight (d5c00022).
**2. [Rule 3] `verdictDepth.test.tsx` asserted the BasisDetailRow clamp** - updated to assert it wraps (d5c00022).
**3. Gate hygiene.** A `verify:gates` run killed by my own timeout left `src/engine/__gate_probe__` behind (ignored by git) and made lint show 3 errors; removed the directory and reran both green. A first coverage run also failed one test (recordPrefs, 5 s timeout) because verify:gates ran at the same time; it passes alone and in the clean rerun.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-79 (already present): whole Decide pass at the text-fit matrix. Add: the 27-character "Cheaper, and what it leaves" eyebrow wraps cleanly in step 4 at 320 and 2.0x.

## Known Stubs

None.

## Self-Check: PASSED
