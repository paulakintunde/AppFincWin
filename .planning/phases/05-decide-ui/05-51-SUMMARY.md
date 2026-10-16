---
phase: 05-decide-ui
plan: 51
subsystem: decide-demo-seed
tags: [decide, demo, seed, supabase, app-review]
requires: [05-03, 05-04, 05-11, 05-18]
provides:
  - seed_sample_data / clear_sample_data v2 (supabase/migrations/20261016000400_decide_demo_seed.sql)
  - scripts/check-decide-demo-mirror.mjs, npm run check:decide-demo-mirror, CI step
affects: [05-52]
key-files:
  created:
    - supabase/migrations/20261016000400_decide_demo_seed.sql
    - supabase/tests/database/57_decide_demo_seed.test.sql
    - scripts/check-decide-demo-mirror.mjs
  modified:
    - supabase/tests/database/48_sample_data.test.sql
    - src/db/samples.ts
    - src/db/__tests__/samples.test.ts
    - src/data/mutations/__tests__/sampleData.test.tsx
    - package.json
    - .github/workflows/ci.yml
decisions:
  - The seed replaces the v1 current-month rows, foreign line, refund, Weekend trips category and Streaming series with the single fixture template (05-18 deviation 3); these would otherwise change the fixture's verdicts
  - Seed upserts a decide_settings row with investing_floor 0 (05-18 deviation 1); an existing row is only filled when its investing_floor is null; clear removes the row only when it is the seed's shape (floor 0, nothing else typed)
  - Sample check inputs are stored as the fixture's USD minor units; the screenshot account is USD-home
metrics:
  tasks: 2
  completed: 2026-10-16
---

# Phase 5 Plan 51: Demo seed v2 and mirror check Summary

The real `seed_sample_data` now builds the 05-18 demo scenario (seven months from one template, a linked monthly Salary series, savings and investment transfers, the Student loan and a paid-in-full Credit card row, investing_floor 0, open Sofa and Car checks), `clear_sample_data` removes it all, and a CI mirror check ties every seeded constant to `demoScenario.json`.

## What was built

- **Migration 20261016000400_decide_demo_seed.sql**: five accounts; Salary series (anchor 5th of the first seeded month, materialised through month end); loop over the current month and six past months inserting Salary (linked by recurring_series_id and occurrence_date), the 11-line template, and two transfer pairs per month; debts (Student loan; card-kind row with paid_in_full true, no minimum terms); decide_settings upsert; Sofa (combine false) and Car (typed aprText "6.9") checks. Returns accounts 5, series 1, checks 2, debts 2. 39 `-- demo:` markers.
- **clear_sample_data**: deletes sample links, checks and debts first, then the v1 sequence; returns `checks` and `debts` counts. Rows written by Go ahead (never is_sample) survive.
- **samples.ts**: `ClearSampleResult` and validation gain `checks` and `debts`; tests updated.
- **pgTAP 57** (20 assertions) added; **48** updated for the v2 shape (5 accounts, no foreign/refund/category lines, JPY salary 660000).
- **check-decide-demo-mirror.mjs**: 38 keys, exits 1 on any missing, extra, duplicated or mismatched key (verified by changing the fixture floor); wired as `check:decide-demo-mirror` and a CI step after the recurring mirror.

## Deviations from Plan

1. **[Rule 1 - fixture carry-over] decide_settings row.** The plan did not list it; 05-18 requires investing_floor 0, so the seed upserts it and clear removes it when it is the seed's shape. Superseded 2026-10-16 by the decide_settings.seeded flag (user decision): clear now deletes the row only while seeded is true, and any user edit clears the flag.
2. **[Interpretation] v1 extras dropped** (foreign line, refund, Weekend trips, Streaming) and 48 reworked accordingly, because they would break the fixture-matching verdicts.
3. No engine edits.

## Verification

- `npm run lint:migrations`, `npm run verify:migrations`: OK. `npx jest src/db/__tests__/samples.test.ts src/data/mutations`: 365 pass. `npm run check:decide-demo-mirror`: OK (38 keys). `npm run typecheck` clean, `npm run lint` 0 errors.
- pgTAP 48 and 57 NOT run locally (Docker down by instruction); CI `rls` job runs them on PR #82. Nothing was run against any database.

## Human / device items

- Confirm pgTAP 48 and 57 green in CI `rls`.
- Screenshot account must be USD-home (check inputs are USD minor units).

## Known Stubs

None.

## Self-Check: PASSED
