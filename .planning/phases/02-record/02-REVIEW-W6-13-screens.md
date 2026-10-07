---
phase: 02-record
area: B (screens, routes, UI primitives, copy), waves 6-13 plus 02-31 walkthrough fixes
reviewed: 2026-10-07T20:46:40Z
depth: deep
branch: docs/02-31-rollout
diff_base: 22a506d
files_reviewed: 61
files_reviewed_list:
  - app/(app)/_layout.tsx
  - app/(app)/accounts/[id].tsx
  - app/(app)/accounts/index.tsx
  - app/(app)/activity.tsx
  - app/(app)/categories.tsx
  - app/(app)/history.tsx
  - app/(app)/import.tsx
  - app/(app)/setup/account.tsx
  - app/(app)/setup/history.tsx
  - app/index.tsx
  - src/features/auth/appHome.ts
  - src/features/consent/ConsentScreen.tsx
  - src/features/record/accounts/AccountBalanceBlock.tsx
  - src/features/record/accounts/AccountDetailScreen.tsx
  - src/features/record/accounts/AccountSheet.tsx
  - src/features/record/accounts/AccountsScreen.tsx
  - src/features/record/accounts/standingText.ts
  - src/features/record/activity/ActivityRow.tsx
  - src/features/record/activity/ActivityScreen.tsx
  - src/features/record/activity/BulkBar.tsx
  - src/features/record/activity/FilterSheet.tsx
  - src/features/record/activity/MonthSwitcher.tsx
  - src/features/record/activity/MonthTotalsBar.tsx
  - src/features/record/activity/SearchBar.tsx
  - src/features/record/activity/activitySections.ts
  - src/features/record/activity/useActivitySelection.ts
  - src/features/record/categories/CategoriesScreen.tsx
  - src/features/record/categories/CategorySheet.tsx
  - src/features/record/categories/RemoveCategoryPrompt.tsx
  - src/features/record/entry/EditScopePrompt.tsx
  - src/features/record/entry/OccurrenceActions.tsx
  - src/features/record/entry/RepeatsField.tsx
  - src/features/record/entry/TransactionSheet.tsx
  - src/features/record/entry/pickers/AccountPicker.tsx
  - src/features/record/entry/pickers/CategoryPicker.tsx
  - src/features/record/entry/pickers/DateField.tsx
  - src/features/record/entry/pickers/OptionPicker.tsx
  - src/features/record/entry/recurringForm.ts
  - src/features/record/entry/transactionForm.ts
  - src/features/record/history/HistoryScreen.tsx
  - src/features/record/history/UndoToastHost.tsx
  - src/features/record/history/undoCopy.ts
  - src/features/record/import/FormatStep.tsx
  - src/features/record/import/ImportScreen.tsx
  - src/features/record/import/MappingStep.tsx
  - src/features/record/import/MatchesStep.tsx
  - src/features/record/import/ReviewStep.tsx
  - src/features/record/import/SuggestionsStep.tsx
  - src/features/record/import/formatSentence.ts
  - src/features/record/import/importPipeline.ts
  - src/features/record/import/importUi.tsx
  - src/features/record/import/suggestionCap.ts
  - src/features/record/import/useStatementImport.ts
  - src/features/record/setup/SetupAccountScreen.tsx
  - src/features/record/setup/SetupHistoryScreen.tsx
  - src/features/record/setup/firstAccountGate.ts
  - src/features/record/useDeviceHomeCurrencyDefault.tsx
  - src/features/you/YouScreen.tsx
  - src/i18n/locales/en.ts
  - src/ui/AmountDisplay.tsx
  - src/ui/Pill.tsx
findings:
  critical: 6
  warning: 14
  info: 10
  total: 30
status: issues_found
---

# Phase 2: Code Review Report, Area B (screens, routes, UI primitives, copy)

**Reviewed:** 2026-10-07T20:46:40Z
**Depth:** deep (call chains traced into `src/data`, `src/engine/money`, `src/ui/Sheet.tsx`, the series RPC and the transfer-pair trigger)
**Files Reviewed:** 61
**Status:** issues_found

