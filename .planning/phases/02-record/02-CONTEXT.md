# Phase 2: Record - Context

**Gathered:** 2026-09-25
**Extended:** 2026-09-25 — statement import extension (D-39…D-52), refined after research (D-53…D-56). Plans written before this date need revising; see "Plan impact of the import extension" below.
**Status:** Ready for planning (revision of affected plans required before execution)

<domain>
## Phase Boundary

A user can log and manage their real financial activity against the live Supabase backend. That covers income and expense entry with edit and delete, per-account balances, user-owned categories, recurring series that generate entries, CSV import (during onboarding or later) with preview and column mapping, the Activity month list with switching, search, filter and bulk delete, and a 12-deep undo built from compensating writes, reachable from the toast and a History screen. Also in scope: ANL-05 (a signup → first entry → first import funnel). ENV-16 (production backups) was moved out to Phase 10 on 2026-09-25.

**Import extension (2026-09-25):** statement import also accepts OFX/QFX, reads each file's format (sign convention, balance meaning, limits) before converting it, reconciles against statement balances where the file has them, and never treats an overdrawn or over-limit account as an error. Accounts carry an overdraft or credit limit and show their standing. **Transfers between the user's own accounts are now in scope**, including detecting both sides of a card payment on import. PDF statements are Phase 2.1.

Requirements: REC-01…REC-18, ACT-01…ACT-05, ANL-05.

Not in this phase: PDF statements (Phase 2.1), household sharing and settlements (Phase 8), archiving and restoring months (DAT-01, later), level gating, Pro/Free tiering, and receipts.

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
- **D-34:** **Built-in categories are seeded per user at provisioning and are fully editable**: rename, recolour, archive. Transfer and Settlement are system-owned and cannot be edited, because the engine relies on them. The seed set is the prototype's `Component.COL` list (line 3217): Housing, Utilities, Groceries, Transport, Insurance, Health, Subscriptions, Debt, Savings, Business, Tax, Dining and Income. **"Tax" stays in the seed as a plain label** (decided 2026-09-25): it records money already paid, such as a tax bill or an accountant's fee, and behaves exactly like any other category. It must never gain tax-specific behaviour (no tax flag, no tax totals or reports, no liability estimate, no copy about what is owed). The Out of Scope wording in REQUIREMENTS.md and PROJECT.md was clarified to match. Built-in names are i18n keys until the user renames them.
- **D-35:** **Colours come only from the prototype's existing category swatch pairs** (colour plus tint, as in `Component.COL` / `Component.TINT` at lines 3217–3218), which is 7 distinct pairs. There is no free colour picker, per the design-fidelity rule.
- **D-36:** **Removing a category that is in use gives two choices: merge its transactions into another category** (one undo step), **or archive it**, which hides it from pickers but keeps its history. Rows are never orphaned.
- **D-37:** **New transaction fields: `name` (payee or line title) and `payment_type`.** The name is required for search (ACT-03), import descriptions and recurring detection. Payment type uses the prototype's `PTYPE` list (line 3357): Card, Bank transfer, Direct debit, Standing order and Cash for money out; Direct deposit, Invoice, Transfer, Card payout and Cash for money in. It is descriptive only.
- **D-38:** **There is no tax-relevant flag.** "Tax categorisation" is Out of Scope in REQUIREMENTS.md, and tax framing is cut in PROJECT.md. **Receipt attachments are deferred** (see Deferred Ideas).

### Statement import extension (added 2026-09-25)

Context: import is the answer to Decide's cold-start problem (PROJECT.md), and Decide is the one place where a wrong number harms a real person's finances. Banks and card issuers present the same activity with different sign conventions, and accounts are routinely overdrawn or over their limits. Reading a file wrongly reverses payments and spending, so the importer must understand a file's format before converting it. Decisions below were confirmed with the user on 2026-09-25: CSV + OFX/QFX in this phase, PDF in Phase 2.1, limits and standing in this phase, and full transfer pairing in this phase.

