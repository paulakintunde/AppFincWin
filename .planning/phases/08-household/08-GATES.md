# Phase 8: Gates and revision checklist

**Written:** 2026-11-11 (owner decisions). **Updated:** 2026-11-15 (revision round done, quick 261114-x0q, against main 318d6799). **Applies to:** every Phase 8 plan.

(Not the same as `08-PRECONDITIONS.md`, which plan 08-01 writes when it runs.)

Plans 08-28 and 08-29 (the household parts on Decide) moved to Phase 08.1 on 2026-11-11, so they can be re-planned on the new 06.1 screens. Phase 8 is now 28 plans and ends at wave 12. It gets one revision round after 06.1 (PR #102) merges. This file lists what must be true before certain steps, what the revision round must check, and where Phase 8 and 06.1 touch the same files.

## Gates (must be true before the named step)

- (a) 06.1 is merged to main AND its migration `20261111000100` is pushed to production (06.1 plan 31) before 08-27 or any `20261120*` push. Otherwise `supabase db push` refuses the older-dated file. **MET 2026-11-15:** 06.1 merged as PR #102 (2026-11-14) and `20261111000100` is in production (pushed 2026-11-12, owner OK, smoke-checked). The same rule now covers every migration on main dated before 20261120 (`20261113000100` 05.5 Band A, already in production; `20261114000100` from PR #118; `20261115000100` if PR #122 merges): 08-27 Task 1 checks `supabase migration list --linked` before pushing.
- (b) The Nightly run is green (Decide v3 invariants ownerRules / answer / safetyNet / depletion at 2,000 cases; it was red on 9-11 Nov) before the wave containing 08-25. **MET 2026-11-15:** scheduled Nightly runs on main were green on 13 Nov and 14 Nov (the 12 Nov scheduled run failed). Re-check the latest run before wave 12 starts.
- (c) 05.5's `countsForMe` rule and its contract tests exist before 08-25. Waves 1-11 do not need 05.5. **PENDING 2026-11-15:** 05.5 wave 1 is PR #116 (open). It adds `src/engine/month/countsForMe.ts`, the BO-07 contract todos and the frozen manifest `src/test/contracts/contractManifest.test.ts`. 08-25 Task 3 (the Home switch) also needs 05.5 wave 3 (PR #121, Home's "left after the month's plans" line); 08-25 stops at a checkpoint for that task if #121 is not on main.
- (d) No `package.json` bumps while 06.1 is in flight. **OBSOLETE 2026-11-15:** 06.1 merged (#102). Dependabot #97 was closed; its successor #114 is open. Land #114 before or after the Phase 8 plans that edit `package.json` (08-08, 08-17, 08-22), not while one of them is in flight.
- (e) Re-run `npm run supabase:preflight` after 08-22 touches `supabase/config.toml`.
- (f) Cache version (added 2026-11-15). `scripts/check-cache-version.mjs` fails CI when a cached shape changes without a bump. On main `CACHE_SCHEMA_VERSION` is '9'; PRs #121 and #122 each set it to '10'. 08-13 (wave 5) and 08-15 (wave 7) each add one to the value on the branch when they run (never assume 9) and refresh `scripts/cache-shape.lock.json`. 08-17 (wave 7) does not bump; if it finishes after 08-15, the orchestrator runs `npm run check:cache-version -- --update` once at the end of wave 7.
- (g) Migration dates (checked 2026-11-15). The newest migration on main is `20261114000100`; the newest in an open PR is `20261115000100` (#122). Phase 8's `20261120000100..20261120000900` still sort after all of them; no shift needed. (`20261120001000` and `20261120001100` belonged to 08-28 / 08-29 and are no longer Phase 8 files.) pgTAP: main tops out at `98_decide_rule_caps_copy` and #122 adds `98_category_icon_key`; Phase 8's 100-110 are free.

## Revision checklist (one round after 06.1 merges, against current main)

The plans were written from merge-base `0b7c97ae`, before Grow merged.

**DONE 2026-11-15** (quick 261114-x0q, branch `docs/08-revision`, against main 318d6799 after 06.1 #102 and 05.5 Band A #119). Outcome per item is in `.planning/quick/261114-x0q-phase-8-household-plan-revision-round/261114-x0q-SUMMARY.md`. Plans changed: 08-01, 08-05, 08-06, 08-07, 08-08, 08-09, 08-13, 08-15, 08-17, 08-19, 08-20, 08-25, 08-26, 08-27, 08-30, plus 08-PATTERNS, 08-VALIDATION, ROADMAP and 08.1-CARRY-OVER-08-29. Waves unchanged. The list below is kept as the record.

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

- `YouScreen` + `app/(app)/_layout.tsx`: 06.1-28 added about 20 decide routes (merged); Phase 8 touches them in 08-17, 08-22 (YouScreen) and 08-23, 08-24 (`_layout`).
- `src/i18n/locales/en.ts`: 08-12; 06.1 plans 29, 30, 33, 37.
- `jest.config.js`: 08-03, 08-08; 06.1-37.
- `package.json`: 08-08, 08-17, 08-22; Dependabot #114 (was #97).
- `src/ui/StateChip.tsx`: kept by 06.1 for 08-16 / 08-21.

## Open PRs that touch Phase 8 files (checked 2026-11-15)

From `gh api repos/{owner}/{repo}/pulls/N/files` (full lists, not the 100-file cap of `gh pr view --json files`). After each of these lands on main, re-check the file refs and line numbers in the named plans before they run. None of them changes a Phase 8 wave.

| PR | What | Phase 8 plans whose `files_modified` it also changes |
|---|---|---|
| #122 06.2 App life (356 files: own icons, status cues, spacing, calm motion) | Adds migration `20261115000100_category_icon_key.sql`, which re-issues `apply_patches` (then 08-05 copies that body and keeps its icon_key lines); sets `CACHE_SCHEMA_VERSION` to '10'; touches `package.json` and `.github/workflows/ci.yml` | 08-05 (apply_patches base), 08-07 (`exportManifest.ts`, `ci.yml`), 08-08 (`package.json`), 08-12 (`i18n/locales/en.ts`), 08-13 (`exportManifest.ts`; cache bump base), 08-15 (`db/rows.ts`, `exportManifest.ts`; cache bump base), 08-17 (`package.json`, `package-lock.json`, `YouScreen.tsx`), 08-19 (`TransactionSheet.tsx`, `ActivityRow.tsx`, `TransactionDetailSheet.tsx`), 08-20 (`AccountSheet.tsx`), 08-22 (`YouScreen.tsx`, `package.json`), 08-25 (`HomeScreen.tsx`). It also touches about 55 files under `src/ui/` that Phase 8 screens use (08-16, 08-17, 08-19, 08-21) |
| #120 05.5 wave 2 (200 files: month model move, input-builder parity, Band A, lint and coverage gates) | Adds `src/engine/month/picture.ts` and `model/*` (the month picture) | 08-03, 08-08 (`jest.config.js`); 08-30 (the month picture must skip settlement rows if #120 lands first) |
| #121 05.5 wave 3 (274 files: one calendar and bill detector, Home left-after line, shared pay form, old settings columns unread) | Home's "left after the month's plans" line; sets `CACHE_SCHEMA_VERSION` to '10'; stops reading `share_pct` | 08-03, 08-08 (`jest.config.js`), 08-07, 08-13, 08-15 (`exportManifest.ts`), 08-12 (`en.ts`), 08-25 (`HomeScreen.tsx`; also `ThisMonthCard.tsx` and `useHomeViewModel.ts`, which 08-25 now lists) |
| #116 05.5 wave 1 (51 files: countsForMe, BO-07 contracts, copy guard, purity lint) | Gate (c) | No shared files. 08-25 and 08-30 switch on its contract todos in `src/engine/household/__tests__/` |

## Owner questions from the revision round (2026-11-15) — answered 2026-11-15

1. **Home Mine / Household switch: which figure does it move?** 05.5 D-19 keeps Home's big figure as `monthPosition` "left after everything" and adds a small "left after the month's plans" line. 08-25 builds the switch on the small line (as asked) and, until you say otherwise, also runs the big figure through `countsForMe` in both scopes, because after Phase 8 Activity rows include other members' shared lines at their full amount. Options: (a) the switch moves both figures (current plan); (b) the switch moves only the small line, and the big figure always shows "mine". **Owner answer: (a), both figures move.**
2. **Can a debt payment line or a goal contribution line be shared?** D-13 has no exception. After 08-05, a line can only be linked to its creator's own debt or goal, but if the creator then shares it and names someone else as payer (D-18), that person's amount edit moves the creator's debt balance. Options: (a) allow it (current plans; the debt stays the creator's and only the line is seen); (b) 08-10's `share_transaction` refuses lines with `debt_id` or `goal_id` set, with a plain message. **Owner answer: (b), debt and goal payments stay personal.** Done in 08-10 (`linked_line_personal`; series, bulk and joint-account auto-share covered).

## Moved out of Phase 8

- 08-28 -> `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-08-28.md`
- 08-29 -> `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-08-29.md`
- Grow's "Create from Decide" follow-up -> 08.1.

## 05.5 handoff (2026-11-14)

Written by plan 05.5-06. Source: `.planning/phases/05.5-one-shared-money-model/05.5-GATE.md` and `05.5-CONTEXT.md` (D-09, D-21).

1. **Gate (e): push order.** 05.5 Band A, `20261113000100_decide_rule_caps_to_categories.sql`, is pushed before 08-27 or any `20261120*` push. If `npx supabase migration list --linked` already shows any `2026112*` applied, Band A is re-dated to the next minute after the latest applied file (05.5-GATE.md records the new name). Add Band A to the 08-27 gate list. Phase 8's `20261120000100..000900` push second; 05.5 Band B (`20261121000100`, `20261121000200`, `20261121000300`) pushes last, after the 05.5 release is installed.
2. **share_pct removal moved to 05.5.** Phase 8's planned migration `20261120001100_decide_settings_share_from_household.sql` and pgTAP `112_*` are no longer Phase 8 or 08.1 work. 05.5 Band B `20261121000300` drops `decide_settings.share_pct` (with `safety_net_protect`, `safety_net_size`, `safety_net_locked`). Household's share rules start clean. `08.1-CARRY-OVER-08-29.md` carries the matching note. Phase 8 `20261120001100` is not used. Confirm the ROADMAP Phase 8 success criterion 9 wording (the share_pct part) in the revision round.
3. **Where the plugs live.** `countsForMe` is at `src/engine/month/countsForMe.ts`. The BO-07 contract tests are the todo files `src/engine/month/__tests__/bo07.*.contract.test.ts`. When 08-25 turns a todo on, it keeps the exact test title, because 05.5's frozen manifest (`src/test/contracts/contractManifest.test.ts`) pins the titles.
