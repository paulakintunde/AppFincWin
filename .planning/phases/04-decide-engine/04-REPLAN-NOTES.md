# Phase 04 Replan Notes (2026-10-15)

The plans were replanned non-interactively against the updated 04-CONTEXT.md (D-23 to D-36; amended D-11, D-12, D-16 and D-22). Wherever the plan-phase workflow would have asked the user, the recommended or default option was taken. Each choice is recorded below so the user can review it.

## Workflow choices taken by default

| Workflow step | Choice | Why |
|---|---|---|
| 5. Research | Kept the existing 04-RESEARCH.md. Added a short codebase-facts addendum and did no web research. | Research existed, and the decisions were already settled. |
| 5.6. UI gate | Skipped. | The phase is a pure TypeScript engine (ROADMAP "UI hint: no"). |
| 5.7. Schema push | Not applicable. | No migrations are in scope. |
| 6. Existing plans | Replanned with targeted revisions. 04-01 to 04-04 were left unchanged, and the rest were revised. | The update touches the money basis, assess, first read and the tests. Payoff and the harness are unaffected. |
| 7.8. Pattern mapper | Skipped. | 04-PATTERNS.md already existed. |
| 9. Split | Added a new plan, 04-13 (deriveMoney over Record lines), in wave 3, rather than growing 04-05. The phase still has 6 waves. | Keeps 04-05 within context budget. |
| 11/12. Checker | Iteration 1 passed with 0 blockers, 1 warning and 4 info items, all fixed by hand (see below). D-36 was then added to CONTEXT and folded into 04-05, 04-07, 04-08, 04-11 and 04-12. Iteration 2 passed with 0 blockers, 0 warnings and 2 info items (both about nullable `size`; see interpretation 10). | |
| 13a. Decision coverage | `check.decision-coverage-plan` passed, 35 of 35. D-36 is cited in the must_haves of 04-05, 04-07, 04-08, 04-11 and 04-12; the gate's parser did not count it as a separate trackable item. | |

## Interpretations made where CONTEXT is silent or ambiguous

These are recorded for the user's review.

1. **D-24 window.** The window runs from the 1st of the check's month to the check date plus 90 days. It counts only occurrences after `lastPaidDate`. An unpaid occurrence earlier in the current month is still deducted. Unpaid occurrences in earlier full months count as history and are never deducted. A quarterly bill can contribute two occurrences.
2. **D-24 and skipped occurrences.** `lastPaidDate` is the last *settled* occurrence, meaning paid or skipped. A skipped cycle is therefore not deducted, which is consistent with D-28 ignoring skipped lines. The snapshot builder sets it (Phase 5).
3. **D-23 scope.** (superseded by D-60 for income, see below) Only outflow series that are not monthly are smoothed. Income series are not smoothed, because D-23 speaks of bills. Ended series are left out by the builder, so their past lines count as ordinary spending.
4. **D-33 and D-35 on invest checks.** D-35 relief does not apply to invest checks: any shortfall goes to `month` and the state is `no`. Pausing old investing to fund new investing is the circularity that D-33 names. Invest checks also get no `dsr` or `owe` warning, because "only month and cash apply" is read literally.
5. **D-31.** The fact code is `debt_rate_exceeds_return`, with payload `{ debtId, debtApr, projectionReturn }`. It sits in a separate `facts` array on the verdict, not in `warnings`. It is emitted on invest checks only. Unsecured debts with no APR are ignored, and ties go to the smallest id.
6. **D-16.** A currency mismatch throws a `RangeError`, consistent with the engine's other input guards. It does not return a `missing` reason code.
7. **D-12 amended.** An explicit `basisOverride` still wins, because D-12 says "defaults to".
8. **D-34 in golden parity.** The 04-11 adapter sets the existing-spending rule to `mine` in household scenarios. This reproduces the prototype's unshared existing spending.
9. **D-36 in household scope.** The size code compares *my* part of the price (purchase share) against `leftBefore` and against cash, consistent with D-34. It is computed as if the price were paid in cash, whatever the plan's method (a buy uses the check price; an invest check uses the check amount).
10. **D-36 `size` on missing verdicts (needs user confirmation).** `Verdict.size` is `null` only when `prepareContext` itself fails (no full month, or a split whose weights sum to zero), because there is no `leftBefore` or reserve to compare against. A verdict missing only for payment terms still carries a size, and a first read (the path for users with no full month) always carries one. Phase 5 should branch on null and use the first read. If every verdict must carry a non-null size, a rule for the no-full-month case is needed.

## Checker follow-ups applied by hand

