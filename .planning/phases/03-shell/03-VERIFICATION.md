---
phase: 03-shell
verified: 2026-10-14T19:00:00Z
status: gaps_found
score: 4/6 roadmap success criteria fully verified (SC1, SC2, SC3, SC4 verified in code and on device; SC5 pending TalkBack; SC6 has a wrong-figure bug)
gaps:
  - truth: "Home opens with a This month card built from the user's recorded data, showing what is left after everything (HOME-02)"
    status: failed
    reason: "CR-01 confirmed. ThisMonthCard.tsx:72 `const empty = totals.count === 0` counts only recorded rows. A month with no entries but expected recurring bills takes the empty branch (lines 106-107): headline is fmt(0) in muted ink, while the UNPAID cell and the bar show the projected bills. Headline contradicts UNPAID; position.left (negative) is hidden."
    artifacts:
      - path: "src/features/home/ThisMonthCard.tsx"
        issue: "empty ignores position.unpaidCount / unconvertedUnpaid"
    missing:
      - "empty = totals.count === 0 && position.unpaidCount === 0 && position.unconvertedUnpaid === 0"
      - "ThisMonthCard test: zero rows plus one projected bill renders -X in danger colour"
  - truth: "Edited sheets ask before discarding, and Discard discards (NAV-04, D-26, D-33)"
    status: failed
    reason: "CR-02 confirmed. RepeatsField.tsx onChangeText calls setEnd on every keystroke, so the parent value updates live. Sheet is `onDismiss={() => setOpen(false)}` with dirty={dirty}. Discard therefore only closes the sheet; neither countText nor value.end is reverted, so the user is told the edit was discarded but Save writes the new occurrence count."
    artifacts:
      - path: "src/features/record/entry/RepeatsField.tsx"
        issue: "Discard does not restore opening value"
      - path: "src/ui/Sheet.tsx"
        issue: "no onDiscard callback distinct from onDismiss"
    missing:
      - "Snapshot {value, countText} on open; restore both on discard (Sheet onDiscard, or defer applying the count until normal close)"
      - "Test: type a count, Discard, summary and saved series keep the opening value"
  - truth: "Detail screens dismiss back by edge swipe (NAV-03, D-07, D-40); device check A7"
    status: failed
    reason: "A7 FAIL on Pixel 9 with 3-button navigation. SwipeBack start zone is still 28dp (swipeBackGesture.ts:6 SWIPE_BACK_EDGE_WIDTH = 28), fires only on release, no visual follow. Not discoverable, no feedback. D-40 not implemented."
    artifacts:
      - path: "src/features/navigation/SwipeBack.tsx"
        issue: "no finger-follow; zone too narrow"
      - path: "src/features/navigation/swipeBackGesture.ts"
        issue: "SWIPE_BACK_EDGE_WIDTH 28, needs about 40"
    missing:
      - "Widen start zone to about 40dp, make the screen follow the finger, complete or snap back on release"
      - "Keep clear of SwipeRow and horizontal scrollers; device re-check on Pixel 9"
  - truth: "Pay bills / See all open Activity filtered to unpaid, and the state is obvious (HOME-01, HOME-03, D-41); device check A9"
    status: failed
    reason: "A9 FAIL. Activity with the Unpaid filter shows only a highlighted Filter chip, so entries look like they disappeared. No 'Showing unpaid bills · Clear' banner exists in src (grep found none). D-41 not implemented."
    artifacts:
      - path: "src/features/record/activity/ActivityScreen.tsx"
        issue: "no unpaid-filter banner"
      - path: "src/i18n/locales/en.ts"
        issue: "banner copy missing"
    missing:
      - "Slim banner under the header while Unpaid filter is active: 'Showing unpaid bills · Clear'; Clear removes the filter; copy via i18n catalogue; test"
  - truth: "Projected bills read the same on Home and Activity (HOME-03, D-42); device check A9"
    status: failed
    reason: "en.ts:1323 Home Coming up still uses 'Projected'; Activity uses 'Expected' (en.ts:314/440/566), and Activity expected rows are faded and not tappable while Home's open a read-only detail. D-42 not implemented."
    artifacts:
      - path: "src/i18n/locales/en.ts"
        issue: "home projected: 'Projected' (line 1323)"
      - path: "src/features/record/activity/ActivityRow.tsx"
        issue: "expected rows not tappable"
    missing:
      - "Use 'Expected' everywhere; make Activity expected rows open the same read-only ProjectionDetailSheet (still no Pay)"
  - truth: "Home Accounts summary shows balances, each opening its account (HOME-04, D-39)"
    status: failed
    reason: "Accounts row too wide. AccountBalanceBlock compact still renders the standing/overdraft sentence, home-currency conversion and RateAttribution under the figure (AccountBalanceBlock.tsx around line 123). D-39 requires balance plus at most one short line in compact; detail screen only for the rest."
    artifacts:
      - path: "src/features/record/accounts/AccountBalanceBlock.tsx"
        issue: "compact renders full meta"
    missing:
      - "In compact: balance figure (danger when negative) plus one short line (home-currency 'approx X' for foreign accounts, or overdrawn state); move standing sentence and RateAttribution to detail screen only; applies to AccountsCard and AccountsScreen"
  - truth: "Home figures never show a confident wrong number on read failure (HOME-02/HOME-03)"
    status: partial
    reason: "Review WR-01, per code review, not independently re-run: useHomeViewModel returns isError but HomeScreen never reads it; a failed read renders 'No entries' / 0 and drops projected bills from UNPAID with no disclosure."
    artifacts:
      - path: "src/features/home/HomeScreen.tsx"
        issue: "isError ignored"
    missing:
      - "Render a could-not-load state in ThisMonthCard and ComingUpCard when vm.isError"