## Summary

I read every non-test file in scope from `git diff --name-only 22a506d...HEAD` under `app/`, `src/features/**`, `src/ui`, `src/i18n` and `src/state`, along with their tests. Where a screen's behaviour depends on a hook, a parser or an RPC, I followed the call into that code.

Several things are sound:
- The toast host is mounted once and does not auto-dismiss while a screen reader runs.
- Projection rows can never be selected.
- An ambiguous card reading has no pre-selected profile and blocks Confirm.
- Analytics events carry literal unions only. I found no statement content in logs, errors, toast params or analytics (D-39).
- The copy contains no advice or recommendation wording.
- Colours all resolve to §2 tokens.

The serious problems sit at the boundaries between parts:
1. **Amount prefill vs. the locale parser.** Every edit form fills its amount field with a `.`-decimal string. The region-strict parser then rejects that string, or misreads it, in comma-decimal regions. With 3-decimal currencies the result is a silent 1000x change.
2. **"This and future" vs. the series RPC.** The RPC only rewrites pending rows. The user's edit to the occurrence they opened is therefore lost.
3. **Repeats "On a date" vs. the series check constraint.** The end date defaults to today, which can be earlier than the entry's own date.
4. **`undoLabelText` vs. the toast host.** For any nameless row the host refuses the `undo.labelUnnamed.*` keys, so no Undo is shown.
5. **The non-scrolling `Sheet` vs. pickers with about 170 rows.**
6. **CSV date order and decimal mark.** Ambiguity is detected once, on the auto-detected columns only, so remapping a column can bring in an order or mark nobody chose.

Items marked "(uncertain)" depend on runtime behaviour I could not execute here. Confirm those before fixing.

## Critical Issues

### CR-01: Edit forms fill the amount with a `.`-decimal string that the region parser rejects or reads 1000x too large

**File:** `src/features/record/entry/transactionForm.ts:56-57` (used at :64, :83, :99); `src/features/record/accounts/AccountSheet.tsx:76-77` (used at :82, :96); `src/features/record/activity/FilterSheet.tsx:39-42` (used at :56-57)

**Issue:** The prefill comes from `toDecimalString`, which always writes `.` as the decimal mark (`src/engine/money/formatAmount.ts:33-40`), or from `(minor / 10 ** exponent).toFixed()` in FilterSheet, which is float maths and also always `.`. The field is then re-parsed by `useAmountParser(rc.region)`. Under D-24/WR-A10 that parser treats `.` as a group mark in de-DE, es-ES, it-IT, nl-NL, pt-BR, id-ID and tr-TR, and as an invalid character in fr-FR.

**Failure scenarios:**
- **EUR row, de-DE, edit only the note.** The prefill `"12.50"` splits into groups `['12','50']`, and the last group is not 3 digits. `validateForm` returns `ambiguous-separator`, so **no edit to any existing transaction can be saved** until the user retypes the amount. Account edits fail the same way, for example `"1234.56"` gives `ambiguous-separator`.
- **KWD/BHD/OMR/JOD/TND account (exponent 3), de-DE, rename the account.** The opening balance `"500.000"` is well grouped, so it parses as 500000.000. `signedOpening !== account.opening_balance`, so the patch silently **multiplies the opening balance by 1000** (`AccountSheet.tsx:147`). The same happens to a 3-decimal transaction amount through `toPatch`.
- **FilterSheet.** After a range has been applied, reopening the sheet and tapping "Show results" either errors or applies a range 100x/1000x wrong.

No test exercises a comma-decimal region. Every form test runs under the default `.` locale.

**Fix:** Format the prefill with the resolved locale's own separators. Add a helper next to the parser so the format and parse round-trip by construction:
```ts
// src/ui/money/useAmountParser.ts
toInputText(minor: number, exponent: number): string {
  const plain = toDecimalString(Math.abs(minor) as MinorUnits, exponent); // '1234.56'
  return separators.decimal === '.' ? plain : plain.replace('.', separators.decimal); // no grouping
}
```
Use it in `initialFormState` (pass it through `FormContext`), in `AccountSheet.magnitude` and in `FilterSheet.formatMinor`, and delete the float `toFixed` path. Add round-trip tests for de-DE and fr-FR with exponent 2 and 3.

