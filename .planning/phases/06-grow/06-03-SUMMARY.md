---
phase: 06-grow
plan: 03
subsystem: decide-engine
tags: [decide, locked-goals, safety-net, engine]
requires: []
provides:
  - "Envelope.locked (absent/true fenced, false = spare) in the Decide v3 engine"
  - "facts locked_goals_kept, net_and_goals_kept, unlocked_goals_counted"
affects: [06-05 grow rows feed Envelope.locked]
tech-stack:
  added: []
  patterns: ["absent flag = legacy behaviour so goldens stay byte-identical"]
key-files:
  created:
    - src/engine/decide/v3/__tests__/lockedGoals.test.ts
    - src/engine/decide/v3/__tests__/invariants/lockedGoals.test.ts
  modified:
    - src/engine/decide/v3/types.ts
    - src/engine/decide/v3/funds/build.ts
    - src/engine/decide/v3/safetyNet.ts
    - src/engine/decide/v3/judge/judge.ts
    - src/engine/decide/v3/copy/verdictTable.ts
    - src/i18n/locales/en.ts
    - src/i18n/__tests__/wordingScope.ts
    - src/engine/decide/v3/copy/__tests__/copyContract.test.ts
    - src/engine/decide/v3/copy/__tests__/verdictTable.test.ts
key-decisions:
  - "Unlocked goals in dedicated/untouched accounts join the extra-savings pool by adding to ResolvedNet.aboveSize (safetyNet.ts), the single place that pool is defined"
  - "locked absent = locked with no new fact; only explicit true/false produce the three new facts"
requirements-completed: [GRW-01, GRW-02]
duration: long (slow cold jest)
completed: 2026-11-06
---

# Phase 6 Plan 03: Locked goals in Decide Summary

Decide v3 now keeps the saved money in locked goals out of every answer, counts unlocked goals' saved money as spare, and names both when a locked net and locked goals are kept out together. `locked` absent behaves exactly as before.

## What changed
- `Envelope.locked?: boolean`; `Funds.lockedNamedSaved?` / `unlockedSaved?`; three new FactCodes.
- `funds/build.ts`: only envelopes with `locked !== false` are deducted (everyday, mixed, unlinked); unlocked ones are not.
- `safetyNet.ts`: saved money of unlocked goals in dedicated or untouched accounts is added to `aboveSize`, the extra-savings pool that `extra_savings_used` reports.
- `judge.ts`: a not-yet answer with a locked net and locked goals pushes `net_and_goals_kept { net, goals }` in place of `net_locked`; locked goals alone push `locked_goals_kept { amount }`; unlocked goals push `unlocked_goals_counted { amount }`.
- Copy (declarative): "Locked goals {{amount}} kept out of this answer." / "Safety net {{net}} and locked goals {{goals}} kept out." / "Unlocked goals {{amount}} counted as spare money."

## Commits
- b5ddcd4b test(06-03): failing locked-goal tests (RED)
- d29c1476 feat(06-03): locked goals kept out, unlocked goals counted (GREEN)
- Task 3 (coverage): needed no new commit, the Task 1 tests already give 100% on the touched code.

## Verification (per-plan, owner rule)
- `npx jest src/engine/decide/v3 src/i18n`: all pass (143 suites in v3, 2481 tests); goldens, right-answers and invariants unchanged.
- Coverage on `funds/**`, `judge/**`, `safetyNet.ts`: 100% statements, branches, functions, lines.
- `npm run typecheck`, `npm run lint` (0 errors), `npm run depcruise`, `npm run check:right-answers`: pass.
- No golden or right-answer case file was touched.

## Deviations from Plan
**1. [Rule 3 - Blocking] Edited `safetyNet.ts`, not listed in files_modified.** The extra-savings pool (`aboveSize`) is defined there, not in `funds/`; adding the unlocked-goal money there is the only single point all consumers (cash path, money source, depletion, judge) read.
**2. [Rule 3 - Blocking] Ripple files updated:** `copyContract.test.ts` (corpus scenarios so every FactCode is emitted), `verdictTable.test.ts` (FACT_KEYS list), `i18n/__tests__/wordingScope.ts` (decision entries and a `goals` sample value). Required by existing guard tests.

## Known notes
- `net_above_size` fact reads the pool including unlocked goal money in dedicated/untouched accounts; `unlocked_goals_counted` names the goal part alongside it.
- `ResolvedNet.aboveSize` includes unlocked goal money even with net protection off.

## Self-Check: PASSED
Files and commits b5ddcd4b, d29c1476 verified present.
