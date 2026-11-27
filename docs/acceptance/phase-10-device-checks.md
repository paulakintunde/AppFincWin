# Phase 10 device checks (plan 10-30)

Build: local Gradle debug dev client from main ed5e020d (2026-11-26), arm64 only, installed over the existing app on the Pixel 9 (55240DLAQ000EQ), JS from Metro :8076. The EAS free plan's Android builds are used up until 2026-12-01, so there is no EAS dev build or preview APK this round; the owner chose a local build.

| # | Step | Result |
|---|---|---|
| 1 | Cover, lock off: open Home with figures, open the app switcher. The snapshot shows only the tint and the mark | FAIL (owner): figures show in the app switcher. The JS cover is drawn after Android takes the picture (the 10-RESEARCH Pattern 2 risk). Fix: `plugins/withRecentsCover.js` (setRecentsScreenshotEnabled(false) on API 33+, FLAG_SECURE only while paused below 33); re-check on the rebuilt APK |
| 2 | Same with the lock on | FAIL (owner): same cause and fix as step 1; re-check on the rebuilt APK |
| 3 | Turn on the lock from the Home offer; leave the app 1 minute; fingerprint unlocks | |
| 4 | Cold start (swipe the app away, reopen) asks to unlock | |
| 5 | Wrong PIN 5 times shows "Try again in 0:30" and the countdown runs | |
| 6 | 10 wrong tries: sign in again with Google as the same user; records and queued changes are still there; set a new PIN (D-29) | |
| 7 | You > Security lists this phone first with "This device"; sign out another device | |
| 8 | Alerts: switching on Large transaction shows our pre-ask, then Android's permission dialog | |
| 9 | Partner's large shared expense from the second account arrives as a push; the text has no note or payee | FAIL (owner): the partner's line arrived but no push. Production had no alert_log or alert_outbox row: the receiver's threshold is USD and the shared line was CAD in a CAD household, so `alerts_pick_amount` found no USD amount and skipped it silently. Fix: migration 20261127090000 converts at the stored rates (pgTAP 128); re-check after the push. Re-check 2026-11-27 06:11 UTC: the partner_large alert is now raised (alert_log row), held for quiet hours; push arrival still to confirm |
| 10 | Quiet hours set to cover now; raise an alert; the log shows "Held for quiet hours" and it arrives when quiet hours end | PARTIAL (owner): "Held for quiet hours" shows. Quiet hours would not switch off: no alert_prefs save ever reached the server (PostgREST upsert needs UPDATE on user_id; 42501), so the 22:00-07:00 UTC defaults applied and the device time zone never saved. Fix: migration 20261127090100 (pgTAP 129), pushed 2026-11-27; arrival after quiet hours still to confirm |
| 11 | Go offline, add 3 lines, force-quit, reopen online: the lines send once (no duplicates) | |
| 12 | Archive a past month at level 4: it leaves the month switcher; the Decide answer is unchanged | |
| 13 | Delete-account screen shows "Save a copy of my records" and the 30-day line (do not delete) | |
| 14 | TalkBack over the lock screen, Security, Alerts and Archive | |
| 15 | Text fit at 320 dp and font scale 2.0 on the lock screen and Alerts | |
| 16 | iPhone XR: Face ID + cover | BLOCKED: waits on the Apple portal steps (00-20); the owner will run it later |
