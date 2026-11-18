---
status: resolved
trigger: "Nightly fails on main 9-11 Nov 2026: engine deep checks (2,000 fast-check cases) break 5 decide v3 invariants"
created: 2026-11-12
updated: 2026-11-17
---

# Debug: Nightly decide v3 invariant failures

## Symptoms

DATA_START
- **Expected:** Nightly workflow (engine-deep-checks job) green on main; every decide v3 invariant holds at 2,000 cases.
- **Actual:** Nightly red on 9, 10 and 11 Nov 2026 (runs 42611020569, 42806518513, 43009048752). Latest run, fixed seeds (so it should reproduce every night):
  1. ownerRules.test.ts: I-D72 "the costly-debt caution shows only when the earlier money would cut a 20%+ debt's interest by at least 1.00 a month, and always then". Failed after 541 tests, seed 3442.
  2. answer.test.ts: I31 "the fund stays out of the spending balance: $0 or $1M never moves the suggested figure, notices or confidence, and never worsens the answer". Failed after 283 tests, seed 1347.
  3. answer.test.ts: I31 "a fund that is not set differs from a set one only by the emergency notice and the money the net adds". Failed after 531 tests, seed 1348.
  4. safetyNet.test.ts: I51 "protection off restores the previous result exactly, except protection_off when the net money is used". Failed after 956 tests, seed 1361.
  5. depletion.test.ts: I-D65 "an already-short usual month always gets one of the four tiers, no ready-by date, and no net line while locked (D-66)". Failed after 637 tests, seed 21605.
  Full counterexample paths: `gh run view 43009048752 --log-failed` (job engine-deep-checks).
