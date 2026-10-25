# Phase 5 Walkthrough 2, Fix B Summary

Four Pixel 9 findings on the Decide home card, Judge-on and Month details.

## Commits
- 1de2c81e fix(05-146): Judge-on top row is the same for every label (finding 2)
- 2a56be84 fix(05-146): Month details history line names the chosen basis (finding 3)
- cf1fd3a5 fix(05-146): update-time default switch does not mark checks changed; Decide home clears the FAB (findings 1 and 4)

## Root causes and fixes

1. Update-time "changed" markers. A user with no stored device choice was moved to This month by the store default (`stored ?? 'month'`) with no re-baseline, so checks last seen on the settings basis (basis_override or the engine default) were compared on a different basis. Now `judgeOnStore` carries `pendingDefault` (no stored choice and the new `judgeOnDefaulted` hints flag unset). While pending, `useDecideSnapshot` builds on the settings basis and the card shows its loading state. `useResolveJudgeOnDefault` (mounted in DecideHomeScreen) waits for the snapshot and open checks, runs `rebaselineSeen`/`markSeen` and the same cache patch as a user's switch, then resolves the default and writes `judgeOnDefaulted` (once per device and user). No-flash ordering: the store first sets `applying`, which holds the snapshot back (changed count is 0 with no snapshot), then the cache patch, then the flip to This month; no ordering of the three can render "N changed". A user's own choice (even This month) ends the pending state. Test: 'D-107 the default switch on update does not mark checks changed' (asserts no render ever counted a change), plus once-only, stored-choice, done-flag and real-change tests.
2. Dropdown layout. Eyebrow, pill and Details shared one wrapping row, so the label width decided where things wrapped (and the caret wrapped off the pill). Now a column: line 1 the eyebrow with its info glyph; line 2 `home-card-controls`, a wrapping row with the pill (flexShrink 1) left and Details (`marginLeft: auto`, 44 target) right. Reading order unchanged. `it.each` tests for This month, Worst month and Average month (caret present, same structure); the 320/2.0x test updated.
3. Month details copy (en.ts, `decide.month`). 
   - `variableLine`: "{{count}} months ranging {{worst}} to {{best}}. Checks are judged on {{basis}}, the choice below."
   - `judgedOnWorst`: "the worst month"; `judgedOnAverage`: "the average month".
   - Rendered: "4 months ranging $1000 to $9000. Checks are judged on the worst month, the choice below." The line stays hidden for This month (as before). It says "below" not "above": the radio list sits under the line.
4. FAB overlap. TabRootScreen already pads the scroll content by FAB_CLEARANCE (82), but the FAB is 66 above the bar and the content at rest ended right at it. The home body now adds its own `paddingBottom: FAB_CLEARANCE`, so the last row and a tall open quick result scroll fully clear. Tests: real TabRootScreen keeps the inset (DecideFabClearance), and the home body asserts the inset.

## Deviations
- Findings 1 and 4 share DecideHomeScreen.tsx, so they are one commit.
- Several screen tests mocking the judge store or hints gained stubs (`useResolveJudgeOnDefault`, `loadJudgeOnDefaulted`).
- I did not edit pots/*, UndoToastHost, CheckFlowScreen or BasisOutcomeCard.

## Decisions for the user
- Until the Decide home mounts once, a deep-linked check judges on the settings basis (the default switch resolves from the home). Acceptable, but say if it should resolve at app start.
- Copy says "the choice below"; your example said "above".
