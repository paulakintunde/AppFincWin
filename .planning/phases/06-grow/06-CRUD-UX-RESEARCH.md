# 06 Grow: how easy it is to add, view, change and remove things (CRUD UX research)

**Date:** 2026-11-07 · **Branch:** `feat/06-grow` (worktree `C:\dev\fincwin-g6`) · **Type:** research only. No code was changed.

**Question from the owner:** "Look into the CRUD UX ease for the grow as a research to improve it."

**Method:** I read every Grow screen and sheet (`src/features/grow/**`), the routes (`app/(app)/grow/**`), and the write hooks
(`src/data/mutations/grow*.ts`, `debts.ts`). I checked them against the design contract (`06-UI-SPEC.md`, `design/areas-spec.md`)
and against the patterns used in Record, Activity and Decide (`SwipeRow`, `DeletableRow`, `TransactionDetailSheet`,
`AccountDetailScreen`). I counted taps by hand from the code. I did not run the app.

---

## 1. Summary

Grow does most of the basics well. Each object has a detail screen, and its Edit sits in the header. Changes are made in
sheets, almost every write gives a toast with Undo, and every remove asks for confirmation first. The weak spots are the
**child records**: investment entries, past debt payments and past goal contributions. These can be added, but they cannot be
opened, fixed or removed from Grow. Two of these gaps contradict the UI-SPEC directly. The spec says "tapping opens edit sheet"
for entries, and it puts an "Edit" header action on holding detail. One gap is a correctness trap. Once a saved extra debt
payment's toast is gone, it cannot be cleared.

Grow rows also lack the swipe and ⋯ (more) menu shortcuts that Activity and Decide already use. That makes Grow feel stiffer
than the rest of the app, but it is a consistency problem, not a missing ability.

---

## 2. Action matrix

**How to read it.** Taps are counted from Grow home with the Goals segment showing, which is the default. They include the
final Save or Confirm, and exclude typing and scrolling. Reaching Debts or Investing costs **+1** tap for the segment.
"Undo" means a toast with Undo.

**Status values:**
- **OK**: built and consistent.
- **Weak**: built, but hard to find or inconsistent.
- **Missing**: no way to do it in Grow.
- **Gap vs spec**: the UI-SPEC or areas-spec asks for it and the build does not have it.

### 2.1 Goal

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| Create | 5 (FAB or "+ New goal" → Next → Next → lock choice → Make goal) | FAB; "+ New goal" row under the goals; the empty-state pill | Undo ("Goal made"); asks before discarding a half-filled sheet | OK. The lock question has no default, so it always costs one tap |
| View | 1 | Goal row | — | OK |
| Edit details | 3 (row → header Edit → Save) | Header "Edit" → `NewGoalSheet` in edit mode, one page | Undo | OK |
| Edit plan (each month / reach-by date) | 3 (row → plan row → Save) | Plan card rows, with chevrons | Undo | OK; this is a good inline pattern |
| Lock / unlock | 2 (row → switch) | Switch near the bottom of detail | Undo, light haptic | OK |
| Remove | 3 (row → "Remove goal" → confirm) | Text button at the very bottom | Confirmation, then Undo | Weak: you must scroll to reach it, and the row has no swipe or ⋯ |
| Undo | 1 | Toast only | — | Weak: once the toast is gone, nothing can be undone (the app has no Undo history) |
| Add money | 3 (row → Add money → Save) | Primary pill on detail | Undo; "Reached" moment | OK |
| Take some out | 3, or 4 if locked (adds the warning confirm) | Secondary pill on detail | Undo | OK |
| Confirm an Expected contribution | 3 (row → Expected history row → Confirm) | History card, low on detail | Undo | Weak: nothing on the goal row or on home says something is waiting |
| Open, fix or remove a past contribution | — | History rows that are already paid cannot be tapped | — | **Missing / gap vs spec** (areas-spec: "A history row → transaction detail"). Today this only works from Activity |
| Use as my safety net | 3 (row → row → confirm) | Row in the lock card | Undo | OK |

