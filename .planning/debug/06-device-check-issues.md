---
status: awaiting_human_verify
trigger: "Issues found during the Phase 6 Pixel 9 device check (owner: /gsd debug to look into the issues found)"
created: 2026-11-11
updated: 2026-11-11
branch: fix/06-device-issues (worktree C:/dev/fincwin-g6, from main e569f05c)
---

# Debug: Phase 6 device-check issues

## Symptoms

Seen by Claude on the Pixel 9 (device 55240DLAQ000EQ, dev client, Metro on 8075) during the Phase 6 device check, 2026-11-11.

1. **Cold-start warning.** Dev-only console warning on cold start: "Can't perform a React state update on a component that hasn't mounted yet". Expected: no warning. Not tied to a Grow screen as far as seen.
2. **Activity day header.** On the Activity tab, a day header under the "Paid" group reads "0 transactions $0" while scheduled (unpaid) lines are shown under it. Expected: header counts/sums match the lines shown, or the header is not drawn when there are none.
3. **Persist log spam.** The `[persist]` query-cache save log fires about once a second while the app is idle. Expected: saves only when the cache changes (throttled), not continuously.
4. **Layout warning.** "Layout children must be of type Screen" from app/(app)/(tabs)/_layout.tsx. Expected: no warning.

Timeline: seen during the Phase 6 device check; unknown whether they predate Phase 6.
Reproduction: cold start the dev client (1, 4), idle on any tab (3), open Activity with scheduled lines in a paid month (2).

## Current Focus

hypothesis: issues 2, 3 and 4 confirmed and fixed (commits 4318779a, 15ce8d67, 96b5e364). Issue 1 could not be reproduced in 6 cold starts.
next_action: owner checks the fixes on the Pixel 9. For issue 1, if the warning shows again, copy the full message with its component stack from Metro (the lines starting with "in" name the component) and reopen this session.

reasoning_checkpoint:
  issue_4: "A null child in the Tabs children list makes expo-router warn. Proven by a node test of React.Children.forEach and by the warning going away on the device once the list has no null."
  issue_3: "The [persist] wrapper ran once per cache event because the throttle sat inside it. Proven by a unit test (30 calls gave 30 log lines before, at most 2 after) and on the device (34 lines after start-up before, 2 after)."
  issue_2: "netOf leaves transfers and skipped lines out of count and net, so a day of only transfers reads 0 transactions $0. Proven on the device (Paid days 2026-11-16 and 2026-11-10 hold only transfer legs) and by a unit test."
  blind_spots: "The issue 2 fix was not seen on the device: someone cleared the app and signed in to another account during the run, so the transfer-only days were gone. Issue 1 cause unknown."

## Evidence

- timestamp: 2026-11-11
  checked: issue 4. expo-router build/layouts/withLayoutContext.js useFilterScreenChildren, and app/(app)/(tabs)/_layout.tsx
  found: the layout passes `{isTabAvailable('grow') ? null : <Tabs.Screen name="grow" .../>}`. Grow is now on, so that child is `null`. A node test shows React.Children.forEach calls its callback for a null child inside an array; expo-router's flattenChild then hits its fallback and warns "Layout children must be of type Screen". Seen twice in metro.log on a cold start.
  implication: root cause of issue 4 is the null child left behind when Grow was switched on (06-20).

- timestamp: 2026-11-11
  checked: issue 3. src/data/cache/persister.ts persistClient wrapper, @tanstack persist core and asyncThrottle, plus temporary logging of every query/mutation cache event on the device
  found: persist core calls persistClient on every cache event (about 140 at start-up here). Only the inner AsyncStorage write was throttled. The wrapper ran for every call: an overflow-row read, and in dev a full extra serialise (about 630 KB) just to print the `[persist]` line. After the start-up burst, the log kept printing one line about every second with no new cache events (bytes drifting by 3-4 each line), then stopped after 34 lines. It is a backlog draining, not an endless loop.
  implication: root cause of issue 3 is the throttle sitting below the wrapper instead of around it. A unit test with 30 quick calls printed 30 `[persist]` lines before the fix.

- timestamp: 2026-11-11
  checked: issue 2. src/engine/activity/groups.ts netOf and src/features/record/activity/activitySections.ts buildViewItems
  found: netOf skips rows with status 'skipped' (and transfers) when it counts and sums. buildViewItems groups the Skipped section by day with the same netOf, so every Skipped day header reads "0 transactions $0" even though skipped scheduled lines are drawn under it. The Skipped section comes straight after Paid, so it looks like it sits under Paid when its own header has scrolled off.
  implication: likely root cause of issue 2 (to confirm on device / in a test).

- timestamp: 2026-11-11
  checked: issue 2 on the device (Activity, Nov 2026, By day, Newest)
  found: the "0 transactions $0" headers sit under Paid on 2026-11-16 and 2026-11-10. Each day holds only the two legs of a transfer (for example "Transfer from Main Current $15" and "Transfer to Sync test -$15"). netOf leaves transfers out, so both days count nothing. The 11-16 legs are paid but dated in the future, so their chip reads "Scheduled"; that is why they looked like unpaid lines.
  implication: issue 2 root cause confirmed. The same thing happens for any day in the Skipped section and for transfer-only days in the Balance view.

