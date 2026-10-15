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

## Research open questions — defaults taken (need user confirmation)

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

Other research facts the plans rely on: `expo-notifications ~57.0.23` is a new dependency (needs a new dev build / preview APK; iOS Push capability once Apple enrolment is done); analytics `step` must be a string; `DateField` needs an explicit past-date guard; row-derived query keys nest under `['transactions', householdId]`; the repo pins Jest 29.7.
