# Android device matrix (APP-14, Android)

**Date:** 2026-11-13
**Results are filled in plan 05.5-23.** This file holds the protocol and an empty results table.

## What is covered

| Axis | Values |
|---|---|
| Phone | Pixel 9 (physical, 1080 px wide), Pixel 6 (physical) |
| Width | About 402 dp and exactly 320 dp (by display density) |
| Text size | font scale 1.0, 1.3 and 2.0 |
| Screen reader | TalkBack on (one pass per phone at 402 dp, font scale 1.0 and 2.0) |

## Screens

Home card, Decide home, a Decide check (answer shown), setup items, `CategorySheet`, shared pay form and shared bill form (the forms from plan 05.5-17, in Activity and in Decide's setup frame).

## How to run

Run from a worktree with `.env.local` (public keys only). Restart Metro with `--clear` first: its file watcher goes stale in long sessions and the phone then runs old code. Open the dev client at `127.0.0.1`, not `localhost`.

1. Note the baseline: Pixel 9 density 420, font scale 1.15, TalkBack off. Restore it after the run.
2. Point the dev client at Metro: `adb -s <serial> reverse tcp:<port> tcp:<port>`, then `MSYS_NO_PATHCONV=1 adb -s <serial> shell am start -a android.intent.action.VIEW -d "exp+fincwin://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>" com.fincwin.app`. Redo the reverse after a reboot or a long idle.
3. Width: about 402 dp is `adb shell wm density 430`; exactly 320 dp is `adb shell wm density 540`; back with `adb shell wm density reset`.
4. Text size: `adb shell settings put system font_scale 1.0` (then 1.3, then 2.0).
5. Each change restarts the app on Home. Tap the target screen again by label (read bounds from `adb shell uiautomator dump /dev/tty`).
6. For each cell, take a screenshot and check: no clipped or overlapping text, every button reachable, the amount and its label both visible, no horizontal scroll.
7. TalkBack: enable with `adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService` and `adb shell settings put secure accessibility_enabled 1`. The first time, a tutorial opens; dismiss it with a tap plus a double tap on Finish.
8. With TalkBack on, `adb shell input` does not move TalkBack focus. Use `adb shell uinput file.json` to create a virtual touchscreen (register EV_KEY and EV_ABS; BTN_TOUCH 330; ABS_MT_SLOT, TRACKING_ID, POSITION_X, POSITION_Y as 47, 57, 53, 54; INPUT_PROP_DIRECT; x max 1079, y max 2423), then inject a swipe of about 800 px in 12 ms steps. About 0.9 s later take a screenshot to read the spoken caption bar. Confirm the order and the spoken text on each screen.
9. Check which app is in front before driving it: `adb shell dumpsys activity activities | grep topResumedActivity`.

The existing component text-fit tests are the fast guard (for example `src/features/decide/__tests__/decideTextFit.test.ts` and `src/features/income/__tests__/incomeTextFit.test.tsx`); this matrix is the real-device check on top of them.

## Results (filled in plan 05.5-23)

Mark each cell Pass, Fail (with a note) or n/a. Date and build id at the top of each run.

**Run 2026-11-16, preview build 0.2.0 (EAS c8adcb4c, main 49e64d08) plus OTA 3c05624c (#141, #142):** the owner tested on the Pixel 6 at its own width (about 411 dp) and font scale 1.15, and once at the largest font. Results are on the phone test page (https://claude.ai/artifact/TsQBPzaMGAZAwwKD3TY6TF): 26 of 27 pass, and the test-harness flow is skipped because a preview build has no harness. Found and fixed: See the answer ignored taps on an untouched car step 3 (the step frame's layout animation), cap rows missing built-in category names, and the Decide title wrapping beside its controls. All three were re-checked on the Pixel 6 after the OTA. Rows not run in this sitting are marked "audit" and go to the post-05.5 test audit (PR #135), as the owner decided (device tests after 05.5).

| Phone | Width | Font scale | TalkBack | Home card | Decide home | A Decide check | Setup items | CategorySheet | Shared pay form | Shared bill form |
|---|---|---|---|---|---|---|---|---|---|---|
| Pixel 9 | 402 dp | 1.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 402 dp | 1.3 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 402 dp | 2.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 320 dp | 1.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 320 dp | 1.3 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 320 dp | 2.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 402 dp | 1.0 | on | audit | audit | audit | audit | audit | audit | audit |
| Pixel 9 | 402 dp | 2.0 | on | audit | audit | audit | audit | audit | audit | audit |
| Pixel 6 | ~411 dp (own width) | 1.15 | off | Pass | Pass (after #142) | Pass (after #141) | Pass | Pass | audit | Pass |
| Pixel 6 | 402 dp | 1.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 6 | 402 dp | 2.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 6 | 320 dp | 1.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 6 | 320 dp | 2.0 | off | audit | audit | audit | audit | audit | audit | audit |
| Pixel 6 | 402 dp | 1.0 | on | audit | audit | audit | audit | audit | audit | audit |
| Pixel 6 | 402 dp | 2.0 | on | audit | audit | audit | audit | audit | audit | audit |