### CR-02: "This and future" drops the user's edit to the occurrence they opened

**File:** `src/features/record/entry/TransactionSheet.tsx:333-352`; `src/features/record/entry/recurringForm.ts:57-64`

**Issue:** `applyThisAndFuture` sends only `nonTemplatePatch(patch)` (note and status) to the opened row, then calls `editFrom` with `effectiveFrom = occurrence_date`. `edit_recurring_series_from` (`supabase/migrations/20260926000400_recurring_materialisation.sql`, comment at :319-326 and the update at the end of the function) touches only `status = 'pending'` rows on or after that date. It **soft-deletes** them and materialises fresh ones from the new template.

**Failure scenarios:**
- **Paid or skipped occurrence.** The user opens March Rent (paid, £1,000), changes it to £1,100 and picks "This and future". The series changes, but March's own row is never patched, because the amount was excluded from `rest` and the RPC skips paid rows. The figure the user just typed on that row disappears.
- **Pending occurrence.** The user adds a note and changes the amount, then picks "This and future". `sendRowEdit` writes the note to row `t1`. `editFrom` (same write scope, after it) soft-deletes `t1` and materialises a new occurrence without the note. The note is lost and the separate undo step points at a deleted row.

Tests only cover a pending occurrence with an amount-only change (`recurringControls.test.tsx:220-237`), so neither case is pinned.

**Fix:** When `editRow.status !== 'pending'`, send the full `patch` to the row with `sendRowEdit`, and call `editFrom` with `effectiveFrom` set to the day after `occurrence_date`, so the RPC cannot touch the paid row. When the row is pending, either send non-template fields *after* `editFrom`, targeting the re-materialised row id the RPC returns, or carry the note through the RPC. Add tests for a paid occurrence and for a pending occurrence with a note.

### CR-03: Repeats "On a date" defaults to today, earlier than a future entry's date, and the server refuses the series

**File:** `src/features/record/entry/RepeatsField.tsx:91`; `src/features/record/entry/recurringForm.ts:32-33`; `src/features/record/entry/TransactionSheet.tsx:260-284`

**Issue:** Choosing "On a date" sets `end.date = today`. `repeatsToSchedule` checks only the `YYYY-MM-DD` shape. `recurring_series` has `check (end_date is null or end_date >= anchor_date)` (`20260926000300_recurring_series.sql:46`), and `anchor_date` is the entry's `local_date` (`seriesInputFromRow`).

**Failure scenario:** The user enters a bill due on 2026-10-20 (today is 2026-10-07), sets Repeats to Monthly with Ends "On a date", and leaves the default. On save:
- `add(input)` inserts the entry **without its own undo step** (`anchorIsNew` design).
- `createSeries` is rejected with 23514.

The result is a one-off entry and no series. The toast offers Undo for a `seriesCreated` step that was never recorded, so the entry cannot be undone from the toast and is missing from History. The same bad date can be picked for an existing row, or produced by moving the entry date after choosing an end date.

**Fix:** In `repeatsToSchedule`, take the anchor date and return `'invalid'` when `end.date < anchorDate`, with its own copy (e.g. `record.repeats.endBeforeStart`). In RepeatsField, default the end date to `max(today, entryDate)` and pass a minimum date to the `DateField` picker. Add a test for a future-dated entry with "On a date".

### CR-04: Undo is never offered for nameless rows, including deletes

**File:** `src/features/record/history/UndoToastHost.tsx:24-36, 95-101`; `src/i18n/undoLabel.ts:29-30`

**Issue:** For a step with no name, `undoLabelText` returns `{ key: 'undo.labelUnnamed.<k>' }`. `undoableLabel` accepts only keys starting with `undo.label.` (with the dot). `'undo.labelUnnamed.deleted'` does not match, so `label === null` and `canUndo === false`. The text still renders (via `l(key)`), so the toast looks normal but has no Undo button.

