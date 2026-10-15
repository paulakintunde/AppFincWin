---
phase: 03-shell
verified: 2026-10-14T23:00:00Z
status: human_needed
score: 6/6 roadmap success criteria verified on Android and in code
re_verification: true
re_verification_detail:
  previous_status: gaps_found
  previous_score: 2/6
  gaps_closed: [V1, V2, V3, V4, V5, V6, V7]
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "I1 iPhone XR native edge swipe pops details only (D-07)"
    expected: "Native swipe pops details, does nothing on Home/Activity"
    why_human: "Apple enrolment pending; no iOS build"
  - test: "I2 VoiceOver focus and sheet escape (NAV-06, D-20)"
    expected: "Same semantics as the Android TalkBack pass (A11)"
    why_human: "Apple enrolment pending"
  - test: "I3 Largest Dynamic Type (DSG-07, D-19)"
    expected: "Text caps at the defined maximum, layouts intact"
    why_human: "Apple enrolment pending"
  - test: "I4 Scroll-bounce while dragging a sheet (Pitfall 7)"
    expected: "No rubber-banding when dragging a top-scrolled sheet"
    why_human: "Apple enrolment pending"
---

# Phase 3: Shell Verification Report (re-verification)

**Phase Goal:** The app's navigation chrome matches the design system exactly, and Home opens on real content.
**Verified:** 2026-10-14 (HEAD 3afe487, branch phase/03-shell)
**Status:** human_needed. No gaps; only the iOS-only items I1-I4, deferred until Apple enrolment.
**Re-verification:** Yes, after gap closure plans 03-25..03-38.

## Roadmap success criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Five tabs, bespoke glyphs, direction-matched slide | VERIFIED (Android) | A6 PASS; `src/shell/tabBar/` (TabBar, TabSlideIn, tabSlide.ts with wipe handler, tabSlide.ts:5,30). iOS covered by I-items. |
| 2 | Back through 8 screens; details push and dismiss | VERIFIED | A1 PASS; `src/shell/backHistory/`; `SWIPE_BACK_EDGE_WIDTH = 40` (swipeBackGesture.ts:7); R1 PASS on Pixel 9; import returns with `dismissTo`/`ACTIVITY_HREF` (importReturn.ts; R6 PASS). |
| 3 | Drag-dismiss; entry draft kept; edited sheets ask | VERIFIED | A2-A4 PASS; Sheet `onDiscard`; drag-dismiss timer cleared (Sheet.tsx:160-165); RepeatsField snapshot/restore (RepeatsField.tsx:36,83). |
| 4 | FAB per tab; hides in sheets, bulk select, onboarding, steps | VERIFIED | A8 PASS; `src/shell/fab/`; Activity lists pad bottom with `FAB_CLEARANCE` (ActivityScreen.tsx:318,351). |
| 5 | Screen reader navigation both platforms | VERIFIED (Android); iOS pending | A11 TalkBack PASS; VoiceOver is I2. |
| 6 | Home: quick actions, This month, Coming up, Accounts from recorded data | VERIFIED | ThisMonthCard.tsx:84 `empty` counts expected bills; error/offline states in ThisMonthCard.tsx:103 and ComingUpCard.tsx:116; compact account row; R2, R3, R5 PASS. |

**Score:** 6/6

## Previous gaps V1-V7

| Gap | Status | Evidence |
|-----|--------|----------|
| V1 / G1 headline "0 left" with only expected bills | CLOSED | ThisMonthCard.tsx:84 `totals.count === 0 && position.unpaidCount === 0 && position.unconvertedUnpaid === 0`; headline colour line 131 |
| V2 / G2 Repeats Discard keeps new count | CLOSED | RepeatsField.tsx:36 snapshot on open, :83 `onDiscard={discard}`; Sheet.tsx `onDiscard` prop |
| V3 / G7 edge swipe-back 28dp, no follow | CLOSED | swipeBackGesture.ts:7 = 40; device R1 PASS (follows finger) |
| V4 / G8 Unpaid banner | CLOSED | `src/features/record/activity/UnpaidBanner.tsx` + `__tests__/UnpaidBanner.test.tsx`, `unpaidFocus.test.tsx`; copy in en.ts; R2 PASS |
| V5 / G9 "Expected" everywhere, tappable Activity expected rows | CLOSED | en.ts:440 and en.ts:1335 both "Expected"; ActivityScreen.tsx:18,433 mounts ProjectionDetailSheet; R3 PASS |
| V6 / G6 compact account row | CLOSED | AccountBalanceBlock.tsx:24,102,143-154 compact branch = figure + one `compactBalanceLine`; full block on detail; R5 PASS |
| V7 / G4 Home ignores errors/offline | CLOSED | `home.state.monthError/monthOffline` (ThisMonthCard.tsx:103), `upcomingError/upcomingOffline` (ComingUpCard.tsx:116); useHomeViewModel.ts:41,122 |

