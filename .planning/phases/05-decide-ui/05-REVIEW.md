---
phase: 05-decide-ui
reviewed: 2026-10-21
depth: standard
diff_base: b4fc4bcd2f2c08da8dabc0f402d9659e1b7fc8f0
files_reviewed: 181
status: issues_found
findings:
  critical: 1
  high: 17
  medium: 24
  low: 28
  info: 16
  total: 86
---

# Phase 5 Code Review

Four parallel gsd-code-reviewer passes over the Phase 5 source diff (b4fc4bc..HEAD, tests excluded): A data/db/SQL, B snapshot/journal/copy/home/past/quick/notifications, C check flow, D routes/UI/charts/onboarding/Record/shell/copy. IDs are kept from the parts. User decision 2026-10-21: fix everything; DB fixes in one new additive migration (20261021000100_decide_review_fixes.sql), applied migrations untouched.

## Findings

| ID | Severity | File | Finding | Status |
|----|----------|------|---------|--------|
| CR-A01 | critical | `src/db/decideSettings.ts:73 together with supabase/migrations/20261016000100_decide_tables.sql:145-146` | Decide-settings upsert needs UPDATE on `user_id`, which is not granted, so every settings save fails | fixed (a6728ae3, 334878e6) |
| CR-B01 | high | `src/features/decide/home/LimitEditorSheet.tsx:253-256` | Saving one limit or the rough figures changes the currency of every other stored money limit | fixed (21648cf4): currency stamped only with a money figure; a new currency clears the other money columns |
| CR-B02 | high | `src/features/decide/snapshot/computeCheck.ts:127-166` | A check typed in a previous home currency is judged as if its amounts were in the current one | fixed (d0157b22), D-67 convert and note |
| CR-B03 | high | `src/features/decide/notifications/waitReminder.ts:58-65` | The reminder map is read and rewritten by overlapping calls; a lost id leaves a notification that nothing can cancel | fixed (c70d962d): one module queue for every map operation; reconcile cancels orphaned Decide notifications |
| CR-B04 | high | `src/features/decide/quick/QuickResult.tsx:210-240` | "Try on credit" cannot be reached by screen readers inside the accessible result group — HIGH (a11y) | fixed (dc1dc041); not covered by WR-C05, which touched VerdictCard only |
| CR-C01 | high | `src/features/decide/check/useCheckDraft.ts:112-133. The stale closures are captured at steps/Step2PriceAndPay.tsx:76-91` | A toast Undo reverts every edit made after the removal (stale `update` closure) | fixed (4fcf03ec) |
| CR-C02 | high | `src/features/decide/check/LineEditorSheet.tsx:113-128` | The same recurring bill can be "replaced" twice, giving a double-counted saving and a refused Go ahead | fixed (a6728ae3, 949092cb, 5a48a5e9): a refused Go ahead leaves no rows (batch A); a bill is replaced at most once |
| CR-C03 | high | `src/features/decide/check/writtenLines.ts:485-489` | "What gets written" promises a transfer into the investment account, but the write records a pending expense | fixed (210800e4) |
| CR-C04 | high | `src/features/decide/check/writtenLines.ts:544-555` | "Closes N recurring bills" can be listed while nothing is ended | fixed (210800e4); a replaced bill whose series no longer exists is left out of the closed count, with no separate notice |
| CR-C05 | high | `src/features/decide/check/useCommitDecision.ts:216` | Go ahead can write to an archived account or a different-currency account, then double counts the purchase | fixed (674da01a) |
| CR-C06 | high | `src/features/decide/check/useCheckDraft.ts:47` | The check's stamped currency is never reconciled with the snapshot currency | fixed (d0157b22), D-67 convert and note |
| CR-C07 | high | `src/features/decide/check/useCommitDecision.ts:284-307 (confirmGo) and 309-362 (requestCommit)` | No in-flight guard on commit or Reopen, so a double tap can double-write | fixed (a7846dff) |
| CR-D01 | high | `src/features/decide/ui/MoneyInput.tsx:43-67` | Onboarding rough figures can trap iOS users, and Skip silently discards them | fixed (8a6ab52f): MoneyInput reports as typed (error on blur), returnKeyType done; RoughFiguresScreen scrolls with the keyboard (Screen `form`) and keeps taps; Skip saves any valid figure. Onboarding rough figures stamp through settingsPatch (1337daf0, CR-B01 carry-over) |
| CR-D02 | high | `src/features/record/import/useStatementImport.ts:1425-1426` | The statement period outlives an undone or rejected import, so Decide counts empty months as complete | fixed (97b03afa): period tagged with the import batch (statement_periods.import_batch_id) and read through the statement_periods_live view, which drops it once no line of the batch is live (undo, refused import); not recorded when a line inside the period was unticked; unique key gains the batch (pending migration 20261021000100 §5, pgTAP 60 tests 39-46) |
| CR-D03 | high | `src/features/navigation/swipeBackGesture.ts:41-51` | The swipe-back interceptor and back listener are global, without focus or ownership checks | fixed (b8520712; claim stack 418c3fa0): the claim and the hardwareBackPress listener live in useFocusEffect, so a covered check gives both up and takes them back when uncovered |
| WR-A01 | high |  | Guard triggers undo the database's ON DELETE SET NULL, leaving dangling `check_id` / `reopened_from` | fixed (a6728ae3) |
| WR-A02 | high | `src/data/mutations/decideGoAhead.ts:351-369 (onError at 410-436)` | Go ahead inserts its rows and records the decision in two requests, so a refused RPC leaves committed purchase lines and a double tap writes them twice | fixed (a6728ae3, 949092cb); the confirmGo in-flight latch is left to CR-C07 |
| WR-A03 | high | `src/data/mutations/decideChecks.ts:165-173 (saveCheckDraft)` | Draft autosave bumps the check version without recording it in the version chain, so queued mark-seen and abandon edits hit false conflicts | fixed (d1c828f3) |
| WR-A04 | medium | `src/data/mutations/decideChecks.ts:215-239` | Removing a Wait decision writes the check and its goal in two requests, so a goal failure leaves the check deleted with no Undo and the goal still live | fixed (261aaad4) |
| WR-A05 | medium | `src/db/debts.ts:117-126` | Decide reads are not filtered by household, so a user in two households gets mixed debts, checks and links in one snapshot | fixed (09bb8fa3) |
| WR-A06 | medium | `src/data/mutations/decideGoAhead.ts:109-132 (addRow)` | Go-ahead purchase lines are written without `one_off`, so a lump purchase later inflates spending averages for every other check | fixed (5c072859), D-66 |
| WR-A07 | medium | `src/data/mutations/decideSettings.ts:316-337` | Optimistic settings rollback restores a stale snapshot when two settings writes are queued | fixed (e10e18c2) |
| WR-B01 | medium | `src/features/decide/snapshot/buildSnapshot.ts:164-168` | A zero balance in a currency with no stored rate makes the whole Decide tab unconverted | fixed (4fec9fe2) |
| WR-B02 | medium | `src/features/decide/snapshot/buildSnapshot.ts:342-343` | Transfer-category outflow series are counted as bills, while income series of the same category are left out | fixed (9ef7259c): a Transfer series is neither bill nor income; its paid inbound legs still count as saving/investing |
| WR-B03 | medium | `src/features/decide/snapshot/buildSnapshot.ts:270` | Debt-category one-off payments are excluded only when a `debts` row exists | fixed (afb95ec7, fa9fafd0): user decision D-68, match by transfer target. A Debt-category one-off is excluded only as a transfer into a tracked card or loan whose debt has a counted minimum; a payment that is not a transfer (untracked account) stays spending |
| WR-B04 | medium | `src/features/decide/snapshot/withoutCheckWrites.ts:297-301` | The bought-check recompute does not reopen a replaced series when Go ahead was queued offline | fixed by 433160b9 (WR-C02 endedFrom window) for the offline replay; 44d70bd1 reopens only counted replace lines |
| WR-B05 | medium | `src/features/decide/snapshot/withoutCheckWrites.ts:317` | Lines attached to a bought check stay in the "before" position, so the purchase can be counted twice | fixed (985ace91): attached day-one and payment lines on or after the local decided date are taken out; not covered by WR-C02/CR-C02 |
| WR-B06 | medium | `src/features/decide/journal/estimateActual.ts:53-69` | Estimate-versus-actual shows "under by the full estimate" when nothing is linked or a rate is missing | fixed (345d1ecd) |
| WR-B07 | medium | `src/features/decide/past/DecisionDetailSheet.tsx:80` | "Final price" in the decision detail shows the advertised price in the home currency | fixed (ce7ca636) |
| WR-B08 | medium | `src/features/decide/quickParse.ts:262-276` | Quick-check parsing takes the first number, so "iPhone 15 Pro 1199" is judged at 15 | fixed (e228622c): last number is the price; the result echoes it |
| WR-B09 | medium | `src/features/decide/home/YourMonthCard.tsx:93 (string src/i18n/locales/en.ts:1448` | Compliance — Your month says the average "is safe to plan on" | fixed (7760ff73, user-accepted copy, docs synced) with WR-D04: steadyLine is now "…, so the check uses the average."; the copy guard fails "safe to" |
| WR-B10 | medium | `src/features/decide/notifications/waitReminder.ts:153-166` | Reconcile never fixes a reminder whose time changed or that the OS dropped | fixed (c70d962d): map stores { id, at }; reconcile compares the server time and the OS list |
| WR-C01 | medium | `src/features/decide/check/useCommitDecision.ts:318-359` | Wait and Pass commit without flushing the pending draft, so stored inputs miss the last edits | fixed (9e1a40fc) |
| WR-C02 | medium | `src/features/decide/check/useBoughtCheckComputation.ts:35-41.` | The bought-check recompute can still double count | fixed (433160b9): a queued Go ahead shows no figures until it lands; replaced series reopen across an offline replay |
| WR-C03 | medium | `src/features/decide/check/CheckFlowScreen.tsx:296-308. Related: src/data/mutations/decideChecks.ts (useMarkCheckSeen uses expectedVersion: row.version` | Seen-state is lost to a version conflict and is marked only once per mount | fixed (d1c828f3 version chain, d292b5e4 seen per visit) |
| WR-C04 | medium | `src/features/decide/check/steps/step2/MethodPanels.tsx:270-323` | The card APR is saved only on blur, and that write is not guarded on a decided check | fixed (15799eec) |
| WR-C05 | medium | `src/features/decide/check/VerdictCard.tsx:235-277.` | The confidence chip and the missing-rate link inside VerdictCard are unreachable for screen readers | fixed (950caa78) |
| WR-C06 | medium | `src/features/decide/check/steps/stepUi.tsx:89-95.` | `Lock` hides controls from touch only, so read-only controls stay announced and activatable | fixed (3934dc38) |
| WR-D01 | medium | `src/features/record/entry/transactionForm.ts:39. The gap is in src/features/record/entry/draftForm.ts:29-48` | The one-off flag is not saved in the entry draft and is lost on restore | fixed (ef446554): DraftForm carries oneOff (never on a transfer); round-trip tests |
| WR-D02 | medium | `src/features/decide/ui/StepSlider.tsx:216-220` | StepSlider jumps to the touched value before the pan activates, so scrolling can change the deposit | fixed (f24617b2): value set on pan activation (onStart) with failOffsetY, plus a separate tap |
| WR-D03 | medium | `src/features/decide/ui/RateInput.tsx:9` | RateInput rejects comma decimal separators | fixed (91bf7ebb): RateInput shows and accepts the region decimal mark; onChange text stays in "." form |
| WR-D04 | medium | `src/i18n/locales/en.ts` | Copy that reassures or prescribes gets past the banned list | fixed (7760ff73; user accepted the rewrites, UI-SPEC and plans synced): steadyLine, spendTitle/spendSub, optSaveFirst, tryCredit, alt.row.skip, descWait, method.card and waitPutAside rewritten; decideCopy.test fails reassurance and a leading money imperative outside a keyed list of buttons |
| IN-B01 | low | `src/features/decide/journal/pastDecisions.ts:143-146` | Decided dates use the device time zone, while the bought recompute uses the app's time zone | fixed (62f0af7c) |
| IN-B02 | low | `src/features/decide/notifications/useNotificationObserver.ts:192` | The last notification response is never cleared | fixed (740eda89) |
| IN-B03 | low | `src/features/decide/home/OpenChecksCard.tsx:176` | Row action buttons have identical, nameless screen-reader labels — LOW (a11y) | fixed (69d7291b) |
| IN-B04 | low | `src/features/decide/home/ChangesCard.tsx:265` | Dated changes are formatted in the home currency, not the row's currency | fixed (e818d102) |
| IN-B05 | low | `src/features/decide/past/PastDecisionsScreen.tsx:270-279` | Reopen can be pressed again on a decision that already has a live reopened check | fixed (7f29155b client; 678122ff server): partial unique index decide_checks_reopened_once (after clearing the link on extra live reopens), and a unique violation on reopen opens the live reopened check (pgTAP 60 tests 47-50) |
| IN-B06 | low | `src/features/decide/snapshot/checkInputs.ts:358-390` | "Run the full check" saves inputs with `currency: null` | fixed (a783fad5) |
| IN-B07 | low | `src/features/decide/copy/quickCopy.ts:127` | Fallback copy can say "short by 0" | fixed (c9d37808) |
| IN-B08 | low | `src/features/decide/home/RoughFiguresSheet.tsx:278` | Rough figures cannot record zero income | fixed (73bc9aef): income may be 0 (sheet and onboarding); spending stays above zero |
| WR-A08 | low | `supabase/migrations/20261016000300_decide_outcomes.sql:415-417` | A Wait queued offline for more than two days can be refused permanently | fixed (a6728ae3) |
| WR-A09 | low | `src/data/mutations/sampleData.ts:24-36` | Clearing or seeding sample data does not refresh the settings, goals or changes caches | fixed (2cce53d6) |
| WR-A10 | low | `src/data/mutations/decideLinks.ts:204-223` | Undoing an unlink collides with the live-unique index after the same line is re-attached | no change: accepted refusal (the line is already attached again), documented in 48d553b2 |
| WR-A11 | low | `src/data/mutations/decideGoAhead.ts:288` | Go-ahead running-cost series drop the category the user picked | fixed (8ef2deb3) |
| WR-C07 | low | `src/features/decide/check/CheckFlowScreen.tsx:97-114` | Live inputs are mixed with settled (150 ms) detail figures | fixed (030d980c) |
| WR-C08 | low | `src/features/decide/check/CheckFlowScreen.tsx:249-263` | The swipe-back interceptor is cleared unconditionally, and Reopen stacks a second flow | fixed (418c3fa0); focus-based claiming is CR-D03 |
| WR-C09 | low | `src/features/decide/check/CheckFlowScreen.tsx:270-274` | "Save and close" says "Saved" when nothing was saved | fixed (7594be71) |
| WR-C10 | low | `src/features/decide/check/useCommitDecision.ts:284-307` | Silent no-op in `confirmGo` and an unhandled promise chain | fixed (f59ef11b) |
| WR-C11 | low | `src/features/decide/check/LineEditorSheet.tsx:121` | An edited "replaced" bill still ends the whole original series | fixed (a7fde02d) |
| WR-C12 | low | `src/features/decide/check/useEstimateBias.ts:140-141.` | The estimate gap note can be built from a silently truncated set of lines | fixed (a08c7cd9) |
| WR-C13 | low | `src/features/decide/check/steps/step4/RateChips.tsx:414-427` | Local text state drifts from the stored value in the fee and loss-of-value inputs | fixed (d8b63cc0) |
| WR-D05 | low | `src/features/decide/ui/MoneyInput.tsx:35-41` | MoneyInput does not clear when the value is reset to null from outside | fixed (8a6ab52f): a parent reset to null clears text and error; a null answer to the field's own report keeps the text |
| WR-D06 | low | `src/features/decide/ui/StepSlider.tsx:184-189` | snapToStep cannot reach max, and step <= 0 gives NaN | fixed (f24617b2): last notch snaps to an off-grid max; step <= 0 gives min; screen-reader notches step one grid point |
| WR-D07 | low | `src/features/decide/charts/chartGeometry.ts:84-89` | Cash path x labels are positional and can mislabel short series | fixed (90348c03): ticks labelled from their day index (Today, +N d); a path under two points draws nothing |
| WR-D08 | low | `src/features/decide/charts/NetWorthChart.tsx:312-319` | NetWorthChart axis labels are bare indices, and the alt text has gaps | fixed (ab9313e5): x labels "{{count}} mo"; an unprojectable end reads "Too large to project at this rate" in the alt text |
| WR-D09 | low | `src/features/decide/ui/GoalProgress.tsx:26-31` | GoalProgress shows 0% for very large saved amounts and "of 0" without a target | fixed (9ce1655b): BigInt ratio past the safe range; captionNoTarget when there is no target |
| WR-D10 | low | `src/features/decide/ui/CheckRow.tsx:53-62` | CheckRow's remove control stays active when the row is disabled | fixed by 3934dc38 (WR-C06): the remove Pressable is disabled and announced disabled with the row |
| WR-D11 | low | `src/shell/decide/CommitMutationsProvider.tsx:15-27` | CommitMutationsProvider value is not memoised, and canWrite hides all errors | fixed (55074e31): context value memoised (hooks read through a ref); canWrite reports non-refusal errors (isGoAheadRefusal) and still answers false |
| WR-D12 | low | `src/features/record/entry/pickers/DateField.tsx:43` | DateField refuses an earlier date without any feedback | fixed (b4f63abf): a refused day moves the field to minDate and the iOS picker remounts on it |
| WR-D13 | low | `app/(app)/_layout.tsx:80` | Notification routing is enabled when the profile is missing | fixed (a9ef5b64, f7d98d75): observer enabled by consentAnswered (not loading and a recorded answer) |
| IN-A01 | info | `supabase/migrations/20261016000400_decide_demo_seed.sql:253-261` | Demo check inputs are stored in USD minor units for every home currency | fixed client-side in batch C (d0157b22, D-67): an unstamped sample check reads and is stamped as USD; no SQL |
| IN-A02 | info | `jest.config.js:46-47` | Bare CR and mixed line endings in jest.config.js | fixed (165600e0) |
| IN-A03 | info | `src/engine/decide/decision.ts:1-27 and throughout` | `decision.ts` reformatted to double quotes | fixed (f4a3b68d) |
| IN-C01 | info | `src/features/decide/check/CheckFlowScreen.tsx:358` | `Number()` is used on money and on rate text | fixed (d2142064, d8b63cc0) |
| IN-C02 | info | `src/features/decide/check/sections/LedgersSection.tsx:114 (" to ")` | Hard-coded English in accessibility and visible text | fixed (1046e7ed) |
| IN-C03 | info | `src/features/decide/check/sections/LinesSection.tsx:287.` | The investing row prints "floor £0" when the floor is not set | fixed (318e9bae) |
| IN-C04 | info | `src/features/decide/check/writtenLines.ts:480` | A decided bought check's "What gets written" is dated today | fixed (aa789565) |
| IN-C05 | info | `src/features/decide/check/VerdictCard.tsx:158.` | First-read "missing" with no reasons falls back to the card-missing title | fixed (bf20a779) |
| IN-C06 | info | `src/features/decide/check/CheckFlowScreen.tsx:372.` | The household share silently falls back to member 0 | fixed (aa4e53f0) |
| IN-C07 | info | `src/data/mutations/decideGoAhead.ts:286-289` | The write builder does not mirror the engine's filter on loss-of-value running-cost lines | fixed (3ab6b3ea) |
| IN-D01 | info | `StateChip.tsx:24` | A category tint is reused as the warning tint | fixed (0a503718): warnTint token |
| IN-D02 | info | `FigureStrip.tsx:41 (key={item.caption})` | React keys come from display strings | fixed (4869774b): index-qualified keys |
| IN-D03 | info | `CashPathChart.tsx:213` | Chart text alternatives are announced twice | fixed (eb5f75e0, 76602fec): visible alt copy hidden from screen readers |
| IN-D04 | info | `app/(app)/decide/check/[id].tsx:7` | The UUID regex is duplicated in four places | fixed (9460c920): src/features/navigation/routeParams.ts (isUuid, oneParam, uuidParam) |
| IN-D05 | info | `src/i18n/copyStatus.ts:135` | Unreviewed copy, and an insurance-style prompt | deferred to 05-26: the copy review happens on device during the 05-26 checks, then decide copyStatus flips draft→final (checklist item in 05-EXECUTION-NOTES.md). cardQ3 reworded keeping its polarity, then softened at the user's request (2026-10-22) to "Is something set aside to keep these payments going if income dips?"; stored jobLossCover answers unchanged |
| IN-D06 | info | `src/features/decide/ui/CheckRow.tsx:70` | Magic numbers in CheckRow | fixed (f7f55ca0): named constants; the remove dash stays (CloseGlyph swap left as a design call) |