**Failure scenarios:**
- Deleting a Phase 1 row or an imported row with `name = null` (`TransactionSheet.tsx:373`).
- Mark paid or Skip on such a row (`ActivityScreen.tsx:113`, `OccurrenceActions.tsx:49,55`).
- A transfer add, edit or delete whose account name did not resolve (`toName === ''`).

Each of these has a real step id but shows no Undo. The `ToastView` header comment calls this toast "the only undo affordance for deletes and imports". The test "renders a nameless label without a raw placeholder (item 10)" (`history.test.tsx:95-99`) builds `{ key: 'undo.label.deleted', params: {} }` by hand, not what `undoLabelText` actually produces, and never asserts that Undo is present.

**Fix:** In `undoableLabel`, also accept the unnamed prefix:
```ts
const PREFIXES = ['undo.label.', 'undo.labelUnnamed.'];
const prefix = PREFIXES.find((p) => key.startsWith(p));
if (!prefix) return null;
const labelKey = key.slice(prefix.length);
```
Do the same for the message branch at :85. Better still, carry `labelKey` and `labelParams` on `ToastState` instead of reverse-parsing the i18n key. Change the item-10 test to call `undoLabelText('deleted', {})` and assert `getByLabelText('Undo')`.

### CR-05: Picker sheets with long lists cannot scroll, so most currencies and the Cancel header are unreachable

**File:** `src/features/record/entry/pickers/OptionPicker.tsx:18-35`, `CategoryPicker.tsx:19-46`, `AccountPicker.tsx:20-37`; `src/features/record/activity/MonthSwitcher.tsx:82-94`. Root cause: `src/ui/Sheet.tsx:37-53`.

**Issue:** `Sheet` renders children in a plain `View` inside a `flex: 1; justifyContent: 'flex-end'` container, with no `maxHeight` and no `ScrollView`. The currency picker maps about 170 options (`useCurrencyOptions` doc comment), at 44pt or more each, into it. The content is taller than the screen and is bottom-anchored, so it overflows upward. The top rows and the `SheetHeader` (title and Cancel) render off-screen and cannot be reached.

**Failure scenario:** On the onboarding AccountSheet, or the entry sheet's Currency row, a user cannot reach EUR or GBP. Only the alphabetical tail of the list is on screen. Category lists past about 15 entries, and the month list after a year or two of data, have the same problem. Hardware back still dismisses on Android. On iOS only the backdrop does, and the sheet covers it. **(Static layout analysis, high confidence. Confirm on the iPhone XR or Pixel.)**

**Fix:** Give `Sheet` a `maxHeight` (for example `windowHeight - insets.top - space.groupGap`). Have the list pickers render their rows in a `ScrollView`, or in a `FlashList` for the currency list, below a fixed `SheetHeader`.

### CR-06: CSV date order and decimal mark ambiguity is fixed at file read, so a remapped column gets an order nobody chose

**File:** `src/features/record/import/useStatementImport.ts:584-587, 600-607`; `src/features/record/import/importPipeline.ts:118-126`

**Issue:** `prepareCsv` infers `dateGuess`, `dateAmbiguous`, `notationGuess` and `notationAmbiguous` once, from the *detected* `mapping.date` and amount columns. `setMapping` changes the mapping and redrafts, but never re-infers. `dateNeedsChoice` and `notationNeedsChoice` keep reading `m.prepared.csv.*`.

**Failure scenario:** Detection picks "Posting Date" (has a day above 12, so DMY is certain and `dateAmbiguous = false`). The user remaps Date to "Transaction Date", where every value is 12 or below (`03/04/2026`). The new column is never checked, so it is parsed as DMY without asking, and lines can land in the wrong month. A remapped amount column with `1.234`-style values is likewise parsed with a decimal mark inferred from other columns. This breaks the "date order is never auto-picked" rule (E-CR-02).

