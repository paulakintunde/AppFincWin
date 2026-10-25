# Upgrading Decide to v3: discussion, UI plan, decision plan and execution plan

Written 2026-10-25.

**Sources:**
- plan v3 (`00-REBUILD-PLAN-v3.md`);
- the setup stepper (`00-DECIDE-SETUP.md`);
- the Calm Ledger click-through mockup ("Can I Afford It — Decide mockup");
- a check of today's code and schema in `C:\dev\fincwin-p5` (branch `phase/05-decide-ui`, PR #82).

Nothing here has been built. No code, schema or git has changed.

---

## 1. Summary in plain words

1. **Today's Decide** is built and works. But its maths gives some wrong "fits" early in the month, and its screens are heavy. The **new Decide** (v3 plus the mockup) is simpler and more honest, and has a setup on first use.
2. **We don't throw today's Decide away.** About 60% of the engine and most of the data layer are reused: payment maths, card rules, envelopes (pots), undo, the write queue, and saved checks.
3. **The new engine is built next to the old one.** It is switched on with a setting, compared against the old one, and the old parts are removed only when the new one is proven.
4. **The work runs in three phases:**
   - **05.1** the engine (the maths);
   - **05.2** data and setup (what's stored, and the first-use questions);
   - **05.3** the screens (from the mockup).

   About 66 working days for one developer, including the 05 close-out and the cutover.
5. **Every piece of data has a clear add, edit, delete and update path, with Undo.** Each write uses the same offline-safe queue as the rest of the app.
6. **One new idea (section 4.9):** your confirmed unspent money **rolls forward on its own** with each month's money in and out. You only re-confirm it when it drifts, so it doesn't go stale after 30 days.

---

## 2. Discussion: how to get from today to v3

### 2.1 Where we are
- **Phase 5 is built:** 144 of 145 plans done. Only the 05-26 device checks remain. PR #82 is not merged yet.
- **Engine:** 37 files, about 6,250 lines, 100% branch coverage. Known wrong-"fits" bugs B1–B16 (v2 section 6.2).
- **Data:**

  | Table | What it holds |
  |---|---|
  | `decide_checks` | Purchase checks; status `open / bought / waiting / passed`; `inputs` JSON |
  | `savings_goals` | Pots, including `kind`, `done_at` |
  | `decide_settings` | `reserve`, `rough_income`, `rough_spending`, `basis_override`, lines |
  | `debts` | Loans and cards |
  | `recurring_series` | Regular payments, at `weekly / fortnightly / monthly / quarterly / yearly` |
  | `decide_links`, `decide_changes` | Links and changes |
  | `undo_log` | Undo for every write |

  Each table already has mutations through the serial write queue.

### 2.2 Three ways to upgrade

| Option | How | Good | Bad |
|---|---|---|---|
| **A. Big switch** | Rewrite the engine and screens, then swap in one release | Fast to describe | Highest risk; months with nothing shippable; hard to compare old and new |
| **B. Side by side (recommended)** | Build the v3 engine beside the old one behind a `decideV3` setting. Shadow-run both, compare, then switch screens one at a time and delete old code last | Always shippable; every answer change is visible and reviewed; easy to roll back | About 10% more work (adapters, comparison) |
| **C. Screens first** | Put the new screens on today's engine | Users see the new look sooner | Wrong-"fits" bugs stay; the screens would need rewiring later |

**Recommendation: B.** It matches the project's "engine before UI" rule and the 100% coverage gate, and it never leaves a broken app on `main`.

### 2.3 What happens to PR #82
The owner has put fixes on hold. Choices:
1. **Merge PR #82 as it is** and start 05.1 from `main`. The current Decide stays live until v3 replaces it.
2. **Keep PR #82 open** and stack 05.1 on its branch.
3. **Merge PR #82 with Decide hidden** (a feature switch) until v3 is ready, so no one sees the known wrong "fits".

**Decided (owner, 2026-10-25): option 3.** PR #82 merges with Decide hidden. The Decide tab stays and shows a short **"Coming soon"** screen. Nothing from today's Decide is shown until v3 switches on.

---

## 3. Checking myself: problems found while planning, and how each is fixed

| # | What I checked | What I found | Fix |
|---|---|---|---|
| C1 | Does the mockup match plan v3? | The mockup **works out** the payment from rate and term. v3 L3 also listed "each payment" as an input | Both: the app works it out, and the user can type the lender's quoted payment. If the two differ by more than $1, show "The quoted payment is $X higher than the rate explains, so there may be fees" |
| C2 | Can "twice a month" be stored? | `recurring_series.freq` has no `semimonthly` | **Owner (2026-10-25): show only "Every 2 weeks".** Pay detected on the same two dates each month (1st and 15th) is stored as **two monthly series** in one pay group. That is exact (24 a year, not 26) with **no migration**. It is shown as "Every 2 weeks · on the 1st and 15th". Payment plans offer weekly, every 2 weeks and monthly |
| C3 | Does the emergency fund need a new column? | `decide_settings.reserve` already holds an amount | Reuse `reserve` as the emergency-fund amount until Grow. Add only `reserve_account_id` |
| C4 | Does unspent money go stale? | A typed figure is wrong after the next payday | **Roll it forward** (4.9), and re-ask only on drift |
| C5 | Can "Help me check this" be stored? | `rough_income` / `rough_spending` exist | Reuse them; add `rough_saving`, `rough_debt`, `rough_invest` and `rough_as_of` |
| C6 | Do old checks still open? | `inputs` JSON has today's shape; `furthest_step` assumes 5 steps | Inputs get a version (`v: 2`) with a parser that upgrades v1 on read. `furthest_step` is re-used: 1 draft · 3 answered · 4 "instead" opened · 5 recorded |
| C7 | Do stored verdicts break? | `last_seen_state` / `verdict_at_decision` hold `fits / adjust / no / missing` | The six v3 codes map to these four (`legacyState`). Past decisions are never recomputed. Seen states are re-baselined once |
| C8 | Is `basis_override` still needed? | Judge-on is retired | Left in place and no longer read. It is dropped in a later cleanup migration |
| C9 | The "payday" answer in the mockup is a sample | In real use it needs the 90-day cash path with no zero-spend bug (B2) | Engine slice S3 must fix the cash path first |
| C10 | When exactly is it "needs input"? | The mockup triggers it by sample | Defined in 5.4 as fixed rules |
| C11 | For financed purchases, "What could I do instead?" used the price | v3 says compare the **full payment stream** | Instead uses the payment stream for periodic purchases (5.6) |
| C12 | Households | Checks are household-scoped; Decide settings are per user | Kept as is. Your share (setup step 13) applies D-34. A household "normal month" stays in Phase 8 |
| C13 | Deleting an account must purge everything (GDPR) | New columns and tables must be in the purge and the export | Added to the purge function and the data export in 05.2 |
| C14 | Does the "Record as bought" write path exist? | `decideGoAhead.ts` handles today's "Go ahead" (D-09 "What gets written") | Reused and renamed "Record as bought"; the D-09 confirm is kept |
| C15 | Do prototype numbers equal engine numbers? | The mockup hard-codes Sam's $425 and $2,400 | The engine's golden fixtures use the same Sam data, so the mockup and the engine can be checked against each other |

---

## 4. How each piece of data works: add, edit, delete, update and undo

**Rules that apply to everything below:**
- **Every user write** goes through the serial write queue, works offline, is recorded in `undo_log`, and shows an Undo toast (the existing pattern).
- **Every edit** bumps `version`. A conflicting edit from another device shows the existing "changed elsewhere" message.
- **Deletes are soft** (`deleted_at`) where the table supports it, so Undo can restore them. Purge on account deletion is hard.
- **Every answer recomputes when its inputs change.** Saved plans recompute in the background, and a plan whose answer changes gets the existing "changed since you looked" marker.

### 4.1 Decide setup (income profile and preferences)

| | |
|---|---|
| **Stored in** | `decide_settings`. New columns: `income_types text[]`, `variable_method text` (match / spread / steady / balance / null), `steady_amount bigint`, `spread_months smallint`, `hold_months smallint`, `share_pct smallint`, `detail text`, `remind_plan bool`, `remind_unspent bool`, `setup_done_at timestamptz` |
| **Add** | The setup stepper on first use. Each step saves as it's answered, so "Finish later" loses nothing |
| **Edit** | **Decide settings** lists each answer as a row ("Income counted as: Salary"). Tapping a row opens **only that step**, not the whole stepper |
| **Delete** | "Reset Decide setup" clears these answers only, never transactions, series or envelopes. It needs a confirm, and Undo is offered |
| **Update** | Automatic prompts when life changes: a new pay amount ("Your pay looks like $4,400 now. Update?"), a pay type that stops, or a steady-amount user whose income is below the steady amount for 2 months |
| **Better** | Each setting row shows **how it changes answers**, for example "Steady amount $3,500: months with less draw on unspent money" |
| **Shared (owner, 2026-10-25)** | The income questions (how you're paid, regular pay, changing income, other income) are **one shared component** `IncomeProfileSteps`, built in 05.2. Decide setup uses it now, and Phase 9's main onboarding uses the same component. Whichever runs first saves the answers, and the other skips them |
| **In Activity (owner, 2026-10-25)** | (1) If the income profile is missing, a **prompt card** in Activity says "How are you paid? Set it up" and opens the shared questions. (2) Any income transaction or regular income can be **tagged** with its type and spent or kept. (3) When a **new kind of income** appears (a new payer), Activity asks once what it is, with "Apply to future payments from {payer}" |

### 4.2 Regular payments (income and bills)

| | |
|---|---|
| **Stored in** | Existing `recurring_series`. New columns `counts_as text` (`available` / `kept` / null = ask) and `income_kind text` (salary, commission, side business, dividends, interest, rent, family, other). Two-date pay (1st and 15th) is stored as two monthly series sharing a new `pay_group uuid` (C2) |
| **Candidates** | Worked out on the device from transactions (v3 section 4.1). They are **not stored**. Dismissals ("Not regular") go in a new small table `recurring_dismissals(household_id, payee_key, direction, dismissed_at)`, so they sync across devices |
| **Add** | "Regular" on a candidate creates a series (existing mutation, existing materialiser). "+ Add a regular payment" opens the existing series sheet |
| **Edit** | The existing series edit: amount, frequency, next date, with edit-from-a-date semantics |
| **Delete** | Two clear choices: **"It has stopped"** (sets `end_date`; history stays) or **"Delete it"** (soft delete; the existing rule for materialised rows) |
| **Update** | **Drift detection:** when the last 2 payments differ from the series amount by more than 5%, ask "Rent looks like $1,850 now. Update from November?" |
| **Undo** | Existing series undo labels |

### 4.3 Loans and credit

| | |
|---|---|
| **Stored in** | Existing `debts` (balance, minimum, APR, secured, `is_housing`). New column `pays_in_full text` (yes / sometimes / no) for cards |
| **Add / edit / delete** | Existing debt mutations and sheets. A paid-off loan is marked **"Paid off"** (kept for history); delete is a soft delete |
| **Update** | When a card's balance is not paid in full for 2 statements, the setup answer "pays in full: yes" is shown as a question again |

### 4.4 Regular saving (fixed or flexible)

| | |
|---|---|
| **Stored in** | New `recurring_series.saving_mode text` (fixed / flexible) on transfer series into saving accounts. Null means fixed |
| **Add / edit** | Setup step 7, or the series sheet's new "Fixed / Flexible" row |
| **Delete** | Ends with the series |
| **Engine** | Fixed saving is always subtracted. Flexible saving appears only in the trade-off explorer |
| **Saving buckets (owner, 2026-10-25)** | An optional layer on the saving step: college, house down payment, new car, trip, starting a business, wedding, something else. Each bucket is an envelope: a `savings_goals` row with `kind = 'pot'` and a new `bucket text`. It uses the existing `target`, `monthly_amount` and `ready_by` columns. It shows as an envelope. **Add:** pick it in setup, or "+ Add an envelope". **Edit:** amount, goal or date, from the envelope. **Delete:** soft delete with Undo, and its saved money returns to unspent money. **Update:** the refine check-in reports progress and the "reached by" date. If the buckets add up to more than regular saving, the app asks which to lower |

### 4.12 Refine Decide (the check-in once there is more data, owner 2026-10-25)

| | |
|---|---|
| **Why** | A new user often sets up with thin data. Once the records hold more, Decide offers to replace typed figures with what the records show |
| **Triggers** | 3 full months since setup; or 1 full month after a rough-figures setup; or a typed figure 15% off the records two months running; or a new regular payment or income repeating 3 times. At most once a month; "Later" hides it for 14 days |
| **Stored in** | `decide_settings.refine_last_at`, `refine_snooze_until`. Each card's choice writes to the same place as setup (pay, everyday override, series confirm, bucket, unspent anchor) |
| **Add / edit / undo** | Each card is one choice saved through the write queue, with Undo. Nothing changes until the user picks. "Done for now" keeps unchecked cards |
| **Engine** | `month/refine.ts` (pure): compares setup answers with the records and returns the list of cards with their numbers. Tested for "never suggests a change smaller than the noise" (spread from `confidence.ts`) |

### 4.5 Everyday spending and unusual months

| | |
|---|---|
| **Stored in** | `decide_settings.everyday_override bigint` (null = use the median), `everyday_override_at`. Month marks: `decide_settings.month_marks jsonb` (`{"2026-08":"half","2026-06":"out"}`) |
| **Add / edit** | Setup steps 8 and 9, or "Your months" in "How this was worked out". Tapping a month cycles normal → leave out → half-logged |
| **Delete** | "Use my records" clears the override. A month set back to "Normal" removes its mark |
| **Update** | The override expires after 90 days, or when the median moves more than 20% from it: "Your records now show about $1,350. Keep $1,200?" A new month that looks under-logged is suggested once, never applied silently |

### 4.6 Emergency fund

| | |
|---|---|
| **Stored in** | `decide_settings.reserve` (amount, existing) and new `reserve_account_id`. **In Grow (Phase 6):** one `savings_goals` row with `kind = 'emergency'` (unique per household); Decide then reads that row |
| **Add** | Setup step 10, or the home card "Emergency fund: Not set → Set an amount" |
| **Edit** | Home card or Decide settings. With an account chosen, the amount follows that account's balance |
| **Delete** | "Remove emergency fund" sets it back to "Not set". Nothing moves in the bank |
| **Update** | Kept out of every ordinary check. It is used only by a check marked as an emergency, and that check records how much it used, so the home card shows "Used $600 on Oct 12 · rebuilding" |
| **Better** | When Grow ships, a one-time move copies the amount into the emergency goal, and Decide settings links to it |

### 4.7 Envelopes (today's pots)

| | |
|---|---|
| **Stored in** | Existing `savings_goals` (D-105). **UI rename only** |
| **Add / edit / delete / mark done / reopen** | The existing Pots screens and mutations, renamed. All have Undo already (device-verified after the Metro fix) |
| **Update** | A monthly add-to-envelope shows as set-aside money in "money out" |
| **Link to plans** | "Plan it" can create or choose an envelope for that purchase (`kind = 'wait'`, existing) |

### 4.8 Purchase checks

| | |
|---|---|
| **Stored in** | Existing `decide_checks`. `inputs` v2 JSON adds: `itemType`, `purpose`, `emergency`, `band`, `pay: {mode, freq, termMonths, rate, apr, fees, deposit, quotedPayment}`, `extras: {fieldId: amount}`, `value: {earnsMonthly, useYears, alternatives}` |
| **Add** | The quick field on home ("sofa 1200") or "Check a purchase". **A draft saves as you type** (status `open`, `furthest_step 1`). Leaving keeps it under "Unfinished checks" |
| **Edit** | Tap any field on the answer's header, or "Change details". The answer recomputes at once. If you change the price, the band and its questions update, and answers to layers that no longer apply are kept but hidden (so changing back loses nothing) |
| **Duplicate** | "Check another price" copies the check with a new id and `reopened_from` pointing to the original, so two prices can be compared |
| **Delete** | Swipe or ⋯ → Delete. Soft delete with the Undo toast (existing D-73 copy) |
| **Update** | Open and saved checks recompute in the background when records change. If the **code** changes (for example "Not yet" → "Fits from unspent money"), the plan shows a marker, and an optional reminder fires (4.10) |
| **Record as bought** | Status `bought` plus the D-09 "What gets written" confirm. It writes the purchase (a transaction, or a series for payments) through the existing go-ahead path. Undo reverses both |
| **Plan it** | Status `waiting`, `ready_by` set from the answer, optional envelope link and reminder |
| **Not buying** | Status `passed`. "You kept $X" is shown in the check history |
| **Reopen** | A decided check can be reopened as a new check (existing `reopened_from`). The old decision is never recomputed |

### 4.9 Unspent money (the confirmed figure): the improvement

| | |
|---|---|
| **Stored in** | New `decide_settings.unspent_anchor bigint`, `unspent_anchor_at timestamptz` |
| **Add** | Setup step 12: "That's right" stores the suggested sum; "Use my own figure" stores the typed one |
| **Update (new)** | It **rolls forward:** unspent now = the anchor + money in − money out since the anchor date. Envelope moves, emergency-fund moves and moves between your own accounts are left out. This is your rule that funds roll into the bank balance and that in vs out is what matters |
| **Re-confirm** | Asked only when: (a) the rolled figure and the suggested sum differ by more than 10% or $200; or (b) 30 days have passed and a check over band 5 is made; or (c) the user taps "Check my unspent money" |
| **Edit** | Tap the figure on home, see the worked sum, then confirm or type a new figure. Each confirm is a new anchor (Undo restores the old one) |
| **Delete** | "Clear" sets it back to "not confirmed". Checks above this month's room then return `needs_input` |
| **Shown as** | "Unspent money **$2,850** · confirmed $2,400 on Oct 3, rolled forward" |

### 4.10 Reminders

| | |
|---|---|
| **Stored in** | `decide_settings.remind_plan`, `remind_unspent`. Delivery uses the existing local notification set-up (05-26 reminders) |
| **Triggers** | A saved plan's code improves to `fits_month` or `fits_unspent`; the unspent figure needs re-confirming |
| **Edit / turn off** | Setup step 15, or Decide settings. Each reminder notification has a "Turn off" action |
| **Privacy** | The notification text never shows amounts: "Your sofa plan has an update." |

### 4.11 App rules (not user data)

These are code constants with a "FincWin choice" or cited tag, and are listed in "What this assumes":
- **band edges** (15 bands);
- **question layers** by band;
- **preset question sets** by item type;
- **card rules** by item type and region.

They change only through a code release, with tests (I33 bands are monotone; preset questions never carry an amount). Each item type's question set has its own i18n keys.

---

## 5. Decision plan (the engine)

### 5.1 Structure (pure engine, bigint minor units, 100% branch coverage, no React or database imports)

```
src/engine/decide/v3/
  month/recurring.ts       candidates, gap and amount rules, drift, confirm states
  month/incomeProfile.ts   income this month per profile (salary, match, spread, steady, balance)
  month/thisMonth.ts       money in, money out, everyday still to come (Erest), monthLeft
  month/typical.ts         median everyday, typicalLeft, lowLeft (named month), marks applied
  funds/unspent.ts         suggested sum, rolled-forward anchor, staleness and drift
  funds/emergency.ts       amount or account, emergency use and rebuild
  plan/schedule.ts         frequency → count, per-period rate, payment, interest, totals, monthly equivalent
  plan/quoted.ts           quoted-payment check (C1)
  judge/bands.ts           whole value → band → layers; item-type extras
  judge/judge.ts           one-off ladder, monthly test, combine, notices, legacyState
  judge/needsInput.ts      the needs-input rules (5.4)
  copy/verdictTable.ts     one code → chip, title, body keys (+ copy tests)
  instead/futures.ts       buy now, keep it, fixed-rate deposit, buy later, payment-stream compare
  instead/explorer.ts      everyday flex and flexible saving only
  adapters/legacy.ts       v1 inputs → v2; v3 code → legacyState; seen-state re-baseline
```

**Reused, not rewritten:**
- `payoff/` (amortisation; made per-period in `plan/schedule.ts`);
- `cardRule.ts`;
- `marketDefaults.ts`;
- `share.ts`;
- `currency.ts`;
- `series.ts`;
- `ownership.ts`;
- `payback.ts`;
- `wait.ts` logic (in `instead/futures`);
- `bisect.ts` (affordable price).

### 5.2 Main types (sketch)

```ts
type IncomeProfile = { types: IncomeType[]; variable: 'match'|'spread'|'steady'|'balance'|null;
  steady?: MinorUnits; spreadMonths?: number; holdMonths?: number };
type MonthModel = { moneyIn: MinorUnits; moneyOut: MinorUnits; erest: MinorUnits; monthLeft: MinorUnits;
  typicalLeft: MinorUnits | null; low: { left: MinorUnits; month: YearMonth; reason: MonthReason } | null;
  confidence: { level: 'rough'|'fair'|'firm'; reasons: ConfidenceReason[] } };
type Funds = { unspent: { value: MinorUnits; anchorAt: Date; rolled: boolean; stale: boolean } | null;
  suggested: MinorUnits; emergency: MinorUnits | null; envelopes: MinorUnits };
type Purchase = { whole: MinorUnits; dayOne: MinorUnits; monthly: MinorUnits; schedule: Schedule | null;
  itemType: ItemType; purpose: Purpose | null; emergency: boolean };
type Code = 'needs_input'|'not_yet'|'monthly_short'|'emergency_use'|'fits_unspent'|'fits_month';
type Result = { code: Code; variant?: 'payday'|'not_covered'|'low_month'; legacyState: LegacyState;
  split: FundingSegment[]; facts: Fact[]; notices: Notice[]; readyBy: YearMonth | null; band: Band };
```

### 5.3 The judge (from v3 section 4.5, unchanged except C1, C9, C11)
One function `judge(model, funds, purchase, limits) → Result`. Precedence (strictest first):
1. `needs_input`
2. `not_yet` (cash, or not covered)
3. `monthly_short`
4. `emergency_use`
5. `fits_unspent`
6. `fits_month`

Notices never change the code.

### 5.4 When the answer is "needs input" (C10)
1. No confirmed recurring income **and** no income profile **and** no rough figures; or
2. Unspent money is not confirmed **and** the day-one cost is more than this month's room; or
3. Band ≥ 5 **and** the newest spending entry is more than 10 days old **and** the month so far looks under-logged (below 50% of the pace).

Every case lists exactly what's missing and offers "Help me check this" (rough figures, marked "from your figures") or "Update my records".

### 5.5 Invariants (CI fails on any)
- **From v2 and v3:** I1–I39.
- **Added in this plan:**
  - **I40 Roll-forward is exact:** the anchor + Σ(in − out) since the anchor equals the suggested sum when no money moved outside your records.
  - **I41 Quoted payment:** a quoted payment below the amortised payment at the entered rate is flagged; it is never silently used to improve an answer.
  - **I42 Upgrade safety:** every stored v1 `inputs` parses to v2 and produces a result; `verdict_at_decision` is never changed.
  - **I43 Hidden layers keep answers:** changing the price back and forth never loses layer answers.

### 5.6 "What could I do instead?" for payments (C11)
For a periodic purchase, **Keep it** and **Fixed-rate deposit** compare the **same payment stream** paid into a deposit each period, at the user's rate. The interest given up is the stream's future value minus the payments made, plus the loan interest avoided. Buying later compares saving the payment amount until the price is covered.

### 5.7 Tests
- **Golden fixtures:** Sam, Maya, Riley, Leo, Tia, Dana, Kim, Priya. They hold the same numbers as the mockup, so the engine and the mockup can be checked against each other (C15).
- **fast-check properties:** all invariants.
- **Old-vs-new shadow comparison:** about 300 seeded snapshots; every changed answer is listed for review.
- **Back-test** on personas (I28).
- **Frequency maths** for every frequency, every term and rates from 0 to 30% (I37).
- **Upgrade test:** every v1 fixture in the repo (I42).

---

## 6. UI plan (the screens, from the Calm Ledger mockup)

### 6.1 Screen list

| Screen | Built from | States to design and test |
|---|---|---|
| Setup stepper (16 steps + welcome + summary) | New `SetupStepper` with section rail, one step per screen | Prefilled / empty records; needed vs optional; "Finish later"; offline (saves queue) |
| Decide settings | New list of setup answers, each opening its own step | Not set up; partly set up |
| Home | New month bar, three figures, a check card, envelopes, saved plans | No setup ("Set up Decide" card); stale unspent figure; emergency fund not set; no plans; offline banner |
| Check | Layered form: band chip, item-type chips, payment plan, extras, purpose, value | Every band; every item type; periodic or not; validation (price 0, term 0, rate over 100%) |
| Answer | Hero card, funding strip, three facts, notices, assumptions, actions | All 6 codes + variants; rough / fair / firm; recomputing; changed since you looked |
| The whole plan | Dark summary, rows, mix bar, card rule | Rate 0%; quoted-payment warning; very long terms |
| What could I do instead? | Four futures, deposit rate input, years, explorer slider | No rate typed; payment-stream version; small purchase (hidden below band 3) |
| How this was worked out | Month line by line, 6-month bars, regular payments, assumptions | Fewer than 6 months; months marked out or half-logged |
| Help me check this | Five fields | Partly filled; offline |
| Record sheets | Bought / Plan it / Not buying, with "What gets written" and Undo | Failed save (existing failed-writes path) |
| Unspent money sheet | Worked sum, confirm or type, roll-forward note | Drift prompt; stale; not confirmed |
| Emergency fund sheet | Amount or account; "Not set" | Account chosen; used and rebuilding |

### 6.2 Reused from today's app
- `Sheet` (own modal, drag to dismiss);
- `ToastView` and `UndoToastHost`;
- the write queue and failed-writes path;
- `DetailScreen`;
- the currency formatter (the US-dollar fix);
- `heroAmountText` (no number breaks);
- the FAB rules;
- the tokens in `src/theme`;
- the Archivo and Manrope fonts;
- the existing Pots screens (renamed Envelopes).

### 6.3 Removed from today's app
- the Judge-on control and the three-basis card;
- the five-step flow (Step 1–5);
- the Impact step's folds;
- the cushion figures;
- the "free / overspent" home figure;
- the setbacks, stress test and income-at-risk sections;
- first-read rough-figures screens (replaced by setup and "Help me check this").

Each removal happens only after its v3 replacement passes on device.

### 6.4 Quality rules for every screen
- **Fit:** the screen fits from 320 to 402 px wide, at font scale 1.0 and 2.0. No numbers break across lines (the `heroAmountText` rule).
- **TalkBack:** every control is a real button or input with a label. The funding strip has a text equivalent ("$425 from October, $775 from earlier months"). Switches use `role=switch`.
- **Contrast** is at least 4.5:1, including small grey labels. Answer colours also differ in lightness, not only hue.
- **Haptics:**
  - a success tick on "Record as bought";
  - a light warning on `not_yet`, `monthly_short` and `emergency_use`;
  - none on scrolling or typing.
- **Motion:** the month bar and funding strip animate once (about 300 ms), and not at all when reduce-motion is on.
- **Wording:**
  - one i18n key per code row;
  - banned-word tests extended (no "you should", "safe", "you can", "approve");
  - every forecast says "could" or "based on your records".
- **Privacy:** amounts never appear in notifications. A screenshot-sensitive flag on Decide screens is an open question.

### 6.5 Navigation map
```
Welcome → Setup (16) → Summary → Home
Home → Check → Answer → { Instead, Whole plan, Worked out, Help me check } → Record sheet → Home
Home → Saved plan → Answer        Home → Unspent / Emergency / Envelopes sheets
Home ⚙ → Decide settings → any single setup step
```

---

## 7. Execution plan

### 7.1 Phases (each runs the normal GSD steps: discuss → UI spec where needed → plan → plan-check → execute in waves → verify → device walkthrough → PR)

| Phase | Goal | Main work | Effort |
|---|---|---|---|
| **05 close-out** | Ship what's built safely | Decide on PR #82 (2.3); if option 3, add a `decideV3`/`decideVisible` switch; finish the 05-26 checks that still apply | 2–3 days |
| **05.1 Decide engine v3** | New maths, proven | Slices S0–S9 (below), behind `decideV3`, shadow-compared | ~34 days |
| **05.2 Decide data and setup** | Store and ask everything | Migrations (7.3), mutations, purge and export, setup stepper, Decide settings, recurring candidates and dismissals, unspent sheet, emergency sheet | ~12 days |
| **05.3 Decide screens v3** | The mockup, built | Home, Check (layers), Answer, Plan, Instead, Worked out, Help, Record sheets; remove old screens; 5-person reading test before and after | ~16 days |
| **Cutover** | One Decide | Switch on for all; delete the old engine and screens; drop unused columns in a cleanup migration | 2 days |

**Total: about 66 working days for one developer.** Slices in 05.2 and 05.3 can run alongside the later 05.1 slices once the engine's types are fixed after S2.

### 7.2 Engine slices (05.1)

| Slice | Delivers | Days | Done when |
|---|---|---|---|
| S0 | Golden fixtures of today's answers and the 8 personas | 2 | Fixtures committed; the mockup numbers match Sam |
| S1 | `month/recurring.ts` (candidates, drift, two-date pay groups) | 4 | Properties pass; detects all fixture series |
| S2 | `month/incomeProfile.ts` + `thisMonth.ts` + `typical.ts` | 5 | I2, I14–I16, I21, I39 pass |
| S3 | Cash path fix (no zero-spend) + payday variant | 2 | B2 closed; Tia case right |
| S4 | `funds/` (suggested, roll-forward, emergency) | 3 | I17, I31, I35, I40 pass |
| S5 | `plan/schedule.ts` + `quoted.ts` | 4 | I36, I37, I41 pass at all frequencies |
| S6 | `judge/` + `needsInput.ts` + `verdictTable.ts` | 4 | I18–I26, I32–I34, I38 pass; copy tests green |
| S7 | `instead/` (futures with payment stream, explorer) | 4 | I30 passes; deposit maths exact |
| S8 | `adapters/legacy.ts` + shadow run + back-test | 4 | I28, I42 pass; changed answers reviewed |
| S9 | Snapshot wiring (`buildSnapshot` v3 inputs) | 2 | Home, check and plans read one `Result` |

### 7.3 Data changes (05.2). Each is a migration with preflight, applied to production **only with your explicit approval**

| Migration | Change |
|---|---|
| `decide_settings_v3` | Profile and preference columns (4.1); `everyday_override`, `everyday_override_at`, `month_marks`; `unspent_anchor`, `unspent_anchor_at`; `reserve_account_id`; `rough_saving`, `rough_debt`, `rough_invest`, `rough_as_of` |
| `recurring_series_v3` | `counts_as`, `income_kind`, `saving_mode`, `pay_group` (no frequency change, C2) |
| `transactions_income_tags` | Nullable `income_kind` and `counts_as` on transactions, so one-off income can be tagged in Activity |
| `income_payer_prompts` | A small synced table of payers already asked about, so "new kind of income" asks only once |
| `debts_v3` | `pays_in_full` |
| `savings_goals_buckets` | New `bucket text` (college, house, car, trip, business, wedding, other) on envelope rows (`kind = 'pot'`). `target`, `monthly_amount` and `ready_by` already exist |
| `decide_settings_refine` | `refine_last_at`, `refine_snooze_until` |
| `recurring_dismissals` | New table with household RLS, synced |
| `purge_and_export_v3` | Account deletion and data export include every new column and table (C13) |
| `decide_cleanup` (at cutover) | Drop `basis_override`; review unused `rough_*` and line columns |

The `decide_checks` structure is unchanged. The new data lives in the versioned `inputs` JSON (C6).

### 7.4 Gates (unchanged from Phase 5)
- **After every wave:**
  - typecheck;
  - eslint with 0 errors;
  - depcruise (engine purity);
  - `check:ignores`;
  - `verify:gates`;
  - `test:coverage --maxWorkers=4` (100% branch on engine and snapshot);
  - CI green.
- **Before each PR:** a device walkthrough on the Pixel, after restarting Metro with `--clear`.
- **Accessibility checks:** 320 and 402 px at 1.0 and 2.0 font scale, plus TalkBack.

### 7.5 Progress reporting
A percentage and status at each slice and phase milestone (per your standing preference). Each phase ends with a short grade-10 summary of what changed for users.

---

## 8. Risks, and what keeps them small

| Risk | What could go wrong | Guard |
|---|---|---|
| Recurring detection mislabels a payment | Wrong typical month | Only confirmed series count (I34); dismissals remembered; drift asks first |
| Roll-forward drifts from reality | Unspent figure too high (a wrong "fits") | Re-confirm on drift (10% or $200); suggested sum always shown next to it; confidence capped when stale |
| Old checks break | Saved plans won't open | Versioned inputs + upgrade test on every fixture (I42) |
| Setup feels long | People skip it | Only 5 needed steps; prefilled; "Finish later"; answers still come, marked "rough" |
| Two engines at once | Bugs from mixing them | One switch, read in one place; shadow results never shown to users |
| Production migrations | Data loss or downtime | Preflight; additive columns first; drops only at cutover; your approval for every push |
| Example of advice creeping back | Compliance (App Store, UDAAP) | Banned-word tests; fixed-rate deposit with the user's own rate; "The choice is yours"; counsel review in the Compliance phase |

---

## 9. Decisions (owner, 2026-10-25)

1. **PR #82:** merge with Decide hidden; the tab shows "Coming soon". ✅
2. **Upgrade approach:** side by side behind a switch. ✅
3. **Unspent money:** roll forward and re-ask on drift. ✅
4. **Quoted payment (C1):** work it out, plus an optional quoted payment with a warning (default applied).
5. **Pay timing:** only "Every 2 weeks" is shown. 1st-and-15th pay is counted correctly as two monthly series (24 a year). "Twice a month" is removed from every choice list. ✅
6. **Income profile:** built once in 05.2 as a shared component, reused by Phase 9's main onboarding. In Activity: a prompt card, income tagging, and a question for new income. ✅
7. **Theme:** the mockup and the build use the current build's theme: the "Bold" pairing (Archivo Black display, Archivo body), accent green, 26 px card radius, 22 px screen padding, the five-tab bar with its existing icons. ✅
8. **Roadmap:** phases 05.1, 05.2 and 05.3 are added to the roadmap. ✅
