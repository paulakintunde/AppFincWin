---
phase: 06-grow
plan: 07
subsystem: database
tags: [supabase, plpgsql, rpc, debts, undo, pgtap]
requires: [06-04, 06-09]
provides:
  - public.save_debt_plan (payoff order + extra, Expected extra series, one undo step)
  - public.record_debt_sale (sale in, final payment out, paid-off, series ended, one undo step)
affects: [06-21 Grow calc UI, 06-11]
key-files:
  created:
    - supabase/migrations/20261106000300_grow_debt_plan_and_sale.sql
    - supabase/tests/database/93_grow_debt_plan_and_sale.test.sql
decisions:
  - "Payoff series end on the payoff date itself (not the day after); remaining pending rows after it are deleted by end_recurring_series"
  - "Undo of a plan save restores series and payoff_order only; payoff_extra / extra_series_id are not in apply_patches' debts allowlist"
metrics:
  tasks: 2
  completed: 2026-11-06
---

# Phase 6 Plan 07: Debt plan and sale RPCs Summary

Two atomic security-definer RPCs for Grow debts: `save_debt_plan` and `record_debt_sale`, each one transaction and one undo step, with pgTAP 93 as the CI gate.

## What was built

- `save_debt_plan(p_debt_id, p_expected_version, p_extra, p_order, p_series, p_undo_step)`: validates the label key (`debtPlanSaved` only, else 22023), extra bounds and order, household membership (42501), replay (`already-applied`) and version (`conflict`). With extra > 0 it keeps or replaces a monthly Expected extra-payment series (same amount on a running series is left alone; otherwise the old series ends before its next unpaid occurrence and a new one is created via `create_recurring_series`). With extra 0 it ends the series and nulls `extra_series_id`.
- `record_debt_sale(p_debt_id, p_expected_version, p_sale, p_payment, p_undo_step)`: label `debtSaleRecorded` only. Inserts the sale (money in) and the final payment (money out, negative), both paid. A payment at or above the balance sets balance 0, `paid_off_on`, and ends the debt's payment series and extra series with `end_reason 'stopped'`; a smaller payment leaves the debt open with the rest owed. `p_payment` null records the sale only.
- Helpers (no client execute): `grow_check_undo_step` (record_decide_outcome validation pattern) and `grow_end_series` (sets end_reason, ends the series, and puts the old end_reason into the undo "before" patch).
- pgTAP 93: 31 assertions covering the plan's listed cases.

## Deviations from Plan

- **Series end date on payoff:** end_date is the paid-off date, not "the day after" (the plan's two statements conflict; this satisfies "no pending rows after paid_off_on"). If a series anchor lies after the payoff date, end_date is clamped to the anchor.
- **Undo gap (known):** `apply_patches` allows `payoff_order`, `balance`, `paid_off_on` on debts but not `payoff_extra` or `extra_series_id` (06-04 kept them RPC-only). Undo of a plan save therefore restores the series and order but leaves `payoff_extra` as it was. Closing it needs an `apply_patches` re-issue (a shared function 06-06 may also touch), so I left it out. Client code should read the extra from the live series.
- **Payment category:** debts have no category column. The payment uses `p_payment.category_id`, else the debt payment series' category when the caller owns that category.
- **Series amount:** the amount comes from `p_extra` (negated); any amount in `p_series` is ignored.
- pgTAP dates are relative to `current_date` (sale date is today + 20) rather than the literal 2026-11-20, so the materialiser horizon cannot change results.

## Verification

- `npm run lint:migrations`: MIGRATION COMPAT OK.
- Label grep lists only `debtPlanSaved` and `debtSaleRecorded`; no `paid_off_at`.
- pgTAP not run locally (no Docker): LOCAL_PGTAP_UNAVAILABLE, not verified locally. CI `rls` job is the gate.
- No dependency on objects created only in 20261106000200 (06-06).

## Commits

- e1b4eea8: feat(06-07): save_debt_plan and record_debt_sale RPCs
- eb4a33f4: test(06-07): pgTAP 93

## Self-Check: PASSED (files exist, commits present)

## Follow-up: undo gap closed

The "Undo gap (known)" above is fixed. `save_debt_plan` now stores its server-built step with `allow_system_keys = true`, and `apply_patches` (20261106000100) admits `debts.payoff_extra` and `debts.extra_series_id` only as system keys, the same way 06-06 handles `is_safety_net`. Undo of a plan save now puts back the old extra, series link, order and series rows. A plain client `apply_patches` call, or a client-recorded undo step, that sets either column is still refused. `record_debt_sale` writes neither column, so it is unchanged. pgTAP 93 covers both cases (plan 44).

**Note for 06-14:** the client contract does not change. Both RPCs already built their undo ops on the server; `p_undo_step` is still `{ id, label_key, label_params }`. Two client points:
- After Undo, `payoff_extra` is correct again, so the client may read it directly instead of working it out from the live series.
- A step stored with `allow_system_keys` replays under `fincwin.system_restamp`, so Undo does not bump the version on the debt or the series rows. After an Undo of `debtPlanSaved`, invalidate the debts and recurring-series queries; do not rely on a version change.
