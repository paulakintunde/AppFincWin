# Phase 8 production push log

**Date:** 2026-11-17
**Approved by:** the owner, in an AskUserQuestion popup in this session. Task 1 answer: approve.
**Branch / HEAD:** phase/08-household @ 294fd792 (worktree C:/dev/fincwin-hh). Local only, linked for this step with owner approval.
**Supabase CLI:** 2.117.0
**Project:** cohmcbdfgqmiwykztrdg (Fincwin United, production)

## Before the push

- Preflight passed: `supabase:preflight` with SUPABASE_PREFLIGHT_ENV_FILE pointing at the main checkout's env file. The ref matches config.toml.
- `migration list --linked`: every migration through 20261121000300 (05.5 Band B) was applied remotely. None of the 20261122* migrations were.
- Owner's read-only SQL checks were both fine: no household over 6 members, and the null created_by counts.
- `db push --dry-run` listed exactly the nine Phase 8 migrations.
- The 08-26 phase gate was green. Full jest and pgTAP also passed again after merging Band B and finishing 08-25.

## Applied

- 20261122000100_household_privacy_wave1.sql
- 20261122000200_household_members_v2.sql
- 20261122000300_household_privacy_rpcs.sql
- 20261122000400_household_realtime.sql
- 20261122000500_household_invites.sql
- 20261122000600_household_splits.sql
- 20261122000700_household_settlements.sql
- 20261122000800_household_leave_remove_delete.sql
- 20261122000900_household_realtime_tables.sql

Result: "Finished supabase db push." with no errors. `migration list --linked` shows all nine applied remotely.

## Function

`delete-account` was deployed as version 1, status ACTIVE, verify_jwt true. No new secrets; it uses the standard injected values.

## Checks after the push (read-only `db query --linked`)

| Check | Result |
|---|---|
| supabase_realtime publication includes settlements, settlement_lines, household_former_members, member_departures | all four present |
| is_shared true on transactions / accounts / recurring_series | 0 / 0 / 0 |
| null created_by (transactions + accounts + recurring_series) | 0 |
| households with more than 6 members | 0 |
| members with no colour_key + households with no name | 0 |
| `hh_before_user_delete` trigger on auth.users | exactly 1 |
| decide_settings.share_pct column | 0 (gone) |

## Still to do in 08-27

- Two-account check that live events arrive on the hosted project. If none arrive, restart Realtime from the dashboard.
- Throwaway-account deletion test in the app.
- Real-device sign-off (Task 3) on a build that includes expo-clipboard.
