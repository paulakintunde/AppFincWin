# Decide reads: measurement and Home's reader (05.5-09, APP-08 steps 1-2)

Measured by `src/data/queries/__tests__/decideReads.count.test.tsx`: one `DecideV3Scope` is mounted inside a real React Query client (the app's 60 s default stale time) over a recording Supabase client that counts every `.from(table)` and `.rpc(name)` call. The household and sign-in reads are mocked, so they are not counted. These are jest counts, not device numbers. No phone or Metro run was used.

## Before

"Before" is the Decide scope with no Decide stale window, that is, with `DECIDE_READ_STALE_MS` set to the app default of 60 s (a temporary edit, reverted), then unmounted, aged two minutes, and mounted again.

| Case | Reads |
|---|---|
| First mount | 23 |
| Second mount after two minutes | 22 of 23 refetched (every read except the FX rates, which have their own one-hour window) |

## After (the code as it stands at this plan's base)

Phase 06.1 (plans 46, 72 and 78) had already put `staleTime: DECIDE_READ_STALE_MS` (5 minutes) on every Decide-scope read and on the record-context reads the scope provides. The harness found no read left without one, so this plan changed no query code and no key (`git diff origin/main -- src/data/keys.ts` is empty). It added the harness so the 0 stays true.

| Case | Reads |
|---|---|
| First mount | 23 over 19 tables |
| Second mount, straight away | 0 |
| Second mount, entries aged two minutes (past 60 s, inside 5 min) | 0 |
| `transactionsRoot(household)` invalidated | 5: `transactions_active` x2, `account_balances`, `statement_periods_live`, `sample_data_exists` (the settings, checks, answers, links, categories, debts, goals and the rest are not touched) |

First-mount table list (pinned in the test):

| Table or rpc | Calls | Read |
|---|---|---|
| profiles | 3 | money prefs, record prefs, region subdivision (three column sets, three keys) |
| households | 1 | household id |
| rpc sample_data_exists | 1 | record context |
| transactions_active | 2 | history window (12 months back to month end) and upcoming (month after, 120 months) |
| accounts | 1 | accounts |
| rpc account_balances | 1 | balances |
| recurring_series | 1 | plans |
| rpc fx_latest_rates | 1 | stored rates (one-hour window) |
| categories | 1 | categories |
| custom_currencies | 1 | custom currencies |
| decide_settings | 1 | Decide settings |
| debts | 1 | debts |
| savings_goals | 1 | goals |
| statement_periods_live | 1 | statement periods |
| decide_changes | 1 | changes |
| decide_checks | 1 | checks |
| decide_links | 2 | plan links and payment links |
| decide_answers | 1 | answers |
| recurring_dismissals | 1 | dismissals |

Rows are read in full windows (`transactions_active` for 12 months plus the upcoming window). Most readers use a columns constant already. Narrowing those windows is a separate decision and is not part of this plan.

Changed keys: none. Changed stale times: none (already set by 06.1).

## Home reader (D-19)

Home's small line reads leftAfterPlans through useDecideV3's existing query keys (no new key). Current month only. Past, empty, loading, error or offline months hide the line. When Home mounts before Decide, the scope's reads run once and are then shared.

Measured: a scope mounted first reads 23 times and a second mount of it reads 0 times, inside 5 minutes. Home's own existing Activity reads are unchanged and extra to these. Wiring the line is a later plan (05.5-14); this plan records the choice only.