### 2.2 Safety net

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| Create (set a size) | 4 (card → "Set a size" → radio → Save size) | Safety net card; first-open sheet; or "Use as my safety net" on a goal | Undo | OK |
| View | 1 | Card, always first | — | OK |
| Edit size / protection | 4 (card → Size row → radio → Save) | Size row | Undo | OK |
| Edit each month | 3 (card → row → Save) | Each month row | Undo | OK |
| Edit "Kept in" account | — | The row shows a value but cannot be tapped | — | **Missing**: the account can never change after migration |
| Remove | Not offered (by design: set it to $0 or turn protection off in Size) | — | — | OK by design (UI-SPEC §2) |
| Add money / take some out | 3 / 4 | Pills | Undo; warning confirm | OK |
| Confirm Expected | 3 | History rows | Undo | Weak, as for goals |

### 2.3 Debt

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| Create | 4 (segment → FAB → type chip → Add debt); +1 for a card's "paid in full" answer | FAB; empty-state pill; "Add a debt" pill **below the payoff plan card** | Undo ("Debt added") | Weak: the in-page add button is far down, below a tall card |
| View | 2 | Debt row | — | OK |
| Edit | 4 (segment → row → Edit → Save) | Header "Edit" → `AddDebtSheet` in edit mode | Undo | OK |
| Update what is owed | 4 (same path as Edit) | Only through the whole Edit sheet | Undo | Weak: this is the most frequent change, and it goes through the full form |
| Remove | 4 (segment → row → Remove debt → confirm) | Text button near the bottom | Confirmation; soft delete with Undo | OK. No swipe or ⋯ |
| View past payments | — | "Payments" shows only the **next** expected payment | — | **Missing / gap vs spec** (areas-spec: "Payment row → transaction detail") |
| Record or fix a payment | — | Only in Activity | — | Missing in Grow (could wait; see §4) |
| Save an extra a month | 2+ (segment → stepper… → "Use $X extra") | Payoff plan card | Undo | OK |
| **Stop the saved extra** | — | `useExtra` returns early when `extra <= 0`, so $0 can never be saved | — | **Missing (correctness)**: once the toast is gone, the extra cannot be cleared from Grow. `useSaveDebtPlan` already accepts `extra: 0` |
| Close from a sale | 4 (segment → row → "I sold what this paid for" → Record) | Text button | Undo | OK |
| "Change in the payoff plan" link | 1 | Detail card | — | Weak: it calls `router.back()`, which does not promise the Debts segment or the plan card |

### 2.4 Holding

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| Create | 4 (segment → FAB → type → Add holding) | FAB; empty-state pill; "+ Add a holding" at the very bottom | Undo | OK |
| View | 2 | Holding row; the "Update value?" row | — | OK |
| Edit (name, type, put in, account, paid from, each month, day, rate) | — | No header Edit | — | **Missing / gap vs spec** (UI-SPEC §4 "header (back, name, 'Edit')"). `useEditHolding().edit` and the `holdingEdited` undo label exist but are never called |
| Update value | 4 (segment → row → Update value → Save) | Primary pill on detail | Undo | OK |
| Remove | 4 (segment → row → Remove → confirm) | **Danger Pill**. Goals and debts use a danger text button | Confirmation, then Undo | Weak: inconsistent with goals and debts, and with the spec's "Text button" |

### 2.5 Holding entry (lot: buy, sale, dividend, fee, value update)

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| Create | 5 (segment → row → "Add a buy / sale / dividend" → kind chip → Save) | Text link on detail | Undo | OK |
| View | 2 (it is in the Entries list) | List | — | OK (read only) |
| Edit | — | Entry rows cannot be tapped | — | **Missing / gap vs spec** ("tapping opens edit sheet"). `useEditHoldingLot().edit` and the `holdingEntryEdited` label exist |
| Remove | — | — | — | **Missing**. `useEditHoldingLot().remove` and the `holdingEntryRemoved` label exist. Today the only way to fix a wrong entry is to remove the whole holding |
| Empty state action | — | The card has a body and no button | — | Gap vs spec (empty table: action "Update value") |

### 2.6 Money rules (Your money rules)

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| View | 1 | "Tools" card, under the segment content | — | Weak: you must scroll past every goal or debt to reach it |
| Edit | 3 (Tools row → rule row → Save rule) | `LineSheet` | Undo | OK |
| Turn off | 4 (… → switch off → Save) | "Use this rule" switch | Undo | OK |
| Create / remove | Fixed set of three, plus the safety net | — | — | OK by design |