- timestamp: 2026-11-11
  checked: issues 3 and 4 after the fixes (metro2.log, cold start, same account)
  found: 2 `[persist]` lines across 127 cache events at start-up, instead of 34 lines trickling out after the events stopped. No "Layout children must be of type Screen" warning.
  implication: the fixes for 3 and 4 work on the device.

- timestamp: 2026-11-11
  checked: issue 1. Six cold starts with Metro logs (metro.log, metro2.log x4, metro3.log), device logcat, and a search of the code for side effects in render (lazy useState, useMemo, ref set-up, .then(setX) outside effects)
  found: the warning never showed. Every async setState found runs inside a useEffect with a cancel flag. React only gives this warning for a component that rendered but never committed and then had its setState called later. Nothing in our code was found that hands out a setter during render.
  implication: not reproduced; cause unknown. It could be in a library, or tied to a state seen only once (first run after install, a Fast Refresh, or a sign-in in progress).

- timestamp: 2026-11-11
  checked: device logcat events during the run
  found: at 17:29 the app's data was cleared ("stop com.fincwin.app due to clear data") and at 17:44 a Google sign-in started. Neither was done by this session. The device now shows a different (GBP) household.
  implication: someone else was using the device. The issue 2 fix could not be seen on the device afterwards; it is covered by the unit test.

## Eliminated

- hypothesis: issue 2 is the Skipped section (skipped lines counted as 0)
  evidence: on the device the 0-count days are in Paid and hold only transfer legs. The Skipped section has the same flaw, and the fix covers both.
  timestamp: 2026-11-11

- hypothesis: issue 3 is an endless save loop (something changes the cache every second)
  evidence: logging every query and mutation cache event showed no events while the `[persist]` lines kept coming, and the lines stopped after 34. It was a backlog, not a loop.
  timestamp: 2026-11-11

## Resolution

root_cause: |
  Issue 4: app/(app)/(tabs)/_layout.tsx left a null child (`isTabAvailable('grow') ? null : <Tabs.Screen/>`) after Grow was switched on. expo-router visits it and warns.
  Issue 3: src/data/cache/persister.ts throttled only the inner write. Every cache event ran the wrapper, and in dev a full extra serialise of about 630 KB for the log, so the start-up burst drained as a log line about once a second.
  Issue 2: src/engine/activity/groups.ts netOf leaves transfers and skipped lines out of count and net (on purpose), but GroupHeader still printed "0 transactions $0" when a day held only such lines.
  Issue 1: not found; could not be reproduced.
fix: |
  Issue 4 (96b5e364): new pure tabRoutes() in src/shell/tabBar/availableTabs.ts returns one list with no gaps; the layout maps it to Tabs.Screen (hidden tabs get href null).
  Issue 3 (15ce8d67): throttleLatest() wraps the whole save (latest client wins, at most once per second); the base persister is no longer throttled twice. flushPersistedClient still saves at once (interval 0).
  Issue 2 (4318779a): GroupHeader shows and speaks the date only when the group counts nothing.
  Issue 1: no change. Owner question below.
verification: |
  Unit tests written red first: persister burst test (30 log lines before, at most 2 after), GroupHeader test (failed before, passes after), tabRoutes tests.
  jest: persister, persisterBudget, offlineRead, offlineWrite, decide queries (69 tests); src/shell/tabBar (110); GroupHeader, ActivityViews, ActivityScreen, activitySections (87). All pass.
  tsc --noEmit clean; eslint --quiet clean on changed files; depcruise: no violations.
  Device (Pixel 9): layout warning gone; persist lines 34 -> 2 on a cold start. Issue 2 seen before the fix; not re-seen after (device was cleared and switched account by someone else).
files_changed:
  - app/(app)/(tabs)/_layout.tsx
  - src/shell/tabBar/availableTabs.ts
  - src/shell/tabBar/__tests__/availableTabs.test.ts
  - src/data/cache/persister.ts
  - src/data/__tests__/persisterBudget.test.ts
  - src/features/record/activity/GroupHeader.tsx
  - src/features/record/activity/__tests__/GroupHeader.test.tsx

## Owner questions

1. Issue 1 (cold-start "hasn't mounted yet" warning): it did not come back in six cold starts. If you see it again, please copy the whole message from Metro, including the lines under it that start with "in" (they name the component). Without that, any fix would be a guess.
2. Issue 2: a day that holds only transfers now shows just its date. Would you rather it say how many transfers there are (for example "2 transfers")? That would need new copy.
3. Seen while checking issue 2: a paid transfer dated in the future (2026-11-16) shows a "Scheduled" chip under the Paid heading. Is that the wording you want for future-dated paid lines?
