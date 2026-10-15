# Phase 5: Decide UI - Research

**Researched:** 2026-10-15
**Domain:** React Native (Expo SDK 57) feature UI on top of a pure TS engine; Supabase schema + RLS + undo RPCs; TanStack Query snapshot assembly; local notifications; onboarding; demo seed data
**Confidence:** HIGH for codebase facts (cited by file and line), MEDIUM for recommended designs that CONTEXT leaves to Claude, LOW only where flagged

## Summary

Phase 5 is mostly integration work, and most of it already has a pattern in the repo. The engine contract is fully specified in `04-05-PLAN.md` (the `types.ts` block) and `04-12-PLAN.md` (the barrel). Phase 4 is **not executed**: `src/engine/decide` and `src/engine/payoff` do not exist in the worktree. So Phase 5 execution is blocked on Phase 4, and every Phase 5 plan must code against the names in those two plans. The multi-write "Go ahead" has an exact precedent in `bulkAdd.ts` + the `record_entry_list` RPC, which insert client-minted rows and create series as **one undo step**. The FAB, tab availability, setup routes, analytics guard, i18n draft tracking, haptics wrapper, `DateField(minDate)` and the wipe registry all exist and only need extending.

Three gaps are bigger than CONTEXT suggests, and the planner must handle them explicitly:
1. **There is no debts table.** Debt is Phase 6 (GRW-07/GRW-11), and accounts have `kind 'credit'|'loan'` but no APR, minimum or secured flag. Yet the snapshot needs `DebtRecord`/`CardRecord`, and D-09 "Go ahead" on a loan must write "a debt record". Phase 5 has to create minimal debt storage.
2. **There is no stored "full month" signal.** Import statement periods are not persisted anywhere, so D-13's flag needs a builder rule.
3. **Today's sample seed covers only the current, partial month** (`20261010000600_sample_data.sql` L71-151). That gives zero full months, so it cannot produce the D-19 sofa/car scenario. The demo needs a new seed covering several full past months, two open checks and a typed loan APR, verified by a test that runs the real engine against the same figures.

`expo-notifications` is **not installed** (`package.json`). It is the only new native dependency (UI-SPEC). It changes the fingerprint runtime version, so a new dev build and preview APK are needed. The SDK 57 API is verified below (DATE trigger, response listener, `getLastNotificationResponseAsync`). On Android it falls back to an inexact alarm without `SCHEDULE_EXACT_ALARM`, verified in Expo's source, so do not add that permission.

**Primary recommendation:** Build Decide as `src/features/decide/*` (screens, pure snapshot builder, code→copy maps) over new `src/db/decide*.ts` and `src/data/{queries,mutations}/decide*.ts` modules. Store checks, decisions, links, settings/limits/rough figures and minimal debts in new household/owner-scoped tables, using the `accounts`/`category_rules` RLS + column-grant + `bump_version` pattern. Make Go ahead / abandon / remove single undo steps through a `record_entry_list`-style RPC, extending the `apply_patches` entity allow-list. Recompute every verdict in render from a snapshot assembled from query keys nested under `['transactions', householdId]`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Verdict, options, alternatives, setbacks, first read, size code | Engine (`src/engine/decide`, Phase 4) | — | DEC-12 purity; Phase 5 only calls the barrel |
| Snapshot assembly (rows→`DecideSnapshot`, full-month flags, FX to home, series→`RecurringBill`, debts, limits) | Client data layer (pure builder in `src/features/decide/snapshot/`, hook in `src/data/queries/`) | Database (reads via RLS) | CONTEXT "snapshot builder lives outside engine/"; depcruise `engine-only-internal-src` forbids engine importing db types |
| Code → copy (verdict titles, warnings, suppression reasons, size labels) | UI (`src/i18n/locales/en.ts` + `src/features/decide/copy/`) | — | 04 D-21: engine emits codes only; DCU-09 tested on the catalogue |
| Persistence of checks, decisions, links, limits, rough figures, debts | Database (Supabase Postgres + RLS) | Client write queue (TanStack paused mutations) | Supabase is the sole source of truth (CLAUDE.md data layer) |
| Go ahead multi-write as one undo step | Database (security-definer RPC writing the undo_log row) | Client (inserts rows with client uuids first) | Precedent: `record_entry_list` (`20261012000300_entry_list.sql`) |
| Wait reminder | Device (expo-notifications local schedule) | Database (decision ready_by date is the source for reconcile) | Local-only OS state; must be reconcilable from server data |
| Analytics (ANL-06) | Client service (`src/services/analytics`) | — | Typed catalogue with the compile-time finite-props guard |
| Demo scenario seed | Database (security-definer seed RPC) | Test fixture mirror (TS) | Precedent: `seed_sample_data`; the `is_sample` flag is never client-writable |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Decision numbers are local to Phase 5. "04 D-xx" refers to `.planning/phases/04-decide-engine/04-CONTEXT.md`, and "03 D-xx" to the Shell context.

**Quick check and first read**
- **D-01:** With logged months, the quick check runs the full verdict as if paid in cash. It calls the engine's `assess()` with the paid-in-full method and returns `fits`/`adjust`/`no`, including the cushion and the month. The result is one chip plus one line, so it can never disagree with the full check.
- **D-02:** When cash doesn't cover it, the quick check states the gap and offers the full check. For example: "Not from cash: $x short of your cushion", then "Run the full check", which carries the name and price into step 1. The prototype's hardcoded 9.4% / 48-month line is removed. No rate the user didn't enter is ever shown (04 D-07).
- **D-03:** Phase 5 builds the onboarding first read, in the LAUNCH-POSITIONING order: welcome → consent → one account and balance → **rough monthly in and out** (new) → **first check** (new) → "Bring your history" (import / fresh / sample). The two new steps slot into the existing `app/(app)/setup/*` routes after `SetupAccountScreen` and before `SetupHistoryScreen`. Target: a first verdict in about 60 seconds (success criterion 6). The first check uses the engine's `firstRead()` (04 DEC-16, amended 04 D-11: `adjust` when cash would fall below 3 × rough spending).
- **D-04:** Real history replaces the rough figures automatically. As soon as one full month exists (logged or imported), the rough figures stop being used, open checks recompute, and the verdict's basis line changes visibly, e.g. "Now from your logged months". Until then the rough figures are editable. A first-read verdict always says what it rests on, and that an import sharpens it.
- **D-23 (added 2026-10-15, user, supersedes D-21's "only when cash doesn't cover it" and refines D-01/D-02):** Every quick check has four inputs, plus optional extras:
  - **Amount.** The item and price, parsed from "car 14500" as before.
  - **Cash or Credit.** A two-way toggle. It starts on Cash.
  - **APR.** Credit only. Starts at 0%, labelled "before any interest" until the user types a rate (04 D-07: never a default rate).
  - **Duration.** Credit only. Chips for 12, 24, 36, 48 and 60 months; 12 is selected.
  - **Optional extras.** A collapsed "+ Tax, fees" row. Sales tax is a user-typed % with no default; fees are a user-typed amount. Both add to the day-one price.
  - Cash runs the paid-in-full plan. Credit runs the engine's loan plan (amortised at the entered APR, no deposit).
  - Both go through `assess()`, so the result is the full verdict chip plus one line, the D-22 size label, and the monthly amount for Credit.
  - When Cash doesn't cover the purchase, the result still states the gap and offers a one-tap "Try on credit", which flips the toggle and keeps the amount.
  - "Run the full check" carries every field into steps 1–2. Credit maps to the loan method, taxes and fees to the step-2 adjustments.
  - The first read in onboarding uses the same inputs, assessed by `firstRead()`.
- **D-21 (added 2026-10-15, amends D-02; superseded in part by D-23):** When cash doesn't cover it, the quick check also shows an editable spread line. It reads "Spread it: [APR 0%] over [12 / 24 / 36 / 48 / 60 months] → $x a month. The month closes / is $y short."
  - The APR field starts at 0% and is labelled "before any interest" until the user types a rate. That starting value is user-editable input, not a default rate the engine invents (04 D-07 holds).
  - The term chips are 12, 24, 36, 48 and 60 months, with 12 selected.
  - The result is computed by the engine's loan plan (amortised payment at the entered APR, no deposit). It is assessed through `assess()`, so it gets the same month, debt-service and unsecured-debt tests as the full check, and it recomputes on every edit.
  - At 0% it is an upper bound: if the month doesn't close at 0%, no rate will make it close.
  - "Run the full check" carries the APR and term into step 2's loan method.
  - The spread line is not shown when cash covers the purchase.
- **D-22 (added 2026-10-15):** Every quick-check and full-check result carries a size label relative to the user's own money, never a fixed dollar band. The engine returns it as a code (04 D-36):
  - `from_spare_this_month`: the price is no more than this month's money left over.
  - `from_savings`: paid from cash, it still stays above the cushion.
  - `needs_spreading`: cash can't cover it above the cushion.
  Phase 5 maps the codes to copy, e.g. "Out of this month's spare", "Out of savings", "Needs spreading".

**Verdict and impact screen**
- **D-05:** Step 3 puts the answer first. At the top: the verdict card (chip, basis line, title, body), then up to five warning cards ordered by shortfall. The verdict line must be visible without scrolling at the phone screenshot size (DCU-11). Below, as collapsible sections, in the prototype's order: the month line by line (Now/After); where it lands (the five ledgers); who pays what (household only); against your lines; if something goes wrong (runway plus setbacks); what would make it work (the options list); assumptions in play. All prototype content is kept.
- **D-06:** The D-35 "pause" case is an amber warning card that states the amount. Chip: "Needs adjustment". The card reads like "The month closes only if $x a month of investing pauses" (or saving, or both). It is declarative and never "you should pause". It counts as one of the warnings.
- **D-07:** Step 4's "If saved" column becomes "Kept". At the 0% default return (04 D-06), it shows the money kept over N months. A "+ Add a rate" link lets the user enter their own return, and the column header then reads "Kept, at x%". The prototype's "keeps earning" framing is removed. Rows whose money isn't spare show "—" with an amber reason (DCU-06, from the engine's suppression codes).
- **D-08:** Step navigation: steps become tappable once reached. The five-segment bar jumps to any step already reached. Jumping forward to step 3 or later needs steps 1–2 complete (a price and a payment method). The step flow is a full-screen stack (03 D-12), and the FAB is hidden during it (03 D-09/D-10).

**The decision: what gets written**
- **D-09:** "Go ahead" writes pending entries, depending on the payment method, after one confirm. All entries are listed under "What gets written" and are written in one confirmed action, which supports undo (02.x undo stack): Cash: a pending expense dated on "When you need it". Loan: a debt record (with `secured` set from the item, 04 DEC-11), plus a recurring payment series. Instalment: a recurring series with a count. Card: a pending expense on the card account. Running costs: a recurring series. Breaking a line is allowed, and the record notes it ("This breaks a line you set. You can still log it — the record notes it.").
- **D-10:** "Wait and save" saves the decision with a monthly saving amount and a ready-by date. A local notification on that date reopens the check, recomputed. No goal object is created. Phase 6's goals may adopt these later.
- **D-11:** "Pass" keeps the decision in Past decisions until the user deletes it. It keeps its "why", sends no reminders, and can be reopened as a new check. This replaces the prototype's conflicting "filed for twelve months" / "kept until" copy.
- **D-12:** Estimate-vs-actual compares the estimate with the sum of the decision's linked lines, at 30 and 90 days. Linked lines are the lines Go ahead wrote, plus any the user attaches to the decision. The comparison covers the day-one cost and the monthly cost (payment plus running costs), as numbers only, and needs no new data entry. The prototype's version is static seed data; this replaces it.
- **D-13:** Dates use the existing native `DateField` (`minDate` = today, so past dates are refused), with quick-offset chips above it: "In a week", "In a month", "In 3 months" (DCU-08). There is no custom month grid.

**Storage and recompute**
- **D-14:** The "Lines you will not cross" limits are stored once per user and apply to every check. They are edited on the Decide home screen. A blank line uses the engine default (04 D-01…D-05). Open checks are always judged against the current lines.
- **D-15:** Open-check verdicts are recomputed live from the current snapshot every time they're shown, and are never stored. The engine is pure and fast. The last state the user saw is stored only so the chip can mark "changed since you last looked". This settles the open-check recompute question that 04 D-30 left to Phase 5.

**Free/Pro, demo account and screenshots**
- **D-16:** Each Pro-candidate feature goes through one `canUse(feature)` entitlement hook, which returns true for every feature for now (PRICING §186). The Pro candidates are: more than one open check, setbacks, the decision journal with estimate-vs-actual, and card/loan payoff comparisons. Phase 9 switches them on without touching the screens.
- **D-17:** The alternatives table is free. It is the ethical core of Decide (DCU-06) and a store promise ("Cheaper, later, or skip it"), and it appears in screenshot 3. This amends `.planning/research/PRICING.md` §2 (the alternatives table moves from Pro to Free). Phase 9 must take this as an input.
- **D-18:** Phase 5 builds the scope toggle and split-override UI, shown only when the household has more than one member. Until Phase 8 that means the toggle is always hidden. The demo scenario and screenshots run in personal scope. Household screenshots are redone after Phase 8.
- **D-19:** The demo scenario uses two checks, sofa then car: Screenshot 1: a sofa at $1,800 → "It fits". Screenshot 2: a car at $14,500 on a loan → "Needs adjustment", showing what breaks. Screenshot 3: the car's four alternatives. The data is seeded as the demo account's sample months plus these two open checks, so nothing is staged outside the real app (success criterion 7). The loan's APR is part of the seeded check, typed in as a user would; it is never a default.

**Analytics**
- **D-20:** ANL-06 events cover lifecycle and verdict state only: `quick_check_run` (state), `check_started`, `check_step_viewed` (step number), `check_completed` (state), `check_abandoned`, `decision_recorded` (go / wait / pass), `first_read_shown` (state). Only enums are sent, never amounts or item names. The existing catalogue guard in `src/services/analytics/catalogue.ts` enforces this.

**Copy (carried and bound)**
- All copy lives in `src/i18n/locales/en.ts` and is marked as draft in `copyStatus.ts`. The engine's codes (04 D-21) map to catalogue keys. A test asserts that no Decide key contains "advice", "recommend" or "you should" (DCU-09). The voice is declarative, not prescriptive. Verdict strings are ported from the prototype (HTML 4476–4512) with typographic apostrophes, minus any that imply a rate the user didn't enter.
- Haptics fire on the verdict reveal and on committing a decision (BUILD-PROMPT §155), using `notificationAsync`/`impactAsync` only.
- No review prompt after a "You cannot afford this" verdict (LAUNCH §4).

**UI-SPEC (approved, also LOCKED):** `05-UI-SPEC.md` is the binding visual/interaction contract. That includes the DCU-11 fold budgets at 402×874, the copy table, the banned-word list, the StateChip map, haptics list, motion and accessibility rules, and the accepted researcher assumptions (2, 3, 5 and 9 confirmed by the user; the others stand unless revised at planning).