**Formats and pipeline**
- **D-39:** **Phase 2 imports CSV and OFX/QFX.** QFX is treated as OFX. Both OFX 1.x (SGML) and 2.x (XML) are read. Both formats are parsed on the device by pure code in `engine/`, and the raw file is never uploaded (D-17 unchanged). OFX's `FITID` is used as an exact duplicate key, and `LEDGERBAL`/`AVAILBAL` feed reconciliation (D-46) and limits (D-48). XLSX is not in this phase. **PDF statements are Phase 2.1.**
- **D-40:** **One pipeline for every format:** format adapter → format profile (D-41) → conversion into Phase 1's existing transaction rows → reconciliation (D-46) → duplicate check (D-47) → transfer detection (D-52) → preview → commit. Adapters only produce rows in the existing model; there is no second transaction model. PDF (Phase 2.1) and bank feeds (FEED-01) later become further adapters into the same pipeline.

**Reading the format first**
- **D-41:** **Every import builds a format profile before any conversion.** The profile records: the account type; what a positive amount means (money in, or money spent); what the balance column shows (money held, amount owed, or available credit); and any overdraft or card limit the file states. It is decided from labels first (separate Withdrawals/Deposits columns, "Payment – thank you", "Credit limit", "Available credit", `DR`/`CR`, `OD`), then from the numbers: the running-balance check (D-46) is run under each candidate sign convention, and the one that reconciles wins. If none or more than one reconciles, the app asks the user.
- **D-42:** **The preview states the reading in plain words, with one example row, and the user can flip it.** Example: "We read this as a credit card statement. Purchases are shown as positive and payments as negative. The balance is what you owe: £1,250, which is over your £1,000 limit." An import whose profile is still ambiguous cannot be committed. A confirmed profile is remembered per file layout (header signature plus account), so the next file from the same bank is read the same way without asking.
- **D-43:** **Amount notation is read, but never decides the sign on its own.** The strict parser (Phase 1 D-24, still no `parseFloat`) is extended to read leading and trailing minus signs, parentheses, `DR`/`CR` suffixes or columns, `OD` markers, and separate debit and credit columns. The format profile decides what the resulting sign means.
- **D-44:** **One stored sign rule, whatever the source.** Money out is negative and money in is positive. An account balance is positive when money is held and negative when money is owed. On a card account, a purchase is negative and a payment to the card is positive. "Available credit" figures are converted: owed = limit − available. Available credit at or below zero means the card is at or over its limit.
- **D-45:** **The bank's original values are kept alongside the converted ones**: the raw amount string and raw balance string, in addition to the raw description (D-20). This is import provenance for tracing and re-converting a misread row. It is not shown by default.

**Reconciliation**
- **D-46:** **When a file carries balances, the import checks them.** Sources are a running-balance column, OFX `LEDGERBAL`, or a stated opening and closing balance. The check is opening balance + rows = closing balance, plus each running balance in turn. A match shows "Balances check out." A mismatch highlights the rows that can't be verified, and the user reviews them before committing. A file without balances imports with the note "Couldn't check this file against a balance", which is not an error. **A negative opening, running or closing balance is normal and is never flagged.**

**Duplicates (amends D-13)**
- **D-47:** **Amends D-13.** Matching against existing rows is unchanged: flagged and unticked. **Identical rows within the same file are no longer flagged**, because two identical same-day purchases are both real. Matching counts occurrences: if the file holds two identical rows and the account already has one, exactly one is flagged. An OFX `FITID` is an exact duplicate key when present. Overlapping files, such as a CSV and then an OFX for the same month, are caught by the same account + date + amount + description match.

**Overdraft and credit limits**
- **D-48:** **Accounts gain an optional `overdraft_limit` (checking and savings) and `credit_limit` (credit),** stored as non-negative minor units in the account's currency, by additive migration (Phase 1 D-26/D-27, FND-10). Import can fill a limit from the statement, which the user confirms in the preview.
- **D-49:** **Account standing is a pure `engine/` function.** Checking and savings: in credit; overdrawn within the overdraft; overdrawn beyond the overdraft (including when no overdraft is set). Credit: in credit (after a refund); owing within the limit; over the limit. Loan: owing. Tests cover zero, exactly at the limit, and one minor unit over. **Overdrawn and over-limit are states, never errors or validation failures**, in the database, the engine, import or the UI. Standing shows on the account list and detail with the minus sign always visible, locale formatting (DSG-06), and existing tokens only (no new colours). Copy is declarative: "Overdrawn by £240, within a £500 overdraft." "£120 over the £1,000 limit."