**Fix:** In `setMapping`, when `mapping.date` changes, re-run `inferDateFormat` and `resolveDateFormat` on the new column and reset `dateChosen` and `dateEdited`. Do the same with `inferNumberNotation` when any amount-role column changes. Store the per-mapping guesses in `Machine` rather than reading them from `prepared.csv`. Add a hook test that remaps to an ambiguous date column.

## Warnings

### WR-01: Opening a transfer leg falls back to editing a single leg when the partner is not loaded

**File:** `src/features/record/entry/TransactionSheet.tsx:97-108`; `src/data/queries/activity.ts:53-61`

**Issue:** If `useTransferLegs` is not loading but returns no pair, the sheet opens in plain `edit` mode for one leg. With TanStack v5, a paused (offline) or errored query reports `isLoading === false`, and so does a freshly queued transfer the server does not have yet.

**Failure scenario:** The user edits the amount on one leg. `check_transfer_pair` (`20260926000700_transfer_pairs.sql`) checks count, accounts and signs, but not amounts, so the edit is accepted and the pair is now 50 out / 40 in. Delete removes one leg optimistically, and the trigger then rejects it with 23514, which becomes a parked failed write.

**Fix:** When `transferId !== null` and no full pair resolved, show a read-only state (for example "Both sides of this transfer are needed to change it") instead of `SheetBody` in edit mode. Use `query.isPending` together with `fetchStatus` rather than `isLoading`.

### WR-02: Bulk actions fail silently when rows are selected but none qualify

**File:** `src/features/record/activity/ActivityScreen.tsx:126-161, 270`

**Issue:** `onBulkMarkPaid`, `onBulkMarkUnpaid` and the `catch` in `confirmBulkDelete` call `setHint(true)`, but the bar only shows the hint when `selection.count === 0`.

**Failure scenario:** The user selects three paid rows and taps "Mark paid". Nothing happens and nothing is announced. If the bulk delete is over the limit, or `planBulkPatch` throws for any other reason, the bare `catch {}` swallows it and nothing is shown. The hint copy "Select some rows first." would be wrong in these cases anyway.

**Fix:** Use separate hint states, such as `nothingToMark` ("None of the selected lines are still to come") and `tooMany`, and render them whatever the count. Narrow the `catch` to `RangeError` and rethrow anything else.

### WR-03: The suggestion cap is checked only by the UI and goes stale after returning to Review

**File:** `src/features/record/import/MatchesStep.tsx:40-43`; `src/features/record/import/useStatementImport.ts:747-849, 855-886`

**Issue:** `canAcceptSuggestion(included, accepted)` only disables buttons. `linkTransfer`, `setOrphanAccount`, `acceptPayMatch` and `commit` never check the cap.

**Failure scenario:**
1. Include 4,000 lines and accept 1,999 suggestions (cap = min(2999, 6000-4000-1) = 1999).
2. Go Back to Review and include 1,000 more lines (cap is now 999).
3. Commit.

The undo step needs 5000 + 1999 + 1 ops, above `MAX_UNDO_OPS`, so the finalize is refused after the rows were inserted.

**Fix:** Check `acceptedSuggestionCount(...) <= maxAcceptedSuggestions(counts.included)` in `commit` (and in the accept handlers), and block with the `suggestionCap` copy when it fails. When re-entering Matches, drop acceptances beyond the cap, or prompt.

### WR-04: Import commit rethrows from an onPress handler and can crash the app

**File:** `src/features/record/import/useStatementImport.ts:890-903`; `src/data/mutations/importFinalize.ts:405-407`

**Issue:** `useImportCommit.commit` throws a `TypeError` when links are present and `transferCategoryId` is null. `commit()` resets the guard and rethrows into the Pill's `onPress`, where nothing catches it.

**Failure scenario:** Categories are not cached (cold start, offline) and the user links a transfer. Commit throws an unhandled JS exception: a red screen in dev, an app error in production. The import is lost.

**Fix:** Before calling `commit`, refuse links when `lookup.transferCategoryId === null` (disable Link with explanatory copy). Catch in `commit` and move to a recoverable state instead of rethrowing.