# Detail

## Part A

# Phase 5 (part A): Code Review Report

**Reviewed:** 2026-10-21
**Depth:** standard. Each Phase 5 change was traced into the SQL functions and triggers it relies on.
**Files reviewed:** 42
**Status:** issues_found

## Summary

Most of the server design holds up. Clients have no write grant on decision columns. Every SECURITY DEFINER function sets `search_path = ''` and carries explicit grants. The `fincwin.decide_rpc` / `decide_seed` flags are set transaction-local. `allow_system_keys` cannot be set by a client. Replaying a queued `record_decide_go` or `record_decide_outcome` returns 'already-applied'. Failed-write records carry ids and counts only.

Four defects matter before this ships:

1. **Settings can never save.** Every Decide-settings save is refused by Postgres with 42501 (CR-A01).
2. **Clearing sample data leaves broken links.** Three guard triggers block the database's own "set to NULL" step when a check is hard-deleted, so rows keep a link to a check that no longer exists (WR-A01, needs a new migration).
3. **Go ahead is not atomic.** It is two requests, so a refused second request leaves the purchase lines written with no decision and no Undo. A double tap writes them twice (WR-A02).
4. **Autosave breaks later edits.** Draft autosave bumps the check's version without telling the version chain, so a queued abandon or mark-seen hits a false conflict (WR-A03).

All SQL findings are marked **needs a new migration**, because the six migrations are already live in production.

## Critical Issues

### CR-A01: Decide-settings upsert needs UPDATE on `user_id`, which is not granted, so every settings save fails (severity: critical)

**File:** `src/db/decideSettings.ts:73` together with `supabase/migrations/20261016000100_decide_tables.sql:145-146`
**Issue:** `upsertDecideSettings` calls `.upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })`. PostgREST turns this into `INSERT ... ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, <patched cols> = EXCLUDED...`. Every column in the payload goes into the SET list, including the conflict key.

Postgres checks UPDATE privilege on every column in an ON CONFLICT DO UPDATE SET list when the statement starts, whether or not a conflict happens. The update grant on `decide_settings` leaves out `user_id`. So every call fails with 42501, including the very first one when no row exists yet.

`classifyWriteError` treats 42501 as 'rejected'. The optimistic settings roll back and a failed write is parked. The result: limits, rough figures, reserve and basis override can never be saved, and the first-read (rough figures) Decide path cannot work.

The pgTAP test (`54_decide_tables.test.sql:111-120`) runs a plain INSERT and then a plain UPDATE. It never runs ON CONFLICT DO UPDATE. The Jest tests use `fakeSupabase`. So no test catches this. The 05-03 plan says "A upserts decide_settings", but the test does not exercise that.

**Fix:** Add a forward migration (**needs a new migration**). It is safe because `fill_decide_settings` already forces `new.user_id := auth.uid()` on UPDATE and RLS limits the row to its owner:

```sql
grant update (user_id) on public.decide_settings to authenticated;
```

Add a pgTAP case that runs `insert ... on conflict (user_id) do update set user_id = excluded.user_id, rough_income = excluded.rough_income` as `authenticated`, twice.

If you want a client-only stopgap instead: run `update(patch).eq('user_id', userId).select()`. If that returns 0 rows, run `insert({ user_id, ...patch })`, and treat a 23505 as "retry the update".

## Warnings

### WR-A01: Guard triggers undo the database's ON DELETE SET NULL, leaving dangling `check_id` / `reopened_from` (severity: high, needs a new migration)

**Files:**
- `supabase/migrations/20261016000100_decide_tables.sql:198-200` (`guard_debt` resets `new.check_id := old.check_id`)
- `supabase/migrations/20261016000100_decide_tables.sql:62` (`guard_decide_check` resets `new.reopened_from := old.reopened_from`)
- `supabase/migrations/20261016000110_decide_depth_tables.sql:111-112` (`guard_savings_goal` resets `new.check_id := old.check_id`)

**Issue:** `debts.check_id`, `savings_goals.check_id` and `decide_checks.reopened_from` are declared `on delete set null`. Postgres carries out that action as an UPDATE on the referencing row, and BEFORE UPDATE row triggers fire on it. Each guard puts the old value back unless the decide_rpc flag is on, and it is never on during these deletes.

Because the key ends up unchanged and the row was written in an earlier transaction, the foreign-key check skips the row (`RI_FKey_fk_upd_check_required` returns false). The row keeps pointing at a check that no longer exists, so the foreign key is silently violated. A later `pg_dump` restore would then fail when it re-adds the constraint.

This is easy to trigger. `clear_sample_data` (`20261016000400_decide_demo_seed.sql:294-297`) hard-deletes sample checks. Any of these done on the sample Car or Sofa check beforehand leaves a dangling link:
- **Go ahead:** writes a non-sample debt with `check_id`.
- **Wait:** writes a non-sample goal with `check_id`.
- **Reopen:** writes a non-sample check with `reopened_from`.

Account erasure in a shared household does the same to `debts.check_id`, because the debt survives and the check cascades away.

