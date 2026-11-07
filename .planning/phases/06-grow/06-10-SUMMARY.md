---
phase: 06-grow
plan: 10
subsystem: decide-snapshot
tags: [decide, grow, connect, safety-net, goals, debts, right-answers]
requires: ["06-03", "06-05", "06-08"]
provides:
  - "Decide's V3 builder reads goals, the safety net and its fund, and debts only through @/features/grow/connect"
  - "ARC-15: a goal's contribution counts once"
  - "Right-answer topic 'goals' with five draft cases (GL-01..GL-05)"
affects: [06-20 owner approval of goals cases, 06-06 migration SQL (unchanged rule)]
tech-stack:
  added: []
  patterns: ["baseline JSON captured on the old code, compared after the change", "frozen old mapping kept inside the parity test"]
key-files:
  created:
    - src/features/decide/snapshot/v3/__tests__/growConnect.test.ts
    - src/features/decide/snapshot/v3/__tests__/growScenarios.ts
    - src/features/decide/snapshot/v3/__tests__/growConnect.baseline.json
    - src/features/decide/snapshot/v3/__tests__/contributionOnce.test.ts
    - src/engine/decide/v3/__tests__/rightAnswers/cases/goals.json
    - src/engine/decide/v3/__tests__/rightAnswers/knownRed/goals.json
  modified:
    - src/features/decide/snapshot/v3/buildV3Inputs.ts
    - src/features/decide/snapshot/v3/settingsSource.ts
    - src/features/decide/snapshot/v3/types.ts
    - src/features/decide/snapshot/buildSnapshot.ts
    - src/features/grow/connect/goalSaved.ts
    - src/features/grow/connect/goalPoint.ts
    - src/features/grow/connect/safetyNetPoint.ts
    - src/engine/decide/v3/__tests__/rightAnswers/schema.ts
    - src/engine/decide/v3/__tests__/rightAnswers/fixture.ts
key-decisions:
  - "No flagged safety-net goal gives safetyNet null and emergency null; the engine then also says emergency_not_set (a true notice that was unsaid before when a settings row existed)"
  - "Goal id prefix for the right-answer topic is GL (the id pattern needs two letters), not G"
  - "The landing-leg account fallback stays in the builder (D-54): a goal with no stored account still takes the account its latest tagged transfer leg landed in"
requirements-completed: [GRW-01, GRW-02, GRW-03, GRW-07]
completed: 2026-11-06
---

# Phase 6 Plan 10: Decide reads Grow Summary

Decide's builder now takes envelopes, the safety net, its fund and debts from the plan-05 connection points; the interim `decide_settings` safety-net columns and the typed reserve are no longer read; a goal's contribution counts once; and a `goals` topic of five draft cases waits for owner review.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Builder reads Grow through connect | 36d4fd3b | envelopes, safety net and fund, debts via connect; single-leg goal line is an envelope deposit; goal-linked series skipped |
| 2 Right-answer goals topic | 3360d042 | TOPICS gains goals (prefix GL); fixture maps goals to envelopes; five draft cases, knownRed empty |

## What changed
- `buildV3Inputs.ts`: one import from `@/features/grow/connect`. Envelopes are `envelopesOf(goalPointsOf(...))` with an explicit `locked`; net and fund are `safetyNetInputsOf(safetyNetPointOf(...))`; debts go through `debtToV3Debt`. Two `06 ARC-15` marks: goal-linked series are skipped (also from bills and income), and in `roleOf` a single-leg line tagged with a live goal is `envelope_deposit` (out) or `envelope_withdrawal` (in). A leg tagged with a deleted or unknown goal keeps its ordinary role.
- `settingsSource.ts`, `types.ts`: `safety_net_*` and `reserve_account_id` removed from `V3SettingsSource`.
- `buildSnapshot.ts`: `GoalSource` gains the optional Grow fields; `series` may carry `goal_id`; the safety-net goal is not a pot for the old snapshot (otherwise it would be counted twice).
- Tests: `growConnect` (criterion 7, envelopes, debts, no holdings, and a baseline of six scenarios by two checks captured on the old code before the change), `contributionOnce` (ARC-15 incl. the single-leg cases), existing tests moved from the interim columns to a flagged goal row.
- Parity grid (06-05) stays 96 cells green: its "old way" is now a literal frozen copy of the old mapping, since the builder no longer reads the columns.