### WR-05: The OFX stored-opening fallback uses today's balance, not the balance at the statement start (uncertain)

**File:** `src/features/record/import/useStatementImport.ts:357-366`

**Issue:** `storedOpeningForFile = balances.get(accountId)?.balance`. That is "Balance now" (`AccountBalanceBlock` labels the same value that way). `anyInside` only looks inside the period, and `stored` only covers the file range ±2 days, so rows dated *after* the file are never seen.

**Failure scenario:** In October the user imports a March OFX for an account with rows before March and rows from April to September, but none in March. Today's balance is used as March's opening, so reconciliation reports mismatches (or false verifies) for a correct file. (Uncertain only on whether `useAccountBalances` ever returns a dated balance. Today it is the current balance.)

**Fix:** Use the fallback only when the account has no rows after `periodEnd` (add `fetchHasRowsAfter`), or compute the balance as of `periodStart - 1`.

### WR-06: Switching to Transfer keeps a hidden currency override for the from-leg

**File:** `src/features/record/entry/transactionForm.ts:129-136`; `src/features/record/entry/TransactionSheet.tsx:454-528`

**Issue:** The user picks EUR on the Currency row for an expense from a GBP account, then taps the Transfer chip. `withDirection('transfer')` keeps `currency: 'EUR'`, and the Currency row is hidden for transfers. The out-leg is saved as EUR on the GBP account (`toTransferInput.from.currency`). A same-currency GBP→GBP transfer also becomes "cross-currency" and asks for a second amount without explaining why.

**Fix:** In `withDirection(…, 'transfer')`, reset `currency` to the from-account's currency (pass `accountCurrency` in), and recompute `toCurrency` and `amountInText`.

### WR-07: Removing a category auto-archives it when the usage count is unknown

**File:** `src/features/record/categories/RemoveCategoryPrompt.tsx:195, 204-210`; `src/data/queries/categories.ts:83-84`

**Issue:** `count` defaults to 0 whenever `query.data` is undefined. `isLoading` is false when the query is paused (offline), errored, or disabled (`householdId` null). `settledUnused` is then true and the category is archived straight away.

**Failure scenario:** Offline, the user taps "Archive" on a category used by 300 transactions. It is archived with no in-use prompt and no Merge option.

**Fix:** Use `query.isSuccess && query.data === 0`. Show the in-use prompt (with Merge disabled) when the count is unknown.

### WR-08: The device currency default can overwrite a real home currency when the prefs read fails

**File:** `src/features/record/useDeviceHomeCurrencyDefault.tsx:162, 169-176, 188`; `src/data/queries/moneyPrefs.ts:27`

**Issue:** `useMoneyPrefs` returns `DEFAULT_MONEY_PREFS` (`'USD'`) with `loading: false` when the query errors, is paused, or the row fetch returns null. The hook treats that as "untouched".

**Failure scenario:** On a second device, a user with home currency EUR and no accounts yet has a failed prefs read while accounts load as empty. The hook calls `setHomeCurrency('CAD')` and sets the once-only flag. This contradicts the 02-31 note that "an explicit non-USD choice is never overwritten".

**Fix:** Expose `isSuccess` (and `data !== null`) from `useMoneyPrefs` and require it in `ready`.

### WR-09: The first account is created in USD because the currency default arrives after the onboarding sheet mounts

**File:** `src/features/record/accounts/AccountSheet.tsx:81`; `src/features/record/useDeviceHomeCurrencyDefault.tsx:178-199`

**Issue:** `AccountSheet` captures `rc.homeCurrency` once, in `useState`. The device default resolves asynchronously: it waits for options, accounts and prefs, plus an AsyncStorage read. The `/activity` gate redirects to `/setup/account` as soon as accounts load, so the sheet usually mounts while home is still `USD`.

**Failure scenario:** A Canadian user's home currency becomes CAD a moment later, but the onboarding sheet still shows USD. If not noticed, the first account is created in USD. This is the exact case 02-31 finding 2 set out to fix.