**Transfers (moved into scope)**
- **D-50:** **Transfers between the user's own accounts are in Phase 2.** A transfer is two linked rows (money out of one account, money into the other), created together, sharing a transfer link, and filed under the system Transfer category (D-34). Transfers count in account balances but are **excluded from income and spending totals** (month totals now, and Decide and Insights later). A cross-currency transfer keeps each leg in its own account's currency, each stamped through the Phase 1 FX path; the two amounts are what the user or the statements say, not derived from each other. Creating, editing or deleting a transfer is one undo step covering both legs.
- **D-51:** **The add/edit sheet gains a Transfer type** alongside expense and income, with from-account and to-account fields. Deleting either leg deletes both. Editing the pair's date or amount edits both legs (the planner defines the rules for cross-currency amounts).
- **D-52:** **Import detects transfers and suggests them; nothing is linked silently.** After conversion, the import looks for rows on another of the user's accounts, either already stored or in the same import, with the opposite sign and a matching amount within a few days (card payments take one to three days to land), and weighs payment-like descriptions ("PAYMENT – THANK YOU", "TRANSFER TO"). A match is offered in the preview: "Looks like a payment from Current account to Visa. Link as a transfer?" Accepting links the pair and moves both to Transfer. An unmatched payment-like row is offered as a Transfer with the other account left for the user to pick. Matching is pure and lives in `engine/`.

**Refinements after research (confirmed with the user, 2026-09-25)**
- **D-53 (amends D-41):** **The target account's type decides what the balance column means**: current or savings means money held, and a credit card means amount owed. Research showed that a running-balance check can't separate "the signs are flipped" from "the balance means the opposite", because both readings always reconcile. With the balance meaning fixed by the account the user chose (D-12), reconciliation settles the sign convention on its own. The user is asked only when that still leaves it ambiguous, for example a file with no balances and no telling labels. An "available credit" column is recognised by its label and converted per D-44.
- **D-54 (amends D-47):** **Cross-format duplicate matching allows ±2 days.** When comparing against rows imported from a *different* file format (a CSV transaction date against an OFX posting date), a date within ±2 days counts as a match. Same-format matching stays exact-date. Matching counts occurrences (flag min(k, m)) and never compares rows within the same file. `FITID` is not treated as unique, since banks reuse and regenerate it, and FITID matching is switched off for a file that contains conflicting FITIDs.
- **D-55:** **An imported row that looks like the payment of a pending recurring occurrence is offered as "mark paid".** The preview shows: "Looks like this pays the pending Netflix bill. Mark it paid?" Accepting marks the pending row paid, with the imported date and amount, instead of adding a second row. Nothing happens silently. It is part of the import's single undo step.
- **D-56:** **Recurring transfers are not in Phase 2.** Transfers are one-off only. A recurring series stays expense or income, and recurring transfers (such as a standing order to savings) are deferred.