### 2.7 Account interest rate (APY)

| Action | Taps | Entry point | Feedback | Status |
|---|---|---|---|---|
| Set / edit / clear | About 5, and you leave Grow (You → Accounts → account → Edit account → Save) | `AccountSheet` rate field | Undo | Weak: no Grow entry point. The goal's and the safety net's "Kept in" rows are plain text and do not link to the account |
| View | Only in account detail ("Interest a year", with "See what it could grow to") | — | — | Weak: Grow never shows the rate of the account a goal is kept in |

---

## 3. Patterns across Grow, compared with the rest of the app

| Pattern | Rest of the app | Grow | Gap |
|---|---|---|---|
| Swipe on a row | Activity (Mark paid / Delete), Decide pots and saved rows (`SwipeRow`, `DeletableRow`) | None | Grow rows can only be tapped |
| ⋯ menu on a row | Decide `DeletableRow` (Dropdown glyph) | None | — |
| Long-press | Activity (selection) | None | Acceptable; long-press is hidden and only adds value as a duplicate of ⋯ |
| Detail = screen, change = sheet | Accounts (screen + `AccountSheet`), Activity (detail sheet) | Screen + sheets | Consistent |
| Toast with Undo on every write | Yes | Yes, on every write found | Consistent |
| Confirm before a destructive action | Activity deletes a plain line at once and relies on Undo; Decide confirms first | Every remove confirms **and** gives Undo | Safe. Some double friction, which is fine for whole records |
| Remove control style | Accounts: `AccountRemoveRow` | Goal and debt: danger text; holding: danger **Pill** | Holding is the odd one out |
| Header Edit text role | — | Goal uses `label`; debt uses `body` | Small visual mismatch |
| In-page "add" control | — | Goals: "+ New goal" row inside the list card. Debts: secondary Pill below the plan. Investing: text row at the very bottom | Three different patterns |

**Reference practice, in brief.** Undo after the action is preferred to a confirmation dialog for reversible actions. A
confirmation earns its place for removing a whole record ([NN/g via UX Planet](https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956);
[saasui.design](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns)). Apple's HIG asks that
row-level menus be offered "consistently throughout your app" and that they not be the only route to an action
([Apple HIG, Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)). Both support the
same two steps: make child records editable from their own row, and give Grow rows the same swipe and ⋯ the app already uses.

---

## 4. Top 10 improvements, ranked by user value against effort

Effort: S = under half a day, M = 1–2 days, L = more. All copy below is declarative and uses existing tokens, with amounts in
integer minor units in code.

### 1. Edit and remove a single investment entry (value: high · effort: S–M) — **Phase 6**
**Files:** `src/features/grow/investing/LotSheet.tsx`, `src/features/grow/investing/HoldingDetailScreen.tsx`, `src/i18n/locales/en.ts`.

Each Entries row becomes a `Pressable` (`accessibilityRole="button"`, chevron, 44 px minimum). Tapping it opens `LotSheet` in
an edit mode. Add a `lot?: HoldingLotRow` prop; with it, the sheet prefills amount, units, date and note, and the kind chips
are read only because `EDIT_LOT_KEYS` excludes kind. Save calls `useEditHoldingLot().edit` and shows the toast "Entry edited ·
{name}" with Undo. Under Save, a danger text button "Remove entry" opens a `ConfirmSheet`: "Remove Buy · Oct 1 · $150? The
gain on {name} is worked out again without it." / "Remove" / "Keep it". It then calls `.remove` and shows the toast "Entry
removed · {name}" with Undo. A refused edit, such as a sale that ends up larger than the units held, shows the existing
range-error copy inline in `warn1`. A "value" entry opens `UpdateValueSheet` prefilled with that entry instead.

### 2. Edit a holding (value: high · effort: M) — **Phase 6**
**Files:** `src/features/grow/investing/AddHoldingSheet.tsx`, `HoldingDetailScreen.tsx`, `en.ts`.