**Fix:** While the currency is untouched by the user, keep the new-account currency in step with `rc.homeCurrency` (a `currencyTouched` flag). Alternatively, hold the setup redirect until the default check has settled.

### WR-10: Several disabled controls give no reason

**File:** `src/features/record/entry/TransactionSheet.tsx:544`; `src/features/record/entry/EditScopePrompt.tsx:31-36`; `src/features/record/accounts/AccountSheet.tsx:116, 253-258`

**Issue:**
- Save for a new transfer is disabled while `transferCategoryId === null`.
- "This and future" is disabled while the series is not loaded.
- Save account is disabled while `!rc.ready`.

None of them shows copy or sets an `accessibilityHint`. The 02-31 import fix established the pattern for this, and the review brief asks for disabled controls to be explained.

**Fix:** Add an `accessibilityHint` and a visible line for each case, reusing the `Pill` `accessibilityHint` prop added in 02-31.

### WR-11: The onboarding account sheet cannot be dismissed, so a new user cannot reach You

**File:** `src/features/record/setup/SetupAccountScreen.tsx:24-29`

**Issue:** `onClose={() => undefined}`, so Cancel, backdrop tap and Android back all do nothing, while the Cancel button stays visible and announced. The `/activity` gate sends any account-less user here.

**Failure scenario:** A user who signs up and wants to sign out or delete their account (mandatory in-app deletion) must first create a money account. Their only other way out is killing the app.

**Fix:** Hide Cancel in onboarding context, or route Cancel to a screen that offers You (sign out or delete), for example by letting the gate allow `/you`.

### WR-12: Changing an account's type silently flips the sign of its opening balance and moves the limit to another field

**File:** `src/features/record/accounts/AccountSheet.tsx:272-276, 96, 148-149`

**Issue:** Picking a new kind calls `setSignChoice('default')`.

**Failure scenario:** The user edits a checking account at −£200 (signChoice `other`) and changes it to Savings. The sign resets to "In credit" and saving stores +£200. Going from credit to checking keeps the credit-limit text and saves it as an overdraft limit, while the old `credit_limit` stays on the row.

**Fix:** On a kind change, keep the sign *meaning* (recompute `signChoice` from the current signed value), clear `limitText` when the limit kind changes, and null the limit that no longer applies.

### WR-13: The Review step does O(n²) work on every render for a 5,000-line import

**File:** `src/features/record/import/ReviewStep.tsx:87-90`; `src/features/record/import/useStatementImport.ts:680-691`

**Issue:** `ratesPending` calls `state.rowState(r.index)` for every row, and each call runs `m.preview.rows.find(...)`. When no row matches (the common all-home-currency file), that is about 12.5M comparisons on each render, i.e. on every tick toggle and category change. `toggleRow` and `rowAt` also use linear `find`. The brief asks for long-list performance to be checked.

**Fix:** Build a `Map<index, PreviewRow>` once per preview. Compute `ratesPending` from the row itself plus `isIncluded`, without `rowState`.

### WR-14: Screen readers miss balances and state, and some touch targets are under 44pt

**File:** `src/features/record/accounts/AccountsScreen.tsx:35-39`; `src/features/record/activity/ActivityRow.tsx:99`; `src/features/you/YouScreen.tsx:86-89`

**Issue:**
- Each account card's `accessibilityLabel={a.name}` replaces the child text, so VoiceOver never reads the balance or the standing ("Overdrawn by …").
- The Activity row label omits the Overdue, Due and "pending sync" tags and the home figure.
- The new You money rows are bare `Pressable`s with no `minHeight`, giving a touch target of about one line of body text, under `space.touchMin`.

**Fix:** Build the labels from the visible parts (name, balance, standing; name, amount, tags). Add `style={{ minHeight: space.touchMin, justifyContent: 'center' }}` to the You rows.

## Info

### IN-01: Hard-coded 'GBP' fallback in the amount display
**File:** `src/features/record/entry/TransactionSheet.tsx:189`
**Issue:** With no account, the empty figure renders as £0.00 whatever the home currency is.
**Fix:** Use `state.currency || rc.homeCurrency`.

