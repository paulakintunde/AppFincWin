---
phase: 05-decide-ui
plan: 26
subsystem: decide-ui
tags: [device-verification, coming-soon, DECIDE_OPEN, 05.1-05.3]
requires: [quick-261025-f46]
provides: [Phase 5 device acceptance record with Decide hidden]
key-files:
  created:
    - docs/acceptance/phase-05-decide-ui.md
    - docs/acceptance/phase-05/coming-soon-402dp-1.0x.png
    - docs/acceptance/phase-05/coming-soon-402dp-2.0x.png
    - docs/acceptance/phase-05/coming-soon-320dp-1.0x.png
    - docs/acceptance/phase-05/coming-soon-320dp-2.0x.png
  modified:
    - src/ui/EmptyState.tsx
    - app/(app)/_layout.tsx
    - app/(app)/(tabs)/_layout.tsx
    - src/features/record/__tests__/routes.test.tsx
requirements: []
completed: 2026-10-25
---

# 05-26: Device verification, run against Decide hidden

The owner decided on 2026-10-25 that PR #82 merges with today's Decide hidden (`DECIDE_OPEN = false`, quick task 261025-f46) until Decide v3 (05.1-05.3) is ready. 05-26 was therefore narrowed to what ships. Checks for screens v3 replaces (the DCU-11 store screenshots, 60-second first read, reminders, verdict haptics, check-flow back, and the refresh, R18 and D-106 checklists) are skipped and carried to 05.3's device verification. Requirements DCU-11, DCU-10 and DCU-35..40 are not closed here; they are re-verified against v3.

## Results (docs/acceptance/phase-05-decide-ui.md)

- A1 Coming soon at about 402 dp and 320 dp, 1.0x and 2.0x: PASS (four frames saved).
- A1b TalkBack at 320 / 2.0x: PASS. Landing focus is on the title, and swiping right then left reads every item by its label, in order. The swipes came from a uinput virtual touchscreen.
- A2 "New check" gone from Quick add and You > Add: PASS.
- A3 Android back and the edge swipe: PASS.
- A4 Hidden routes and onboarding: covered by jest.

## Defects found and fixed

1. **You crashed on open** ("useFab must be used within a FabProvider"). This was a real 05-98 regression on the branch. FabProvider now wraps the signed-in stack, and routes.test asserts it (c5248504).
2. **The coming-soon body was left-aligned under a centred heading.** EmptyState now centres wrapped text (48143c2f).

## Test phone cleanup
- Overlay permission reset.
- The 22 failed saves dismissed.
- Both Sofa checks deleted.
- The quick field is empty.
- Display, font and TalkBack restored.
- Metro stopped.
