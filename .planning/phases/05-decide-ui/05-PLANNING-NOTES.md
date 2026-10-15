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