## 03-FINDINGS.md closure

Key: READ = confirmed in code by this verifier. SUMMARY+TESTS = relied on plan SUMMARY and the full automated run (337 suites / 8128 tests, coverage thresholds met, tsc, eslint, depcruise clean at 7e52bb2; later commits docs only), not individually opened.

| ID | Item | Basis |
|----|------|-------|
| G1 | headline with only expected bills | READ ThisMonthCard.tsx:84 |
| G2 | Repeats discard | READ RepeatsField.tsx:36,83 |
| G3 | import second (tabs) navigator | READ importReturn.ts uses `dismissTo`/`ACTIVITY_HREF`; R6 PASS |
| G4 | Home load/offline state | READ ThisMonthCard/ComingUpCard |
| G5 | sync line at scroll 0 and pushed screens | READ SyncProblemLine in CompactHeader, AccountsScreen, AccountDetailScreen, CategoriesScreen, RulesScreen, HistoryScreen, ImportScreen, Setup screens; R4 PASS |
| G6 | compact account row | READ AccountBalanceBlock.tsx; R5 PASS |
| G7 | edge swipe 40dp | READ swipeBackGesture.ts:7; R1 PASS |
| G8 | Unpaid banner | READ UnpaidBanner.tsx exists; R2 PASS |
| G9 | Expected wording/tappable rows | READ en.ts, ActivityScreen.tsx; R3 PASS |
| H1 | draft restore loses repeats/category/received | SUMMARY+TESTS |
| H2 | uncategorised edit self-dirty | SUMMARY+TESTS |
| H3 | offline refresh toast | READ useShellRefresh.ts:14,23 return 'failed' (no toast) |
| H4 | draft currency/status validation | SUMMARY+TESTS |
| H5 | drag-dismiss timer | READ Sheet.tsx:160-165 |
| H6 | short flick on dirty sheet | SUMMARY+TESTS |
| H7 | double-tap duplicate pushes | READ `shell/navigation/pushOnce.ts` used by AccountsCard, QuickActions, AvatarButton, ShellEntryHost |
| H8 | FAB covers last row | READ FAB_CLEARANCE in ActivityScreen.tsx |
| H9 | amount-range native vs home minor | SUMMARY+TESTS |
| M1 | iOS card shadow with overflow hidden | READ AccountsCard.tsx:215 shadow on outer view (ComingUpCard.tsx:284 inner clip only) |
| M2-M9 | spacer band, toast animation/padding, cash tint, avatar hit area/glyph, past-month copy, card drift, refresh keys, font scaling | SUMMARY+TESTS (M9 also A12 PASS on device) |
| L1 | tabSlide wipe handler | READ tabSlide.ts:5,30 |
| L2-L13 | MonthChips roles, month names, selected month roll-over, early input, barShares refunds, toCurrency cap, useRegisterFab cleanup, DiscardPrompt reopen, runOnJS/disables, Pay wrap, header roles, housekeeping | SUMMARY+TESTS |

Device re-check R1-R9 (docs/acceptance/phase-03-shell.md): all PASS.

## Requirements coverage

All 11 IDs appear in plan frontmatter (03-25..03-38; 03-38 lists all 11) and in REQUIREMENTS.md lines 172-181 and 296. No orphans.

| Requirement | Status | Evidence |
|-------------|--------|----------|
| NAV-01 | SATISFIED (Android) | A6, A15, R4 |
| NAV-02 | SATISFIED | A1, R6 |
| NAV-03 | SATISFIED (Android); iOS I1 | A7, R1 |
| NAV-04 | SATISFIED | A2-A4, Sheet.tsx, RepeatsField.tsx |
| NAV-05 | SATISFIED | A8 |
| NAV-06 | SATISFIED (Android); iOS I2 | A11 |
| DSG-07 | SATISFIED (Android); iOS I3 | A12 |
| HOME-01 | SATISFIED | A9, R2 |
| HOME-02 | SATISFIED | ThisMonthCard.tsx:84; R2 |
| HOME-03 | SATISFIED | R3 |
| HOME-04 | SATISFIED | R5 |

REQUIREMENTS.md still shows these as "Pending"; the orchestrator should tick them.

## Anti-patterns

None blocking found in spot-checks.

## Notes for the Compliance phase (not gap work)

- "Pay" and "Pay bills" only mark an item paid; the wording can read as making a payment in an app that executes none (UI #9).
- Account deletion with full purge is not in this phase; re-check wipe-handler coverage (including tabSlide) then.

## Human verification required

I1-I4 on the iPhone XR after Apple Developer enrolment (see frontmatter). iOS-only and deferred by design, not gaps.

---

_Verified: 2026-10-14_
_Verifier: Claude (gsd-verifier)_
