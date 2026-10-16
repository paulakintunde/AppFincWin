# Phase 5: Decide UI - Planning Notes

**Run:** 2026-10-15, `/gsd-plan-phase 5`, non-interactive (orchestrated by a subagent; no user prompts were possible).
**Worktree:** `C:\dev\fincwin-04ctx`, branch `docs/04-context-update` (PR #77).

Wherever the plan-phase workflow would have asked the user, the recommended/default option was taken. Each choice is recorded here.

## Workflow choices

| Step | Prompt the workflow would show | Choice taken | Why |
|------|--------------------------------|--------------|-----|
| 4 | CONTEXT.md present? | Used `05-CONTEXT.md` (D-01..D-23, locked) | Exists |
| 5 | Research before planning? | **Research first (Recommended)** | No RESEARCH.md; new integrations (expo-notifications, onboarding steps, demo seed) |
| 5.5 | Validation strategy | Create `05-VALIDATION.md` if RESEARCH.md has `## Validation Architecture` | Nyquist enabled in config |
| 5.55 | Security threat model | Enabled (config key absent = enabled, ASVS L1, block on high) | Default |
| 5.6 | UI-SPEC gate | Used existing `05-UI-SPEC.md` (approved) | Exists |
| 5.7 | Schema push gate | Supabase migrations expected → planner told to include a `[BLOCKING]` push task via `npm run supabase:db:push` (preflight chained), `autonomous: false` | Production-only DB; the orchestrator runs no Supabase command |
| 6 | Existing plans? | None existed | - |
| 7.8 | Pattern mapper | Enabled (config key absent) | Default |
| 8 | Chunked mode? | Not chunked (config absent) | Default |
| 12 | Revision loop | Max 3 iterations; stall → "Proceed anyway" only if no BLOCKERs remain | Recommended defaults |
| 13/13a | Coverage gaps | "Re-plan to include missing" (recommended) | Default |
| 15 | Auto-advance | Off (no `--auto`); execution NOT started | Phase 4 not executed |

## Phase-level constraints passed to every agent

- Phase 5 execution is **blocked until Phase 4 (decide-engine) is executed and verified**. Plans consume `src/engine/decide`'s public barrel as specified by 04-12; they do not edit `src/engine/`.
- No Supabase command is run during planning. Migration tasks in plans are human-gated.

## Research open questions — defaults taken (resolved for planning; user confirmation requested before execution)

The researcher raised five open questions and logged assumptions A1–A10 (`05-RESEARCH.md` § Assumptions Log). The recommended option was taken for each:

| # | Question | Default taken | Risk if wrong |
|---|----------|---------------|---------------|
| OQ1 / A1 | Debt storage before Phase 6 | **Minimal `debts` table in Phase 5** (loan/card/other, APR, minimum, secured, term, optional `check_id`); Phase 6 extends it | Phase 6 may want another shape (additive migration) |
| OQ2 / A2 | Monthly saving/investing source (no goals yet) | Transfers into savings/investment accounts averaged over the full months used, plus `Savings`-category outflows | D-35 pause amounts wrong for users who save differently |
| OQ3 / A3 | Full-month signal | Heuristic (month before current, at least one row, at or after the household's earliest row; the start month is full only if it starts on the 1st) **plus** persisting import statement periods from now on | Core Value risk: partial months entering averages |
| OQ4 / A7 | Demo seed delivery | Version the sample seed RPC: at least 4 full past months, a debt, a savings transfer series and two `is_sample` open checks (sofa cash; car loan with a typed APR); `clear_sample_data` extended. The demo account uses the same path once the allow-listed sign-in exists | App Review sign-in itself is not built in Phase 5 |
| OQ5 / A4 | Checks/decisions privacy | Owner-private (`created_by = auth.uid()`), `household_id` carried for Phase 8 | Phase 8 may need shared journals (additive policy) |
| A5 | Undo for autosave | Autosave creates no undo steps; abandon, remove and Go ahead do | - |
| A6 | Go ahead cash account | Default to the main cash/checking account (largest balance), with an account row in step 5 to change it | - |
| A8 | Android back in the step flow | Screen-level BackHandler steps back; verify on device | - |
| A9 | Rows with a null home amount | Excluded from the snapshot, counted in "Assumptions in play" | Under-counted spending |
| A10 | Sales tax | Applies to the price, half-up rounding, paid on day one (not financed) | Credit monthly differs from user expectation |

## Depth expansion (D-24..D-37) — addendum open questions, defaults taken

The coordinator resumed planning after 05-CONTEXT gained D-24..D-37 (plus amended D-24), the UI-SPEC was re-approved with "Depth surfaces", and Phase 4 grew to 22 plans with `decide()` as the entry point. A research addendum was appended to `05-RESEARCH.md`. Defaults:

| # | Question | Default taken | User decision needed? |
|---|----------|---------------|-----------------------|
| OQ-A1 / A11 | D-37 "latest stored rate" vs dated stamps for past lines | Past lines keep their dated stamp (Decide averages equal Activity totals); balances, series, debts, changes and goals use the latest rate | **Yes** — reads a locked decision narrowly |
| OQ-A2 / G2 | `PromoTerms.deferredInterest` input | UI-SPEC kept: no new toggle; pass `deferredInterest: false` and say so in "Assumptions in play" | **Yes** — the recommended toggle would change the UI-SPEC |
| OQ-A3 | Quick-check combined pill with exactly one open check | UI-SPEC kept: pill shown at 2 or more open checks; with one open check the quick check still combines (D-24 amended) and the basis line says so | **Yes** — recommendation (pill at 1 or more) is a UI-SPEC tweak |
| OQ-A4 | Do `waiting` checks stack? | No; only `open` checks stack; goal monthly amounts are not added to `monthlySaving` | No |
| OQ-A5 | D-36 "decision with actuals" | Counts once its 90-day checkpoint is reached, 30-day figures before that; attached links carry a role (`decide_links.role`) | No |
| OQ-A6 | Limits typed in a former home currency | Keep 05-06's rule: treated as defaults, with an Assumptions row | No |
| OQ-A7 | Demo confidence chip | Seed 6 full steady months so frames 1–2 read "Strong basis" (supersedes the "at least 4 months" note above) | No |
| OQ-A8 | Goal tagging | `transactions.goal_id` column (saved-so-far computed) | No |
| OQ-A9 | UI-SPEC fixes (D-25 reason wording, "Counts as" row, D-59 copy, deferred-interest toggle, loss-of-value amount field, "open check not counted" row) | Copy-only items are added as draft keys in the catalogue owner plan in the UI-SPEC's voice; new input fields are NOT added (loss of value shows no amount; deferred interest as OQ-A2) | **Yes** — list for a UI-SPEC touch-up |
| A13 | Combine toggle storage | `inputs.combine` jsonb per check; quick-check toggle is session state | No |
| A14 | Performance | Home list uses `assess`/memo; full `decide()` in step 3; assumed fine for ≤10 open checks, verified on device | No |
| A15 | Cooling-off timing | Server-computed `cooling_off_at` (decided_at + 48 h); reminder module keyed `${kind}:${checkId}` | No |
| A16 | Drafts / foreign-currency checks in stacking | Left out and counted in Assumptions | No |
| A18 | `cloneMonth` and `one_off` | Not copied | No |

## Iteration-2 checker decisions (carried into the replan)

- Investment Go ahead: lump → pending outflow (or pending transfer when an investment account is chosen) dated `needBy ?? today`; monthly → recurring series for the term.
- Pending one-off outflows not in a series reduce `cashOnHand` (or raise derived card debt for credit-account rows) unless 04 D-10/D-28 says otherwise.
- No-figures path: `computeCheck('none')` returns status `none` ("There is nothing to judge this against yet."); the onboarding skip path is cash-only with no cushion or month claim.
- Go ahead on a seeded sample check writes ordinary (non-sample) rows: intended, they are the user's own records.

Other research facts the plans rely on: `expo-notifications ~57.0.23` is a new dependency (needs a new dev build / preview APK; iOS Push capability once Apple enrolment is done); analytics `step` must be a string; `DateField` needs an explicit past-date guard; row-derived query keys nest under `['transactions', householdId]`; the repo pins Jest 29.7.

## Iteration-3 checker decisions (revision 3)

| # | Issue | Decision taken | Plans |
|---|-------|----------------|-------|
| R3-1 | D-35 cooling-off says "reopens this check, recalculated" for Go ahead, but bought checks were never recomputed | Option (a): a bought check is recalculated against the snapshot source with its OWN written lines removed (rows, series, their occurrences, the debt via written decide_links and debts.check_id, its payment links; replaced series Go ahead ended are live again; paid writes added back to balances) by the pure `withoutCheckWrites` and the hook `useBoughtCheckComputation` (new plan 05-52); 05-29 shows it beside "Decided {date}" and the stored verdict_at_decision; the cooling-off route (05-11) lands on the same view; 05-26 step 9 tests Go ahead as well as Pass | 05-52 (new), 05-29, 05-12, 05-06, 05-11, 05-46, 05-26 |
| R3-2 | Step 3 section composition had two owners | 05-42 exports DayByDaySection and ExpectedIncomeSection only; Step3Verdict holds no sections; 05-30 (now after 05-42) places them at positions 3 and 6 and its test asserts the full order | 05-42, 05-30 |
| R3-3 | Card debt service never counted | Card Go ahead paid over months writes its paymentSteps as payment series (role 'payment', every run a series) from the cash account in Debt, counted once as a bill; a stored card debts row's minimum_payment is the derived card DebtRecord's minimum; otherwise meta.cardsWithoutMinimum and the Assumptions row "Card payments aren’t in the month unless you set a minimum"; pay-in-full user tested for no double count | 05-01, 05-02, 05-06, 05-15, 05-20, 05-46 |
| R3-4 | cash_path margin 0 on_edge read "holds by $0" | marginText / edgeChipA11y use the cash_tight_before_payday fact wording in that case | 05-37, 05-41, 05-42 |
| R3-5 | 05-18 too large | Split: 05-18 = fixture + engine-backed demo test; 05-51 = seed SQL, pgTAP, samples.ts, mirror script, npm and CI (depends on 05-04); 05-25 depends on both | 05-18, 05-51 (new), 05-25 |
| R3-6 | Dependency hygiene | 05-29 depends on 05-46 and 05-52; 05-06 depends on 05-34 and 05-38 (wave 2 unchanged; local structural types kept) | 05-29, 05-06 |
| A19 | Go-ahead loan after its series ends | The debts row keeps the balance and minimum written on the day; Phase 6 (debts) updates or closes it | 05-20 |
| A20 | Replaced series restored in the recalculation | Restored only when its end_date equals Go ahead's end date (needBy ?? local decided date); assumes a replaced line was open-ended when picked | 05-52 |
| A21 | Card payoff over months | Written as Debt-category expense series from the cash account (role 'payment'), not transfers into the card; the card's derived balance does not fall as payments run, and each payment counts once as a bill. Phase 6 (debts) reconciles the card balance or switches to transfers; flagged for the user | 05-20 |

## Revision 4 checker decisions (final, 2026-10-15)

| # | Issue | Decision taken | Plans |
|---|-------|----------------|-------|
| R4-W1 | A reopened decision's reminders came back on the next reconcile | Reopening ends the old check's reminders: 05-21's view model leaves out of both reconcile lists any decided check whose id is the `reopened_from` of a live check (named test `reconcile leaves out a reopened decision`); 05-22 still calls cancelCheckReminders on reopen. 05-26 step 9 now fires the Pass reminder (a) before the Go-ahead check (b) starts, so neither depends on a reopen | 05-21, 05-26 |
| R4-W2 | Assumptions copy promised a card-minimum control that does not exist | No new control (UI-SPEC locked). `asCardMinimumValue` is now "Card payments aren’t counted in the month." (declarative, DCU-09-safe), shown only while a credit account owes a balance at the snapshot date with no stored minimum (meta.cardsWithoutMinimum > 0). This supersedes the R3-3 copy | 05-02, 05-06, 05-15 |
| R4-W2-gap | Card payments missing from the month when no minimum is stored | **Phase 6 gap, flagged for the user:** derive the card payment from the card's minimum terms without double-counting a pay-in-full card's spending lines | Phase 6 |
| R4-W3 | Card payoff written as expenses, not transfers | Recorded as assumption A21 | 05-20 |
| R4-W4 | Step 9(b) could dirty the demo account used for store screenshots | 05-26 step 9(b) runs on a separate fresh USD test account, never the demo account | 05-26 |
| R4-W5 | VALIDATION missing 05-52 and card-debt rows; 05-41 / 05-15 wording contradicted R3-2 | VALIDATION rows added (withoutCheckWrites.test.ts, useBoughtCheckComputation.test.tsx, buildSnapshot card tests in 05-06 / 05-15 / 05-20); 05-41 Task 2 and 05-15's objective now say Step3Verdict holds no sections, 05-30 composes them, 05-42 only exports DayByDay / ExpectedIncome | 05-15, 05-41, VALIDATION |
| R4-I1 | Month boundary in step 9 | 05-26 step 9 notes that a clock jump across a month end can legitimately change the recalculated verdict | 05-26 |

## Final checker result and orchestrator closing edits

- Post-expansion checker loop: iteration 1 (50 plans) 1 blocker / 4 warnings; iteration 2 (52 plans) 0 blockers / 5 warnings; iteration 3 (final) 0 blockers / 1 warning / 3 info. Max iterations reached with no blockers, so the plans were accepted ("Proceed anyway" default) after two small orchestrator edits:
  - 05-06: a credit account whose Go-ahead payoff series is in the month is not counted in `meta.cardsWithoutMinimum`, so "Card payments aren't counted in the month." never shows for it (test assertion + grep added).
  - 05-26 Task 3: every step runs on a fresh USD test account seeded through "Explore with sample figures", never the App Review demo account; sample data is cleared and re-seeded after steps 9(a) and 11.
- Open info for the user: a pay-in-full card always shows the "Card payments" Assumptions row (true, but frequent) — see R4-W2-gap.

## Planning-review decisions D-38..D-43 (user, 2026-10-15) — revision 5

Applied in the worktree after 05-CONTEXT D-38..D-43 and Phase 4 D-61/D-62 (commit 19d5dcd). Plan count 52 → 53 (new 05-53); 10 waves, unchanged.

| # | Decision | Resolution | Plans / files |
|---|----------|------------|---------------|
| D-38 | Minimal `debts` + `statement_periods` in Phase 5 | Confirms OQ1/OQ3. `debts` gains `paid_in_full boolean not null default false` (insert and update grants); card minimum terms stay `min_percent` / `min_interest_added` / `min_floor` (the engine's CardMinimumTerms shape), loans keep `minimum_payment`; pgTAP covers the terms and flag update | 05-03, 05-05 |
| D-39 | Dated stamps for past lines, latest rate for balances and debts | Confirms OQ-A1 / A11 (already planned); cited where D-37 was cited for this rule; Assumptions row "Past lines keep the rate they were stamped with" | 05-06, 05-33, 05-39, 05-42 |
| D-40 | Card minimums from per-market terms, editable, paid-in-full flag | Replaces the R4-W2 workaround and closes R4-W2-gap. 05-06: a card's DebtRecord minimum = `simulateMinimum(base, apr ?? ZERO_PERCENT, terms).firstPayment` (`@/engine/payoff`) with stored terms, else per-market terms (only when the market currency is the card's currency); `paid_in_full` → 0; no terms → 0 and `meta.cardsWithoutMinimum`; no rate with interest-added terms → counted without interest and `meta.cardsMinimumWithoutRate`; a Go-ahead card purchase paid by its payoff series is left out of the minimum's base (new `writtenRowLinks` source, 05-05 `fetchWrittenRowLinks`, 05-12). CardChoice gains `terms: CardTermsView`. UI: new plan 05-53 (wave 5) adds the step 2 "Minimum payment" row and the card terms sheet; 05-19 `useSaveCardTerms`; 05-30 wires it. Copy: 05-02 `asCardMinimumValue` "Card payments aren’t counted until the minimum is set." + `asCardNoRate`; 05-31 `decide.depth.cardMin.*`; basis-row item via 05-37 / 05-41; Assumptions rows in 05-15 | 05-01, 05-02, 05-03, 05-05, 05-06, 05-12, 05-15, 05-19, 05-30, 05-31, 05-37, 05-41, 05-42, 05-51, 05-52, 05-53 |
| D-41 | Screenshots from the sample-seeded account | 05-26 frames are taken on a fresh USD account seeded via "Explore with sample figures" until ACC-11; 05-51 notes any seeded card carries terms | 05-26, 05-51, VALIDATION |
| D-42 | Deferred-interest toggle on the promo row | Shown once a 0% promotional rate is typed (the engine accepts deferred interest only at 0%), default off, never inferred; `PromoInput.deferredInterest` (05-01); 05-07 sends it only when on at 0%; step 2 tile "Charged back if it isn’t cleared by the end: {x}" and a step 3 notice card when the engine reports `deferred_interest_charged` (05-37 promoCopy, 05-41 WarningList, 05-43 PromoRow); the OQ-A2 "deferredInterest always false" Assumptions row is dropped (05-31, 05-37, 05-42) | 05-01, 05-07, 05-31, 05-37, 05-41, 05-42, 05-43 |
| D-43 | UI-SPEC touch-ups as resolved; combine pill hidden with 1 open check | 05-UI-SPEC.md edited (status approved; changelog "Planning-review touch-ups 2026-10-15"); citations added where plans implement touched copy or surfaces | 05-02, 05-09, 05-13, 05-15, 05-17, 05-29, 05-31, 05-37, 05-39, 05-41, 05-43, 05-44, 05-46, 05-47, 05-53 |
| 04 D-61 | `scheduledOutflows` | 05-06 passes every live pending one-off cash outflow as `ScheduledOutflow { id, date, amount, currency }` and no longer subtracts it from cashOnHand (the engine applies entries dated on or before asOf to cash); the named test keeps its name with adjusted expectations (cashOnHand unchanged, entry present, cash path lower; a today-dated case lowers cashAfter); 05-12, 05-18, 05-20, 05-52 wording and tests follow | 05-01, 05-06, 05-12, 05-18, 05-20, 05-52 |
| 04 D-62 | Contract clarifications | `CurrencyCode` / `MinorUnits` imported from `@/engine/decide` (05-01 types, gate and greps; 05-07 grep); gate proves `scheduledOutflows`, `scheduledOutflowsDue`, the re-exports, `InvestCheck` in `StackedCheckInput` and `payoff.simulateMinimum`; 05-39 converts foreign-currency estimates before `estimateBias` (or leaves the decision out); 05-20 tests `estimate_monthly = payment + running`; 05-12 tests that an open investment check stacks; 05-07 cites the `incomeAtRisk` setbacks contract | 05-01, 05-07, 05-12, 05-20, 05-39, 05-44 |

Choices made under D-43 / planner discretion (recorded for review):
- The deferred-interest toggle shows only at a 0% promotional rate (04-05 `PromoTerms`: "deferredInterest needs apr 0").
- A card minimum that adds interest on a card with no rate is counted at 0% interest and named in Assumptions ("Card minimums are counted without interest until the card’s rate is set."), rather than dropped; a lower bound is safer than leaving the payment out.
- Market terms are never borrowed across currencies: a card in another currency than its region's market row gets "Minimum payment not set".
- The market note is declarative: "Pre-filled from the standard card terms for your region. Your card’s own terms can differ."
- The Wait closing line is "Nothing else changes: no balance or limit moves until you reopen it."
- Pass fires no commit haptic (selection only); Go ahead and Wait fire the medium haptic.

Phase 4 cross-check (read only, 04-05 / 04-12 / 04-PHASE5-ALIGNMENT as of this revision): D-61 (`ScheduledOutflow`, `scheduledOutflowsDue`, `outflowsDueNow` / `outflowsDueAhead`) and D-62 (re-exports, newMonthly invariant, InvestCheck stacking, estimateBias home currency, incomeAtRisk setbacks) are present in 04-05 / 04-12; 04-PHASE5-ALIGNMENT confirms D-40 needs no engine change. No mismatch found; 05-01's gate stops Phase 5 if the executed barrel lacks any of them.

## D-44 (with 04 D-63) and DCU-12..DCU-24 (user, 2026-10-15) — revision 6

Plan count 53, 10 waves, unchanged; no new plan, no dependency change.

| Item | Resolution | Plans / files |
|------|------------|---------------|
| Loss of value | Replaces the OQ-A9 "no amount field" reading. `CheckInputs.lossOfValue: { kind: 'amount', monthly } \| { kind: 'percent_per_year', percentText } \| null` (05-01); 05-07 adds one counted `loss_of_value` CostLine with `lossOfValueMonthly(entry, resolvedPrice.price)`, so the figure is `running.nonCash` only (property: runningCostsNet and the verdict ignore it); legacy `loss_of_value` InputLines are dropped. Step 2 row: "A month" \| "% a year", blank, "Not a monthly cash cost", "About {x} a month. Shown here, not counted in your month." | 05-01, 05-07, 05-31, 05-37, 05-44, UI-SPEC |
| Holding fee | `CheckInputs.investHoldingFeeText` (05-01); 05-07 passes `holdingFee` to `investmentViews`; 05-45 `HoldingFeeInput` under the rates row; 05-37 labels rows "{r}% a year, {net}% after fees" from `netRates` and swaps captions to the fee forms. The four 04 D-52 views only; the Kept column and alternatives never say "after fees" (04-PHASE5-ALIGNMENT fee scope) | 05-01, 05-07, 05-31, 05-37, 05-45, UI-SPEC |
| Card costs | `CheckInputs.card.fees` (05-01) → `cardFees` only when > 0 (05-07); 05-14's tile reads `plan.card.cardCosts` (null → the Interest tile's word); 05-53 adds "Card fees (optional)" and the "{interest} interest plus {fees} in card fees." line (`cardCostsCopy`). The price card's Fees adjustment is unchanged; the sub-copy points other fees there so no fee is asked twice | 05-01, 05-07, 05-14, 05-31, 05-53, UI-SPEC |
| DCU-12..DCU-24 | Added to `requirements:` only where a plan implements the traced decision (REQUIREMENTS.md D-number traces); VALIDATION gains one row per ID plus a D-44 row | 30 plans (see below), 05-VALIDATION |

DCU → plans: DCU-12 05-07/09/13/28; DCU-13 05-07/12/13/21/30/36/37/41; DCU-14 05-35/36/37/41/42/49; DCU-15 05-06/12/32/37/38/40/48; DCU-16 05-06/31/32/34/50; DCU-17 05-01/07/31/37/42/43/53; DCU-18 05-01/07/31/35/37/45; DCU-19 05-07/37/42/43; DCU-20 05-01/07/19/20/31/32/37/39/44; DCU-21 05-19/20/32/34/36/37/38/39/46/47; DCU-22 05-11/20/21/32/46; DCU-23 05-06/09/13/15/33/37/39/49; DCU-24 05-03/05/06/15/19/30/41/53.

Choices made under planner discretion (recorded for review):
- A loss-of-value percent is a share of the final price per year, bounded 0..100 (the engine's own bound); a typed 0 counts as no entry.
- Card fees are one optional total for this purchase (the engine's `cardFees`), paid on the day; no per-fee breakdown.
- A null `cardCosts` (minimum never clears) reads "Endless", as the Interest tile does.
- With a holding fee the 0% row reads "0% a year, −1% after fees" (negative net shown with U+2212, 04 D-63 "net rate may go below 0").

Phase 4 cross-check (read only; 04-05, 04-06, 04-12, 04-21, 04-PHASE5-ALIGNMENT as of this revision, uncommitted edits in progress): `LossOfValueInput`, `lossOfValueMonthly`, the card payment's `cardFees`, `CardPlanDetail.fees` / `cardCosts`, `InvestmentViewsInput.holdingFee`, `InvestmentViews.holdingFee` / `netRates`, `NetProjectionRate` and `payoff.futureValueNet` are all present with these names. No mismatch found; 05-01's gate stops Phase 5 if the executed barrel lacks any of them.

## Checker round (2026-10-16) — revision 7

Plan count 53, 10 waves, unchanged; no dependency change (05-30 already has 05-41 and 05-53 as ancestors).

| Item | Resolution | Plans / files |
|------|------------|---------------|
| B1 loss-of-value base | Corrects revision 6: the %/year is of the advertised price (before tax, fees and trade-ins), per 04-06 `lossOfValueMonthly(input, advertisedPrice)` and 04-PHASE5-ALIGNMENT. 05-07 calls `lossOfValueMonthly(entry, inputs.advertised)`, never `resolvedPrice.price`; new named test with a trade-in (10% of 1_450_000 → 12_083, not 11_542). The revision-6 table row above and the discretion bullet "share of the final price" are superseded. | 05-07, 05-01, 05-44, 05-31 (`running.lossModeA11y`), UI-SPEC touch-up 16, 05-VALIDATION |
| B2 demo card terms | User decision: the sample "Credit card" gets a card-kind debts row with `paid_in_full = true` (pay in full is the common case, no minimum, no double count). 05-18 demoSource sets `region: 'US'` and asserts meta.cardsWithoutMinimum 0 and cardsMinimumWithoutRate 0; 05-51 seeds it with a `-- demo:cardDebt.paidInFull=true` marker, returns `'debts', 2`, pgTAP 57 and the mirror cover it, clear_sample_data removes it. | 05-18, 05-51, UI-SPEC touch-up 19 |
| W1 D-40 "editable on the debt" | New `meta.cardsWithoutMinimumIds` (05-01 / 05-06). 05-41 makes the basis row a button when the card item is present and `onEditCardMinimum` is passed; 05-15 does the same for the Assumptions "Card payments" row (hint key `asCardMinimumHint`, 05-02); 05-30 (composition owner) opens CardMinimumSheet (05-53) for the first id and saves through the step 2 useSaveCardTerms handler; named tests in all three. | 05-01, 05-02, 05-06, 05-15, 05-30, 05-41, UI-SPEC touch-up 17 |
| W2 D-38 minimal reading for DCU-24 | A live loan account without a debts row counts its payment only through its recurring payment series (a series with `account_id` = the loan account, or a Debt-category bill); loan terms entry beyond Go ahead is Phase 6. A loan account owing a balance with neither a debts row nor a series on it is counted in `meta.loansWithoutPayment` and named in Assumptions ("Loan payments", keys `asLoanPayment` / `asLoanPaymentValue_one|_other` in 05-02). | 05-01, 05-02, 05-06, 05-15, UI-SPEC touch-up 18 |

Choices made under planner discretion (recorded for review):
- With several cards owing without a minimum, the step 3 notes open the first (account order); after a save the snapshot recomputes and the next becomes the target. One tap target keeps the basis row one line (DCU-11 budget).
- "Has a series" for a loan account means a live recurring series whose `account_id` is that account; a Debt-category bill on another account cannot be tied to a specific loan, so the Assumptions copy says the payment "counts only if it is among your bills" rather than claiming it is missing.
- The tap hint reuses one 05-02 key (`asCardMinimumHint`, "Opens the card minimum payment") for both notes; no new 05-31 key.

## Plan-check 2026-10-16 (iteration 2): market region and Canada

- Blocker fixed (05-12, 05-06): the snapshot source's `region` is `getDeviceRegion(rc.region) ?? null` (RD-02: override > device region > time-zone tiebreak; never IP), not `rc.region` (the explicit override, usually null). Named hook test "the market row follows the device region when no region is set"; acceptance greps `getDeviceRegion` in src/data/queries/decide.ts.
- Decision (CA-QC): the region is country-level, so the CA-QC market row is unreachable. It needs a province field and is deferred; Quebec users get the CA row. A CA pre-fill shows `decide.depth.cardMin.marketNoteCa` "Pre-filled from the standard card terms outside Quebec. Your card’s own terms can differ." (05-31 key, wave 2; 05-53 selects it when the market pre-fill's floorCurrency is 'CAD', which only the CA row can produce since market terms apply only in the card's own currency). DCU-09-safe. UI-SPEC "Card minimum payment" (Pre-fill), Copywriting "Card minimum (D-40)" and changelog item 20 updated.
- 05-51: the seed's debts inserts (Student loan and the Credit card's card-kind row) supply `id gen_random_uuid()`; debts.id has no default.

## Alignment 2026-10-16: the executed Phase 4 (05 D-45..D-52)

Phase 4 is executed, code-reviewed (04-REVIEW, 14 findings fixed) and verified (`04-VERIFICATION.md` `status: passed`, 22 SUMMARYs) on `phase/04-decide-engine` (PR #78). This pass checked every engine name, field, code and behaviour the Phase 5 docs use against the real barrels (`src/engine/decide/index.ts`, `src/engine/payoff/index.ts` and their modules) and 04-PHASE5-ALIGNMENT "04-REVIEW fixes (2026-10-16)". Where a plan and the code disagreed, the code won. Plan count (53), waves (10), titles and dependencies are unchanged, so ROADMAP and STATE are not touched.

**Names.** A scan of every backticked engine field and every quoted snake_case code in the Phase 5 docs found no name that is missing from `src/engine` (the remaining unknowns are DB columns and Phase 5's own symbols). The D-59..D-63 names (`cash_tight_before_payday`, `CashTightFact`, `cashTightFact`, `scheduledOutflows`, `scheduledOutflowsDue`, `lossOfValueMonthly`, `cardFees`, `cardCosts`, `holdingFee`, `netRates`, `NetProjectionRate`, `futureValueNet`, `futureValuePath`, `isSmoothedPayFreq`) all exist with the planned meaning. Every name in 05-01's FUNCTIONS list and type gate is exported.

**Mismatches found and fixed (by plan):**

| Plan | Mismatch against the executed engine | Fix |
|---|---|---|
| 05-01 | The gate checked a subset of names; the surface could drift unnoticed. No contract for the term typed beside the months paid, nor for the promotion's end balance | Exact runtime surface pinned (124 decide names, 24 payoff names, `Object.keys` equality); compile-only proofs of `remainingAtCap`, nullable `RateFigure.projected` / `NetWorthPath` points, `AmortisationResult.termMonths`, the two new codes, `MAX_PROJECTION_RATE`; `cash_only.termMonths`, `CheckComputation.promoBalanceAtEnd`, `SnapshotMeta.limitsReset` |
| 05-02 | No copy for the new states and codes (`MISSING_TITLE satisfies Record<MissingReason>` would not compile) | Keys for both new missing reasons, the payoff-month caption and loan line, the 50-year remaining figure, "Below the price", the fee-aware instalment note, zero-income dsr / Your month lines, "Too large to project", method-true cheaper descriptors and per-run written loan lines; cap test values extended |
| 05-06 | The builder passed stored limits straight through; `prepareContext` now throws on negative or fractional ones (LO-03) | Validation to null with `meta.limitsReset`, named test and a fast-check property that `prepareContext` accepts every built snapshot |
| 05-07 | Rates were bounded only by the percent grammar (up to 9999%), so a stored 250% gave `projection_rate_out_of_range`; setback percent / counts and instalment / card months were unbounded, so a tampered draft could make the engine throw; cash-only Credit used `plan.months` as the term; no source for "Left when it ends"; re-pricing ignored `withPrice`'s instalment scaling | `isValidProjectionRateText` (≤ `MAX_PROJECTION_RATE`), parser bounds, never-throw property, `termMonths` beside `months`, `promoBalanceAtEnd` from `amortiseSchedule` / `simulateMinimumSchedule`, `repriceInputs` (engine `withPrice`, cheaper-row deposit rule), a timing smoke |
| 05-09 | `MissingReason` list lacked `instalment_total_below_price` and `projection_rate_out_of_range`; Credit `count` was `plan.months`; dsr title/value printed `percentText(null)` at zero income; the 50-year card had no remaining figure; out-of-range rows had no reason | Updated union, `termMonths` + `paidOffMonth`, zero-income variants, `remainingAtCap`, `reasonTooLarge`, `optWithoutDescTooLarge`, `cheaperDescriptor`, money-param test |
| 05-13 | Caption "a month for {n} months" fed from `plan.months` | Caption from the term chosen, payoff month added only when earlier |
| 05-14 | Loan note and term note fed from `plan.months`; "Cleared" tile meaning; null `plan.total` / interest at the cap had no words; no flag or note for `instalment_total_below_price`; instalment note ignored on-the-day fees (ME-02) | Term typed in notes, "Paid off in month {m}…" line, Cleared = months paid, "Not within 50 years" everywhere with "Still owing {x}…", "Below the price" flag and note, `instalmentNoteFees` |
| 05-15 | Debt service row printed a null ratio at zero income | `lineDsrDescNoIncome`, value "Over" |
| 05-16 | "Use this price" set only the advertised price, so an instalment check kept its old instalments (HI-03) | `repriceInputs` |
| 05-17 | Kept had no out-of-range state; cheaper descriptor said "deposit" for every method; "Use the cheaper price" kept the old deposit / instalments; written loan line used `monthly × months` though 05-20 writes `paymentSteps`; written instalment line missed the day-one first instalment; "+ Add a rate" unbounded | Reason line "Too large to project at this rate", `cheaperDescriptor`, `repriceInputs` with the ratio, per-run lines (`writtenLoanThen` / `writtenLoanFinal`), day-one line for instalments, 100% bound with hint |
| 05-20 | Debt `term_months` took `plan.months` (months paid) | The term typed; the series already end at `plan.months` |
| 05-27 | A zero-income history (now Volatile, CV null) read "ranging $0 to $0" | `noIncomeLine` |
| 05-31 | No depth copy for out-of-range figures or the rate bound | `invest.tooLarge`, `netWorthAltTooLarge`, `invest.rateCap` |
| 05-35 | Chart geometry assumed every point a number; net-worth points are now nullable | Null points break the line, `lastValue`, out-of-range chart state |
| 05-37 | `investViewCopy` printed null projections; `promoCopy` had no figure for "Left when it ends" | `invest.tooLarge`, `netWorthAltTooLarge`, `balanceAtEnd` parameter |
| 05-43 | PromoRow had no balance source | Reads `computation.promoBalanceAtEnd` |
| 05-45 | RateChips accepted any grammar-valid rate; HorizonChips "plan term" was the term typed while the engine's default horizon is the months paid | 100% bound with hint; planTerm = `investmentViews.horizonMonths` when `horizonSource` is `plan_term` |
| 05-26 | No device check for live-recompute speed | Step 13 |
| 05-PATTERNS | `WarningCode` without `cash_dip`, `PlanReason` / `MissingReason` without the new codes, series from `plan.months` / `finalMonthly` | Updated, and the executed types named as the source of truth |
| 05-04, 05-05, 05-06, 05-07, 05-12, 05-20, 05-32, 05-52, 05-VALIDATION, this file | Bare "D-48", "D-51", "D-52" meant the Phase 4 decisions; with 05 D-45..D-52 they would read as Phase 5 decisions | Qualified as "04 D-48" / "04 D-51" / "04 D-52" |

**Checked and needing no change:** one-off refunds netting against one-off spending (LO-02; Phase 5 shows only the one-off count), on-the-day fees clamped to the price (LO-04; Phase 5 reads `ResolvedPrice` as is), `paymentToClearInPromo` rounding up (HI-01; not displayed in this phase, see the user list below), `longer_term.termMonths` stepping from the term typed (05-16 already writes it to `loan.termMonths`), `lineMargins` always carrying the dsr line on buy checks at zero income (05-37 `marginText` is generic), and the Phase 4 gate itself (22 SUMMARYs and `status: passed` exist on this branch, so every plan's shell gate passes).

## Quality review 2026-10-16

A "best version" pass over the plans, the UI-SPEC and the context after the alignment above.

**Fixed (within the decided scope):**
1. **Robustness (error states):** a stored or tampered draft could carry a value the engine rejects with a RangeError (a setback percent above 100, a count above 600, a rate above 100%), which would blank step 3. The parser now bounds every engine-bounded field, and a fast-check property proves no parsed JSON makes computeCheck, computeQuick or computeChip throw (05-07). The builder's limits get the same treatment (05-06).
2. **Contradiction, plans vs writes:** "What gets written" described a loan as `monthly × months` and an instalment plan as `count` payments, while 05-20 writes `paymentSteps` (a promotion's second run, a smaller final payment, the first instalment as a day-one row). The written lines now follow the runs, so the confirm sheet lists exactly what is written (05-17, 05-02, UI-SPEC).
3. **Contradiction, the row vs the rescore:** "Use the cheaper price" set only the price, so a loan kept its old deposit and an instalment plan its old instalments; the rescored check differed from the cheaper row the user tapped. Both re-price actions now go through one helper that applies the engine's own scaling (05-07 `repriceInputs`, 05-16, 05-17).
4. **Contradiction, copy vs method:** the cheaper row read "deposit scaled to match" for cash and card plans too; the descriptor now names what was scaled (05-09, 05-17, UI-SPEC).
5. **Missing data source:** the UI-SPEC's "Left when it ends: {x}" had no engine field; it now comes from the same payoff schedule the engine uses (05-07, 05-37, 05-43, UI-SPEC).
6. **Money display test gap:** nothing asserted that copy params are formatted amounts; 05-09 now tests that every amount param is a formatter string, never a raw number.
7. **Zero and edge values:** zero income no longer reaches "null%" or "ranging $0 to $0"; a card open at the 600-month cap no longer reads as cleared; out-of-range projections are words, never 0 (05-09, 05-14, 05-15, 05-27, 05-35, 05-37, 05-45).
8. **Accessibility:** the new states are words, never colour alone; the net-worth chart's text alternative states an out-of-range path, and a null point is never drawn as 0 (05-35).
9. **Performance of live recompute:** computeCheck runs decide, bisection, alternatives, setbacks, investing views over up to 600 months and the promotion schedule on every keystroke, with no budget. Added a non-gating timing smoke (05-07), a device step (05-26 step 13) and a manual validation row.
10. **Stale docs and ids:** 05-PATTERNS updated; bare Phase 4 decision ids qualified so the new 05 D-45..D-52 are unambiguous.
11. **Analytics and compliance:** re-checked, no change needed. The seven events stay enum-only (05-01's finite-props guard), failed-write records carry `{ checkId, count }` only, the reminders carry no amount or name, and every new string passes the DCU-09 banned list in the declarative voice (the one imperative, "Change the payment or how many to score this.", is an input prompt in the same form as the existing "Type the rate you were quoted to score this.").

**For the user (new product choices, not decided here):**
1. **Show "to clear it inside the promotion".** The engine now returns `paymentToClearInPromo` (rounded up, so paying it for the promotion's months clears the balance and no deferred interest is charged). The UI-SPEC does not show it. A tile "To clear it inside the promotion: {x} a month" beside "Charged back if it isn't cleared by the end" would make the deferred-interest risk actionable without advice wording. Add it, or leave it out of v1?
2. **Cents on monthly payments.** Decide cards show whole currency units (UI-SPEC assumption 12), so an 83.34 payment reads "$83" on the quick check and the method cards while "What gets written" shows 83.34. Keep whole units, or show cents for monthly payments?
3. **Long missing-state titles.** The 64-character title cap is tested only for `decide.verdict.title*`; several `decide.verdict.missing.*` titles run to 80+ characters (for example "No dealer card cap is on record for your region, so the card part cannot be scored.") and will clamp at 3 lines with the full text in the accessibility label. Shorten them (a copy change to locked UI-SPEC strings), or accept the clamp? None reaches the DCU-11 frames.
4. **If the device recompute check (05-26 step 13) shows lag:** compute the step-4 and investing parts only for the visible step (an architecture change to 05-07 / 05-30), or debounce recompute by a few hundred ms (a UX change from "recomputes live on every edit").

## Revision 2026-10-16 (plan-check and UI-check round on c68445a)

Two plan checks and two UI checks ran on c68445a. Every item is fixed here; plan count, waves and titles are unchanged (05-30 gains a conditional Task 2 and two files; 05-17 gains the 05-31 dependency, which is earlier in the graph, so no wave moves).

| Item | Fix | Plans |
|---|---|---|
| BLOCKER: verdicts led by `cash_dip` had no title or quick line (assess.ts sorts by shortfall; a hard dip is `no` on its own) | `ADJUST_TITLE`, `QUICK_CASH_LINE`, `QUICK_CREDIT_LINE` `satisfies Record<WarningCode, …>`; `no` precedence cash < 0 → month → hard dip; new keys `titleCashDip`, `titleNoCashDip`, `cashDip`, `cashDipHard`, `creditCashDip`, `creditCashDipHard` (all ≤ 64); dsr / owe Cash lines reuse the mode-neutral sentences; named tests | 05-02, 05-09, UI-SPEC |
| W-1 acceptance greps that could not pass (several keys or names share a line) | Rewritten as `grep -oE … | wc -l` (or `cat … | grep -oE … | sort -u | wc -l`) with correct counts; `_Cap` / `_Range` / `_Term` one alias per line; the 05-31 comment no longer quotes the retired cushion wording | 05-01, 05-02, 05-09, 05-31 |
| W-2 vacuous never-throw property; missing bounds | `fc.record`-shaped generator with out-of-range leaves and a "half the cases reach a logged, resolved verdict" assertion; parser: unique line ids, `isValidLocalDate` start dates, invalid tax % reset, setback months ≤ 600 / daysLate ≤ 365, money ≤ `MAX_INPUT_MINOR` (10^12), loan / promo APR ≤ `MAX_APR` (999.99%) via `isValidAprText` (also the card-rate field) | 05-07, 05-14 |
| W-3 tax drift on re-price (also my post-commit note) | `repriceInputs` solves the advertised price including tax-% lines (largest advertised whose resolved price ≤ the target), scales instalments from the price actually reached; named 6% test | 05-07 (05-16, 05-17 use it) |
| W-4 card fees never written | One day-one cash row of remainderOnDay + card fees; writtenLines matches; property: day-one writes sum to `plan.dayOne` (onCard counted only for payoff 'full') | 05-17, 05-20 |
| W-5 instalment note total | `{total}` = amount × count = `plan.total − plan.dayFees`; named test | 05-14 |
| W-6 null dealer cap | Builder maps a market row with no dealer cap (CA, UK) to null; the engine returns `dealer_cap_missing`; named CA test | 05-06 |
| W-7 nothing financed | Payoff line / caption only when `plan.months > 0`; no written loan lines with empty steps; no debt row when `financed === 0`; named tests | 05-09, 05-14, 05-17, 05-20 |
| W-8 plan-term chip | `planTerm = verdict.plan.months > 0 ? plan.months : null`; named test | 05-45 |
| Info | 05-17 depends on 05-31; fixtures state `limitsReset: 0` and `promoBalanceAtEnd: {}`; card-minimum promo balance falls back to `remainingBalance` unless cleared; trade-line fallback `tradeKeptTooLarge`; 04-VERIFICATION body Status aligned to passed and the D-20 residual marked resolved by D-64 / ME-03 | 05-07, 05-17, 05-02, 04-VERIFICATION |
| UI F1..F4 | Missing titles ≤ 64; card outcome words in the contract rows; "None in"; the 0% caption stated | UI-SPEC, 05-02, 05-09, 05-13 |
| User D-53..D-56 | Promotion clear-in tile; cents on payments; missing titles ≤ 64; debounced details with a conditional lazy fallback | 05-CONTEXT, UI-SPEC, 05-02, 05-07, 05-09, 05-13, 05-14, 05-17, 05-26, 05-30, 05-31, 05-37, 05-43, 05-VALIDATION |

The four "For the user" items in the quality review above are now decided: 1 → D-53, 2 → D-54, 3 → D-55, 4 → D-56.