- **04-02:** The `share.ts` docblock now cites D-34 rather than "the same share for the cushion".
- **04-05:** The `lastPaidDate` comment now says "paid or skipped" (interpretation 2).
- **04-07:** The docblock records interpretation 4.
- **04-09 and 04-10:** Docblocks must not name the raw cash field, because the acceptance greps count comments.
- **04-05 `MARKET_DEFAULTS` placement:** Left as planned. It is builder-facing data and is never imported on the verdict path. 04-12 has a grep gate that checks this.

---

# 2026-10-15 expansion: D-41 to D-58 (engine depth expansion)

The plans were replanned non-interactively (22 plans in 8 waves: 04-01..04-13 kept, 9 amended; new 04-14..04-22) against 04-CONTEXT D-41..D-58 and the "Consistency amendments (user, 2026-10-15, after the plan review)". Wherever the plan-phase workflow would have asked the user, the recommended default was taken. Every choice is recorded here so the user can review it. **Items marked (needs user confirmation) change verdicts and should be confirmed before 04-17/04-07 execute.**

## Workflow choices taken by default

| Workflow step | Choice | Why |
|---|---|---|
| 5. Research | Ran gsd-phase-researcher in addendum mode. Appended "Addendum 2026-10-15: Engine depth expansion (D-41..D-58)" (sections A–H) to 04-RESEARCH.md; existing content untouched. | D-58 requires sourced thresholds; D-57 needs reference tables; D-48/D-50 need credit mechanics. |
| 5.6. UI gate | Skipped. | Pure TypeScript engine (ROADMAP "UI hint: no"). |
| 5.7. Schema push | Not applicable. | No migrations. D-47's `one_off` row field is Record/Phase 5 work (05 D-29). |
| 6. Existing plans | Added plans 04-14..04-21; amended 04-05..04-13 only where contracts, types, constants or composition change. 04-01..04-04 unchanged. | Keeps the D-01..D-40 plans that already passed the checker intact. |
| 7.8. Pattern mapper | Skipped (04-PATTERNS.md exists); new plans name their analogs inline. | Workflow skips when PATTERNS.md exists. |
| 9. Split | No phase split. 22 plans in 8 waves (04-22 split from 04-06 at checker iteration 1); waves of 04-06..04-12 renumbered because of new dependencies. | |
| 11/12. Checker | See "Checker iterations" below. | |

## Defaults taken for open questions (research addendum §E)

1. **D-44 undated spending in the cash path (needs user confirmation).** (settled by D-59: accepted, see below) The 90-day path spreads non-series average spending (and debt minimum payments) evenly by day, so the path never overstates cash. Confirmed series move out of the spread at their monthly equivalent. Saving and investing are not deducted. Pay dated before `asOf` and not received is dropped; an unpaid bill from earlier in the current month is due on day 0. Consequence: a user whose cash sits near the reserve before payday can get a soft `cash_dip` on any check. Alternative for the user: measure the dip only against the path without the purchase (`lowestWithout`).
2. **`cash_dip` and one card per cause (needs user confirmation).** (superseded by D-59, see below) `cash_dip` fires for the extra gap the dated flows add beyond the `cash` card: `max(0, reserve − lowestWith) − max(0, reserve − (cashOnHand − my day-one cost))`. Hard (state `no`) when the lowest balance with the purchase is below 0, soft (`adjust`) otherwise.
3. **D-48 promotional rates.** The check carries a promo `{ apr, months, deferredInterest }`; the loan's or card's own APR is the post-promo rate. `deferredInterest` is user-entered, default false, never inferred, and requires a 0% promo rate. At promo end an open balance takes the accrued interest, reported as `deferred_interest_charged`. Remaining balance is re-amortised at each segment start. Multi-balance payment allocation (Reg Z §1026.53) is out of scope. A promo on a card paid in full is ignored. With a promo, `Plan.monthly` is the highest payment; without one it is unchanged (prototype parity).
4. **D-49 stress with a promo.** Only post-promo segments are stressed; 0% promo segments are not. Without a schedule the single entered APR is stressed. Nothing is stressed unless the plan is flagged `variable`.
5. **D-45 window.** The 12 months after the `asOf` month. Future changes alter the month test, the month table and runway inputs, but not the debt-service line, a month's costs or the cushion. Income and spending floor at 0.
6. **D-50 BNPL.** n is capped at the remaining instalments; an optional user `lateFeeCapTotal` gives min(fee × n, cap). No default cap. A cap without a fee is rejected.
7. **D-53 payback.** Cumulative: the first month where cumulative expected extra income ≥ cumulative cost (my day-one cost + payments to date + running costs to date); null if not reached within the horizon.
8. **D-56 estimate bias.** Mean of per-decision signed percentage gaps, in integer basis points, half-up; null below 3 decisions with actuals for that figure. Decisions with a zero estimate or no actual do not count toward the 3.
9. **Weekly/fortnightly income.** (superseded by D-60, see below) Not changed: no income smoothing added (see "For the user").

