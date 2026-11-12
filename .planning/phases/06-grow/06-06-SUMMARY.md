---
phase: 06-grow
plan: 06
subsystem: database
tags: [supabase, postgres, pgtap, grow, goals, safety-net, recurring-series]
requires: [06-04, 06-09]
provides:
  - recurring_series.goal_id and materialise_series tagging Expected lines with the goal
  - save_goal_plan, confirm_goal_contribution, set_safety_net RPCs
  - D-07 one-off copy of Decide safety-net settings into a flagged goal
affects: [06-07, 06-10, 06-11, 06-21]
key-files:
  created:
    - supabase/migrations/20261106000200_grow_goal_contributions_and_safety_net.sql
    - supabase/tests/database/90_grow_safety_net_migration.test.sql
    - supabase/tests/database/92_grow_goal_plan.test.sql
  modified: []
key-decisions:
  - "A goal contribution series stores its amount as -abs(p_series.amount): the client sends a positive monthly figure."
  - "D-07 links reserve_account_id only where the old reserve is not null (06-05 parity finding); size 0 reads as no target."
  - "Ownership guards compare to the stamped created_by (guard_series_goal), not auth.uid() alone (06-04 CI fix)."
requirements-completed: [GRW-01, GRW-02, GRW-03]
completed: 2026-11-06
---

# Phase 6 Plan 06: Goal contributions and the safety net Summary

One migration links a repeating series to a goal and adds three atomic RPCs (save_goal_plan, confirm_goal_contribution, set_safety_net), plus the idempotent D-07 copy of every tester's safety-net settings into their one flagged, Locked goal.

## Tasks

| Task | Commit | Result |
| --- | --- | --- |
| 1. Part A: series goal link, materialiser, save_goal_plan, confirm_goal_contribution | df4579b3 | lint OK |
| 2. Part B: set_safety_net, D-07 data step, column comments | 6f61dae6 | lint OK |
| 3. pgTAP 90 (20 assertions) and 92 (68 assertions) | f8ce159b | NOT run locally |

## Verification status

- `npm run lint:migrations`: passed (77 files).
- pgTAP 90 and 92: **not verified locally** (no Docker). The CI `rls` job is the gate; the files have never executed, so expect to fix test-fixture slips on the first CI run.
- No `db push`, no `link`, no Supabase MCP use. STATE.md and ROADMAP.md untouched.

## What was built (facts the next plans need)

