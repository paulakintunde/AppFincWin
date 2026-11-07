---
phase: 06-grow
plan: 04
subsystem: database
tags: [supabase, postgres, rls, pgtap, grow, holdings, goals]
requires: []
provides:
  - savings_goals open-ended / locked / safety-net columns and guard
  - accounts.interest_rate, debts Grow fields
  - holdings and holding_lots tables with value sync
  - apply_patches re-issued with every Grow patchable column
affects: [06-05, 06-06, 06-07, 06-11]
tech-stack:
  added: []
  patterns: [owner-private RLS, security-definer sync trigger, GUC-gated guard bypass]
key-files:
  created:
    - supabase/migrations/20261106000100_grow_schema.sql
    - supabase/tests/database/89_grow_goals.test.sql
    - supabase/tests/database/91_grow_holdings.test.sql
  modified: []
key-decisions:
  - "Lot guard compares the holding owner to the stamped new.created_by (not auth.uid()) so service-role seeding works; clients cannot set created_by."
  - "is_safety_net is a system key in apply_patches (undo replay only) and is pinned in the guard unless fincwin.safety_net_rpc or fincwin.undo_replay is on."
requirements-completed: [GRW-01, GRW-02, GRW-04, GRW-05, GRW-07, GRW-10, GRW-11]
duration: 25min
completed: 2026-11-06
---

# Phase 6 Plan 04: Grow schema migration Summary

One migration fixes Grow's storage shape: open-ended and locked goals, a single protected safety net, account APY, Grow debt fields, private holdings with a value-history lot trigger, and apply_patches re-issued once so all of it is editable and undoable.

## Tasks

| Task | Commit | Result |
| --- | --- | --- |
| 1. Schema migration | 43b9c948 | `supabase/migrations/20261106000100_grow_schema.sql`, `npm run lint:migrations` OK (76 files) |
| 2. pgTAP 89 and 91 | 737c7d41 | 33 assertions (goals) and 26 assertions (holdings) |

## Verification status

- `npm run lint:migrations`: passed.
- Local Supabase stack: not available (Docker not running; `docker info` fails). pgTAP 89 and 91 were NOT run locally. Gate = CI `supabase test db` run on the PR. Not verified locally; do not treat as passing.
- Nothing was pushed to Supabase; no db push, link or MCP use.

## Deviations from Plan

**1. [Rule 1 - Bug] holding_lots guard ownership check**
- Plan implied `auth.uid()` comparison for the owning holding. Used `h.created_by = new.created_by` (stamped to auth.uid() for clients; clients have no grant on created_by). Keeps service-role / sample-data inserts working and keeps the client rule identical. Done in the migration commit.

**2. Shape check risk (note, not a change)**
- `savings_goals_pot_shape` now is `kind <> 'pot' or bucket is null or ready_by is null`. Existing rows satisfy it unless a bucket pot already carries a ready_by; this is unverified against production data. Plan 11 push should check for such rows first.

Otherwise the plan was executed as written. The apply_patches body was produced by a scripted copy of 20261103000200 with asserted replacements, so every changed line is marked `-- 06`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (all six dispositions implemented: owner-private RLS, 42501 guards, explicit patch allow-list, safety-net unique index and guard, cascade erasure, value frozen to clients).

## Self-Check: PASSED

Files exist (migration, 89, 91); commits 43b9c948 and 737c7d41 exist.