## Interpretations made by the planner

10. **D-41 stacking.** All other open checks are stacked (amended D-41). A stacked monthly invest check joins investing and the pausable amount (D-32). Stacked checks keep their full monthly payment across all 12 future months even if their plan ends sooner (cautious). Another check's negative income change applies to the combined position. A stacked check whose plan is `missing` is reported with its reasons and has no effect.
11. **D-46 confidence** is on every verdict, including `missing` ones.
12. **D-55 prompt table.** `vehicle` → insurance, fuel, maintenance, registration, loss of value; `general` → insurance, maintenance, loss of value; other item types → none. Loss of value cannot be entered as a replaced expense.
13. **D-54.** "New payments still met" = cash stays ≥ 0 through the setback with the purchase. "Breaks because of the purchase" = ≥ 0 without it and < 0 with it.
14. **D-52 views.** (b) excludes the day-one cost; (c) holds the investing pause for the whole horizon; (d) holds existing debts constant, keeps saving in cash, does not count the item as an asset, and needs a new snapshot field `investmentBalance`.
15. **Warnings.** The ordered warnings grow to six codes (`month`, `cash`, `cash_dip`, `dsr`, `owe`, `inv`). DEC-06 and ROADMAP SC-3 say "up to five"; ROADMAP SC-3 is updated, REQUIREMENTS DEC-06 wording is left for the user.

## For the user (from research; no D-58 value was changed)

- **12× unsecured line** has no published source; the closest heuristic (20/10 rule, Experian 2023: consumer debt under 20% of annual take-home pay) is five times stricter.
- **Steady weekly and fortnightly pay is classed Variable** (CV ≈ 0.11 weekly, 0.17–0.20 fortnightly, because some months carry an extra payday). That gives a 4.5-month cushion (D-42) and blocks `strong` confidence (D-46). Suggested fix: smooth confirmed weekly/fortnightly income series as D-23 smooths bills. New behaviour — needs a decision.
- **CV 6%/22%, 90-day window, 5% edge, +4pp stress and 60-month horizon** have no published source; they are cited in constants.ts as FincWin behaviour constants. The 36% line (Fannie Mae B3-6-02) is supported and is stricter here because it applies to logged take-home income. Cushion 3–6 months is supported (FCAC, MoneyHelper, Vanguard); 4.5 is FincWin's midpoint. +2pp stress is supported by analogy to OSFI's qualifying rate.
- **D-47 one-off lines** need a `one_off` field on Record rows (Phase 5 / Record, 05 D-29). 04-CONTEXT's deferred list still says one-off lines were "not chosen"; D-47 supersedes it.

## Checker iterations

| Iteration | Result | Fixes |
|---|---|---|
| 1 | 3 blockers, 8 warnings, 4 info | B1: the amendment applied literally — `cashAvailable` (path-aware) feeds only the `cash` check and D-36; new always-deducted `cashAfterBills` / `cashAfterBillsAndPurchase` feed spare cash, `save_first`, wait, setbacks/D-39 runway, income at risk and net worth (PAY + YEARLY_DUE tests added). B2: D-51 applied literally — `byRate` on alternatives and `do_without` from one `projectionRates` list. B3: defaults 1 and 2 recorded above and isolated in `spreadUndatedSpending` / `dipShortfall`. Warnings: credit terms split into new plan 04-22; confidence on missing verdicts from the money basis; D-36 size reads this month's `leftThisMonth`; cross-suite gate moved to 04-12; PATTERNS appended. |
| 2 | 1 blocker, 2 warnings, 5 info | Blocker: the bill-driven `cash_dip` fixture missed a pay day; replaced with BILL_BEFORE_PAY (lowest day 14, 377_808, dip 222_192 soft). Warning: the D-38 cash row reads `cashAfterBills` → `cashAfterBillsAndPurchase` as D-38 says. 04-07's four tasks accepted. |
| 3 | **Passed**, 0 blockers, 0 warnings, 3 info | Cosmetic "cash ledger" → "`cash` check" wording fixed by hand in 04-05, 04-07, 04-21. Info 3 (defaults 1 and 2 need user confirmation) carried to the user. |

`check.decision-coverage-plan` cannot parse the `**D-41: Title.**` heading style, so D-41..D-58 coverage was verified by script: every id appears in at least one plan's `must_haves.truths`.

