---
phase: 03-shell
plan: 14
subsystem: shell
tags: [device-acceptance, android, docs]
requires: [03-09, 03-13, 03-15, 03-16, 03-19, 03-23, 03-24]
provides: [phase-03-device-acceptance-record, device-check-decisions-D-39-D-42]
key-files:
  created:
    - .planning/phases/03-shell/03-14-SUMMARY.md
  modified:
    - docs/acceptance/phase-03-shell.md
    - .planning/phases/03-shell/03-CONTEXT.md
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 14: Device acceptance Summary

The Android device checks for the shell were run on a Pixel 9 and recorded: 14 of 16 rows pass (A11 TalkBack was run later the same day and passed), A7 (edge swipe-back) and A9 (Home) fail, and the iOS rows wait for Apple enrolment. One extra finding (Accounts row too wide) was logged. Four decisions (D-39..D-42) close the gaps. No app code was changed by this plan.

## What was recorded
- `docs/acceptance/phase-03-shell.md`: Date (2026-10-14), build id and every `Result:` line, an "Additional finding" section and a "Gaps for closure" list.
- `03-CONTEXT.md`: new section "Device-check decisions (new 2026-10-14)" with D-39..D-42.

## Device and build
Pixel 9, Android, 3-button navigation (secure navigation_mode 0). Local `npx expo run:android` debug build from phase/03-shell (HEAD 06ac01d at install), installed 2026-10-14 after uninstalling a differently-signed older build.

## Results

| Check | Result |
| --- | --- |
| A1-A6, A8, A10, A12-A16 | PASS (A2 fling and handle margins fine, no tuning; A13 haptics respect touch feedback, no D-18 gap) |
| A7 Details cover tab bar / edge swipe | FAIL |
| A9 Home | FAIL |
| A11 TalkBack | PASS (run later on 2026-10-14) |
| I1-I4 (iPhone XR) | pending: Apple enrolment |

## Gaps for closure

| Gap | Observed and diagnosis | Decision |
| --- | --- | --- |
| A7 | Left-edge swipe did not work as expected. With 3-button navigation the only edge swipe is the in-app SwipeBack (28dp start zone, 80dp distance, fires on release, no visual follow): easy to miss, no feedback. | D-40: widen to about 40dp, screen follows the finger, completes or snaps back on release; device re-check needed |
| A9 (Unpaid filter) | Activity opened with the Unpaid filter on looks like entries disappeared; the only cue is the highlighted Filter chip. | D-41: slim banner "Showing unpaid bills · Clear" |
| A9 (projected bills) | "Projected" and tappable on Home; "Expected", faded and not tappable in Activity. Recorded unpaid bills correctly show Mark as paid and swipe to pay/delete. | D-42: "Expected" everywhere, Activity rows tappable to the read-only detail (no Pay, D-34) |
| Accounts row too wide | AccountBalanceBlock `compact` still renders the standing/overdraft sentence, home-currency conversion and RateAttribution with no width cap; also used compact on AccountsScreen. | D-39: balance plus at most one short line; detail only for the rest |

## Pending
- A11 TalkBack: PASS, run later on 2026-10-14.
- I1-I4: pending Apple enrolment.

## Deviations from Plan
None for the recording itself. The plan's checklist outcome includes failures; fixes are deliberately left to a later gap-closure plan and no app source was touched.

## Known Stubs
None.

## Self-Check: PASSED