### Claude's Discretion
- The snapshot builder's query shape and its TanStack Query keys, and how confirmed series, paid-only rows and refunds (04 D-23…D-28) are assembled.
- The table layout for checks, decisions and limits, with RLS per household or user, following the existing migration patterns.
- The exact copy wording, kept to the prototype's voice and DCU-09.
- How the quick check parses text ("car 14500"); port the prototype's parser.
- Item-type pre-fill from the item name (04 D-14 regex suggestion) in step 1.

### Deferred Ideas (OUT OF SCOPE)
- Savings goals created by "Wait and save" → Phase 6 (Grow) may adopt Wait decisions.
- Household-scope screenshots and a 2-member demo → after Phase 8.
- Real Free/Pro enforcement and the paywall → Phase 9, with D-17 amending PRICING.
- Level gating of Decide sub-features → Phase 9 (03 D-03: the tab itself is never hidden).
- A custom month-grid date picker → not planned. Revisit only if the native picker fails design review.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DCU-01 | Cash answer from item + price without the flow | Quick-check parser (port of prototype L4238-4241, integer-safe via `parseAmount`); `assess(snapshot, BuyCheck{payment:{method:'cash'}})`; `firstRead` fallback when there is no full month (04 REPLAN note 10) |
| DCU-02 | Five steps: item, price/payment, impact, alternatives, decision | Engine `assess`, `buildOptions`, `buildAlternatives`, `applySetbacks`; check persisted in `decide_checks.inputs` (autosave through the write queue); one outer-stack route |
| DCU-03 | Leave a check open, return with verdict recomputed | D-15: no stored verdict; `last_seen_state`/`last_seen_basis` columns only; recompute in `useMemo` from `useDecideSnapshot` |
| DCU-04 | Abandon an open check | Soft delete (`deleted_at`) + undo step (entity `decide_checks`, patch `deleted_at: null`); toast with Undo (`showToast({stepId})`) |
| DCU-05 | Four alternatives with outcomes | `buildAlternatives(...)` returns a 4-tuple `rows` (as_planned, cheaper, wait_and_save, skip) |
| DCU-06 | Suppressed + labelled when not genuinely spare | `AlternativeRow.suppression {code: month_short/too_thin/nothing_freed/past_horizon/nothing_spare, amount}` → reason copy |
| DCU-07 | Record a decision; estimate vs actual later | Decision columns + `decide_links` table; estimate stored at decision time; actual = sum of linked transactions/series in the 30/90-day windows |
| DCU-08 | Date selection refuses past dates + quick offsets | Existing `DateField` has `minDate` (L18-19, L48) but **does not clamp `onChange`**: add a guard; offset chips +7d, +1 calendar month, +3 calendar months (UI-SPEC assumption 8) |
| DCU-09 | No "advice/recommendation/you should" | Existing global `FORBIDDEN_VOICE` test (`src/i18n/__tests__/catalogue.test.ts` L33); add a Decide-namespace test with the UI-SPEC's extended banned list |
| DCU-10 | First verdict in first session, labelled, superseded by history | New `setup/rough` + `setup/first-check` routes between `SetupAccountScreen.onSaved` and `/setup/history`; `firstRead(RoughFigures, check)`; rough figures in `decide_settings`; builder switches basis once ≥1 full month exists |
| DCU-11 | Legible screenshots from demo account, verdict above the fold | UI-SPEC fold budgets; new demo seed (≥3 full months + sofa/car checks); engine-run fixture test proving sofa=fits, car=adjust with ≥2 warnings and `needs_spreading` |
| ANL-06 | Checks/decisions measurable, no amounts | Add 7 events to `EventCatalogue`; **step must be a string literal union `'1'..'5'`**, because the guard rejects numbers (`catalogue.ts` L67-74) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Engine purity:** nothing in `engine/` imports `db/`, `state/`, `services/`, `ui/` or `react`. It is enforced by `.dependency-cruiser.cjs` (`engine-only-internal-src`, `engine-no-reach-impure`) and eslint boundaries. Phase 5 consumes `src/engine/decide` **through its barrel only** and never edits `src/engine/`.
- **Money:** integer minor units everywhere, never floats. The prototype parser uses `parseFloat` (HTML L4238), so the port must use `src/engine/money/parseAmount.ts`. APRs and percentages are `Percent` (a bigint at RATE_SCALE, 04-01).
- **Data layer:** Supabase-direct + persisted TanStack Query cache + paused-mutation write queue. Every write goes through `qc.setMutationDefaults(key, {mutationFn, scope: WRITE_SCOPE, retry: shouldRetryWrite, ...})` (`src/data/keys.ts` L97-100).
- **Compliance voice:** never "advice", "recommendation", "you should". Not a lender. The card path must never read as an offer.
- **expo-haptics:** only `notificationAsync`/`impactAsync`/`selectionAsync`, via `src/ui/haptics.ts`.
- **Expo SDK 57** stable line; no SDK 58 packages (`expo-notifications` latest is 58.x on the `next` tag, so pin `~57.0.23`).
- **Design fidelity:** §2 tokens only; `noRawColours.test.ts` must pass (UI-SPEC).
- **Supabase:** one production project. Never use the Supabase MCP. Migrations go through `npm run supabase:db:push` (preflight chained) as a human-gated `[BLOCKING]` task. Local verification uses `npx supabase db reset --local && npx supabase test db` (Docker 29.7.2 is available).
- **GSD workflow:** edits only through GSD commands. Main is protected, so changes land through branch + PR (memory).
- **Quality gate:** an engine coverage drop fails CI. CI runs lint, typecheck, depcruise, check:ignores, test:coverage, verify:gates, lint:migrations, verify:migrations, the two mirror checks, a service-role grep, and `supabase test db` (`.github/workflows/ci.yml`).

## Standard Stack

### Core (already installed: reuse, do not add)
| Library | Version (package.json) | Purpose | Notes |
|---------|---------|---------|-------|
| expo | ~57.0.24 | Runtime | [VERIFIED: package.json] |
| expo-router | ~57.0.22 | Routes `app/(app)/(tabs)/decide.tsx`, `app/(app)/decide/check/[id].tsx`, `app/(app)/decide/past.tsx`, `app/(app)/setup/rough.tsx`, `app/(app)/setup/first-check.tsx` | typedRoutes on (`app.config.ts`) |
| @tanstack/react-query (+ persist) | ^5.103.2 | Snapshot reads, write queue | [VERIFIED: package.json] |
| @supabase/supabase-js | 2.117.0 | db modules | |
| @react-native-community/datetimepicker | 9.1.0 | via `DateField` | |
| react-native-gesture-handler / reanimated | ~2.32 / 4.5.1 | `StepSlider` (UI-SPEC: no slider package) | |
| react-native-svg | 15.15.4 | glyphs | |
| expo-haptics | ~57.0.3 | via `src/ui/haptics.ts` | |
| posthog-react-native | 4.76.0 | via `getAnalytics().track` | |
| expo-crypto | ~57.0.3 | `Crypto.randomUUID()` for client ids / step ids | |

### Added this phase
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| expo-notifications | **~57.0.23** (dist-tag `sdk-57`) | D-10 Wait reminder | [VERIFIED: npm dist-tags `sdk-57: 57.0.23`, `latest: 57.0.23`, `next: 58.1.4`]. Install with `npx expo install expo-notifications` |

**Installation:**
```bash
npx expo install expo-notifications
```
Then add `'expo-notifications'` to `plugins` in `app.config.ts`, plus an Android `icon` option if a monochrome notification icon exists. Otherwise accept the default and note it.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local notification | Server push (Edge Function cron) | Push needs APNs/FCM setup, tokens and server state; a local date reminder needs none. Rejected for v1 |
| `@react-native-community/slider` | — | UI-SPEC forbids adding it; `StepSlider` is built on gesture-handler + Reanimated |
| Storing verdicts | — | Forbidden by D-15 |

## Architecture Patterns

### System Architecture Diagram

```
 Supabase (RLS)                                        Device
 ─────────────                                         ──────
 transactions_active ─┐                     ┌──────────────────────────────┐
 recurring_series ────┤  TanStack queries    │ useDecideSnapshot()          │
 accounts + balances ─┤  (keys nested under  │   rows/series/accounts/fx    │
 fx_latest ───────────┤   ['transactions',hh]│   decide_settings, debts     │
 decide_settings ─────┤   or own keys)       │        │                     │
 debts ───────────────┘ ───────────────────► │  buildDecideSnapshot() pure  │
                                             │   full-month rule, FX→home,  │
                                             │   paid-only, refunds, series │
                                             │        │                     │
                                             │   ┌────┴───────────┐         │
                                             │   │ ≥1 full month? │         │
                                             │   └─┬────────────┬─┘         │
                                             │  yes│            │no        │
                                             │ DecideSnapshot  RoughFigures │
                                             │     │            │ (or none) │
 decide_checks (inputs) ──► useChecks() ──►  │ checkFromInputs(inputs)      │
                                             │     │            │           │
                                             │  engine/decide barrel        │
                                             │  assess / prepareContext /   │
                                             │  buildOptions / Alternatives │
                                             │  applySetbacks / firstRead   │
                                             │     │ codes + numbers         │
                                             │  copy maps (i18n keys) ──► Screens
                                             └──────────────┬───────────────┘
 Writes (WRITE_SCOPE queue, client uuids):                  │
   autosave check  ──► upsert decide_checks (no undo step)  │
   abandon/remove  ──► soft delete + undo step              │
   Go ahead  ──► insert rows ─► RPC record_decide_go ─► series + debt + check status + links + ONE undo_log row
   Wait      ──► update check (outcome, monthly, ready_by) ─► schedule local notification (id kept on device)
   Pass      ──► update check (outcome)
 Notification tap ──► (app)/_layout observer ──► validate uuid ──► /decide/check/[id]?step=3
```

### Recommended Project Structure
```
app/(app)/(tabs)/decide.tsx            # tab root (flip TAB_AVAILABILITY.decide → true)
app/(app)/decide/check/[id].tsx        # 5-step flow (outer stack, FAB auto-hidden as 'outer')
app/(app)/decide/past.tsx              # past decisions
app/(app)/setup/rough.tsx              # D-03 new step
app/(app)/setup/first-check.tsx        # D-03 new step
src/features/decide/
  home/ (DecideHomeScreen, QuickCheckCard, YourMonthCard, OpenChecksCard, LinesCard)
  check/ (CheckFlowScreen, steps/Step1..Step5, StepBar, VerdictCard, WarningCard, OptionRow ...)
  past/ (PastDecisionsScreen, DecisionDetailSheet)
  onboarding/ (RoughFiguresScreen, FirstCheckScreen)
  snapshot/ buildSnapshot.ts, fullMonths.ts, toCheck.ts   # PURE, no React (add 100% coverage threshold)
  copy/ verdictCopy.ts, warningCopy.ts, suppressionCopy.ts  # code→key maps, exhaustive via `satisfies Record<Code, ...>`
  quickParse.ts, offsets.ts, estimateActual.ts           # pure helpers
  entitlements.ts                                        # canUse(feature) → true (D-16)
  notifications/ waitReminder.ts, useNotificationObserver.ts
src/db/decideChecks.ts, decideSettings.ts, debts.ts, decideLinks.ts
src/data/queries/decide.ts            # useDecideSnapshot, useChecks, useDecideSettings
src/data/mutations/decide*.ts         # registerDecideMutations(qc) added to mutations/index.ts
supabase/migrations/2026101x..._decide_*.sql
supabase/tests/database/5x_decide_*.test.sql
```

### Pattern 1: One undoable multi-write (Go ahead): copy `bulkAdd` + `record_entry_list`
**What:** The client inserts transaction rows with client-minted UUIDs through `insertTransactionsBatch`, so the FX stamping trigger and the currency/time-zone guards apply. It then calls one security-definer RPC that creates the series (`create_recurring_series(..., p_anchor_is_new => true)`), inserts the debt, flips the check's status, writes the links, and appends **one** `undo_log` row whose ops are the inverses. The step id is minted before `mutate()` and is the server's replay key (`already-applied` = success).
**Source:** `src/data/mutations/bulkAdd.ts` L1-8, L184-260; `supabase/migrations/20261012000300_entry_list.sql` L1-128.
**Required extensions:**
- `apply_patches` + the undo_log op-validation trigger must allow the new entities. Today they allow-list `('transactions','categories','recurring_series','accounts','category_rules')` (`20261012000200_category_rules_patches.sql` L27, L104, L135, L159-170, L257-282). Add `debts` and `decide_checks` with allowed columns, column type map entries and the ownership branch. This is a whole-function `create or replace`, exactly like the 02.3 migration did.
- TS: `UndoEntity` union and `UNDO_LABEL_KEYS` in `src/engine/undo/types.ts` L14, L34 (engine/undo is a 100% folder, so any change needs tests), the en `undo.label.*` copy, and the `UndoConflict` refusal copy.
- Ending replaced-expense series (D-09 "{m} existing expenses closed") inside the same step reuses `end_recurring_series`' change set + `series_change_inverse`.

```typescript
// Source: src/data/mutations/bulkAdd.ts (pattern)
qc.setMutationDefaults(mutationKeys.decideGoAhead, {
  mutationFn: (vars: GoAheadVars) => guardSession(vars, async () => {
    const client = await writeClient();
    await insertTransactionsBatch(client, vars.rows);          // client uuids, idempotent
    return recordDecideGo(client, { rowIds: vars.rows.map(r => r.id), series: vars.series,
      debt: vars.debt, checkId: vars.checkId, decision: vars.decision,
      undo: { id: vars.stepId, labelKey: 'decisionWritten', labelParams: {} } });
  }),
  scope: WRITE_SCOPE, retry: shouldRetryWrite, retryDelay: writeRetryDelay,
  onMutate: (vars) => { markSession(vars); /* optimistic: check → bought */ },
  onSuccess: (_r, vars) => { /* invalidate transactionsRoot, recurringSeries, decideChecks, debts, undoLog */ },
  onError: /* rowsLanded pattern from bulkAdd L232-258: ids/counts only in recordFailedWrite */,
});
```

### Pattern 2: Snapshot = pure builder + query hook; keys nested under transactionsRoot
**What:** `useDecideSnapshot()` gathers its reads and calls a pure `buildDecideSnapshot(input)` that returns `{kind:'logged', snapshot} | {kind:'rough', figures} | {kind:'none'}`.
**Why nested keys:** every transaction write invalidates `['transactions', householdId]` (`src/data/keys.ts` L13-24 and comments). A history-range key outside that prefix would serve stale verdicts after an edit, which breaks D-15.
- Reuse the month queries: `queryKeys.transactionsMonth(hh, month)` via `useQueries` for the last N months (shared cache with Activity), or one range read with `fetchTransactionsInRange` (`src/db/transactions.ts` L266-286) under a new key `['transactions', hh, 'decide-history', from, to]`.
- `useRecurringSeries` (all rows in `recurring_series` are user-created or accepted; detect suggestions are client-only offers, so every series row is `confirmed: true`, which satisfies 04 D-25).
- `useAccounts` + `useAccountBalances` (`src/data/queries/activity.ts` L315-345, balances are in account currency) + `useFxLatest` for conversion via `homeAmountFor`/`projectionHomeAmount` (`src/data/queries/homeAmount.ts`).
- FX rule: depcruise `fx-fetch-never-from-reads` (`.dependency-cruiser.cjs` L31-36) says "balances, totals and Decide read stored rates only". The builder must never import `db/fxResolve`.