- `recurring_series.goal_id` (FK set null), partial unique `recurring_series_one_goal_contribution` (one live open contribution per goal), trigger `guard_series_goal` (42501, compares goal owner to stamped `created_by` or `auth.uid()`). `materialise_series` re-created from 20261010000300 with only the two `-- 06` lines; grants re-issued (service_role only).
- Helpers (not client callable): `grow_check_undo_step`, `grow_store_step`.
- `save_goal_plan(p_goal, p_expected_version, p_series, p_undo_step)`: insert when version null (kind pot, bucket null), else patch of name, target, ready_by, monthly_amount, opening_saved, account_id, locked, protect, up_front_only, icon, color_key. `is_safety_net` is honoured on insert only (label `safetyNetSizeSaved`), never on edit. Labels: `goalMade`, `safetyNetSizeSaved`, `goalPlanChanged`; any other key is 22023. p_series null ends the live contribution (end_date = day before the next unpaid Expected line, `end_reason` 'stopped'; or soft-deletes the series if nothing has fallen due); object starts it (materialised at once) or updates amount, account, name, anchor via `edit_recurring_series_from`. Returns `goal_version`, `series_id`, `series_version`, `undo_step_id`. Not-yours goal 42501; stale or missing goal `conflict`.
- `confirm_goal_contribution(p_transaction_id, p_expected_version, p_in_leg, p_undo_step)`: label `goalContributionConfirmed`. Two legs (in-leg on the goal's account, shared transfer_id, out-leg goal_id cleared) when the goal has an account different from the line's and the same currency; otherwise the single line becomes paid and keeps its goal tag. Row version after = expected + 1; in-leg version 1; both returned for the client's undo ops. Non-pending line 22023.
- `set_safety_net(p_goal_id, p_expected_versions, p_undo_step)`: label `safetyNetChanged`; un-flags the old net first, then flags the target Locked and protected under row locks; writes a server-built undo step (`allow_system_keys`) that un-flags the target (restoring its earlier locked/protect) and then re-flags the old net. Returns applied / unchanged / conflict / already-applied; 42501 for another member's goal; 22023 for deleted or non-pot goals.
- D-07 data step: insert-select where the owner has no live flagged goal; household = the user's earliest membership; currency = settings currency, else profile home currency, else USD; `account_id` only when `reserve` is not null and the account is in that household. Matches `migrateSafetyNetRow()`. A `raise notice` reports the count of `safety_net_locked = false` rows for the push task (plan 11).
- Interim `decide_settings` columns kept and commented for later removal; nothing dropped or renamed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Wording of the column comments.** The plan's comment text contains `min_supported_version`, which the migration linter reports as an unrecognised floor-bump warning. The comments say "minimum supported app version bump" instead.

**2. [Rule 2 - Correctness] Helper functions and extra checks.** Added `grow_check_undo_step` and `grow_store_step` (shared undo-step validation, revoked from all roles), and a household/ownership check on the goal inside `confirm_goal_contribution` (not only the line's household).

**3. Choices the plan left open (documented, not asked).**
- p_series.amount is accepted as a positive monthly figure (a negative is also accepted) and stored negative. If the client sends a positive-signed series amount expecting it stored as-is, confirm will fail the pair check; the 06-21 client should send the magnitude.
- A size of 0 in `safety_net_size` becomes a null target (goal target must be at least 1).

## Notes for plan 11 (push) and others

- **Production check before push:** `savings_goals_pot_shape` (06-04) still needs the check for bucket pots carrying a `ready_by`. This plan touches no such rows.
- The D-07 insert runs at push time on production; the push task should read the NOTICE for the `safety_net_locked = false` count.
- Wave-3 siblings (06-07 migration 20261106000300, 06-10, 06-21) touch other files; nothing here conflicts.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (all seven dispositions implemented; T-06-06-06 swap order and index, T-06-06-07 label spoofing 22023).

## Self-Check: PASSED

Files exist (migration, 90, 92); commits df4579b3, 6f61dae6 and f8ce159b exist; lint passes. pgTAP not run locally.

## Follow-up: undo gaps closed (before the Grow push)

Two Undo gaps fixed in place (none of 20261106000100/200/300 had been pushed). pgTAP not run locally (no Docker); the CI `rls` job is the gate.

**Gap 1: Undo of a new goal left its contribution behind** (commit 88681253).
- `save_goal_plan` now builds its own undo step from what it wrote. `p_undo_step` is `{ id, label_key, label_params }`; any ops a client sends are ignored (`grow_check_undo_step(..., false)`). Labels, the 22023 refusal of a wrong label, already-applied and conflict are unchanged.
- Insert: the new contribution series is soft-deleted (undo_replay takes its untouched Expected lines with it), then the goal. A new safety net (`safetyNetSizeSaved`) is un-flagged, then deleted, because the guard refuses removing a flagged goal; only that step is stored with `allow_system_keys` (`is_safety_net` is a system key). Before this, Undo of a new safety net was refused.
- Edit: the series change is reversed (a stopped series runs again with its lines; a deleted one comes back with its lines; an edited one gets its old fields and lines back; a new one goes), then the goal's 11 plan fields are put back.
- Stopping a contribution now ends the series in ONE statement (`edit_recurring_series_from` with `end_date` and `end_reason`, effective the day after the end), not `end_recurring_series` plus a separate `end_reason` update. Same rows end up soft-deleted.
- `confirm_goal_contribution` builds its undo from the branch it actually took (pair: delete the in-leg, then put the line back to Expected, unpaired, with its goal tag; single: back to Expected). The client could not know for sure which branch the server would take, so this is more reliable. `grow_store_step` now takes the ops as an argument.
- pgTAP 92 (68 -> 95): new goal with a series then Undo (goal, series and every Expected line gone); plan change then Undo (fields, series amount, old lines back); stop then Undo (series runs again, every line back); B's net creation Undo chained after Undo of a later size edit; Undo of the paired confirmation.

**Gap 2: chained Undo after a system step was refused** (commit 93fa56da, see 06-04).
- Real. Undo of an `allow_system_keys` step replays under `fincwin.system_restamp`, and `bump_version` does not bump under it. `undo_adjusted_ops` assumed every later undone step moved its rows by 2 per op, so "edit, system step, Undo, Undo" expected +2, found +1 and refused.
- `undo_adjusted_ops` re-issued in 20261106000100 (`-- 06` lines): an undone system step counts 1 per row, a `monthAdded` step 0, a client step still 2 per op. The raised value is still used only on an exact match.
- `grow_end_series` (06-07) now sets `end_date` and `end_reason` in one statement, so a series ended by `save_debt_plan` or `record_debt_sale` moves one version, matching the count.
- pgTAP 93 (44 -> 56): edit debt, save plan, Undo plan, Undo edit; Undo of the first plan after the second plan (which ended its series) was undone.

**Client contract:** changed for `save_goal_plan` and `confirm_goal_contribution` (see 06-12 Follow-up).
