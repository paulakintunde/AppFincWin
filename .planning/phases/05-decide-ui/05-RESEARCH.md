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

## Open Questions

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
