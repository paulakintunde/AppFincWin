---
phase: 06-grow
reviewed: 2026-11-10
depth: standard
files_reviewed: 180
diff_base: 0b7c97ae
status: issues_found
findings:
  critical: 12
  warning: 44
  info: 17
  total: 73
---

# Phase 6 code review

Five reviewers read the 180 source files Phase 6 added or changed (tests, JSON cases and docs left out). Finding ids carry their part: P2-CR-01 is part 2, critical 1. Some findings appear in two parts (removing a goal leaves its series running: P1-CR-03 and P5-CR-01; the sale lines carry no debt_id: P1-WR-06 and P5-WR-05).

## Part 1: Database, src/db, src/data

## Phase 6 (Grow): Code Review Report, part 1 of 5

**Reviewed:** 2026-11-10
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

### Summary

I reviewed the Phase 6 changes to the database migrations, `src/db` and `src/data`. The re-issued functions (`apply_patches`, `guard_savings_goal` and `undo_adjusted_ops`) differ from their previous definitions only on the lines marked `06`. I checked those diffs one function at a time. The SECURITY DEFINER RPCs all set `search_path = ''`. Each one checks the household or owner of the ids it is given, and each builds its undo ops on the server. I found no authorization bypass.

The defects are in three places:

- **Version side effects of the new triggers.** The holding value sync and the debt balance follow-line trigger both change a row's version without the client knowing.
- **Inexact arithmetic in `debt_balance_follows_line`.** It clamps the balance at 0, so a later reversal does not restore the balance.
- **Removing a goal or debt.** The remove actions soft-delete the row but leave its monthly series running.

### Critical Issues

#### P1-CR-01: Undo of "holding added" is always refused: the seeded value lot bumps the holding's version after the insert returns

**File:** `supabase/migrations/20261106000100_grow_schema.sql:243-275`, `src/data/mutations/growHoldings.ts:229-230`, `src/db/holdings.ts:105`
**Issue:**
- `seed_holding_value` is an AFTER INSERT trigger on `holdings`. It inserts a `value` lot, and that fires `sync_holding_value`.
- `sync_holding_value` runs `update public.holdings set value=..., value_as_of=...`. `bump_version` is unconditional, and `fincwin.system_restamp` is not set, so the holding moves from version 1 to version 2.
- The client's `insert(...).select()` RETURNING row is built before AFTER triggers run, so it carries `version: 1`.
- `registerAddHolding` stores the undo step `inverseOfInserts('holdings', [{ id, version: row.version /* 1 */ }])`.

Failure scenario: add a holding, then tap Undo. `apply_undo_step` finds version 2, expects 1, and returns a conflict. The holding cannot be undone. An edit made right after the add, before the refetch lands, also conflicts.

Only the offline-replay path gets this right. There the 23505 read-back returns version 2.

The same trigger also bumps the holding on every `value` lot insert, edit or delete. So Undo of an earlier holding edit is refused once a value has been updated. `undo_adjusted_ops` cannot account for this, because the holding is not in the lot step's `touched_ids`.
**Fix:** Run the sync without a version bump, which is the pattern `materialise_series` already uses:
```sql
perform set_config('fincwin.system_restamp', 'on', true);
perform set_config('fincwin.holding_sync', 'on', true);
update public.holdings set value = v_amount, value_as_of = v_date where id = new.holding_id;
perform set_config('fincwin.holding_sync', '', true);
perform set_config('fincwin.system_restamp', '', true);
```
Alternatively, have `insertHolding` re-read the row after the insert and build the step from the read-back version. That fixes only the add path; the edit-then-value-update path stays broken.

#### P1-CR-02: `debt_balance_follows_line` clamps at 0, so un-paying, deleting or undoing a paid one-off does not restore the balance

**File:** `supabase/migrations/20261110000100_grow_debt_extra_drop_unstarted.sql:405-416`, `supabase/migrations/20261106000400_grow_debt_one_off_and_net_confirmed.sql:112`
**Issue:** The forward move is `greatest(0, balance - v_now)`, which drops the part of the payment above the balance. The reverse move is `balance + v_was`, which adds back the full amount. The two are not inverses whenever the clamp engaged.

`record_debt_one_off` checks `v_amount <= balance` only when the line is recorded. It ignores other pending one-offs and later balance edits, so the clamp is easy to reach.

Failure scenario:
1. A debt has a balance of 1,000.
2. Record one-off A for 800 and one-off B for 800. Both pass the check.
3. Mark A paid: the balance goes to 200.
4. Mark B paid: the balance is clamped to 0, and 600 is lost.
5. Undo "mark B paid", which sets the line back to pending: the balance goes to 0 + 800 = 800. The correct value is 200.

The same thing happens after a sale pays the debt off (balance 0) and a leftover pending one-off is then marked paid and unmarked: a paid-off debt reads 800 owed. `paid_off_on` is never set or cleared by this trigger either. These are wrong balances that Decide reads, so this is a data-integrity defect.
**Fix:** Do not clamp in a way that loses information. Either derive the balance from the user's balance plus the sum of paid linked lines, or store the amount actually applied so the reverse step adds back exactly that:
```sql
-- forward: apply only what fits, remember it on the line
v_applied := least(v_now, balance);
update public.debts set balance = balance - v_applied ...;
-- store v_applied in a server-only column such as transactions.debt_applied; reverse adds back debt_applied, not abs(original_amount)
```
At minimum, refuse (raise) a paid transition that would take the balance below 0, rather than clamping silently.

#### P1-CR-03: Removing a goal leaves its monthly contribution series running, and its new Expected lines cannot be confirmed or bulk-marked paid

**File:** `src/data/mutations/growGoals.ts:460-475`, `supabase/migrations/20261106000200_grow_goal_contributions_and_safety_net.sql:16-35, 114-122, 522-525`, `src/data/mutations/patches.ts:323-324`
**Issue:**
- `useEditGoal().remove` patches only `savings_goals.deleted_at`. The goal's live `recurring_series` (with `goal_id`) is not ended.
- `guard_series_goal` only checks `goal_id` on insert or change, so `materialise_series` keeps inserting pending lines with `goal_id = <deleted goal>` every month.
- Those lines are stuck:
  - `confirm_goal_contribution` raises "the goal is gone".
  - `useBulkMarkPaid` now filters out every line with a `goal_id` (`patches.ts:324`).

Decide keeps counting them as Expected money out. Callers are GoalDetailScreen:144 and GoalsSegment:113, and neither stops the series first.
**Fix:** Make removal a server-side action that ends the contribution series with the same branch `save_goal_plan` uses for `p_series = null`, inside one undo step. For example, add a `remove_goal` RPC, or let `save_goal_plan` accept a delete. Also have `materialise_series` skip a series whose goal is deleted:
```sql
if s.goal_id is not null and not exists (select 1 from public.savings_goals g where g.id = s.goal_id and g.deleted_at is null) then return; end if;
```

### Warnings

#### P1-WR-01: Removing a debt leaves its Expected extra series (and the debt's payment series) running

**File:** `src/data/mutations/debts.ts:270-273, 525-548`
**Issue:** `useRemoveDebt` soft-deletes the debt only. A plan saved through `save_debt_plan` created an "Extra on <debt>" monthly series (`extra_series_id`), and it keeps materialising pending lines after the debt is gone. Decide counts them as outgoings for a debt that no longer exists. The new `debtRemoved` undo step also cannot restore any series change, because none is made.
**Fix:** Route removal through a server RPC that ends `extra_series_id` (and `series_id`, if the payment series belongs only to the debt) with `grow_end_series`, and store one undo step for all of it.

#### P1-WR-02: A debt-linked line moves the debt's version without the client knowing, so Undo of earlier debt steps is refused

**File:** `supabase/migrations/20261110000100_grow_debt_extra_drop_unstarted.sql:407-415`
**Issue:** The trigger updates `debts`, and `bump_version` raises its version. The debt is not in the line step's `touched_ids`, so `undo_adjusted_ops` never compensates.

Scenario: edit the debt (step A), then mark its one-off line paid. Undo A now returns a conflict, and so does Undo of `debtPlanSaved` or `debtSaleRecorded`. A `save_debt_plan` queued offline with the cached version also conflicts if a line was marked paid on another device in between.
**Fix:** Use the same approach as P1-CR-01: run the trigger's debt update under `fincwin.system_restamp`, so the balance changes but the version does not. Or record the debt id in the line step so `undo_adjusted_ops` counts it.

#### P1-WR-03: `record_debt_one_off` (and the follow-line trigger) ignore currency

**File:** `supabase/migrations/20261106000400_grow_debt_one_off_and_net_confirmed.sql:94-137`, `supabase/migrations/20261110000100_grow_debt_extra_drop_unstarted.sql:399-404`
**Issue:**
- `p_payment.currency` is only checked against a regex. It is never compared with `v_debt.currency`.
- The `v_amount > v_debt.balance` check compares raw minor units.
- The trigger subtracts `abs(original_amount)` from the debt balance whatever `original_currency` is.
- `original_currency` stays patchable on transactions through `apply_patches`.

Scenario: a JPY line (0 decimals) linked to a USD debt, or a line whose currency was edited later, moves the balance by the wrong amount. The same unchecked pattern exists in `record_debt_sale` (`v_payment_amount >= v_debt.balance`, lines 335-349).
**Fix:** In both RPCs, raise when the payment currency is not `v_debt.currency`. In the trigger, apply the change only when `new.original_currency = debt.currency`. Otherwise refuse, or convert using the stamped `home_amount` rule.

