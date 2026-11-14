---
status: awaiting_human_verify
trigger: "Nightly crosscheck borrowing: engine and plain calculator disagree on the cash route's ready date (month end vs payday), so only plain adds borrowing_costs_more; diagnose only, owner decides"
created: 2026-11-12
updated: 2026-11-12
goal: find_and_fix
---

# Debug: crosscheck borrowing, cash ready date month vs payday (D-80 short wait)

## Symptoms

DATA_START
- **Expected:** the crosscheck (calculator vs engine, CROSSCHECK_RUNS=20000) agrees on every draw.
- **Actual:** random seed 224530963 (first seen in nightly run 42611020569, 9 Nov) fails at path 1873 on main 43e6f48b. Expected fits_by_borrowing / borrowing_costs_more, got fits_by_borrowing / null.
- **Known so far (from the I9 session, C:\dev\fincwin-i9\.planning\debug\i9-cheaper-never-worse.md, Evidence):** the cash route is not_yet / not_covered with readyBy {month 2026-11}. The engine's D-80 short-wait check (borrowing.ts cashSoon) reads a month as its last day (30 Nov, 46 days > 31), so variant null. The plain calculator (plain.ts plainCashReady) returns {date 2026-11-01}, because the path dips and pay lands in the ready month, giving 17 days, a short wait, so borrowing_costs_more.
- **Stakes:** a chance red nightly breaks the 3-green-nights count for 05.4-45. If the engine side is wrong, testers may miss the "borrowing costs more" line when the cash wait is really short.
DATA_END

## Constraints

- Work only in C:\dev\fincwin-cx (branch fix/crosscheck-cash-ready-wait, off origin/main). Run `npm ci` here first. Never touch C:\dev\fincwin.
- DIAGNOSE ONLY. No engine or calculator edits, no commits. The owner chooses the fix.
- Decide which side is right: the engine (the month-end reading of a not_covered month) or plain (the payday). Check the decision docs for D-80, readyBy shapes (month vs date) and not_covered, and also the PR #105 fix (judge.ts oneOffPart re-judges on cash.before), which may be related.
- Deliverable: root cause, which side is right and why, 2-3 fix options in plain grade-10 English (what a user would see change, trade-offs), a recommendation, and whether real-sized purchases hit it. Decision IDs only after the plain words.

## Current Focus

reasoning_checkpoint:
  hypothesis: "plain.ts plainCashReady swaps the ready month for the next payday on ANY dip below $0, while the engine (judge.ts oneOffPart) only does so for a dip past the overdraft floor; on path 1873 the dip is inside the overdraft, so plain says 1 Nov (short wait, borrowing_costs_more) and the engine says Nov (30 Nov, not short, null)"
  confirming_evidence:
    - "engine cash check kind = overdraft on path 1873 (lowest -$1,235.96, limit $6,533.95); overdraft branch returns the ladder month unchanged"
    - "plain path still below $0 after the 1 Nov pay (Dec quarterly bill), so the payday reading is wrong on plain's own terms"
  falsification_test: "with dips reading past the overdraft floor, plainCashReady(once) still returns {date 2026-11-01}, or the 20000-run crosscheck shows new disagreements"
  fix_rationale: "aligns plain's date rule with the engine's cash kinds (not_covered/payday/net = past the floor), which is the restated BR-06 rule (BR-06 has no overdraft)"
  blind_spots: "plain's `clears` test (short <= 0) still reads $0, not the floor; untouched to keep the change minimal and the crosscheck did not flag it"
- next_action: owner reviews the PR (fix/crosscheck-cash-ready-wait); watch the next nightly crosscheck

## Evidence

- timestamp: 2026-11-12
  checked: borrowing.ts cashSoon vs plain.ts plainShortWait
  found: Both read D-80 the same way (a date as itself, a month as its last day, <= 31 days). The disagreement is upstream, in the SHAPE of the cash route's readyBy (engine {month}, plain {date: pay}).
  implication: cashSoon is not the bug; the readyBy producer differs.
