---
phase: 06-grow
plan: 20
status: complete
requirements: [GRW-01, GRW-02, GRW-03, GRW-04, GRW-05, GRW-06, GRW-07, GRW-08, GRW-09, GRW-10, GRW-11]
key-files:
  created:
    - src/shell/decide/GrowLinkStep.tsx
    - src/features/decide/setup/__tests__/setupFlow.growLinks.test.ts
    - src/features/grow/__tests__/createFromDecide.test.tsx
  modified:
    - src/shell/tabBar/availableTabs.ts
    - src/features/decide/setup/setupFlow.ts
    - src/shell/decide/setupRegistry.tsx
    - src/features/grow/home/GrowHome.tsx
    - src/features/grow/goals/NewGoalSheet.tsx
    - src/data/mutations/growGoals.ts
    - src/data/cache/persister.ts
    - scripts/cache-shape.lock.json
---

# Phase 6 Plan 20: Release wiring and phase gate

The Grow tab is switched on for every level, Decide's four moved setup steps open Grow, and a goal can be made from a Decide check. The owner approved the device check on 2026-11-10 (run under 06-37) and approved four of the five goals cases.

## Task 1 (commit 56700ab8, lint fix 8dc8d817)

- `TAB_AVAILABILITY.grow` is true. `availableTabs()` returns home, activity, decide, grow; screen-reader counts are "N of 4". It is a build-rollout switch (D-03), so it is on for all levels, not tied to any onboarding level.
- `setupFlow.ts` gains `GROW_ROUTES` / `growRouteOf`: loans to `/grow?segment=debts`, saving and envelopes to `/grow?segment=goals`, emergency to `/grow/safety-net`.
- `src/shell/decide/GrowLinkStep.tsx` is the body those four steps now render in the setup registry: one plain sentence and an "Open in Grow" row (`pushOnce`). It writes nothing. New copy under `decide.setup.growLink.*`.
- `GrowHome` reads `segment`, `newGoal`, `name`, `target`, `checkId` route params (also when the tab is already mounted). `newGoal=1` opens `NewGoalSheet` prefilled.
- `NewGoalSheet` now passes `prefill.checkId` through as `check_id` (`NewGoalFields.check_id`, insert only), so the saved goal shows "From a Decide check". Before this the prefill type carried `checkId` but it was never saved.

## Gate results (Task 2)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 errors, 1418 warnings, as before; one error found in GrowHome and fixed) |
| `npm run depcruise` | pass |
| `npm run lint:migrations` | pass (78 files; two existing warnings on 20261007000300) |
| `npm run check:ignores` | pass |
| `npm run check:cache-version` | FAILED at first, fixed: version bumped 4 to 5 and lock updated; now pass. Also `node --test scripts/__tests__/check-cache-version.test.mjs` 6/6 |
| `npm run check:money-mirror` | pass |
| `npm run check:right-answers` | pass |
| `npm test` / `npm run test:coverage` | one run of `jest --coverage --ci` (covers the whole suite): 979 suites passed, 2 failed, 39292 tests passed. The two failures (`decideCopy`, `persister`) were stale tests, fixed and re-run green on their own. No coverage-threshold message was printed. The full coverage run was not repeated after those two test fixes |
| pgTAP | Docker not available. CI run 42347281370 (branch feat/06-grow, SHA 7b1727af, the base of this work): `rls` job success, `secret-scan` success, `deno` success. The `checks` job failed in that run only on the cache version check, now fixed here. Not re-run on these commits (not pushed) |
| Advice-word grep over `src/features/grow` and `en.ts` | no copy hits (only the two tests that assert their absence) |
| `grep "Lines you will not cross" src/features/grow` | no hits |

## Deviations from Plan

1. **[Rule 1] Cache version never bumped for later Grow shape changes.** Plans after 06-08 changed persisted shapes without a bump; CI `checks` was already red on this. Bumped to 5, lock updated (commit 4b722188, labelled `fix(06-08)`).
2. **[Rule 1] Stale tests.** `decideCopy` banned the word Grow in Decide copy (tab did not exist); now allowed only under `decide.setup.growLink.`. `persister` expected cache version 4. `shellNavigation`, `TabBar.a11y` and `availableTabs` tests updated to 4 tabs (the virtual route tree in shellNavigation gained a grow leaf).
3. **[Rule 1] check_id not saved.** See Task 1.
4. **No Decide "save for it" pot-creation call site exists in the check flow.** The only pot creators are the Pots screen and the Saving/Envelopes setup steps, which now point to Grow. So the "navigate to `/grow?newGoal=1&...`" entry is provided by the GrowHome param handling and tested, but nothing in Decide's check screens calls it yet. Say if you want a button added to the check result.
5. **Setup step answered state unchanged.** `isAnswered` already treats these four steps as answered (optional), so no Grow data was added to the setup facts. The old step components (LoansStep, SavingStep, EmergencyStep, EnvelopesStep) are no longer in the registry but their files and tests remain.

## Goals right-answer cases (owner review 2026-11-10)

- GL-01: Mina, no safety net, $300 spare; a full locked "New laptop" goal ($500 of $500) is left out; a $1,500 purchase is judged on the $300 plus $300 a month, and the answer says locked goals are kept out.
- GL-02: Tomas; a locked "Bike" goal protects what it holds ($300), not its $500 target.
- GL-03: Ines; an unlocked "Weekend away" goal with $640 counts as spare money and the answer says so ($900 purchase).
- GL-04: Kai; safety net size $2,300, was $1,300, $200 taken out; the next answer is judged against the $1,100 now in it.
- GL-05: Priya; locked safety net ($1,300) and locked "Lisbon" goal ($640) both kept out of a $2,000 purchase, and the answer names the two together.

## Completion

- Task 3: the owner device check ran under 06-37 and was approved on 2026-11-10; see 06-37-SUMMARY.md, "Device check result".
- Task 4 (021189fd): GL-01, GL-02, GL-03 and GL-05 are approved (approvedAt 2026-11-10). GL-04 is back to draft. The owner wants the next answer to use what is in the net now, and a prompt after a withdrawal asking whether to lock the net or leave it unlocked. A commit on 2026-11-07 (e949b47c) had marked all five approved before the owner had seen them; this corrects that.
