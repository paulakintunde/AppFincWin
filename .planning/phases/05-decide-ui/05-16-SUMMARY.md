---
phase: 05-decide-ui
plan: 16
subsystem: decide-check-step3
tags: [decide, ui, check-flow, step3, setbacks, options, household, tdd]
requires: [05-07, 05-08, 05-09, 05-10, 05-14, 05-28]
provides:
  - SetbacksSection (switchable setbacks, runway, combined outcome tile)
  - OptionsSection (noun-phrase options with rescoring action pills)
  - ScopeToggle, SplitOverrideSheet, WhoPaysSection (built, hidden until Phase 8)
affects: [05-30, 05-41]
key-files:
  created:
    - src/features/decide/check/sections/SetbacksSection.tsx
    - src/features/decide/check/sections/OptionsSection.tsx
    - src/features/decide/check/sections/WhoPaysSection.tsx
    - src/features/decide/check/ScopeToggle.tsx
    - src/features/decide/check/SplitOverrideSheet.tsx
    - src/features/decide/check/sections/__tests__/setbacksOptions.test.tsx
    - src/features/decide/check/__tests__/householdScope.test.tsx
  modified:
    - src/i18n/locales/en.ts
decisions:
  - Options card owns its ink background; the section is wrapped in an ink View with the dark CollapsibleSection
  - Set-back rows are local (checkbox, CloseGlyph remove) rather than CheckRow, which draws a bar not the shared close mark
metrics:
  tasks: 2
  files: 8
  completed: 2026-10-16
---

# Phase 5 Plan 16: Setbacks, options and household scope Summary

Step 3's "If something goes wrong" and "What would make it work" sections, plus the household scope toggle, split override sheet and Who pays what section, the last three rendering nothing until a household has more than one member.

## Commits
- c63b8b7: SetbacksSection and OptionsSection (Task 1)
- 31289a4: ScopeToggle, SplitOverrideSheet, WhoPaysSection (Task 2)

## What was built
- **SetbacksSection**: runway summary ("Runway {n} months" / "Runway not limited"), one checkbox row per `inputs.setbacks` with name, description, hit and cash after (or "wiped out"), `CloseGlyph` remove with a local undo toast, "+ Add a setback to test" opening `LineEditorSheet` (context setback; 12 max), and the combined outcome tile from `CASH_OUTCOME[stressedOutcome]` when any is on. Gated by `canUse('setbacks')`, no lock chrome.
- **OptionsSection**: omitted on fits or missing; ink card, lead line (`optionsLeadCloses` when the month closes), one row per option from `optionCopy`. Pills: Use this price (`repriceInputs`, hidden when it returns null), Use this term (`loan.termMonths`), Open in Activity, Switch to wait; hidden on a read-only check.
- **ScopeToggle / SplitOverrideSheet / WhoPaysSection**: `memberCount <= 1` renders nothing in all three; Who pays is also omitted in personal scope. Split sheet offers Even / By weight / Set amounts / All mine with `MoneyInput` per member and the shared dirty rule; parts come from `memberParts`.

## Verification
- `npx jest src/features/decide/check src/theme/__tests__/noRawColours.test.ts src/i18n`: 20 suites, 8593 tests passed (named test `use this price on an instalment plan rescales the instalments` present; the rescored verdict is not missing and the stored instalment equals the engine's `withPrice` scaling).
- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean.

## Deviations from Plan
**1. [Rule 1 - Bug] `optEarnDesc` copy lacked its percent sign** ("That is 16.75 more than ...") in `src/i18n/locales/en.ts`; now "{{pct}}% more". Rendered by OptionsSection; asserted in the test.
**2. [Rule 3 - Blocking] Extra props.** ScopeToggle also takes `currency`, `memberNames` (and optional `readOnly`) because the split sheet needs them; WhoPaysSection takes `share`, `memberNames`, `dayOneTotal`, `monthlyTotal` because SectionProps carries none of them. 05-30 supplies these.
**3. [Note]** Plan tests for the imperative-name check exempt the action pills (their text is "Use this ..."); only option names are asserted.
No engine edits. No migrations.

## Known Stubs
None. Household pieces are intentionally invisible until Phase 8 adds members.

## Human / device verification
- Contrast and feel of the 12% surface pills on the ink card (iPhone XR, Pixel).
- TalkBack/VoiceOver reading of setback checkbox rows (name, description, hit, cash after in one label).
- Household UI cannot be seen on any Phase 5 household; visual check is deferred to Phase 8.

## Self-Check: PASSED