- timestamp: 2026-11-12
  checked: judge.ts oneOffPart branches by cash check kind
  found: not_covered -> later of ladder month and pay (date when pay >= first of ready month, I13). payday -> payday date when pay >= ready month start. net -> if ladder waits, re-judge on cash.before (PR #105, I51), so also date-capable. overdraft -> `if (part.code === 'not_yet') return part;` returns the ladder's month as-is, never compared with the pay date. ok -> ladder month as-is (path never below 0, so month is right).
  implication: candidate: an overdraft-kind path (dips below 0 but inside the overdraft limit) whose ladder waits gets a bare month; plain treats any dip (balance + above < 0) as waiting for pay too, giving the pay date.
- timestamp: 2026-11-12
  checked: CONTEXT D-80 (line 172), D-108 (line 202)
  found: D-80 "a ready month with no payday date counts from its last day (e.g. 'ready in November' counts as 30 November), as built". The rule is about how a month counts, not about when a month vs a date is produced.
  implication: D-80 does not settle the shape question; I13 (05.1-41) does: "not_covered readyBy is the later of ladder month and pay date".
- timestamp: 2026-11-12
  checked: reproduced seed 224530963 path 1873 (scratch jest test outside repo, replay via fc path '1873'); dumped engine internals for the paid-once route
  found: fixture asOf 2026-10-15, monthly pay $5,773.20 next 2026-11-01, balance $2,063.78, overdraft limit $6,533.95, a 3-monthly bill $6,350.52 due 2026-12-07 (held back $2,116.84), price $1,412.70, plan 60 months at 19.99% + $22.54 fees. Engine cash check kind = 'overdraft' (lowest -$1,235.96 on 2026-12-31, inside the limit). Ladder: monthLeft $1,100.44, unspent -$1,016.40, rest $312.26 > earlierRoom+overdraft, net usable 0 -> notYet not_covered, readyWithSale -> {month 2026-11}; overdraft branch returns it unchanged. Engine once: not_yet/not_covered readyBy 2026-11. Plain once: not_yet, plainCashReady {date 2026-11-01}, plainShortWait true.
  implication: CONFIRMED the overdraft-branch hypothesis: the engine never swaps the month for the pay date on an overdraft-kind path; plain does because its `dips` test ignores the overdraft limit.
- timestamp: 2026-11-12
  checked: plain path for the same fixture (plainPath with and without the purchase)
  found: with the purchase the lowest point is -$1,235.96 on 2026-12-31 (overdraft room $6,533.95, so never past the floor); without it the lowest is +$176.74. After the 1 Nov pay the path is still below 0 from 2026-12-11 (the quarterly bill). So the 1 Nov pay does NOT clear the dip: buying on 1 Nov still uses the overdraft in December.
  implication: plain's "ready 1 November" is not true on its own terms (on 1 Nov cash would at best be fits_uses_overdraft, not a clean fit, D-61). The engine's month reading is the honest one; plain's `dips` should mean "goes past the overdraft floor" (the engine's not_covered/payday/net kinds), as in BR-06 (no overdraft limit) which the date rule was restated from.
- timestamp: 2026-11-12
  checked: fix verification (Option A applied)
  found: regression case RED before (2 failed: plainCashReady {date 2026-11-01} vs {month 2026-11}; plain variant borrowing_costs_more vs null), GREEN after (2 passed). crosscheck.test.ts CROSSCHECK_RUNS=20000 seed 224530963: 3/3 passed (compared 17098, borrowing 855 plans / 485 borrowed). Fresh seed 537440332 at 20000: 3/3 passed (compared 17141, borrowing 854 / 480). npm run test:crosscheck default (seed 504451874): 2 suites, 111/111 passed. tsc --noEmit clean.
  implication: no new disagreement; the fix holds.

## Eliminated

## Resolution

root_cause: The plain calculator's plainCashReady (crosscheck/plain.ts ~1397-1412) turns a ready month into the next payday whenever the cash path goes below $0 at all (`dips = path.some(x => x.balance + above < 0)`), ignoring the overdraft limit and ignoring whether that pay clears the dip. The engine (judge.ts oneOffPart) only does that swap (I13) when the dip is past the overdraft floor (cash kinds not_covered / payday, and net via cash.before since PR #105); on an overdraft-kind path the ladder's not_covered month is returned as is. On path 1873 the dip is inside a $6,533.95 overdraft and recurs after the 1 Nov pay (a quarterly bill on 7 Dec), so the engine's {month 2026-11} (read as 30 Nov by D-80, 46 days, not short) is right and plain's {date 2026-11-01} (17 days, short) is wrong. Calculator/test-side bug; the engine is correct. D-80/cashSoon itself is fine on both sides.
fix: OWNER CHOSE Option A (2026-11-12), calculator/test only, no engine change. Applied: plain.ts plainCashReady `dips` now reads past the overdraft floor (`x.balance + above < -overdraftRoom(f)`), matching the engine's cash kinds. Added a fixed regression describe in crosscheck/table.test.ts ("regression: a dip inside the overdraft does not wait for payday ... seed 224530963, path 1873") with the path-1873 fixture.
verification: Regression case RED before the plain.ts change (plainCashReady gave {date 2026-11-01}; plain plan variant borrowing_costs_more; the engine assertions passed), GREEN after (2/2). tsc --noEmit clean. Crosscheck 20000 runs at seed 224530963 and fresh seed 537440332 both 3/3 pass; default crosscheck folder 111/111 pass.
files_changed: [src/engine/decide/v3/__tests__/crosscheck/plain.ts, src/engine/decide/v3/__tests__/crosscheck/table.test.ts]
