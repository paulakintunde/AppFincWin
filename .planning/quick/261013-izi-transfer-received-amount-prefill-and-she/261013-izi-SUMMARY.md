---
phase: quick-261013-izi
plan: 01
status: complete
completed: 2026-10-13
---

# Quick 261013-izi: Transfer received-amount prefill and sheet scrim

Cross-currency transfers prefill "Amount received" from the latest stored rate until the user keys into it, and every Sheet now has a fixed dim scrim behind it.

## Changes
- `src/features/record/entry/receivedPrefill.ts`: pure `prefillAmountInText` (convertMinor, half-up, `''` on any failure or missing rate).
- `TransactionSheet.tsx`: `amountInManual` flag (seeded true for saved/restored values, reset on list add); effect recomputes while untouched.
- Amendment 1: while prefilled, the keypad gets an empty value, so the first digit or decimal replaces the figure; backspace/clear empties it. Both set the manual flag. `Keypad` gained an optional `onKeyPress` prop to support this.
- `colors.scrim = rgba(0,0,0,.4)`; `Sheet` backdrop uses it.
- Amendment 2: Modal `animationType` changed from slide to none; the backdrop stays fixed and only the sheet container slides in via RN `Animated` (no new library). GestureHandlerRootView and tap-to-dismiss kept.

## Deviations
- Modal slide-out is gone: dismissal unmounts instantly (sheet slide-in only), a consequence of keeping the scrim fixed.
- Touched `src/ui/Keypad.tsx` (not in plan frontmatter) for `onKeyPress`.
- One scoped eslint-disable for `react-hooks/set-state-in-effect` on the prefill effect.

## Verification
`npm run typecheck` clean, `npm run lint` 0 errors, `npx jest src/ui src/theme src/features/record` 89 suites / 1154 tests pass.

## Commits
See `git log` on fix/02.3-walkthrough: prefill feat, lint fix, scrim feat.