Add a header `right` action, "Edit", styled exactly like the goal and debt headers. It opens `AddHoldingSheet` with a new
`holding?: HoldingRow` prop. Edit mode is one page. It prefills Name, Account type, "Put in so far" (`opening_put_in`) and the
"Regular amount going in" fields (each month, day, paid from, rate), and hides "Value now" and "As of", because value moves
only through Update value. Save sends only the changed keys through `useEditHolding().edit` and shows the toast "Holding edited ·
{name}" with Undo. The title is "Edit holding" and the primary button is "Save changes". The dirty-sheet discard prompt is
already handled by `Sheet dirty`.

### 3. A way to stop a saved extra debt payment (value: high, correctness · effort: S) — **Phase 6**
**Files:** `src/features/grow/debts/DebtsSegment.tsx`, `PayoffPlanCard.tsx`, `en.ts`.

When the model already has an extra (`model.extra > 0`), the plan card shows a text button "Stop the extra" under
"Use $X extra". It calls `planSave.save({ …, extra: 0 })`, which the mutation already supports, and shows the toast "Extra
stopped. Decide's next answers count the minimum only." with Undo. Also remove the `extra <= 0` early return, or route $0
through the stop path, so the stepper's $0 is not a silent no-op. This matters because today the only way out is the toast's
Undo.

### 4. Past payments on debt detail (value: high · effort: M) — **Phase 6**
**Files:** `src/features/grow/debts/DebtDetailScreen.tsx`, a small query in `src/data/queries/` (transactions by the debt's
`series_id` and its extra series), `en.ts`.

The "Payments" section lists the next expected payment first, then the last 6 paid lines, newest first. Each row reads
"Paid · Oct 15 · $312", or "Extra · Oct 15 · $50" for the extra series. Tapping a row opens the existing
`TransactionDetailSheet` from Activity, so Edit, Delete and Mark paid reuse Activity's mutations and toasts. A last text row,
"See all in Activity", opens Activity filtered to this debt's account. Empty state: "No payments recorded yet". This also backs
up the remove-confirm copy, "Past payments stay in Activity", by showing those payments.

### 5. Tappable goal and safety-net history (value: medium–high · effort: M) — **Phase 6**
**Files:** `src/features/grow/goals/GoalDetailScreen.tsx`, `src/features/grow/safetyNet/SafetyNetScreen.tsx`.

Paid history rows get a chevron and open `TransactionDetailSheet` for the transfer leg. Removing it goes through Activity's
existing delete-both-legs confirm and Undo (`useDeleteTransfer`). The "start" row stays plain text. This matches the
areas-spec ("A history row → transaction detail"). It lets someone fix a wrong "Add money" days later, instead of hunting
for the transfer in Activity.

### 6. Make waiting Expected contributions visible, and confirm them in one tap (value: medium · effort: S) — Phase 6 if time allows
**Files:** `src/features/grow/home/GoalRow.tsx`, `SafetyNetCard.tsx`, `useGoalsRead.ts` (count of pending lines per goal),
`GoalDetailScreen.tsx`, `SafetyNetScreen.tsx`.

A goal or net with pending lines shows a slate `sClock` `StateBadge`, "1 to confirm" or "2 to confirm", on its row or card,
and the spoken label includes it. On detail, each Expected row gets an inline secondary `Pill`, "Confirm", which writes at
once and relies on the Undo toast. The `ConfirmSheet` goes: it is redundant for a reversible step. Tapping the row text still
opens the sheet for anyone who wants to read the line first.

### 7. Swipe and ⋯ menus on Grow rows (value: medium · effort: M) — can wait (Phase 6.x polish)
**Files:** `GoalRow.tsx`, `DebtsSegment.tsx` (row), `InvestingSegment.tsx` (row); reuse `src/features/decide/ui/DeletableRow.tsx`.

Wrap goal, debt and holding rows in `DeletableRow`. A full swipe left offers "Remove" and opens the same `ConfirmSheet` copy
as the detail screens; the caller owns the Undo toast. The ⋯ menu lists the most common action for each row, then Remove:
- goal: "Add money", "Edit"
- debt: "Edit"
- holding: "Update value", "Edit"

The safety net card gets no swipe and no Remove, by design. Each swipe action is also exposed as an accessibility action, as
`SwipeRow` already does. This brings Grow in line with Activity and Decide, per Apple's "support consistently" guidance.