`set_updated_by`'s own comment (D-WR-08) records that this project has already been bitten by triggers that rewrite FK-action updates.

**Fix:** Add a forward migration that lets NULL through, the same way `created_by` is already handled. No client grant or apply_patches path can null these columns, so a NULL only ever comes from the foreign-key action:

```sql
-- guard_debt
if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' and new.check_id is not null then
  new.check_id := old.check_id;
end if;
-- guard_decide_check
if new.reopened_from is not null then new.reopened_from := old.reopened_from; end if;
-- guard_savings_goal: same pattern for check_id
```

Also add a one-off repair statement: `update ... set check_id = null where check_id not in (select id from decide_checks)` for each of the three columns.

Add a pgTAP case: seed, Go ahead on Car, Wait on Sofa, Reopen, clear, then assert there are no orphans.

### WR-A02: Go ahead inserts its rows and records the decision in two requests, so a refused RPC leaves committed purchase lines and a double tap writes them twice (severity: high)

**File:** `src/data/mutations/decideGoAhead.ts:351-369` (onError at `410-436`)
**Issue:** `mutationFn` inserts every row with `insertTransactionsBatch` and only then calls `record_decide_go`. The RPC can refuse for permanent reasons:
- The check is already decided, from another device or a second tap.
- A replaced series' `expected_version` no longer matches (`end_recurring_series` → 22023).
- `t.version <> 1`.
- A malformed debt.

When it refuses, the rows stay as live pending transactions with no link, no decision and no Undo. The toast `undo.batchSavedNoUndo` admits this happens.

A double tap does it too. `confirmGo` (`src/features/decide/check/useCommitDecision.ts:143-162`) has no in-flight guard: `setAsking(false)` takes effect asynchronously and every call mints new row ids and a new step id. The second mutation inserts a second copy of the rows, and only then does its RPC fail with "already decided".

Those orphan rows are real money in every later snapshot: upcoming outflows and, later, spending averages. That is exactly the wrong-answer harm Decide exists to avoid.

