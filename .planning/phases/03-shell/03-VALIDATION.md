---
phase: 3
slug: shell
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 + jest-expo ~57.0.5 + @testing-library/react-native |
| **Config file** | `jest.config.js`, `jest.setup.ts` (existing) |
| **Quick run command** | `npm test -- src/shell` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~60 seconds for the full suite; under 10 seconds for `src/shell` |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/shell`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd-verify-work`:** The full suite must be green, and the manual-only rows below must be run and recorded
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Each row maps a plan task to its automated check. The DSG-07 row uses the rendered-size test of the `@/ui/Text` primitive (manual scaling from the OS font scale) rather than a `maxFontSizeMultiplier` prop proxy, because 03-05 does not rely on that prop (research Pitfall 2).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-03-T1 | 03-03 | 1 | NAV-01 | — | N/A | unit | `npx jest src/shell/tabBar/__tests__/direction.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-02-T1 | 03-02 | 1 | NAV-02 | T-03-02-02 | 8-entry cap | unit (pure) | `npx jest src/shell/backHistory/__tests__/backHistoryReducer.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-02-T2 | 03-02 | 1 | NAV-02 | — | N/A | unit (pure) | `npx jest src/shell/backHistory/__tests__/navLocation.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-06-T1 | 03-06 | 2 | NAV-02 | T-03-06-03 | bounded goBack loop | unit (mocked router) | `npx jest src/shell/backHistory/__tests__/BackHistoryProvider.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-06-T2 | 03-06 | 2 | NAV-02 | T-03-06-01 | back runs discard check first | unit (mocked BackHandler) | `npx jest src/shell/backHistory/__tests__/useAndroidBackHandler.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-13-T1 | 03-13 | 5 | NAV-03 | — | N/A | config | `npx jest src/shell/__tests__/layoutConfig.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-13-T3 | 03-13 | 5 | NAV-02 | T-03-13-01 | shell only under (app) | integration (renderRouter) | `npx jest src/shell/__tests__/shellNavigation.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-09-T2 | 03-09 | 3 | NAV-04 | T-03-09-01 | dirty sheet never closes silently | component (RNTL) | `npx jest src/shell/sheet/__tests__/SheetContainer.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-16-T1 | 03-16 | 7 | NAV-04 | T-03-16-01 | entry form dirty tracking | unit | `npx jest src/features/record/entry/__tests__/formDirty.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-03-T2 | 03-03 | 1 | NAV-05 | T-03-03-01 | Hidden while signed out / locked (D-10) | unit | `npx jest src/shell/fab/__tests__/shouldHideFab.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-07-T1 | 03-07 | 3 | NAV-05 | T-03-07-01 | FAB hidden unless signed in | component | `npx jest src/shell/fab/__tests__/FabProvider.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-08-T2 | 03-08 | 3 | NAV-06 | — | N/A | component (RNTL getByRole) | `npx jest src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-06-T3 | 03-06 | 2 | NAV-06 | — | N/A | unit (mocked AccessibilityInfo) | `npx jest src/shell/__tests__/a11yFocus.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | DSG-07 | T-03-05-01 | scale clamped 2x / 1.3x | component | `npx jest src/ui/__tests__/Text.test.tsx src/theme/__tests__/fontScale.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-10-T2 | 03-10 | 3 | DSG-07 | — | N/A | component (rendered fontSize under FontScaleProvider) | `npx jest src/shell/header/__tests__/TabHeader.fontScale.test.tsx` | ❌ W0 (created in task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every test file below is created inside the task that needs it (TDD tasks write the test first), so no separate Wave 0 plan exists:

- [ ] `src/shell/backHistory/__tests__/backHistoryReducer.test.ts`: NAV-02 (03-02 T1)
- [ ] `src/shell/tabBar/__tests__/direction.test.ts`: NAV-01 (03-03 T1)
- [ ] `src/shell/fab/__tests__/shouldHideFab.test.ts`: NAV-05 (03-03 T2)
- [ ] `src/shell/tabBar/__tests__/TabBar.a11y.test.tsx`: NAV-06 automatable half (03-08 T2)
- [ ] `src/shell/sheet/__tests__/SheetContainer.test.tsx`: NAV-04, with a local capturing `@gorhom/bottom-sheet` mock (03-09 T2)
- [ ] `src/shell/__tests__/testUtils.tsx`: `renderWithShellProviders()` (03-06 T3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader focus moves to the new screen title on tab change and push (03-14 A4; iOS I2) | NAV-06 | No reliable JS-testable seam for OS focus movement (RN #37015) | iPhone XR VoiceOver and Android emulator TalkBack: switch tabs, push a detail, open a sheet. Record that focus lands on the title each time. |
| Text caps hold at the largest accessibility sizes (03-14 A5; iOS I3) | DSG-07 | `maxFontSizeMultiplier` is unreliable on Fabric (RN #47499, #35658) | Set the largest accessibility text size on both devices. Check body text reaches about 200% without clipping, and that display figures and tab labels stay at about 1.3×. |
| Android back chain with predictive back disabled (03-14 A1) | NAV-02 | OS-level gesture | On an Android 13+ emulator: open a sheet, press back (the sheet closes). Walk the history, land on Home, then exit. |
| iOS edge swipe pops detail screens only (03-14 I1, pending Apple enrolment) | NAV-03 | Native gesture | iPhone XR: swipe from the left edge on a detail screen (it pops). The same swipe on a tab root does nothing. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