**Builder rules to implement (from 04-05 types):**
- `RecordLine.amount` ≥ 0 with `direction`. Source rows carry signed `original_amount`; use the home amount (`homeAmountFor`). A row with `null` home amount (rate pending or missing) cannot be converted: exclude it and surface a count in "Assumptions in play" (recommendation; flag in the plan).
- `status`: pass it through (the engine ignores non-`paid` lines in past months, 04 D-28).
- `isRefund` from `is_refund`, `transferId` from `transfer_id`, `seriesId` from `recurring_series_id`, `categoryId`.
- Omit debt repayments and saving/investing contributions that are not transfer legs (04-05 L124-126). They enter through `debts[].minimumPayment`, `monthlySaving` and `monthlyInvesting`. Classify by builtin category (`Debt`, `Savings`).
- `RecurringBill`: outflow series only (`amount < 0`), live (`deleted_at` null; ended series omitted per 04 REPLAN note 3). `latestAmount = abs(amount)` converted to home. `lastPaidDate` = latest `paid|skipped` occurrence date of that series (04 REPLAN note 2): needs the series' materialised rows, which are in the fetched months or a small per-series read.
- `cashOnHand` = sum of home-converted balances of `cash|checking|savings` accounts (archived/deleted excluded). Credit/loan accounts with negative balances become debts (see Open Question 1).
- `asOf` = `rc.today` (the engine has no clock).
- `limits` from `decide_settings` (nulls = engine defaults, D-14). `basisOverride` from settings (UI-SPEC assumption 10). `projectionReturn` from settings (D-07 "+ Add a rate"; recommend stored with the check, since the rate is entered per alternatives view; planner choice).
- Market row for `MARKET_DEFAULTS`: `rc.region` → `'US'|'CA'|'CA-QC'|'UK'`, falling back to `CA` for Canada (04-RESEARCH L532). It is used only to prefill card minimum terms and the dealer cap.
- **No bigint in persisted state.** `Percent` is a bigint (04-01). Never put a `Verdict`, `Percent` or `DecideSnapshot` into query data or mutation variables: the persister and paused-mutation dehydration use JSON. Store APRs as decimal strings and convert with `percent(s)` at the engine boundary.

### Pattern 3: Full-month flag (04 D-13) without stored statement periods
Statement periods are parsed (`src/engine/statement/types.ts` L96, `useStatementImport.ts` L454-518) but **not persisted**. There is no `import_batches`/coverage table (verified: `create table` list across all migrations). Recommended rule (ASSUMED, confirm in plan-check):
- A month M is **full** iff M < current month AND M has ≥1 active row AND M ≥ coverageStartMonth, where coverageStart = the household's earliest active row date (non-sample, or sample when the demo is seeded) and the start month itself is full only if that earliest date is the 1st.
- Better, forward-looking: persist import coverage (`statement_periods`: household, account, start, end) from `importFinalize` so imported months spanning 1st→last count as full even when the first row is on the 3rd. This is a small additive migration. Planner decides whether it is in scope.
- Lookback: fetch up to 12 months before the current month and take the newest 6 full months (04 D-09). The engine averages; the builder only sets `full`.

### Pattern 4: Autosaving checks without undo noise
- `decide_checks.inputs jsonb` holds every step field: strings for APR/tax %, minor-unit integers for amounts, ISO dates and line arrays. Validate it on the client with a schema function before write. Also add a Postgres `check (pg_column_size(inputs) < 32768)` and `jsonb_typeof(inputs) = 'object'`.
- Autosave is a debounced (about 600ms) `upsert` through the write queue with **no undo step** (it is an edit-in-progress, like a draft). Abandon, remove and Go ahead are undo steps. Version conflicts: last write wins for drafts (same device). The version column still exists for undo ops.
- `furthest_step`, `last_seen_state`, `last_seen_basis` are columns (D-15 "changed since you looked"; D-04 "Now from your logged months").

### Pattern 5: Onboarding insertion
- Today: `SetupAccountScreen` → `AccountSheet.onSaved(id)` → `router.replace('/setup/history', {accountId})` (`src/features/record/setup/SetupAccountScreen.tsx` L43).
- Change: `onSaved` → `/setup/rough?accountId` → `/setup/first-check?accountId` → `/setup/history?accountId`.
- Register `Stack.Screen name="setup/rough"` and `"setup/first-check"` in `app/(app)/_layout.tsx` (L54-66). Add both to `NO_SWIPE_BACK` in `src/features/navigation/swipeBackGesture.ts` L29 (a linear flow never swipes back).
- The first-account gate (`firstAccountGate.ts`) only checks accounts. A user who quits mid-onboarding lands in tabs with no rough figures, which is acceptable: Your month offers "Add rough figures" (UI-SPEC empty state).
- First-read cash = the onboarding account's balance (its `opening_balance`, converted if its currency differs from home; the rough figures use the home currency).
- `getAnalytics().track('first_read_shown', {state})` mirrors `onboarding_history_choice` (`SetupHistoryScreen.tsx` L35-47).

### Pattern 6: FAB, tab and back
- `TAB_AVAILABILITY.decide = true` (`src/shell/tabBar/availableTabs.ts` L13-19). The tab screen file `app/(app)/(tabs)/decide.tsx` must exist because `availableTabs().map(id => <Tabs.Screen name={id}/>)` (`(tabs)/_layout.tsx` L45-47).
- Decide home: `useRegisterFab({label: t('shell.fab.newCheck')..., onPress})` (`FabProvider.tsx` L176-199). Register the quick-menu entry `useProvideQuickAction('newCheck', fn)` from a host mounted in the tabs layout, like `ShellEntryHost` (`src/features/record/entry/ShellEntryHost.tsx` L22-26). `shell.quick.newCheck` copy already exists (`en.ts` L1313).
- The check flow is an outer-stack route, so `fabSurface` is `'outer'` and the FAB hides automatically (`shouldHideFab.ts` L36-39). `'stepFlow'` exists as a hide reason for date pickers if needed.
- Step back: keep the step in screen state (or `router.setParams`). Add a screen-level `BackHandler` listener (registered after the app-wide one, so it fires first, LIFO) that returns `true` while step > 1, and route the SwipeBack/back circle through the same `stepBack()`. ASSUMED mechanism, MEDIUM confidence: verify against `BackHistoryProvider`'s observed-pop model on device.

### Pattern 7: Local notification (expo-notifications SDK 57) [CITED: docs.expo.dev/versions/v57.0.0/sdk/notifications]
```typescript
// src/features/decide/notifications/waitReminder.ts
import * as Notifications from 'expo-notifications';
Notifications.setNotificationHandler({            // module level, imported from the root layout
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});
export async function ensureChannel() {            // Android 13: the permission prompt needs a channel first
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('decide-reminders', {
    name: t('decide.notify.channel'), importance: Notifications.AndroidImportance.DEFAULT });
}
export async function scheduleWaitReminder(checkId: string, readyBy: string /* YYYY-MM-DD */) {
  await ensureChannel();
  const perm = await Notifications.getPermissionsAsync();
  const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;                       // UI-SPEC: decision still saves; toast "Notifications are off..."
  return Notifications.scheduleNotificationAsync({
    content: { title: t('decide.notify.title'), body: t('decide.notify.body'), data: { checkId } }, // no amounts/names
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: localMorning(readyBy), channelId: 'decide-reminders' },
  });
}
// cancel: Notifications.cancelScheduledNotificationAsync(id) — resolves even if nothing matches
```
- **Tap handling:** in `app/(app)/_layout.tsx` (after the consent gate, so only signed-in users route), mount a `useNotificationObserver`. It reads `await Notifications.getLastNotificationResponseAsync()` once on mount (cold start), subscribes `addNotificationResponseReceivedListener` (cleanup with `.remove()`), filters `actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER`, validates `data.checkId` against a UUID regex, dedupes by `response.notification.request.identifier`, then calls `router.push({pathname:'/decide/check/[id]', params:{id, step:'3'}})`. The docs' example uses the sync `getLastNotificationResponse()`, but the sync getter is marked deprecated on the SDK 57 page (with a self-referencing note), so **use the Async variant**. [CITED: docs.expo.dev notifications v57]
- **Android exact alarms:** `ExpoSchedulingDelegate.setupAlarm` uses `setExactAndAllowWhileIdle` only when `SDK < S || canScheduleExactAlarms()`, else `setAndAllowWhileIdle` (inexact). [VERIFIED: raw.githubusercontent.com/expo/expo/sdk-57/.../ExpoSchedulingDelegate.kt]. Do not add `SCHEDULE_EXACT_ALARM`: a ready-by morning reminder does not need minute precision, and Play restricts that permission.
- **Reboot:** the library adds `RECEIVE_BOOT_COMPLETED` and reschedules. [CITED: docs]
- **iOS:** the config plugin writes `aps-environment` (default `development`) unless already set [VERIFIED: plugin source `withNotificationsIOS.ts`]. The iOS build then needs the Push Notifications capability on the App ID. That is moot until Apple enrolment, but note it for 00-20.
- **Reconcile (recommended):** the notification id is device-local. Store `checkId → notificationId` in AsyncStorage under the `fincwin:` prefix. On Decide mount, compare `getAllScheduledNotificationsAsync()` with Wait decisions whose `ready_by` ≥ today, and schedule any that are missing (covers reinstall, a second device, and permission granted later). Cancel on remove, reopen or Go ahead from a Wait decision. Register a wipe handler (`src/services/storage/wipe.ts` L24) that calls `cancelAllScheduledNotificationsAsync()` on sign-out or account deletion.
- **Jest:** no mock exists. Add `jest.mock('expo-notifications', ...)` per test file (`jest.setup.ts` keeps only global mocks).

### Pattern 8: Copy mapping with compile-time exhaustiveness
```typescript
// src/features/decide/copy/warningCopy.ts
import type { WarningCode, SuppressionCode, PurchaseSize } from '@/engine/decide';
export const WARNING_TITLE = { month: 'decide.warn.month.title', cash: 'decide.warn.cash.title',
  dsr: 'decide.warn.dsr.title', owe: 'decide.warn.owe.title', inv: 'decide.warn.inv.title' } as const satisfies Record<WarningCode, string>;
export const SIZE_LABEL = { from_spare_this_month: 'decide.size.spare', from_savings: 'decide.size.savings',
  needs_spreading: 'decide.size.spreading' } as const satisfies Record<PurchaseSize, string>;
```
Plus `copyStatus.ts`: `...leafPaths('decide', en.decide)` (pattern at L126-134).

### Anti-Patterns to Avoid
- **Caching verdicts.** D-15 forbids it, and bigints break persistence.
- **Computing money in the UI with floats** (tax %, display rounding). Use engine/money `divideHalfUp` and `formatAmount`. Sales tax = `divideHalfUp(price × scaledPercent, 100 × 10^RATE_SCALE)`, done in a pure helper outside engine/ or via payoff `percent` helpers.
- **A new query key outside `['transactions', hh]` for row-derived reads** (stale verdict after an edit).
- **Calling `assess()` on every keystroke without memoisation.** Memoise on (snapshot identity, inputs). Fire `quick_check_run` on "Check it"/Go, not per edit.
- **Routing a notification to `data.url`.** Build the href from a validated id; never trust payload paths.
- **Writing `owner_id`/`created_by` in payloads.** Column defaults + RLS pin them (`src/db/undoLog.ts` L5-8 convention).
- **Importing `suggestItemType`/`suggestSecured` into a verdict path.** Fine for the step 1 pre-fill only (04-12 isolation test).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-write undo | Client-side compensating deletes | `record_entry_list`-style RPC + `undo_log` ops + `apply_undo_step` | Server checks versions; refusal and conflict toasts already exist (`src/data/mutations/undo.ts`) |
| Offline writes | Custom queue | `setMutationDefaults` + `WRITE_SCOPE` + `guardSession`/`markSession` + `recordFailedWrite` | Replay order, sign-out safety, failed-writes UI exist |
| Amount parsing | `parseFloat` port | `src/engine/money/parseAmount.ts` / `useAmountParser` | Locale separators, exponents, bounds |
| Money formatting | String concat | `useMoneyFormatter` (`src/ui/money`) | show_cents, currency exponents |
| FX conversion | New rate maths | `homeAmountFor` / `projectionHomeAmount` | Stored-rate-only rule; BigInt parse |
| Recurrence maths | Date loops | `src/engine/recurring/schedule.ts` + engine `nextDueDate`/`billsDueWithin`/`monthlyEquivalent` | Already 100%-covered |
| Date picking | Month grid | `DateField` + offset chips | D-13 |
| Bottom sheets | `@gorhom/bottom-sheet` | `src/ui/Sheet`, `ConfirmSheet`, `SheetHeader` | Not installed; the app's own Sheet has dirty and discard rules |
| Toast + undo | New toast | `showToast({kind, text, stepId})` (`src/state/undoToast.ts`) | Single host, durations, screen-reader handling |
| Haptics | Direct expo-haptics | `hapticSuccess/Warning/Medium/Selection` (`src/ui/haptics.ts`) | Async API, swallowed rejections |
| Analytics privacy | Ad-hoc checks | `EventCatalogue` finite-props guard | Compile-time rejection of strings/numbers |

**Key insight:** every Decide write lands in tables that Record, undo, History and Activity already read. Reusing the Record write path is the only way Go ahead's lines show up correctly in Activity, and the only way they are undone as one step.

## Runtime State Inventory

Not a rename phase. One runtime-state item matters: **scheduled local notifications live in OS state, outside Supabase**. They must be cancelled on decision remove/reopen/Go ahead and on sign-out/account-deletion wipe, and they must be re-derived from `ready_by` on a new device. Everything else is stored data (new tables) or code. Build artifacts: adding a native module changes the fingerprint `runtimeVersion` (`app.config.ts` L16), so **a new dev build and a new preview APK are required** (memory: preview APK timing, EAS from a real node_modules checkout). OTA cannot deliver it.

## Common Pitfalls

### Pitfall 1: Snapshot has no debts, saving or investing data
**What goes wrong:** with an empty `debts[]` and `monthlySaving = monthlyInvesting = 0`, the cushion (D-02 uses debt minimums), `dsr`/`owe` warnings and the D-35 pause all go silent. The car demo then cannot show "what breaks" via `dsr`.
**Why:** Phase 6 owns debts and goals; no table exists (grep: no `debt` table in any migration; accounts `kind` only, `20260924000300_accounts.sql` L17).
**How to avoid:** add minimal `debts` storage in Phase 5 (Open Question 1). Derive saving/investing from transfers into `savings`/`investment` accounts plus `Savings`-category outflows (Open Question 2). Make the demo seed include a debt with a minimum and a monthly saving transfer so screenshot 2 has two warnings.
**Warning signs:** the demo car check shows only one warning, or never `dsr`.