human_verification:
  - test: "I1 iPhone XR native edge swipe pops details only (D-07)"
    expected: "Native swipe pops details, does nothing on Home/Activity"
    why_human: "Apple enrolment pending; no iOS build"
  - test: "I2 VoiceOver focus and sheet escape (NAV-06, D-20)"
    expected: "Same semantics as A11 on iOS"
    why_human: "Apple enrolment pending"
  - test: "I3 Largest Dynamic Type (DSG-07, D-19)"
    expected: "Text caps at defined maximum, layouts intact"
    why_human: "Apple enrolment pending"
  - test: "I4 Scroll-bounce while dragging a sheet (Pitfall 7)"
    expected: "No rubber-banding of content when dragging a top-scrolled sheet"
    why_human: "Apple enrolment pending"
---

# Phase 3: Shell Verification Report

**Phase Goal:** The app's navigation chrome matches the design system exactly, and Home opens on real content.
**Verified:** 2026-10-14
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

### Roadmap success criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Five tabs, bespoke glyphs, slide direction matches travel | VERIFIED (Android) | A6 PASS on device; tab bar, TabGlyphs, direction/tabSlide modules and tests exist. Note: only two tabs (Home, Activity) are available this phase by design (D-01). iOS unverified. |
| 2 | Back through up to 8 screens; details push over and dismiss | PARTIAL | A1 PASS (back chain, 8-deep reducer). A7 FAIL: in-app edge swipe-back not usable on 3-button Android (D-40). Back button/Android back work. |
| 3 | Drag any sheet to dismiss; entry sheet keeps a draft; edited sheets ask before discarding | PARTIAL | A2, A3, A4 PASS. But Repeats sheet Discard does not discard (CR-02); WR-02/WR-03 (dirty without input, draft restore drops repeats/category/received amount) are warnings against D-25/D-33. |
| 4 | FAB action matches tab; hides during sheets, bulk select, onboarding, step flows | VERIFIED | A8 PASS; shouldHideFab, FabProvider, FabQuickMenu present and tested. |
| 5 | Screen reader navigation on both platforms | PARTIAL | Android: A11 TalkBack PASS (2026-10-14). iOS: I2 VoiceOver pending Apple enrolment. |
| 6 | Home: quick actions, This month, Coming up, Accounts, from recorded data | FAILED | CR-01 wrong headline, D-39 account rows, D-41 and D-42 Activity/Home hand-off and consistency, WR-01 errors ignored. |

**Score:** 3 verified or mostly verified (1, 4 verified; 2 and 3 partial), 4 of 6 criteria have device evidence of working core behaviour; SC2, SC3, SC6 carry gaps, SC5 is unverified. Counting strictly: 2/6 fully verified.

### Requirements Coverage

All 11 IDs appear in plan frontmatter and in REQUIREMENTS.md; no orphans. REQUIREMENTS.md still marks all "Pending" (to be updated by the orchestrator once gaps close).

| Requirement | Status | Evidence |
|-------------|--------|----------|
| NAV-01 | SATISFIED (Android) | A6 |
| NAV-02 | SATISFIED | A1 |
| NAV-03 | BLOCKED (partial) | Push and cover work; edge-swipe dismissal fails A7 (D-40) |
| NAV-04 | PARTIAL | Drag works (A2); CR-02 Discard bug; WR-05 timer |
| NAV-05 | SATISFIED | A8 |
| NAV-06 | SATISFIED (Android); iOS pending | A11 PASS; I2 pending Apple enrolment |
| DSG-07 | SATISFIED (Android) | A12 PASS; I3 pending; IN-01 latent |
| HOME-01 | PARTIAL | Pay bills lands on Unpaid but unclear (D-41) |
| HOME-02 | BLOCKED | CR-01 |
| HOME-03 | PARTIAL | D-42 inconsistency; WR-01 |
| HOME-04 | PARTIAL | D-39 row width |

### Anti-patterns / review findings

- CR-01 and CR-02 independently confirmed in code (ThisMonthCard.tsx:72; RepeatsField.tsx onChangeText/Sheet onDismiss).
- Not re-run, from 03-REVIEW.md: WR-01 (Home isError), WR-02 (edit dirty without input), WR-03 (draft restore loses repeats/category origin/received amount), WR-04 (draft currency/status not validated), WR-05 (drag-dismiss timer uncleared), WR-06 (offline refresh says "Up to date"), WR-07 (amount-range filter native vs home minor units), WR-08 (import router.replace('/activity') may duplicate (tabs); verify on device). These are warnings; recommend folding WR-01, WR-02, WR-03, WR-06 into the gap plan because they produce false statements to the user.
- Automated state as reported by caller: jest 332 suites / 7982 tests pass, tsc, eslint, depcruise clean. Not re-run.

### Deferred items

None. No later phase covers these gaps.

### Gaps Summary

Core chrome works on Android (A1-A6, A8, A10, A12-A16 PASS). Gaps are: two confirmed review blockers (CR-01 wrong headline figure, CR-02 false Discard), the three decisions added after the device check that are decided but not implemented (D-39, D-40, D-41, D-42), and the Home error-state hole. A11 TalkBack passed on 2026-10-14. Human items: I1-I4 on iPhone XR after Apple enrolment.

---

_Verified: 2026-10-14_
_Verifier: Claude (gsd-verifier)_

## Round 2 audit (2026-10-14)

A fresh code review, UI audit (16/24) and security audit (59 threats, 56 closed, 3 open) were run after this verification. All findings, deduplicated against the gaps above, are in 03-FINDINGS.md: 9 blockers (G1-G9, covering gaps 1-7 here plus import tabs duplication and the missing sync line), 9 high, 9 medium, 13 low. Gap planning should use 03-FINDINGS.md as the gap list.
