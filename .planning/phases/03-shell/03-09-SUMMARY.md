---
phase: 03-shell
plan: 09
subsystem: ui
tags: [sheet, gesture-handler, reanimated, a11y, backdrop]
requires: [03-01, 03-04, 03-05, 03-06]
provides:
  - "Own Sheet with drag-to-dismiss, ink-at-38% backdrop, stack registration, dismissible prop, screen-reader escape"
  - "src/ui/sheetDrag.ts pure decision module"
  - "Dropdown ink backdrop (D-37)"
affects: [every Sheet call site, 03-16 dirty-check hook (onBlockedDismiss), 03-19 toasts in sheets]
tech-stack:
  patterns: [RNGH 2.x builder Pan + Native composition, scheduleOnRN, Reanimated shared values]
key-files:
  created:
    - src/ui/sheetDrag.ts
    - src/ui/__tests__/sheetDrag.test.ts
    - src/ui/__tests__/Sheet.drag.test.tsx
    - src/ui/__tests__/Sheet.stack.test.tsx
  modified:
    - src/ui/Sheet.tsx
    - src/theme/tokens.ts
    - src/ui/Dropdown.tsx
    - src/features/you/components/HomeCurrencyChangeSheet.tsx
    - src/ui/__tests__/Sheet.scrim.test.tsx
    - src/ui/__tests__/Dropdown.test.tsx
    - src/ui/__tests__/DetailSheet.test.tsx
    - src/ui/__tests__/recordPrimitives.test.tsx
    - src/features/you/__tests__/HomeCurrencyChangeSheet.test.tsx
decisions:
  - "scheduleOnRN from react-native-worklets (exported in 0.10.1) used for JS callbacks from the pan"
  - "Handle: 44px tall, marginTop/Bottom -22 (sheetCornerPad), paddingTop 9, so the header stays where it was"
  - "bodyTop = layout.y estimate immediately, refined by measureLayout against the container"
metrics:
  tasks: 3
  completed: 2026-10-13
---

# Phase 3 Plan 09: Own Sheet drag-to-dismiss Summary

The app's own `Sheet` now drags down 1:1 to dismiss with the prototype feel, uses a single ink-at-38% fading backdrop (scrim colour token removed), registers in the sheet stack, supports `dismissible={false}`, and is reachable by screen reader; Dropdown menus share the backdrop.

## Commits
- 53f1cd7: sheetDrag module, ink backdrop, Reanimated rise, scrim token removed
- 0e3b5f6: drag gesture, scroll composition, handle, stack registration, a11y escape
- 441c778: Dropdown backdrop, HomeCurrencyChangeSheet `dismissible={!pending}`

## Deviations from Plan

**1. [Rule 1 - Bug] onEnd guard for scrolled body.** `onEnd` now treats a pan that began in a scrolled body as a scroll (dy 0). In the jest harness `onUpdate` is not fired for the first ACTIVE event so `startDy` was never recorded; the guard is also correct on device.

**2. [Rule 3 - Blocking] ESLint react-hooks/immutability and /refs.** The React-compiler rules reject Reanimated shared-value writes in gesture worklets; a file-level disable with justification is at the top of Sheet.tsx.

**3. [Rule 3 - Blocking] Existing tests queried the backdrop by role/label.** `accessibilityViewIsModal` (required by the plan) hides the sibling backdrop from RNTL queries, so DetailSheet and recordPrimitives tests now pass `{ hidden: true }`. Any other feature test that queries `sheet-backdrop`/"Close" would need the same (none found in the full run, see below).

**4. Test harness notes.** RNTL 14 has no `UNSAFE_getAllByType`; tests collect host Modals via `screen.root` children carrying `onRequestClose`. `useAnimatedScrollHandler` is mocked to the plain function in Sheet.drag.test because fireEvent cannot drive the worklet event ref. `fireEvent` is async in RNTL 14 and must be awaited, not wrapped in an unawaited act. Safety-net rAF restore means the drag test asserts mid-slide translateY at 150ms, before the 190ms dismissal.

## Known Stubs
`onBlockedDismiss` is an intentional no-op hook point; 03-16 wires the Discard prompt.

## Needs on-device tuning
SHEET_FLING_VELOCITY (1000 px/s), handle margins, and the scroll/drag hand-off on Pixel and iPhone XR.

## Self-Check: PASSED
Full jest run: 301 suites, 7770 tests passed; tsc clean; eslint 0 errors.
