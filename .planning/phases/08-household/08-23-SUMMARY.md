---
phase: 08-household
plan: 23
subsystem: realtime
tags: [supabase-realtime, tanstack-query, postgres_changes, reconcile, household]
requires: [08-08, 08-14, 08-15]
provides:
  - "Migration M9 (20261122000900): settlements, settlement_lines, household_former_members, member_departures join the supabase_realtime publication"
  - "applyRealtimeEvent: one event to one cache action, through reconcileEvent"
  - "useHouseholdRealtime: one channel per household, refetch on every (re)subscribe, foreground and return online"
  - "realtimeStatus store and the Live updates paused line on SyncStatusLine"
affects: [08-24, 08-25, 08-26]
key-files:
  created:
    - supabase/migrations/20261122000900_household_realtime_tables.sql
    - src/data/realtime/applyEvent.ts
    - src/data/realtime/channel.ts
    - src/data/realtime/useHouseholdRealtime.ts
    - src/data/realtime/realtimeStatus.ts
    - src/data/realtime/__tests__/applyEvent.test.ts
    - src/data/realtime/__tests__/channel.test.ts
  modified:
    - supabase/tests/database/104_household_realtime_publication.test.sql
    - tests/realtime/harness.ts
    - tests/realtime/twoClients.realtime.test.ts
    - jest.realtime.config.js
    - src/ui/SyncStatusLine.tsx
    - src/ui/__tests__/SyncStatusLine.test.tsx
    - app/(app)/_layout.tsx
    - src/i18n/locales/en.ts
decisions:
  - "A row event is never inserted into a cache from the payload alone (column grants can make it partial); an uncached row refetches its month, a cached row is merged over."
  - "DELETE events carry keys only, so any DELETE refetches the affected reads and trusts nothing in the payload."
  - "The client library re-joins a dropped channel with its own backoff; the hook shows paused and refetches on the next SUBSCRIBED rather than running a second retry loop."
metrics:
  tasks: 2
  commits: 2
---

# Phase 8 Plan 23: Realtime wiring Summary

Shared changes now arrive live: one channel per household, patched into the TanStack cache through the 08-08 reconciler, with a full refetch after every (re)subscribe, app foreground and return online.

## Commits

- 282b227e feat(08-23): publish settlements, lines, departures; apply realtime events through the reconciler (Task 1)
- 6ea80018 feat(08-23): household channel lifecycle, refetch on resubscribe, paused status line, spike h and i (Task 2)

## What was built

- **M9** adds `settlements`, `settlement_lines`, `household_former_members` and `member_departures` to `supabase_realtime` (guarded do-block, same as M3). Not published, and commented why: `transaction_splits` (a split change bumps the published parent row), `household_split_defaults` (changes arrive as household_events), `settlement_nudges` (no client access), `household_invites` (codes).
- **pgTAP 104** now has 33 assertions (was 21): the four new tables are published; splits, defaults, nudges and invites are not; no client hard-delete on settlements or settlement lines; anon cannot read settlements or departures.
- **applyEvent.ts**: transactions and accounts go through `reconcileEvent` (drop echoes and stale events, hold while a pending or paused mutation names the row, apply otherwise by merging over the cached row, removing a soft-deleted row, or refetching the month of an uncached row). Settlements, lines, former members and departures refetch their reads. household_events by kind: `made_private` removes the line from every cached list; member kinds refresh members and detail; `removed` or `left` naming the viewer calls `resetHouseholdScope`; split kinds refresh defaults and balances; settle kinds refresh settlements. Events for another household are dropped.
- **channel.ts / useHouseholdRealtime.ts**: `supabase.channel('household:<id>')` with seven `postgres_changes` listeners (`household_id=eq.<id>`), effect keyed on household and viewer, `removeChannel` in cleanup and in a `realtime-channels` wipe handler (sign-out, account deletion). Refetch on every SUBSCRIBED, on AppState active and on onlineManager online; `realtime.setAuth` on TOKEN_REFRESHED. No channel for a household of one.
- **SyncStatusLine** shows "Live updates paused. Reconnecting." (`sync.livePaused`) while the status is paused.
- **Layout** mounts the hook once through `HouseholdRealtimeHost` in `app/(app)/_layout.tsx`.
- **Spike** scenarios h (A's split change reaches B as a higher-version UPDATE) and i (a settle-up proposed by A reaches B and not third member C).

## Verification

- pgTAP: `db reset` then `supabase test db`: Files=110, Tests=2931, Result: PASS (was Files=110, Tests=2919; the 12 new tests are 104's). 104 ok.
- Spike `npm run test:realtime`: 9 of 9 pass (a to i). Observed latency 1.0 to 1.6 s on this slow machine, cold start 4.7 to 8.4 s.
- Client: `tsc --noEmit` exit 0; jest src/data/realtime (29 tests), SyncStatusLine (11); eslint clean on touched files. There is no queryClient test file in the repo; `queryClient.ts` was not changed (the channel module registers its own wipe handler).

## Deviations from Plan

1. **[Carry-in, plan conflict] settlement_lines is published.** The plan body and T-08-84 say settlement lines are not published (hard deletes broadcast ids); the carry-in from 08-11 and the task instructions say to publish them. Followed the carry-in. Cascade deletes of lines (and of former-member and departure rows on account deletion) broadcast bare uuids only, never amounts or names; recorded in the migration comment for the DPIA (08-26). Applied as: any DELETE refetches.
2. **[Follow-up from 08-14] household_former_members and member_departures published** (not in the plan). Their client select grants are column-limited; Realtime delivers only granted columns (verified by subscribing to both locally).
3. **[Rule 3] Spike fixture drift.** Since 08-14 a joint account shares every line on insert, so scenarios b and c (personal line, flip to personal) used a joint account and saw a shared line. They now use a non-joint account owned by A. Scenario c's wait widened from 2000 to 6000 ms and the beforeAll timeout raised to 120 s because this machine is slow (`supabase status` alone takes about 100 s, so the harness also accepts `SPIKE_URL`, `SPIKE_ANON`, `SPIKE_SERVICE` for the local stack). Nothing weakened: the privacy assertions are unchanged.
4. **[Rule 3] Realtime container restart.** After `supabase db reset` the local Realtime container did not pick up the publication change until it was restarted. Hosted Realtime is not restarted by a push; check once after the production push (see 08-27 steps).
5. **[Plan variance] No separate retry loop and no splits key.** supabase-js re-joins a dropped channel itself, so the hook only reflects status and refetches on the next SUBSCRIBED. There is no cached "splits" read to invalidate (splits ride on the transaction row), so a version increase invalidates balances and settlements instead.
6. **pgTAP 76 flake.** One full run failed 76 cases 8 and 9 (blocked versus refused); the file passed alone and on the next full run. A full run on a database that the spike had used also failed (the suite expects an empty database); results below are from a fresh `db reset`.

## Known Stubs

None.

## Self-Check: PASSED