### Pitfall 2: Analytics `step` as a number
The catalogue guard rejects numeric props (`catalogue.ts` L67-74). Use `step: '1'|'2'|'3'|'4'|'5'`, `state: 'fits'|'adjust'|'no'|'missing'`, `decision: 'go'|'wait'|'pass'`. `check_started`/`check_abandoned` are `Record<string, never>`.

### Pitfall 3: DateField accepts past dates on some paths
`minimumDate` is a picker hint; `handle()` passes any set date through (`DateField.tsx` L37-40). Also an old open check can hold a stored past date. Clamp in `onChange` (refuse < today) and render the UI-SPEC "This date has passed" state with Next disabled.

### Pitfall 4: Offset chips use day arithmetic
UI-SPEC assumption 8: +1 and +3 **calendar months** with the day clamped (31 Jan + 1 month → 28/29 Feb), computed on local-date strings (`src/engine/time/localDate.ts`), never `Date` + `toISOString` (MON-14 comment in `DateField.tsx` L1-3).

### Pitfall 5: Undo entity allow-list not extended in all four places
Abandon/Go ahead undo will be refused server-side unless the `undo_log` validation trigger, `apply_patches` entity checks (L104 and L135), allowed-columns `case` (L159-170) and type map (L257+) are all extended, plus the ownership branch (L208-230). Copy the 02.3 migration structure and add pgTAP coverage like `44_record_polish_patches.test.sql`.

### Pitfall 6: Demo outcomes drift from the seed
The sofa fits / car adjust outcomes depend on cushion = 3 × month costs, balances, debts, etc. Mitigation: define the demo figures once in a TS fixture. A jest test runs `buildDecideSnapshot(fixtureRows)` → `assess` and asserts sofa `fits`, car `adjust` with ≥2 warnings and size `needs_spreading`, and alternatives with ≤3 suppressed rows. A `--check` script asserts that the SQL seed constants match the fixture (same idea as `scripts/gen-recurring-mirror-test.mjs`). The seed's `v_mult` currency scaling (`sample_data.sql` L65-68) means non-USD demo accounts scale. Screenshots must use a USD-home demo account.

### Pitfall 7: Notification routing before auth/consent
Mounting the observer in the root layout routes a cold-start tap before sign-in or consent. Mount it inside `app/(app)/_layout.tsx` after the `needsPrompt` redirect (L37-42), and re-check `getLastNotificationResponseAsync` once when the user becomes signed in.

### Pitfall 8: Persisted mutation variables with bigint or PII
Paused mutations are dehydrated to AsyncStorage. Variables must be JSON-safe (APR as string). Failed-write records must carry ids and counts only (precedent `bulkAdd.ts` L250-256).

### Pitfall 9: Fold budgets broken by dynamic text
DCU-11 depends on the title ≤3 lines and body ≤2 lines at 402 wide. Enforce with copy-length tests (title ≤ about 64 chars after interpolation with demo values) and `numberOfLines` plus `maxFontSizeMultiplier={1.3}` where the UI-SPEC caps.

### Pitfall 10: Full month vs rough figures flapping
When the first full month appears (D-04), checks seen under the first read must show "Now from your logged months" once. Store `last_seen_basis`. Compare it with the current basis when rendering, then update it on open.

## Code Examples

### Quick-check parse (integer-safe port of HTML L4238-4241)
```typescript
// src/features/decide/quickParse.ts — pure
export function parseQuick(text: string, parse: (s: string) => MinorUnits | null):
  { name: string; price: MinorUnits } | null {
  const t = text.trim();
  const m = /[\d][\d.,]*/.exec(t);                   // first number = price
  if (!m) return null;
  const price = parse(m[0]);                         // engine/money parseAmount via useAmountParser
  if (price === null || price <= 0) return null;
  const rest = t.replace(/[\d.,]+/g, '').trim();
  const name = rest.length === 0 ? null : rest.charAt(0).toUpperCase() + rest.slice(1);
  return { name: name ?? '', price };                // '' → UI shows t('decide.quick.unnamed')
}
```

### Check inputs → engine `BuyCheck`
```typescript
// D-23: Credit = loan, deposit 0, typed APR (0 allowed → ZERO_PERCENT, never missing); tax+fees → dayFees
const payment: BuyPayment = mode === 'cash'
  ? { method: 'cash' }
  : { method: 'loan', deposit: minorUnits(0), termMonths: months, apr: percent(aprText === '' ? '0' : aprText) };
const check: BuyCheck = { kind: 'buy', currency: snapshot.currency, price, dayFees: add(taxAmount, fees),
  itemType: 'general', runningCostsNet: minorUnits(0), payment };
```

