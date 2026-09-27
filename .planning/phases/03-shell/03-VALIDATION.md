---
phase: 3
slug: shell
status: draft
nyquist_compliant: false
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

Task IDs are filled in by the planner. Each row maps a requirement to its automated check (from `03-RESEARCH.md` § Validation Architecture).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0/1 | NAV-01 | — | N/A | unit | `npx jest src/shell/tabBar/__tests__/direction.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0/1 | NAV-02 | — | N/A | unit (pure) | `npx jest src/shell/backHistory/__tests__/backHistoryReducer.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | NAV-02 | — | N/A | unit (mocked BackHandler) | `npx jest src/shell/backHistory/__tests__/useAndroidBackHandler.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | NAV-03 | — | N/A | component/config | `npx jest src/shell/__tests__/layoutConfig.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | NAV-04 | — | N/A | component (RNTL) | `npx jest src/shell/sheet/__tests__/SheetContainer.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0/1 | NAV-05 | — | Hidden while signed out / locked (D-10) | unit | `npx jest src/shell/fab/__tests__/shouldHideFab.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | NAV-06 | — | N/A | component (RNTL getByRole) | `npx jest src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | DSG-07 | — | N/A | component (prop proxy) | `npx jest src/shell/header/__tests__/TabHeader.fontScale.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/shell/backHistory/__tests__/backHistoryReducer.test.ts`: NAV-02. Pure. The highest-value test in the phase.
- [ ] `src/shell/tabBar/__tests__/direction.test.ts`: NAV-01.
- [ ] `src/shell/fab/__tests__/shouldHideFab.test.ts`: NAV-05.
- [ ] `src/shell/tabBar/__tests__/TabBar.a11y.test.tsx`: NAV-06, the automatable half.
- [ ] `src/shell/sheet/__tests__/SheetContainer.test.tsx`: NAV-04. Needs a `@gorhom/bottom-sheet` Jest mock; check the library's own mock before writing one.
- [ ] `src/shell/__tests__/testUtils.tsx`: a `renderWithShellProviders()` helper (BackHistoryProvider, FabProvider, theme), shared across shell component tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader focus moves to the new screen title on tab change and push | NAV-06 | No reliable JS-testable seam for OS focus movement (RN #37015) | iPhone XR VoiceOver and Android emulator TalkBack: switch tabs, push a detail, open a sheet. Record that focus lands on the title each time. |
| Text caps hold at the largest accessibility sizes | DSG-07 | `maxFontSizeMultiplier` is unreliable on Fabric (RN #47499, #35658) | Set the largest accessibility text size on both devices. Check body text reaches about 200% without clipping, and that display figures and tab labels stay at about 1.3×. |
| Android back chain with predictive back disabled | NAV-02 | OS-level gesture | On an Android 13+ emulator: open a sheet, press back (the sheet closes). Walk the history, land on Home, then exit. |
| iOS edge swipe pops detail screens only | NAV-03 | Native gesture | iPhone XR: swipe from the left edge on a detail screen (it pops). The same swipe on a tab root does nothing. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
