---
status: awaiting_human_verify
trigger: "Decide v3 invariant I9 'a cheaper price is never worse' can fail on random seeds at nightly strength (FC_RUNS=2000); diagnose only, owner approves the fix"
created: 2026-11-12
updated: 2026-11-12
goal: find_and_fix
---

# Debug: I9 "a cheaper price is never worse" (cent-level D-68 edge)

## Symptoms

DATA_START
- **Expected:** I9 in src/engine/decide/v3/__tests__/invariants/monotone.test.ts holds for every draw at nightly strength (FC_RUNS=2000): a cheaper price never gets a worse answer.
- **Actual:** fails on some random seeds. Known counterexample (random seed -1745555528; details in C:\dev\fincwin-nt\.planning\debug\nightly-decide-invariants.md, Follow-up section): $1.18 vs $1.00 on 13 weekly 0% payments, first one period out, Sam persona with a usual month already 2.75 short. $1.18 rounds to 10-cent payments, so only 12 periods pay and the plan ends inside 90 days: D-68 judges it by cash (fits_unspent, Small). $1.00 pays 8 cents in all 13 periods, the 13th on day 91, so D-68 does not apply: monthly_short / month_already_short. The cheaper price gets the worse answer.
- **Timeline:** pre-existing (same result with the PR #105 fix stashed). Main at 43e6f48b includes PR #105. The manual nightly on 4cb251b2 (run 43178909274) was green because the random seed missed this case.
- **Stakes:** a chance red nightly breaks the 3-green-nights count that 05.4-45 needs. Real prices are rarely this small, but check whether the same split (plan just inside vs just outside the 90-day window because of payment rounding) can happen at realistic prices.
- **Secondary check:** does the 9 Nov crosscheck borrowing failure (run 42611020569, random seed 224530963: expected fits_by_borrowing/borrowing_costs_more, got fits_by_borrowing/null) still reproduce on current main? Brief yes/no plus a one-line cause if found.
DATA_END

## Constraints

- Work only in C:\dev\fincwin-i9 (branch fix/i9-cheaper-never-worse, off origin/main 43e6f48b). Run `npm ci` here first. Never touch C:\dev\fincwin (other sessions switch branches there).
- DIAGNOSE ONLY. Do not change engine or property code. The owner decided on 2026-11-12 to approve any fix first, because it touches the D-68 90-day window rule.
- Deliverable: root cause, plus 2-3 fix options in plain grade-10 English. Each option says what changes for a real user, and its trade-offs. End with a recommendation. Name the decision IDs (D-68 etc.) only after the plain words.
- engine/ must not import from db/state/services/ui/react. Money in integer minor units.

## Current Focus

reasoning_checkpoint:
  hypothesis: "D-68's window test reads s.lastPaying (rounding-dependent payoff period), so a dearer tiny plan can clear a period early, land inside 90 days and get the cash judgement while the cheaper one does not"
  confirming_evidence:
    - "seeded replay (-1745555528, 2000 runs) fails on 43e6f48b; shrinks to sam 0% 13 weekly 118 vs 100: fits_unspent vs monthly_short"
    - "riley 9% 13 weekly 119 vs 100 (tweak everyday 135, emergency 3,744,409) reproduces: fits_unspent/month_short_small vs monthly_short/month_already_short"
  falsification_test: "after switching the window test to the date of payment number count, the pinned pairs still differ or the seeded replay still fails"
  fix_rationale: "count is what the person chose and does not depend on price; the window then cannot flip with rounding slack"
  blind_spots: "quoted payments that clear early (L-09) and 0-financed plans now use count too; may move other answers (check I44 digests)"
- next_action: owner reviews PR #108 (narrowed in a0c59253; do not merge from this session); then archive to resolved/ and add a knowledge-base entry

## Evidence

- timestamp: 2026-11-12
  checked: judge/shortPlan.ts:71, plan/schedule.ts:98-99 + 155-169, payoff/amortise.ts:61-80 + 139-145
  found: D-68's window test is `paymentsInRange(s, asOf, asOf+90).length !== s.lastPaying` -> null. lastPaying = amortise().months = the last period with a non-zero payment (walk.lastMonth), not the count asked for. At 0% the level payment is ceil(P/n); the walk clamps each payment to what is owed, so when ceil(P/n)*(n-1) >= P the balance clears early and lastPaying < n. 118/13 -> 10c: 11x10 + 8 = 118 in 12 payments (last on day 84, inside). 100/13 -> 8c: 12x8 + 4 in 13 payments (13th on day 91, outside).
  implication: whether D-68 applies depends on lastPaying, and lastPaying is not monotone in price at cent level (a higher price can pay off in fewer periods because the rounded-up payment carries more slack). So the cheaper price falls outside the window and loses the cash judgement.
- timestamp: 2026-11-12
  checked: judge.ts:738 planReadyBy uses the same `inside` test (lastPaying)
  found: the ready-date path uses the same lastPaying window check, so a fix should change both places (or one shared helper).
  implication: fix scope = shortPlan.ts:71 and judge.ts:738.
- timestamp: 2026-11-12
  checked: scratch replay of I9 with seed -1745555528, numRuns 2000, endOnFailure, on 43e6f48b
  found: fails at path 1324: riley, asOf 2026-10-03, 13 weekly payments at 9% APR, first one period out; $1.19 -> fits_unspent / month_short_small with short_plan_from_cash; $1.00 -> monthly_short / month_already_short with depletion_payment. (A sibling of the recorded $1.18/Sam 0% case; same mechanism.)
  implication: reproduces on current main; same D-68 window split.
- timestamp: 2026-11-12
  checked: scratch schedule check, 13 weekly 0% one_period, asOf 2026-11-12
  found: (scratch zzScratchI9 'repro' test) 118 -> payment 10, final 8, lastPaying 12, allInside true; 100 -> payment 8, final 4, lastPaying 13, allInside false
  implication: confirms the mechanism directly at schedule level.
- timestamp: 2026-11-12
  checked: crosscheck borrowing, CROSSCHECK_RUNS=20000 CROSSCHECK_SEED=224530963, on 43e6f48b
  found: still fails (path 1873). Cash route: engine not_yet / not_covered with readyBy {month 2026-11}; D-80 cashSoon reads a month as its last day (30 Nov, 46 days > 31) -> variant null. Plain plainCashReady returns {date 2026-11-01} (path dips and pay lands in the ready month) -> 17 days -> short wait -> borrowing_costs_more.
  implication: separate issue: engine and plain disagree on the cash route's ready date shape (month vs payday) for a path that dips and is not covered by the next pay.
- timestamp: 2026-11-12
  checked: scratch enumeration of buildSchedule + paymentsInRange: cadences week x1/x2/x3 and month x1, first today / one_period, asOf 2026-11-12 and 2026-01-31, counts M+1..M+3 (M = most payments a plan can have inside 90 days), financed 1c..$50
  found: largest financed amount where rounding pulls a too-long plan inside the window: $1.69 at 0% APR (= 13^2 cents, the analytic bound ceil(P/n)*M >= P -> P <= M^2 at n = M+1); $2.21 within 0-30% APR (11%); $3.18 at 999% APR. All: weekly x14, first payment today, lastPaying 13.
  implication: no realistic financed amount (above about $3.20) can hit the split. The bound is on the AMOUNT FINANCED (price - deposit - trade-in, purchase.ts:304), so a real price with a deposit leaving a dollar or two financed could hit it in principle. A user-entered quoted payment also clears early (purchase.ts:129-158, L-09), but with the quote fixed a cheaper price only clears sooner, so it cannot break I9.

- timestamp: 2026-11-12
  checked: pinned tests in invariants/monotone.test.ts (sam 118 vs 100 at 0%; riley 119 vs 100 at 9%, tweak everyday 135 / emergency 3,744,409) on unfixed code
  found: both RED: hi = fits_unspent / month_short_small (short_plan_from_cash), lo = monthly_short / month_already_short (rank 2 < 8)
  implication: regression tests reproduce the bug
- timestamp: 2026-11-12
  checked: after fix (chosenPaymentsBefore in plan/schedule.ts, used by judge/shortPlan.ts and judge.ts planReadyBy)
  found: pinned tests GREEN (both prices monthly_short / month_already_short); seeded I9 replay (seed -1745555528, 2000 runs) passes; tsc clean; eslint 0 errors
  implication: fix works for the known counterexamples

- timestamp: 2026-11-12
  checked: narrowing (owner "rounding only"): lastPaymentBefore in plan/schedule.ts reads lastPaying when schedule.source === 'quoted', else count
  found: new pinned test (Sam, $300, 13 weekly 0%, one period out, quote $30 -> 10 payments, last day 70) is RED on 11d3476c (monthly_short) and GREEN after (fits_unspent / month_short_moderate, short_plan_from_cash). With main's engine files (43e6f48b) it is also green and the two I9 pins are red, so the quoted answer matches main.
  implication: quoted early payoff is back to its pre-PR-#108 answer; the I9 rounding fix stays.

## Eliminated

- hypothesis: the split can happen at realistic prices (above $5)
  evidence: enumeration max $3.18 financed (999% APR), $2.21 at 0-30% APR; analytic bound M^2 cents with M <= 13 weekly payments in 90 days
  timestamp: 2026-11-12

## Resolution

root_cause: D-68's "every payment inside 90 days" test (judge/shortPlan.ts:71, also planReadyBy judge.ts:738) compares paymentsInRange(...).length with s.lastPaying. lastPaying is amortise()'s last period with a non-zero payment (payoff/amortise.ts:61-80 clamp + :143-145 months = walk.lastMonth; plan/schedule.ts:98-99), not the count the person chose. The level payment is rounded UP to the cent (D-64), so for tiny financed amounts the rounding slack can pay the plan off a whole period early (118c/13 -> 10c x 11 + 8c = 12 payments; 100c/13 -> 8c x 12 + 4c = 13 payments). lastPaying is therefore not monotone in price: the dearer plan ends on day 84 (inside, D-68 judges it by cash, fits_unspent) while the cheaper ends on day 91 (outside, monthly test, monthly_short). Cent-level only: max financed $1.69 at 0%, $2.21 at <=30%, $3.18 at 999%.
owner_decision_2026-11-12: "Rounding only." Count the chosen payments ONLY when the early finish comes from the engine's own
  round-up of the level payment (D-64). A user-entered quoted payment that clears the plan early (L-09, judge/purchase.ts
  withPayment source 'quoted') keeps the old behaviour: the window reads lastPaying (the real last payment).
fix_prior: OWNER CHOSE Option 1 (2026-11-12): count the payments the person chose. D-68 window test uses the date of payment number count-1 instead of lastPaying, in judge/shortPlan.ts:71 and judge.ts:738 planReadyBy (prefer one shared helper). Pinned regression tests: $1.19 vs $1.00 (13 weekly, 9% APR, one period out, riley, asOf 2026-10-03) and $1.18 vs $1.00 (13 weekly, 0%, one period out, Sam). Then I9 at FC_RUNS=2000 with seed -1745555528, whole invariants dir at 2000, engine suite with coverage (branches stay 100%), tsc. Commit, push, open PR, do not merge.
fix: |
  lastPaymentBefore(s, end) in plan/schedule.ts (was chosenPaymentsBefore): the plan's last payment date < asOf+90, where the last
  payment is s.lastPaying when s.source === 'quoted' (a quote larger than the engine's payment, L-09, really clears early) and
  s.count otherwise ('computed', and 'from_quote' whose periods are still the 0% walk's rounding). Used by judge/shortPlan.ts
  (D-68 shortPlanByCash) and judge/judge.ts planReadyBy. Commits 5a8f6523 (count) + a0c59253 (narrowing, owner 2026-11-12).
verification: |
  After the narrowing (a0c59253):
  - Pinned: both I9 pins green; new quoted pin red on 11d3476c, green now (and green on main's engine code).
  - Seeded I9 replay at 2000 runs: seeds -1745555528, 1, 20261112 all pass.
  - Invariants folder at FC_RUNS=2000: 31/31 suites, 264/264 tests, 0 snapshots written (I44 digests unchanged).
  - Engine suite with coverage: 339 suites passed (1 skipped), 6356 tests passed; branches 100%, functions 100%;
    schedule.ts / shortPlan.ts / judge.ts / purchase.ts 100% branches. No golden or fixture moved.
  - tsc --noEmit clean; eslint on changed files 0 errors (34 pre-existing warnings in monotone.test.ts).
  Answers that change vs main (43e6f48b):
  - Tiny financed plans (engine payment, no larger quote) whose rounded-up payment clears a period early inside 90 days while the
    chosen last payment falls on/after day 90: cash judgement (fits_unspent) -> monthly test (monthly_short). Reachable only up to
    $1.69 financed at 0% ($2.21 at <=30% APR, $3.18 at 999%). Same for planReadyBy's Not yet date.
  - Quote-only plans (no rate, 'from_quote'): the window now reads the count; on main it read the 0% rounding walk's lastPaying,
    which differs from count only in the same tiny-amount rounding case.
  - Plans with a larger quoted payment that clears early: unchanged from main.
files_changed: [src/engine/decide/v3/plan/schedule.ts, src/engine/decide/v3/judge/shortPlan.ts, src/engine/decide/v3/judge/judge.ts, src/engine/decide/v3/__tests__/invariants/monotone.test.ts]

## Specialist Review

- typescript-expert skill (hint: typescript) could not be invoked from the session manager, because no Skill tool was available. Review is deferred to the owner fix-approval step.