#### P1-WR-04: `save_debt_plan` silently ignores a new paid-from account or start date when the amount is unchanged

**File:** `supabase/migrations/20261110000100_grow_debt_extra_drop_unstarted.sql:161-163`
**Issue:** `if p_extra > 0 and v_old_live and v_old.amount = -p_extra then v_new_series := v_old.id;` keeps the old series whenever the amount matches. The account, anchor date, name and time zone in `p_series` are discarded. The RPC still returns `applied` and stores a `debtPlanSaved` undo step.

Scenario: a user moves their $200 extra from Checking to Savings. The app reports success, and the lines keep coming out of Checking.
**Fix:** Compare `account_id` too (and the anchor day if it is user-chosen). When they differ, take the end-and-create branch, or patch the series through `edit_recurring_series_from`.

#### P1-WR-05: Undo does not refresh holdings or holding entries

**File:** `src/data/mutations/growHoldings.ts:11-12, 60-65`; caller `src/data/mutations/undo.ts:46-66`
**Issue:** The module says to "Call refreshHoldingReads after Undo", but nothing does. Repo-wide, `refreshHoldingReads` is only called inside growHoldings.ts, and `invalidateAfterUndo` does not invalidate `queryKeys.holdings` or `queryKeys.holdingLots`.

After Undo of `holdingAdded`, `holdingValueUpdated`, `holdingEntryRemoved` and similar steps, the screen keeps showing the old rows and value. The next edit is sent with the stale version and is parked as a conflict.
**Fix:** In `invalidateAfterUndo`, add:
```ts
void qc.invalidateQueries({ queryKey: queryKeys.holdings(vars.ownerId, vars.householdId) });
void qc.invalidateQueries({ queryKey: queryKeys.holdingLots(vars.ownerId, vars.householdId) });
```

#### P1-WR-06: A sale's final payment is not linked to the debt, so it is missing from the debt's payment list

**File:** `supabase/migrations/20261110000100_grow_debt_extra_drop_unstarted.sql:329-333`, `src/data/queries/growDebts.ts:1-3, 30-39`
**Issue:** `debtLinkFilter` relies on `debt_id` for "a one-off or a sale's final payment" (header comment), but `record_debt_sale` inserts the payment without `debt_id`. The line has no series link either, so the debt detail never shows the payment that closed the loan.
**Fix:** Set `debt_id = p_debt_id` on the payment insert. The follow-line trigger fires on UPDATE only, so the insert does not double-count. However, Undo (`deleted_at`) of a paid linked line would then raise the balance through the trigger, and the step's own debts restore op would raise it again. So either also run the step's line-delete ops under a flag the trigger honours, or drop the debts restore op for that case.

#### P1-WR-07: `grow_end_series` without the anchor clamp can soft-delete a debt's main payment series on a back-dated sale

**File:** `supabase/migrations/20261110000100_grow_debt_extra_drop_unstarted.sql:32-37, 340-346`
**Issue:** `record_debt_sale` now calls `grow_end_series(v_sid, v_paid_off_on)` for `v_debt.series_id` as well as the extra series. If the payment date is before that series' anchor (for example, a loan added with its first payment next month, then sold today), the main series is soft-deleted while `debts.series_id` still points at it. Other code that edits or reads the debt's payment series will treat a deleted series as live or fail.
**Fix:** Apply the drop-before-anchor rule only to `extra_series_id`. Keep the old `greatest(p_end, anchor)` behaviour for `series_id`, or end the series on its anchor and delete its first pending line explicitly.

#### P1-WR-08: A new safety net made by `save_goal_plan` never gets `net_confirmed_at`

**File:** `supabase/migrations/20261106000200_grow_goal_contributions_and_safety_net.sql:268-314`, `src/data/mutations/growGoals.ts:239-242`
**Issue:** The 0400 migration states that a net made in the app starts confirmed. However, `save_goal_plan` neither accepts `net_confirmed_at` nor sets it, so the server row reads null and "We moved your safety net here" shows for a net the user just made. The client comment acknowledges this as an owner decision. It is listed here because it contradicts migration 0400's header (point 3), which is now dead code for the RPC path.
**Fix:** In the insert branch, set `net_confirmed_at = case when v_flag then now() end`.

### Info

#### P1-IN-01: Cache version comment and value disagree

**File:** `src/data/cache/persister.ts:34-37`
**Issue:** The last comment says "bumped 5 -> 6", but the constant is `'7'`. The history of the 6 -> 7 bump is missing.
**Fix:** Add the comment line for the 7 bump.

#### P1-IN-02: Removing the only value entry leaves the holding showing the deleted value

**File:** `supabase/migrations/20261106000100_grow_schema.sql:254`
**Issue:** When no live `value` lot is left, `sync_holding_value` returns without changing the holding. Removing the seeded lot therefore leaves `holdings.value` at a figure that no longer has any history. `useEditHoldingLot().remove` allows this for `kind === 'value'` without any check.
**Fix:** Refuse removal of the last live value lot, either client-side or in `guard_holding_lot`.

#### P1-IN-03: The two `grow_check_undo_step` overloads differ only by arity

**File:** `supabase/migrations/20261106000200_grow_goal_contributions_and_safety_net.sql:163`, `supabase/migrations/20261106000300_grow_debt_plan_and_sale.sql:28`
**Issue:** Two functions share one name, `(jsonb, text, text)` and `(jsonb, text, text, boolean)`, and the 3-argument one lacks the ops check. That invites a future caller to pick the wrong overload.
**Fix:** Have the 3-argument overload call the 4-argument one with `false`, or rename one of them.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Part 2: Engine

## Phase 06: Code Review Report (part 2: pure engine)

**Reviewed:** 2026-11-10
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

### Summary

The new payoff maths (fixedPayoff, strategy, compoundSteps, estimatedCardMinimum) is bigint throughout with one half-up rounding per month, and it has explicit checks for never_clears and the month cap. I found no rounding drift there. The serious problems are in the Decide v3 change for unlocked goals (D-05, D-22). The change adds unlocked goal money in two new places: spendingOf stops fencing the goal off, and resolveSafetyNet adds it to `aboveSize`. Older paths still count the same money: `ownEnvelope` and `keptSavings`. So the same dollars are counted twice, and Decide can say "fits" when the money is not there. The goal-by-date plan also has an off-by-one that can halve the monthly amount it asks for.

### Critical Issues

#### P2-CR-01: An unlocked goal's money is counted twice when the purchase is for that goal

**File:** `src/engine/decide/v3/funds/build.ts:43` (with `src/engine/decide/v3/funds/envelopes.ts:15` and `src/engine/decide/v3/prepare.ts:302,307`)
**Issue:** `spendingOf` now drops unlocked goals from `envs`, so their saved money stays in `spending`. `ownEnvelope(inputs.envelopes, check.envelopeId)` still returns the goal's `saved`, and `prepare` builds `opening = spending + ownEnvelope + aboveSize`. If the goal is in a dedicated or untouched account, `unlockedOutside` also adds it to `aboveSize`, so it is counted twice that way as well.
Scenario: an everyday account holds $1,000. An unlocked goal G has $800 saved and is linked to that account. The check is a $1,500 purchase for G.
- Before this change: spending = $200 and ownEnvelope = $800, so opening = $1,000. The answer is not a fit.
- Now: spending = $1,000 and ownEnvelope = $800, so opening = $1,800. Decide says it fits, with $800 that does not exist.
- The dedicated-account version: G has $800 in a dedicated account. aboveSize includes $800 and ownEnvelope is also $800.

This is a wrong Decide answer, which is the project's core harm case.
**Fix:** Count the goal once. Either keep the purchase's own goal fenced off in `spendingOf` and leave it out of `unlockedOutside`, or make `ownEnvelope` return 0 for an unlocked goal:
```ts
export function ownEnvelope(envs: readonly Envelope[], envelopeId: string | null): MinorUnits {
  if (envelopeId === null) return minorUnits(0);
  const e = envs.find((x) => x.id === envelopeId);
  // 06 D-22: an unlocked goal is already counted as spare (spending or aboveSize)
  return e === undefined || e.locked === false ? minorUnits(0) : e.saved;
}
```
Add a crosscheck fixture: an unlocked goal plus a check whose `envelopeId` is that goal, run once with the goal in an everyday account and once with it in a dedicated account.

#### P2-CR-02: An unlocked goal in an untouched savings account is counted twice in low-month and runway money

**File:** `src/engine/decide/v3/safetyNet.ts:63`, `src/engine/decide/v3/judge/judge.ts:855` and `:1030` (with `keptSavings` at `judge.ts:746-750`)
**Issue:** `unlockedOutside` adds an unlocked goal kept in an `untouched` account to `net.aboveSize`. `keptSavings(accounts)` already adds the whole balance of every untouched savings account, and that balance includes the goal. Both terms are summed in `lowSavings` (line 855) and in the `runwayFacts` money (line 1030).
Scenario: an untouched savings account holds $3,000, and $2,000 of it is an unlocked goal. Low-month money and runway money now include $5,000 from that account, when only $3,000 is there. The `covered_from_savings` / `further_shortfall_runway` counts are then too high, and the low-month dip can wrongly avoid the net.
**Fix:** In those sums, leave out of `keptSavings` the unlocked-goal money that `unlockedOutside` already counted. Another option is to have `unlockedOutside` count only `dedicated` accounts, since `keptSavings` already covers untouched savings accounts. Add a fixture for this case.