### 8. "Kept in" rows that do something, and APY reachable from Grow (value: medium · effort: S–M) — partly Phase 6
**Files:** `SafetyNetScreen.tsx`, `GoalDetailScreen.tsx`, possibly `growGoals.ts` (check that `useEditGoal` accepts
`account_id`), `en.ts`.

On the safety net, "Kept in" becomes a chevron row that opens the same account picker `NewGoalSheet` uses. It saves through
`useEditGoal` and shows the toast with Undo. Without this, the net's account can never change, so this part is **Phase 6**.
On both screens, when the kept-in account has a rate, a row "Interest a year · 4.1%" appears and opens the account's detail
(`/accounts/[id]`), where APY is edited and "See what it could grow to" already lives. That puts APY 2 taps from a goal
instead of about 5 outside Grow.

### 9. One remove style and the spec's empty-state actions (value: medium · effort: S) — **Phase 6**
**Files:** `HoldingDetailScreen.tsx`, `GoalDetailScreen.tsx`, `DebtDetailScreen.tsx`.

- Holding "Remove holding" becomes the same danger text button as goal and debt (the spec says "Text button").
- The header "Edit" text role is the same on all three screens (`label` is the goal's; pick one).
- Goal history empty gains the spec action "Add money", which opens `MoneyMoveSheet`.
- Holding entries empty gains "Update value".
- The Investing segment shows the grey loading blocks that Goals and Debts use, instead of `null`.

### 10. Add buttons where people look, and a reliable route back to the plan (value: low–medium · effort: S) — can wait
**Files:** `DebtsSegment.tsx`, `InvestingSegment.tsx`, `DebtDetailScreen.tsx`.

Use the Goals pattern everywhere: a "+ Add a debt" or "+ Add a holding" accent text row as the last row **inside** the list
card. This replaces the Debts Pill below the payoff card and the Investing row at the very bottom. "Change in the payoff plan"
pushes `/(tabs)/grow?segment=debts`, which `GrowHome` already reads, instead of `router.back()`.

**Also considered but left out of the top 10:**
- An "Update what's owed" quick sheet on debt detail, shaped like `UpdateValueSheet` and saving only `balance`. It is useful,
  but Edit covers it today.
- A lock-question default (no default is a deliberate D-05 choice).
- An Undo history screen. This would be app-wide, not Grow-specific.
- Long-press menus, which only duplicate ⋯.

---

## 5. Build in Phase 6 or wait

**Missing outright, build in Phase 6.** These are gaps against the spec or correctness traps, and the hooks mostly exist.

1. Edit and remove an investment entry (#1). Gap vs spec; hooks and undo labels are ready.
2. Edit a holding (#2). Gap vs spec; hook and undo label are ready.
3. Stop a saved extra debt payment (#3). Correctness; the mutation is ready.
4. Past payments on debt detail (#4). Gap vs areas-spec; already known.
5. Tappable goal and safety-net history (#5). Gap vs areas-spec.
6. Safety net "Kept in" can be changed (#8, first half). Nothing else can change it.
7. Consistent remove style and spec empty-state actions (#9). Small spec conformance.

**Can wait (Phase 6.x polish or later):**
- Expected-line badges and one-tap confirm (#6). Cheap; take it if Phase 6 has room.
- Swipe and ⋯ on Grow rows (#7).
- Showing APY in Grow (#8, second half).
- Add-button placement and the plan back-link (#10).
- The "Update what's owed" quick sheet, an app-wide Undo history, and long-press.

---

## 6. Points to verify before building
- Goal Expected lines in Activity: if Activity's one-tap "Mark paid" can flip a goal's pending line without
  `confirm_goal_contribution`, Grow and Activity could disagree. I did not confirm this in code; check `ActivityRow` with
  `canMarkPaid` against goal lines.
- Whether `useEditGoal` allows `account_id` in its patch keys (needed for #8).
- Debt payments query (#4): payments are linked by `series_id`. A one-off payment typed in Activity without the series will
  not show. Decide whether "See all in Activity" covers that.

Sources: [UX Planet — confirmation dialogs (cites Nielsen)](https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956) ·
[saasui.design — destructive action patterns](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns) ·
[Apple HIG — Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)
