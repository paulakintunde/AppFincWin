---
phase: 08-household
plan: 02
subsystem: database
tags: [household, members, rpc, pgtap]
requires: []
provides:
  - household_members is_owner, role_label, colour_key, name_hidden; weight 0..100
  - households.name; household_events; household_event_reads
  - RPCs set_my_member_display, set_member_role, set_member_weights, rename_household, set_household_currency, mark_household_events_read
  - internal helpers hh_uid, hh_event
affects: [08-06, 08-07, 08-10]
key-files:
  created:
    - supabase/migrations/20261122000200_household_members_v2.sql
    - supabase/tests/database/100_household_members_v2.test.sql
decisions:
  - set_member_weights checks all_zero before not_100, so an all-zero map reports all_zero
  - households.name has default 'My household' so existing direct inserts keep working
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 02: Members v2 Summary

Membership reshaped for real households: owner flag with a label, percent weights (0 allowed, deferred all-zero guard), unique member colours, hidden-name flag, household name, a `household_events` notice table, and RPC-only writes.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Migration | 69ca6a5d | applies with `supabase db reset`; role column dropped; 6 RPCs granted; 3 raise statements |
| 2 pgTAP 100 | bd3bd9cb | 28/28 pass |

## Verification

- `npx supabase db reset` (both Phase 8 migrations apply on top of the current tree).
- `npx supabase test db supabase/tests/database/100_household_members_v2.test.sql` passes (28 tests). Only this file was run, per the quick-check rule.

## Deviations from Plan

**1. [Rule 3 - Test fixture] pgTAP fixture empties B's own household membership** before inserting B into A's household. Signup gives B a household of one, so without that B has two membership rows.

**2. Additions beyond the plan text:** helper `hh_uid()` centralises the 42501 raise (keeps raise count at 3); `households.name` carries a default of 'My household'; `set_my_member_display` keeps the existing display name when `p_display_name` is null; `set_member_role` returns `not_allowed` for a non-owner acting on someone else.

The 19 existing pgTAP files using `role` are left red for plan 08-06, as planned (not run).

## Known Stubs

None.

## Self-Check: PASSED