#### P2-CR-03: goalPlanByDate counts a deposit that falls after the by-date, which can halve the amount needed each month

**File:** `src/engine/grow/goalPlan.ts:125-136`
**Issue:** `deposits = monthIndex(byDate) - monthIndex(anchor) + 1` looks only at the year and month. Deposits fall on the anchor's day of the month (`depositDate`). When the by-date's day comes before the anchor's day, the last deposit counted lands after the by-date.
Scenario: anchor 2026-11-20, byDate 2026-12-05, have $0, target $1,000. The code returns deposits = 2 and neededEachMonth = $500. The deposits fall on Nov 20 and Dec 20, so by Dec 5 the user has $500, and the goal is missed by half. This breaks the D-21 promise that the goal is "never missed by a cent".
**Fix:**
```ts
let deposits = monthIndex(i.byDate) - monthIndex(i.anchor) + 1;
if (deposits > 0 && depositDate(i.anchor, deposits) > i.byDate) deposits -= 1;
deposits = Math.max(1, deposits);
```
`depositDate` already clamps month ends, so a 31st anchor is compared with its clamped date.

### Warnings

#### P2-WR-01: Goal money in aboveSize makes the net_left figures too low

**File:** `src/engine/decide/v3/judge/judge.ts:683`, `src/engine/decide/v3/safetyNet.ts:116`
**Issue:** `aboveSize` now includes money that is not in the net (`unlockedOutside`). Both sums below treat it as part of `net.saved`:
- `atLow = net.saved - net.aboveSize - j.cash.used`
- `netDip`: `left = net.saved - (used + fromAbove)`

Scenario: the net has $5,000 saved, its size is $5,000, and it is unlocked. An unlocked goal holds $2,000 in a dedicated account. A 90-day dip uses $1,000 of the net, so the net is left with $4,000. `net_left` says $2,000.
`moneySource.sourceSplit` also labels the goal money as `extra_savings` ("extra savings above the net"), so `extra_savings_used {used, above}` names goal money as net surplus.
**Fix:** Keep `aboveSize` as the net's own surplus. Add a separate `unlockedOutside` field to `ResolvedNet` and add it only to the spare-money sums (prepare opening, judge 311/674/855/912/928/1030). Do not add it in `netDip` / `atLow`.

#### P2-WR-02: net_above_size and the extra_savings variant fire when protection is off or the net is below its size

**File:** `src/engine/decide/v3/safetyNet.ts:63`, `src/engine/decide/v3/judge/judge.ts:702`
**Issue:** Before this change, `aboveSize` was always 0 when the net was off or under its size (states none, small and full). Now an unlocked goal makes it greater than 0 in those states. Two things follow:
- `netStateFacts` pushes `net_above_size {above}` ("money above your net's size") while protection is off, or while the net is `small`.
- The `extra_savings` variant can now meet `no_net` / `small_net`, which the `FIT_VARIANT_ORDER` comment (D-62) says never happens.

**Fix:** Same split as P2-WR-01. Gate `net_above_size` on the net's own surplus.

#### P2-WR-03: unlocked_goals_counted states an amount that was not counted

**File:** `src/engine/decide/v3/funds/build.ts:130,198`, `src/engine/decide/v3/judge/judge.ts:968`
**Issue:** `unlockedSaved` adds up every goal with `locked === false`. Some of that money is never counted:
- A goal in an account with no stated use (`use === null`): `spendingOf` skips that account, and `unlockedOutside` needs dedicated or untouched.
- A goal linked to an account id missing from `inputs.accounts`.

Scenario: an unlocked goal holds $500 in an account with no stated use. The fact says $500 of goal money was counted as spare, but none was.
**Fix:** Compute the fact amount from the same rules that do the counting: everyday, mixed and unlinked from spendingOf, plus `unlockedOutside`.

#### P2-WR-04: The crosscheck oracle and the engine disagree on dedicated accounts

**File:** `src/engine/decide/v3/safetyNet.ts:46` (compare with `__tests__/crosscheck/plain.ts` in the same diff)
**Issue:** The engine counts unlocked goals in `dedicated` and `untouched` accounts. The independent oracle counts `untouched` only. Fixtures with a dedicated-account goal will either diverge or never be generated, so the double count in P2-CR-01 goes untested.
**Fix:** Decide which rule D-22 intends, make both sides match, and add a dedicated-account fixture.

#### P2-WR-05: monthsToReach adds a month of interest before the first deposit, which is dated today

**File:** `src/engine/grow/goalPlan.ts:87-101,120`
**Issue:** Each step earns interest first and then adds the deposit. But `depositDate(anchor, 1)` is the anchor date itself, so month 1's interest is credited on the day the plan starts.
Scenario: have $9,990, target $10,000, add $0, APR 12%. Month 1 earns $99.90, so deposits = 1 and `reachesOn` = the anchor (today). In fact a full month of interest is needed first.
The same timing understates interest whenever add > 0, because deposit 1 earns nothing in month 1.
**Fix:** Make the timing match the dates. Either add the deposit first and then earn interest (start-of-month deposits), or date the k-th step `depositDate(anchor, k + 1)`.

#### P2-WR-06: replayLots orders same-day entries by input order, so a same-day buy and sell can fail

**File:** `src/engine/grow/lots.ts:184`
**Issue:** The sort compares `localDate` only. If a buy and a sell share a date and the caller passes the sell first (for example, newest-first from the database), the result is `sell-exceeds-units`, or the realised gain is computed against the wrong basis.
Scenario: buy 10 units at $1,000 and sell 10 units at $1,100, both on 2026-11-10, with the sell given first. The holding is rejected.
**Fix:** Add a fixed tiebreak, such as buys before sells on the same day, then created_at or id. Or document and enforce the order the caller must use.

#### P2-WR-07: A sell with no units leaves the unit count unchanged

**File:** `src/engine/grow/lots.ts:211-213`
**Issue:** A sell with `units === null` reduces the basis in proportion (`valueBefore`) but leaves `units` as it was. For a holding whose buys had units, later unit sells divide the reduced basis by the old unit count.
Scenario: buy 10 units for $1,000. Sell $500 with valueBefore $1,000 and no units, so the basis is $500 and units are still 10. Then sell 5 units for $300: removed = 500 × 5 / 10 = $250, giving a gain of $50. Units should have been 5, so all $500 of basis should go and the true result is a $200 loss.
A unitless buy followed by a unit sell (the units are 0, so `sell-exceeds-units`) is also unhandled.
**Fix:** When `units > 0`, either require units on a sell, or reduce units in the same proportion: `units -= divideHalfUp(units * amount, valueBefore)`.

#### P2-WR-08: strategy budget includes the minimum of debts that are already at $0

**File:** `src/engine/payoff/strategies.ts:490-492`
**Issue:** `budget` adds up `minimum` for every debt, including those with `balance === 0` (which start as `done: 0`).
Scenario: A owes $1,000 with a $50 minimum, and B owes $0 but has a $200 minimum still recorded. The budget becomes $250 a month, which overstates the payoff speed and understates interest against the $50 the user really pays.
**Fix:** `const budget = ds.filter((d) => d.bal > 0n).reduce((s, d) => s + d.minimum, 0n) + BigInt(extra);`. Or refuse zero-balance debts at the boundary.

### Info

#### P2-IN-01: Position.putIn always equals costBasis

**File:** `src/engine/grow/lots.ts:230,235`
**Issue:** Both fields are `basis`. If "put in" was meant to be the total bought less withdrawals, it is wrong after a partial sale. If not, the second field is redundant.
**Fix:** Remove one field, or compute the total bought separately.

#### P2-IN-02: replayLots accepts negative amounts

**File:** `src/engine/grow/lots.ts:190-225`
**Issue:** A negative buy reduces the basis, and a negative sell grows it. Nothing at the engine boundary stops this.
**Fix:** Throw a RangeError (or return an error) when `amount < 0`.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Part 3: Debts, investing, calculators

## Phase 6: Code Review Report (part 3 of 5: debts, investing, calculators)

**Reviewed:** 2026-11-10
**Depth:** standard (with call-site checks into `src/data/mutations/growDebts.ts`, `growHoldings.ts`, `engine/grow/lots.ts`, `engine/payoff/strategies.ts`, `features/grow/connect/debtPoint.ts`, `features/decide/snapshot/buildSnapshot.ts`)
**Files Reviewed:** 29
**Status:** issues_found

### Summary

The pure maths files (calcModels, recordCalcModels, debtLineModel) are mostly sound. The problems are in what the screens feed them and in how they write.

- Holding gains are worked out from the holding's *current* value, so later value updates change past sales. This gives wrong put-in and gain figures.
- The Grow debt form saves a loan with a blank minimum as $0 a month, and Decide reads that $0 as the payment.
- Debt-plan writes do not move the version chain forward, so a second write made before the refetch lands is a version conflict.
- The plan buttons stay live after a save, so a second tap makes a duplicate write and a second Undo step.
- Fixed minor-unit constants and `aboutTens` ignore the currency's decimals, so non-2-decimal currencies show wrong amounts.

