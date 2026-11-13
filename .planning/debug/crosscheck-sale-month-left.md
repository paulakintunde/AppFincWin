---
status: awaiting_human_verify
trigger: "Nightly 12 Nov crosscheck: engine and plain calculator differ by 295 cents on the month-after-buy figure (fits_uses_net, sale arriving 3 days later, QC tax included); diagnose only, owner decides"
created: 2026-11-12
updated: 2026-11-12
goal: find_and_fix
---

# Debug: crosscheck month-after-buy differs by $2.95 (sale + tax + net)

## Symptoms

DATA_START
- **Expected:** the crosscheck (calculator vs engine, CROSSCHECK_RUNS=20000) agrees on every draw.
- **Actual:** scheduled nightly run 43208764138 (12 Nov, main bd74b775) failed in src/engine/decide/v3/__tests__/crosscheck/crosscheck.test.ts. Two tests failed on random seed 482693972, path "9124" (failed after 9125 tests): "agrees on 20000 random fixtures" (line ~39) and "price limits and accounts with no rate" (line ~121, with the unrated-account variant `[fixture, 1, {kind:'current', balance:-199987, use:'everyday'}]`). Both sides give code fits_uses_net, but afterBuy.month differs: one side 888035, the other 887740 (295 cents).
- **Counterexample fixture:** asOf 2026-11-01, CA/QC, monthly pay 300464 (next 2026-11-01), usualMonth bills 165495 / everyday 140978 / essentialEveryday 70489, thisMonth all 0, historyMonths 5, recordsAsOf 2026-10-31. Accounts: checking a1 balance 5714, no overdraft; savings n1 "Safety net" balance 1478603, use emergency. safetyNet {protect:false, size:585277, saved:1460576, locked:false}. No bills or debts. check: price 899258, taxPercent "8.25", taxIncluded true, oneOffFees 500, pay once, closingPercent "0", replaces.sale {amount 874350, arrives 2026-11-04, paysDebtId null}. goals: goal1 saved 18027, target 36054, accountId n1. Full JSON: `gh run view 43208764138 --log-failed`.
- **Not fixed by** PR #107 (overdraft-floor payday swap) or PR #108 (D-68 window), both different areas. main now 77a1d269 includes #107.
- **Stakes:** a chance red nightly breaks the 3-green-nights count for 05.4-45. If the engine side is wrong, testers would see a month-after-buy figure off by a few dollars.
DATA_END

## Constraints

- Work only in C:\dev\fincwin-cs (branch fix/crosscheck-sale-month-left, off origin/main 77a1d269). Run `npm ci` first. Never touch C:\dev\fincwin.
- DIAGNOSE ONLY. No engine or calculator edits, no commits. The owner chooses the fix.
- Decide which side is right, using the decision docs. Likely areas: the goal money in the net account (goals inside the net account, goalsOutside), the sale arriving after asOf in the same month, tax-included handling, oneOffFees, net_above_size / spare. 295 cents is small and odd: check rounding of tax and the goal or fee handling.
- Deliverable: root cause, which side is right and why, 2-3 fix options in plain grade-10 English (what a user would see, trade-offs), a recommendation, whether real-sized purchases hit it, and whether the fix is engine or calculator/test. Decision IDs only after the plain words.

## Current Focus

- Fix applied (Option 1) and self-verified; PR open for owner review (not merged).
- next_action: owner reviews the PR; nightly crosscheck should stay green.

## Evidence

- timestamp: 2026-11-12
  checked: run 43208764138 failure output
  found: received (engine) month -887740, expected (plain) -888035. Both fits_uses_net / month_already_short.
  implication: engine figure is 295 cents higher (less negative).

- timestamp: 2026-11-12
  checked: replay of the counterexample fixture (scratchpad cs/src/one.test.ts, cs/one.json)
  found: engine split = extra_savings 18027 + emergency 881731 = 899758 (price, tax included so nothing added, + 500 fee). afterBuy.before -6009, month -887740 = -6009 - 881731. engine cash = {kind net, lowest 2026-11-03 -755146, added 755146}; ladder netUsed 881731 > 755146 so protectedUsed = 881731. spare.unspent = -295 (balance 5714 + month -6009).
  implication: engine lends the net exactly price - extra savings; the path dip (with the sale on 11-04) needs less.

- timestamp: 2026-11-12
  checked: plain freshAnswer (plain.ts 806-856) and netDipFigure (783-790) by hand with replay values
  found: recordsFresh = true (1 Nov, nothing logged, synced 10-31). usualLeft -6009, need = max(0, 899758 - max(0, -295) - 18027) = 881731 (same as engine). But margin = min(pathLowest, money) + above, money = monthEnd + laterMoney + brought = (5714 - 6009 - 899758) + 0 + 0 = -900053 (sale on 11-04 > buyDay 11-01 so brought = 0). margin = -882026, dip 882026 > need, fromNet = 882026, extra 17732, month = -6009 - 882026 = -888035.
  implication: the 295 is the signed earlier-money hole carried in through the money test, which the ladder (both sides) clamps to 0 (D-56).

- timestamp: 2026-11-12
  checked: variants of the fixture (scratchpad cs/src/two.test.ts)
  found: balance 6009 (no hole) -> both -887740, diff 0. balance 4000 (hole 2009) -> diff 2009. pay +10000 (month not short, no hole) -> diff 0. no tax, no fee -> diff still 295. sale on buy day -> diff 0. price $500 with $300 sale later -> diff 295. no sale -> both -894044 (path dip binds on both).
  implication: diff == the earlier-money hole exactly; needs fresh-records branch + sale after the buy day + a hole + net used. Tax, fees, goals, rounding are not involved.

