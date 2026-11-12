---
phase: 06-grow
verified: 2026-11-11T12:00:00Z
re_verified: 2026-11-11
status: passed
score: 10/10 must-haves verified (1 by owner override)
overrides_applied: 1
overrides:
  - must_have: "A goal can be created from a Decide check (Create from Decide entry, BO-07)"
    reason: "Owner chose 'Leave for later' on 2026-11-11. Grow already receives newGoal/name/target/checkId and shows the linked badge; the Decide-side button is a follow-up after Grow merges."
    accepted_by: owner
    accepted_at: 2026-11-11
gaps: []
deferred:
  - truth: "Create from Decide button on the Decide answer"
    addressed_in: "Follow-up after Grow merges (owner, 2026-11-11)"
  - truth: "GL-04 right-answer case (net withdrawal: lock-or-leave prompt)"
    addressed_in: "Follow-up (no roadmap phase yet)"
    evidence: "Owner sent it back 2026-11-10. Draft in goals.json:398, allow-listed in phaseGate.test.ts:19-20. 06-REVIEW-FIX.md follow-up 1."
  - truth: "Review follow-ups 2-5: judge.ts freed-money wording, bulk mark-paid for removed goals, planMonthly not wired, cashLeft question"
    addressed_in: "Follow-up (owner decisions)"
human_verification: []
---

# Phase 6: Grow Verification Report

