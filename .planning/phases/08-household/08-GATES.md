# Phase 8: Gates and revision checklist

**Written:** 2026-11-11 (owner decisions). **Applies to:** every Phase 8 plan.

(Not the same as `08-PRECONDITIONS.md`, which plan 08-01 writes when it runs.)

Plans 08-28 and 08-29 (the household parts on Decide) moved to Phase 08.1 on 2026-11-11, so they can be re-planned on the new 06.1 screens. Phase 8 is now 28 plans and ends at wave 12. It gets one revision round after 06.1 (PR #102) merges. This file lists what must be true before certain steps, what the revision round must check, and where Phase 8 and 06.1 touch the same files.

## Gates (must be true before the named step)

- (a) 06.1 is merged to main AND its migration `20261111000100` is pushed to production (06.1 plan 31) before 08-27 or any `20261120*` push. Otherwise `supabase db push` refuses the older-dated file. **Status 2026-11-12:** the production half is met (06.1 plan 31 pushed `20261111000100`, owner OK, smoke-checked). Still waiting on the 06.1 merge to main.
- (b) The Nightly run is green (Decide v3 invariants ownerRules / answer / safetyNet / depletion at 2,000 cases; it was red on 9-11 Nov) before the wave containing 08-25.
- (c) 05.5's `countsForMe` rule and its contract tests exist before 08-25. Waves 1-11 do not need 05.5.
- (d) No `package.json` bumps while 06.1 is in flight. Dependabot #97 lands before or after 06.1, not during.
- (e) Re-run `npm run supabase:preflight` after 08-22 touches `supabase/config.toml`.

## Revision checklist (one round after 06.1 merges, against current main)

The plans were written from merge-base `0b7c97ae`, before Grow merged.

- 08-05: the `apply_patches` base is the latest body at build time (06.1's `20261111000100` adds the `decide_may_use` system key, `decide_check_history`, and the `holdings` / `holding_lots` entities). Never use the Grow "v3" excerpt in 08-PATTERNS.
- 08-05 bypass list + 08-07 two-user suite: check each Grow / 06.1 server function against "personal unless shared" and add those that need it: `record_debt_one_off`, `record_debt_sale`, `remove_debt`, `remove_goal`, `save_debt_plan`, `save_goal_plan`, `confirm_goal_contribution`, `debt_balance_follows_line`, `materialise_series`, `grow_end_series`, `grow_stop_series_for_removal`, `set_safety_net`, `sync_holding_value`, `seed_holding_value`, `guard_transaction_debt`, `guard_goal_line_paid`, `set_net_answer_use`.
- 08-06 and 08-07 table lists: add `decide_check_history` (06.1) and `debt_line_applied` (Grow); confirm `holdings` and `holding_lots` are classified. Reconcile 08-06 with the Grow-changed `supabase/tests/database/58_decide_depth_tables.test.sql`.
- 08-30: if 05.5's "one month picture" lands first, build on it; whichever lands second keeps "settlements excluded". 08-25's HomeScreen edit overlaps 05.5 success criterion 2.
- Re-read 08-15, 08-19, 08-20, 08-30 against Grow's changes: TransactionSheet, ActivityRow, AccountSheet, db/transactions, db/rows, useActivityViewModel, data/queries/activity.ts, exportManifest (+ test), data/keys, failedWriteLabels, mutations/index.
- Trim references to the moved plans: 08-27 (the line saying 08-28 and 08-29 reuse its push procedure, and the 08-25 -> 08-28 -> 08-29 chain) and 08-25 (its ordering note about the gated chain). No remaining plan has 08-28 or 08-29 in depends_on.
- ROADMAP Phase 8 success criteria 8 and 9 (partner opt-in; share_pct part) now land with the carried-over work in 08.1 / 05.5; confirm the wording in the revision round.

- From 06.1 (2026-11-12), for any plan that copies the latest bodies:
  - `apply_patches` (`20261111000100`) adds `decide_may_use` as a `savings_goals` system key (boolean).
  - `record_decide_outcome('wait')` no longer limits the goal target to at most the price (owner decision). The wait goal is created locked, with `check_id` set and `up_front_only` for instalment checks. 08-05 references `record_decide_outcome`, so copy the 06.1 body, not an older one.
  - App cache: `SAVINGS_GOAL_COLUMNS` now selects `decide_may_use`, and `CACHE_SCHEMA_VERSION` is 9. Any Phase 8 change to a cached row shape bumps it from 9.

## Shared-file merge notes

- `YouScreen` + `app/(app)/_layout.tsx`: 06.1-28 adds about 20 decide routes; Phase 8 touches them in 08-17, 08-22, 08-23, 08-24.
- `src/i18n/locales/en.ts`: 08-12; 06.1 plans 29, 30, 33, 37.
- `jest.config.js`: 08-03, 08-08; 06.1-37.
- `package.json`: 08-08, 08-17, 08-22; Dependabot #97.
- `src/ui/StateChip.tsx`: kept by 06.1 for 08-16 / 08-21.

## Moved out of Phase 8

- 08-28 -> `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-08-28.md`
- 08-29 -> `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-08-29.md`
- Grow's "Create from Decide" follow-up -> 08.1.
