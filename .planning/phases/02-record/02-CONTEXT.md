# Phase 2: Record - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can log and manage their real financial activity against the live Supabase backend. That covers income and expense entry with edit and delete, per-account balances, user-owned categories, recurring series that generate entries, CSV import (during onboarding or later) with preview and column mapping, the Activity month list with switching, search, filter and bulk delete, and a 12-deep undo built from compensating writes, reachable from the toast and a History screen. Also in scope: ANL-05 (a signup → first entry → first CSV import funnel) and ENV-16 (Supabase Pro plan with daily backups before the first real user data).

Requirements: REC-01…REC-12, ACT-01…ACT-05, ANL-05, ENV-16.

Not in this phase: transfers between accounts, household sharing and settlements (Phase 8), archiving and restoring months (DAT-01, later), level gating, Pro/Free tiering, and receipts.

</domain>

<decisions>
## Implementation Decisions

Decision numbers are local to this phase. "Phase 1 D-xx" refers to `.planning/phases/01-money-core/01-CONTEXT.md`.

### Planned vs paid, and recurring series
- **D-01:** **Transactions carry a status of `pending` or `paid`** (additive migration on `transactions`, per Phase 1 D-26/D-27). This follows the prototype's month sheet, where upcoming bills are pending lines and the user marks them paid. Rows the user types by hand default to `paid`. The planner decides whether a hand entry dated in the future defaults to pending.
- **D-02:** **Recurring series are a first-class entity** (e.g. `recurring_series`, holding a template of amount, currency, account, category, name, payment type and direction, plus a schedule). **Occurrences are materialised ahead as `pending` rows** by a server-side job, with each row linked to its series and occurrence date. Because the rows already exist, they are visible, editable and skippable offline from the cache. This is how REC-05 "generates entries without re-typing" is met.
- **D-03:** **Materialisation horizon: through the end of next month.** The current and next month always hold real pending rows. Months further ahead show the series as a projection computed on read, and no rows are written for them. System-generated rows never go on the undo stack.
- **D-04:** **Supported schedules:** weekly, every 2 weeks, monthly (by day of month, clamped to the month's end, so the 31st becomes 30 Apr or 28/29 Feb), quarterly and yearly, with an optional end date or occurrence count. No RRULE-style rules (such as "last Friday"). The scheduling maths is pure and lives in `engine/`, built on the existing `engine/time/localDate`, and is property-tested. It must hold across DST changes and month ends, since dates are local dates plus a time zone (MON-14).
- **D-05:** **An overdue pending occurrence stays pending and is flagged overdue.** Nothing is marked paid automatically, with no autopay assumption: the app never asserts a payment it can't see. The overdue state is what the later bills-due alert reads.
- **D-06:** **Marking paid takes one tap** and uses the planned amount, dated today (or the due date if that is earlier; planner to confirm). An optional adjust step (a long-press or the detail screen) lets the user change the actual amount or date first. A date change re-rates FX (Phase 1 D-04). Bulk "Mark paid" and "Mark unpaid" follow the prototype.
- **D-07:** **Editing a recurring occurrence asks "This one" or "This and future".** "This and future" updates the series template and regenerates the series' not-yet-paid occurrences from that date on. Paid rows, and anything before that date, are never rewritten. "This one" edits only that row, which handles bills whose amount varies.
- **D-08:** **Skipping an occurrence** (REC-06) marks that occurrence skipped. It is not a delete, so the generator does not recreate it. **Ending a series** sets its end date and removes its pending occurrences after that date. Paid history is never touched. Each of these is one undo step.
- **D-09:** **An existing one-off transaction can become recurring.** The add/edit sheet has a "Repeats" field. Setting it on an existing row creates a series anchored to that row's date, and the row becomes its first occurrence.
- **D-10:** **Account balance counts paid rows only**, starting from the account's `opening_balance`, so it matches the bank. Month totals show paid figures plus a separate "still to come" figure for pending rows.

### CSV import
- **D-11:** **One generic importer; no bank-specific presets.** Any CSV with a header row is accepted. Columns are auto-detected for date, description, and either one signed amount or separate debit and credit columns. The date format and decimal mark are inferred from the sample rows. The user sees every detected mapping and can correct it before committing (REC-10). Amount strings go through the Phase 1 strict parser (D-24) with the inferred decimal mark, so no `parseFloat` is used.
- **D-12:** **One target account per import.** The user picks, or creates, the account the file came from. Rows take that account's currency unless a mapped currency column says otherwise.
- **D-13:** **Duplicates are flagged in the preview and unticked by default.** A likely duplicate is a match on the same account, date and amount, plus a similar description, against existing rows or other rows in the same file. The user can tick any of them back in, so nothing is silently dropped.
- **D-14:** **Categories are guessed by rules, and the guess can be edited in the preview.** Keyword rules (the prototype's `guessCat`) are combined with learning from the user's own past entries: a description the user has categorised before reuses that category. Uncategorised is allowed. No LLM is involved. The guessing logic is pure and lives in `engine/`.
- **D-15:** **Imported rows are `paid`**, since a bank export is money that has already moved.
- **D-16:** **Every imported row carries an `import_batch_id`.** A whole import is **one undo step** ("Imported 214 lines"), and it can be removed as a batch.
- **D-17:** **Parsing happens on the device.** The parser is pure and lives in `engine/`, where it is property-tested. Rows are committed as chunked inserts through the normal mutation path, so FX stamping (Phase 1 D-16) and RLS apply unchanged. **The raw file is never uploaded.** Privacy copy should say so. Offline, the commit queues like any other write.
- **D-18:** **The ceiling is about 5,000 rows per import.** Above that, the app shows a clear message asking the user to split the file, which keeps the preview and the commit responsive on the iPhone XR.
- **D-19:** **FX for imported historical rows reuses Phase 1's D-03/D-17 path unchanged.** Rows insert with `rate_pending`, and the server backfills historical rates on demand and re-stamps. The preview can note that rates for older dates are still being fetched. No FX logic is written specifically for import.
- **D-20:** **The bank's description is stored raw** in the name field. No rename or payee-cleanup rules.
- **D-21:** **After commit, import suggests recurring series.** It looks for repeated payments with the same description, a similar amount and a regular interval, then asks something like "Looks like Netflix, £10.99 monthly. Make it recurring?" The user accepts or dismisses each suggestion. Detection is pure and lives in `engine/`. Accepting creates a series and links the matching imported rows to it.
- **D-22:** **Import is an optional onboarding step after the user creates their first account**, offered as "Bring your history" or "Start fresh" and skippable. It stays reachable later from You and from an account's detail screen. The ANL-05 funnel events fire at each step, subject to analytics consent (Phase 0 D-17).

### Undo and history
- **D-23:** **The undo stack is server-side and per user**: a table such as `undo_log`, RLS-scoped to the user, where each step holds its inverse operations and the record versions it expects. The stack survives restarts and follows the user across devices, and account deletion purges it. The step and its inverse ops are computed in `engine/`, as pure functions that define an inverse for every mutation (per PROJECT.md).
- **D-24:** **One user action is one step.** A bulk delete, a bulk mark-paid, an import, a series edit with "this and future", and a category merge are each one labelled step ("Deleted 30 lines"). System actions such as recurring generation and FX re-stamps never enter the stack.
- **D-25:** **The stack is 12 deep and has no time limit.** A step lasts until 12 newer steps push it out.
- **D-26:** **Conflict rule (REC-12): if any record touched by a step no longer carries the version the step left behind, that step is refused.** This applies whether the change came from another household member, the same user on another device, or a system job. The refusal names who changed what and what the record is ("Sam edited Groceries after this, so it can't be undone"). It never clobbers. Merging at field level was offered and not chosen.
- **D-27:** **History's "roll back to before X" reverses every step from the newest back to X, newest first.** If a step conflicts, the rollback stops there, and the explanation names that record. Steps already reversed stay reversed.
- **D-28:** **A refused step stays in the history, greyed and marked "can't undo" with its reason**, and ages out normally.
- **D-29:** **Undo works offline.** The compensating write goes through the paused-mutation queue with `expected_version`. A conflict found when the queue flushes surfaces through Phase 1 D-18/D-19's "couldn't save, changed elsewhere" path.
- **D-30:** **Deletes are soft:** they set `deleted_at` and bump the version, and undo clears the field while keeping the same id, FX stamp and `created_by`. A scheduled purge hard-deletes tombstones once no undo stack references them, and at once on account deletion, to honour erasure. Every read path excludes rows where `deleted_at` is set.
- **D-31:** **Toast Undo stays up 3.2s for ordinary changes** (prototype) **and about 6s for deletes, bulk deletes and imports.** With a screen reader running there is no auto-dismiss. The History screen is always the fallback.
- **D-32:** **The History screen ships now**, reachable from You, for every user. The prototype puts "Undo history" at level 4. That gate is wired when the levels phase lands. The toast's Undo is never gated.

### Categories and entry fields
- **D-33:** **Categories are per user**, RLS-scoped to the user and not the household. Transactions reference a `category_id`. For shared household transactions in Phase 8, each member sees the row under their own category via a per-member override. Record builds only the per-user tables and leaves the household design open.
- **D-34:** **Built-in categories are seeded per user at provisioning and are fully editable**: rename, recolour, archive. Transfer and Settlement are system-owned and cannot be edited, because the engine relies on them. The seed set is the prototype's `Component.COL` list (line 3217): Housing, Utilities, Groceries, Transport, Insurance, Health, Subscriptions, Debt, Savings, Business, Tax, Dining and Income. Whether "Tax" is renamed or dropped from the seed, given that tax framing is cut, is for the planner to raise with the user or settle by copy review. Built-in names are i18n keys until the user renames them.
- **D-35:** **Colours come only from the prototype's existing category swatch pairs** (colour plus tint, as in `Component.COL` / `Component.TINT` at lines 3217–3218), which is 7 distinct pairs. There is no free colour picker, per the design-fidelity rule.
- **D-36:** **Removing a category that is in use gives two choices: merge its transactions into another category** (one undo step), **or archive it**, which hides it from pickers but keeps its history. Rows are never orphaned.
- **D-37:** **New transaction fields: `name` (payee or line title) and `payment_type`.** The name is required for search (ACT-03), import descriptions and recurring detection. Payment type uses the prototype's `PTYPE` list (line 3357): Card, Bank transfer, Direct debit, Standing order and Cash for money out; Direct deposit, Invoice, Transfer, Card payout and Cash for money in. It is descriptive only.
- **D-38:** **There is no tax-relevant flag.** "Tax categorisation" is Out of Scope in REQUIREMENTS.md, and tax framing is cut in PROJECT.md. **Receipt attachments are deferred** (see Deferred Ideas).

### Claude's Discretion
- **Activity list (ACT-01…05):** the planner chooses the search mechanics (server-side `ilike` or full-text, against the cached month for instant results), how the amount filter works (range, or above/below), and the bulk-select interactions, following the prototype's Activity screen (~line 198, bulk actions ~line 5086). Since DAT-01 (archiving) arrives later, ACT-02's "including into archived months" is met in this phase by the month switcher reaching every month that has data. The planner should keep the switcher compatible with a later `archive_months` concept.
- **Accounts (REC-08):** the create/edit account UI and how a balance is shown for an account in a foreign currency (in the account's own currency, with a home-currency figure alongside).
- **Server mechanics:** how occurrences are materialised (pg_cron plus a SQL function, or an Edge Function); table, column and enum names; the category-guess keyword list; the thresholds for duplicate and recurrence similarity.
- **ANL-05:** event names and properties for the signup → first entry → first import funnel, with no amounts, payees or free text, per Phase 0 D-18.
- **ENV-16:** the Supabase Pro upgrade with daily backups must be done and verified **before any real user data exists**. The planner makes it an early, operator-run task that checks the backup status.
- Whether a hand-entered transaction dated in the future defaults to pending.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and locked decisions
- `.planning/PROJECT.md`: Core Value, the Key Decisions table (undo as compensating writes in `engine/`, CSV import moved early, local date plus time zone, one household in v1, tax framing cut), and the compliance voice rules.
- `.planning/REQUIREMENTS.md`: REC-01…12, ACT-01…06 (ACT-06 is **not** in this phase), ANL-05, ENV-16, DAT-01 (a later phase), and the Out of Scope table (tax categorisation).
- `.planning/ROADMAP.md` § Phase 2: Record, for the goal and the five success criteria.
- `BUILD-PROMPT.md` §2 (design tokens: no extra colours), §5 (feature-area map with prototype line numbers), §6 (architecture, the `state/` undoStack, normalised tables including `categories` and `undo_snapshots`), §8 (roadmap row 2).

### Prior phase decisions this phase builds on
- `.planning/phases/01-money-core/01-CONTEXT.md`: D-01–D-05 (FX storage and re-rating), D-14 (`useSyncStatus`, pending rows), D-16/D-17 (server FX stamp, provisional offline rates), D-18/D-19 (`expected_version` conflicts, failed-write list), D-24 (strict amount parsing), D-26/D-27 (additive migrations only, and CI checks for destructive DDL).
- `.planning/phases/00-foundation/00-CONTEXT.md`: D-14 (profile-stored preferences), D-15 (sign-out wipes the queue), D-17/D-18 (analytics consent and scrubbing).

### Prototype (the specification)
- `FincWin United.dc.html`: row model and seed (~lines 3380–3445: status, freq, `dir`, ptype); `COL`/`TINT` category colours (3217–3218); `PTYPE` (3357); the undo stack, toast and rollback (3843–3860); the month-clone and recurring copy (4937–5011); bulk actions (5086–5092); the paste-import sheet (5804–5828); the History and Archive detail screens (5361–5363, 5497–5512); the entry-sheet defaults (7013); the Activity screen (~198).
- `docs/design/token-exceptions.md`: design-token exceptions already agreed.

### Schema
- `supabase/migrations/20260924000300_accounts.sql`, `supabase/migrations/20260924000400_transactions.sql`: the current money tables. Record extends them additively.
- `supabase/migrations/20260924000500_fx_stamping.sql`: the stamp trigger that import and edits rely on.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/money/useAmountParser.ts` and `useMoneyFormatter.ts`: amount input and display for the entry sheet, the CSV preview and Activity rows.
- `src/engine/money/*` (`parseAmount`, `formatAmount`, `rounding`, `rates`) and `src/engine/split/allocate.ts`: pure money maths. The CSV parser and category, duplicate and recurrence detection sit beside these in `engine/`.
- `src/engine/time/localDate.ts`: the local-date primitives the recurring schedule maths should build on.
- `src/data/mutations/transactions.ts`, `accounts.ts`, `provisional.ts`, `writeClient.ts`, `cacheRows.ts`: the existing optimistic mutation path with version-conditional writes. Entry, edit, delete, mark-paid, import and undo should all go through it.
- `src/data/sync/versionChain.ts`, `failedWrites.ts`, `writeErrors.ts`, `useSyncStatus.ts`: the conflict and failed-write handling that the undo refusal (D-26/D-29) reuses.
- `src/data/queries/accounts.ts`, `currencyOptions.ts`, `fxLatest.ts`: account and currency pickers for the entry and import sheets.
- `src/ui/RateAttribution.tsx`: the Phase 1 D-13 attribution component, which Record screens adopt wherever a converted figure appears.
- `src/ui/SyncStatusLine.tsx`, `src/ui/Screen.tsx`: the existing UI shell pieces.

### Established Patterns
- Client-generated UUID primary keys, and a `version` column bumped by `bump_version()`. RLS takes the `user_household_ids()` form for household data. Per-user tables (categories, undo_log) need an `auth.uid()`-scoped policy instead.
- Additive migrations only, and CI flags destructive DDL (Phase 1 D-27).
- i18n keys for all copy (`src/i18n/locales/en.ts`). New copy is marked draft where Claude writes it (`copyStatus.ts`).
- `engine/` purity is enforced by dependency-cruiser. Every new algorithm in this phase that can be pure must be pure and meet the coverage thresholds.

### Integration Points
- Supabase provisioning (Phase 0 household-of-one) needs to seed each new user's categories (D-34).
- The You screen: entry points for History, CSV import and category management.
- Phase 3 (Shell) owns the tabs, FAB, sheets and back-stack. Record's screens should work as plain routes or sheets that Shell later wraps, and should not build their own navigation chrome.

</code_context>

<specifics>
## Specific Ideas

- The month view should look like the prototype's month sheet: pending bills alongside paid lines, bulk "Mark paid" and "Mark unpaid", and a "still to come" total.
- Undo refusal copy names who changed what and what the record is, in the declarative voice ("Sam edited Groceries after this, so it can't be undone"), never prescriptive.
- Recurring suggestion copy after import: "Looks like Netflix, £10.99 monthly. Make it recurring?"
- Import privacy line in the prototype's style: the file is read on this device and never uploaded.

</specifics>

<deferred>
## Deferred Ideas

- **Receipt attachments** (prototype `receipt` field): needs a Supabase Storage bucket with RLS, a camera or image picker, an App Privacy "photos" disclosure, and purge on account deletion. Belongs in its own phase or the backlog.
- **Bank-specific CSV presets** (Chase, Monzo, Revolut…): offered and not chosen. Revisit if generic mapping proves painful.
- **Lossless import of FincWin's own export format**: offered and not chosen here. Worth reconsidering alongside data portability (GDPR export).
- **Payee rename and cleanup rules** that learn from renames: not chosen for v1.
- **Field-level undo merge**: not chosen. Any version change refuses the step.
- **Autopay auto-mark-paid**: not chosen. Pending rows are never assumed paid.
- **RRULE-style schedules** ("last Friday of the month"): not chosen.
- **Tax-relevant flag**: dropped under the existing Out of Scope decision. Not coming back without a PROJECT.md change.

</deferred>

---

*Phase: 02-record*
*Context gathered: 2026-09-25*