- timestamp: 2026-11-12
  checked: physical check of engine's loan on the path
  found: with 881731 from the net, the lowest day (11-03) is -755146 + 881731 = +126585 and month end is +874055; every day of the 90-day path stays at or above 0.
  implication: the extra 295 the calculator lends is never needed on any day; it is this month's own shortfall (already inside the -6009 figure) counted a second time.

- timestamp: 2026-11-12
  checked: the unexplained 165,495-cent replay variant (scratchpad cs/src/two.test.ts "notFresh", everydaySoFar 100 on the original fixture), with follow-up variants (three.test.ts)
  found: that variant set everydaySoFar 100 but left billsPaid 0, billsDue 0 and received 0, on a 1 November fixture whose usual bills are 165,495 and whose pay lands today. Plain's records branch reads this month's bills as paid + due = 0; the engine still counts the usual recurring bills (month.billsDue 165495). Diff = 165,495 exactly (153,672 with no sale, same cause). Stating the bills as due (billsDue 165495, everydaySoFar 100) gives diff 0; also 0 with received = pay and balance moved to match, and 0 with balance 5614. fixtureArb: firstOfMonthArb always draws thisMonth all 0; midMonth always draws billsDue = bills - billsPaid; no arbitrary sets everydaySoFar > 0 with billsPaid + billsDue = 0.
  implication: the variant was self-contradictory (spending logged but a month with $1,654.95 of usual bills says no bills paid or due). The generator never produces it. Not a second issue under the crosscheck's input rules. (Open question for the owner only if such input can come from the app: both sides would need a rule for "logged spending, bills not stated".)

- timestamp: 2026-11-12
  checked: regression case "seed 482693972, path 9124" in crosscheck/table.test.ts, before and after the plain.ts fix
  found: BEFORE (old plain.ts): 1 failed, 1 passed (plain afterBuy -888035, expected -887740). AFTER: 2 passed.
  implication: the case pins the bug and the fix.

- timestamp: 2026-11-12
  checked: npx tsc --noEmit; eslint on the two changed files; npm run test:crosscheck at default settings (1000 runs, seed 527606704)
  found: tsc exit 0; eslint exit 0; 2 suites, 113 tests passed (compared 861, 31 plans, 861 limits).
  implication: no type, lint or default-run regressions.

- timestamp: 2026-11-12
  checked: CROSSCHECK_RUNS=20000 CROSSCHECK_SEED=482693972 crosscheck.test.ts after the fix
  found: 3 passed, 3 total (compared 17032, skipped PLAIN-PLANS 2968; borrowing 905 plans, 529 borrowed; limits 17032). Exit 0.
  implication: the failing nightly seed is green, including path 9124 and the unrated-account variant.

- timestamp: 2026-11-12
  checked: CROSSCHECK_RUNS=20000 on a fresh random seed 173450165
  found: 3 passed, 3 total (compared 17049, skipped PLAIN-PLANS 2951; borrowing 843 plans, 475 borrowed; limits 17049). Exit 0.
  implication: no new disagreement from the change.

## Eliminated

- hypothesis: tax-included rounding (8.25% QC) causes the 295
  evidence: taxIncluded true adds nothing on both sides; no-tax variant still differs by 295
  timestamp: 2026-11-12
- hypothesis: one-off fee or goal money (goal1 18027 in n1) handling
  evidence: both sides use extras 18027 vs 17732 only as a consequence of the net amount; diff tracks the balance hole, not fee/goal
  timestamp: 2026-11-12

## Resolution

root_cause: Plain calculator freshAnswer (src/engine/decide/v3/__tests__/crosscheck/plain.ts ~824-840) passes margin = min(pathLowest, money) + above to netDipFigure. The month-end money test excludes a sale arriving after the buy day, so when the money on hand plus this month's figure is below 0 (a "hole"), the net loan is inflated by that hole. The engine (judge.ts oneOffPart/ladder + cash/path.ts added) lends max(ladder need, purchase-added 90-day path dip) and is right per FIN-02 (path must stay above the net), D-35 (a dip there without the purchase is not the purchase's), D-56 (spare money never below 0), D-87 (big number is this month only).

fix: OWNER CHOSE Option 1 (2026-11-12), calculator/test only, no engine change: in plain.ts freshAnswer keep the month-end money test for fits-vs-not-yet, but size the net loan from the day-by-day path only (pass low + net.above to netDipFigure instead of margin). Pin seed 482693972 path 9124 as a fixed regression case. Also check the unexplained 165,495-cent variant (spending already logged this month): confirm the fixture was self-contradictory, or report it as a second issue.
  APPLIED: plain.ts freshAnswer adds pathMargin = low + net.above and passes purchaseMargin(f, pathMargin, pathLowest) to both netDipFigure calls (the second call, margin >= 0, gives the same result either way); margin still drives fits vs Not yet. Regression case added in table.test.ts.
verification: regression case seed 482693972 path 9124 fails before the fix (plain -888035 vs -887740) and passes after; crosscheck 20000 runs on seed 482693972 3/3 passed; 20000 runs on fresh seed 173450165 3/3 passed; npm run test:crosscheck default (seed 527606704) 113/113 passed; tsc --noEmit exit 0; eslint on changed files exit 0. The 165,495-cent variant was a self-contradictory fixture (logged spending, but no bills paid or due on a month with usual bills); the generator never draws it.
files_changed: [src/engine/decide/v3/__tests__/crosscheck/plain.ts, src/engine/decide/v3/__tests__/crosscheck/table.test.ts]