### Claude's Discretion
- **Activity list (ACT-01…05):** the planner chooses the search mechanics (server-side `ilike` or full-text, against the cached month for instant results), how the amount filter works (range, or above/below), and the bulk-select interactions, following the prototype's Activity screen (~line 198, bulk actions ~line 5086). Since DAT-01 (archiving) arrives later, ACT-02's "including into archived months" is met in this phase by the month switcher reaching every month that has data. The planner should keep the switcher compatible with a later `archive_months` concept.
- **Accounts (REC-08):** the create/edit account UI and how a balance is shown for an account in a foreign currency (in the account's own currency, with a home-currency figure alongside).
- **Server mechanics:** how occurrences are materialised (pg_cron plus a SQL function, or an Edge Function); table, column and enum names; the category-guess keyword list; the thresholds for duplicate and recurrence similarity.
- **ANL-05:** event names and properties for the signup → first entry → first import funnel, with no amounts, payees or free text, per Phase 0 D-18.
- Whether a hand-entered transaction dated in the future defaults to pending.
- **Import extension (D-39…D-52):** where remembered format profiles live (a per-user table or an account column); the header-signature scheme; column names for the raw amount and balance strings and for the transfer link; the transfer-match window (a starting point of three days) and amount tolerance for cross-currency legs; which OFX library, if any (a small pure parser in `engine/` is preferred over a dependency); and the edit rules for a cross-currency transfer pair.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and locked decisions
- `.planning/PROJECT.md`: Core Value, the Key Decisions table (undo as compensating writes in `engine/`, CSV import moved early, local date plus time zone, one household in v1, tax framing cut), and the compliance voice rules.
- `.planning/REQUIREMENTS.md`: REC-01…18 (REC-13…18 added 2026-09-25 for the import extension), ACT-01…06 (ACT-06 is **not** in this phase), ANL-05, ENV-16 (moved to Phase 10: not in this phase), DAT-01 (a later phase), and the Out of Scope table (tax categorisation).
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
- Format read-back in the preview: "We read this as a credit card statement. Purchases are shown as positive and payments as negative. The balance is what you owe: £1,250, which is over your £1,000 limit."
- Account standing copy: "Overdrawn by £240, within a £500 overdraft." / "£120 over the £1,000 limit." Never "you should".
- Transfer suggestion copy: "Looks like a payment from Current account to Visa. Link as a transfer?"
- Before planning the import screens, collect a few real, redacted statements (CSV and OFX), including a card that has gone over its limit and an overdrawn current account, to confirm how those banks show available credit and signs.

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
- **Production backups (ENV-16)**: moved to Phase 10 on 2026-09-25, method TBD, likely AWS. Phase 2 dogfooding runs on production without backups, as an accepted risk. Nothing in this phase may assume a restore is possible.
- **PDF statements → Phase 2.1** (inserted 2026-09-25). It carries these open questions: a server-side worker (which breaks D-17's "never uploaded", so it needs its own privacy copy, retention choice defaulting to delete-after-import, purge on account deletion, and Sentry scrubbing of statement text); a generic text-PDF parser gated by D-46 reconciliation; parsers for particular banks only for the institutions users actually upload; OCR for scanned statements; and an opt-in LLM fallback for unrecognised layouts, never the source of confirmed figures, which needs a DPA and a privacy disclosure.
- **XLSX import**: not chosen for Phase 2 (2026-09-25). A small adapter into the D-40 pipeline whenever it's wanted.
- **Recurring transfers** (standing orders between own accounts): deferred by D-56.
- **Overdrawn / over-limit alerts** (push): out of scope here. They sit naturally with the later bills-due and over-cap alerts.

</deferred>

<plan_impact>
## Plan impact of the import extension (2026-09-25)

The 31 plans were written before D-39…D-52. None had executed when this was added. The planner must revise the plans below (and add new ones where needed) before Phase 2 executes. **The UI-SPEC also needs a revision pass** for the Transfer entry type, the account-standing display, and the import's format-confirmation and reconciliation states.

| Plan | What changes |
|---|---|
| 02-02, 02-03 (CSV engine) | Notation reading (D-43), balance-column role detection, sign handling via the format profile (D-41/D-44); raw strings kept (D-45) |
| **New engine plan(s)** | OFX/QFX parser (D-39); format-profile inference and running-balance reconciliation (D-41, D-46); account standing (D-49); transfer matching (D-52). All pure, property-tested, in `engine/` |
| 02-04 (import intelligence) | Duplicate detection counts occurrences and uses `FITID` (D-47); transfer matching lives here or in the new plan |
| 02-06 (view maths) | Month totals exclude transfers (D-50); standing surfaced for accounts |
| 02-07 (schema) | Transfer link column, raw amount/balance provenance columns, account limit columns (D-45, D-48, D-50), plus remembered format profiles (D-42). All additive (FND-10) |
| 02-09, 02-13 (server undo, RPCs) | Transfer create/edit/delete is one step over both legs (D-50) |
| 02-10, 02-11, 02-14, 02-15, 02-17 (contracts, db, hooks, mutations) | Transfer mutations and reads; account limit fields; ANL-05 events renamed "first import", with the format as a property and no amounts |
| 02-20 (entry sheet) | Adds the Transfer type (D-51); "expense and income only in this phase" no longer holds |
| 02-24 (accounts UI) | Limit fields, standing display, negative opening balance entry (D-48/D-49) |
| 02-26, 02-27 (import pipeline and screens) | OFX file pick, the D-40 pipeline, the format-confirmation step (D-42), reconciliation results (D-46), transfer suggestions (D-52) |
| 02-30 (onboarding) | Copy says "statement" instead of "CSV" |
| 02-31 (rollout) | Device walkthrough adds: a card statement over its limit, an overdrawn current account, an OFX file, and a card payment linked as a transfer |

</plan_impact>

---

*Phase: 02-record*
*Context gathered: 2026-09-25*