### IN-02: Sizes and opacities outside the layout tokens
**File:** `ActivityRow.tsx:167, 210-221, 229`; `ReviewStep.tsx:222-223`; `MonthSwitcher.tsx:59, 78, 115-119`; `importUi.tsx:107`
**Issue:** Checkbox 24/8, tick 22 with radius 6/4, opacity 0.7 and 0.35, chevron 10, `paddingVertical: 1`.
**Fix:** Move these to `radii` and `space` (or a documented opacity token) per DSG-02.

### IN-03: The `committing` stage is never entered
**File:** `src/features/record/import/useStatementImport.ts:78, 980`; `ImportScreen.tsx:77-78`
**Issue:** `commit` goes straight to `done`. The `committing` branch in `cancel` and the screen's "Importing…" view are unreachable.
**Fix:** Remove the stage, or set it and wire it to the mutation state.

### IN-04: Every-month search shows "Nothing matches." while loading or offline
**File:** `src/features/record/activity/ActivityScreen.tsx:86-101, 255-258`
**Issue:** `search.isLoading` is never read, so an in-flight or paused server search looks like no results.
**Fix:** Show a loading line, or an offline line, while `search.enabled && search.isLoading`, or while the query is paused.

### IN-05: The bulk-delete confirmation understates what is deleted
**File:** `src/features/record/activity/ActivityScreen.tsx:278`
**Issue:** "Delete 1 transaction?" for a selected transfer leg also deletes its partner, added by `expandTransferIds`.
**Fix:** Count transfer partners, or add a line such as "Transfers are deleted with both sides."

### IN-06: Restoring a category is labelled as an edit
**File:** `src/features/record/categories/CategoriesScreen.tsx:134`
**Issue:** The toast and History show "Category edited · X" for a restore.
**Fix:** Use a dedicated label key if the engine set allows it, or accept the wording deliberately and document it.

### IN-07: "This and future" records two undo steps, and the toast offers only one
**File:** `src/features/record/entry/TransactionSheet.tsx:339-350`
**Issue:** The row's note or status edit gets its own step that the toast never offers. This interacts with CR-02.
**Fix:** Fold it into the series step, or chain both.

### IN-08: Tests do not pin the risky behaviour
**File:** `src/features/record/history/__tests__/history.test.tsx:95-99`; `src/features/record/entry/__tests__/recurringControls.test.tsx:220-237`
**Issue:** The item-10 test uses a key shape the app never produces (CR-04). There is no comma-decimal locale test (CR-01), no paid-occurrence "This and future" test (CR-02), no future-dated "On a date" test (CR-03), and no remap-ambiguity test (CR-06). The ActivityScreen and ImportScreen tests mock `FlashList` to a plain map, so recycling and `extraData` behaviour is not exercised.
**Fix:** Add the cases listed above.

### IN-09: Some selection states reach screen readers only as a "✓" value
**File:** `src/features/record/import/FormatStep.tsx:65-71`; `entry/pickers/*.tsx`; `MappingStep.tsx:70-93`; `EditScopePrompt.tsx:29`
**Issue:** The selected candidate or option is conveyed only by the value text "✓", with no `selected` state. The EditScopePrompt heading has no `accessibilityRole="header"`.
**Fix:** Add an optional `selected` prop to `Row` that maps to `accessibilityState.selected`, and give the heading the header role.

### IN-10: The account detail screen goes blank for an unknown id, and some lists are not virtualised
**File:** `src/features/record/accounts/AccountDetailScreen.tsx:251, 264-275`; `src/features/record/import/MatchesStep.tsx:175-183`
**Issue:** An unknown, deleted or not-yet-loaded `accountId` renders an empty `Screen` with no message or way back. The month's lines and the import suggestions are rendered with `map` inside a ScrollView.
**Fix:** Show an empty state or loading line. Use FlashList for the matches list when there are many suggestions.

---

_Reviewed: 2026-10-07T20:46:40Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