**Phase Goal:** A user can track savings goals, investments and debt payoff against their real numbers.
**Verified:** 2026-11-11
**Status:** gaps_found (two small gaps; plus one ops item)
**Re-verification:** No, initial verification
**Code verified:** worktree C:\dev\fincwin-g6, branch feat/06-grow, HEAD e7a09332 (PR #101)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: create a goal with a target or open-ended, flag exactly one emergency fund, set an automatic contribution | VERIFIED | Open-ended allowed: `20261106000100_grow_schema.sql:15`. One net per user: unique index at `:20-21`. A net is always a locked pot: `:18`. The UI offers "no target" in `NewGoalSheet.tsx:105,162`. The monthly amount is saved through `save_goal_plan`, which materialises the series (`src/db/goalPlan.ts:112`). Only `set_safety_net` flags a goal (`UseAsSafetyNetSheet.tsx:5`, `GoalDetailScreen.tsx:331,361`). |
| 2 | SC2: holdings across the supported types, with buy, sell, dividend and fee lots | VERIFIED | Table at `grow_schema.sql:106-121`, types brokerage, retirement, pension, crypto, other. Lots at `:180-190`, kind buy, sell, dividend, fee, value. UI: `AddHoldingSheet.tsx:27`, `LotSheet.tsx:27-31`. Wired from the GrowHome FAB (`GrowHome.tsx:123,136`). |
| 3 | SC3: gain or loss per holding and in total | VERIFIED | Engine `src/engine/grow/gain.ts:6,10,29` and `lots.ts:46`. Called in `useInvestingRead.ts:13,98,103,136`. Shown per row in `InvestingSegment.tsx:38-48,193` and in total at `:128,145`. |
| 4 | SC4: loans and revolving credit with balance, rate and minimum; avalanche and snowball compared, with an optional extra | VERIFIED | `AddDebtSheet.tsx:37` (loan, card, line, owed), rate and minimum at `:94-95,130`. Engine `strategy(debts, extra, order)` at `src/engine/payoff/strategies.ts:49`. Both orders ('rate' is avalanche, 'balance' is snowball) shown side by side in `PayoffPlanCard.tsx:37,95`, `DebtsSegment.tsx:382-383`. |
| 5 | SC5: projected payoff date and total interest for the chosen order | VERIFIED | `useDebtsRead.ts:71-73,171,194-195,255`. Rendered in `PayoffPlanCard.tsx:100-101`. |
| 6 | SC6 / GRW-10: hand-typed value, and its as-of date wherever the value is shown | PARTIAL (gap) | Rows (`InvestingSegment.tsx:166-167`), hero (`:129,146`), detail badge (`HoldingDetailScreen.tsx:109,194`) and the 30-day stale row (`asOf.ts:17`) all show it. **But** `GrowthIllustration.tsx:96` labels the holding-derived starting value "as of <today>", and the record link (`useRecordLinks.ts:61-64`) shows the total with no date. |
| 7 | SC7: the safety net is the one flagged goal; old settings migrated; changing its size changes Decide's next answer | VERIFIED | Data step at `20261106000200_...safety_net.sql:678-703` (pushed 2026-11-07 per CONTEXT D-36). Decide reads only `safetyNetInputsOf(safetyNetPointOf(...))` (`buildV3Inputs.ts:52,575`). Tests in `growConnect.test.ts:52-93`: "changing the goal size changes the net and the next answer", and the old columns are ignored. |
| 8 | SC8: debts carry a due day and payoff order in one module; Decide reads them; adding a debt never raises the lowest point | VERIFIED | `debts.payoff_order`/`due_day` in `grow_schema.sql:96,403`. Decide maps them through `debtToV3Debt` (`buildV3Inputs.ts:52`). Invariant test at `growDebtsLowestPoint.test.ts:33`. |
| 9 | SC9: a contribution counts once; Loans, Saving, Emergency and Envelopes setup live in Grow; contract tests on | VERIFIED | Two `06 ARC-15` marks in `buildV3Inputs.ts:464,479`. `contributionOnce.test.ts` has 8 cases. `GROW_ROUTES` at `setupFlow.ts:173-178` is used by `src/shell/decide/GrowLinkStep.tsx:22`. Connection-point contract tests: `goalPoint`, `safetyNetPoint`, `debtPoint`, `parity`, `monthBasisParity`. |
| 10 | Roadmap design line / 06-20: "Create from Decide" entry with the "linked to a decision" label | FAILED (gap) | The badge renders (`GoalRow.tsx:99,112`), and `check_id` is saved and shown (`GoalDetailScreen.tsx:287`). The param handler exists (`GrowHome.tsx:69-101`), but nothing in Decide navigates to it. The entry is orphaned (06-20-SUMMARY item 4). |

**Score:** 8/10 truths verified

Also verified from the phase design line:
- APP-30: selling an item closes its debt in one save. `record_debt_sale` is a single RPC (`src/data/mutations/growDebts.ts:7,441`, `src/db/debtPlan.ts:1`), reached from `DebtDetailScreen.tsx:376`.
- The Grow tab is on (`src/shell/tabBar/availableTabs.ts:15`).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | GL-04 lock-or-leave prompt (the case stays draft) | Follow-up | `goals.json:398` draft; `phaseGate.test.ts:19-20` allow-list; 06-REVIEW-FIX follow-up 1 |
| 2 | judge.ts freed-money wording, bulk mark-paid for removed goals, planMonthly not wired, cashLeft question | Follow-up | 06-REVIEW-FIX follow-ups 2-5 |

No later roadmap phase explicitly covers the two gaps. Phase 08.1's Variant C wording is too vague to defer the Create from Decide entry.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/engine/payoff/*` (strategies, fixedPayoff, cardMinimumEstimate) | VERIFIED | Pure engine, imported by `useDebtsRead.ts:10-21` |
| `src/engine/grow/*` (goalPlan, lots, gain, asOf) | VERIFIED | Imported by `useInvestingRead.ts:13` and goal models |
| `src/features/grow/connect/*` (goal, safety net, debt points) | VERIFIED | The one Decide import, `buildV3Inputs.ts:52` |
| `app/(app)/(tabs)/grow.tsx` + `app/(app)/grow/**` | VERIFIED | Routes for goal, debt and holding detail, safety net, lines, calculators |
| Migrations 20261106000100..0400, 20261110000100 | VERIFIED | Applied to production (06-11, 06-29, 06-37-SUMMARY:150) |
| Migration 20261110000200_grow_review_fixes.sql | EXISTS, NOT APPLIED (per records) | Defines `remove_goal`/`remove_debt`, which the client already calls. See Human Verification. |
| `GrowthIllustration.tsx` | PARTIAL | Wrong as-of label for holding values |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Decide `buildV3Inputs` | Grow connection points | `@/features/grow/connect` import, `:52,422,575` | WIRED |
| Decide setup steps | Grow screens | `growRouteOf` to `GrowLinkStep.tsx:22` | WIRED |
| AccountSheet | `accounts.interest_rate` (GRW-11) | `AccountSheet.tsx:162-239` | WIRED |
| Debt screens | `save_debt_plan` / `record_debt_sale` RPCs | `src/db/debtPlan.ts` | WIRED |
| Goal and debt removal | `remove_goal` / `remove_debt` RPCs | `goalPlan.ts:231`, `debtPlan.ts:212` | WIRED in code; server function missing in production until the 20261110000200 push |
| Decide check result | `/grow?newGoal=1` | none | NOT_WIRED |
| Holding / record link | Illustration as-of | route params | NOT_WIRED (no asOf param) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| InvestingSegment | holdings, gain | `useInvestingRead`, which reads holdings and lots through `replayLots` | Yes | FLOWING |
| PayoffPlanCard | scenarios, dates, interest | `useDebtsRead` through engine `strategy`/`fixedPayoff` | Yes | FLOWING |
| Decide safety net | net size | flagged `savings_goals` row through `safetyNetPointOf` | Yes | FLOWING |
| GrowthIllustration | start as-of | `today` constant | No (the holding date is dropped) | STATIC label |

### Behavioral Spot-Checks

The orchestrator's evidence from today was accepted. The verifier did not re-run it.
- Local run on e7a09332: tsc clean, eslint 0 errors, depcruise clean, jest 991 suites and 40,030 tests passed.
- CI on PR #101: checks, deno, mutation-changed, rls (pgTAP) and secret-scan all pass.
- Owner device check on the Pixel 9 approved. The create-flash fix e7a09332 was owner-confirmed.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GRW-01 | SATISFIED | Truth 1 |
| GRW-02 | SATISFIED | Truth 1 (unique index, `set_safety_net`) |
| GRW-03 | SATISFIED | Truth 1 (`save_goal_plan` series) |
| GRW-04 | SATISFIED | Truth 2 |
| GRW-05 | SATISFIED | Truth 2 |
| GRW-06 | SATISFIED | Truth 3 |
| GRW-07 | SATISFIED | Truth 4 |
| GRW-08 | SATISFIED | Truth 4 |
| GRW-09 | SATISFIED | Truth 5 |
| GRW-10 | PARTIAL | Truth 6 (illustration and record link) |
| GRW-11 | SATISFIED | `grow_schema.sql:86-88`; `AccountSheet.tsx:162-239`; APR and minimum on debts |

No orphaned requirement IDs. REQUIREMENTS.md:703-713 maps only GRW-01..11 to Phase 6. REQUIREMENTS.md still shows them as Pending, a bookkeeping update for phase completion.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/engine/decide/v3/__tests__/phaseGate.test.ts` | 49 | `it.todo` phase gate | Info | Expected while drafts remain (GL-04, SN-16..24, BR-16) |
| `src/features/grow/calculators/record/GrowthIllustration.tsx` | 96 | Hardcoded `today` as-of | Warning | Misstates the value's date (GRW-10) |
| `src/features/grow/home/GrowHome.tsx` | 69-101 | Param entry with no producer | Warning | The Create from Decide entry is unreachable |

### Human Verification Required

1. **Production migration 20261110000200.** After CI is green and `npm run supabase:preflight` passes, push with `npm run supabase:db:push` (owner-gated). Then on the device, remove a goal and a debt and undo each. Without the push, `remove_goal` and `remove_debt` fail on production. Production is the only Supabase project, so this also affects the preview builds.

### Gaps Summary

The phase goal is substantively achieved. Goals, the safety net, investments with lots and gain or loss, debts with both payoff orders, dates and interest, and APY all exist, are wired, and are fed by real data. Decide reads Grow only through the connection points, and the contract tests cover SC7-9.

Two narrow gaps remain:
1. **GRW-10 as-of accuracy.** The growth illustration says a holding's value is "as of today" even when it was typed weeks ago, and the calculators-page record link shows the total with no date. The fix is small: pass `asOf` through the route.
2. **Create from Decide entry orphaned.** Grow can receive a prefilled, linked goal, but Decide never sends the user there. If the owner prefers to defer it (06-20-SUMMARY item 4 already asked), record an override:

```yaml
overrides:
  - must_have: "A goal can be created from a Decide check and shows the 'linked to a decision' label"
    reason: "No Decide 'save for it' call site exists; Grow-side entry and badge are built and tested; the Decide button follows with the Variant C check screens"
    accepted_by: "<owner>"
    accepted_at: "<ISO timestamp>"
```

Separately, migration 20261110000200 must reach production before this branch ships to testers.

---

_Verified: 2026-11-11_
_Verifier: Claude (gsd-verifier)_


## Re-verification (2026-11-11)

1. **GRW-10 / SC6: closed.** The growth illustration now takes an `asOf` route param and shows it in the Starting value row (`GrowthIllustration.tsx`; falls back to today only when the date is missing, malformed or in the future). `HoldingDetailScreen` passes the holding's `value_as_of`. The calculators-page link passes the oldest as-of across holdings, as the Investing hero does, and its subtitle now reads "{value} as of {date} · {monthly} a month" (`useRecordLinks.ts`, `en.ts` `recordGrowthSub`). Tests: `recordCalculators.test.tsx` (own date, future and malformed fallbacks, link params and subtitle) and `investingScreens.test.tsx` (holding passes `asOf`). Calculators and investing suites: 116/116 pass. tsc, eslint and depcruise are clean.
2. **Create from Decide: owner override.** The owner chose to leave it for after Grow merges (see `overrides`).
3. **Production migration 20261110000200: applied.** `supabase migration list --linked` (after `npm run supabase:preflight` passed) shows local and remote both at 20261110000200, so `remove_goal` and `remove_debt` exist in production. Their behaviour is covered by pgTAP 96, which passed in CI (rls job) on e7a09332.

Status: **passed**.