## User decisions after the expansion replan (D-59, D-60; 04-CONTEXT fd0d275)

- **Default 1 accepted** (D-59): undated spending and debt minimums are spread evenly by day (`spreadUndatedSpending`).
- **Default 2 replaced by D-59:** `cash_dip` fires only when the purchase lowers the 90-day low. `dipShortfall` = max(atReserve, atZero), where atReserve = max(0, min(reserve, lowestWithout) − lowestWith − max(0, min(reserve, cashOnHand) − cashAfter)) and atZero = max(0, min(0, lowestWithout) − lowestWith − max(0, min(0, cashOnHand) − cashAfter)); `CashDipInput` carries `cashOnHand` (cash before this purchase on the positioned context: 04-07 and 04-20 pass `context.cashAvailable`, read only when a path exists; after D-41 stacking it already excludes the other checks' day-one costs, which the raw `snapshot.cashOnHand` would wrongly count as this purchase's cash-card gap, suppressing a dip the purchase causes — revised 2026-10-15; with no other checks the two are equal, so no non-stacked figure changes). Only the part of the `cash` card the purchase itself caused (its day-one cost below the line) is subtracted; a reserve gap that exists before the purchase is not the purchase's (checker W1 on the D-59 revision: the earlier subtraction of the whole gap, max(0, reserve − cashAfter), gave no dip for dayOne 0, cashOnHand 500_000, reserve 600_000, lowestWithout 450_000, lowestWith 350_000; it now gives 100_000 soft). Every fixture figure in 04-07, 04-17 and 04-20 (52_192; 100_000 with the −52_192 fact; 100_000 with the 197_808 fact; 222_192; 102_192; 195_000; the no-lowering null) is unchanged, because each has cashOnHand at or above its reserve. The zero layer keeps "below 0 is hard" when cash on hand is already under the reserve (planner interpretation; review). A dip that exists without the purchase is the basis fact `cash_tight_before_payday` `{ date, amount }` in `facts` (after any D-31 fact) and in `cashPath.tightBeforePayday`; it never changes the state.
- **D-60:** confirmed weekly/fortnightly pay series are smoothed to their monthly equivalent for CV and the income averages (supersedes interpretation 9 and the 2026-10-15 interpretation 3 note "income series are not smoothed"). A month with no paid line of the series gets nothing added (pay is never invented, unlike D-23 bills). Monthly/quarterly/yearly pay and unconfirmed income are not smoothed. Named test `d60-pay-smoothing.test.ts` in 04-13.
- **D-60 reading, partial months (planner interpretation after checker W2; review).** Only months the series spans in full are smoothed. A series spans a month in full when its first scheduled pay date (`anchorDate`) is earlier than the month's first day plus one pay interval (7 days weekly, 14 fortnightly), so no regular payday of the month falls before the series started, and its end (`endDate`, or the last scheduled date when `occurrenceCount` is set) is not in or before the month. Other months count the series' logged lines as they are. Smoothing a partial first or last month would raise it to a full month's pay the user never received: a fortnightly job starting 23 January with one 200_000 payday counts January at 200_000, not 433_333, and January stays the worst month (6 months: average 394_444, volatile, CV 22%). An `endDate` on the month's last day counts as inside the month (logged), which is cautious.
- **`cash_path` margin (planner definition after checker W3; review).** The D-43 `cash_path` line uses the D-59 measure, not `lowestWith − reserve`: `cashPathMargin` = min(roomReserve, roomZero), with roomReserve = lowestWith − min(reserve, lowestWithout) + max(0, min(reserve, cashOnHand) − cashAfter) and roomZero = lowestWith − min(0, lowestWithout) + max(0, min(0, cashOnHand) − cashAfter). It equals −dipShortfall when `cash_dip` fires; otherwise it is ≥ 0, the amount the with-purchase low could still fall (day-one cost unchanged) before a dip would fire. A purchase that does not lower the low therefore passes: 0 (and `on_edge`) when the path already sits below its line without the purchase, 1_197_808 on the 2_000_000 PB fixture. `on_edge` is D-43's 5% against the reserve, or a month's costs when the reserve is 0.
- **Stacking and `cash_tight_before_payday` (checker I3).** Under D-41 the "without" path includes the other open checks, so the fact can come from them; Phase 5 copy must not say "before this purchase" alone (recorded in 04-PHASE5-ALIGNMENT).
- **12× and 36% lines** stay, cited in constants.ts as FincWin behaviour lines (user-confirmed); 36% applies to take-home income.
- **DEC-06** now says up to six warnings (REQUIREMENTS.md, edited by the coordinator).
- **D-36 size null without a full month:** no change; Phase 5 uses the first read.