- **Timeline:** First red nightly 9 Nov. Main moved since then with 05.4 follow-ups, the Decide switch-on (#98) and Grow (#101, merged 11 Nov; it added savings/debt/holdings engine inputs). Check which commit first broke each property (the 8 Nov nightly result and `git log` on src/engine/decide/v3).
- **Reproduction:** in this worktree, run the failing file with the nightly case count (see .github/workflows/nightly*.yml for the env var, e.g. FC_NUM_RUNS=2000) and the seed/path from the log.
- **Stakes:** Decide is on for testers (DECIDE_OPEN, DECIDE_V3 true), so a real engine break may give real people a wrong answer. It also blocks 05.4-45, which needs 3 green nightlies.
DATA_END

## Constraints

- Work only in C:\dev\fincwin-nt (branch fix/nightly-invariants, off origin/main e569f05c). Never touch C:\dev\fincwin (other sessions switch branches there). node_modules: run `npm ci` here (the main checkout's lockfile differs).
- Per failure, decide whether the engine is wrong or the property is too strong. Engine fixes need a regression test pinned to the shrunk counterexample. A property change needs a plain-English reason in the summary and must not weaken the owner rule it encodes. Ask the owner before relaxing any owner rule (I-D72, D-66).
- engine/ must not import from db/state/services/ui/react. Money in integer minor units. Branch coverage must not drop.
- Land via branch + PR (main is protected). Don't merge.

## Current Focus

- hypothesis: no shared cause. 4 properties are too strong (I-D72, I31 x2, I-D65); 1 real engine bug (I51: oneOffPart's 'net' branch drops the payday/not_covered wait logic when the ladder says not_yet).
- next_action: apply engine fix in judge/judge.ts + cash/path.ts (keep the pre-net check on kind 'net'), regression test pinned to ce4; property fixes in ownerRules/answer/depletion tests; then run the 5 files at FC_RUNS=2000 and engine suite with coverage.
- reasoning_checkpoint:
  hypothesis: "I51 fails because withNet() turns a payday/not_covered cash check into kind 'net' whenever net.usable covers the dip, and oneOffPart's net branch then returns the ladder's not_yet as-is, skipping the payday wait logic. So 1 cent in an unused, unprotected net changes 'Not yet, ready on payday 1 Nov' into 'Not yet, not covered, Nov'."
  confirming_evidence:
    - "ce4 (riley, price 100001, net protect:false saved:1): off.cash = {kind:'net', used:1, until:'2026-11-01'}, before.cash = {kind:'payday', until:'2026-11-01'}; off answer not_yet/not_covered/month 2026-11, before not_yet/payday/date 2026-11-01"
    - "judge.ts oneOffPart: net branch `if (part.code === 'not_yet' ...) return part;` precedes the payday branch that would have used `until`"
  falsification_test: "With the fix, ce4's off answer must equal before's (payday, 2026-11-01); if it still differs, the cause is elsewhere."
  fix_rationale: "When the ladder says not_yet, the net lends nothing to the purchase, so the answer must be judged on the check the net replaced. Keeping that check on kind 'net' and re-judging with it restores exactly the no-net answer."
  blind_spots: "Other readers of j.cash (noLimitFacts at judge.ts:962) also see kind 'net' on a not_yet; the fix must cover that too."

## Evidence

- timestamp: 2026-11-12
  checked: gh run list nightly; headSha and failing test names of runs 42363536522 (7 Nov), 42471589491 (8 Nov), 42806518513 (10 Nov), 43009048752 (11 Nov); 42611020569 (9 Nov)
  found: The same 5 properties, same seeds and same paths fail on 7, 8, 10 and 11 Nov. All nightly runs report headSha 0b7c97ae (PR #95, docs-only, before Grow code). 9 Nov failed earlier on a crosscheck borrowing case and never reached the properties.
  implication: The failures date from the first 2,000-case nightly (05.4-43 raised the counts); they are not caused by Grow. The 200-case CI run never reaches these draws.

- timestamp: 2026-11-12
  checked: ce1 (I-D72) evaluated locally
  found: check.replaces.sale (1,767.68) has paysDebtId debt-0 (loan 17,667.59 at 29.9%). Engine facts include sale_counted; replacesEffect drops a debt the sale pays off (replaces.ts:250). Answer fits_unspent, variant null. The property's `qualifies` reads inputs.debts (before the sale).
  implication: property too strong: it counts a debt that the sale pays off. Engine follows D-102.

- timestamp: 2026-11-12
  checked: ce2 / ce3 (I31) evaluated locally with $0 vs $1M fund, and no fund vs $5,000 fund
  found: Without the fund: needs_input + income_volatile notice (the volatile-cover question). With the fund: the money above the net's size (net_above_size) is spare savings and carries the lean months (lean_bridge source savings), so no question is asked and the notice goes. Answer only improves (needs_input -> fits_month / fits_unspent). funds.suggested, spending and confidence unchanged.
  implication: property too strong: the notice is tied to the cover question (D-48) and the spare part of the fund legitimately takes the question away (D-35/D-49, QE-04). The spending balance is untouched.

- timestamp: 2026-11-12
  checked: ce4 (I51) evaluated locally
  found: see reasoning_checkpoint. Cash path short by 1 cent until payday; an unused, unprotected 1-cent net turns the payday check into kind 'net'; ladder says not_yet; net branch returns not_covered with a month ready date instead of payday 2026-11-01.
  implication: ENGINE BUG in judge/judge.ts oneOffPart (net branch). Also affects protected unlocked nets whose usable money covers the dip.

- timestamp: 2026-11-12
  checked: ce5 (I-D65) evaluated locally
  found: $1 one-payment weekly plan at 20% APR, usual month 2.75 short. D-68 judges it by cash (short_plan_from_cash at facts[1], parts.oneOff fits_unspent), tier month_short_small; FIN-05 makes the expensive plan's code fits_by_borrowing. verdictTable.ts has explicit rows fits_by_borrowing.month_short_small/moderate/_extra ("an expensive plan judged by cash (D-68) in an already-short month keeps its D-65 headline").
  implication: property too strong: it was written before FIN-05 met D-68; the engine and the copy table deliberately give this combination.

- timestamp: 2026-11-12
  checked: engine fix applied; regression test red without judge.ts change, green with it; 4 files at FC_RUNS=2000
  found: depletion, ownerRules, answer PASS at 2,000. safetyNet I51 still failed at draw 956, now shrinking to a second case: $810.01 one-payment weekly plan at 20% APR, $810.00 spare, 1 cent unprotected net. Only the save_vs_borrow line moved: 'with_net' (paying cash now dips into the net) vs 'ready' 2026-11 with an empty net. The plan's own answer is identical.
  implication: second I51 shape is property-too-strong: the cash route of the comparison line is the thing using the net money, which I51's own exception ("except when the net money is used") covers for the main answer but not for this line. Property extended for that line only; I51 then PASS at 2,000.

## Eliminated

## Resolution

- root_cause: No shared cause, and not Grow (same 5 failures since the first 2,000-case nightly on 7 Nov). (1) I51: real engine bug in judge/judge.ts oneOffPart: when the net's usable money carried a payday/not_covered dip (cash kind 'net') but the ladder said not_yet, the ladder's not_yet was returned as-is, skipping the payday wait logic, so any money in the net (even 1 cent, unprotected) turned "Not yet, ready on payday" into "Not yet, not covered" with a month date; the no-overdraft-limit facts were also dropped. (2) I-D72, I31 x2, I-D65: properties too strong (sale paying off the debt per D-102; spare fund money above the net size carrying lean months removes the D-48 question and its notice; FIN-05 + D-68 expensive cash-judged plan keeps the D-65 tier on fits_by_borrowing per verdictTable).
- fix: cash/path.ts: kind 'net' keeps `before` (the failed check it replaced; new FailedCash type). judge/judge.ts: net branch re-judges on `before` when the ladder says not_yet; noLimitFacts read `before` when the one-off waits. Regression test pinned to the shrunk seed-1361 case. Property fixes in ownerRules (debts after the sale), answer (income_volatile may drop only when the fund-bearing side carries the low months with lean_bridge), depletion (fits_by_borrowing allowed for a D-68 plan whose one-off part is a cash fit).
- verification: Regression test red without the judge.ts change, green with it. Whole invariants dir at FC_RUNS=2000 (as nightly): 30/31 suites pass incl. all 5 targets; the only failure is monotone I9 on a random seed (-1745555528), pre-existing and unrelated (same result with judge.ts fix stashed; see Evidence). Engine suite with coverage: 6352 passed; only I44 digests failed because of the new cash.before field; digest now strips it (like goalsOutside / exactInterestBp) and all 2,000 digests match unchanged, so the fix moved no answer in those draws. Engine coverage Branches 100% (9769/9769), Functions 100%; src/engine/statement/ 99.88% statements is untouched by this change. tsc clean.
- files_changed: src/engine/decide/v3/__tests__/invariants/prepare.test.ts, src/engine/decide/v3/cash/path.ts, src/engine/decide/v3/judge/judge.ts, src/engine/decide/v3/judge/__tests__/judge.test.ts, src/engine/decide/v3/__tests__/safetyNet.test.ts, src/engine/decide/v3/__tests__/invariants/safetyNet.test.ts, src/engine/decide/v3/__tests__/invariants/ownerRules.test.ts, src/engine/decide/v3/__tests__/invariants/answer.test.ts, src/engine/decide/v3/__tests__/invariants/depletion.test.ts

## Follow-up (not fixed here)

- [owner 2026-11-12: separate debug session after PR #105 merges] monotone I9 "a cheaper price is never worse" (random seed, not fixed): $1.18 vs $1.00 on 13 weekly 0% payments, first one period out, Sam with a 2.75 short usual month. $1.18 rounds to 10-cent payments, so only 12 periods pay and the plan ends inside 90 days: D-68 judges it by cash (fits_unspent, Small). $1.00 pays 8 cents in all 13 periods, the 13th on day 91, so D-68 does not apply and it is monthly_short / month_already_short. Pre-existing (same with the fix stashed), cent-level prices only. Touches the D-68 90-day window rule, so the owner should decide. It can make a nightly red by chance.
- 9 Nov nightly: crosscheck borrowing (random seed 224530963) expected fits_by_borrowing/borrowing_costs_more, got fits_by_borrowing/null. Not investigated.

## Closed 2026-11-17

- The fix merged as PR #105 (c59ab0d5). Both follow-ups were fixed later: monotone I9 by fix/i9-cheaper-never-worse, and the crosscheck borrowing mismatch by PR #133 (fixed PR seed, random seed nightly only).
- Nightly on main: green on 2026-11-16 and 2026-11-17 (the 2026-11-15 red was the #133 crosscheck case). Filed from the fincwin-nt worktree.
