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
3. **D-23 scope.** Only outflow series that are not monthly are smoothed. Income series are not smoothed, because D-23 speaks of bills. Ended series are left out by the builder, so their past lines count as ordinary spending.
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
