# Panel seat 6: consumer protection, model risk and compliance

Reviewer seat: consumer-protection, model-risk and compliance. Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`, 2026-10-25. Read-only: no code, no git.
Read: `.planning/Decision Research/audits/FINANCE-AUDIT.md`, `.planning/Decision Research/audits/LANGUAGE-AUDIT.md`, `src/engine/decide/{assess,money,expectedMonth,cashPath,confidence,constants}.ts`, `src/i18n/locales/en.ts` (decide.*), `src/i18n/__tests__/decideCopy.test.ts`, the judge-on default in `src/features/decide/judgeOn/`.

## Plain-English summary

1. Today the app checks a purchase against "this month so far", which counts only what you have already logged.
2. Early in the month that leaves out most of your normal spending, so almost anything looks like it fits.
3. The 90-day cash forecast has the same gap, so it can assume you spend nothing on food or fuel for three months.
4. A wrong "yes" hurts people more than a wrong "no". The person buys the thing and then runs short.
5. The people most at risk: those paid at irregular times, those who log only some spending, new users, and couples.
6. The owner's idea is the right shape: what is left at the end of a normal month, plus an allowance for occasional costs.
7. It needs guard-rails: a clear "normal month", no double-counting the allowance, and a "not enough data yet" answer.
8. Every answer must say what it is based on, how fresh the data is, and how firm the estimate is.
9. The words must describe the numbers, never tell people what to do, and never say "fits" in one place and "doesn't" in another.
10. Section 3 lists 24 testable safety rules. A new model ships only when all of them pass in CI.

---

## 1. Harm scenarios in the current engine

**Main finding (it adds to the audits).** Under the default basis (`judgeOnStore.ts:43`, default `'month'`), `prepareContext` swaps in `expectedMonthMoney` for both income and spending (`assess.ts:182-184`). That figure counts logged lines plus confirmed series still due, and nothing more (`expectedMonth.ts:185-188`). The same `money` object then goes to the cash path (`assess.ts:217-223`). There the spread of undated spending is `spendingBasis - seriesMonthly`, floored at 0 (`cashPath.ts:184-185`). Early in a month, the logged spending is smaller than the monthly equivalent of all confirmed bills. So **`undated` goes negative, gets floored at 0, and the 90-day path models zero everyday spending for 90 days.** The hard-dip test (`assess.ts:398-408`, `state` at `:428-429`) is the last thing that would turn the answer to `no`, and it is effectively switched off on the default basis. The finance audit (4.1) saw the understatement but not that the floor makes it a total omission.

Likelihood (L) and severity (S) are rated H/M/L. A false yes is rated more severe than a false no of the same size (rule R1).

| # | Scenario | Type | Code | L | S | Who is hurt |
|---|---|---|---|---|---|---|
| H1 | Days 1-20 of a month: unlogged groceries, fuel and dining are missing, so the month shows large spare money and the purchase "fits" (device: laptop $1,200 fits, $841 out vs about $6,264 in the tightest month) | False yes | `expectedMonth.ts:185-188`, `assess.ts:182-184` | H | H | Everyone; worst for those paid early in the month |
| H2 | The 90-day cash path models no everyday spending, so the cash-runs-out test never fires | False yes | `cashPath.ts:184-185` | H | H | People with little cash: the group the test exists to protect |
| H3 | A user logs partially (bills only, or one card only). Every basis understates spending; nothing detects how complete the logging is | False yes | `money.ts` (no coverage measure); `confidence.ts:12-33` | H | H | Casual and new users, partners who do not log |
| H4 | Confidence ignores the basis. A "Strong" or "Fair" pill sits on a day-3 partial month, because confidence uses history months only | Overconfidence | `assess.ts:559`, `confidence.ts:27` | H | M | Everyone using the default |
| H5 | A confirmed income series still due is counted as certain (a late invoice, lost shifts, a client who does not pay) | False yes | `expectedMonth.ts:171-182` | M | H | Gig, freelance and commission workers |
| H6 | Pending income counts as paid | False yes | `expectedMonth.ts:136-138` | M | M | Anyone with a disputed or held deposit |
| H7 | One-off income logged this month (a bonus or a refund mislabelled as income) counts in full, inflating the month and the DSR denominator | False yes | `expectedMonth.ts:186`, `assess.ts:352-356` | M | M | Bonus earners |
| H8 | Before payday, this month's income is near 0, so the DSR line is breached or the month is short: "Doesn't fit" for a small buy | False no | `assess.ts:352-356` with month income | M | L-M | People paid late in the month |
| H9 | Average basis is a mean, so one windfall month inflates income for 6 months | False yes | `money.ts:291-292` | M | H | Bonus or property-sale households; test data has a $150M month |
| H10 | Worst basis pairs min income with max spending from different months, so one bad month gives a permanent no | False no | `money.ts:273-286` | H | M (avoidance, disengagement) | Irregular income; anyone with one big repair month |
| H11 | One zero-income month sets income to 0 on the worst basis: every check fails | False no | `money.ts:284`, ME-05 note `assess.ts:349-351` | M | M | Seasonal workers, parental leave |
| H12 | Outlier months are excluded only when the user flags lines as one-off. Unflagged lumpy costs (car repair, vet) inflate worst; flagging them all hides real recurring risk | Both | `money.ts:129-136` | H | M | Everyone with irregular costs |
| H13 | With 1-2 full months the engine still gives fits/adjust/no; only the pill says rough | Overconfidence | `confidence.ts:24`, `money.ts:301` | H | H | New users: the first impression |
| H14 | Cash = every cash-like account, so money mentally reserved (tax, deposit, partner's) is treated as spendable | False yes | `buildSnapshot.ts` balances loop (finance audit 4.7) | M | H | Self-employed (tax), couples |
| H15 | Stale data: queued writes failed ("22 changes couldn't save") or balances not updated, yet the answer shows no freshness note | Both | finance audit 4.10 | M | M-H | Offline users, manual-balance users |
| H16 | Household: the partner's unlogged spending and shared cash split. The share rules exist, but there is no check that both partners log | False yes | `share.ts`, D-34 | M | H | Households (Phase 8) |
| H17 | Saving and pension contributions are paused to make a purchase "fit"; amber reads as passable | Soft false yes | `assess.ts:374-381`, `:425` | M | M | Savers with employer match |
| H18 | Uniform cushion breach: $1 under and $26,000 under both read "Needs adjustment" | Severity masking | `assess.ts:412-414` | M | H | Low-cash households |
| H19 | Contradictory text: green "It fits" over a red tightest-month row; "Not from cash" chip with "Cash covers it" body | Misleading net impression | LANGUAGE-AUDIT 1.3 #1, FINANCE-AUDIT 4.5 | H | H | Skimmers: most users (NN/g 79% scan) |
| H20 | A size label from the month spare: on day 3 a $1,800 sofa reads "Paid from this month's spare" | False yes framing | `assess.ts:299-302` with `leftThisMonth` | H | M | Everyone |
| H21 | Pre-existing deficit: every purchase reads `no`, so users learn to ignore the card | False no / alert fatigue | `assess.ts:375-381` (finance audit 4.4) | M | M | Already-stretched users (vulnerable) |
| H22 | 28/36/12 lender lines applied to take-home pay and presented as the user's own lines | Authority illusion | `constants.ts:40-50` | H | L-M | Everyone; reads as a credit assessment |

The common thread: H1-H7, H13 and H20 come from one design choice. **The default answers "what has happened so far" when the question is "what will this month look like".** Fix that, and most of the false-yes cases go away.

---

## 2. Research: what the rules and evidence say

FincWin is not an FCA-authorised firm, not a bank, and not a lender, so most of these are **benchmarks for good conduct**, not binding obligations. The FTC Act, consumer-protection law in each store market, and the store rules apply regardless.

1. **FCA Consumer Duty, consumer-understanding outcome, PRIN 2A.5.3R.** Communications must "meet the information needs", be "likely to be understood", and "equip retail customers to make decisions that are effective, timely and properly informed". They must also be "clear, fair and not misleading". PRIN 2A.5.10R: test communications before release and monitor them afterwards. 2A.5.12G lists vulnerability and potential for harm as reasons to test. https://handbook.fca.org.uk/handbook/PRIN/2A/5.html (fetched).
2. **FCA, Consumer understanding: good practice and areas for improvement (13 Mar 2026).** Test with real customers before and after changes, including vulnerable cohorts. https://www.fca.org.uk/publications/good-and-poor-practice/consumer-understanding-good-practice-areas-improvement (via search and secondary coverage, e.g. https://www.regulationtomorrow.com/2026/03/fca-publishes-good-practice-and-areas-for-improvement-in-relation-to-consumer-understanding-under-the-consumer-duty/).
3. **FCA FG21/1, fair treatment of vulnerable customers.** A vulnerable customer is "especially susceptible to harm". The drivers are health, life events, resilience and capability (the four drivers are from memory; check the PDF). Low resilience (little cash, irregular income) is exactly the H2/H5/H18 group. https://www.fca.org.uk/publication/finalised-guidance/fg21-1.pdf
4. **CFPB UDAAP.** Deception = material, likely to mislead, and the consumer's interpretation is reasonable. Exam procedures: https://files.consumerfinance.gov/f/documents/cfpb_unfair-deceptive-abusive-acts-practices-udaaps_procedures.pdf . Whether FincWin is a "covered person" hinges on "financial advisory services to consumers on individual financial matters" (12 U.S.C. 5481(15)(A)(viii), https://www.customsmobile.com/uscode/12/5481). *CFPB v. Aria* (9th Cir. 2022) read that prong broadly (https://severson.com/appellate-category/5536). A tool that gives a personalised "it fits" on someone's own finances is closer to that line than a passive ledger. Treat UDAAP as live risk, not theory.
5. **FTC Deception Policy Statement (1983).** The "net impression" doctrine: a prominent claim is not cured by fine print, and a reasonable consumer may skim. A green "It fits" headline with the condition in an ⓘ is the textbook pattern. https://www.ftc.gov/system/files/documents/public_statements/410531/831014deceptionstmt.pdf
6. **SR 11-7 (Fed/OCC, 2011), model risk principles.** Model risk comes from fundamental errors and from incorrect or inappropriate use. Validation means conceptual soundness, ongoing monitoring and outcomes analysis (back-testing). It calls for effective challenge, documented assumptions and limitations, and conservatism when uncertainty is high. These are bank-only rules, but they are the right discipline for Decide. https://www.federalreserve.gov/supervisionreg/srletters/sr1107.htm (the fetch returned 404 today; principles from memory and from https://docs.validmind.ai/about/use-cases/sr-11-7.html).
7. **Apple App Store Review Guidelines** (fetched 2026-10-25). 3.2.1(viii): "Apps used for financial trading, investing, or money management should be submitted by the financial institution performing such services and must have necessary licensing". 2.3: metadata must "accurately reflect the app's core experience". 1.1.6 bans "false information and features" ("for entertainment purposes" does not cure it). 5.1.1(v): in-app account deletion. 3.2.2(ix) (36% APR / 60 days) applies to loan apps only. https://developer.apple.com/app-store/review/guidelines/ . Note for the Compliance phase: "money management" is named in 3.2.1(viii) itself. The defence rests on "performing such services": FincWin holds and moves no money. That defence is arguable, not settled, as CLAUDE.md already warns.
8. **Google Play Financial Services policy.** Every app with financial features must complete the Financial features declaration. Scope covers products "related to the management or investment of money ... including personalized advice". It bans exposing users to "deceptive or harmful financial products and services". https://support.google.com/googleplay/android-developer/answer/9876821
9. **Budgeting-app overspending (Think Forward Initiative / U. Arizona, Ghosh and Huang).** Seeing a precise remaining amount raised spending by about 26-33%, most of all near the end of the period. Ranges instead of exact figures, mid-period updates and rollover reminders reduced the effect. https://www.behavioraleconomics.com/the-budgeting-app-trap-when-spending-information-backfires (summary; not the full paper). This bears directly on an "allowance" figure.
10. **"Safe to spend" risk.** I found no regulator action, only vendor commentary (Gerald, which has a commercial interest) noting that pending transactions and renewals make such figures overstate. https://joingerald.com/learn/cash-advance/cash-flow-apps-overspending-risks-guide . Treat this as weak evidence, but it matches H1/H6.
11. **JPMorgan Chase Institute, Weathering Volatility 2.0.** Income dips and spending spikes correlate about 0.1. The median combined shock is about six weeks of take-home pay. This argues against min-income plus max-spending, and for a defined, realistic rough month. https://www.jpmorganchase.com/institute/all-topics/financial-health-wealth-creation/report-weathering-volatility-2-a-monthly-stress-test-to-guide-saving (via FINANCE-AUDIT).
12. **Planning fallacy (Buehler, Griffin and Ross 1994).** Forecasts built from what is scheduled ignore ordinary slippage. That is H1 in one sentence. https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf (via FINANCE-AUDIT). The "budget fallacy" literature (Peetz and Buehler) is from memory; my search did not find it.

**What this means for Decide.** The legal test in every regime is the net impression a reasonable, skimming person takes from the screen. It is not whether the fine print is true. A conditional answer must carry its condition in the headline. Thin data must produce a cautious answer or none, never a confident one with a small "rough" pill.

---

## 3. Safety requirements for any new model (numbered, testable)

Notation: `V(s)` is the verdict on snapshot `s`, ordered `fits > adjust > no`. `not_enough` is a separate state that sits outside that order. "Monotone" means it is property-tested with fast-check over generated snapshots.

**Error policy**
- **R1 Asymmetric error.** When data is thin (R5), the model uses the more cautious figure of each pair (higher spending, lower income). Test: for generated thin snapshots, `V(thin) <= V(same data treated as full)`.
- **R2 No zero-spend projection.** Projected spending for any remaining period is at least the typical-month spending pro-rated for the days left, minus what is already logged for that period, floored at 0. Test: on day 1 with no lines, projected month spending >= typical-month spending. The cash-path spread for every future month >= typical undated spending. Directly closes H1/H2.
- **R3 Uncertain income is not cash.** Income still due counts only if confirmed and the user marked it reliable. Pending income never counts as received. Test: removing an unpaid confirmed income occurrence never improves `V`.
- **R4 Pre-existing state is separated.** The answer reports "your month before this" and "what this purchase changes" as separate codes. Test: when `leftBefore < 0`, the output carries `month_already_short` and a separate purchase delta.

**Data sufficiency and freshness**
- **R5 Not enough data state.** With fewer than 3 complete months, or a logging-coverage score under threshold (R6), the engine returns `not_enough` with the missing items. It does not return `fits`. It may still show arithmetic ("price is X% of your cash"). Test: with 0-2 full months, `V` is never `fits`.
- **R6 Logging coverage.** The engine computes coverage per month: days with any line, bills logged vs confirmed, and spending vs the user's own median. A month below threshold is not "complete" for the typical-month figure. Test: a month with only bill lines does not count as a full month.
- **R7 Freshness.** Every answer carries `asOf`, the date of the latest logged line, a count of unsaved writes and the age of each cash balance. With unsaved writes > 0 or a balance older than N days, confidence drops one level. Test: a snapshot with failed writes is never `strong`.
- **R8 Confidence reflects the basis.** Confidence is the minimum of history confidence and current-month completeness. Test: on a 'month'-type answer before day 20 (or before coverage is met), confidence is never `strong` (closes H4).

**Monotonicity (the invariants the owner asked for)**
- **R9 Cheaper never worse.** With identical plan shape, `price_a < price_b` implies `V(a) >= V(b)`.
- **R10 Expense never helps.** Adding any spending line, bill, debt payment or pot implies `V` does not improve.
- **R11 Income never hurts.** Adding paid income does not make `V` worse (the DSR denominator rises too).
- **R12 Less cash never helps.** Lowering any cash balance does not improve `V`.
- **R13 Later is never worse for wait plans.** The ready-by date never moves earlier when the price rises.
- **R14 Outlier robustness.** Replacing any one history month with an extreme value (x0 or x20 income, x5 spending) changes the typical-month figure by no more than the gap between the 2nd and 5th ranked months. One outlier month cannot flip the typical-month verdict by itself unless the outlier is the current month.
- **R15 Basis order.** For the same check, `V(cautious) <= V(typical)`. The user-visible types never invert.
- **R16 Determinism.** Same snapshot gives the same output. No clock reads inside `engine/`.

**Consistency of output**
- **R17 One state, one text.** Every rendered string comes from one table keyed by (state, lead code, surface, month type). Test: no screen shows `fits` wording beside a `no` code for the same check and month type.
- **R18 Disagreement surfaces.** If the typical and cautious answers differ, the headline says so ("Fits in a typical month. Not in a tight one."). Test: whenever they differ, the headline key is a `split` variant.
- **R19 Severity is graded.** Cushion breach, month shortfall and cash dip each report the amount and the share consumed. Copy tiers follow named constants. Test: two breaches of very different sizes map to different tiers.
- **R20 The condition is in the headline.** The headline names its month type and its estimate strength whenever that strength is below "firm" (FTC net impression). Test: a snapshot test over all headline keys.

**Model governance (SR 11-7 discipline, sized for a small team)**
- **R21 Assumption register.** Every constant (window, percentiles, coverage threshold, cushion months, lines) lives in `constants.ts` with a citation or a "FincWin choice" tag, and appears in an in-app "What this assumes" list. Test: a lint check that each exported constant has a cite comment.
- **R22 Back-test.** For any user with 4 or more full months, the engine can rerun its typical-month model as of each past month end and compare it with the actual outcome. CI runs it on synthetic personas (salaried, gig, seasonal, partial logger, couple, new user) and fails if the false-yes rate on the persona set rises.
- **R23 Effective challenge.** Every engine change goes to a reviewer who did not write it, alongside the persona back-test diff. This is already close to the GSD review loop; add the persona diff as an artefact.
- **R24 No silent fallback.** When the engine falls back (no income series, so no cash path; unconverted currency, so the worst basis), the answer carries a code, and the copy names the gap. Test: every fallback branch in `assess.ts` emits a reason code.

---

## 4. The owner's simple model: risk review

> "What is left at the end of a normal month, with an allowance for occasional purchases."

**Verdict: the right shape, and lower risk than today's default.** It answers the question users actually ask. By design it projects to month end, which removes the root cause of H1-H7. It is also easy to explain, and explaining is a compliance asset: the FCA's "likely to be understood" test is easier to meet with one idea than with three bases. It needs these guard-rails:

| # | Risk in the simple model | Guard-rail |
|---|---|---|
| G1 | "Normal month" undefined. A mean is skewed by windfalls; the latest month may be atypical | Median of the last 6 complete, well-logged months (R6), per line type (income, fixed bills, everyday spend). Show "based on May-Oct, 6 months". |
| G2 | **The irregular-cost trap.** Dropping the "one bad expense" month as an outlier also drops costs that recur at random (car repair, vet, dental, school trip). The normal month then understates real life. | Outliers come out of the *typical month* but go into the *occasional allowance*: sum of irregular spending over 12 months / 12. Nothing excluded disappears; it moves bucket. Test: total of typical + allowance x 12 >= 12-month actual spending, within rounding. |
| G3 | **Double-counting the allowance.** If the allowance funds occasional purchases, the item being checked *is* one. It cannot both use the allowance and leave the allowance in "spare". | The verdict uses `spare_after_allowance = typical income - typical spend - allowance`. The purchase is tested first against the *accumulated unspent allowance* plus cash above the cushion. Show which pool it came from. |
| G4 | Allowance displayed as precise money "to spend" raises spending (TFI study, 26-33%). | Show it rounded and as a range ("about $300-$400 a month for occasional costs"). Never call it spendable or free. Do not show a countdown of remaining allowance on the home card. |
| G5 | Current month partially logged. | Month end = max(logged so far + bills due, pro-rated typical) for each part (R2). Say "includes $X of expected everyday spending not yet logged". |
| G6 | Irregular income: the "normal" month hides the bad ones. | When income varies a lot, also show a tight month (2nd-lowest income of 6 with typical spending, not min plus max). It becomes the headline when the two disagree (R18). |
| G7 | Cash balance not considered. A month can be "fine" while cash is near zero. | Keep the cushion test and the 90-day path, both fed by the projected spending (R2). |
| G8 | Saving treated as leftover. | Committed saving (pension, employer match) is a cost in the normal month. Only "flexible saving" may be shown as pausable, and it is named. |
| G9 | New users have no normal month. | `not_enough` until 3 well-logged months (R5). Meanwhile offer a manual quick estimate ("tell us a typical month"), labelled as your own estimate. |
| G10 | Households. | Typical month per member's logged share. Flag "partner's spending: last logged 34 days ago". |
| G11 | The allowance becomes a licence ("I still have an allowance"). | The verdict states the after-figure: "After this, the occasional pot holds about $X; about N months to refill." It is a fact, not permission. |

What the simple model must **not** drop from today's engine: integer money, credit-plan shapes, the cushion, the cash path, confidence, and "no invented rates". Simplify the *headline*, not the safety checks.

---

## 5. Copy guard-rails

Keep the existing `BANNED`, `REASSURING` and `IMPERATIVE_LEAD` tests (`decideCopy.test.ts:26-29, 82`). Add:

1. **The headline carries its condition.** "Fits a typical month" / "Fits a typical month, not a tight one" / "Doesn't fit a typical month". Never a bare "It fits".
2. **Estimate strength goes in the headline when below firm.** "...on rough figures (2 months logged)". A pill alone is not enough (net impression).
3. **Facts about figures, not about the person.** "Cash would drop to $410, under the $2,700 you keep aside" rather than "You can't afford this".
4. **Name the projection.** "Includes about $640 of everyday spending expected by Oct 31, not yet logged." This sentence makes the model's key assumption visible.
5. **Not-enough-data copy is neutral and actionable without ordering.** "Not enough months logged to judge a typical month. 2 of 3 so far." Banned: "Log more to unlock".
6. **No permission verbs.** Buttons: "Record as bought", "Save the plan", "Record as not buying" (LANGUAGE-AUDIT fix 8). Not "Go ahead".
7. **No "safe", "free", "allowance to spend", "you can".** Add `/\bfree\b/` (money sense), `/\bsafe\b/`, `/\byou can\b/`, `/\bspendable\b/` to the tests, with an allow-list for unrelated keys.
8. **Severity words map to tiers, and colour follows the word.** Red only for a negative figure or a passed limit. Neutral for hypothetical months.
9. **Lender-style lines are labelled "suggested" until the user sets them.** "A rule of thumb lenders use (36% of pre-tax pay)". Never "Lines you will not cross" for defaults.
10. **Standing footer on Decide, short.** "Worked out from your own records. A record-keeping and planning tool, not financial advice." (The word "advice" is allowed only in this key, as "lend" already is.)
11. **Freshness line when stale.** "3 changes not saved yet; this answer may change."
12. **Contradiction test** (R17/R18) across headline, chip, size label and body for each (state, surface).

---

## 6. Open questions for the owner

1. **Which mistake is worse for you, a wrong "fits" or a wrong "doesn't fit"?** I assume the wrong "fits" (R1). If you agree, the headline follows the cautious answer whenever data is thin.
2. **What counts as an occasional purchase?** Only things you log as one-off, or anything outside the usual pattern (big repairs, gifts, travel)? This sets G2/G3.
3. **Should the item being checked come out of the occasional allowance, out of spare, or out of savings, and should the app show which?** (G3)
4. **How many months before a real answer?** I propose 3 well-logged months, with a quick manual estimate before that. Is that too strict for first-run delight?
5. **Is "This month" still wanted as a view?** If yes, it must project to month end (R2). Or should it be retired in favour of "typical month" plus "tight month"?
6. **Committed or flexible saving:** may the app treat pension contributions as pausable at all?
7. **Households:** is a partner's unlogged spending a reason to say "not enough data", or only a caveat?
8. **Lines (28/36/12):** keep them as suggested references, ask users to set them at setup, or drop them from the verdict? They look like a credit assessment, which raises the 3.2.1(viii) and UDAAP "advisory" risk.
9. **Back-test visibility:** may the app show "three months ago this check would have said X; your month ended Y"? It builds the most trust, and it exposes the model's misses.
10. **Compliance phase:** will you take outside counsel on (a) Apple 3.2.1(viii) "money management", (b) whether a personalised verdict is "financial advisory services" under 12 U.S.C. 5481, (c) UK: Decide's invest checks and debt rows against the regulated "advising on investments" and debt-counselling activities (from memory; verify in PERG)?
11. **Testing:** will you run the 5-person comprehension test (LANGUAGE-AUDIT 1.5) with at least 2 people who have irregular income or low savings (PRIN 2A.5.12G, FG21/1)?
