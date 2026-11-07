---
phase: 06-grow
plan: 25
subsystem: database
tags: [supabase, migration, rpc, pgtap, debts, safety-net]
requires: [06-20]
provides:
  - transactions.debt_id (RPC-written link, guard trigger, transactions_active re-issued)
  - public.record_debt_one_off (atomic Expected payment out + server-built Undo 'debtOneOffRecorded')
  - savings_goals.net_confirmed_at insert grant
  - set_safety_net re-issued (sets net_confirmed_at)
key-files:
  created:
    - supabase/migrations/20261106000400_grow_debt_one_off_and_net_confirmed.sql
    - supabase/tests/database/94_grow_debt_one_off_and_net_confirmed.test.sql
decisions:
  - "Undo of set_safety_net does not restore net_confirmed_at (only read while is_safety_net is true)"
  - "record_debt_one_off leaves debts.balance unchanged; the line is Expected until marked paid"
metrics:
  completed: 2026-11-07
---

# Phase 6 Plan 25: Debt one-off payment and confirmed safety net Summary

Fourth Grow migration (additive only): a one-off "Use $1,000 once" debt payment is one atomic save with one server-built Undo, and a safety net made in the app starts confirmed.

## What was built

- `transactions.debt_id` (nullable FK, `on delete set null`), a partial index, and `guard_transaction_debt` (22023 for a debt in another household, fires even for the table owner). No client grant, so only the RPC writes it. `transactions_active` re-created (debt_id appended last; same security_invoker and grants).
- `record_debt_one_off(p_debt_id, p_payment, p_undo_step)`: security definer, `search_path ''`, execute to authenticated only. Validates the undo step with the existing 3-arg `grow_check_undo_step` (label `debtOneOffRecorded`), replays return `already-applied`, membership 42501, paid-off/removed/amount (0, over balance, over 1e13) 22023, account must be in the debt's household (42501). Inserts one `pending` line (negative amount, `debt_id`), category by the record_debt_sale fallback rule, and an undo step whose op soft-deletes the line. `allow_system_keys` is not needed.
- `grant insert (net_confirmed_at)` on savings_goals, and `set_safety_net` re-issued with `net_confirmed_at = coalesce(net_confirmed_at, now())`.
- pgTAP 94 (25 assertions).

## Verification

- `npm run lint:migrations`: OK (79 files).
- Diff vs base touches only the two new files; migrations 100/200/300 untouched.
- pgTAP not verified locally (Docker unavailable): CI `rls` is the gate (LOCAL_PGTAP_UNAVAILABLE).

## Deviations from Plan

None. One choice worth review in CI: an explicit `category_id` the caller does not own falls back to the series category rather than raising.

## Commits

- 6318056f: migration
- test commit: pgTAP 94

## Self-Check: PASSED
