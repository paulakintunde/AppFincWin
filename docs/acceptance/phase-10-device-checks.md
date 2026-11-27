# Phase 10 device checks (plan 10-30)

Build: local Gradle debug dev client from main ed5e020d (2026-11-26), arm64 only, installed over the existing app on the Pixel 9 (55240DLAQ000EQ), JS from Metro :8076. The EAS free plan's Android builds are used up until 2026-12-01, so there is no EAS dev build or preview APK this round; the owner chose a local build.

| # | Step | Result |
|---|---|---|
| 1 | Cover, lock off: open Home with figures, open the app switcher. The snapshot shows only the tint and the mark | |
| 2 | Same with the lock on | |
| 3 | Turn on the lock from the Home offer; leave the app 1 minute; fingerprint unlocks | |
| 4 | Cold start (swipe the app away, reopen) asks to unlock | |
| 5 | Wrong PIN 5 times shows "Try again in 0:30" and the countdown runs | |
| 6 | 10 wrong tries: sign in again with Google as the same user; records and queued changes are still there; set a new PIN (D-29) | |
| 7 | You > Security lists this phone first with "This device"; sign out another device | |
| 8 | Alerts: switching on Large transaction shows our pre-ask, then Android's permission dialog | |
| 9 | Partner's large shared expense from the second account arrives as a push; the text has no note or payee | |
| 10 | Quiet hours set to cover now; raise an alert; the log shows "Held for quiet hours" and it arrives when quiet hours end | |
| 11 | Go offline, add 3 lines, force-quit, reopen online: the lines send once (no duplicates) | |
| 12 | Archive a past month at level 4: it leaves the month switcher; the Decide answer is unchanged | |
| 13 | Delete-account screen shows "Save a copy of my records" and the 30-day line (do not delete) | |
| 14 | TalkBack over the lock screen, Security, Alerts and Archive | |
| 15 | Text fit at 320 dp and font scale 2.0 on the lock screen and Alerts | |
| 16 | iPhone XR: Face ID + cover | |
