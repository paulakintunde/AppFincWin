# Phase 5: Decide UI device acceptance record

Plan 05-26, run against the owner decision of 2026-10-25 (.planning/Decision Research/panel/00-UPGRADE-PLAN.md §2 option 3, §9 decision 1): PR #82 merges with today's Decide hidden behind `DECIDE_OPEN = false` (quick task 261025-f46), and the Decide tab shows "A better Decide is on its way" until Decide v3 (phases 05.1-05.3) switches on. Only the checks that apply to what ships are run here. No account emails or personal identifiers are recorded.

- Phase: 05-decide-ui
- Date: 2026-10-25
- Device: Pixel 9 (Android), development build (expo-notifications included), JS from Metro on port 8075 after a `--clear` restart
- Branch: phase/05-decide-ui at c5248504
- Text-fit matrix: the Pixel's own display (1080 px wide) with `wm density 430` (about 402 dp) and `wm density 540` (exactly 320 dp), each at `font_scale` 1.0 and 2.0. The phone's own settings (density 420, font scale 1.15, TalkBack off) were restored afterwards.

## Skipped: screens Decide v3 replaces

These 05-26 items exercise screens that are hidden now and replaced by v3. They move to phase 05.3's device verification, against the v3 screens.

| 05-26 item | Why skipped |
|---|---|
| Task 2: DCU-11 store screenshots 1-3 (sofa step 3, car step 3, car step 4) and the R18 alternate frame | The check flow and Decide home are hidden; v3 has new screens (mockup "Can I Afford It — Decide mockup"). Store screenshots are taken from v3 |
| Task 3.1: 60-second first read from onboarding | Onboarding no longer runs rough figures and the first check; v3 adds its own Decide setup |
| Task 3.2: verdict and commit haptics; Undo of written lines | Verdict and Go ahead belong to today's check flow |
| Task 3.3: back through steps 4 to 1 | Today's check flow is unreachable; general back behaviour is checked in A3 |
| Task 3.4, 3.5, 3.9: Wait and cooling-off reminders | The reminder observer is off while Decide is hidden, so a tap opens nothing; v3 decides its own reminders |
| Task 3.6-3.8, 3.10-3.14: cash path, combine toggle, confidence, one-off, savings goal, changes coming up, live recompute, R18 list | All inside today's Decide home and check flow |
| 05-EXECUTION-NOTES checklists (Decide UX refresh, Money concepts R18, Wording and This month) | Same screens |

## A1 Coming soon screen at 402 and 320 wide, 1.0x and 2.0x

1. Open the Decide tab at each of the four sizes.
2. Read the screen top to bottom.

Expected: the large title "Can I afford it", then the centred heading "A better Decide is on its way" and the body "We’re rebuilding Decide so its answers can be trusted. Your records and past checks are kept.", wrapping without cut-off words; the Add button covers no text; the tab bar shows Home, Activity, Decide.

Result: PASS at all four sizes (docs/acceptance/phase-05/coming-soon-402dp-1.0x.png, -402dp-2.0x, -320dp-1.0x, -320dp-2.0x). At 320 / 2.0x the title takes two lines, the heading two and the body five, all above the Add button.

Found and fixed on the way: the body sat left-aligned under the centred heading once it wrapped; EmptyState now centres both lines (48143c2f).

## A1b TalkBack

1. Turn TalkBack on at 320 / 2.0x and open the Decide tab.
2. Swipe right through every item, then swipe left back through them, reading TalkBack's spoken caption at each stop.

Expected: focus lands on the title; the order is title, Profile, heading, body, the Add button, the three tabs, each read by its label.

Result: PASS. Focus lands on "Can I afford it" on arrival. Swiping right reads "Can I afford it. Heading", then Profile ("Double-tap to activate"), "A better Decide is on its way", the body in full, the Add button ("Double-tap to activate. Actions available…"), "Home, tab, 1 of 3", "Activity, tab, 2 of 3", "selected. Decide, tab, 3 of 3". Swiping left reads the same items in reverse. The only extra stop is "Tools. Image", the development client's own button, which release builds don't have.

How the swipes were made: `adb shell input` gestures and key combinations don't reach TalkBack's gesture detector, and the real touchscreen is closed to the shell by SELinux. The swipes therefore came from a virtual touchscreen created with Android's `uinput` shell command, whose events TalkBack treats as a finger. Its spoken captions were read from screenshots.

## A2 "New check" is gone everywhere

1. Long-press the Add button on the Decide tab and read Quick add.
2. Open You (the avatar) and read the Add group.

Expected: Quick add lists Add expense, Add income, Transfer, Import statement and no New check; You > Add lists the same four.

Result: PASS for both.

Found and fixed on the way: opening You threw "useFab must be used within a FabProvider". Since 05-98, You > Add reads the FAB quick actions, but You is an outer-stack screen and FabProvider wrapped only the tabs. The provider now wraps the signed-in stack once, and routes.test asserts it (c5248504). This was on the branch before the switch and would have shipped in PR #82.

## A3 Back navigation

1. From Home open the Decide tab, then You.
2. Press Android back twice.
3. Open You again and swipe in from the left edge.

Expected: back returns You → Decide (Coming soon) → Home; the edge swipe leaves You.

Result: PASS (back: You → Decide → Home; edge swipe: You → Home).

## A4 Hidden routes and onboarding (automated)

`Stack.Protected guard={DECIDE_OPEN}` covers decide/check/[id], decide/past, decide/open, decide/changes, decide/lines, decide/pots, setup/rough and setup/first-check; onboarding goes from the first account straight to setup/history. Covered by DecideComingSoonScreen.test and setup.test (quick task 261025-f46); full jest 641/641 suites passing.

## Test phone cleanup (same session)

- Overlay permission (SYSTEM_ALERT_WINDOW) for com.fincwin.app reset to default.
- The 22 "Changes that couldn’t save" entries (all old Decide check writes from Oct 22-23) dismissed; the Home line is gone.
- The two "Sofa" test checks deleted from Open checks.
- The Decide quick field is empty ("laptop 1200" gone after the Metro restart; it is not persisted).
- Metro stopped at the end of the session.