The known items (FAB overlap, column wrap at 1.15, "Change" landing at the top of Debts) are not repeated here.

### Critical Issues

#### P3-CR-01: Sale cost basis uses the holding's current value, so later value updates rewrite past gains

**File:** `src/features/grow/investing/useInvestingRead.ts:79` (same in `src/features/grow/investing/LotSheet.tsx:57` and `src/data/mutations/growHoldings.ts:94`)
**Issue:** Every non-value entry is given `valueBefore: minorUnits(h.value)`. `h.value` is the latest 'value' lot (server trigger `sync_holding_value`, grow_schema.sql:242-263), not the value just before the sale. `replayLots` (engine/grow/lots.ts:70-71) removes `basis * amount / valueBefore` for a sale with no units. Example:
- Put in $10,000. The value is $12,000. Sell $6,000 (simple holding, no units). The replay removes $5,000, so put-in is $5,000 and realised gain is +$1,000. This is correct.
- The user then taps Update value and types $6,000 from the next statement. `valueBefore` is now $6,000, so the replay removes the whole $10,000. Put in shows $0, realised gain shows -$4,000, and the gain line and hero totals all move.

Every later value update moves the figures again. This is a wrong money amount shown in the hero, the rows and the detail screen. It also changes `lotsReplayError` checks in the hooks.
**Fix:** Pass the value as of each entry's date: the latest 'value' lot dated on or before `l.local_date`, falling back to the opening value. Do this in one shared helper used by all three call sites.
```ts
const valueAt = (date: string) => latestValueLotOnOrBefore(lots, date) ?? h.value_at_open ?? h.value;
out.push({ ..., valueBefore: minorUnits(valueAt(l.local_date)) });
```
Alternatively, store `value_before` on the sell row when it is written.

#### P3-CR-02: Grow saves a loan with a blank minimum as $0 a month, and Decide counts $0

**File:** `src/features/grow/debts/AddDebtSheet.tsx:128,170`
**Issue:** `minimumOk = value.minimum === null || validMinor(...)`, and the add path writes `minimum_payment: value.minimum ?? 0` for every type. The engine estimate (D-28) only applies to carried cards. A loan, line or "owed" debt with no minimum therefore saves as 0. `buildSnapshot.ts:270-281` puts every non-card counted debt into Decide with `minimumPayment: minorUnits(Math.max(0, minimum))`, which is 0. Decide's own `DebtSheet.tsx:122` requires a minimum for this reason.

Failure: the user adds a $15,000 car loan from Grow and skips the minimum. Decide's verdict then leaves the payment out of the month. In Grow the loan shows no end date (fixedPayoff never clears). This directly harms the Decide answer.
**Fix:** Require a minimum for non-card debts, the same as Decide's sheet:
```ts
const minimumOk = isCard ? value.minimum === null || validMinor(value.minimum) : validMinor(value.minimum) && value.minimum > 0;
```

### Warnings

#### P3-WR-01: Debt-plan and sale writes do not advance the version chain, so a quick second write is a conflict

**File:** `src/features/grow/debts/DebtsSegment.tsx:168-201` and `src/features/grow/calculators/record/DebtExtraCalculator.tsx:110`; root cause `src/data/mutations/growDebts.ts:336-365` and `:442-482`
**Issue:** `save_debt_plan` and `record_debt_sale` bump the debt's version on the server. The mutationFns call `resolveExpectedVersion` but never `recordWrittenVersion`; they rely on `refreshDebtReads` landing first. `onMutate` patches the cache without the new version.

Example: tap "Use $50 extra", then within a second open the Minimum row and tap "Stop extra". The second write is captured with the old `debt.version`. Writes are serialised through WRITE_SCOPE, so it runs after the first and gets `status: 'conflict'`, which shows a parked failure. Offline, the second write always fails on replay. The same happens for plan save followed by Edit (AddDebtSheet), or a sale.
**Fix:** Have both RPCs return the new `version`, then call `recordWrittenVersion('debts', vars.debtId, [vars.expectedVersion, expected], res.version)` in mutationFn, as `registerSaveGrowDebt` does at line 170.

#### P3-WR-02: "Use extra" and "Use once" stay enabled after saving, so double taps write twice

**File:** `src/features/grow/debts/PayoffPlanCard.tsx:204-224`, `src/features/grow/debts/DebtsSegment.tsx:168-224`
**Issue:**
- The extra Pill is disabled only by `gated || extra <= 0`. After a save, `model.extra === extra` and the button still reads "Use $50 extra". Each tap queues another `save_debt_plan` with a new series id and a new Undo step. The toast's Undo then reverts only the last, no-op step, so the user believes the plan was undone when it was not.
- "Use $1,000 once" is the same, and each tap records another $1,000 Expected payment. `overOwed` compares against `balance`, which an Expected line does not lower, so the check never trips.
- `Pill` has no press guard. MakePlanSheet's "Make this the plan" (DebtExtraCalculator `confirm`) can also fire twice before `router.back()` unmounts the screen.

**Fix:** Disable the extra button when `extra === savedExtra && order === model.savedOrder`, showing "This is your plan". Add an in-flight ref guard to `useOnce`, `useExtra` and `confirm`. Consider disabling "once" until the read refreshes.

#### P3-WR-03: More than one debt can carry an extra, and the segment then double-counts it

**File:** `src/features/grow/calculators/record/DebtExtraCalculator.tsx:105-117`, `src/features/grow/debts/DebtsSegment.tsx:122,157-180`
**Issue:** D-34 says one debt carries the extra. DebtExtraCalculator saves `extra` on the debt it was opened for, ignoring an existing carrier.
- Debt A carries $50 and the user sets B to +$25 in the calculator. `model.extra` is now $75 (useDebtsRead:231, which sums).
- The segment stepper starts at $75. "Use $75 extra" writes $75 onto carrier A, leaving B at $25, so the real total is $100.
- "Stop extra" only zeroes A. B keeps $25, and Stop shows again.