## Deviations from Plan

**1. [Rule 1 - Bug] A goal's saved money could reach the engine negative.** With signed transfer legs (06-05), taking out more than was saved gave a negative pot and the engine threw (`potSetAside ... must be a whole number from 0`). `clampSaved` (0 to the money cap) added to `goalPoint.ts` and `safetyNetPoint.ts` with two tests; connect stays at 100 percent coverage. Files: `src/features/grow/connect/goalSaved.ts`, `goalPoint.ts`, `safetyNetPoint.ts` (not in the plan's file list).

**2. [Rule 3 - Blocking] `GoalSource` and the series pick lacked the Grow fields**, so the builder could not pass goal rows to connect. Added optional fields in `buildSnapshot.ts`.

**3. [Rule 1] Landing-leg fallback kept in the builder.** The plan allowed dropping it unless parity needed it; existing D-54 tests need it, and dropping it would change which account an envelope's money is taken from. It is in the builder, not in connect.

**4. Id prefix `GL`, not `G`.** The case id pattern needs two letters. Cases are GL-01..GL-05.

**5. A goal's saved money now uses signed legs** (06-05 behaviour): a withdrawal lowers it. One existing test expected the old absolute-value sum (17000, now 13000) and was updated.

**6. `v3Fixtures.ts`** lost `reserve_account_id` (type removed); `oneSource.test.ts` allows the `@/features/grow/connect` import.

## Behaviour differences, stated
- Compared with the baseline captured before the change (six goal/debt scenarios, two checks each): numbers, code, variant, funds, debts and all non-new facts are identical. Only allowed differences appear: the three new FactCodes, and one notice, `emergency_not_set`, which now shows when there is no flagged safety-net goal (the old builder gave a settings-row user a default net record, which hid it). A goal with no name reads `""` instead of `null` (real goals always have a name).
- Approved right-answer cases and goldens are untouched; `npm run check:right-answers` passes.

## Right-answer goals topic
Five draft cases, `approvedAt` null, `expected` copied from the engine for the owner to review in plan 06-20: GL-01 locked goal fully saved, GL-02 locked goal part saved, GL-03 unlocked goal counted as spare, GL-04 the net after a $200 withdrawal ($1,100 protected), GL-05 locked net plus locked goal named together. Owner approval has NOT been given. `knownRed/goals.json` is empty.


## Verification (per-plan)
- `npx jest src/engine/decide/v3/__tests__ src/features/decide/snapshot src/features/grow/connect`: all pass after the guard-test updates below (658 tests in snapshot and connect; rightAnswers and phaseGate re-run green).
- Coverage: `src/features/decide/snapshot` and `src/features/grow/connect` at 100 percent statements, branches, functions and lines (the builder's now-dead `dueDayOf` was removed).
- Guard tests updated for the tenth topic (Rule 3): `phaseGate.test.ts` exempts the goals topic from the "no draft" rule (its drafts wait for 06-20), `pageRates.test.ts` expects 10 pages, and `build-page.mjs` `TOPIC_TOTAL` is 10.
- `npm run typecheck`: pass. `npm run lint`: 0 errors. `npm run depcruise`: no violations. `npm run check:right-answers`: pass.
- Acceptance greps: no `safety_net_*` in the builder or settings source; one connect import; two `06 ARC-15` marks; no other Grow import in Decide.

## Known Stubs
None.

## Threat Flags
None new. T-06-10-01 to 04 mitigated as planned (grep gate and ignored-columns test; contributionOnce; baseline comparison; no holdings in inputs or source).