### Migration skeleton (RLS + grants, from `accounts`)
```sql
create table public.decide_checks (
  id uuid primary key,                                   -- client-generated
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('buy','invest')),
  name text not null default '' check (char_length(name) <= 80),
  inputs jsonb not null default '{}' check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) < 32768),
  status text not null default 'open' check (status in ('open','bought','waiting','passed')),
  furthest_step smallint not null default 1 check (furthest_step between 1 and 5),
  last_seen_state text check (last_seen_state in ('fits','adjust','no','missing')),
  last_seen_basis text check (last_seen_basis in ('logged_months','first_read_rough_figures')),
  -- decision fields (null while open)
  decided_at timestamptz, estimate_day_one bigint, estimate_monthly bigint, verdict_at_decision text,
  wait_monthly bigint, ready_by date, why text check (why is null or char_length(why) <= 500),
  is_sample boolean not null default false,
  deleted_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.decide_checks enable row level security;
create policy "own checks" on public.decide_checks for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));
create trigger set_version before update on public.decide_checks for each row execute function public.bump_version();
revoke all on public.decide_checks from anon;
revoke insert, update, delete, truncate on public.decide_checks from authenticated;
grant select on public.decide_checks to authenticated;
grant insert (id, household_id, kind, name, inputs, furthest_step, last_seen_state, last_seen_basis) on public.decide_checks to authenticated;
grant update (name, inputs, furthest_step, last_seen_state, last_seen_basis, deleted_at, why) on public.decide_checks to authenticated;
-- status/decided_at/estimate_*: written only by record_decide_* definer RPCs (Go/Wait/Pass) so the
-- journal cannot be forged into an inconsistent state from a client payload; is_sample never client-writable.
```
Similar tables: `decide_settings` (pk `user_id`, rough_income/rough_spending/rough_currency, the six limits as nullable columns, `dsr_line`/`projection_return` as `numeric` read `::text`, `basis_override`), `decide_links` (decision/check id, `entity in ('transactions','recurring_series','debts')`, `target_id`, `source in ('written','attached')`, `deleted_at`), `debts` (Open Question 1). Every FK to household/user is `on delete cascade` so account deletion purges.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shouldShowAlert` in the notification handler | `shouldShowBanner` + `shouldShowList` | expo-notifications SDK 53+ | Use the new keys [CITED: docs v57] |
| `getLastNotificationResponse()` (sync) | `getLastNotificationResponseAsync()` / `useLastNotificationResponse()` | marked deprecated on the v57 page | Use Async [CITED: docs v57; the deprecation note is self-referencing, LOW-MEDIUM] |
| Trigger as a bare `Date` | `{ type: SchedulableTriggerInputTypes.DATE, date, channelId }` | SDK 52+ | Typed trigger input [CITED] |
| Prototype quick check: cash-only + hardcoded 9.4%/48mo | D-23 Cash/Credit inputs through `assess()` | 2026-10-15 | — |
| CLAUDE.md says Jest 30 | Repo pins `jest ~29.7.0`, `jest-expo ~57.0.5`, RNTL `^14.0.1` | — | Use the repo's versions [VERIFIED: package.json] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 5 creates a minimal `debts` table (and lets credit/loan accounts carry APR/minimum) ahead of Phase 6 | Pitfall 1, OQ1 | Without it D-09 loan "debt record" and the dsr/owe warnings cannot work; Phase 6 may want a different shape |
| A2 | Saving/investing per month derived from transfers into savings/investment accounts + `Savings` category outflows | OQ2 | The D-35 pause and the investing/saving floors are wrong for users who save differently |
| A3 | Full-month rule = month before current, ≥1 row, at or after the household's earliest row (start month full only if it starts on the 1st) | Pattern 3 | Partial months could enter averages (wrong verdict); this is Core Value risk |
| A4 | Checks and decisions are owner-private (created_by = auth.uid()) with household_id carried for Phase 8 | Migration skeleton | Phase 8 may need household-shared journals; additive policy change later |
| A5 | Autosave writes create no undo steps; only abandon, remove and Go ahead do | Pattern 4 | Undo History noise vs missing undo for edits |
| A6 | Go ahead cash expense goes to the user's main cash/checking account (largest balance) unless chosen | — | UI-SPEC names "{account}" but no picker; may need a picker row in step 5 |
| A7 | The demo scenario is delivered by extending/versioning the sample seed RPC (sample months + two `is_sample` checks), not a separate demo-only mechanism | OQ4 | If App Review sign-in (not yet built) needs its own seeding, a second path is needed |
| A8 | Step-back via a screen-level `BackHandler` + shared `stepBack()` cooperates with `BackHistoryProvider` | Pattern 6 | Back could exit the flow instead of stepping; verify on device |
| A9 | Rows with a null home amount are excluded from the snapshot and counted in "Assumptions in play" | Pattern 2 | Under-counted spending for unstamped foreign rows |
| A10 | Sales tax applies to the price only, rounded half-up, and is paid on day one (not financed) | Code examples | Credit monthly figure differs from user expectation |

## Open Questions (RESOLVED)

> **Resolution (2026-10-15, plan-phase, non-interactive):** each question below was resolved by taking the recommendation, recorded in `05-PLANNING-NOTES.md` § "Research open questions — defaults taken". OQ1 → minimal `debts` table in Phase 5 (05-03). OQ2 → savings/investment-account transfers + Savings-category outflows (05-06). OQ3 → heuristic + persisted `statement_periods` (05-03, 05-06, 05-19). OQ4 → versioned sample seed shared by "Explore with sample figures" and the demo account (05-18). OQ5 → investment checks kept in scope, low priority. These are planning resolutions; the user is asked to confirm OQ1 and OQ3 (Core Value risk) before execution, which is blocked on Phase 4 anyway.

1. **Debt storage before Phase 6.**
   - What we know: the snapshot needs `DebtRecord {balance, minimumPayment, secured, apr}` and `CardRecord {apr, minimumTerms}`; D-09 writes "a debt record"; there is no table; GRW-07/GRW-11 (rate and minimum on accounts) are Phase 6.
   - What's unclear: whether to add a `debts` table now, or nullable columns (`apr`, `minimum_payment`, `secured`, card minimum terms) on `accounts` for `credit`/`loan` kinds, with Go ahead creating a `loan` account.
   - Recommendation: a `debts` table (id, household_id, created_by, account_id null, name, kind `loan|card|other`, currency, balance bigint, apr numeric null, minimum_payment bigint, secured bool, term_months, start_date, check_id null, deleted_at, version), minimal edit UI only through Decide. Credit accounts get optional `apr`/minimum-terms columns, or a `debts` row with `kind 'card'` linked by `account_id`. Raise it at plan-check; it touches Phase 6 scope.
2. **Monthly saving/investing source** (A2). Recommend transfers into `savings`/`investment` accounts (average over the full months used) + `Savings`-category outflows. Confirm.
3. **Full-month signal** (A3). Recommend the heuristic now, plus persisting import statement periods from `importFinalize` (small additive table) so imports that start mid-month are judged correctly.
4. **Demo seed delivery.** The allow-listed App Review sign-in does not exist yet (no code matches `demo`). Recommend versioning `seed_sample_data` (or adding `seed_decide_demo`) to insert ≥4 full past months, a debt, a savings transfer series and two `is_sample` open checks (sofa cash; car loan with a typed APR). Extend `clear_sample_data` to remove sample checks, links and debts. Then "Explore with sample figures" and the demo account share one path.
5. **Investment checks** ("+ Investment" on home) are in UI-SPEC but D-19 doesn't need them. The engine supports `InvestCheck`. Keep them in scope (DCU-02 titles) but low priority.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/test | ✓ | v24.15.0 | — |
| Docker (local Supabase for pgTAP) | migration tests | ✓ | 29.7.2 | CI runs `supabase test db` |
| Supabase CLI | migrations (human-gated push) | ✓ (npx) | 2.121.0 | — |
| expo-notifications | D-10 | ✗ (not installed) | — | none; install `~57.0.23` |
| Phase 4 engine (`src/engine/decide`, `payoff`) | everything | ✗ (not executed) | — | **Blocking**: execute Phase 4 first |
| EAS dev build with the new native module | device testing of the reminder | needs a rebuild | — | Jest mocks for logic; device check at phase end |
| Apple enrolment | iOS build (aps-environment) | ✗ | — | Android (Pixel) verification path |

**Missing dependencies with no fallback:** the Phase 4 engine (execute and verify first); the production migration push (human-gated).
**Missing with fallback:** expo-notifications (install); iOS (verify on Android).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ~29.7.0 + jest-expo ~57.0.5 + @testing-library/react-native ^14.0.1 + fast-check ^4.10.2; pgTAP via `supabase test db` |
| Config file | `jest.config.js` (per-folder thresholds; roots `src`, `supabase/functions`), `jest.setup.ts` |
| Quick run command | `npx jest src/features/decide src/data/mutations/__tests__/decide src/i18n --silent` |
| Full suite command | `npm run lint && npm run typecheck && npm run depcruise && npm run check:ignores && npm run test:coverage && npm run lint:migrations && npm run verify:migrations` and locally `npx supabase db reset --local && npx supabase test db` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DCU-01 | parse "car 14500"; cash verdict = full-check verdict for the same inputs; Credit at 0% labelled; first-read fallback | unit + RNTL | `npx jest src/features/decide/__tests__/quickParse.test.ts src/features/decide/home/__tests__/QuickCheckCard.test.tsx` | ❌ Wave 0 |
| DCU-02 | 5 steps navigate; jump rules (D-08); autosave queued | RNTL | `npx jest src/features/decide/check/__tests__/CheckFlow.test.tsx` | ❌ |
| DCU-03 | open check recomputes against a changed snapshot; changed marker | unit + RNTL | `npx jest src/features/decide/home/__tests__/OpenChecks.test.tsx` | ❌ |
| DCU-04 | abandon → soft delete + undo step; Undo restores | mutation test + pgTAP | `npx jest src/data/mutations/__tests__/decideChecks.test.tsx`; `supabase test db` (decide_checks undo) | ❌ |
| DCU-05/06 | four rows rendered; suppressed row shows "—" + reason for each SuppressionCode | RNTL + exhaustive map test | `npx jest src/features/decide/check/__tests__/Alternatives.test.tsx` | ❌ |
| DCU-07 | Go ahead writes rows/series/debt in one step; undo removes all; estimate vs actual at 30/90 | mutation + pgTAP + unit | `npx jest src/data/mutations/__tests__/decideGoAhead.test.tsx src/features/decide/__tests__/estimateActual.test.ts` | ❌ |
| DCU-08 | past date refused; offsets +7d/+1m/+3m clamp | unit + RNTL | `npx jest src/features/decide/__tests__/offsets.test.ts src/features/record/entry/pickers/__tests__/DateField.test.tsx` | ❌ / extend |
| DCU-09 | no banned words in `decide.*` (extended list); global FORBIDDEN_VOICE still passes | unit | `npx jest src/i18n/__tests__/decideCopy.test.ts src/i18n/__tests__/catalogue.test.ts` | ❌ / ✅ |
| DCU-10 | setup order account→rough→first-check→history; first read labelled; basis switches once a full month exists | RNTL + unit | `npx jest src/features/decide/onboarding src/features/record/setup` | ❌ / extend |
| DCU-11 | demo fixture: sofa fits, car adjust ≥2 warnings + needs_spreading, ≤3 suppressed; copy lengths fit caps | unit (engine-backed) | `npx jest src/features/decide/__tests__/demoScenario.test.ts` | ❌ |
| DCU-11 | real screenshots at 402×874 | manual | device capture (human-UAT) | manual-only |
| ANL-06 | events typed, enums only; fire points | typecheck + unit | `npm run typecheck`; `npx jest src/features/decide/__tests__/analytics.test.tsx` | ❌ |
| snapshot | builder: full-month rule, paid-only, refunds, transfers excluded, series bills, FX null exclusion, currency single | unit (100% threshold) | `npx jest src/features/decide/snapshot` | ❌ |
| D-10 | schedule/cancel/reconcile/tap-routing with uuid validation | unit (mocked expo-notifications) | `npx jest src/features/decide/notifications` | ❌ |
| RLS | new tables isolate users/households; grants; cascade on delete | pgTAP | `npx supabase test db` | ❌ |

### Sampling Rate
- **Per task commit:** the quick run command for the touched folder + `npm run typecheck`
- **Per wave merge:** the full suite command
- **Phase gate:** full suite + `supabase test db` green, plus Android device walkthrough (screenshots, reminder fire and tap) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `jest.config.js`: add `./src/features/decide/snapshot/` at 100% (pure builder; Core Value risk)
- [ ] `src/features/decide/__tests__/helpers/` fixture rows + demo fixture (single source for the SQL seed mirror)
- [ ] expo-notifications jest mock helper
- [ ] pgTAP files for `decide_checks`, `decide_settings`, `decide_links`, `debts`, the Go-ahead RPC and the extended `apply_patches`
- [ ] `scripts/` check that the demo seed SQL constants match the TS fixture (wire into CI like `check:recurring-mirror`)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (existing auth) | — |
| V3 Session Management | yes (indirect) | `guardSession`/`markSession` on every new mutation; wipe handler cancels notifications |
| V4 Access Control | yes | RLS on every new table (`created_by = auth.uid()` and `household_id in user_household_ids()`); column-level grants; status/decision columns writable only by definer RPCs; definer RPCs check membership and `auth.uid()` first and use `set search_path = ''` |
| V5 Input Validation | yes | Client schema validation of `inputs`; SQL `check` constraints (lengths, enums, jsonb type and size, amount bounds `abs(x) <= 10000000000000`); RPC argument validation as in `record_entry_list`; route param UUID regex |
| V6 Cryptography | no | — (`Crypto.randomUUID` for ids) |
| V8 Data Protection | yes | No amounts or names in analytics (catalogue guard), notifications (lock screen) or failed-write records |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-household read/write of checks, debts or links | Information disclosure / Tampering | RLS + pgTAP isolation tests (`02_rls_isolation` pattern) |
| Forged journal (client sets status 'bought' with fake estimate) | Repudiation | Status/estimate columns excluded from client grants; only `record_decide_*` RPCs write them |
| Link to another household's transaction | Tampering | RPC/trigger verifies the target row is in the caller's household before inserting a link |
| Undo op smuggling via new entities | Elevation | `apply_patches` allow-listed columns per entity, ownership branch, MAX_UNDO_OPS |
| Notification payload leaks a purchase on the lock screen | Information disclosure | Fixed copy, no amount or name; `data` carries only the check uuid |
| Deep-link / notification param injection | Tampering | Validate uuid; build the href in-app; route only after auth+consent; not-found state for deleted or foreign checks (RLS returns nothing) |
| Amount/name leakage in analytics | Information disclosure | `EventCatalogue` finite literal unions; no numbers |
| `is_sample` rows used to mass-delete real data | Tampering | `is_sample` not client-writable (`sample_data.sql` header L1-5); seed/clear RPCs definer with membership checks |
| Account deletion leaves Decide data | Privacy (GDPR) | `on delete cascade` from households/auth.users on every new table |

## Sources

### Primary (HIGH confidence)
- Codebase (worktree `C:/dev/fincwin-04ctx`): `package.json`, `app.config.ts`, `jest.config.js`, `jest.setup.ts`, `src/data/keys.ts`, `src/data/mutations/{bulkAdd,markMonthly,undo,undoCapture}.ts`, `src/db/{rows,undoLog,samples,transactions,recordReads}.ts`, `src/data/queries/{activity,homeAmount,monthDataState}.ts`, `src/engine/undo/types.ts`, `src/engine/categorize/builtins.ts`, `src/features/record/setup/*`, `app/(app)/_layout.tsx`, `app/(app)/(tabs)/_layout.tsx`, `src/shell/tabBar/{tabs,availableTabs}.ts`, `src/shell/fab/{FabProvider,quickActions,shouldHideFab}.ts*`, `src/features/navigation/swipeBackGesture.ts`, `src/features/record/entry/pickers/DateField.tsx`, `src/services/analytics/{catalogue,posthog}.ts`, `src/i18n/{copyStatus.ts,__tests__/catalogue.test.ts}`, `src/ui/haptics.ts`, `src/state/undoToast.ts`, `src/services/storage/wipe.ts`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml`, migrations `20260924000300_accounts.sql`, `20261010000600_sample_data.sql`, `20261012000200_category_rules_patches.sql`, `20261012000300_entry_list.sql`
- Planning: `05-CONTEXT.md`, `05-UI-SPEC.md`, `04-CONTEXT.md`, `04-05-PLAN.md` (types contract), `04-12-PLAN.md` (barrel), `04-REPLAN-NOTES.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `PROJECT.md`
- npm registry: `expo-notifications` dist-tags (`sdk-57: 57.0.23`)
- [docs.expo.dev/versions/latest/sdk/notifications](https://docs.expo.dev/versions/latest/sdk/notifications/): v57.0.0 reference
- [ExpoSchedulingDelegate.kt @ sdk-57](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-notifications/android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt): exact/inexact fallback
- [withNotificationsIOS.ts @ sdk-57](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-notifications/plugin/src/withNotificationsIOS.ts): aps-environment

### Secondary (MEDIUM confidence)
- [Android 14 schedule-exact-alarms changes](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms): permission not pre-granted; inexact fallback guidance

### Tertiary (LOW confidence)
- None used for decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (installed versions read from package.json; expo-notifications verified on npm and in SDK 57 source)
- Architecture: HIGH for reuse patterns (exact precedents cited); MEDIUM for the new table designs and builder rules (Claude's discretion; assumptions logged)
- Pitfalls: HIGH (each is tied to a specific file and line)

**Research date:** 2026-10-15
**Valid until:** 2026-11-14 (stable SDK line). Re-check if Phase 4's barrel names change during execution.


---

## Addendum: Depth expansion (D-24..D-37)

**Researched:** 2026-10-15 (addendum to the research above; nothing above is rewritten)
**Scope:** 05-CONTEXT D-24…D-37 (and D-24 amended, the 04 D-42 and D-24/D-44 amendments carried into 05-CONTEXT), 05-UI-SPEC "Depth surfaces" and assumptions 17–27, against `04-PHASE5-ALIGNMENT.md` "Engine depth expansion (D-41..D-58) — public API" and 04-CONTEXT D-41…D-60.
**Confidence:** HIGH for codebase facts (file:line), HIGH for engine names (quoted from 04-05-PLAN `<interfaces>` and the alignment doc), MEDIUM for the new storage designs (Claude's discretion), LOW only where flagged.

### Addendum summary

The 29 existing Phase 5 plans (05-01…05-29) were written against D-01…D-23 only. `grep one_off|oneOff` across every 05 plan returns nothing, and no plan mentions goals, future changes, cash path, or `decide(`. So the expansion is not covered anywhere yet. It changes the plan set in five places:
- **Record:** a new `transactions.one_off` column (D-29), and probably a `transactions.goal_id` tag (D-34). Both touch Record's insert/patch key lists, the `transactions_active` view, column grants and the `apply_patches` allow-list.
- **New tables:** `decide_changes` (D-27) and `savings_goals` (D-34). Phase 6 inherits `savings_goals`.
- **Snapshot builder (05-06):** it gains `oneOff`, `incomeSeries`, `futureChanges`, `investmentBalance` and per-check `projectionRates`. Under D-37 it must turn "row left out and counted" (A9) into a **`missing` result** whenever a needed rate is absent.
- **Computation bridge (05-07):** it moves from `assess(snapshot, check)` to `decide(snapshot, check, otherChecks)`, plus `investmentViews`, `incomeAtRisk`, `runningCostPrompts` and `estimateBias`.
- **Reminder module (05-11):** it becomes two-kind (wait and cooling-off), keyed by `${kind}:${checkId}`.

Nine engine-API gaps or mismatches are listed under "Engine-API gaps vs 04-PHASE5-ALIGNMENT". The most consequential:
- D-36 needs the estimate split three ways, but 05-03 stores only two estimate columns.
- `PromoTerms.deferredInterest` is required by the engine, but no UI-SPEC input supplies it.
- The UI-SPEC's "Loss of value … about {x}" has no amount source.
- D-59's `cash_tight_before_payday` basis fact has no copy and no API name yet.
- D-37's "latest stored rate for every line" conflicts with Phase 1's dated-stamp rule that Activity uses.

**Primary recommendation:**
- Amend the unexecuted plans in place: 05-03 tables, 05-04 allow-list, 05-06 builder, 05-07 bridge, 05-11 reminders, 05-18 seed.
- Add three new plans: Record one-off toggle; Changes coming up; charts and goal progress.
- Recompute every depth figure in render from `decide()`, as before. Persist only user inputs: check `inputs` jsonb, the `decide_changes` rows and the goal row.

### Engine entry point Phase 5 must now use

| Need | Call (04-PHASE5-ALIGNMENT) | Where Phase 5 calls it |
|---|---|---|
| Combined + standalone verdict, worst month, margins, stress, expected income | `decide(snapshot, check, otherChecks)` → `Decision { verdict, standalone, combinedDiffers, stacked, worstMonth, margins, stress, withExpectedIncome }` | 05-07 `computeCheck` (step 3 and the quick check) |
| Chip only (home list, open-check rows) | `assess(snapshot, check, otherChecks)` → `Verdict` (= `decide(...).verdict`) | 05-12 / 05-21 open-checks list; cheaper than `decide` |
| Options / alternatives / setbacks / wait / investment views on the combined position | pass `decision.verdict.context` and `decision.verdict` to `affordablePrice`, `buildOptions`, `buildAlternatives`, `applySetbacks`, `incomeAtRisk`, `buildWaitPlan`, `investmentViews` | 05-07 |
| Cash path | `verdict.cashPath` (`CashPathReport`), `verdict.cashDip`, warning `cash_dip`, `verdict.basisCodes` | 05-15 / new chart plan |
| Confidence | `verdict.confidence` (also on a missing Verdict and on `FirstRead`) | 05-15, 05-13 |
| Running-cost prompts | `runningCostPrompts(itemType)`, `isNonCashCategory(c)`; `RunningCosts.nonCash` | 05-14 |
| Estimate bias | `estimateBias(decisions: PastDecision[], currency)` | 05-14 (needs data, see D-36) |

[VERIFIED: 04-PHASE5-ALIGNMENT.md L167-232; 04-05-PLAN.md L505-590]

Bigint rule (unchanged, now wider): `Decision`, `CashPathReport`, `InvestmentViews`, `ProjectionRate` and `StressOutcome` all carry `Percent` bigints. They live only in `useMemo` and never in query data, mutation variables or `inputs` (Pattern 2, Pitfall 8 above).

### D-29: one-off lines (Record field)

**Schema facts:**
- `transactions` boolean flags precedent: `is_refund`, `is_automatic` and `is_sample` were added in `20261010000100_record_polish_columns.sql` L11-14. [VERIFIED]
- **`transactions_active` is `select *` and froze its column list.** Any new column needs the view re-created and its grants re-issued, exactly as L47-62 of that migration did ("RESEARCH Pitfall 1" comment at L47-49). If this is missed, every month read through the view silently lacks `one_off`. [VERIFIED]
- Grants pattern: `grant insert (is_refund, is_automatic)` / `grant update (...)` at L64-65. [VERIFIED]
- `clear_sample_on_edit` (L72-95) clears `is_sample` when any non-bookkeeping column changes. So toggling one-off on a sample line makes it real. That is consistent with D-10 of 02.2, so no change is needed. [VERIFIED]

**Undo/patch path (all four places, same as Pitfall 5):**
1. `apply_patches` allowed columns for `transactions`: `20261012000200_category_rules_patches.sql` L159-162 (add `'one_off'`).
2. Type map: L257+ (add `when 'transactions.one_off' then 'boolean'`).
3. `undo_log_fill` (L11-38) allow-lists **entities only**, not columns, so no change for `one_off`. It does change for the new entities below.
4. This is a whole-function `create or replace`. **Fold it into 05-04's rewrite** (which already adds `debts` and `decide_checks`) so that there is one rewrite, not two. Ordering: the column migration must precede 05-04's function migration.

**Client key lists** (`src/db/transactions.ts`):
- `TRANSACTION_INSERT_KEYS` L33-57.
- `TRANSACTION_PATCH_KEYS` L65-80.
- `TRANSACTION_COLUMNS` select string L85-86. It must include `one_off`, or the undo capture's before-state (cached row) lacks it, and the edit-undo inverse cannot restore it.
- `TransactionRow`/`NewTransaction`/`TransactionPatch` in `src/db/rows.ts` (L32+, L87 `is_refund` precedent).
- Optimistic row builders (`cacheRows.ts`, `transactionCache.ts`, `batchInsert.ts` L133, `transactions.ts` L235/L425) need `one_off: false` defaults. TypeScript forces this once the field is non-optional.

**UI:**
- `TransactionSheet.tsx` L980-997 is where the `Automatic` and `Refund` `ToggleRow`s live (create and edit mode share it).
- Add `ToggleRow` "One-off, won't recur" there.
- Hide it when `state.direction === 'transfer'` (transfer legs are never income or spending).
- Hide it when the row belongs to a series (`editRow?.recurring_series_id`) or `repeats` is set: a recurring line cannot be a one-off.
- Form state: `transactionForm.ts`. Add `oneOff` to `FormState` (L54-56 precedent), the from-row mapper (L105-106), the insert builder (L279-280) and the patch diff (L299-300 precedent: `if (state.oneOff !== (row.one_off ?? false)) patch.one_off = state.oneOff`).
- `one_off` must **not** be added to `TEMPLATE_FIELDS` (`recurringForm.ts` L79-93): it is never a series template field.
- `TransactionDetailSheet` (173 lines) is read-only. Add a "One-off" row in `detailRows.ts` (refund precedent L54) so the flag is visible.
- The UI-SPEC's "TransactionDetailSheet edit mode" is in fact `TransactionSheet` in edit mode.

**Snapshot:** `RecordLine.oneOff` (04-05 L141). Add `one_off` to 05-06's `rows` Pick (05-06-PLAN L119) and map it. The engine reports `MoneyBasis.oneOffsExcluded {count, spending, income}` and `basisCodes` `one_offs_excluded` (alignment L205-208).

**Seed:** `sample_data.sql` L121 inserts an explicit column list, so the default `false` applies. **No seed change.** The demo needs no one-offs (UI-SPEC basis row note).

**Other row writers** (import, clone month, entry list, transfers) need no change: the default is false. The one judgement call is `cloneMonth.ts`, which copies a month. **Do not copy `one_off`**, because a cloned line is by definition recurring.

### D-34: minimal savings goal (amends D-10)

**Existing scaffolding: none.** `grep -i goal` over `src/` and `supabase/migrations/` returns no files. Phase 6 (GRW-01…03) is unplanned (ROADMAP "Plans: TBD"). [VERIFIED]

**The prototype's goal shape** (what Phase 6 will expect; `FincWin United.dc.html` L3507-3513 and L3880-3881):
- `{ id, n, cur, tgt (0 = open-ended), mo, ccy, note, auto, hh, srule, contrib }`.
- A transaction carries `link: { k: 'goal', id }`, and a paid linked line moves `cur`. [VERIFIED]

**Recommended table** (in 05-03's migration, or a sibling migration ordered after it). Owner-private like `decide_checks` (A4), with `household_id` carried for Phase 8 shared goals (prototype `hh`):
```sql
create table public.savings_goals (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  check_id uuid references public.decide_checks(id) on delete set null,     -- D-34 origin; null for Phase 6 goals
  name text not null check (char_length(btrim(name)) between 1 and 80),
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  target bigint check (target is null or target between 1 and 10000000000000),        -- null = open-ended (GRW-01, Phase 6); D-34 always sets it from WaitPlan.target
  monthly_amount bigint check (monthly_amount is null or monthly_amount between 0 and 10000000000000),
  ready_by date,                                                              -- WaitPlan.readyBy; null when the engine returns null
  opening_saved bigint not null default 0 check (opening_saved between 0 and 10000000000000), -- Phase 6 (prototype cur); D-34 writes 0
  is_sample boolean not null default false,
  deleted_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
```
- Phase 5 grants: `select` only, plus `update (deleted_at)` if the detail sheet can remove a goal on its own. Rows are written by the definer RPC `record_decide_outcome` (05-04) in the **same undo step** as the Wait decision (inverse op: `{deleted_at:'$now'}` on the goal). Phase 6 adds client insert/update grants and the columns it needs (`is_emergency` with a partial unique index, `note`, auto-contribution) additively.
- **Saved so far is computed, not stored.** It equals `opening_saved` plus the sum of tagged, paid, live lines, converted to the goal currency (`homeAmountFor` when the goal currency is home; otherwise `projectionHomeAmount`; null → shown as "waiting for a rate"). A stored running balance would be a second source of truth that undo could desync.

**Tagging transfers.** Two designs:

| Design | Cost | Phase 6 fit |
|---|---|---|
| **A (recommended): `transactions.goal_id uuid null`**, guarded by a trigger requiring the goal to be live in the same household (FK `references savings_goals(id) on delete set null`, plus a household guard like `guard_debt`, 05-03-PLAN L174) | Same migration, view re-create, grants and allow-list edit as `one_off` (type `uuid`); TransactionPatch key; tag/untag = an ordinary `useEditTransaction` patch with undo (UI-SPEC "Transfer untagged" toast) | Matches the prototype `t.link`; GRW-03 auto-contribution can later add `recurring_series.goal_id` and stamp occurrences |
| B: a `goal_links` table (like `decide_links`) | No Record change; its own RLS, guard and allow-list entity | A second link mechanism Phase 6 must reconcile with series |

- Tag the **inbound leg** (positive amount into the savings or investment account). The transfer-pair trigger (`20260926000700_transfer_pairs.sql` L68) fires only on `transfer_id, deleted_at, account_id, original_amount`, so a `goal_id` patch on one leg does not disturb pairing. [VERIFIED]
- The UI-SPEC's "Tag a transfer" reuses 05-22's `AttachLineSheet` (last 90 days, own-household rows; 05-22-PLAN L114) with a transfer-legs-in filter. No Activity transfer picker exists today. [VERIFIED: `src/features/record/activity/` listing]

**Interplay with D-10's reminder:**
- Wait still schedules the ready-by reminder from `ready_by`. The goal row now carries the same date. Keep `decide_checks.ready_by` as the reconcile source (05-11) and copy it to the goal, so there is one reminder per Wait.
- `readyBy` null → no reminder, goal `ready_by` null (04 D-40 alignment L142).
- Reopen or remove of a Wait decision → soft-delete the goal in the same undo step, and cancel the reminder.
- **Do not add the goal's `monthly_amount` to `snapshot.monthlySaving`.** A2 already derives saving from transfers into savings accounts, so tagged transfers would count twice. State this in 05-06.

**Phase 6 must inherit:**
- the table name and columns;
- `check_id` provenance;
- computed saved-so-far (no stored balance);
- `transactions.goal_id` (design A);
- Wait decisions as existing goals;
- the owner-private RLS, to be widened additively for shared goals in Phase 8.

Record this in ROADMAP Phase 6 notes as an input, like D-17's PRICING amendment.

### D-37: currency conversion

**Phase 1 API** (`src/engine/money/rates.ts`, all VERIFIED):
- `ScaledRate` is a bigint at `RATE_SCALE = 10`, as units per 1 EUR (fx base EUR).
- `parseRate(s)`.
- `convertMinor(amount, fromPerEur, fromExp, toPerEur, toExp)`: one half-up rounding; throws past `MAX_SAFE_INTEGER`.
- `convertMinorExact` with custom legs (RD-03).
- `crossRate(fromPerEur, toPerEur)` = to/from at 10 dp.
- `formatRate(r)` gives a 10-dp string.
- `customPerEur`.

**Where stored rates come from:**
- RPC `fx_latest_rates(p_on_or_before)` returns `(quote, rate text, rate_date, source)`, one row per quote, frankfurter preferred (`20260924000600_fx_monitoring.sql` L106-117).
- It is read through `fetchFxLatest` (`src/db/fxRates.ts`) and `useFxLatest()` (`src/data/queries/fxLatest.ts`, key `queryKeys.fxLatest()`, `staleUnlessEmpty(1h)`). [VERIFIED]

**Conversion helpers already used by reads** (`src/data/queries/homeAmount.ts`):
- `latestPerEur(rates, code)` (L12-21, EUR → 1).
- `homeAmountFor(row, home, rates)` (L23-48): uses the row's **own stamped** `home_amount` when the stamp's home currency still matches; otherwise it cross-converts via the row's stored `orig_per_eur`.
- `projectionHomeAmount(amount, cur, home, rates)` (L51-68): the latest rate on both legs.
- Both return `null` on any missing rate. They never guess.

**The FX depcruise rule:**
- `fx-fetch-never-from-reads` (`.dependency-cruiser.cjs` L31-36) forbids `src/data/queries` and `src/engine` from reaching `src/db/fxResolve` (the server fetch door), even transitively.
- The builder (`src/features/decide/snapshot/`) and its hook (`src/data/queries/decide.ts`) must import only `homeAmount.ts` / `@/engine/money`.
- **Custom currencies:** `latestPerEur` does not resolve them (it only looks up `rates` by quote), so `projectionHomeAmount` returns null for a custom-currency balance. The only custom-aware resolver is the private `resolvePerEur` in `src/data/mutations/provisional.ts` L79-118, which imports no `fxResolve`. Recommend extracting it into a pure read-side module (`src/data/queries/fxConvert.ts`, also usable by Activity) so a custom-currency account does not force every check to `missing`. Run `npm run depcruise` after the move.

**Conversion per snapshot input:**

| Input | Source currency | Convert with | Missing rate → |
|---|---|---|---|
| Past lines (`RecordLine`) in the months used | row stamp | `homeAmountFor` (dated stamp, see OQ-A1) | `missing` (D-37), **replacing A9's "exclude and count"** |
| Account balances (`cashOnHand`, `investmentBalance`) | account currency | `projectionHomeAmount` (latest) | `missing` |
| Bills, pay series (`latestAmount`) | series currency | `projectionHomeAmount` | `missing` |
| Debts (`balance`, `minimum_payment`, card `min_floor`) | `debts.currency` | `projectionHomeAmount` | `missing` |
| Future changes | `decide_changes.currency` | `projectionHomeAmount` | `missing` |
| Limits typed in another currency (`decide_settings.currency` ≠ home) | settings currency | 05-06 currently treats these as null (defaults); D-37 lists only accounts, lines and debts | keep the 05-06 rule (no conversion; show the default), see OQ-A6 |
| Other open checks' inputs (`inputs` amounts) | the check's currency at entry | none: a check whose currency ≠ home is left out of `otherChecks` and counted (see D-24) | — |

**"Needed" is scoped:**
- Only rows inside the lookback window (≤ 12 months before the current month, 05-06) and live accounts, series, debts and changes can force `missing`.
- A two-year-old unconverted row must not block a verdict.
- `rate_pending` rows (an offline foreign entry not yet stamped) inside the window also force `missing`. The UI-SPEC copy "Lines in {CUR} are waiting for a rate" covers this, and it clears on its own once the server stamps the row.

**Builder output change** (05-06):
- Add a fourth result kind: `{ kind: 'unconverted', currencies: string[], rowCount: number }`.
- For every logged/rough result, also return `conversions: { currency, rate: ScaledRate-as-string, rateDate }[]`.
- The engine has **no FX missing-reason code** (the alignment's "Not engine work" L236 puts conversion in Phase 5). So the UI renders the UI-SPEC missing-rate verdict ("Missing terms", the title and body, the link to waiting lines) without calling the engine. The quick check shows the same chip and disables "Run the full check" (assumption 27).
- The rough first read uses the onboarding account's currency (Pattern 5 above). A non-home account balance follows the same rule.

**Basis line "converted from EUR at 1.47 on 14 Oct":**
- rate = `crossRate(fromPerEur, homePerEur)` (home per 1 unit of the foreign currency), rendered from the 10-dp string by a pure display rounder (string or bigint maths, 2–4 decimals, half-up). Never via `Number()`.
- date = the **earlier** `rate_date` of the two legs (the provisional.ts `earlierDate` precedent).
- With several currencies, use the UI-SPEC's multi-currency form. Each currency gets one row in "Assumptions in play" and one reason row in the D-28 sheet.

### D-26: cash path chart

**Existing SVG usage:** glyphs only.
- `TabGlyphs.tsx`, `HeaderGlyphs.tsx`, `AppleMark.tsx`, `GoogleMark.tsx` (all `Path`, `strokeLinecap`, no charts).
- `react-native-svg` 15.15.4 is installed.
- `HeaderGlyphs.test.tsx` proves SVG renders under jest-expo with no mock. [VERIFIED]
- **No chart component exists to copy.** Build `CashPathChart` and `NetWorthChart` over one shared pure geometry helper.

**Recommended structure:**
- `src/features/decide/charts/chartGeometry.ts` is PURE and has a 100% threshold.
- It maps `MinorUnits[]` (91 points, or horizon+1) plus a box to path `d` strings, y ticks (max / 0 / min rounded to whole units **in minor units before** scaling), the marker point and the scrub index from x.
- Pixel coordinates are floats. That is allowed: they are geometry, never money, and never fed back into any amount.
- Labels go through `useMoneyFormatter`.
- `Path` with `strokeDasharray="4 4"` for "Without"; solid for "With this".
- `Line` for the zero line (`line3`) and the cushion line (`warn1`, dashed).
- `Circle` markers.

**Tokens (all exist, `src/theme/tokens.ts`):** `ink`, `inkSoft1` (L16), `danger` (L22), `warn1` (L26), `line3` (L30), `inkMuted`, `categoryTint.Business` (L76). `noRawColours.test.ts` must still pass. [VERIFIED]

**Scrub:**
- `GestureDetector` + `Gesture.Pan().runOnJS(true)`, the precedent being `src/features/navigation/SwipeBack.tsx` L40-41 (the GH 2.x API exposes `runOnJS(boolean)`).
- This keeps the index state in React with no worklet.
- Throttle the readout to index changes.

**Accessibility:**
- Wrap the `Svg` in a `View` with `accessible`, `accessibilityRole="image"` and `accessibilityLabel` equal to the text alternative.
- Set `importantForAccessibility="no-hide-descendants"` on the inner Svg.
- The text alternative line is **always rendered** below the chart, so screen-reader and large-text users never need the chart (UI-SPEC D-26).
- Colour is never the only cue: dash vs solid plus the legend words.

**Reduced motion:**
- `useMotion()` / `useReduceMotion()` (`src/theme/motion.ts` L31, L60).
- The chart draws once with no animation in every case; no path-draw animation is specified.
- The D-34 progress bar animates width with `DURATION.progress` (550 ms), or 0 when reduced. Precedent: `ThisMonthCard.tsx` L227-232 uses `size.homeBarHeight` (`src/theme/layout.ts` L76 = 8).

**Data:**
- `Assessment.cashPath` is `{status:'available', withoutPurchase[91], withPurchase[91], lowestWith, lowestWithout}` or `{status:'unavailable', code:'cash_path_unavailable'}`.
- `CashPathPoint.date` is `'YYYY-MM-DD'`; format it with the locale date formatter.
- The cushion line = `verdict.context.limits.reserve`.

**Snapshot inputs it needs:**
- `incomeSeries: RecurringIncome[]`: live series with `amount > 0`, `confirmed: true`, `freq` from `recurring_series.freq` (`weekly|fortnightly|monthly|quarterly|yearly`, `20260926000300_recurring_series.sql` L35), `latestAmount` converted, and `lastPaidDate` as for bills.
- **D-60 also uses `incomeSeries` for steadiness and averages** (weekly and fortnightly pay smoothed). So the builder must pass it whenever pay series exist, not only "for the chart".
- Debt-payment series stay out of `bills` (04-05 L152; 05-06 already excludes them).

**D-59 (pending in 04 plans):**
- `cash_dip` fires only when the purchase causes or deepens the dip. A pre-existing dip becomes basis fact `cash_tight_before_payday` with a date and an amount (04-CONTEXT L217).
- `BasisCode` in 04-05 L474 is still `'cash_path_unavailable' | 'one_offs_excluded'`, so **the name and the carrying field are not in the contract yet** (another agent is editing 04-17/04-05/04-12).
- Phase 5 needs both copy (basis detail row and the "Day by day" summary) and a field carrying the date and amount.
- The UI-SPEC `cash_dip` description "Without it, the lowest is {amt} on {date}" is still valid, since both lows are always reported.

### D-27: future changes

**Engine input:** `DecideSnapshot.futureChanges: FutureChange[] { id, kind: 'income'|'spending', monthlyAmount (signed), startMonth 'YYYY-MM', endMonth|null, currency }`. **Output:** `Decision.worstMonth: WorstMonthReport { month, offset 1..12, leftAfter, leftAfterNow, shortfall, differsFromNow }`. The body line shows when `differsFromNow && shortfall > 0`. (04-05 L509-516, alignment L196-199.)

**Storage: a new table, not `decide_settings` jsonb.** The UI-SPEC needs per-row add, edit and remove with an undo toast ("Change removed"). Every existing undo op is per-row with `expectedVersion` (`apply_patches`), and a jsonb array would need whole-array patches and lose per-row conflict detection.
```sql
create table public.decide_changes (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('income', 'spending')),
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  monthly_amount bigint not null check (monthly_amount <> 0 and abs(monthly_amount) <= 10000000000000),  -- sign from "Goes up / Goes down"
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month text check (end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  is_sample boolean not null default false,
  deleted_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint decide_changes_order check (end_month is null or end_month >= start_month)
);
```
- RLS: owner-private (`created_by = auth.uid() and household_id in user_household_ids()`), "stored per user" (D-27).
- Client insert and update grants on the user columns.
- Edits and remove go through `apply_patches` as entity `decide_changes`: add it to `undo_log_fill`'s entity list (L27) and the allowed-columns `case`.
- **Pitfall:** the ownership branch's `else` is "categories: owner_id …" (`20261012000200_category_rules_patches.sql` L221). A new entity that is not named explicitly falls into that branch and is refused (no `owner_id`). Every new entity (`debts`, `decide_checks`, `decide_changes`, `savings_goals`) needs its own `elsif` **before** the `else`.

**Builder rules:**
- Live rows only, with `end_month is null or end_month >= current month`.
- Converted to home (D-37).
- `startMonth`/`endMonth` passed through.
- The sheet's `DateField` (`minDate` = first of this month) stores `YYYY-MM` from the picked local date (Pitfall 4 above: local-date strings, never `toISOString`).
- The engine scans months 1..12 after `asOf`'s month. A change starting this month affects offset 1 onward. State that in the empty-state copy only if needed.

**Query key:** `['decide', 'changes', userId, householdId]`. It sits outside `['transactions', hh]`, which is fine because it is not row-derived. Its mutations invalidate it, and every check recomputes in render.

### D-24: combined checks

**How `decide()` takes them:**
- `otherChecks: readonly StackedCheckInput[] { check: PurchaseCheck; purchaseRule: SplitRule | null }`.
- Pass **all other open checks** (D-41 amended); toggle off → `[]`.
- `purchaseRule` is null in personal scope (always, until Phase 8).
- Output: `standalone` (null when `[]`), `combinedDiffers`, `stacked[] {index, status: 'applied'|'missing', reasons, mineDayOne, mineMonthly}`. [VERIFIED: alignment L175-179]

**Ordering:**
- Totals are order-independent (D-41 amended), but pass `created_at` ascending, then `id`, so output is deterministic and test fixtures are stable.
- The "other" set is checks with `status = 'open'` and `deleted_at is null`, the current check excluded.
- `waiting` (Wait and save) checks are **not** stacked: no money is committed until they become Go ahead. See OQ-A4.

**Building each stacked check:**
- 05-07's `toEngineCheck(inputs, ctx)` returns `{ ok: false, missing: 'price'|'method' }` for an incomplete draft (05-07-PLAN L77). Such a draft **cannot** be passed at all.
- Filter those out, plus any check whose currency differs from home (D-37), and count them.
- UI line in "Assumptions in play": "{n} open check not counted: no price yet". This copy is not in the UI-SPEC; add it to the catalogue.
- Stacked entries the engine itself reports `missing` (e.g. a loan with no APR) carry `reasons`. Show them in the same row.

**Toggle state storage:**
- Per check, **inside `decide_checks.inputs`** as `combine: boolean` (absent = true), autosaved with no undo step (A5).
- **No migration needed.** The `pg_column_size < 32768` and object-type checks still apply.
- The demo seed's sofa check carries `combine: false` (D-24 amended, frame 1).
- The quick check is not a stored check, so its toggle is component state, on by default per session.

**Quick check:**
- Its "other checks" are *all* open checks; it is not one of them itself.
- The UI-SPEC shows the pill only "with 2 or more open checks". With exactly one open check the quick check would stack it invisibly (toggle hidden, default on). See OQ-A3.

**"Fits on its own; not with your other {n} open check(s)":**
- n = the count of `stacked` entries with `status === 'applied'`.
- Show only when `combinedDiffers`. The chip, title and warnings come from `decision.verdict`.

**Changed-since-you-looked (D-15):**
- `last_seen_state` compares against the state the user sees, which is the combined state when the check's toggle is on. Another check's edit can therefore flip this check's marker.
- That is the intended D-41 amended behaviour; note it in 05-21's test.

**Performance:**
- The home list with N open checks makes N `assess` calls, each positioning N−1 others, so N(N−1) plan resolutions.
- The step 3 screen makes one `decide` call. Inside it are the standalone and combined runs, the 91-day path, 12 future months, up to 2 stress re-runs, and the expected-income re-run.
- The plan maths is integer loops of at most 600 months; card minimum simulation is bounded by the 50-year cap.
- At N ≤ 10 this is well under a frame [ASSUMED, not measured: Phase 4 is not executed].
- Mitigations:
  - (1) `assess`, not `decide`, for list chips.
  - (2) `useMemo` keyed on the snapshot object identity plus a stable `JSON.stringify` of the inputs set.
  - (3) A Jest timing smoke test (10 open checks, home list compute < 100 ms on CI) as an early warning, non-gating.
  - (4) `canUse('multipleOpenChecks')` (D-16) stays the future Pro gate.
- `bisection` (`affordablePrice`) runs only for the open check's options section, not for the list.

### D-35: cooling-off reminder (reuse of the D-10 module)

05-11's module today is keyed by check id only:
- `REMINDER_STORAGE_KEY = 'fincwin:decide-reminders'`;
- `scheduleWaitReminder(checkId, readyBy, today)`;
- `cancelWaitReminder(checkId)`;
- `reconcileWaitReminders(waiting, today)`;
- `data: { checkId }`.

A Wait (or Pass, or Go ahead) on a `needs_spreading` check with cooling-off on gives **two reminders for one check**. Changes:
- **Kinds:** `type ReminderKind = 'wait' | 'cooling_off'`. Storage map key `${kind}:${checkId}`. `data: { checkId, kind }`. The observer validates `kind` against the enum, in addition to the UUID regex, before routing. Both kinds route to `/decide/check/[id]?step=3` (05-29 defines how a decided check opens: read-only, recomputed).
- **Trigger:** `DATE` at `decided_at + 48h`, not `TIME_INTERVAL`, so reconcile can rebuild it from server state. Android stays inexact (no `SCHEDULE_EXACT_ALARM`, research above).
- **Server source of truth:** a new `decide_checks.cooling_off_at timestamptz` column. It is decision state, so **no client grant**: written by `record_decide_go` / `record_decide_outcome` from a `p_cooling_off boolean` argument. The RPC computes `now() + interval '48 hours'` server-side and refuses it unless the client asserts size `needs_spreading`; the size is not server-verifiable, so it is a UI rule.
- **Reconcile:** schedule missing reminders for `(waiting and ready_by >= today)` and `(cooling_off_at > now())`. **Cancel scheduled ones whose check no longer qualifies.** That covers undo of a decision: `apply_undo_step` restores the check to open server-side, and the next reconcile, or the undo mutation's `onSuccess`, cancels the reminder. Reconcile is the backstop for second devices and reinstall.
- **Copy:** fixed. Title "Check ready", body "A check you saved is ready to look at again…", no amount or name (UI-SPEC D-35), and a different string from the Wait reminder. The test asserts both payloads.
- **Permission:** same flow as Wait. A refusal still saves the decision, with a toast.
- The wipe handler (`cancelAllScheduledNotificationsAsync`) already covers both kinds.

### D-28, D-25, D-30, D-31, D-32, D-33, D-36: data the UI must supply

| Decision | Engine reads | Already in snapshot/check? | Phase 5 must add |
|---|---|---|---|
| D-28 confidence | `fullMonths`, `steadiness`, `firstRead` (inside the engine) | yes | nothing; the reasons sheet also lists builder facts (one-offs, conversions), which are not engine codes |
| D-25 cushion/edge | `context.limits.reserveHalfMonths` (null when typed), `money.steadiness`, `Decision.margins[].flag` | yes | nothing. Copy: halves → "3 / 4.5 / 6 months"; `insufficient` under 3 full months reads "3 months — your income steadiness isn't known yet" (05-CONTEXT amended), **not** the UI-SPEC's older "(6) because there isn't enough history yet": fix the UI-SPEC D-25 reason list |
| D-30 promo / variable / late fee | loan/card `promo?: PromoTerms { apr, months, deferredInterest }`, `variable?: boolean`; instalment `lateFee?`, `lateFeeCapTotal?` | no | `inputs` fields: `promo: { aprText, months, deferredInterest }`, `variable`, `lateFee`, `lateFeeCapTotal`. Rates as decimal strings, `percent()` at the boundary. **Gap:** `deferredInterest` (required boolean, needs promo apr 0) and `lateFeeCapTotal` have no UI-SPEC input |
| D-31 investment views | `snapshot.projectionRates` (≤3), `investmentBalance`; `InvestmentViewsInput.horizonMonths` | no | `inputs.projectionRates: string[]` (≤3, per check, assumption 17), and `inputs.investHorizon: number|null`. The builder output is shared across checks, so 05-07 makes a per-check snapshot `{...base, projectionRates, projectionReturn: first ?? null}` (memoise on base identity plus rates). `investmentBalance` = converted balances of live `investment` accounts (`accounts.kind` enum, `20260924000300_accounts.sql` L17); 05-06 currently computes `cashOnHand` from cash/checking/savings only, so add the investment sum. Buy checks only (`investmentViews(context, check: BuyCheck, …)`) |
| D-32 income change | `BuyCheck.incomeChange?: { monthlyAmount (signed, ≠0), startDate, likelihood }` | no | `inputs.incomeChange: { direction: 'raises'|'lowers', amount, startDate, likelihood }` → signed in `toEngineCheck`. Output `Decision.withExpectedIncome` (payback), `incomeAtRisk(verdict.context, verdict, setbacks)` → `runwayLost`, per-setback `paymentsMet` / `breaksBecauseOfPurchase` |
| D-33 running-cost prompts | `runningCostPrompts(itemType)`; `CostLine.category?`; `RunningCosts.nonCash` | partly (itemType) | prompt rows stored as `CostLine`s with `category` and a blank amount (`counted: false` until typed). **Gap:** the UI-SPEC gives Loss of value no amount field yet shows "about {x} over {n} months" "if the engine returns it". `nonCash` is the *counted* loss-of-value **amount the user typed**, so with no field it is always 0 (04 D-07: never invented). Either give Loss of value an optional amount field (non-cash, never in the month) or drop the "about" line |
| D-36 estimate gap | `estimateBias(decisions: PastDecision[], currency)`, with `PastDecision.estimate { dayOne, monthlyPayment, runningCosts }` and `actual {…|null}` | **no** | see "D-36 data gap" below |

**D-36 data gap.** 05-03 stores `estimate_day_one` and `estimate_monthly` (payment plus running combined, 05-03-PLAN L101-102). 05-08's `compareEstimate` compares only those two (05-08-PLAN L128). `estimateBias` needs three figures and per-figure actuals. Add:
- `decide_checks.estimate_monthly_payment bigint`, `estimate_running bigint`, written by `record_decide_go` and kept RPC-only like the other estimate columns. Keep `estimate_monthly` = their sum for 05-22's display.
- `decide_links.role text check (role in ('day_one','payment','running_cost'))`.
  - The RPC sets it on written links: the cash or card expense row is `day_one`; the series named by `debts.series_id` or the instalment series is `payment`; the running-cost series are `running_cost`.
  - For attached links, `AttachLineSheet` (05-22) adds a three-chip "Counts as" row. Default it by date: within 7 days of `decided_at` → day one, else running cost. The user can change it. **This is UI not in the UI-SPEC** (flag for the UI-SPEC re-check).
- A pure `toPastDecisions(decisions, links, linkedLines, today)` beside `compareEstimate`:
  - A decision "has actuals" once its 90-day checkpoint is reached; the 30-day checkpoint is used if 90 is not yet reached. See OQ-A5.
  - A figure's actual is null when no linked line has that role.
  - Monthly actuals are the window sum ÷ whole months elapsed (half-up, `divideHalfUp`).
- Queries: all bought decisions, their links, and the linked rows by id. Linked rows may fall outside the cached months, so add a `fetchTransactionsByIds` under `['transactions', hh, 'byIds', …]`, keeping it in the transactions prefix so edits invalidate it.
- Currency: pass the home currency. Decisions whose stored currency differs are excluded by the engine filter [ASSUMED from the signature `estimateBias(decisions, currency)`; confirm at 04-16].

### Engine-API gaps vs 04-PHASE5-ALIGNMENT

| # | Gap | Severity | Resolution |
|---|---|---|---|
| G1 | D-59 `cash_tight_before_payday` (date, amount) has no `BasisCode` member or field in 04-05 (L474) yet; the `cash_dip` shortfall meaning changes ("extra depth the purchase adds") | Medium | Re-read 04-05/04-17/04-12 once the parallel edit lands. Phase 5 adds copy for the basis row and the "Day by day" summary. The demo seed must not trigger it |
| G2 | `PromoTerms.deferredInterest` is required; the UI-SPEC promo row has no input | Medium | Add a `ToggleRow` "Interest is charged back if it isn't cleared" (shown only when the promo rate is 0), default off, never inferred. Or pass `false` and say so in Assumptions. User call (OQ-A2) |
| G3 | `lateFeeCapTotal?` has no UI | Low | Omit (absent = none). Optional "Fees capped at" field later |
| G4 | Loss of value has no amount source | Low | See D-33 row; recommend an optional amount field |
| G5 | `PastDecision` needs a 3-way estimate and per-figure actuals; 05-03/05-08 store 2 | Medium | New columns plus `decide_links.role` (D-36 above) |
| G6 | No engine code for "rate missing" | None (by design) | Builder `kind: 'unconverted'`; UI-only missing state (D-37) |
| G7 | `StackedCheckInput.check` must be a complete `PurchaseCheck`; drafts can't be passed | Low | Filter and count in the builder (D-24) |
| G8 | 04-05 `RoughFigures`/`FirstRead` carry `confidence` but no combined-check input; the first read ignores other open checks | None | Onboarding has no open checks; the quick check before a full month uses `firstRead` with no stacking. Document it |
| G9 | `estimateBias(decisions, currency)` currency semantics are not stated in the alignment | Low | Confirm at 04-16 execution: filter or require one currency |

### D-37 / D-24 / D-34 / D-27: migration and plan placement

| Change | Plan (amend or new) | Order |
|---|---|---|
| `decide_changes`, `savings_goals` tables; `decide_checks.cooling_off_at`, `estimate_monthly_payment`, `estimate_running`; `decide_links.role` | **amend 05-03** (same migration; table count 5 → 7, so update its grep acceptance criteria) | 1 |
| `transactions.one_off`, `transactions.goal_id` (+ guard trigger), `transactions_active` re-create + grants | **new** migration `…_record_one_off_goal_tag.sql` (in 05-03 or a new Wave-1 plan) | 2 (after `savings_goals`) |
| `apply_patches` / `undo_log_fill`: `transactions.one_off` (boolean), `transactions.goal_id` (uuid), entities `decide_changes` and `savings_goals` with explicit ownership branches; `record_decide_go`/`record_decide_outcome` gain `p_cooling_off`, the goal insert (wait), split estimates and link roles | **amend 05-04** | 3 |
| db modules `decideChanges.ts`, `savingsGoals.ts`; `transactions.ts` key lists | amend 05-05; Record keys in the new Record plan | 4 |
| builder: `oneOff`, `incomeSeries`, `futureChanges`, `investmentBalance`, `unconverted` kind, `conversions`, custom-currency resolver extraction | amend 05-06 | 4 |
| bridge: `decide(…, otherChecks)`, per-check snapshot, investment views, income at risk, prompts, `toPastDecisions` + `estimateBias` | amend 05-07 (+05-08 for `toPastDecisions`) | 5 |
| two-kind reminders | amend 05-11 | 2 |
| Record one-off toggle + detail row | **new** plan (Record files only) | after 4 |
| `CashPathChart`, `NetWorthChart`, `chartGeometry`, `GoalProgress`, `ConfidenceChip`, `EdgeTag` | **new** primitives plan (beside 05-10) | 2–3 |
| Changes coming up card + sheet + mutations | **new** plan (after 05-21/05-27) | late |
| step 1 income change; step 2 promo/variable/late fee/prompts/estimate gap | amend 05-14 | — |
| step 3 basis row, edge tag, confidence, cash-path section, expected income, runway lost | amend 05-15 / 05-16 | — |
| step 4 investing section; step 5 cooling-off, goal preview | amend 05-17 | — |
| Wait → goal; cooling-off arg | amend 05-20 | — |
| goal progress + tag transfers in Past decisions | amend 05-22 | — |
| seed: confirmed monthly **pay series** (cash path available, D-60 smoothing), steady income, sofa `inputs.combine = false`; assertions below | amend 05-18 | — |
| device checks: chart, cooling-off reminder, one-off toggle | amend 05-26 | last |

**Demo seed assertions to add in 05-18:**
- `decide(snap, sofa, [])` → `fits`, `combinedDiffers` false.
- `decide(snap, car, [sofa])` → `adjust`, at least 2 warnings, `needs_spreading`.
- Both have `basisCodes` empty: no `cash_path_unavailable`, no one-offs, no `cash_tight_before_payday`.
- No `on_edge` on the frame-2 lines that would add a tag in the frame (optional).
- `worstMonth.differsFromNow` false (no seeded changes).
- **Confidence:** with "≥4 full months" (05-PLANNING-NOTES OQ4) the chip reads **"Fair basis"** in frames 1–2. "Strong" needs 6 full months and Steady (04 D-46). See OQ-A7.

### Addendum Open Questions (RESOLVED)

> **Resolution (2026-10-15, plan-phase, non-interactive):** resolved for planning per `05-PLANNING-NOTES.md` § "Addendum open questions". The recommendation was taken wherever it needs no change to the locked UI-SPEC; where it would change the UI-SPEC (OQ-A2, OQ-A3, OQ-A9), the UI-SPEC was followed as written and the item is flagged for the user.

1. **OQ-A1. D-37 "latest stored rate" vs Phase 1's dated stamps for past lines.**
   - What we know: `homeAmountFor` keeps each row's own stamped home amount (Phase 1 D-05: history is cross-converted through the row's stored base, never re-rated). Activity's month totals use it. D-37 says convert "every account, line and debt … at the latest stored rate".
   - What's unclear: whether past lines should be re-rated at today's rate.
   - Recommendation: past lines keep their dated stamp, so Decide's averages equal Activity's month totals and nothing shifts with daily rates. Balances, series, debts and changes use the latest rate (that is what the basis line names). Needs user confirmation, since it reads a locked decision narrowly.
2. **OQ-A2. Deferred interest input (G2).** Recommendation: add the 0%-only toggle, default off.
3. **OQ-A3. Quick-check combined pill with exactly one open check.** The UI-SPEC shows the pill at ≥2 open checks, but the quick check is not itself an open check. Recommendation: show it at ≥1 open check for the quick check, and keep ≥2 for the check flow. That is a UI-SPEC tweak.
4. **OQ-A4. Do `waiting` (Wait and save) checks stack?** Recommendation: no. Only `open` checks stack, and goal monthly amounts are not added to `monthlySaving` (A2 transfers already count them once saved).
5. **OQ-A5. D-36 "decision with actuals".** Recommendation: counts once the 90-day checkpoint is reached, using 30-day figures before that. Attached links carry a role chosen in `AttachLineSheet`.
6. **OQ-A6. Limits typed in a former home currency.** Recommendation: keep 05-06's rule (treated as defaults, with an Assumptions row) rather than convert. D-37 does not list limits.
7. **OQ-A7. Demo confidence chip.** Recommendation: seed 6 full months of steady income, so frames read "Strong basis". A "Fair/Rough basis" chip in a store screenshot undercuts the caption.
8. **OQ-A8. Goal tagging design.** Recommendation: design A (`transactions.goal_id`) over a link table.
9. **OQ-A9. UI-SPEC fixes found here:**
   - the D-25 reason list must use the amended "3 months — … isn't known yet" wording;
   - the "Counts as" row in `AttachLineSheet`;
   - D-59 copy;
   - the deferred-interest toggle;
   - the loss-of-value amount field;
   - the "open check not counted" Assumptions row.

### Addendum Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A11 | Past lines keep dated stamps under D-37 (OQ-A1) | D-37 | Decide averages differ from Activity totals, or move daily |
| A12 | `savings_goals` owner-private; saved-so-far computed; `transactions.goal_id` tag | D-34 | Phase 6 reshapes (additive) |
| A13 | Toggle `combine` stored in `inputs` jsonb; quick-check toggle is session state | D-24 | Toggle not remembered across devices for the quick check |
| A14 | N ≤ 10 open checks recompute within a frame | D-24 | Jank on Decide home; mitigated by `assess` + memo |
| A15 | Cooling-off scheduled at server `cooling_off_at` (decided_at + 48h) | D-35 | Reminder drift if client-computed |
| A16 | Incomplete or foreign-currency open checks are left out of stacking and counted | D-24 | The combined verdict ignores a draft the user expects counted |
| A17 | `decide_links.role` with a date-based default for attached lines | D-36 | Bias figures misattributed |
| A18 | `cloneMonth` does not copy `one_off` | D-29 | A copied one-off would silently re-enter averages, or vice versa |

### Validation Architecture delta

Additional rows for the test map (framework, commands and sampling are unchanged):

| Req / decision | Behaviour | Type | Command | Exists? |
|---|---|---|---|---|
| D-29 | `one_off` insert/patch keys; form diff; toggle hidden for transfer and series rows; undo restores | unit + RNTL + pgTAP | `npx jest src/features/record/entry/__tests__/transactionForm.test.ts src/db/__tests__/transactions.test.ts`; `supabase test db` (view column present, grant, `apply_patches` accepts `one_off`, rejects non-boolean) | ❌ |
| D-29 | builder maps `one_off` → `RecordLine.oneOff`; basis row shows "{n} one-off left out" | unit | `npx jest src/features/decide/snapshot` | ❌ |
| D-37 | missing rate in window → `kind 'unconverted'`; out-of-window missing does not block; custom-currency balance converts; basis rate string from bigint (no `Number`) | unit (100% folder) | `npx jest src/features/decide/snapshot` | ❌ |
| D-37 | depcruise: snapshot and the extracted fx module never reach `fxResolve` | static | `npm run depcruise` | ✅ rule exists |
| D-24 | stacked set = open, complete, home-currency checks in `created_at` order; toggle off → `[]`; difference line only when `combinedDiffers`; count = applied | unit + RNTL | `npx jest src/features/decide/__tests__/computeCheck.test.ts src/features/decide/check/__tests__/VerdictCard.test.tsx` | ❌ |
| D-24 | timing smoke: 10 open checks, list compute < 100 ms | unit (non-gating) | `npx jest src/features/decide/__tests__/stackPerf.test.ts` | ❌ |
| D-26 | `chartGeometry` paths, ticks, marker and scrub index; unavailable state copy; a11y label = text alternative; no animation under reduced motion | unit (100%) + RNTL | `npx jest src/features/decide/charts` | ❌ |
| D-27 | `decide_changes` RLS/grants/undo; builder filters ended rows and converts; sheet stores `YYYY-MM` from local date | pgTAP + unit + RNTL | `supabase test db`; `npx jest src/features/decide/changes` | ❌ |
| D-30/31/32/33 | `toEngineCheck` maps promo/variable/lateFee/incomeChange/prompts/rates/horizon; no field ever pre-filled (property: empty inputs → all optional fields absent) | unit + fast-check | `npx jest src/features/decide/__tests__/checkInputs.test.ts` | ❌ |
| D-34 | Wait RPC inserts goal in the same undo step; undo soft-deletes it; tag/untag via `goal_id` patch; guard refuses a foreign-household goal; saved-so-far sum | pgTAP + unit | `supabase test db`; `npx jest src/features/decide/past` | ❌ |
| D-35 | two kinds keyed `${kind}:${id}`; reconcile schedules and cancels both; payload has only `{checkId, kind}`; observer rejects an unknown kind | unit (mocked) | `npx jest src/features/decide/notifications` | ❌ |
| D-36 | `toPastDecisions` per-figure actuals, null when no role; < 3 decisions → no note; copy declarative | unit | `npx jest src/features/decide/journal` | ❌ |
| DCU-09 | new keys (investing, changes, cooling-off, estimate gap) pass the extended banned list ("you should invest", "recommend") | unit | `npx jest src/i18n/__tests__/decideCopy.test.ts` | ❌ (05-02) |
| DCU-11 | seed assertions above (standalone sofa fits, combined car adjust, empty `basisCodes`) | unit (engine-backed) | `npx jest src/features/decide/__tests__/demoScenario.test.ts` | ❌ (05-18) |

**Wave 0 additions:**
- a `./src/features/decide/charts/` 100% threshold beside `snapshot/` in `jest.config.js` (thresholds built at L37-42);
- pgTAP files for `decide_changes`, `savings_goals`, the transactions `one_off`/`goal_id` columns and the extended `apply_patches`;
- the notifications mock gains a second scheduled id.

### Security Domain delta

| ASVS | Addition |
|---|---|
| V4 Access Control | `decide_changes`, `savings_goals`: owner-private RLS, with cascade from the user and the household. `transactions.goal_id`: guard trigger requires a live goal in the same household. `apply_patches`: an explicit ownership `elsif` per new entity (the `else` branch is categories-only, L221). Goal and cooling-off columns: RPC-only, no client grant |
| V5 Input Validation | `inputs` validator extended: ≤3 projection rates (decimal-string regex as in `debts.apr`), promo months 1..600, horizon chip enum, `incomeChange` amount ≠ 0 within bounds, `combine` boolean. SQL checks on `decide_changes` (month regex, order, amount bounds); the 32 KB `inputs` cap kept |
| V8 Data Protection | Cooling-off notification: fixed copy, `data` only `{checkId, kind}`. No new analytics events (D-20's list is exhaustive; the toggles send nothing) |

| Threat | STRIDE | Mitigation |
|---|---|---|
| Tag another household's goal onto a line (or a line onto a foreign goal) | Tampering | `goal_id` guard trigger; pgTAP |
| Forge `cooling_off_at` or a goal target from the client | Tampering | No grants; RPC computes `now() + 48h` and takes the target from the call args, with bounds checked |
| Undo op smuggling via `decide_changes`/`savings_goals` | Elevation | Allow-listed columns, explicit ownership branches, `MAX_UNDO_OPS` |
| Unknown `kind` in a notification payload routes somewhere unexpected | Tampering | Enum check plus UUID regex; href built in-app |
| Invented FX rate in a verdict | Integrity (Core Value) | Stored rates only (depcruise); a missing rate → `unconverted`, never a fallback rate |
| O(N²) recompute as a self-DoS | Availability | `assess` for lists, memoisation, `canUse` gate; optional cap on open checks in the validator [ASSUMED, not decided] |

### Addendum sources

**Primary (HIGH):** codebase at `C:/dev/fincwin-04ctx`:
- `src/engine/money/rates.ts`, `src/data/queries/{homeAmount,fxLatest}.ts`, `src/db/fxRates.ts`, `src/data/mutations/provisional.ts` L79-118, `.dependency-cruiser.cjs` L25-36;
- `src/db/{transactions,rows}.ts`, `src/features/record/entry/{TransactionSheet.tsx,transactionForm.ts,recurringForm.ts}`, `src/features/record/activity/{TransactionDetailSheet.tsx,detailRows.ts}`;
- `src/theme/{tokens,motion,layout}.ts`, `src/features/home/ThisMonthCard.tsx`, `src/features/navigation/SwipeBack.tsx`, the SVG glyph files, `jest.config.js`;
- migrations `20260924000300_accounts.sql`, `20260924000600_fx_monitoring.sql`, `20260926000300_recurring_series.sql`, `20260926000700_transfer_pairs.sql`, `20261010000100_record_polish_columns.sql`, `20261010000600_sample_data.sql`, `20261012000200_category_rules_patches.sql`;
- the prototype `FincWin United.dc.html` L3507-3513 and L3875-3881;
- `node_modules/react-native-gesture-handler` gesture typings (`runOnJS`), read from the main checkout since the worktree has no `node_modules`.

**Planning:** 05-CONTEXT (D-24…D-37 and the amendments), 05-UI-SPEC "Depth surfaces" and assumptions 17–27, 04-PHASE5-ALIGNMENT (depth API), 04-05-PLAN `<interfaces>`, 04-CONTEXT D-41…D-60, 05-03/05-06/05-07/05-08/05-11/05-22 plans, ROADMAP Phase 6, REQUIREMENTS GRW-01…11.

**No web sources were needed:** every new dependency is already installed, and expo-notifications was verified in the main research.

**Addendum valid until:** the 04 replan for D-59/D-60 lands. Re-check G1 and the `BasisCode` union then.