**Fix:** Pick one of these.
- **(a) Preferred:** pass the row payloads to `record_decide_go` and insert them inside the function (a new migration adding an overload), so the purchase is a single transaction.
- **(b) Client-side compensation:** when the RPC fails with 'rejected' after `rowsLanded`, soft-delete the inserted rows through `apply_patches` (they are version 1 and the caller's own) before parking the failure.

In either case, add a `useRef` in-flight latch in `confirmGo`, and drop a goAhead whose `checkId` already has a queued `decideGoAhead` mutation: check `qc.getMutationCache().findAll({ mutationKey: mutationKeys.decideGoAhead })`.

### WR-A03: Draft autosave bumps the check version without recording it in the version chain, so queued mark-seen and abandon edits hit false conflicts (severity: high)

**File:** `src/data/mutations/decideChecks.ts:165-173` (saveCheckDraft); the edits it breaks are at `210-218`, `352-386`
**Issue:** `saveDecideCheckDraft` updates without a version condition, but `bump_version` still raises the row's `version`. The mutation never calls `recordWrittenVersion`, and `onMutate` leaves the cached `version` as it was.

`editCheck` (abandon, markSeen, remove) builds `expectedVersion` from the cached row and resolves it through `versionChain`. So if an autosave is still queued when the user reaches step 3 (`CheckFlowScreen.tsx:306`, which calls markSeen), or abandons while offline, this happens:
1. The draft lands first, because WRITE_SCOPE runs writes in order.
2. The edit then fails `.eq('version', base)`.
3. The edit is classed 'conflict'. The cache is overwritten with the server row and a failed write is parked.

For an abandon, the "abandoned" check comes back and its Undo toast does nothing. For markSeen, "Changed since you looked" (D-15) loses its baseline. This sequence (type a draft, move on, act) is the normal flow, not an edge case.

**Fix:** In the saveCheckDraft `mutationFn`, record the chain. `bump_version` increments by exactly 1, so:

```ts
const row = await saveDecideCheckDraft(...);
recordWrittenVersion('decide_checks', vars.id, [row.version - 1], row.version);
return row;
```

Alternatively, make markSeen unconditional, as the draft save already is.

### WR-A04: Removing a Wait decision writes the check and its goal in two requests, so a goal failure leaves the check deleted with no Undo and the goal still live (severity: medium)

**File:** `src/data/mutations/decideChecks.ts:215-239`
**Issue:** The check soft-delete lands first. If `updateSavingsGoal` then throws (a conflict because the goal's version moved, or not-found), the function exits before `recordUndoStepSafely`. The check stays deleted with no undo step. The goal stays live and keeps counting its tagged transfers. `onError` only invalidates the caches and parks a 'conflict' against the check id. The retry path cannot repair it either: the check now reads as already-applied, but the goal still conflicts.
**Fix:** Send both soft-deletes as one `apply_patches` call (ops for `decide_checks` and `savings_goals`, plus the undo step, which apply_patches already accepts), so they commit or fail together. At minimum, record the undo step for the check before touching the goal.

### WR-A05: Decide reads are not filtered by household, so a user in two households gets mixed debts, checks and links in one snapshot (severity: medium)

**Files:** `src/db/debts.ts:117-126`, `src/db/decideChecks.ts:95-104`, `src/db/statementPeriods.ts:18-27`, `src/db/decideLinks.ts:151-161, 168-178`; callers `src/data/queries/decide.ts:42, 58, 66, 192, 197`
**Issue:** `fetchDebts`, `fetchDecideChecks`, `fetchStatementPeriods`, `fetchPaymentLinks` and `fetchWrittenRowLinks` rely on RLS alone, which is `household_id in user_household_ids()`. Each result is cached under a per-household key and fed into `buildDecideSnapshot` for one household.

`household_members` has a composite primary key, so belonging to more than one household is allowed, and Phase 8 adds sharing. Once a user is in two households:
- the other household's debt minimums and balances enter monthCosts, the DSR line and the unsecured line;
- the other household's checks enter stacking.

Every other household read in the codebase (`fetchAccounts`, `fetchRecurringSeries`, `fetchDecideChanges`) filters with `.eq('household_id', ...)`.
**Fix:** Add a `householdId` parameter and `.eq('household_id', householdId)` to all five functions, and pass `hh` from `useDecideSnapshot` / `useDebts` / `useStatementPeriods` / `useDecideChecks`.

### WR-A06: Go-ahead purchase lines are written without `one_off`, so a lump purchase later inflates spending averages for every other check (severity: medium; confirm intent)

**File:** `src/data/mutations/decideGoAhead.ts:109-132` (addRow), also the uncategorised invest lump at `217`
**Issue:** A cash purchase, a day-one deposit, a card remainder or an investment lump without a tracked account is written as an ordinary pending outflow. `buildSnapshot.ts:272` leaves a line out of the averages only when `one_off === true`. `writtenTargets` covers only checks that have payment links.

So once the purchase month becomes a full month, a 1,800 sofa raises "average spending" by about 1,800 / N across the averaging window. Every later check gets a more pessimistic verdict. D-29 added `one_off` precisely for "won't recur" lines, and the column is granted and listed in `TRANSACTION_INSERT_KEYS`.
**Fix:** For day-one rows that are not transfers, pass `{ one_off: true }` in `addRow` (role 'day_one'). Single-month payment rows of a loan already fall under the Debt-category rule. If the current behaviour is deliberate, document it next to D-29 and add a builder test that pins it.

### WR-A07: Optimistic settings rollback restores a stale snapshot when two settings writes are queued (severity: medium)

**File:** `src/data/mutations/decideSettings.ts:316-337`
**Issue:** Each mutation captures `previous` when it starts. With two queued edits where the first succeeds and the second is rejected (today every one is, see CR-A01), the second's `onError` writes back the value from before the first edit. The cache then shows an older value than the server holds, until a refetch.
**Fix:** On a rejection, use `invalidateQueries(queryKeys.decideSettings(userId))` instead of restoring `previous`, or restore only when no other `updateDecideSettings` mutation is pending.

### WR-A08: A Wait queued offline for more than two days can be refused permanently (severity: low, needs a new migration if changed)

**File:** `supabase/migrations/20261016000300_decide_outcomes.sql:415-417`
**Issue:** `ready_by < current_date - 2` raises 22023. A Wait saved offline with a near ready-by date (a small target) that replays three or more days later is classed 'rejected'. The decision and its goal are lost, with only a toast to show for it.
**Fix:** Either clamp in the RPC, `v_ready_by := greatest(v_ready_by, current_date)`, instead of raising (new migration), or have the client recompute `ready_by` at replay time.

### WR-A09: Clearing or seeding sample data does not refresh the settings, goals or changes caches (severity: low)

**File:** `src/data/mutations/sampleData.ts:24-36`
**Issue:** The seed writes `decide_settings` (investing_floor 0, currency) and clear deletes the seeded row. `refresh` invalidates checks, debts and links but not `decideSettings(userId)` or `savingsGoals`. Because the cache is persisted, the snapshot keeps the stale settings row until something else refetches it.
**Fix:** Add `qc.invalidateQueries({ queryKey: queryKeys.decideSettings(userId) })` and `queryKeys.savingsGoals(userId, householdId)` to `refresh`.

### WR-A10: Undoing an unlink collides with the live-unique index after the same line is re-attached (severity: low)

**File:** `src/data/mutations/decideLinks.ts:204-223`, with `20261016000100_decide_tables.sql:242`
**Issue:** The sequence: unlink the line, attach the same line again (a new link row), then Undo the unlink. `apply_patches` sets the old link's `deleted_at` back to null, which violates `decide_links_live_unique` (23505). `undo_replay` turns that into a 'changed' conflict, so the Undo shows a misleading "changed elsewhere".
**Fix:** In `useAttachLine`, if a soft-deleted link for (check, entity, target) exists in the cache, restore that row instead of inserting a new one. Otherwise accept and document the refusal.

### WR-A11: Go-ahead running-cost series drop the category the user picked (severity: low)

**File:** `src/data/mutations/decideGoAhead.ts:288`
**Issue:** `addSeries(..., null, null, 'running_cost', ...)` passes `categoryId: null`, although each running-cost line carries a category (for example `insurance` or `fuel` in the demo Car inputs). The new series show up uncategorised in Activity, and Decide's per-category share lookup (D-34) falls back to the household rule.
**Fix:** Map `line.category` to the user's matching built-in category id (as `debtCategoryId` and `savingsCategoryId` are resolved in `GoAheadContext`) and pass it in.

## Info

### IN-A01: Demo check inputs are stored in USD minor units for every home currency (severity: info)

**File:** `supabase/migrations/20261016000400_decide_demo_seed.sql:253-261`
**Issue:** Account and transaction figures are scaled by `v_mult` and `10 ^ v_exp`, but the Sofa and Car `inputs` are fixed USD minor amounts. For a KRW or JPY home (exponent 0) the Car shows as 1,450,000 KRW, which is trivially affordable. For a BHD home (exponent 3) it is 1,450 BHD. The comment says the screenshot account is USD-home, so this only affects non-USD users who load the demo.
**Fix:** Scale `advertised`, `deposit` and the running-cost amounts with the same `round(x * v_mult) * 10 ^ v_exp` (new migration), or seed the checks only for a USD home.

### IN-A02: Bare CR and mixed line endings in jest.config.js (severity: info)

**File:** `jest.config.js:46-47`
**Issue:** The file now mixes CRLF, LF and a bare CR (`}\n\r// 05-35: ...`). Git sees it as `-text`. The whole file shows as rewritten in the diff (71+/65-), which hides the real 6-line change. JavaScript accepts the bare CR, but it is the same corruption the gsd-sdk bug produces.
**Fix:** Normalise the file to one line ending, and consider `* text=auto` in `.gitattributes`.

### IN-A03: `decision.ts` reformatted to double quotes (severity: info)

**File:** `src/engine/decide/decision.ts:1-27` and throughout
**Issue:** The only real change is `invMargin` (D-65), but the whole file switched from single to double quotes with trailing commas, unlike every other engine file. That makes the diff of a Core-Value engine file hard to review.
**Fix:** Revert the formatting churn and keep only the `invMargin` change. Add a formatter config so a stray formatter run cannot do this again.

## Checked and found sound (for the merger)

- No client grant on decision, status, estimate or `seeded` columns. `apply_patches` exposes decide_checks decision columns and debts.check_id only when `v_system` is set, and `allow_system_keys` has no client grant.
- All new SECURITY DEFINER functions use `search_path = ''`. Execute is revoked from public and anon, and trigger functions are revoked from authenticated. The decide_rpc and decide_seed flags are transaction-local and reset.
- Replays are idempotent: insert functions treat a 23505 on the id as success, `record_decide_go` checks undo_log by step id, and `record_decide_outcome` returns 'already-applied' when the status already matches. Every new mutation is registered through `setMutationDefaults`.
- FX restamps run under `system_restamp` and do not bump `version`, so `record_decide_go`'s `t.version = 1` check survives them.
- Seeded Student loan rows: the builder skips Debt-category rows when a loan debt exists (`buildSnapshot.ts:270, 383`), so the seed does not double count.
- The `provisional.ts` → `fxConvert.ts` move behaves the same: `customPerEur` throws on a zero rate and that throw is now caught and returned as null.

---

_Reviewed: 2026-10-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Part B

# Phase 5 (decide-ui), Part B: Code Review Report

**Reviewed:** 2026-10-21
**Depth:** standard (callers and callees checked where a finding depended on them: `src/data/mutations/decideSettings.ts`, `decideOutcome.ts`, `decideGoAhead.ts`, `src/data/queries/decide.ts`, `fxConvert.ts`, `homeAmount.ts`, `src/features/decide/check/useBoughtCheckComputation.ts`, `useCheckDraft.ts`, engine `plan.ts` / `assess.ts`)
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The pure snapshot layer is careful in most places: integer and bigint arithmetic, string date maths, inputs bounded at 10^12 minor units, the no-guess FX rule, and the promo and minimum code paths match the engine's own guards. I traced the `plans.card!` / `pay.card!.apr!` assertions in `promoBalances` against `planCard`. They are safe, because a `full` payoff never produces a promo outcome.

The defects that matter are at the edges, where state crosses a currency or a time boundary:

- Writes to the settings row change the meaning of money columns stored in an older currency.
- A check typed in an older home currency is judged as if its amounts were in the new one.
- The reminder map is read and rewritten by calls that run at the same time, so a notification can be left behind that nothing can cancel.
- On iOS and Android, the quick result's accessible group hides the "Try on credit" button from screen readers.

There are also several double-count or under-count paths in the builder and in the bought-check recompute, and one compliance line in the copy that sounds like an assurance.

Severity legend: every finding has HIGH, MEDIUM or LOW. HIGH is a BLOCKER. MEDIUM and LOW are WARNINGs.

## Critical Issues

### CR-B01: Saving one limit or the rough figures changes the currency of every other stored money limit — HIGH

**File:** `src/features/decide/home/LimitEditorSheet.tsx:253-256, 273`; `src/features/decide/home/RoughFiguresSheet.tsx:305`
**Issue:** `write()` always sends `{ ...patch, currency }`, including for `dsr_line`, `unsecured_multiple` and "Use the default". `RoughFiguresSheet` also stamps `currency`. `decide_settings` has one `currency` column for `reserve`, `investing_floor`, `saving_floor`, `rough_income` and `rough_spending`. The mutation (`src/data/mutations/decideSettings.ts:44-49`) merges the patch and clears nothing.

Example: a user with a EUR reserve of 500000 moves home to USD. The builder correctly ignores the EUR limits (`buildSnapshot.ts:492-494`). The user then edits only the DSR line, and `settings.currency` becomes `USD`. The 5,000 EUR reserve and both floors now count as USD amounts, and every verdict is judged against limits the user never typed in that currency.
**Fix:** Stamp `currency` only when a money column is written. When the stamped currency differs from `settings.currency`, null the other money columns in the same patch:
```ts
const write = (patch: DecideSettingsPatch) => {
  if (userId === null) return;
  const money = isMoney || 'rough_income' in patch;
  const switching = settings !== null && settings.currency !== null && settings.currency !== currency;
  const reset = money && switching
    ? { reserve: null, investing_floor: null, saving_floor: null, rough_income: null, rough_spending: null }
    : {};
  mutation.update(money ? { ...reset, ...patch, currency } : patch);
  onClose();
};
```
Apply the same rule in `RoughFiguresSheet.save`.

### CR-B02: A check typed in a previous home currency is judged as if its amounts were in the current one — HIGH

**File:** `src/features/decide/snapshot/computeCheck.ts:127-166, 239-256`; `src/features/decide/home/OpenChecksCard.tsx:79-84`
**Issue:** `CheckInputs.currency` records the currency the amounts were typed in (`useCheckDraft.ts:62` stamps it). `selectOtherChecks` (`stacking.ts:271`) leaves such checks out when they are other checks. But `computeCore`, `computeChip` and `computeDetails` never compare `inputs.currency` with `source.currency` for the check itself. `toEngineCheck(inputs, ctx)` stamps `ctx.currency` onto the raw minor units.

After a home-currency change, a £1,200 check is judged as $1,200: a wrong verdict on Decide home (the chip) and at step 3. Step screens label the amounts with `inputs.currency ?? source.currency` (`Step2PriceAndPay.tsx:67`), so the user sees "£1,200" next to a verdict computed in dollars.
**Fix:** In `computeCore` and `computeChip`, before anything else:
```ts
if (inputs.currency !== null && inputs.currency !== source.currency) {
  const note = { currencies: [inputs.currency], rowCount: 1 };
  return { ...base, status: 'unconverted', unconverted: note };   // chip: { status: 'unconverted', price, method }
}
```
Alternatively, convert `advertised`, adjustments, lines and instalment amounts at the stored rate through `makeConverter`, and record the conversion note. Never judge the amounts unconverted.

### CR-B03: The reminder map is read and rewritten by overlapping calls; a lost id leaves a notification that nothing can cancel — HIGH

**File:** `src/features/decide/notifications/waitReminder.ts:58-65, 74-101, 135-167`
**Issue:** `scheduleAt` and `cancelKey` each do `readMap()` → `await` → `writeMap()` with no serialisation. `useWaitAndSave.save` (`src/data/mutations/decideOutcome.ts:169-174`) calls `void scheduleCooling(...)` and then `await scheduleWaitReminder(...)` at the same time. Both go through `scheduleAt` for the same check.

The optimistic status change also re-runs the reconcile effect (`useDecideHomeViewModel.ts:55-60`). At that moment the map does not yet hold the new key, so reconcile schedules a second wait notification.

Interleaving: A reads {}, B reads {}, A writes {wait}, B writes {cooling}. The wait id is lost. `cancelCheckReminders` (on reopen, remove, Go ahead) cannot find it, and reconcile never sees it. The notification fires for a check that was reopened or deleted. The tap opens step 3 of a check that no longer has that status.
**Fix:** Serialise every map operation through a module-level queue, and make reconcile part of it:
```ts
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}
export const scheduleWaitReminder = (...a) => locked(() => scheduleWaitReminderInner(...a));
// same for scheduleCoolingOffReminder, cancelWaitReminder, cancelCheckReminders, reconcileWaitReminders
```
Also have reconcile cancel any scheduled notification whose `content.data.checkId` is not in the live lists, using `Notifications.getAllScheduledNotificationsAsync()`. That catches orphans already on devices.

### CR-B04: "Try on credit" cannot be reached by screen readers inside the accessible result group — HIGH (a11y)

**File:** `src/features/decide/quick/QuickResult.tsx:210-240`
**Issue:** The result `View` has `accessible` set and a single `accessibilityLabel={settled}`. On both platforms, `accessible={true}` turns the view into one accessibility element and hides its children. The `Pill` for "Try on credit" (lines 236-240) is inside that view. VoiceOver and TalkBack users hear the settled sentence but can never focus or activate the button. On a "Not from cash" answer, that button is the main way to the next step.
**Fix:** Keep the live region on a view that holds only the text, and render the pill outside it:
```tsx
<View style={[styles.result, { backgroundColor: colors.fill1 }]}>
  <View accessible accessibilityLiveRegion="polite" accessibilityLabel={settled}>
    {/* name, chips, line, monthly, basis */}
  </View>
  {copy.tryCredit ? <View style={styles.try}><Pill ... /></View> : null}
</View>
```

## Warnings

### WR-B01: A zero balance in a currency with no stored rate makes the whole Decide tab unconverted — MEDIUM

**File:** `src/features/decide/snapshot/buildSnapshot.ts:164-168, 355` (also 207-208, 416, 526); `src/data/queries/fxConvert.ts:119-125`
**Issue:** `need(amount, currency)` records a miss whenever `convertLatest` returns null. `convertLatest` returns null for a foreign currency with no rate even when `amount === 0`. A live JPY savings account at 0, or a card with a 0 floor in an unrated currency, turns every check, the quick check and Your month into "Missing rate", although no figure depends on it. It also adds a conversion basis note for currencies that contributed nothing.
**Fix:** `const need = (amount, currency) => amount === 0 ? 0 : (converter.toHome(amount, currency) ?? (converter.miss(currency), null));`. Apply the same short-circuit in `Converter.toHome`, so it adds no note for a zero amount.

### WR-B02: Transfer-category outflow series are counted as bills, while income series of the same category are left out — MEDIUM

**File:** `src/features/decide/snapshot/buildSnapshot.ts:342-343`
**Issue:** `if (s.amount < 0) bills.push(...)` has no Transfer test. The income side excludes `keyOf(s.category_id) === 'Transfer'`. A recurring transfer from checking to savings or investments with the system Transfer category becomes a recurring bill (an outgoing that reduces "left"). Its paid inbound legs are also added to `savingTotal` / `investingTotal` (lines 290-293). The same money is counted as spending and again as saving or investing, so the verdict comes out too pessimistic and the investing pause is wrong.
**Fix:** `if (keyOf(s.category_id) === 'Transfer') continue;` before the bill/income split. A transfer series to a savings or investment account could instead feed `seriesSaving` / `seriesInvesting`, keyed on the target account.

### WR-B03: Debt-category one-off payments are excluded only when a `debts` row exists — MEDIUM

**File:** `src/features/decide/snapshot/buildSnapshot.ts:270, 383`
**Issue:** `rowDebtCount` counts only loan/other `debts` rows. It is fixed before derived card debts exist (lines 455-487). If the user's only debt is a credit card with stored or market minimum terms, Debt-category card payments logged as expenses count in `expenseTotals`. The derived card minimum (line 471) is counted as well, so the same debt payment is counted twice.

The reverse also happens: one unrelated car-loan row drops every Debt-category one-off from spending, including payments to other creditors.
**Fix:** Decide the exclusion per payment. Skip a Debt-category row only when its account (or a transfer partner) is a debt that the snapshot already counts. Or compute the derived debts first and use `debts.some(d => d.minimumPayment > 0)`, with a per-account match where the data allows it.

### WR-B04: The bought-check recompute does not reopen a replaced series when Go ahead was queued offline — MEDIUM

**File:** `src/features/decide/snapshot/withoutCheckWrites.ts:297-301, 341`; caller `src/features/decide/check/useBoughtCheckComputation.ts:36-39`
**Issue:** Go ahead ends a replaced series with `end_date = inputs.needBy ?? ctx.today`, where `today` is taken on the device when the write is queued (`decideGoAhead.ts:99, 294`). The recompute rebuilds `endedOn` from `decided_at`, which the server sets to `now()` when the queued write is applied (`20261016000300_decide_outcomes.sql:281`).

A Go ahead queued offline and applied after midnight, or a device whose time zone differs from `rc.timeZone`, gives `s.end_date !== replaced.endedOn`. The replaced bill then stays ended in the "before" position. Outgoings are understated, and the bought check reads better than it was.

Separately, `seriesIds` includes replace lines with `counted: false`, which Go ahead never ended (`decideGoAhead.ts:291`).
**Fix:** Store the end date Go ahead used, for example `inputs.goEndedOn` or a link row on the ended series, and match on that. Filter `inputs.replaces` to `counted && seriesId !== null`.

### WR-B05: Lines attached to a bought check stay in the "before" position, so the purchase can be counted twice — MEDIUM

**File:** `src/features/decide/snapshot/withoutCheckWrites.ts:317`
**Issue:** Only `source === 'written'` links are stripped. A common path: Go ahead writes a pending row; the bank or an import later brings in the real paid row; the user attaches it (role `day_one`) and deletes the pending one. The attached row is the purchase itself. It stays in cash and in the month lines, and the check is applied on top of it. The recalculated pre-purchase verdict then includes the purchase twice. Keeping attached links was a deliberate choice against spoofed `written` links (05-52 T-05-52-03), but the double count it causes goes against "the purchase never counts twice".
**Fix:** Strip attached `day_one` / `payment` links only for rows dated on or after the local decided date. The server already restricts who can create links, so the remaining risk is a user editing their own record. Otherwise, at least show an Assumptions row ("N attached lines are counted in the position before this purchase").

### WR-B06: Estimate-versus-actual shows "under by the full estimate" when nothing is linked or a rate is missing — MEDIUM

**File:** `src/features/decide/journal/estimateActual.ts:53-69, 83-91`; `src/features/decide/past/usePastDecisions.ts:83-103`; `src/features/decide/past/DecisionDetailSheet.tsx:94, 203-245`
**Issue:** `checkpoint()` starts `dayOne` and `series` at 0. With no linked lines of a role, or lines that are all `amount === null`, `diffDayOne`/`diffMonthly` become `-estimate` and the tone is `under`. The list strip and the detail sheet then say "−$X under". `compareEstimate` returns `skipped`, but no caller reads it. This contradicts `pastDecisions.ts`' own rule ("a figure with no linked line of its role is null, never zero", 04 D-56) and tells the user their real spend was lower than it was.
**Fix:** Make `dayOneActual`/`monthlyActual` `number | null`. Use null when no paid line of that kind exists in the window, or when `skipped > 0` for it. Render the dash and skip the diff in both screens. In `deltaFor`, return null when `latest.monthlyActual === null`.

### WR-B07: "Final price" in the decision detail shows the advertised price in the home currency — MEDIUM

**File:** `src/features/decide/past/DecisionDetailSheet.tsx:80, 191, 250`; `src/features/decide/past/PastDecisionsScreen.tsx:173-195`
**Issue:** `price = inputs.advertised` is the price before tax, fees and trade-ins, but the row is labelled `decide.past.finalPrice` ("Final price"). Every amount is also formatted with `whole`, which is bound to `rc.homeCurrency`, even when `inputs.currency` differs.
**Fix:** Show `resolvePriceInputs({ advertised, adjustments })` (via `toEngineCheck(...).resolvedPrice.price`), or relabel the row "Quoted". Format with `inputs.currency ?? ctx.home`.

### WR-B08: Quick-check parsing takes the first number, so "iPhone 15 Pro 1199" is judged at 15 — MEDIUM

**File:** `src/features/decide/quickParse.ts:262-276`
**Issue:** `FIRST_NUMBER` matches the first digit run. Model numbers, quantities and years ("2 tickets 150", "PS5 499", "Sofa 2024 1800") become the price. The answer is computed on the wrong figure. The result line does not echo the parsed price, so the user cannot see the mistake. `ALL_NUMBER_CHARS` also removes every digit, `.` and `,` from the name ("Mr. Coffee" → "Mr Coffee"), and `toUpperCase` on the first character turns "iPhone" into "IPhone".
**Fix:** Use the last number in the text (or the one next to a currency symbol). Strip only that match from the name, and keep the name's casing. Show the parsed price in the result ("{name} at {price}").

### WR-B09: Compliance — Your month says the average "is safe to plan on" — MEDIUM

**File:** `src/features/decide/home/YourMonthCard.tsx:93` (string `src/i18n/locales/en.ts:1448`, `decide.month.steadyLine`)
**Issue:** "The average is safe to plan on." is an assurance and is prescriptive. It breaks the declarative-not-prescriptive rule in CLAUDE.md. It also gets past the banned-word test (`decideCopy.test.ts:22`).
**Fix:** "{{count}} months of income within {{pct}} of each other." Add `/\bsafe to\b/i` to the BANNED list.

### WR-B10: Reconcile never fixes a reminder whose time changed or that the OS dropped — MEDIUM

**File:** `src/features/decide/notifications/waitReminder.ts:153-166`
**Issue:** Reconcile skips any check whose key exists in the map (`current[key] !== undefined`). Three cases slip through:
- If `ready_by` changes (re-wait from another session), the old time stays.
- The client schedules cooling-off at `coolingOffAt(now)` when the write is queued, while the server sets `cooling_off_at = now() + 48h` when it is applied (`decide_outcomes.sql:288`). The two times can drift without limit offline, and the server value is meant to be the source of truth (file header).
- If the OS drops scheduled notifications (restore from backup, reinstall with AsyncStorage restored, a notification that already fired), the stale key blocks rescheduling for good.
**Fix:** Store `{ id, at }` per key. In reconcile, compare against the server time and against `getAllScheduledNotificationsAsync()`. Cancel and reschedule when either differs.

## Info

### IN-B01: Decided dates use the device time zone, while the bought recompute uses the app's time zone — LOW

**File:** `src/features/decide/journal/pastDecisions.ts:143-146`; `src/features/decide/past/usePastDecisions.ts:33-36`
**Issue:** `localDateOf` uses `new Date(ts).getFullYear()/getMonth()/getDate()` (device zone). `useBoughtCheckComputation` uses `localDateIn(..., rc.timeZone)`. When the two zones differ, the decided date, the 30/90-day checkpoint windows and `attachRoleFor` are off by one day.
**Fix:** Pass `rc.timeZone` and use `localDateIn(new Date(ts), timeZone)` everywhere.

### IN-B02: The last notification response is never cleared — LOW

**File:** `src/features/decide/notifications/useNotificationObserver.ts:192, 207-209`
**Issue:** `routed` is a per-instance ref. If the host component remounts (layout remount, sign-out/in that remounts the tree), `getLastNotificationResponseAsync()` returns the same response and pushes the check again.
**Fix:** After routing, call `Notifications.clearLastNotificationResponseAsync()`.

### IN-B03: Row action buttons have identical, nameless screen-reader labels — LOW (a11y)

**File:** `src/features/decide/home/OpenChecksCard.tsx:176`; `src/features/decide/home/ChangesCard.tsx:303`; `src/features/decide/past/DecisionDetailSheet.tsx:280, 319`
**Issue:** Each row reads "Abandon this check", "Remove this change" or the same untag label. A screen-reader user moving by button cannot tell which row a button belongs to. `unlinkA11y` with an empty `v.name` reads "Unlink ".
**Fix:** Pass the row name: `t('decide.open.abandonA11y', { name })`, `removeA11y: 'Remove {{name}}'`, and fall back to the date or amount when the name is empty.

### IN-B04: Dated changes are formatted in the home currency, not the row's currency — LOW

**File:** `src/features/decide/home/ChangesCard.tsx:265`; `src/features/decide/copy/depthInputsCopy.ts:473-484`
**Issue:** `changeRowCopy(row, whole, ...)` formats `monthly_amount` with the home formatter. `ChangeSheet` edits it in `row.currency`, and the builder converts it.
**Fix:** Format with `moneyFn(fmt, currencyCode(row.currency))`.

### IN-B05: Reopen can be pressed again on a decision that already has a live reopened check — LOW

**File:** `src/features/decide/past/PastDecisionsScreen.tsx:270-279`; `src/features/decide/past/DecisionDetailSheet.tsx:181-183`
**Issue:** No check against `reopened_from` exists on the client or the server (no unique index), so each press creates another open check from the same decision. The duplicates then stack against each other in `selectOtherChecks`.
**Fix:** Hide or disable Reopen when a live check has `reopened_from === d.id`, and navigate to that check instead.

### IN-B06: "Run the full check" saves inputs with `currency: null` — LOW

**File:** `src/features/decide/snapshot/checkInputs.ts:358-390`; `src/features/decide/home/DecideHomeScreen.tsx:146-159`
**Issue:** The quick amounts were parsed and judged in `source.currency`, but the new check is created with `currency: null`. It is stamped only on the first draft save (`useCheckDraft.ts:62`), using whatever the home currency is at that later moment. This feeds CR-B02. `advertised: q.price` also bypasses the validated `price` local.
**Fix:** `quickToCheckInputs(q, today, currency)` → `{ ...base, currency, advertised: price, ... }`.

### IN-B07: Fallback copy can say "short by 0" — LOW

**File:** `src/features/decide/copy/quickCopy.ts:127, 136, 156`; `src/features/decide/copy/verdictCopy.ts:355, 365`; `src/features/decide/copy/depthVerdictCopy.ts:137`
**Issue:** The defensive fallbacks render `fmt(0)` shortfalls ("$0 short a month") when a warning is unexpectedly missing. That is a false statement on the trust surface. `firstReadCopy` falls back to `card_missing` for an empty reasons list (line 166).
**Fix:** Fall back to the plain state line or `decide.verdict.missing.no_full_month`, never to a zero-amount claim.

### IN-B08: Rough figures cannot record zero income — LOW

**File:** `src/features/decide/home/RoughFiguresSheet.tsx:278`
**Issue:** `validAmount` requires `n > 0` for both fields. A user with no current income, the case where the answer matters most, cannot save rough figures and is left in the "nothing to judge against" state.
**Fix:** Allow `n >= 0` for income (and for spending, if the engine accepts it).

---

_Reviewed: 2026-10-21_
_Reviewer: Claude (gsd-code-reviewer), part B_
_Depth: standard_


## Part C

# Phase 5 Part C: Code Review Report (five-step check flow)

**Reviewed:** 2026-10-21
**Depth:** standard. I read every file in scope and followed the calls into `src/shell/decide/CommitMutationsProvider.tsx`, `src/data/mutations/decideGoAhead.ts`, `decideOutcome.ts`, `decideChecks.ts`, `src/db/decideChecks.ts`, `snapshot/withoutCheckWrites.ts`, `snapshot/checkInputs.ts`, `src/ui/Sheet.tsx`, `src/shell/navigation/pushOnce.ts`, `swipeBackGesture.ts` and the `record_decide_go` / `record_decide_outcome` RPCs. Those files are not part of this review's scope.
**Status:** issues_found

## Summary

The flow is mostly well put together. The verdict stays live, `canWrite` dry-runs the same builder, read-only checks are guarded at `useCheckDraft.update`, and the draft save is guarded server-side with `status = 'open'`. But several paths let the user lose work, see a list that does not match the write, or have one purchase counted twice:

- A toast Undo calls an `update` closure from an earlier render. It rebuilds the inputs from that render's state and reverts every edit made after the removal (CR-C01).
- The same recurring bill can be added twice as "replaced". The engine then subtracts it twice, and the RPC refuses the whole Go ahead after its rows have landed (CR-C02).
- "What gets written" disagrees with `buildGoAheadWrite` in two cases: an invest lump when the transfer category is unresolved, and replaced series when the series query is not loaded (CR-C03, CR-C04).
- Go ahead can write to an archived account or to an account in another currency. The bought-check recompute then double counts the purchase (CR-C05).
- `inputs.currency` (the stamped currency) is never reconciled with `source.currency`. Fields parse amounts in one currency, while the engine and the write use another (CR-C06).
- There is no in-flight guard on any commit path, on Reopen, or on the confirm sheet (CR-C07).

Severity mapping: high goes under Critical Issues (CR); medium and low go under Warnings (WR); info goes under Info (IN). Each finding states its severity explicitly. No finding is rated critical.

## Critical Issues

### CR-C01: A toast Undo reverts every edit made after the removal (stale `update` closure) — severity: high

**File:** `src/features/decide/check/useCheckDraft.ts:112-133`. The stale closures are captured at `steps/Step2PriceAndPay.tsx:76-91`, `steps/Step1Item.tsx:93-107` and `sections/SetbacksSection.tsx:307-321`.
**Issue:** `update` is a `useCallback` that depends on `edited`, and it rebuilds the inputs as `base = pending.current ?? edited ?? …`. The remove handlers hand `onUndo` the `update` from the render in which the line was removed. Here is the failure sequence:
1. The user removes a line.
2. More than 600 ms pass, so the draft flushes and `pending.current = null`.
3. The user edits the price or name.
4. The user taps Undo on the toast.

The old closure then computes `base` from the stale `edited` of step 1. Only the list is refreshed from `latest.current`. Every field edited after the removal reverts and is autosaved, so the work is lost silently. The stale `status` and `decided` values in that closure also let an Undo modify a check that has since been decided. The local state changes, and the save is then refused by the server.
**Fix:** keep the latest inputs and guards in refs inside the hook, so that every `update` closure reads the current values:
```ts
const latestInputs = useRef<CheckInputs>(inputs);
latestInputs.current = inputs;               // or set in an effect
const guard = useRef({ status, decided });
guard.current = { status, decided };
const update = useCallback((patch, opts) => {
  if (guard.current.status !== 'ready' || guard.current.decided) return;
  const base = pending.current ?? latestInputs.current;
  ...
}, [row, flush]);
```
Then add a test: remove a line, wait past the debounce, edit the price, Undo, and expect the price to be kept.

### CR-C02: The same recurring bill can be "replaced" twice, giving a double-counted saving and a refused Go ahead — severity: high

**File:** `src/features/decide/check/LineEditorSheet.tsx:113-128`, `src/features/decide/check/steps/Step1Item.tsx:109-117`. On the write side: `src/data/mutations/decideGoAhead.ts:290-295` and the RPC's end-series loop.
**Issue:** The "From your recurring bills" list offers bills that are already in `inputs.replaces`, and `addReplace` does not dedupe by `seriesId`. If the same bill is added twice, `netRunningCosts` subtracts it twice. The verdict is then too generous, which is a wrong answer about real money. `buildGoAheadWrite` also pushes two `endSeries` entries with the same id and version. `record_decide_go` calls `end_recurring_series` twice, and the second call is not `applied`, so the RPC raises an error. That happens after `insertTransactionsBatch` has already landed the rows, so the user gets "saved without undo" rows and a check that is still open.
**Fix:** In Step1Item, pass `recurringBills.filter(b => !inputs.replaces.some(l => l.seriesId === b.id))`. In `addReplace`, refuse a line whose `seriesId` is already present. Defensively, dedupe `endSeries` by id in `buildGoAheadWrite`, and ignore duplicate `seriesId` lines in `toEngineCheck`.

### CR-C03: "What gets written" promises a transfer into the investment account, but the write records a pending expense — severity: high

**File:** `src/features/decide/check/writtenLines.ts:485-489`, compared with `src/data/mutations/decideGoAhead.ts:182-218`. The context is built at `src/features/decide/check/useCommitDecision.ts:219-235`.
**Issue:** `writtenLines` lists `writtenInvestTransfer` whenever `investAccountId !== null && investAccountName`. The builder writes a transfer only when `ctx.transferCategoryId !== null` as well. `lookup.transferCategoryId` is null while the categories query is loading, or when the Transfer category is missing. In that case `canWrite` still returns true, because the builder falls back to `addRow(cash, -dayOne, 'day_one')`. The confirm sheet tells the user money moves into the investment account, but the app writes an ordinary pending outflow. This breaks the "the list you read is the list we write" contract (D-09).
**Fix:** Mirror the builder's condition exactly: add `transferCategoryAvailable: boolean` to `WrittenCtx` and branch on `investAccountName && transferCategoryAvailable`. Alternatively, have `goBlocked` return a reason, for example `decide.decision.goNeedsTransferCategory`, when an invest account is chosen and `transferCategoryId === null`. Better still, derive the lines from `buildGoAheadWrite`'s dry-run output, so the two cannot drift apart.

### CR-C04: "Closes N recurring bills" can be listed while nothing is ended — severity: high

**File:** `src/features/decide/check/writtenLines.ts:544-555`, `src/features/decide/check/useCommitDecision.ts:223-224`, `src/data/mutations/decideGoAhead.ts:290-295`.
**Issue:** `closed` counts every counted replace line that has a `seriesId`. The builder ends only the series it finds in `ctx.replacedSeries`. That list is built from `seriesQuery.data ?? []`, so it is empty while `useRecurringSeries` is loading, or when a series has since been deleted. The confirm sheet says the replaced bills end, and Go ahead leaves them running. The verdict had already subtracted them, so from then on the user's months carry both the old expense and the new one. That double count feeds every later check.
**Fix:** Pass `ctx.replacedSeries` into `writtenLines` and count `closed` from it. Also make `goBlocked` wait for `seriesQuery.data !== undefined` when any counted replace line has a `seriesId`, using a reason such as `goUnavailable` or a loading state. Show the user any replace line whose series no longer exists.

### CR-C05: Go ahead can write to an archived account or a different-currency account, then double counts the purchase — severity: high

**File:** `src/features/decide/check/useCommitDecision.ts:216`, `src/features/decide/check/CheckFlowScreen.tsx:344-347`, `src/features/decide/check/steps/Step5Decision.tsx:85-91,236`.
**Issue:**
1. Stale account id. `cashAccountId = inputs.goAccountId ?? largestCash(...)` trusts a stored `goAccountId` even when that account is no longer in `cashAccounts` (archived, deleted or foreign). The Step 5 effect only fills the field when it is null. The user sees no selected radio and an empty account name in "What gets written" and in the confirm sheet. The rows are still written to the hidden account.
2. Currency. `cashAccounts` is not filtered by currency, yet `buildGoAheadWrite` stamps every row with `original_currency: ctx.currency`, the home currency. The comment in `withoutCheckWrites` assumes Go ahead writes in the account's currency. When a row on a foreign-currency account becomes paid, `withoutCheckWrites` does not add it back to the balance, because the currencies differ, but it still removes the row. The bought-check recompute then counts the purchase twice.
3. Display and default. `largestCash` compares balances across currencies, and Step 5 formats each account's balance with `fmt(source.currency)`.

**Fix:** Build `cashAccounts` with `a.currency === source.currency`, or carry the currency and filter it in both places. In `useCommitDecision`, resolve `cashAccountId` as `cashAccounts.some(a => a.id === inputs.goAccountId) ? inputs.goAccountId : largestCash(cashAccounts)`, and do the same in Step 5. Format each balance in its account's currency.

### CR-C06: The check's stamped currency is never reconciled with the snapshot currency — severity: high

**File:** `src/features/decide/check/useCheckDraft.ts:47,62`. Fields parse amounts in `inputs.currency ?? source.currency` at `steps/Step1Item.tsx:62`, `steps/Step2PriceAndPay.tsx:67`, `steps/step2/MethodPanels.tsx:108,219,229,341`, `steps/step2/RunningCostPrompts.tsx:63,113` and `steps/step1/IncomeChangeCard.tsx:36`. The engine, formatting and write use `source.currency` at `useCommitDecision.ts:227` and through every `moneyFn(..., source.currency)` call.
**Issue:** Per D-37, a check records the currency its amounts were typed in. The flow, however, always computes, formats and writes those minor-unit integers as `source.currency`, the current home currency. If the home currency changes after a check was typed (for example JPY with exponent 0 to GBP with exponent 2), ¥150,000 is read as £1,500.00. The verdict is then wrong by a factor of 100 at the exponent boundary, and Go ahead writes that amount. While both currencies are set, the input fields parse in one currency and display in the other. Separately, `flush` stamps the currency only into the saved JSON and never back into `edited` or `pending`. Each save therefore re-stamps from the current `homeCurrency`, which breaks "never changes it" within a session.
**Fix:** When `inputs.currency !== null && inputs.currency !== source.currency`, either convert at the stored rate in the snapshot layer, or treat the check like the `unconverted` status: show a "typed in X" verdict and block Go ahead and Wait. Use one currency (`inputs.currency ?? source.currency`) for parsing, formatting and `ctx.currency`. In `flush`, write the stamped currency back with `pending.current = stamped; setEdited(stamped)` on the first save.

### CR-C07: No in-flight guard on commit or Reopen, so a double tap can double-write — severity: high

**File:** `src/features/decide/check/useCommitDecision.ts:284-307` (`confirmGo`) and `309-362` (`requestCommit`), `src/features/decide/check/CheckFlowScreen.tsx:417-423` (`reopenCheck`), `src/features/decide/check/CheckActionBar.tsx:51-58`.
**Issue:**
- Wait and Pass commit immediately. The button only disappears once `readOnly` flips, and that happens only after the mutation's `onMutate` has awaited `cancelQueries`. During the pop animation that follows `onDone`, the button can still be pressed. A second press queues a second outcome mutation and schedules the reminders again. Before invalidation, the optimistic cache shows two goals with different UUIDs. `onDone()` runs twice, so `router.back()` runs twice and can pop past Decide.
- `confirmGo` has no guard either. A second confirm before the re-render builds a new write with fresh UUIDs. Its `insertTransactionsBatch` lands, then `record_decide_go` refuses the call because the check is already decided. The duplicate transactions stay, shown as "saved without undo": the purchase is in the ledger twice.
- `reopenCheck` mints a new UUID on every call. Each call therefore has a different href, so `pushOnce` does not dedupe them. A double tap creates two open checks and pushes two screens. With "With other checks" on, the two open checks stack into each other's verdict, so the same purchase is counted twice.

**Fix:** Add a `committing = useRef(false)` latch in `useCommitDecision`. Return early from `requestCommit` and `confirmGo` when it is set, and set it before any mutation. Expose it so the action bar's primary button can be disabled. Use the same latch for `reopenCheck`. Prefer `router.replace` for the reopened check (see WR-C08).

## Warnings

### WR-C01: Wait and Pass commit without flushing the pending draft, so stored inputs miss the last edits — severity: medium

**File:** `src/features/decide/check/useCommitDecision.ts:318-359`, `src/features/decide/check/CheckFlowScreen.tsx:562`.
**Issue:** On step 5 the user taps the "Wait and save" card, which is a debounced `update({ outcome })`. They then tap the commit button within 600 ms. `record_decide_outcome` does not write `inputs`, so the stored check keeps `outcome: null`, the old `wait.monthlyAmount` and the old `coolingOff`. The unmount flush that follows is refused (`status = 'open'` no longer matches) and records a spurious failed write. The goal name comes from the stale `row.name`. Later the read-only view, and the bought recompute's `replaces` and `needBy` (see WR-C02), read those stale stored inputs.
**Fix:** Call `draft.saveNow()` (flush) before `mutations.waitAndSave`, `mutations.pass` and `mutations.goAhead`, so the draft save is queued ahead of the commit in `WRITE_SCOPE`. Pass a `flush` callback into `useCommitDecision`.

### WR-C02: The bought-check recompute can still double count — severity: medium

**File:** `src/features/decide/check/useBoughtCheckComputation.ts:35-41`.
**Issue:**
1. While Go ahead is still queued (offline, `row.pending`), `onMutate` has placed the optimistic rows in the month cache and marked the check `bought`. But `decideLinks` has no `written` links yet, so `withoutCheckWrites` removes nothing. Opening the decided check shows the purchase counted twice.
2. `endedOn` is `needBy ?? localDate(decided_at)`, and `decided_at` is the server's `now()` when the RPC replays. The builder ended the series at `needBy ?? ctx.today` at tap time. After an offline replay that crosses midnight, or a time-zone difference, `s.end_date === endedOn` fails, so the replaced series is not reopened. The replaced expense is then subtracted twice: once because the base month no longer has it, and once through `running.replaced`.

**Fix:** For case 1, when `row.pending` is set, or there are no written links yet for a bought row, show a "still saving" state or use the queued `GoAheadVars` row ids. For case 2, reopen any replaced series whose `end_date` was set by this check: record the end date in the decision or the link rows, or compare against the series' change log.

### WR-C03: Seen-state is lost to a version conflict and is marked only once per mount — severity: medium

**File:** `src/features/decide/check/CheckFlowScreen.tsx:296-308`. Related: `src/data/mutations/decideChecks.ts` (`useMarkCheckSeen` uses `expectedVersion: row.version`, and `saveCheckDraft` never calls `recordWrittenVersion`).
**Issue:** Offline, or on a slow connection, a draft save queued just before the user taps Next to step 3 bumps the server version through `bump_version()`. `markSeen` was sent with the cached version, so it hits `VersionConflictError`. The seen state is dropped, a failed write is recorded, and `marked.current` stays true, so it is never retried. In addition, `marked` and `completed` are set once per mount. If the user goes back, changes the price (and so the verdict), and returns to step 3, the newly seen state is never recorded. "Changed since you looked" (D-15) then compares against a state the user did not see last.
**Fix:** Have `saveCheckDraft` record its written version (`recordWrittenVersion('decide_checks', id, ..., row.version)`) so the next edit resolves the right expected version, or make seen-state a version-free update. Replace the `marked` ref with a "last marked state and basis" ref and call `markSeen` on each step-3 visit; `markSeen` already skips calls that change nothing.

### WR-C04: The card APR is saved only on blur, and that write is not guarded on a decided check — severity: medium

**File:** `src/features/decide/check/steps/step2/MethodPanels.tsx:270-323`, `src/features/decide/check/CheckFlowScreen.tsx:316-337,539`. The same blur-only commit appears at `steps/Step4Alternatives.tsx:148-155` and `steps/step4/RateChips.tsx:357-365`.
**Issue:** The ScrollView uses `keyboardShouldPersistTaps="handled"`, so tapping Next, a chip or a method card does not blur the focused `RateInput`. A typed card rate is then never saved. The verdict and plan keep using the stored APR while the field shows the typed one, so the user reads figures built on a rate they did not type. The same applies to a typed projection rate. In addition, the card `RateInput` gets no `readOnly`, and `saveCardRate` / `saveCardTerms` do not check `readOnly`. On a decided check, a TalkBack user can focus and edit the APR (see WR-C06), and the blur writes to the card's debt record.
**Fix:** Save the rate on submit and on each valid change, debounced, rather than on blur alone. Alternatively, commit pending rate text on step change or unmount. Pass `readOnly` to the card `RateInput`, and return early from `saveCardRate` and `saveCardTerms` when `readOnly`.

### WR-C05: The confidence chip and the missing-rate link inside VerdictCard are unreachable for screen readers — severity: medium

**File:** `src/features/decide/check/VerdictCard.tsx:235-277`.
**Issue:** The card root is `accessible` with a combined label. On iOS and Android, that makes its children one focus element, so `ConfidenceChip` (`onPress` opens `ConfidenceSheet`) and the `accessibilityRole="link"` Pressable to Activity cannot be focused or activated. The nested `accessible={onEdge}` view is ignored for the same reason. Screen-reader users cannot open the confidence reasons or the fix-the-rate link (DCU-11).
**Fix:** Put only the text block in the accessible live region, and render the chip and the link as sibling focusable elements outside it. Or add `accessibilityActions` to the card, for example `[{ name: 'confidence' }, { name: 'openActivity' }]`, with an `onAccessibilityAction` handler.

### WR-C06: `Lock` hides controls from touch only, so read-only controls stay announced and activatable — severity: medium

**File:** `src/features/decide/check/steps/stepUi.tsx:89-95`.
**Issue:** `pointerEvents="none"` with 0.6 opacity does not remove controls from the accessibility tree or mark them disabled. On a decided check, TalkBack and VoiceOver announce every chip, radio, switch and remove button as active. TalkBack's click action still fires `onPress`, for example `CheckRow.onRemove` → `removeWithUndo`. `update` is a no-op there, but the "Line removed — Undo" toast still appears for a removal that never happened. Combined with WR-C04, it also allows a card-record write.
**Fix:** When `locked` is set, add `accessibilityState={{ disabled: true }}` and pass a `readOnly` / `disabled` prop down to each control, or set `importantForAccessibility="no-hide-descendants"` and render a read-only summary instead. Also guard `removeWithUndo` and the other toast-producing handlers on `readOnly`.

### WR-C07: Live inputs are mixed with settled (150 ms) detail figures — severity: low

**File:** `src/features/decide/check/CheckFlowScreen.tsx:97-114`, `steps/Step5Decision.tsx:199-207`, `useCommitDecision.ts:319-331`, `steps/Step4Alternatives.tsx:110-111`, `sections/OptionsSection.tsx:155-159`, `sections/SetbacksSection.tsx:352-360`.
**Issue:** `withCore` keeps `waitPlan`, `alternatives`, `options`, `setbacks` and `incomeAtRisk` from the settled inputs, while `check` and `resolvedPrice` are live. As a result:
- The Wait slider is controlled by the lagging `wait.monthlyAmount`, so it jitters, and quick accessibility increments within 150 ms are lost.
- Wait committed within 150 ms of moving the slider saves the previous amount.
- "Use cheaper" and "Use this price" reprice from the previous inputs.
- After a setback is removed, `report.results[i]` pairs results with the wrong live line.

**Fix:** Drive the slider from `inputs.wait.monthlyAmount`. Make commit and option actions wait for `!busy`, or recompute `buildWaitPlan` and the options synchronously from the live core at press time. Key setback results by line id, not by index.

### WR-C08: The swipe-back interceptor is cleared unconditionally, and Reopen stacks a second flow — severity: low

**File:** `src/features/decide/check/CheckFlowScreen.tsx:249-263,417-423`, `src/features/navigation/swipeBackGesture.ts:41-46`.
**Issue:** Reopen `push`es a new flow on top of the read-only one. Both screens claim the module-level interceptor. When the top screen unmounts, its cleanup calls `setSwipeBackInterceptor(null)`. The screen underneath, still on step 2 or later, loses its claim, so an edge swipe leaves it instead of stepping back. The stale decided screen also stays in the stack: after finishing the reopened check (Go ahead → `router.back()`), the user lands on the old read-only check rather than Decide.
**Fix:** Clear only your own claim: `setSwipeBackInterceptor(fn)` returns a release function that checks `interceptor === fn`, or the interceptor becomes a stack. Claim through `useFocusEffect`, so only the focused screen holds it. Use `router.replace(checkHref(newId, { step: '3' }))` for Reopen.

### WR-C09: "Save and close" says "Saved" when nothing was saved — severity: low

**File:** `src/features/decide/check/CheckFlowScreen.tsx:270-274`, `src/features/decide/check/useCheckDraft.ts:65-66,135-137`.
**Issue:** `saveNow` is a synchronous `flush`. For a new check that was never edited, nothing is created. If the user or household ids have not resolved, `flush` returns early, keeps `pending`, and the unmount flush returns early again, so the edit is dropped. In both cases the toast says "Saved".
**Fix:** Have `saveNow` return whether anything was written or queued. Show "Saved" only when it was. When ids are missing, keep the screen open, or persist the pending edit somewhere that survives unmount.

### WR-C10: Silent no-op in `confirmGo` and an unhandled promise chain — severity: low

**File:** `src/features/decide/check/useCommitDecision.ts:284-307,322-353`.
**Issue:** If the snapshot changes while the confirm sheet is open so that `goBlocked` becomes non-null, the confirm press closes the sheet and does nothing, with no message. The `waitAndSave(...).then(...)` chain has no `.catch`.
**Fix:** If `goBlocked !== null` at confirm time, show `t(goBlocked)` as a refusal toast. Add `.catch(() => showToast({ kind: 'ordinary', text: { key: 'decide.toast.saved' } }))`.

### WR-C11: An edited "replaced" bill still ends the whole original series — severity: low

**File:** `src/features/decide/check/LineEditorSheet.tsx:121,139-150`.
**Issue:** Picking a bill sets `seriesId`, `name` and `amount`. If the user then changes the amount, the verdict uses the edited amount, but Go ahead still ends the entire series.
**Fix:** Clear `seriesId` when the name or amount is edited after picking a bill, or lock the amount while `seriesId` is set and say so.

### WR-C12: The estimate gap note can be built from a silently truncated set of lines — severity: low

**File:** `src/features/decide/check/useEstimateBias.ts:140-141`.
**Issue:** `slice(0, MAX_TARGETS)` drops links beyond 200 with no signal. `toPastDecisions` and `estimateBias` then compute the past-estimate gap from partial actuals and present it as a fact.
**Fix:** When either list exceeds the bound, page the fetch, or return `NONE` instead of a partial figure.

### WR-C13: Local text state drifts from the stored value in the fee and loss-of-value inputs — severity: low

**File:** `src/features/decide/check/steps/step4/RateChips.tsx:414-427`, `src/features/decide/check/steps/step2/RunningCostPrompts.tsx:244,256-261`.
**Issue:** In `HoldingFeeInput`, editing "5.5" down to "5." shows "5." but keeps 5.5 stored and in use. Neither component resyncs its local `text` when the stored value changes from outside (an undo, a reopen, another device).
**Fix:** Call `onChange(whole)` for the trailing-point case too. Resync with a derived-state check, `if (value !== lastValue) { setText(value ?? ''); ... }`.

## Info

### IN-C01: `Number()` is used on money and on rate text — severity: info

**File:** `src/features/decide/check/CheckFlowScreen.tsx:358,465-466`, `steps/step2/MethodPanels.tsx:96`, `steps/step2/CreditTermsPanel.tsx:100`, `steps/step2/RunningCostPrompts.tsx:257`.
**Issue:** The money values are already branded integers and the rate text is only gated, so nothing is miscomputed today. But this goes against the project rule against `Number()` / `parseFloat` on money.
**Fix:** Use the money brand unwrap helper for money, and `percent(text) > percent('999.99')` for rate text.

### IN-C02: Hard-coded English in accessibility and visible text — severity: info

**File:** `src/features/decide/check/sections/LedgersSection.tsx:114` (`" to "`), `steps/step2/CreditTermsPanel.tsx:139` (`` `${thenRateText}%` ``).
**Fix:** Move both strings to i18n keys, or use `percentText`.

### IN-C03: The investing row prints "floor £0" when the floor is not set — severity: info

**File:** `src/features/decide/check/sections/LinesSection.tsx:287`.
**Issue:** D-65 says a zero investing floor means "not set".
**Fix:** When `limits.investingFloor === 0`, use a "no floor set" description.

### IN-C04: A decided bought check's "What gets written" is dated today — severity: info

**File:** `src/features/decide/check/writtenLines.ts:480`, `steps/Step5Decision.tsx:96-104`.
**Issue:** The lines use `needBy ?? today`, not the decision date.
**Fix:** For a read-only check, pass the date from `decided_at`, or hide the future-tense list.

### IN-C05: First-read "missing" with no reasons falls back to the card-missing title — severity: info

**File:** `src/features/decide/check/VerdictCard.tsx:158`.
**Fix:** Use a generic missing title as the fallback.

### IN-C06: The household share silently falls back to member 0 — severity: info

**File:** `src/features/decide/check/CheckFlowScreen.tsx:372`.
**Issue:** `Math.max(0, indexOf(...))` uses member 0's share when the user is not found among the members (relevant from Phase 8).
**Fix:** When the index is -1, use `SOLE_SHARE`.

### IN-C07: The write builder does not mirror the engine's filter on loss-of-value running-cost lines — severity: info

**File:** `src/data/mutations/decideGoAhead.ts:286-289`, compared with `src/features/decide/snapshot/checkInputs.ts:501`.
**Issue:** `parseLines` accepts `category: 'loss_of_value'` in `runningCosts`. The engine drops those lines, but the builder would write a cash expense series for them, and `writtenLines` would not count it.
**Fix:** Skip `category === 'loss_of_value'` in the builder as well, or reject that category in `parseLines`.

---

_Reviewed: 2026-10-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Part D

# Phase 5 Part D: Code Review Report

**Reviewed:** 2026-10-21
**Depth:** standard. Pre-existing files were reviewed on the Phase 5 diff only; en.ts on the diff only.
**Files reviewed:** 46
**Status:** issues_found

## Summary

Route param validation is in place (uuid regex, step whitelist, kind defaults to buy). Analytics events carry enums only (ANL-06 holds). Haptics go through the `@/ui/haptics` wrappers. I found no parseFloat or Number() on money input, and colours come from theme tokens. The copy passes the automated banned list.

Three defects are high severity:
1. The onboarding rough-figures step can trap an iOS user. Typed figures only commit on blur, the iOS decimal pad has no return key, and the only way out is Skip, which throws the figures away.
2. The import now records a statement period as a separate write. Undo does not remove it, and nothing rolls it back if the import is rejected. Decide then counts those months as complete even when they hold no rows, which bears directly on whether a verdict can be trusted.
3. The swipe-back interceptor and the hardware back listener are global and do not check focus or ownership. A check screen hidden under another screen can take the back gesture, and an unmount can wipe another screen's claim.

The medium findings: the one-off flag is not saved in the device draft, the slider changes value as soon as it is touched, the rate field rejects comma decimals, and some prescriptive or reassuring copy gets past the banned list.

## Critical and high issues

### CR-D01: Onboarding rough figures can trap iOS users, and Skip silently discards them (severity: high)

**Files:** `src/features/decide/ui/MoneyInput.tsx:43-67`, `src/features/decide/onboarding/RoughFiguresScreen.tsx:117-152`
**Issue:** `MoneyInput` only reports a value through `onBlur` and `onSubmitEditing`. It uses `inputMode="decimal"`, and the iOS decimal pad has no return key, so `onSubmitEditing` can never fire there. `RoughFiguresScreen` sits in a plain `Screen` (not a ScrollView), so tapping outside the field does not blur it either. A user who types income, then spending, and then reaches for Next finds Next disabled: `spending` is still `null` because the second field never blurred. The only route forward that does not involve re-tapping the first field is "Skip for now". Skip calls `go()` without saving and without asking, so the figures the user typed are lost. This breaks the "onboarding must not lose data" rule. The same commit-on-blur behaviour means any screen that reads a `MoneyInput` value on a button press while the field is still focused gets the stale value (for example a step-2 deposit followed straight away by "Next step").
**Fix:** Report the parsed value as the user types, and keep the error display for blur:
```tsx
const onText = (next: string) => {
  setText(next);
  if (next.trim() === '') return onChange(null);
  const r = parser.parse(next, currency);
  onChange(r.ok ? r.value : null);   // no error shown until blur
};
<TextInput onChangeText={onText} onBlur={commit} returnKeyType="done" ... />
```
Also: wrap `RoughFiguresScreen` in `<Screen scroll>` with `keyboardShouldPersistTaps="handled"` (or add an iOS `InputAccessoryView` with a Done button), and make Skip save any valid figure already entered, or ask before discarding typed figures.

### CR-D02: The statement period outlives an undone or rejected import, so Decide counts empty months as complete (severity: high)

**File:** `src/features/record/import/useStatementImport.ts:1425-1426`
**Issue:** `recordPeriod.record(...)` is queued as its own mutation, right after `importCommit.commit(...)`. It has no `stepId` or `batchId`, so:
- (a) the destructive "Imported" toast's Undo deletes the batch rows but leaves the `statement_periods` row;
- (b) if the import commit is later rejected on the server (it is fire-and-forget and queued), the period row still lands;
- (c) the period is recorded even when the user unticked rows that fall inside it.
In every case `buildSnapshot.ts:232` feeds `periods` to the engine, which then treats those months as complete. A complete month with missing rows understates spending and income, and can turn a real "no" into "fits". That is the harm the Core Value names.
**Fix:** Make the period part of the import's atomic write and undo. Either pass it in `finalize` so the import RPC inserts it in the same transaction with `batch_id`, and the undo step deletes it, or register it under the same `stepId` with a compensating delete. At minimum, record it in the import commit's `onSuccess`, and have undo of `batchId` delete periods tagged with that batch. Consider skipping the period when included rows inside `[periodStart, periodEnd]` are fewer than the rows parsed in that range.

### CR-D03: The swipe-back interceptor and back listener are global, without focus or ownership checks (severity: high)

**Files:** `src/features/navigation/swipeBackGesture.ts:41-51`, `src/features/navigation/SwipeBack.tsx:64`. The consumer is `src/features/decide/check/CheckFlowScreen.tsx:249-262`.
**Issue:** `setSwipeBackInterceptor(null)` clears whatever is registered, not just the caller's own function. CheckFlowScreen also claims in a plain `useEffect`, not on focus. Every route's `SwipeBack` layer calls the same global `interceptSwipeBack()`. Two concrete failures:
1. **Wrong screen consumes back.** The notification observer pushes `decide/check/[id]?step=3` on top of whatever is open, including another check at step ≥2. Once the top check reaches step 1 or pops, the hidden check's `hardwareBackPress` listener is still registered. BackHandler is LIFO, so Android back on the visible screen steps back the invisible check and returns `true`, and the visible route never pops. The same happens for any stack screen pushed above a check at step ≥2: its edge swipe and hardware back go to the hidden check.
2. **Claim wiped by another unmount.** When the top check unmounts, its cleanup sets the interceptor to `null`. The check underneath, still at step ≥2, has lost its claim, because its effect only re-runs on a step change. Its edge swipe now pops the whole flow instead of stepping back (A5/A8 regression).
**Fix:** Make the claim token-based, and claim only while focused:
```ts
export function claimSwipeBack(fn: () => boolean): () => void {
  interceptor = fn;
  return () => { if (interceptor === fn) interceptor = null; };
}
// CheckFlowScreen
useFocusEffect(useCallback(() => {
  if (step === null || step <= 1) return undefined;
  const stepBack = () => { ...; return true; };
  const release = claimSwipeBack(stepBack);
  const sub = BackHandler.addEventListener('hardwareBackPress', stepBack);
  return () => { sub.remove(); release(); };
}, [step]));
```
Better still, scope the interceptor per route: key it by route key, and have `SwipeBack` pass its own `route.key` so only the swiping screen's claim is consulted.

## Warnings (medium and low)

### WR-D01: The one-off flag is not saved in the entry draft and is lost on restore (severity: medium)

**Files:** `src/features/record/entry/transactionForm.ts:39`. The gap is in `src/features/record/entry/draftForm.ts:29-48`, which this change did not update.
**Issue:** `FormState.oneOff` is new, but `toDraftForm` does not write it and `DraftForm` has no field for it. A new entry marked "One-off, won't recur" that is restored from the device draft (app killed, sheet re-opened) comes back with `oneOff: false`. The user's choice is lost without notice, and the line is saved into Decide's averages. This is a Record regression against the one-off toggle.
**Fix:** Add `oneOff: boolean` to `DraftForm`. Write `oneOff: state.direction === 'transfer' ? false : state.oneOff` in `toDraftForm`. Read it back in `fromDraftForm`, where the caller's `withDirection` keeps the transfer invariant. Add a round-trip case to `draftForm.test.ts`.

### WR-D02: StepSlider jumps to the touched value before the pan activates, so scrolling can change the deposit (severity: medium)

**File:** `src/features/decide/ui/StepSlider.tsx:216-220`
**Issue:** `.onBegin((e) => fromX(e.x))` fires on touch-down, before `activeOffsetX([-8, 8])` decides the gesture is horizontal. A vertical scroll whose finger lands on the slider row (on Step 2, 4 or 5) commits a new deposit, cheaper ratio or wait amount, with a haptic, even though the user only meant to scroll. It is easy to miss, and it changes the inputs to the verdict.
**Fix:** Move the jump to `onStart` (fires on activation) and add `.failOffsetY([-10, 10])`. If tap-to-set is wanted, add a separate `Gesture.Tap()` composed with `Gesture.Exclusive(pan, tap)`.

### WR-D03: RateInput rejects comma decimal separators (severity: medium)

**File:** `src/features/decide/ui/RateInput.tsx:9, 32-34`
**Issue:** `TYPING = /^\d{0,4}(\.\d{0,10})?$/` accepts only `.`. In regions that use a decimal comma (de, fr, es, nl and others), the iOS decimal pad only shows `,`. That keystroke is silently dropped, so "4,5" cannot be typed and the user cannot enter a fractional rate at all. The money parser is region-aware, so this field is inconsistent with the rest of the app.
**Fix:** Normalise the separator before testing, and keep the canonical text in `.` form for the engine:
```ts
const decimal = useDecimalSeparator(); // from the region formatter
onChangeText={(raw) => { const t = raw.replace(decimal, '.'); if (TYPING.test(t)) onChange(t); }}
value={value.replace('.', decimal)}
```

### WR-D04: Copy that reassures or prescribes gets past the banned list (severity: medium)

**File:** `src/i18n/locales/en.ts`
- `:1448` `steadyLine`: "The average is safe to plan on." This is an assurance about future planning, not a record. Use: "{{count}} months of income within {{pct}} of each other, so the check uses the average."
- `:1688` `spendTitle`: "Spend less, keep the rest working". This is an imperative, and "keep the rest working" frames the money as invested. Use: "The cheaper one, and what it leaves". `spendSub` "The cheaper one is not just cheaper…" is persuasive. Use: "The difference stays yours for the whole {{count}} months."
- `:1661` `optSaveFirst`: "Save first, then buy" is an imperative among options. Use: "Saving first, then buying".
- `:1406` `tryCredit`: "Try on credit" reads as a nudge toward credit. Use: "See it on credit".

Extend `decideCopy.test.ts` BANNED with `/\bsafe to\b/i` and a leading-imperative check for option titles.

### WR-D05: MoneyInput does not clear when the value is reset to null from outside (severity: low)

**File:** `src/features/decide/ui/MoneyInput.tsx:35-41`
**Issue:** The sync block only rewrites `text` when `value !== null`. A parent reset to `null` (for example a method switch clearing a deposit) leaves the old text visible. The field shows an amount the parent considers empty, and a later blur re-commits it. `error` is not cleared either.
**Fix:** `if (value === null) { if (text !== '' && parser.parse(text, currency).ok) setText(''); setError(null); } else { ... }`. Compare against the last value this field reported, so an invalid in-progress entry is not wiped.

### WR-D06: snapToStep cannot reach max, and step <= 0 gives NaN (severity: low)

**File:** `src/features/decide/ui/StepSlider.tsx:184-189`
**Issue:** `maxSteps = Math.floor((max - min) / step)`, so when `price` is not a multiple of `DEPOSIT_STEP` (`MethodPanels.tsx:115-117`), a 100% deposit cannot be set from the slider or from VoiceOver increment. A `step` of 0 or less gives `Infinity`/`NaN` values.
**Fix:** `if (step <= 0) return min;` then `const k = ...; const v = min + k * step; return v >= max - step / 2 ? max : v;`, which lets the last notch snap to `max`. Document that `max` is the only off-grid value allowed.

### WR-D07: Cash path x labels are positional and can mislabel short series (severity: low)

**Files:** `src/features/decide/charts/chartGeometry.ts:84-89`, `src/features/decide/charts/CashPathChart.tsx:183-189, 249-257`
**Issue:** `xTicks` dedupes through a Set, but the chart labels by array position `k`. With a path shorter than 4 points, the last index is labelled "+30 d". The labels are hard-coded to +30/+60/+90 whatever `length` is, so if the engine's path is not 91 points they do not match the dates. With `length === 0`, `cur` becomes `-1` and `withPurchase[-1]` (undefined) is formatted.
**Fix:** Build each label from the tick index (`i === 0 ? today : t('…plusDays', { n: i })`), or derive the date with `dateOfDay`. Guard with `if (length < 2) return null` before rendering the scrub readout.

### WR-D08: NetWorthChart axis labels are bare indices, and the alt text has gaps (severity: low)

**File:** `src/features/decide/charts/NetWorthChart.tsx:312-319, 362-369`
**Issue:** The x labels show `String(i)` (for example "30") with no unit and no localisation. When only one series is all-null but `rangeCode` is not `exceeds_range`, the alt text reads "… {{with}} with this, without, …" with an empty slot.
**Fix:** Use a catalogue key `'{{count}} mo'` with i18n number formatting. When either end value is null, fall back to `invest.tooLarge` in the alt string, matching `endLabel`.

### WR-D09: GoalProgress shows 0% for very large saved amounts and "of 0" without a target (severity: low)

**File:** `src/features/decide/ui/GoalProgress.tsx:26-31, 44-47`
**Issue:** When `saved * 100` is not a safe integer and `saved < target`, the function returns 0. The bar then reads empty although nearly all of the goal may be saved. With `target === null` and `saved !== null`, the caption formats "{saved} of 0".
**Fix:** Use `Number((BigInt(saved) * 100n) / BigInt(target))` for the unsafe branch. Use a separate caption key when `target` is null or 0 or less.

### WR-D10: CheckRow's remove control stays active when the row is disabled (severity: low)

**File:** `src/features/decide/ui/CheckRow.tsx:53-62`
**Issue:** `disabled` disables the checkbox only. On a read-only (decided) check, the remove target can still delete a line.
**Fix:** Pass `disabled={disabled}` and `accessibilityState={{ disabled }}` to the remove `Pressable`, or hide it when disabled.

### WR-D11: CommitMutationsProvider value is not memoised, and canWrite hides all errors (severity: low)

**File:** `src/shell/decide/CommitMutationsProvider.tsx:15-27`
**Issue:** A new `value` object on every render re-renders every consumer and invalidates any `useCallback`/`useEffect` in the check flow that depends on it. `canWrite` catches every exception, including programming errors such as a TypeError from a bad arg shape, and reports them as "can't write". That hides real bugs behind the `goUnavailable` copy.
**Fix:** `useMemo(() => ({ ... }), [go.goAhead, wait.save, pass.pass])`. In `canWrite`, catch only the build's own validation error class and rethrow anything else (or report it to Sentry).

### WR-D12: DateField refuses an earlier date without any feedback (severity: low)

**File:** `src/features/record/entry/pickers/DateField.tsx:43`
**Issue:** The guard is correct, but on iOS the inline or spinner picker keeps showing the refused date, so the visible picker and `value` disagree. On Android the dialog closes and nothing happens. The user gets no indication.
**Fix:** On refusal, clamp to `minDate` (`onChange(minDate)`) or show an inline hint. On iOS, force the picker back to `value` so the two cannot disagree.

### WR-D13: Notification routing is enabled when the profile is missing (severity: low)

**File:** `app/(app)/_layout.tsx:80`, with `src/features/consent/useConsent.ts:51`
**Issue:** `enabled={!needsPrompt}`, and `needsPrompt` is `false` when `profile === null` (a failed or empty profile fetch). A reminder tap then routes into a check even though consent was never established. This contradicts "notification taps route only after consent".
**Fix:** Pass `enabled={!loading && consent !== null}` (expose `consent` from `useConsent`) rather than `!needsPrompt`.

## Info

### IN-D01: A category tint is reused as the warning tint (severity: info)

**Files:** `StateChip.tsx:24`, `ConfidenceChip.tsx:28`, `EdgeTag.tsx:17`, `WarningCard.tsx:23`
**Issue:** Each of these uses `categoryTint.Business` as the ochre warning background. It is a §2 token, but a change to the Business category colour would silently change every warning surface.
**Fix:** Add a named alias in tokens (`warnTint = categoryTint.Business`) and use that.

### IN-D02: React keys come from display strings (severity: info)

**Files:** `FigureStrip.tsx:41` (`key={item.caption}`), `WarningCard.tsx:37` (`key={line}`)
**Issue:** Duplicate captions or body lines produce key collisions and wrong reconciliation.
**Fix:** Use an index-qualified key such as `` `${i}-${line}` ``.

### IN-D03: Chart text alternatives are announced twice (severity: info)

**Files:** `CashPathChart.tsx:213, 260`, `NetWorthChart.tsx:345, 372`
**Issue:** The same `textAlt` is both the image's `accessibilityLabel` and visible Text below the chart, so screen readers read it twice.
**Fix:** Mark the visible copy `importantForAccessibility="no"` / `accessibilityElementsHidden`, or give the image a short label ("Cash path chart").

### IN-D04: The UUID regex is duplicated in four places (severity: info)

**Files:** `app/(app)/decide/check/[id].tsx:7`, `app/(app)/setup/first-check.tsx:4`, `app/(app)/setup/rough.tsx:4`, plus `useNotificationObserver.ts`
**Issue:** Four copies of the validation pattern risk drifting apart. `first-check`/`rough` also handle array params differently from `check/[id]`'s `one()`.
**Fix:** Export `isUuid` and `oneParam` from a shared `src/features/navigation/routeParams.ts`.

### IN-D05: Unreviewed copy, and an insurance-style prompt (severity: info)

**Files:** `src/i18n/copyStatus.ts:135`, `src/i18n/locales/en.ts:1554`
**Issue:** The entire `decide` namespace is marked draft (Claude-drafted, pending user review). It must be cleared before submission. `cardQ3` "Is there payment cover for job loss?" prompts about an insurance product (PPI-style), which sits close to product steering.
**Fix:** Run the user copy review gate before release. Consider rewording `cardQ3` to "Would a job loss stop these payments?".

### IN-D06: Magic numbers in CheckRow (severity: info)

**File:** `src/features/decide/ui/CheckRow.tsx:70, 73`
**Issue:** `borderRadius: 6`, `width: 12, height: 2, borderRadius: 1` are raw values. Remove uses a dash bar while chips use the new `CloseGlyph`.
**Fix:** Name the values (or take them from `radii`), and use `CloseGlyph` if a remove mark is intended.

---

_Reviewed: 2026-10-21_
_Reviewer: Claude (gsd-code-reviewer), part D_
_Depth: standard_
