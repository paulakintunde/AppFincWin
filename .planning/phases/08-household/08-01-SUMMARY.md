---
phase: 08-household
plan: 01
subsystem: database
tags: [rls, privacy, supabase, household]
requires: []
provides:
  - transactions.is_shared, transactions.paid_by, accounts.is_shared, recurring_series.is_shared
  - personal-or-shared RLS on transactions, accounts, recurring_series
  - creator-only RLS on debts, recurring_dismissals, income_payer_prompts
  - statement_periods visibility derived from the card account
affects: [08-02, 08-05, 08-06, 08-07, 08-10]
key-files:
  created:
    - supabase/migrations/20261122000100_household_privacy_wave1.sql
    - .planning/phases/08-household/08-PRECONDITIONS.md
decisions:
  - Backfill runs with user triggers disabled because recurring_series (and others) pin created_by on update, which would silently undo it
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 01: Household privacy wave 1 Summary

Every money row is personal unless marked shared, enforced by Postgres RLS (`is_shared or created_by = auth.uid()`), with a guarded created_by backfill from `households.owner_id` ahead of the policy switch.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Preconditions | 2e4efcd0 | 08-PRECONDITIONS.md: GROW_ON_BASE yes, date base 20261122, PGTAP_BASE 100, 05.5 landed yes |
| 2 Privacy migration | bdf68370 | `supabase db reset` applies it locally |

## Verification

- `npx supabase db reset` applies 20261122000100 (local stack only).
- Acceptance greps: policy predicate x7, drop policy x12, security_invoker x1, null-created_by guard x1, `grant insert (is_shared` only on accounts.
- No file under supabase/tests changed. Existing pgTAP files with household-wide fixtures are expected red until plan 08-06.

## Deviations from Plan

**1. [Rule 1 - Bug] Backfill disables user triggers.** `recurring_series` trigger keeps `old.created_by` on update, so a plain backfill would leave null rows and abort on the guard. The migration disables user triggers on the six tables around the one-time update and re-enables them. Version numbers are therefore not bumped by the backfill.

**2. recurring_series has no insert/update policies** (writes go through RPCs with no client grant), so only the select policy is replaced. The plan wording assumed insert/update policies existed.

**3. statement_periods_live not re-created** (columns unchanged; inherits through security_invoker), as the plan allowed.

## Owner check pending (not run)

Production state checks (`migration list --linked`, etc.) were not run: no production access for this executor. Recorded in 08-PRECONDITIONS.md. Phase 8 database push waits for 05.5 Band B (gate g). The backfill and `disable trigger user` on production tables should be reviewed before the push.

## Known Stubs

None.

## Self-Check: PASSED
