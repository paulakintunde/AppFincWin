---
phase: 06-grow
plan: 29
subsystem: database
tags: [supabase, production, migration]
requires: [06-25]
provides: [record_debt_one_off and net_confirmed_at live in production]
key-files:
  created: []
  modified: []
completed: 2026-11-10
---

# Phase 6 Plan 29: Grow production push 2

Migration `20261106000400_grow_debt_one_off_and_net_confirmed.sql` is applied to production (`Fincwin United`, ref in `.env.local`), with owner approval.

## Stop rules (all clear before the push)

| Rule | Result |
|------|--------|
| a. CI `supabase test db` green on the latest commit with test 94 | Pass: run 42876703639 on a5f360d4. `rls` job: Files=94, Tests=2133, Result: PASS, including `94_grow_debt_one_off_and_net_confirmed.test.sql`. The `checks` job was also green. |
| b. Dry run lists exactly 000400 | Pass: only `20261106000400_grow_debt_one_off_and_net_confirmed.sql` |
| c. `npm run supabase:preflight` | Pass: the ref matches `config.toml` and `SUPABASE_PROD_PROJECT_REF` |
| d. Live migrations 000100-000300 unchanged since 6d0f5c24 | Pass: `git diff 6d0f5c24 HEAD` on the three files is empty |

## Push

- Owner reply: "Push approved" (2026-11-10).
- Pushed at 2026-11-10T19:06Z from `C:\dev\fincwin-g6`: the preflight ran first, then `supabase db push`. The preflight read the main checkout's env file through `SUPABASE_PREFLIGHT_ENV_FILE`.
- After the push, `supabase migration list --linked` shows 20261106000400 as both local and remote. A fresh dry run says "Remote database is up to date."

## CI fixes needed before rule a cleared

The previous CI runs failed on application tests, not on the migration:

- **Approved goal cases.** GL-01..05 entered the cross-check, the rule list and the revision lock. To fix this:
  - plain.ts now restates D-05/D-22;
  - D-05 and D-06 are in the rule list, and FIN-16 is marked as another layer's;
  - DECIDE_ENGINE_REVISION went from 05.4.1 to 06.1, with the lock rewritten.
- **Grow screen tests.** These broke after 06-31 and 06-33 made the screens read their own rows:
  - the tests gained the missing mocks;
  - six screens now import `useGoalMoney` from `home/useGoalMoney.ts` instead of through `GoalsSegment`.

## Deviations

None to the migration.

## Self-Check: PASSED