**Fix:** When saving from the calculator, clear the extra on any other carrier in the same call (or route through the segment's carrier). Alternatively, make the segment stepper start from and write to the carrier's own `extra`, not the sum.

#### P3-WR-04: Fixed minor-unit constants and `aboutTens` ignore currency decimals

**File:** `src/features/grow/debts/PayoffPlanCard.tsx:24-26,93,96`; `src/features/grow/debts/useDebtsRead.ts:29-30`; `src/features/grow/debts/DebtDetailScreen.tsx:261`
**Issue:**
- `aboutOf` and `lessText` call `aboutTens(x)` with the default exponent 2. For JPY that rounds to the nearest ¥1,000 instead of ¥10. DebtDetailScreen passes `exp` correctly, so the two screens show different "about" figures for the same plan.
- `EXTRA_STEP = 2500`, `ONCE_CHIPS = [50000, 100000, 250000]`, `DEFAULT_EXTRA = 5000` and `DEFAULT_LUMP = 100000` are minor units. For JPY they become a ¥25 step, ¥500/¥1,000/¥2,500 chips and "Use ¥5,000 extra". For a 3-decimal currency they are 10x too small.
- The note floor `fmt.money(2500, cur)` has the same problem.

The detail chips (`units * 10 ** exponent`) do this correctly.
**Fix:** Express these in major units and scale with `10 ** currencyExponent(currency)`. Pass `currencyExponent(currency)` to `aboutTens` in PayoffPlanCard.

#### P3-WR-05: The debt-payment share mixes the plan currency with Decide's pay currency

**File:** `src/features/grow/debts/DebtsSegment.tsx:151`, `src/features/grow/debts/AddDebtSheet.tsx:137-140`, `src/features/grow/debts/PayoffPlanCard.tsx:343`
**Issue:**
- `monthly` and `others + newMinimum` are in `planCurrency` (the currency with the most owed). `month.usualPay` and `month.left` are in `month.currency` (the snapshot's currency). If a user's EUR loan is the largest debt and pay is in USD, the share percent and the over-rule badge compare EUR cents to USD cents.
- `leftNote` formats a USD `left` with the EUR symbol.
- AddDebtSheet also adds a new debt's minimum (in `debt.currency` or home) to plan-currency totals.

**Fix:** Convert to `month.currency` with the stored rates (as useInvestingRead does), or hide the line card and leftNote when `planCurrency !== month.currency`.

#### P3-WR-06: Some debt edits are silently dropped or leave stale fields

**File:** `src/features/grow/debts/AddDebtSheet.tsx:183-187`
**Issue:**
- Clearing the minimum on a carried card (to go back to the estimate, which is how D-28 represents it) is ignored, because `value.minimum !== null` is required. The form is dirty and Save is enabled, but no fields change, so the sheet closes with no write and no message.
- Switching an existing card from "No" to "Yes" (paid in full) never clears `apr` or `minimum_payment`, because both are guarded by `!paidInFull`. useSaveGrowDebt's own doc says a paid-in-full card is saved with no rate and no minimum (the add path does this). Switching back later revives the old figures.
- Clearing a paid-in-full balance (`value.balance === null`) is also dropped.

**Fix:**
```ts
if (isCard && carried && value.minimum === null && debt.minimum_payment !== 0) fields.minimum_payment = 0;
if (paidInFull && debt.pays_in_full !== 'yes') { fields.apr = null; fields.minimum_payment = 0; }
```

#### P3-WR-07: Derived line names can exceed the 80-character limit, so the sale and one-off always fail

**File:** `src/features/grow/debts/SaleSheet.tsx:457-458`, `src/features/grow/debts/DebtsSegment.tsx:213`
**Issue:** Debt names may be up to 80 characters (AddDebtSheet NAME_MAX). The templates add text to them: `'{{name}} final payment'` adds 14 characters and `'One-off payment · {{name}}'` adds 18. `useRecordDebtSale` and `useRecordDebtOneOff` throw `RangeError` when a name is over 80 characters (growDebts.ts:522, :620). So a debt named with 67 or more characters can never record a sale, and one with 63 or more can never record a one-off. The user only sees "Save failed".
**Fix:** Truncate `name` before interpolation, e.g. `truncate(debt.name, 80 - templateOverhead)`. Alternatively, clamp the final string to 80 characters with an ellipsis in the hook.

#### P3-WR-08: Editing a foreign-currency holding uses home-currency inputs, and the growth link passes a foreign amount

**File:** `src/features/grow/investing/AddHoldingSheet.tsx:369-376,404-411`; `src/features/grow/investing/HoldingDetailScreen.tsx:229`
**Issue:**
- In edit mode the put-in and each-month `MoneyInput`s use `rc.homeCurrency`, not `editing.currency`. A USD holding edited with a JPY home currency parses "100" as 100 minor units ($1.00) and shows the ¥ symbol.
- "See growth" on a holding passes `holding.value`, which is in the holding's currency, to GrowthIllustration. GrowthIllustration formats it with `useCalcFormat` (home currency), so a €10,000 holding is illustrated as $10,000.

**Fix:** Use `editing?.currency ?? rc.homeCurrency` for the edit inputs. Convert the value with `toHome` before pushing the route, or pass the currency as a param.

#### P3-WR-09: Refused writes and impossible dates fail with no message

**File:** `src/features/grow/investing/HoldingDetailScreen.tsx:162-167`; `LotSheet.tsx:114-116,132-134`; `AddHoldingSheet.tsx:310-312,338-340`; `UpdateValueSheet.tsx:305-307,315-317`; date checks at `LotSheet.tsx:86`, `AddHoldingSheet.tsx:280`
**Issue:**
- Removing a buy that a later sale depends on is refused by `lotEdit.remove`. The confirm sheet closes, nothing happens and nothing is said.
- The form catch blocks assume the form blocked every case, but the hooks also refuse values over `validMinor`'s cap and replay breaks on edit (AddHoldingSheet does not pre-check `lotsReplayError`). In those cases Save does nothing.
- The date fields accept any `\d{4}-\d{2}-\d{2}`, so `2026-02-31` passes both the form and the hook regex. The server then rejects it, which shows as a parked failure after the toast already said "added".

**Fix:** Show a refusal toast in each catch (`grow.common.saveFailed` or the specific replay message). Validate dates as real calendar dates, or use the `DateField` picker as SaleSheet does.

#### P3-WR-10: Cached data is hidden when a background refetch fails; Investing goes blank

**File:** `src/features/grow/investing/InvestingSegment.tsx:109`; `src/features/grow/investing/useInvestingRead.ts:185-186`; `src/features/grow/debts/useDebtsRead.ts:330`
**Issue:** `status` is 'error' whenever `isError` is true. TanStack keeps `data` and sets `isError` when a *refetch* fails (a 5xx, or a flaky network that does not pause the query). The persisted cache is then hidden:
- InvestingSegment returns `null`, which is an empty segment with no error copy and no retry; `read.refetch` is never used.
- DebtsSegment replaces the user's debts with the error card.

**Fix:** Return 'ready' when data is present (`data !== undefined ? 'ready' : isError ? 'error' : 'loading'`). Give InvestingSegment the same error card and Try again as DebtsSegment.

#### P3-WR-11: A debt's end date differs between the list and its detail screen

**File:** `src/features/grow/debts/DebtDetailScreen.tsx:144-149` vs `src/features/grow/debts/useDebtsRead.ts:236-249`
**Issue:** The list row uses `endDate`. With a saved extra, `endDate` comes from the plan's `strategy` run, which includes the extra and minimums rolled over from cleared debts. With no due day it falls back to today's day. The detail "Ends" and "Interest left" use `point.payoffDate` and `point.totalInterest` (debtPoint.ts:53-56). Those are this debt's own minimum plus its own extra, with no rollover, and they are null without a due day.

So with two debts and a saved extra on A, debt B's row says "ends Mar 2029" and its detail says "Ends Nov 2031". With no due day, the row shows a date and the detail shows none.
**Fix:** Show `line.endDate` on the detail screen. Derive interest left from the same run, or label the detail figure as "on its own payment".

#### P3-WR-12: Initial form state is captured before data loads

**File:** `src/features/grow/calculators/record/GoalCalculator.tsx:70`; `src/features/grow/debts/SaleSheet.tsx:35-36`
**Issue:**
- GoalCalculator seeds `firstText` from `currentMonthly` in the first `useState`, while `point` may still be null (cold start or deep link). The early return comes after the hooks, so once data arrives the "Each month" field stays blank and the result card shows nothing.
- SaleSheet computes `defaultAccount` once at mount. If `useAccounts` has not resolved and the debt has no `account_id`, `accountId` stays null. With exactly one account the picker is hidden (`accounts.length > 1`), so `account === null`, `canSave` is false and the user has no way to fix it.

**Fix:** Seed in an effect when data first arrives, guarded by a "touched" ref. For SaleSheet, derive `account` as `value.accountId ?? defaultAccount` at render time instead of freezing it in state.

#### P3-WR-13: The goal record link can open a calculator that shows "not found"

**File:** `src/features/grow/calculators/record/useRecordLinks.ts:139-151`; `src/features/grow/calculators/record/GoalCalculator.tsx:108`
**Issue:** The link picks the first goal with a target and does not check its currency. GoalCalculator refuses `row.currency !== calc.currency` and shows "not found". A user whose first goal is in another currency always gets a dead link. The link's sublabel also formats the goal's figures with the home currency.
**Fix:** Pick the first goal whose row currency equals the home currency (the goals read model needs to expose `currency`), or skip the link.

#### P3-WR-14: The extra-payment calculator shows nothing when the current payment never clears the debt

**File:** `src/features/grow/calculators/record/recordCalcModels.ts:300`; `src/features/grow/calculators/record/DebtExtraCalculator.tsx:144-226`
**Issue:** `debtExtraModel` returns null whenever the base (no extra) run does not clear. For a debt whose payment is below its monthly interest, every chip (including +$100, which may clear it) shows no result. The page shows only the chips and the footer, with no sentence saying why. This is the case where the calculator matters most.
**Fix:** Return the with-extra result when it clears and set `interestSaved` and `soonerMonths` to null when the base does not. Show a plain line such as "At the current payment this debt does not clear" when neither clears.

### Info

#### P3-IN-01: The order cards in DebtExtraCalculator show the same figures twice

**File:** `src/features/grow/calculators/record/DebtExtraCalculator.tsx:132-142,209-212`
**Issue:** Both `orderCard('rate')` and `orderCard('balance')` render the same single-debt `result`, so the two orders always look identical, whatever the other debts are.
**Fix:** Drop the cards, or compute both orders with `strategy` across the plan.

#### P3-IN-02: Some radiogroups have no accessibility label

**File:** `src/features/grow/debts/DebtDetailScreen.tsx:271`; `src/features/grow/debts/PayoffPlanCard.tsx:305`; `src/features/grow/calculators/record/DebtExtraCalculator.tsx:165`
**Issue:** `accessibilityRole="radiogroup"` is set with no `accessibilityLabel`, so screen readers announce an unnamed group.
**Fix:** Add a label (for example the section title).

#### P3-IN-03: Holding removal is not wrapped in try/catch

**File:** `src/features/grow/investing/HoldingDetailScreen.tsx:147`; `src/features/grow/investing/InvestingSegment.tsx:70`
**Issue:** `remove()` throws `RangeError` for an already-removed row (growHoldings.ts:396). Unlike the debt screens, these calls are not wrapped, so a race during an optimistic remove or undo throws out of the press handler. DebtDetailScreen:206 also calls `router.back()` even after a refusal.
**Fix:** Wrap in try/catch with a refusal toast, matching DebtsSegment.

#### P3-IN-04: AddHoldingSheet's dirty check ignores the "regular amount" toggle

**File:** `src/features/grow/investing/AddHoldingSheet.tsx:276-277`
**Issue:** `regular` is not in `initial` or `dirty`. Turning it off clears the monthly amount on save, but dismissing the sheet does not warn.
**Fix:** Add `regular` to both objects.

#### P3-IN-05: The debt payoff calculator shows empty order cards when the minimums never clear

**File:** `src/features/grow/calculators/typed/DebtPayoffCalculator.tsx:58-76`
**Issue:** With `outcome !== 'cleared'`, each card shows only its title and detail, with no sentence saying the debts do not clear.
**Fix:** Render a `never_clears` / `exceeds_month_cap` line.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Part 4: Goals, safety net, Grow home

## Phase 6: Code Review Report (part 4 of 5: rest of src/features/grow)

**Reviewed:** 2026-11-10
**Depth:** standard (callees in `src/data/mutations/growGoals.ts`, `src/engine/decide/pots.ts`, `src/engine/transfer/pair.ts` and the `guard_savings_goal` / `confirm_goal_contribution` SQL traced where a screen depends on them)
**Files Reviewed:** 47
**Status:** issues_found

### Summary

The pure connection points (`connect/*`, `netWorth.ts`) are sound. The defects are in the screens around them:

- Two Add/Take paths throw inside `onPress`, which crashes the app.
- The "Each month" plan edit never updates `ready_by`. Decide's set-aside for a pot is based only on `ready_by`, so Decide keeps using the old plan while Grow shows the new one.
- The goal screens mix home-currency `saved` with goal-currency `target`, `monthly` and line amounts.
- Edits to Wait goals are silently thrown away by the server guard.
- Several stale-state and Undo problems: the Reached badge stays after Undo, the Confirm button stays tappable after a confirm, Undo of a money rule does not put back the figures it cleared, and the "We moved your safety net" sheet comes back after "Change it".

Accepted items were not reported: the first Continue tap in the goal form only closes the keyboard, and a goal can be kept in the same account it is paid from. P4-CR-01 is a different case: in that set-up the move sheet crashes.

### Critical Issues

#### P4-CR-01: Add money / Take some out crashes when the only account in the goal's currency is the goal's own account

**File:** `src/features/grow/goals/MoneyMoveSheet.tsx:76`, `:84`, `:99`
**Issue:** `other` falls back to `accounts[0]`, which can be the goal's own account: `accounts.find((a) => a.id !== goal.account_id) ?? accounts[0]`. `ready` does not check `other.id !== goal.account_id`. `useMoveGoalMoney.move()` then calls `buildTransferLegs` with `from === to`. That returns `{ ok: false, error: 'same-account' }` (`engine/transfer/pair.ts:41`), and `move` throws `TypeError('move goal money: invalid transfer (same-account)')` (`growGoals.ts:652`). Nothing catches the error inside the Pill `onPress`, so a production build has a fatal JS error.
Scenario: the user has one GBP account, makes a goal kept in it (this set-up is accepted as valid), opens the goal, taps Add money, types 50 and taps "Add £50". The app crashes. The same happens on the safety-net screen.
**Fix:** Exclude the goal account from the fallback and block the button when no other account exists:
```ts
const other = accounts.find((a) => a.id === pickedId && a.id !== goal.account_id)
  ?? accounts.find((a) => a.id !== goal.account_id) ?? null;
const ready = valid && other !== null && other.id !== goal.account_id && !needsGoalAccount && (goal.account_id === null || goalAccount !== null);
```
Show a "No other account in {currency}" line when `other === null`. As a second guard, wrap `move(...)` in try/catch and show an info toast.

#### P4-CR-02: Add money crashes when the Transfer category is not loaded (or missing)

**File:** `src/features/grow/goals/MoneyMoveSheet.tsx:62`, `:84`, `:108`
**Issue:** `categoryId: cats.transferCategoryId` is `string | null`, and it is `null` while `useCategoryLookup` is loading, on an error, or offline with an empty cache. `move()` throws `TypeError('move goal money: the Transfer category is required')` (`growGoals.ts:638`) whenever the goal has an account. `ready` does not check the category, so tapping the primary button throws inside `onPress` and crashes the app.
Scenario: fresh install, or cache cleared and offline. The user opens a goal kept in an account and taps Add money, then Add. The app crashes.
**Fix:** Add `cats.transferCategoryId !== null || goal.account_id === null` to `ready`, and catch errors thrown by `move` as in P4-CR-01.

#### P4-CR-03: Changing "Each month" (and editing the target) leaves `ready_by` stale, so Decide sets aside for the old plan

**File:** `src/features/grow/goals/GoalPlanEditSheet.tsx:269`; `src/features/grow/goals/NewGoalSheet.tsx:176`
**Issue:** In "monthly" mode the save writes `{ monthly_amount: value }` only. For a `pot` with a target, Decide's set-aside ignores `monthlyAmount`: `potSetAside` returns `remaining / wholeMonths(asOf, readyBy)` (`engine/decide/pots.ts:65-68`). `ready_by` is set from the monthly amount only when the goal is made (`NewGoalSheet.tsx:137`). The Grow detail screen recomputes "Reaches" from `monthly_amount` (`GoalDetailScreen.tsx:123`). Grow and Decide therefore show two different plans for the same goal.
Scenario: a £1,200 holiday goal at £100/month gets `ready_by` about 12 months out. The user changes Each month to £300. Grow says "Reaches in 4 months". Decide still sets aside about £100 a month, so its answer for a new purchase counts £200 a month as spare that the user has committed to the goal. That is a wrong Decide answer. Editing the target in NewGoalSheet edit mode (`:176`) has the same problem: the old date is kept and the monthly is recomputed differently in each place.
**Fix:** In monthly mode, also write `ready_by` from `planFromMonthly(...).reachesOn`, using `lastDayOfMonth(reachesOn.slice(0,7))`, or `null` when it is never reached. This is the same rule `NewGoalSheet` uses on create. In edit mode, recompute `ready_by` (or `monthly_amount`) whenever `target` changes.

### Warnings

#### P4-WR-01: Goal screens mix home-currency `saved` with goal-currency target, monthly and line amounts

**File:** `src/features/grow/goals/GoalDetailScreen.tsx:117-123, 164, 178-190, 281, 311, 318`; `src/features/grow/goals/NewGoalSheet.tsx:64, 153, 159-160`; `src/features/grow/goals/GoalPlanEditSheet.tsx:253-257`; `src/features/grow/goals/MoneyMoveSheet.tsx:94, 187`; `src/features/grow/home/useGoalMoney.ts:13`
**Issue:** `point.saved` comes from `goalSaved`, which is home-currency minor units (`connect/goalSaved.ts:131`). The screens compare and combine it with `row.target`, `row.monthly_amount`, history `original_amount` and `opening_saved`, which are all in the goal's own currency. They then format everything with `useGoalMoney`, which always uses the home currency.
- `goalPercent(saved, target)`, `reached`, `planFromMonthly`, `targetBelowSaved` (NewGoalSheet `saved` is documented as goal currency but gets home units) and the locked-take "after" amount (`saved - amount`) are all wrong.
- A goal in EUR with home USD shows "$1,000 of $1,000" when €1,000 was saved against a €1,000 target. The target check may refuse a valid target or let one through that is below what is saved.

This happens to any goal after the user changes their home currency, and to migrated pots stored in another currency. `safetyNetPointOf` already special-cases this (P4-CR-03 in that file).
**Fix:** On the detail, plan and move screens, use one currency. Either convert `target`, `monthly_amount` and history amounts with the same `toHome` before using them, or compute a goal-currency `saved` (`goalSaved` with the identity `toHome` for the goal's currency) and format with `currencyCode(row.currency)`. Pass goal-currency `saved` to `NewGoalSheet` and `useEditGoal`, as their contracts say.

#### P4-WR-02: Edits to Wait goals are silently thrown away by the server

**File:** `src/features/grow/goals/GoalDetailScreen.tsx:166-213, 318`; `src/features/grow/home/GoalsSegment.tsx:161, 179`
**Issue:** `goalPointsOf` lists `kind: 'wait'` goals. The detail screen offers Edit, "Each month" and "Reaches" for them, and the Goals segment's row menu offers Edit. For Wait goals, `guard_savings_goal` (`20261106000100_grow_schema.sql`, `elsif not v_rpc`) resets `name`, `target`, `monthly_amount`, `ready_by` and `opening_saved` to their old values without raising an error. The client queues `save_goal_plan`, shows "Plan changed" with Undo, and the server keeps the old values. After the refetch, the user's edit has disappeared without any message.
**Fix:** Hide or disable Edit and the plan rows when `row.kind === 'wait'` (the lock toggle already checks `row.kind === 'pot'`), and point the user to the Decide check that owns the goal. Alternatively, raise an error in `save_goal_plan` for `kind <> 'pot'` so the failure shows.

#### P4-WR-03: The goal detail screen shows a loading skeleton forever when the goal is done, deleted, or cannot be converted

**File:** `src/features/grow/goals/GoalDetailScreen.tsx:79-82, 106-115`
**Issue:** `point` is `null` whenever `goalPointsOf` skips the row: `done_at` is set, or a rate is missing so `goalSaved` returns `null`. `row` is `null` when the goal was deleted, for example by a household partner, by Undo of "goal made", or by a remove on another screen. Both cases fall into the "loading" branch, which never resolves, and there is no error message or way back other than the header.
**Fix:** Show "loading" only while `rowsQ.isLoading || read.status === 'loading'`. When `row === null` after the rows have loaded, show a "This goal was removed" state. When `point === null` with a live row, show the row with a "can't convert {currency}" note, or a done state.

#### P4-WR-04: The Reached badge stays after the deposit is undone

**File:** `src/features/grow/goals/GoalDetailScreen.tsx:75, 127-129, 186`
**Issue:** `justReached` is set to `true` when a move reaches the target and is never reset. If the user taps Undo on the "Reached" toast, the deposit is reverted and `saved < target`, but `{justReached ? <ReachedMoment /> : ...}` keeps showing the green "Reached" badge and tick until the screen unmounts.
**Fix:** Render the moment only while it is true: `justReached && reached ? <ReachedMoment/> : reached ? <StateBadge .../> : null`. Or clear `justReached` when `reached` becomes false (`useEffect(() => { if (!reached) setJustReached(false); }, [reached])`).

#### P4-WR-05: Confirm and Add money do not update the goal reads, so the user can repeat them

**File:** `src/features/grow/goals/GoalDetailScreen.tsx:151-155, 276-288`; `src/features/grow/safetyNet/SafetyNetScreen.tsx:134-138`; `src/features/grow/goals/MoneyMoveSheet.tsx:109`
**Issue:** The history and the saved figure come only from `useGoalLines` (`['transactions', hh, 'goal-lines', ids]`). The confirm and move mutations patch only the month caches in `onMutate` (`growGoals.ts:548-555, 751-756`) and refresh goal lines in `onSuccess`. Until the server replies, and forever while offline (the mutation is paused), the line keeps its "Confirm" button and the saved figure does not change.
- A second tap on Confirm queues another `confirm_goal_contribution` for the same line. The server raises "only an Expected goal line can be confirmed", so `parkFailure` records a failed write. The user also got a second "Confirmed" toast whose Undo points at a step that was never stored.
- For Add money, the saved figure does not move. A user who thinks the add failed adds again, and the money is moved twice. `reachedTarget` is also computed from the stale `linesQ.data`.

**Fix:** In both `onMutate`s, also patch every loaded `goalLines` query: set the line's status to `paid` on confirm, and append the tagged leg on move. Roll back in `onError`. As a cheaper guard, keep a `confirmingIds` set in the screen and hide Confirm for lines already sent.

#### P4-WR-06: "Change it" on the first-open safety-net sheet never confirms, so the sheet returns every launch

**File:** `src/features/grow/safetyNet/FirstOpenNetSheet.tsx:456-467`; `src/features/grow/safetyNet/NetSizeSheet.tsx:132-133`
**Issue:** Only "Looks right" calls `useConfirmSafetyNet`. "Change it" opens `NetSizeSheet`, whose edit path writes only `target`/`protect`, and then `dismiss()` hides the sheet for this session only. `net_confirmed_at` stays `null`, so `needsNetConfirm` is true again on the next cold start. The user is asked "We moved your safety net here" again after already choosing a new size.
**Fix:** After a successful save from the "Change it" path, call `confirm(row, userId)` as well. A clean way is an `onSaved` callback on `NetSizeSheet` that `FirstOpenNetSheet` uses to confirm.

#### P4-WR-07: Money-rule Undo does not put back the settings figures the save cleared

**File:** `src/features/grow/lines/LineSheet.tsx:268, 283-288`
**Issue:** When `settings.currency !== currency` (the `foreign` case), saving an investing or saving rule goes through `stampSettingsPatch`. That clears every column in `SETTINGS_MONEY_COLUMNS` (reserve, the other floor, rough_income/spending/saving/debt/invest, steady_amount, everyday_override, …) in the same write. The Undo patch is `{ [column]: storedMoney }`, and `storedMoney` is `null` in the foreign case, so Undo restores none of the cleared figures. These columns feed Decide's setup answers, so "Undo" leaves Decide with the user's income and spending figures wiped.
**Fix:** Build `previous` from every money column (and `currency`) in `settings` before the save when `stampSettingsPatch` will switch currency, and replay that whole patch on Undo. Alternatively, warn before saving in the foreign case and do not offer Undo.

#### P4-WR-08: Move sheet stays disabled with no explanation when the goal's account is archived, in another currency, or not set (Take)

**File:** `src/features/grow/goals/MoneyMoveSheet.tsx:67-68, 83-84`
**Issue:** `accounts` filters out archived accounts and accounts in other currencies, so `goalAccount` becomes `null` when the goal's account is archived. `ready` then needs `goal.account_id === null || goalAccount !== null` and is false for good. For Take, `needsGoalAccount` disables the button when the goal has no account. In both cases the user sees only a greyed "Add $50" or "Take $50 out" and has no way forward inside the sheet. For a locked goal or the safety net, this means the money can never be taken out from Grow.
**Fix:** When `!ready` because of the goal account, show a line ("This goal's account is archived. Choose where it is kept.") with a button that opens `NetAccountSheet`.

#### P4-WR-09: Edit-mode discard check ignores target, icon and lock changes

**File:** `src/features/grow/goals/NewGoalSheet.tsx:152, 166`
**Issue:** In edit mode, `dirtyNow` only checks the name, `monthlyText` and `byText`. The last two are never shown in edit mode. If the user changes the target, the icon or the lock and then swipes the sheet down or taps Close, `tryClose` closes it at once and the changes are lost without the discard prompt.
**Fix:** In edit mode, include `target !== goal.target`, `noTarget !== (goal.target === null)`, `icon !== (goal.icon ?? null)` and the lock change in `dirtyNow`.

### Info

#### P4-IN-01: Rule amounts use a hard-coded 2-decimal check

**File:** `src/features/grow/lines/GrowLinesScreen.tsx:120-121`
**Issue:** `minor % 100 === 0` decides "whole amount". For 3-decimal currencies (BHD, KWD), 1500 minor (1.5 BHD) passes the check and is formatted by the whole-unit formatter, so a rounded figure is shown. `GoalDetailScreen.tsx:163` already does this correctly with `currencyExponent`.
**Fix:** `minor % 10 ** currencyExponent(currency) === 0`.

#### P4-IN-02: The goal icon the user picks is never shown

**File:** `src/features/grow/home/GoalRow.tsx:282`; `src/features/grow/connect/types.ts:233-247`
**Issue:** `NewGoalSheet` saves `icon`, but `GoalPoint` has no icon and `GoalRow` always draws `calendar` or `checkbuy`. The detail screen draws no icon either.
**Fix:** Carry `icon` on `GoalPoint`, or read the row, and pass it to `GrowGlyph`.

#### P4-IN-03: The NetMonthSheet day stepper is announced as "Due day"

**File:** `src/features/grow/safetyNet/NetMonthSheet.tsx:316`
**Issue:** `accessibilityLabel={t('grow.debts.add.dueDay')}` is a debt string. A screen reader announces the safety net's record day as a debt due day.
**Fix:** Add and use a `grow.safetyNet.eachMonthSheet.day` key.

#### P4-IN-04: `changeRowLabel` has English copy built into the code

**File:** `src/features/grow/ui/ChangeRows.tsx:155-157`
**Issue:** `` `${row.label}, from ${...} to ${...}` `` is not translated, so other locales hear English "from … to".
**Fix:** Use a `t('grow.calc.changeRowA11y', { label, before, after })` key.

#### P4-IN-05: LinkedPairFields never announces the derived value on Android

**File:** `src/features/grow/ui/LinkedPairFields.tsx:43`
**Issue:** The announcement runs on iOS only, and unlike `CalcResultCard` there is no `accessibilityLiveRegion` on Android. TalkBack users never hear the "Reaches …" or "… each month" value that changes as they type.
**Fix:** Add a visually hidden `Text` with `accessibilityLiveRegion="polite"` that carries `settled`, as `CalcResultCard` does.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Part 5: Routes, record, Decide and other files

## Phase 6: Code Review Report (part 5 of 5)

**Reviewed:** 2026-11-10
**Depth:** standard (Phase 6 diff only for en.ts)
**Files Reviewed:** 56
**Status:** issues_found

### Summary

I reviewed the Phase 6 diff (0b7c97ae..HEAD) for the route files, the Decide snapshot builders, the Activity debt filter, the goal-line "mark paid" routing, AccountSheet's new rate field, the Undo toast map, the setup-to-Grow links, the theme tokens and the en.ts copy. I traced the code into `src/features/grow/connect`, `src/data/mutations/growGoals.ts` and the Phase 6 migrations to check what reaches Decide.

The most serious problem is the counting rule for goal-linked series in `buildV3Inputs`. The rule assumes the goal is live. Removing a goal leaves its monthly series running, and after that Decide counts the series' outflow nowhere. The same removed goal also leaves its Expected lines stuck: every "mark paid" path now refuses them. Other problems:
- Goal lines can still be marked paid with a plain status patch from Account detail.
- The "See all in Activity" debt filter shows only one month.
- The account rate field rejects comma decimals.
- The growth prefill reads foreign-currency minor units as home currency.
- Asset sales and payoff payments reach Decide as income and everyday spending.

The en.ts copy has no "advice", "recommendation" or "you should" wording. All the Undo toast label keys it maps are in `UNDO_LABEL_KEYS`. The route `id` params are only used for in-memory lookups, so a bad id shows "not found" and does not cause a bad query.

### Critical Issues

#### P5-CR-01: A removed goal's monthly series disappears from Decide, and its Expected lines can never be marked paid

**File:** `src/features/decide/snapshot/v3/buildV3Inputs.ts:367`, `:449`, `:462`. The same root cause hits `src/features/record/activity/useRowActions.ts:128-132`, `src/features/record/entry/OccurrenceActions.tsx:79-83` and `src/features/record/entry/TransactionSheet.tsx:563-578`.

**Issue:** `goalLinkedSeries` collects every series with `goal_id != null`, whether or not the goal is still live:
```ts
const goalLinkedSeries = new Set(source.series.filter((r) => r.goal_id != null).map((r) => r.id));
```
These series are then removed from `bills` (line 449) and from the Savings series (line 462), on the grounds that "the goal's monthly amount carries them". That only holds while the goal is live. `goalPointsOf` drops a goal once it has `deleted_at` or `done_at` set, so after that nothing carries the series.

Removing a goal (`useEditGoal().remove`, `growGoals.ts:460-475`) is a plain `deleted_at` patch on `savings_goals`. It does not end the series. The FK is `on delete set null`, which only applies to a hard delete, so the series keeps `goal_id`, and `materialise_series` keeps writing goal-tagged Expected lines.

Failure scenario:
1. The user has a goal with a $500/month plan from checking.
2. They remove the goal in Grow, or from the Goals segment.
3. The series still produces a $500 pending line each month.
4. Decide drops the series from bills because it is goal-linked. It does not count the goal's `monthlyAmount` because the goal is not live. Its pending lines are series lines, so they are skipped as one-offs too (`buildSnapshot.ts:444`).
5. Result: $500/month of real future outflow is counted nowhere. Decide overstates what the user can afford, which is the Core Value harm.

The same line also cannot be paid:
- `isGoalLine` and `goalIdOfLine` still return the dead goal id, so Mark paid in Activity, in OccurrenceActions and through the TransactionSheet "Paid" status all go to `useGoalLinePay`.
- `fetchSavingsGoals` filters `deleted_at is null`, so the goal is never found.
- The user sees "This line's goal hasn't loaded yet … Try again in a moment" on every try.
- Bulk Mark paid silently leaves the line out (`ActivityScreen.tsx:230`).
- Even if the client sent it, `confirm_goal_contribution` rejects a deleted goal (migration `...0200`, line 523).

**Fix:** Count a series as goal-carried only while its goal is live, and treat a line of a dead goal as a plain line.
```ts
const goalLinkedSeries = new Set(
  source.series.filter((r) => r.deleted_at === null && isLiveGoal(r.goal_id)).map((r) => r.id)
);
```
In `goalIdOfLine` and `isGoalLine` callers, pass the live goal ids, or check `goals.some(g => g.id === goalId)` before taking the confirm path, and fall back to `markPaid` otherwise. Separately, goal removal (and done) should end the goal's contribution series in the same step, the way `save_goal_plan` does with `series = null`. Otherwise the materialiser keeps writing goal-tagged lines for a goal that no longer exists.

### Warnings

#### P5-WR-01: Account detail "Mark paid" still flips a goal's Expected line with a plain status patch

**File:** `src/features/record/accounts/AccountDetailScreen.tsx:66-73`. The pattern was introduced in `useRowActions.ts:128-132`.

**Issue:** Phase 6 sends every "mark paid" on a goal line through `confirm_goal_contribution`. The comments in `useRowActions.ts` and `OccurrenceActions.tsx` say "never by a plain status patch". `AccountDetailScreen.onMarkPaid` was not updated: it calls `markPaid(row, ...)` directly, and the server has no guard against it. The statement-import `markPaid` matcher (`importFinalize.ts:241`) has the same gap.

Failure scenario:
1. On an account's detail screen, the user taps Mark paid on the goal's Expected $200 line.
2. The line becomes paid, single-leg, still tagged with `goal_id`, and no transfer is created.
3. `goalSaved` adds `abs(200)` to the goal. `roleOf` marks it `envelope_deposit`. But the money never reached the goal's account.
4. If they later reopen and confirm it, the toast flow does not match. The goal's saved amount and the real account balances drift apart.

**Fix:** In `AccountDetailScreen`, use the same branch as `useRowActions.pay`:
```ts
const goalId = isGoalLine(row, seriesById) ? goalIdOfLine(row, seriesById) : null;
if (goalId !== null) { payGoalLine(row, goalId); return; }
```
Exclude goal lines from the import mark-paid matcher too. Better, add a server-side check that refuses `status: 'paid'` through `apply_patches` on a single-leg row with `goal_id` set.

#### P5-WR-02: "See all in Activity" for a debt shows only the selected month

**File:** `src/features/record/activity/useActivityViewModel.ts:821-828`, `:849-853`

**Issue:** The debt filter runs on `monthView.rows`, the loaded month. The arrival effect forces `setScope('month')` and closes search, so `flat` is false. `DebtDetailScreen.tsx:347` navigates with only `{ debt }`.

Failure scenario: a loan paid on the 1st, and the user opens "See all in Activity" on the 20th of a month whose payment is in last month's list, or whose selected month in Activity is one where nothing was paid. The list comes up empty under the debt chip, even though the debt has a year of payments. The row is labelled "See all", but it shows one month at most.

**Fix:** When `debtId` is set, show all months, either through the server search path with no term or a dedicated `debt_id` / `recurring_series_id` query. Or rename the link and open it on the month of the latest matching line.

#### P5-WR-03: Account interest rate rejects a comma decimal ("4,5")

**File:** `src/features/record/accounts/accountRate.ts:10-18`, used at `AccountSheet.tsx:529`

**Issue:** `validRateInput` passes the raw text to `percent()`, whose pattern is `^\d{1,4}(\.\d{1,10})?$`. The field uses `keyboardType="decimal-pad"`, and on a comma-decimal locale (de, fr, es, …) that keyboard types `,`.

Failure scenario: a German user types `4,5`. They see "Enter a rate from 0 to 100, like 4.5.", Save is disabled, and they cannot save the account at all until they clear the field. Every other rate input in the phase normalises the comma first (`AddDebtSheet.tsx:54`, `debtLineModel.ts:68`, `calcModels.ts:52`).

**Fix:**
```ts
const norm = (text: string) => text.trim().replace(',', '.');
export function validRateInput(text: string) { const s = norm(text); if (s === '') return true; try { percent(s); return Number(s) <= 100; } catch { return false; } }
export function rateToStore(text: string) { const s = norm(text); return s === '' ? null : s; }
```

#### P5-WR-04: The growth calculator prefill reads a foreign-currency account's minor units as home currency

**File:** `src/features/record/accounts/AccountDetailRows.tsx:470-479`

**Issue:** `start: String(Math.max(0, paid ?? 0))` passes the account's balance in the account's own currency minor units. `CompoundCalculator` reads `start` as home-currency minor units (`useCalcFormat` → `rc.homeCurrency`).

Failure scenario:
- A EUR savings account showing €12,345.67 (1234567 minor) for a user whose home currency is JPY (exponent 0) prefills ¥1,234,567.
- With home currency USD it prefills $12,345.67: the right digits but the wrong currency, with no conversion.

The illustration's numbers are then wrong.

**Fix:** Convert first and skip the prefill when no rate is stored, as the currency row above already does:
```ts
const startHome = account.currency === rc.homeCurrency ? paid : (paid === null ? null : projectionHomeAmount(paid, account.currency, rc.homeCurrency, rates ?? []));
params: { start: String(Math.max(0, startHome ?? 0)), rate, monthly: '0' }
```

#### P5-WR-05: An asset sale reaches Decide as income and its payoff payment as everyday spending

**File:** `src/features/decide/snapshot/v3/buildV3Inputs.ts:476-483`; the comment in `src/features/record/activity/debtFilter.ts:2-3`

**Issue:** The new `debt_payment` role keys on `debt_id`. The comments state that `debt_id` is set on "a one-off or a sale's final payment". In the current `record_debt_sale` (migration `20261110000100`, lines ~311-333), neither the sale line (money in) nor the final payment (money out) is written with `debt_id`. Only `record_debt_one_off` sets it.

Failure scenario:
1. The user records selling a car for $14,000 with a $9,000 final payment.
2. In that month's history, `roleOf` returns `income` for the +$14,000 and `spending` for the −$9,000.
3. Decide's income and everyday-spending figures take in a one-time sale and a loan payoff as if they were normal pay and spending.
4. The same two lines are also missing from the debt's "See all in Activity" filter, which `debtFilter.ts` says covers them.

**Fix:** Have `record_debt_sale` stamp `debt_id` on the final payment. The `debt_balance_follows_line` trigger already adjusts the balance itself, so either skip the RPC's own balance write or insert with `debt_id` before the trigger and let the trigger do the work. Give the sale line a non-income role, for example `counts_as: 'kept'` or a dedicated tag, so Decide does not average it in. At minimum, correct both comments so the next reader does not rely on a tag that is never written.

### Info

#### P5-IN-01: The debt chip is not counted in the filter badge

**File:** `src/features/record/activity/ActivityScreen.tsx:141`, `:151-152`

**Issue:** `activeFilterCount = countActiveFilters(filter)` leaves out the route-driven debt filter, while `chips` includes it. When only the debt filter is active, the filter icon reads 0 active filters while a chip is shown and the list is narrowed. The screen-reader announcement of the count is wrong in the same way.

**Fix:** `const activeFilterCount = countActiveFilters(filter) + (vm.debt !== null ? 1 : 0);`

#### P5-IN-02: `cardStyle` still asks for `line1`, which it no longer uses

**File:** `src/features/record/activity/ActivityRow.tsx:41`

**Issue:** `Pick<…, 'surface' | 'line1' | 'line4'>`: `line1` is no longer read since the separator moved to `line4`. This is harmless but misleading to the next reader.

**Fix:** Drop `'line1'` from the `Pick`.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

