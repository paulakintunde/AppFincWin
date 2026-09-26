# Phase 2: Record - Research

**Researched:** 2026-09-25
**Domain:** Transaction recording, recurring series, CSV import, activity list/search, compensating-write undo — on top of an existing Supabase/TanStack-Query money layer
**Confidence:** MEDIUM-HIGH (stack and codebase patterns HIGH — extensively verified in-repo; server materialisation mechanics and a few library choices MEDIUM/LOW, flagged below)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Decision numbers are local to this phase. "Phase 1 D-xx" refers to `.planning/phases/01-money-core/01-CONTEXT.md`.

**Planned vs paid, and recurring series**
- **D-01:** Transactions carry a status of `pending` or `paid` (additive migration on `transactions`, per Phase 1 D-26/D-27). This follows the prototype's month sheet, where upcoming bills are pending lines and the user marks them paid. Rows the user types by hand default to `paid`. The planner decides whether a hand entry dated in the future defaults to pending.
- **D-02:** Recurring series are a first-class entity (e.g. `recurring_series`, holding a template of amount, currency, account, category, name, payment type and direction, plus a schedule). Occurrences are materialised ahead as `pending` rows by a server-side job, with each row linked to its series and occurrence date. Because the rows already exist, they are visible, editable and skippable offline from the cache. This is how REC-05 "generates entries without re-typing" is met.
- **D-03:** Materialisation horizon: through the end of next month. The current and next month always hold real pending rows. Months further ahead show the series as a projection computed on read, and no rows are written for them. System-generated rows never go on the undo stack.
- **D-04:** Supported schedules: weekly, every 2 weeks, monthly (by day of month, clamped to the month's end, so the 31st becomes 30 Apr or 28/29 Feb), quarterly and yearly, with an optional end date or occurrence count. No RRULE-style rules (such as "last Friday"). The scheduling maths is pure and lives in `engine/`, built on the existing `engine/time/localDate`, and is property-tested. It must hold across DST changes and month ends, since dates are local dates plus a time zone (MON-14).
- **D-05:** An overdue pending occurrence stays pending and is flagged overdue. Nothing is marked paid automatically, with no autopay assumption: the app never asserts a payment it can't see. The overdue state is what the later bills-due alert reads.
- **D-06:** Marking paid takes one tap and uses the planned amount, dated today (or the due date if that is earlier; planner to confirm). An optional adjust step (a long-press or the detail screen) lets the user change the actual amount or date first. A date change re-rates FX (Phase 1 D-04). Bulk "Mark paid" and "Mark unpaid" follow the prototype.
- **D-07:** Editing a recurring occurrence asks "This one" or "This and future". "This and future" updates the series template and regenerates the series' not-yet-paid occurrences from that date on. Paid rows, and anything before that date, are never rewritten. "This one" edits only that row, which handles bills whose amount varies.
- **D-08:** Skipping an occurrence (REC-06) marks that occurrence skipped. It is not a delete, so the generator does not recreate it. Ending a series sets its end date and removes its pending occurrences after that date. Paid history is never touched. Each of these is one undo step.
- **D-09:** An existing one-off transaction can become recurring. The add/edit sheet has a "Repeats" field. Setting it on an existing row creates a series anchored to that row's date, and the row becomes its first occurrence.
- **D-10:** Account balance counts paid rows only, starting from the account's `opening_balance`, so it matches the bank. Month totals show paid figures plus a separate "still to come" figure for pending rows.

**CSV import**
- **D-11:** One generic importer; no bank-specific presets. Any CSV with a header row is accepted. Columns are auto-detected for date, description, and either one signed amount or separate debit and credit columns. The date format and decimal mark are inferred from the sample rows. The user sees every detected mapping and can correct it before committing (REC-10). Amount strings go through the Phase 1 strict parser (D-24) with the inferred decimal mark, so no `parseFloat` is used.
- **D-12:** One target account per import. The user picks, or creates, the account the file came from. Rows take that account's currency unless a mapped currency column says otherwise.
- **D-13:** Duplicates are flagged in the preview and unticked by default. A likely duplicate is a match on the same account, date and amount, plus a similar description, against existing rows or other rows in the same file. The user can tick any of them back in, so nothing is silently dropped.
- **D-14:** Categories are guessed by rules, and the guess can be edited in the preview. Keyword rules (the prototype's `guessCat`) are combined with learning from the user's own past entries: a description the user has categorised before reuses that category. Uncategorised is allowed. No LLM is involved. The guessing logic is pure and lives in `engine/`.
- **D-15:** Imported rows are `paid`, since a bank export is money that has already moved.
- **D-16:** Every imported row carries an `import_batch_id`. A whole import is one undo step ("Imported 214 lines"), and it can be removed as a batch.
- **D-17:** Parsing happens on the device. The parser is pure and lives in `engine/`, where it is property-tested. Rows are committed as chunked inserts through the normal mutation path, so FX stamping (Phase 1 D-16) and RLS apply unchanged. The raw file is never uploaded. Privacy copy should say so. Offline, the commit queues like any other write.
- **D-18:** The ceiling is about 5,000 rows per import. Above that, the app shows a clear message asking the user to split the file, which keeps the preview and the commit responsive on the iPhone XR.
- **D-19:** FX for imported historical rows reuses Phase 1's D-03/D-17 path unchanged. Rows insert with `rate_pending`, and the server backfills historical rates on demand and re-stamps. The preview can note that rates for older dates are still being fetched. No FX logic is written specifically for import.
- **D-20:** The bank's description is stored raw in the name field. No rename or payee-cleanup rules.
- **D-21:** After commit, import suggests recurring series. It looks for repeated payments with the same description, a similar amount and a regular interval, then asks something like "Looks like Netflix, £10.99 monthly. Make it recurring?" The user accepts or dismisses each suggestion. Detection is pure and lives in `engine/`. Accepting creates a series and links the matching imported rows to it.
- **D-22:** Import is an optional onboarding step after the user creates their first account, offered as "Bring your history" or "Start fresh" and skippable. It stays reachable later from You and from an account's detail screen. The ANL-05 funnel events fire at each step, subject to analytics consent (Phase 0 D-17).

**Undo and history**
- **D-23:** The undo stack is server-side and per user: a table such as `undo_log`, RLS-scoped to the user, where each step holds its inverse operations and the record versions it expects. The stack survives restarts and follows the user across devices, and account deletion purges it. The step and its inverse ops are computed in `engine/`, as pure functions that define an inverse for every mutation (per PROJECT.md).
- **D-24:** One user action is one step. A bulk delete, a bulk mark-paid, an import, a series edit with "this and future", and a category merge are each one labelled step ("Deleted 30 lines"). System actions such as recurring generation and FX re-stamps never enter the stack.
- **D-25:** The stack is 12 deep and has no time limit. A step lasts until 12 newer steps push it out.
- **D-26:** Conflict rule (REC-12): if any record touched by a step no longer carries the version the step left behind, that step is refused. This applies whether the change came from another household member, the same user on another device, or a system job. The refusal names who changed what and what the record is ("Sam edited Groceries after this, so it can't be undone"). It never clobbers. Merging at field level was offered and not chosen.
- **D-27:** History's "roll back to before X" reverses every step from the newest back to X, newest first. If a step conflicts, the rollback stops there, and the explanation names that record. Steps already reversed stay reversed.
- **D-28:** A refused step stays in the history, greyed and marked "can't undo" with its reason, and ages out normally.
- **D-29:** Undo works offline. The compensating write goes through the paused-mutation queue with `expected_version`. A conflict found when the queue flushes surfaces through Phase 1 D-18/D-19's "couldn't save, changed elsewhere" path.
- **D-30:** Deletes are soft: they set `deleted_at` and bump the version, and undo clears the field while keeping the same id, FX stamp and `created_by`. A scheduled purge hard-deletes tombstones once no undo stack references them, and at once on account deletion, to honour erasure. Every read path excludes rows where `deleted_at` is set.
- **D-31:** Toast Undo stays up 3.2s for ordinary changes (prototype) and about 6s for deletes, bulk deletes and imports. With a screen reader running there is no auto-dismiss. The History screen is always the fallback.
- **D-32:** The History screen ships now, reachable from You, for every user. The prototype puts "Undo history" at level 4. That gate is wired when the levels phase lands. The toast's Undo is never gated.

**Categories and entry fields**
- **D-33:** Categories are per user, RLS-scoped to the user and not the household. Transactions reference a `category_id`. For shared household transactions in Phase 8, each member sees the row under their own category via a per-member override. Record builds only the per-user tables and leaves the household design open.
- **D-34:** Built-in categories are seeded per user at provisioning and are fully editable: rename, recolour, archive. Transfer and Settlement are system-owned and cannot be edited, because the engine relies on them. The seed set is the prototype's `Component.COL` list (line 3217): Housing, Utilities, Groceries, Transport, Insurance, Health, Subscriptions, Debt, Savings, Business, Tax, Dining and Income. "Tax" stays in the seed as a plain label (decided 2026-09-25): it records money already paid, such as a tax bill or an accountant's fee, and behaves exactly like any other category. It must never gain tax-specific behaviour (no tax flag, no tax totals or reports, no liability estimate, no copy about what is owed). The Out of Scope wording in REQUIREMENTS.md and PROJECT.md was clarified to match. Built-in names are i18n keys until the user renames them.
- **D-35:** Colours come only from the prototype's existing category swatch pairs (colour plus tint, as in `Component.COL` / `Component.TINT` at lines 3217–3218), which is 7 distinct pairs. There is no free colour picker, per the design-fidelity rule.
- **D-36:** Removing a category that is in use gives two choices: merge its transactions into another category (one undo step), or archive it, which hides it from pickers but keeps its history. Rows are never orphaned.
- **D-37:** New transaction fields: `name` (payee or line title) and `payment_type`. The name is required for search (ACT-03), import descriptions and recurring detection. Payment type uses the prototype's `PTYPE` list (line 3357): Card, Bank transfer, Direct debit, Standing order and Cash for money out; Direct deposit, Invoice, Transfer, Card payout and Cash for money in. It is descriptive only.
- **D-38:** There is no tax-relevant flag. "Tax categorisation" is Out of Scope in REQUIREMENTS.md, and tax framing is cut in PROJECT.md. Receipt attachments are deferred (see Deferred Ideas).

### Claude's Discretion
- **Activity list (ACT-01…05):** the planner chooses the search mechanics (server-side `ilike` or full-text, against the cached month for instant results), how the amount filter works (range, or above/below), and the bulk-select interactions, following the prototype's Activity screen (~line 198, bulk actions ~line 5086). Since DAT-01 (archiving) arrives later, ACT-02's "including into archived months" is met in this phase by the month switcher reaching every month that has data. The planner should keep the switcher compatible with a later `archive_months` concept.
- **Accounts (REC-08):** the create/edit account UI and how a balance is shown for an account in a foreign currency (in the account's own currency, with a home-currency figure alongside).
- **Server mechanics:** how occurrences are materialised (pg_cron plus a SQL function, or an Edge Function); table, column and enum names; the category-guess keyword list; the thresholds for duplicate and recurrence similarity.
- **ANL-05:** event names and properties for the signup → first entry → first import funnel, with no amounts, payees or free text, per Phase 0 D-18.
- Whether a hand-entered transaction dated in the future defaults to pending.

### Deferred Ideas (OUT OF SCOPE)
- **Receipt attachments** (prototype `receipt` field): needs a Supabase Storage bucket with RLS, a camera or image picker, an App Privacy "photos" disclosure, and purge on account deletion. Belongs in its own phase or the backlog.
- **Bank-specific CSV presets** (Chase, Monzo, Revolut…): offered and not chosen. Revisit if generic mapping proves painful.
- **Lossless import of FincWin's own export format**: offered and not chosen here. Worth reconsidering alongside data portability (GDPR export).
- **Payee rename and cleanup rules** that learn from renames: not chosen for v1.
- **Field-level undo merge**: not chosen. Any version change refuses the step.
- **Autopay auto-mark-paid**: not chosen. Pending rows are never assumed paid.
- **RRULE-style schedules** ("last Friday of the month"): not chosen.
- **Tax-relevant flag**: dropped under the existing Out of Scope decision. Not coming back without a PROJECT.md change.
- **Production backups (ENV-16)**: moved to Phase 10 on 2026-09-25, method TBD, likely AWS. Phase 2 dogfooding runs on production without backups, as an accepted risk. Nothing in this phase may assume a restore is possible.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | Log an expense with amount, category, account, date | Existing `useAddTransaction`/`insertTransaction` path extends with `direction`/`status`/`name`/`category_id`/`payment_type` columns — see Architecture Patterns §1 |
| REC-02 | Log income with amount, category, account, date | Same path; `direction` or signed `original_amount` distinguishes in/out (see Open Questions) |
| REC-03 | Edit any transaction the user created | Existing `useEditTransaction`/`updateTransaction` version-conditional path extends unchanged — see Code Examples §1 |
| REC-04 | Delete a transaction | New: soft delete (`deleted_at`) per D-30 — see Architecture Patterns §5, Common Pitfalls §1 |
| REC-05 | Recurring transaction generates entries without re-typing | `recurring_series` table + server-side materialisation job — see Architecture Patterns §2 |
| REC-06 | Skip or end one occurrence without deleting the series | `occurrence_status` column (`pending`/`paid`/`skipped`) + `end_date` on series — see Architecture Patterns §2 |
| REC-07 | Create, rename, colour own categories | Per-user `categories` table, RLS pattern from `custom_currencies` — see Architecture Patterns §4 |
| REC-08 | Create accounts, see balance per account | `accounts` table already exists (Phase 1); balance = `opening_balance` + sum of paid transactions — see Architecture Patterns §1 |
| REC-09 | Import CSV during onboarding or later | `expo-document-picker` + `expo-file-system` + pure `engine/csv` parser — see Standard Stack, Architecture Patterns §3 |
| REC-10 | Preview and correct column mapping before commit | Column auto-detection heuristics in `engine/csv`, no server round-trip needed for preview — see Architecture Patterns §3 |
| REC-11 | Undo last 12 changes from toast or history | `undo_log` table + compensating-write engine module reusing Phase 1's version-conditional mutation path — see Architecture Patterns §5 |
| REC-12 | Undo refused with explanation on conflict | Reuses Phase 1 D-18 `VersionConflictError`/`versionChain.ts` exactly — see Architecture Patterns §5, Code Examples §2 |
| ACT-01 | See all transactions for a month in a list | Existing `fetchTransactionsForMonth` (Phase 1) + pagination pattern already built — see Code Examples §3 |
| ACT-02 | Switch months, including archived | Existing `transactionsMonth` query key per month; month switcher iterates months with data (no `archive_months` table yet) |
| ACT-03 | Search across all months | Server-side search — `ilike` vs `pg_trgm` vs full-text tradeoffs — see Architecture Patterns §6, Common Pitfalls §6 |
| ACT-04 | Filter by category, account, amount | Client-side filter on cached month data, or server query params — see Architecture Patterns §6 |
| ACT-05 | Bulk-select and delete in one action | Bulk soft-delete as one undo step (D-24) — see Architecture Patterns §5 |
| ANL-05 | Signup → first entry → first CSV import funnel measurable | Extends Phase 0's typed PostHog event catalogue (`src/services/analytics/catalogue.ts`) — see Architecture Patterns §7 |
</phase_requirements>

---

## Summary

Phase 2 is additive, not foundational: Phase 1 already built the hard parts this phase depends on — client-generated UUIDs, server-stamped FX, a version-conditional optimistic mutation pipeline (`setMutationDefaults` + paused-mutation queue + `expected_version`), a typed error/conflict classifier, and a `transactionsMonth`-keyed cache. Record's job is to extend the `transactions` table with new columns (`status`, `name`, `payment_type`, `category_id`, `direction`, `deleted_at`, `recurring_series_id`, `import_batch_id`), add four new per-user/household tables (`categories`, `recurring_series`, `undo_log`, plus an `import_batches` marker), and reuse the exact mutation/cache/conflict machinery Phase 1 already proved rather than inventing a second one.

Three genuinely new mechanisms exist: (1) **recurring materialisation**, best done as a plpgsql function scheduled by `pg_cron` — mirroring the project's own `fx_restamp_pending()`/`fx-monitor` pattern — rather than an Edge Function, because calendar-date arithmetic (weekly/monthly/quarterly/yearly with month-end clamping) needs no HTTP call and no external API, unlike FX; (2) **CSV import**, which is genuinely offline/on-device (`expo-document-picker` + `expo-file-system` read + a pure `engine/csv` parser, chunked through the existing `insertTransaction` mutation path — no new server code); (3) **compensating-write undo**, a `engine/undo` module that computes the inverse of each mutation (add ↔ delete, edit ↔ edit-back, bulk-op ↔ bulk-inverse) and replays it through the identical version-conditional path Phase 1 built for conflict handling, so `REC-12`'s refusal semantics are literally the same code path as Phase 1's "changed elsewhere" (`VersionConflictError`).

The category and undo tables are the first genuinely **per-user** (not per-household) RLS tables besides `custom_currencies` and `profiles` — that table is the direct precedent to copy (`owner_id uuid not null default auth.uid()`, `owner_id = (select auth.uid())` policies), not the household-scoped `user_household_ids()` pattern `transactions`/`accounts` use.

**Primary recommendation:** Extend `transactions` additively (new nullable/defaulted columns only, per Phase 1 D-26/D-27's expand-contract discipline), add `categories`/`recurring_series`/`undo_log` as new tables using the `custom_currencies` per-user RLS pattern, materialise recurring occurrences via a scheduled plpgsql function (not an Edge Function), parse CSV entirely on-device through a pure `engine/csv` module, and build undo as pure inverse-computation in `engine/undo` replayed through Phase 1's existing mutation/version-conflict pipeline.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Transaction CRUD (add/edit/delete) | API/Backend (Postgres RLS + triggers) | Client (optimistic cache, `src/data/mutations`) | Server is authority on FX stamp, version, RLS; client owns optimistic UX — established in Phase 1, unchanged here |
| Recurring occurrence generation | API/Backend (`pg_cron` + plpgsql) | Client (`engine/recurring` projects beyond materialisation horizon for read-only display) | Materialised rows must exist so they're visible/editable offline (D-02); pure calendar-date maths needs no external API so a server-side SQL job is simpler than an Edge Function |
| CSV parsing and column-mapping preview | Client (`engine/csv`, on-device) | — | D-17 explicitly locks this: "parsing happens on the device… the raw file is never uploaded" |
| Category/duplicate/recurrence-suggestion detection (import) | Client (`engine/` pure functions) | — | D-14/D-21 lock detection logic into `engine/`, no LLM, no server round-trip |
| Undo compensating-write computation | Client (`engine/undo`, pure) | API/Backend (`undo_log` storage, RLS, version check on replay) | D-23 requires the inverse-op computation to be pure/testable; the log itself must be server-side and per-user so it survives restarts and follows the user across devices |
| Activity list / search / filter | API/Backend (query params: `ilike`/`pg_trgm`, category/account/amount filters) | Client (client-side filter on already-cached current month for zero-latency UX) | Cross-month search (ACT-03) cannot be answered from a single cached month; current-month filter can be instant client-side |
| Category management (CRUD, colour, merge, archive) | API/Backend (per-user RLS table) | Client (colour swatch picker is a fixed local palette, no server round trip needed to enumerate it) | Categories are user data requiring RLS and cross-device sync, but the swatch palette itself is a design-token constant |
| Balance display | Client (derived: `opening_balance` + sum of paid transactions, from cached month data) | API/Backend (server is authority on which rows count via `status='paid'`) | Consistent with Phase 1's pattern of deriving totals from cached rows rather than a dedicated balance endpoint |

---

## Standard Stack

### Core (already installed — Phase 0/1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.116.0 [VERIFIED: package.json] | Postgres client, RLS-scoped queries | Already the project's sole data-access path; Record adds no new client SDK |
| `@tanstack/react-query` + persist-client + async-storage-persister | ^5.103.2 [VERIFIED: package.json] | Cache, paused-mutation write queue | Phase 1 built the entire `setMutationDefaults`/`WRITE_SCOPE` pattern this phase must extend, not replace |
| `expo-crypto` | ~57.0.3 [VERIFIED: package.json] | Client-generated UUIDs (`Crypto.randomUUID()`) | Used identically for every new table's client-generated PK (categories, recurring_series, undo_log rows, import batch ids) |
| `expo-file-system` | ~57.0.7 [VERIFIED: package.json] | Read a picked CSV file's text content on-device | Already a dependency; no new install needed for CSV import's file-read step |
| `expo-localization` | ~57.0.2 [VERIFIED: package.json] | Region-aware date/decimal inference for CSV columns | Reuse for D-11's "date format and decimal mark are inferred from the sample rows" |
| `fast-check` + `@fast-check/jest` | ^4.10.2 / ^2.3.0 [VERIFIED: package.json] | Property-based tests for recurring schedule maths, CSV parser edge cases, undo inverse-computation | Already the project's PBT tool for `engine/`; D-04's "property-tested" and D-17's "property-tested" requirements point straight at it |

### New for this phase
| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|------------------|
| `expo-document-picker` | `~57.0.2` [VERIFIED: `npm view expo-document-picker version` → 57.0.2, matches installed SDK-57 lockstep versioning of every other `expo-*` package in this repo] | Native file picker for CSV import (REC-09) | SDK-locked Expo module, same versioning convention as `expo-secure-store`/`expo-local-authentication` already in the repo; no viable alternative for a native file-open dialog under Expo managed workflow |
| CSV tokenizer: **hand-rolled**, not `papaparse` | n/a | Parse raw CSV text (quoted fields, embedded commas/newlines, escaped quotes) into rows | See "Don't Hand-Roll" — this is the one exception, reasoning below is load-bearing, read it before assuming a library is always right |

**Installation:**
```bash
npx expo install expo-document-picker
```

**Version verification:** `expo-document-picker@~57.0.2` [VERIFIED via `npm view expo-document-picker version` on 2026-09-25 — returned `57.0.2`, matching CLAUDE.md's SDK-57 lockstep table for `expo-secure-store`/`expo-local-authentication`]. No other new runtime dependency is required for this phase — every other capability (recurring maths, undo, CSV parsing, category CRUD) is pure TypeScript or plain Postgres/PostgREST, both already in the stack.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled CSV tokenizer in `engine/csv` | `papaparse` (^5.x) [VERIFIED: `npm view papaparse version/description` — latest is actively published, description reads "Fast and powerful CSV parser **for the browser**"] | Papaparse's core string-mode parser (`Papa.parse(csvString, { header: true })`) has no browser-only dependency and would work under Hermes, but its docs, examples and most-used options (worker threads, streaming a `File`/`Blob`, `FileReader` fallback) are browser/Node-oriented, not React-Native-tested; pulling in a ~20KB dependency to save what is genuinely a ~60-line RFC-4180 tokenizer (quote-doubling, embedded delimiters, CRLF/LF) is disproportionate given D-17 already requires the parser to be pure, in `engine/`, and property-tested regardless of which code writes it. **Recommendation: hand-roll**, tested against `fast-check` generators covering quoted fields, embedded commas, embedded newlines inside quotes, and mixed line endings — this is the rare case where hand-rolling is the right call, not the exception the "Don't Hand-Roll" table normally argues against |
| plpgsql `pg_cron` job for recurring materialisation | Deno Edge Function (mirroring `fx-sync`/`fx-monitor`) | The Edge Function pattern is right for FX because it calls an external HTTP API (Frankfurter) that plpgsql cannot reach without `pg_net`. Recurring materialisation needs only calendar-date arithmetic (`date + interval`, month-end clamping) — native to plpgsql, no HTTP call needed. A SQL function is simpler, has one fewer moving part (no Vault secret, no `net.http_post`), and is directly testable via the project's existing pgTAP harness. **Recommendation: plpgsql function + `pg_cron`**, not an Edge Function |
| `ilike '%term%'` unindexed search | `pg_trgm` GIN index + `ilike`, or Postgres full-text (`tsvector`/`tsquery`) | `pg_trgm` [ASSUMED available — Supabase Postgres ships it as a standard `contrib` extension, not separately verified against this project's specific instance] gives fast substring search (needed since a payee search should match mid-string, not just prefix) without the linguistic-stemming behaviour of full-text search, which is overkill for short payee/name strings and would need per-locale configuration. **Recommendation: `pg_trgm` + `ilike`** for ACT-03, revisit full-text only if search volume/relevance becomes a real problem |

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │              Client (Expo/RN)             │
                         │                                           │
  Entry sheet ──────────▶│ useAddTransaction()/useEditTransaction() │
  (amount/cat/acct/date) │   [extends Phase 1 mutation, new fields] │
                         │            │                              │
  CSV file picker ──────▶│ expo-document-picker → expo-file-system  │
                         │   → engine/csv (parse, map, dedupe,      │
                         │     guess category) → preview UI         │
                         │            │ (user confirms mapping)      │
                         │            ▼                              │
                         │  chunked insertTransaction() calls        │
                         │  (same mutation path as manual entry)     │
                         │            │                              │
  Any mutating action ──▶│ engine/undo: computeInverse(action)      │
  (add/edit/delete/      │   → undo_log insert (own mutation path)   │
   bulk-op/import/merge) │            │                              │
                         │  Toast "Undo" / History screen ───────────┼──▶ replay inverse via
                         │                                           │    same version-conditional
                         │  Activity list ── ilike/filter query ─────┼──▶ mutation path (D-29)
                         └────────────┬──────────────────────────────┘
                                      │ PostgREST (RLS-enforced)
                                      ▼
                         ┌─────────────────────────────────────────┐
                         │         Supabase Postgres (production)    │
                         │                                           │
                         │  transactions (+status,name,category_id,  │
                         │    payment_type,direction,deleted_at,     │
                         │    recurring_series_id,import_batch_id)   │
                         │  categories (per-user RLS)                │
                         │  recurring_series (household RLS)         │
                         │  undo_log (per-user RLS)                  │
                         │                                           │
                         │  stamp_fx_rate trigger (Phase 1, unchanged)│
                         │  bump_version trigger (Phase 1, unchanged)│
                         │                                           │
                         │  pg_cron ──▶ generate_occurrences()       │
                         │    (plpgsql, no HTTP call, calendar maths)│
                         └───────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── engine/
│   ├── recurring/          # NEW: pure schedule maths (nextOccurrence, clampToMonthEnd,
│   │                       #   projectBeyondHorizon), built on engine/time/localDate
│   ├── csv/                # NEW: tokenizer, column-mapping heuristics, decimal-mark/date-format
│   │                       #   inference, duplicate detection, recurring-suggestion detection
│   ├── categorize/         # NEW: keyword-rule + learned-description category guessing (D-14)
│   ├── undo/                # NEW: computeInverse(action) -> InverseOp[], pure
│   ├── money/, split/, time/, guards/   # Phase 1, unchanged
├── db/
│   ├── categories.ts        # NEW: typed reads/version-conditional writes, mirrors transactions.ts
│   ├── recurringSeries.ts   # NEW
│   ├── undoLog.ts           # NEW
│   ├── transactions.ts      # EXTENDED: new columns in TRANSACTION_PATCH_KEYS/COLUMNS
│   ├── accounts.ts, rows.ts, errors.ts, session.ts   # Phase 1, unchanged
├── data/
│   ├── mutations/
│   │   ├── transactions.ts   # EXTENDED: status/category/payment_type/soft-delete in patch shape
│   │   ├── categories.ts     # NEW: add/edit/archive/merge mutation defaults
│   │   ├── recurringSeries.ts # NEW
│   │   ├── undo.ts           # NEW: replays an inverse op through the matching mutation default
│   │   ├── csvImport.ts      # NEW: chunked insert loop, batches via import_batch_id
│   ├── queries/
│   │   ├── categories.ts, recurringSeries.ts, undoLog.ts, activitySearch.ts   # NEW
├── features/
│   └── record/               # NEW feature folder: entry sheet, Activity screen, category
│                              #   management, CSV import flow, History screen (per src/README.md's
│                              #   src/features/ convention — "Record, Decide, Grow, Household")
supabase/
├── migrations/
│   ├── 20260926..._categories.sql
│   ├── 20260926..._transactions_record_fields.sql   # additive columns on transactions
│   ├── 20260926..._recurring_series.sql
│   ├── 20260926..._undo_log.sql
│   ├── 20260926..._recurring_materialisation.sql     # plpgsql fn + pg_cron schedule
├── tests/database/
│   ├── 25_categories_rls.test.sql, 26_recurring_series.test.sql,
│   │   27_undo_log_rls.test.sql, 28_soft_delete.test.sql   # pgTAP, continuing the existing sequence
```

### Pattern 1: Extend the existing version-conditional mutation, don't build a second pipeline

**What:** New transaction fields (`status`, `name`, `payment_type`, `category_id`, `direction`) are added to `TransactionPatch`/`NewTransaction` in `src/db/rows.ts`, to `TRANSACTION_INSERT_KEYS`/`TRANSACTION_PATCH_KEYS`/`TRANSACTION_COLUMNS` in `src/db/transactions.ts`, and to the optimistic-row construction in `src/data/mutations/transactions.ts`. Soft delete (D-30) is implemented as an edit-shaped mutation (`update ... set deleted_at = now() where id = $1 and version = $2`), reusing `useEditTransaction`'s exact conflict handling rather than a bespoke delete mutation.

**When to use:** Every new column on an existing table that a normal add/edit flow needs.

**Example (grounded in the actual file read this session):**
```typescript
// src/db/transactions.ts — extend, do not replace
export const TRANSACTION_PATCH_KEYS = [
  'account_id', 'original_amount', 'original_currency', 'local_date', 'time_zone', 'note',
  'name', 'category_id', 'payment_type', 'status', 'deleted_at', // NEW
] as const satisfies readonly (keyof TransactionPatch)[];
```
Soft delete then becomes:
```typescript
// src/data/mutations/transactions.ts — reuse useEditTransaction, not a new useDeleteTransaction
edit({ id, householdId, month, expectedVersion, patch: { deleted_at: new Date().toISOString() } });
```
This means REC-04's delete gets D-18's conflict handling, D-19's failed-write parking, and D-29's undo replay for free — no new error-classification code.

### Pattern 2: Recurring materialisation as a scheduled plpgsql function, not an Edge Function

**What:** `recurring_series(id, household_id, created_by, name, amount, currency, account_id, category_id, payment_type, direction, freq, interval_count, day_of_month, end_date, occurrence_count, version, ...)`. A plpgsql function `generate_occurrences(p_horizon date)` runs daily via `pg_cron`, mirroring `fx_restamp_pending()`'s structure exactly: iterate active series, compute the next occurrence dates up to `p_horizon` (end of next month, D-03) using pure calendar-date arithmetic, `insert ... on conflict (recurring_series_id, occurrence_date) do nothing` pending rows into `transactions`.

**When to use:** Any server-side job that needs no external API call — the project's own precedent (`fx_restamp_pending`, `fx_auto_accept_holds`) already establishes "plpgsql function + `pg_cron`, service_role-only execute grant" as the house style for background jobs that stay inside Postgres.

**Example (mirroring the actual `fx_restamp_pending` pattern read this session):**
```sql
-- Source: supabase/migrations/20260924000700_fx_monitor_jobs.sql, pattern mirrored
create or replace function public.generate_occurrences(p_horizon date default (date_trunc('month', current_date) + interval '2 months' - interval '1 day')::date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  s public.recurring_series%rowtype;
  next_date date;
begin
  for s in select * from public.recurring_series where end_date is null or end_date >= current_date loop
    next_date := public.next_occurrence_date(s.anchor_date, s.freq, s.interval_count, s.last_materialized_date);
    while next_date is not null and next_date <= p_horizon and (s.end_date is null or next_date <= s.end_date) loop
      insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
        local_date, time_zone, name, category_id, payment_type, status, recurring_series_id)
      values (gen_random_uuid(), s.household_id, s.account_id, s.created_by, s.amount, s.currency,
        next_date, s.time_zone, s.name, s.category_id, s.payment_type, 'pending', s.id)
      on conflict do nothing;
      n := n + 1;
      next_date := public.next_occurrence_date(s.anchor_date, s.freq, s.interval_count, next_date);
    end loop;
  end loop;
  return n;
end;
$$;
```
`next_occurrence_date()` is the SQL mirror of `engine/recurring`'s pure TS function, tested against a shared fixture (`supabase/tests/fixtures/recurring-schedule-cases.json`) exactly the way `07_money_rounding_mirror.test.sql` proves `engine/money` and `stamp_fx_rate()` agree. **Confidence: MEDIUM** — this SQL-mirror-with-shared-fixture approach is an architectural inference from the project's own established money-mirror pattern, not verified against a Supabase-published recipe for recurring transactions specifically.

### Pattern 3: CSV import as an on-device pure pipeline, chunked through the existing insert mutation

**What:** `expo-document-picker` returns a local file URI → `expo-file-system`'s `readAsStringAsync` reads the text → `engine/csv/tokenize.ts` splits it into rows → `engine/csv/detectColumns.ts` guesses date/description/amount columns from the header and a sample of data rows → `engine/csv/inferFormat.ts` guesses date format and decimal mark from the sample → user reviews/corrects mapping in the preview UI (no server round-trip needed for this step) → on commit, rows are parsed through the Phase 1 `parseAmount` (D-24, strict, region-aware) with the *inferred* decimal mark rather than the *device* locale's, and sent through `insertTransaction` in chunks (e.g. 200 rows) tagged with a shared `import_batch_id`.

**When to use:** Any file-based bulk-create flow where privacy requires the raw file to never leave the device (D-17).

### Pattern 4: Per-user RLS table — copy `custom_currencies`, not `transactions`

**What:** `categories` and `undo_log` are scoped to the user, not the household (D-33, D-23). The project already has exactly this shape in `custom_currencies` (Phase 1): `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, with three policies (`select`/`insert`/`update` all `owner_id = (select auth.uid())`), and column-level grants rather than a `with check` on every column. Use this pattern verbatim rather than adapting `transactions`'/`accounts`' `user_household_ids()` household-scoped pattern, which is structurally different (household membership is many-to-one via a join, not a direct owner column).

**Example (verbatim precedent read this session, `supabase/migrations/20260924000100_custom_currencies.sql`):**
```sql
create table public.categories (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color_key text not null,             -- one of the 7 swatch-pair keys (D-35), not a free hex value
  is_system boolean not null default false,   -- Transfer/Settlement (D-34), never editable
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_version before update on public.categories for each row execute function public.bump_version();
alter table public.categories enable row level security;
create policy "owner reads own categories" on public.categories for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own categories" on public.categories for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_system);  -- clients can never create a system row
create policy "owner updates own categories" on public.categories for update to authenticated
  using (owner_id = (select auth.uid()) and not is_system) with check (owner_id = (select auth.uid()));
```

### Pattern 5: Undo as pure inverse-computation replayed through existing mutations

**What:** `engine/undo/computeInverse.ts` takes a description of what just happened (e.g. `{ kind: 'edit', entity: 'transactions', id, before, after, expectedVersionAfter }`) and returns the inverse op (`{ kind: 'edit', entity: 'transactions', id, patch: before, expectedVersion: expectedVersionAfter }`). This is pure and testable with no DB access. The data layer then inserts a row into `undo_log` (server-side, RLS-scoped to `auth.uid()`) describing the step, and on "Undo", replays the stored inverse op through the *same* `useEditTransaction`/`useAddTransaction`/bulk-mutation functions already built — meaning a version conflict during undo produces the exact same `VersionConflictError` → `recordFailedWrite` → "couldn't save, changed elsewhere" path Phase 1 already built and tested (D-29's own wording: "surfaces through Phase 1 D-18/D-19's... path").

**Why this is the right shape:** it means REC-12 needs zero new conflict-detection code — only a new *presentation* layer (the "{Person} edited {record}" copy, D-26) on top of the same `VersionConflictError` Phase 1 already throws.

### Pattern 6: Activity search/filter — server query for cross-month, client filter for current month

**What:** ACT-03 (search across all months) cannot be answered from the `transactionsMonth`-keyed cache (Phase 1's cache is deliberately per-month). Add a dedicated `queryKeys.transactionsSearch(householdId, term)` query hitting `.ilike('name', `%${term}%`)` (with a `pg_trgm` GIN index on `transactions.name` for performance) or `.textSearch(...)`, scoped by `local_date` range only when a date filter is also active. ACT-04 (filter by category/account/amount) on the *currently viewed* month can run entirely client-side against the already-cached month array — no new query needed, just a `useMemo` filter — mirroring the project's existing pattern of deriving views from cached data rather than adding new server round-trips for things the client already has.

### Anti-Patterns to Avoid
- **Building a second mutation pipeline for Record's writes:** Phase 1's `setMutationDefaults`/`WRITE_SCOPE`/`versionChain`/`failedWrites` machinery is the only write path in this codebase. A new "record mutations" system that doesn't register into `WRITE_SCOPE` would let Record writes and Money-Core writes replay out of order after an offline period, breaking D-20's ordering guarantee.
- **Computing undo inverses against a snapshot fetched at undo time:** the inverse must be computed and stored at the moment the *original* action happens (per D-23, "the step and its inverse ops are computed in engine/"), not reconstructed later from current state — reconstructing later cannot know what the value was *before* the original edit.
- **Treating `rate_pending` imported rows as a reason to block the import commit:** D-19 explicitly says historical FX for imports reuses the existing backfill-on-demand path; the import commit must succeed immediately with `rate_pending: true` rows, not wait on FX resolution.
- **Hard-deleting on REC-04:** D-30 requires soft delete; a hard `delete from transactions` would make undo (REC-11) impossible for that row and would violate the "every read path excludes `deleted_at`" invariant if any query forgets to filter it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version-conditional writes, retry/backoff, conflict classification | A new "Record mutation" framework | Phase 1's `setMutationDefaults` + `writeErrors.ts` + `versionChain.ts` + `cacheRows.ts` | Already built, already tested, already handles the exact `expected_version` semantics REC-12 needs |
| Soft-delete + purge-on-account-deletion bookkeeping | A bespoke tombstone table | `deleted_at` column on `transactions` (and any other table undo can reverse a delete on), filtered at every read query, purged by a scheduled job once no `undo_log` row references it | Matches the project's existing `archived_at` convention on `accounts`; keeps read paths (`fetchTransactionsForMonth`) as the single place the filter needs to be added |
| Money parsing for CSV amount columns | A second amount parser for import | Phase 1's `parseAmount` (D-24), called with the *inferred* decimal mark | D-11 explicitly locks this: "Amount strings go through the Phase 1 strict parser... so no `parseFloat` is used" |
| Currency/date formatting in the CSV preview | New formatting code | Phase 1's `useMoneyFormatter`/`formatAmount`/`formatDate` | Same display rules (symbol placement, minus sign, decimals) must apply everywhere money is shown, including a not-yet-committed preview row |
| RLS pattern for a new per-user table | A novel policy shape | `custom_currencies`' exact three-policy `owner_id = (select auth.uid())` pattern | Already reviewed, already has a pgTAP precedent (`08_custom_currencies_prefs.test.sql`) to copy the test structure from |
| CSV quote/delimiter tokenizing | `papaparse` or another parsing library | A hand-rolled ~60-line RFC-4180 tokenizer in `engine/csv`, property-tested | See Alternatives Considered — this is the one case where the library is disproportionate to the problem and the project's own purity/testing requirements make hand-rolling no more expensive than integrating a browser-oriented dependency |

**Key insight:** almost everything Record needs already exists in Phase 1's data layer in a form that generalizes cleanly — the main engineering risk in this phase is *not* technical novelty, it's discipline: extending existing files (`transactions.ts`, `rows.ts`, `keys.ts`) rather than duplicating them, so that the write-ordering, conflict, and cache-invalidation guarantees Phase 1 spent real effort proving don't quietly stop applying to half the app's writes.

---

## Common Pitfalls

### Pitfall 1: A new read path forgets the `deleted_at` filter
**What goes wrong:** A soft-deleted transaction reappears in a list, a total, or a search result.
**Why it happens:** D-30 requires *every* read path to exclude `deleted_at is not null` rows, but this phase adds several new read paths (search, filter, category-usage-count, recurring-occurrence lists) beyond the one `fetchTransactionsForMonth` Phase 1 built.
**How to avoid:** Add the filter once, centrally — e.g. a Postgres view (`transactions_active`) or a `where deleted_at is null` baked into a single shared query builder — rather than repeating the clause in every new `db/` function. A pgTAP test asserting a soft-deleted row is invisible to every read function is worth the cost given how easy this is to miss.
**Warning signs:** A "deleted" transaction shows up after a bulk delete + undo cycle, or a category's "used by N transactions" count includes rows the user already deleted.

### Pitfall 2: Recurring "this and future" edit regenerates paid rows
**What goes wrong:** Editing a series' amount from a given date forward accidentally rewrites already-paid historical occurrences.
**Why it happens:** D-07 requires "This and future" to update the template and regenerate *not-yet-paid* occurrences only; a naive `delete + regenerate` for the whole series-from-date-forward would also catch paid rows dated after the edit date if the implementation filters on date alone rather than `date AND status != 'paid'`.
**How to avoid:** The regeneration query must filter on `status = 'pending' AND local_date >= p_effective_date`, never on date alone.
**Warning signs:** A user's confirmed rent payment silently changes amount after they edit next month's rent.

### Pitfall 3: `pg_cron` materialisation double-inserts on a schedule change mid-month
**What goes wrong:** A series edited via "this and future" regenerates occurrences, and the same day's `pg_cron` run also tries to materialise the horizon, producing duplicate pending rows for the same series/date.
**Why it happens:** Two write paths (user-triggered regeneration, scheduled materialisation) can both target the same `(recurring_series_id, local_date)` pair.
**How to avoid:** A unique constraint on `(recurring_series_id, local_date) where deleted_at is null` with `on conflict do nothing` on every insert path, exactly as `fx_rates` already uses `on conflict (base, quote, rate_date, source) do nothing` for its own double-write hazard (verified in `fx_auto_accept_holds`).
**Warning signs:** Two identical "Rent — pending" rows for the same date after editing a series.

### Pitfall 4: Undo of a bulk operation replays out of order or partially
**What goes wrong:** Undoing "Deleted 30 lines" restores only some of the 30 rows because one of them was edited elsewhere in the meantime (D-26's conflict rule).
**Why it happens:** D-26 says the *whole step* is refused if *any* touched record's version has moved — but a naive implementation might apply the 29 non-conflicting restores before discovering the 30th conflicts, leaving a half-undone state that isn't itself a valid undo-able unit.
**How to avoid:** Two-phase replay: first verify every inverse op's `expected_version` still matches (a batch of `select id, version from transactions where id = any($1)`), refuse the whole step if any mismatch, then apply all inverse ops only after that check passes. This mirrors D-27's rollback semantics ("if a step conflicts, the rollback stops there") but for a single multi-row step it must be all-or-nothing, not partial.
**Warning signs:** An "Undo" produces 29 restored rows and a silent gap, with no "can't undo" message shown.

### Pitfall 5: CSV date-format inference guesses wrong on ambiguous dates
**What goes wrong:** A file with rows like `01/02/2026` is parsed as January 2nd when the bank meant February 1st (or vice versa) — 12 rows out of a sample could be ambiguous (day ≤ 12) with no way to disambiguate from the data alone.
**Why it happens:** D-11's "date format… inferred from the sample rows" only works when the sample contains at least one row with day > 12 (which disambiguates DD/MM vs MM/DD) or a 4-digit year in an unambiguous position.
**How to avoid:** Show the *inferred* format explicitly in the preview ("Reading dates as DD/MM/YYYY") with a way to flip it, rather than silently committing a guess; treat "no disambiguating row found" as its own detected state, not a silent default to one format.
**Warning signs:** A user's imported transactions cluster in the wrong month for dates 1–12 of every month.

### Pitfall 6: Unindexed `ilike '%term%'` search does a sequential scan at scale
**What goes wrong:** ACT-03 cross-month search becomes slow as a household's transaction history grows, since a leading-wildcard `ilike` cannot use a standard B-tree index.
**Why it happens:** `ilike '%term%'` (as opposed to a prefix search `ilike 'term%'`) forces Postgres to scan every row unless a trigram (`pg_trgm`) GIN index exists.
**How to avoid:** Add `create extension if not exists pg_trgm; create index transactions_name_trgm_idx on transactions using gin (name gin_trgm_ops);` in the same migration that adds the `name` column, so the index exists before any real data volume accumulates. **Confidence: MEDIUM** — `pg_trgm` is a standard Postgres contrib extension and Supabase generally allows it, but this was not verified against this specific project's allowed-extensions list this session.

### Pitfall 7: `handle_new_user()` provisioning trigger isn't updated for category seeding
**What goes wrong:** A user who signs up *after* Record ships gets no seeded categories, but a user who signed up during Phase 0/1 testing (before Record existed) also has none, and both cases need handling.
**Why it happens:** D-34's "seeded per user at provisioning" naturally extends `handle_new_user()` (the exact trigger read this session in `20260922000100_household_of_one.sql`), but that only covers *new* signups going forward from the migration that updates it.
**How to avoid:** The migration that adds category seeding to `handle_new_user()` must also backfill the seed set for any `profiles` row that predates it (a one-time `insert into categories select ... from profiles where not exists (select 1 from categories where owner_id = profiles.id)`), which matters concretely here since the project has been dogfooding through Phase 0/1 on the same production database already (per STATE.md, phases run against the single production Supabase project).

---

## Code Examples

### 1. Extending the version-conditional edit path for soft delete (REC-04)
```typescript
// Source: pattern from src/data/mutations/transactions.ts (read this session), extended
export function useDeleteTransaction(): { remove(vars: { id: string; householdId: string; month: string; expectedVersion: number }): void } {
  const { edit } = useEditTransaction();
  return {
    remove(vars) {
      edit({
        id: vars.id,
        householdId: vars.householdId,
        month: vars.month,
        expectedVersion: vars.expectedVersion,
        patch: { deleted_at: new Date().toISOString() },
      });
    },
  };
}
```

### 2. Undo replay reusing Phase 1's exact conflict type (REC-12)
```typescript
// engine/undo/computeInverse.ts (pure)
export function computeInverse(action: RecordedAction): InverseOp {
  switch (action.kind) {
    case 'add':
      return { kind: 'delete', entity: action.entity, id: action.id, expectedVersion: 1 };
    case 'edit':
      return { kind: 'edit', entity: action.entity, id: action.id, patch: action.before, expectedVersion: action.versionAfter };
    // ...bulk, import-batch, category-merge cases similarly
  }
}

// src/data/mutations/undo.ts — replay uses the SAME error type Phase 1 already throws
import { VersionConflictError } from '@/db/errors';
async function replayInverseOp(op: InverseOp): Promise<'applied' | 'refused'> {
  try {
    await updateTransaction(client, op.id, op.expectedVersion, op.patch); // db/transactions.ts, unchanged
    return 'applied';
  } catch (err) {
    if (err instanceof VersionConflictError) return 'refused'; // D-26's refusal, zero new conflict logic
    throw err;
  }
}
```

### 3. Per-user RLS table + pgTAP test shape to copy
```sql
-- Source: supabase/migrations/20260924000100_custom_currencies.sql (read this session), the direct
-- precedent for categories/undo_log — NOT the household-scoped pattern accounts/transactions use.
create policy "owner reads own categories" on public.categories for select to authenticated
  using (owner_id = (select auth.uid()));
```
```sql
-- Source: supabase/tests/database/08_custom_currencies_prefs.test.sql establishes the pgTAP shape
-- for a per-user table; a new 25_categories_rls.test.sql should assert the same three things:
-- (1) owner can select/insert/update own rows, (2) another user cannot see them,
-- (3) is_system rows reject client insert/update.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Client-side "last write wins" for concurrent edits | Server-authoritative `expected_version` with a typed `VersionConflictError` | Established this project, Phase 1 (2026-09-24/25) | Record's undo (REC-12) is free — no new conflict model needed, only new presentation copy |
| Bank-preset CSV importers (Mint/YNAB-style column templates per bank) | Generic auto-detected column mapping with user confirmation | Decided in this phase's CONTEXT.md (D-11), not an industry-wide shift — a deliberate scope choice, not a stale-knowledge correction | Simpler to build and maintain (no preset library to keep current), at the cost of slightly more friction per import than a matched preset would give |

**Deprecated/outdated:** Nothing in this phase's stack is deprecated — every dependency reused from Phase 0/1 was already verified current as of 2026-09 in `CLAUDE.md`'s own staleness table.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pg_trgm` extension is available and enabling it is unproblematic on this Supabase project | Common Pitfalls §6, Standard Stack alternatives | If the extension is restricted, ACT-03 search falls back to a plain (unindexed or prefix-only) `ilike`, acceptable at this project's expected data volume but worth confirming during planning with `supabase db diff` / a quick `create extension pg_trgm;` test against the local stack |
| A2 | A plpgsql `generate_occurrences()` function scheduled via `pg_cron` is sufficient for the materialisation job, with no need for an Edge Function | Architecture Patterns §2 | If recurring-suggestion detection or category-guess learning ever needs to run server-side (currently both are client-only per D-14/D-21), this assumption would need revisiting — but as scoped, no server-side TS logic is needed for recurring generation |
| A3 | Hand-rolling the CSV tokenizer (rather than `papaparse`) is the right call given engine-purity and property-testing requirements | Standard Stack, Don't Hand-Roll | If real-world bank CSV exports turn out to have edge cases beyond RFC-4180 (e.g. non-UTF-8 encodings, unusual escaping) that a mature library already handles, a hand-rolled parser could under-handle them; mitigate with a generous property-test suite before trusting it against real bank exports |
| A4 | The `handle_new_user()` provisioning trigger backfill for pre-existing users is a one-time migration-time data fix, not an ongoing concern | Common Pitfalls §7 | If more users sign up between Phase 1 and Phase 2 landing in production (the project dogfoods on the single production Supabase project per STATE.md), the backfill query must run again or be idempotent — recommend making it idempotent (`where not exists`) rather than one-shot |
| A5 | A hand-entered transaction dated in the future should default to `pending`, not `paid` | User Constraints, explicitly Claude's Discretion | This is explicitly left open by CONTEXT.md ("Whether a hand-entered transaction dated in the future defaults to pending") — the planner should decide it, but the natural-reading answer (paid = money that has moved) argues for defaulting future-dated hand entries to `pending`, consistent with D-05's "nothing is marked paid automatically" spirit even for manual entry |

**If this table is empty:** N/A — see entries above.

---

## Open Questions (RESOLVED)

1. **Direction of a transaction: a `direction` enum column, or infer income/expense from the sign of `original_amount`?**
   - What we know: `original_amount` is already `bigint ... check (original_amount <> 0 ...)`, signed, outflow negative (per the `transactions.sql` comment read this session). REC-01/REC-02 need "expense" vs "income" as a UI concept and D-37 ties `payment_type`'s two lists (`in`/`out`) to a direction.
   - What's unclear: whether the sign of `original_amount` alone is sufficient (an income row is always positive, an expense always negative) or whether a separate `direction` column is needed for clarity/indexing (e.g. a transfer or settlement in Phase 8 might not map cleanly to a simple sign).
   - Recommendation: derive direction from the sign of `original_amount` (no new column) for Record's scope (expense/income only, transfers explicitly out of scope this phase per CONTEXT.md's Phase Boundary), and let Phase 8 add a `direction`/`transfer` concept explicitly when transfers arrive, rather than guessing that shape now.
   - RESOLVED: direction is derived from the sign of `original_amount`, with no new column (02-06 `directionOf`).

2. **Exact `pg_cron` schedule time and horizon-recompute trigger for recurring materialisation.**
   - What we know: the project's existing FX jobs run at 16:30/17:00 UTC daily; materialisation horizon is "through the end of next month" (D-03), which only needs to advance once a month, not daily — but skipped/edited occurrences and newly created series need same-day visibility.
   - What's unclear: whether materialisation should run daily (cheap, simple, matches the existing FX-job cadence) or only be triggered on series create/edit (event-driven, more complex, no pg_cron needed for the common case).
   - Recommendation: run daily via `pg_cron` for horizon maintenance (catches month-boundary advancement automatically) **and** call the same function synchronously (or via a lightweight RPC) immediately after a series is created or "this and future" edited, so a new bill shows its first pending row without waiting for the next cron tick.
   - RESOLVED: both. A daily pg_cron job plus an immediate call after a series is created or edited (02-08).

3. **Bulk-select across months for ACT-05.**
   - What we know: ACT-05 says "select multiple transactions and delete them in one action"; the UI-SPEC's bulk-select bar is described per-screen (Activity, one month at a time).
   - What's unclear: whether bulk-select is scoped to the currently viewed month only, or can span a cross-month search result set (relevant once ACT-03 search returns results from multiple months).
   - Recommendation: scope bulk-select to whatever list is currently rendered (a single month, or a single search-result list) — the undo step ("Deleted N transactions") already handles an arbitrary set of ids regardless of which months they belong to, so this is a UI-scoping decision, not an architectural one.
   - RESOLVED: bulk selection applies to whatever list is on screen (02-23).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build tooling, scripts | ✓ | v24.15.0 [VERIFIED] | — |
| npm | Package management | ✓ | 11.12.1 [VERIFIED] | — |
| Docker | Local Supabase stack | ✓ | Docker Desktop present [VERIFIED: `docker` binary found] | — |
| Supabase CLI | Migrations, local stack, pgTAP | ✓ | 2.117.0 (devDependency) [VERIFIED: package.json] | — |
| `expo-document-picker` | REC-09 file picking | ✗ (not yet installed) | 57.0.2 available on npm [VERIFIED] | Install via `npx expo install expo-document-picker`; no fallback needed, trivial install |
| `pg_trgm` Postgres extension | ACT-03 search performance | Not verified this session | — | Fall back to plain `ilike` (slower at scale, acceptable at Phase 2 data volumes) if unavailable |

**Missing dependencies with no fallback:** None — `expo-document-picker` is a trivial install with no architectural risk.

**Missing dependencies with fallback:** `pg_trgm` (falls back to unindexed `ilike`, a performance-only concern, not a correctness one).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ~29.7.0 via `jest-expo` ~57.0.5 [VERIFIED: package.json], plus `fast-check`/`@fast-check/jest` for property-based tests, plus pgTAP for database/RLS tests (24 existing `.test.sql` files in `supabase/tests/database/`) |
| Config file | `jest.config.js` (per-directory coverage thresholds: 100% on `src/engine/{money,decide,payoff,split}`, 95% on the rest of `src/engine/`, no explicit threshold on `src/db`/`src/data`/`src/ui` outside `engine/`) |
| Quick run command | `npm test -- <pattern>` (single file/suite) |
| Full suite command | `npm run test:coverage` (Jest with coverage, CI mode) + `supabase test db` for pgTAP suites |

**Planner note:** `jest.config.js`'s `FULL` (100%) coverage bucket currently lists only `money`, `decide`, `payoff`, `split`. This phase adds `engine/recurring`, `engine/csv`, `engine/categorize`, and `engine/undo` — all four are financial-correctness-sensitive (a wrong recurring date, a mis-parsed CSV amount, or a wrong undo inverse all cause real harm per this project's stated risk model). **Recommend the planner add these four folders to the `FULL` coverage list** in `jest.config.js`'s `for (const f of [...])` loop, consistent with D-04's "property-tested" and D-17's "property-tested" language, rather than leaving them at the 95% "rest of engine" default.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01/02 | Log expense/income with amount, category, account, date | unit + property (`fast-check`) | `npm test -- src/data/mutations/__tests__/transactions.test.tsx` | ❌ Wave 0 — extend existing file |
| REC-03/04 | Edit/delete a transaction | unit | `npm test -- src/data/mutations/__tests__/transactions.test.tsx` | ❌ Wave 0 — extend existing |
| REC-05/06 | Recurring generates entries, skip/end one occurrence | property (`fast-check`, schedule maths across month-ends/DST) + pgTAP (materialisation) | `npm test -- src/engine/recurring` / `supabase test db` | ❌ Wave 0 |
| REC-07 | Create/rename/colour categories | unit + pgTAP (RLS) | `npm test -- src/db/__tests__/categories.test.ts` / `supabase test db` | ❌ Wave 0 |
| REC-08 | Balance per account | unit | `npm test -- src/data/queries/__tests__/accounts.test.ts` (balance derivation) | ❌ Wave 0 |
| REC-09/10 | CSV import, preview, column mapping | property (`fast-check`, CSV edge cases: quoting, embedded newlines, mixed line endings) | `npm test -- src/engine/csv` | ❌ Wave 0 |
| REC-11/12 | Undo last 12, refused on conflict | unit (inverse computation) + pgTAP (RLS on `undo_log`) | `npm test -- src/engine/undo` / `supabase test db` | ❌ Wave 0 |
| ACT-01..05 | List, switch months, search, filter, bulk delete | unit (query/filter logic) + pgTAP (search index) | `npm test -- src/data/queries/__tests__/activitySearch.test.ts` | ❌ Wave 0 |
| ANL-05 | Funnel events measurable | unit (typed catalogue) | `npm test -- src/services/analytics/__tests__/catalogue.typecheck.ts` | ✅ (existing catalogue test extends) |

### Sampling Rate
- **Per task commit:** targeted `npm test -- <changed-file-pattern>`
- **Per wave merge:** `npm run test:coverage` + `supabase test db` (full pgTAP suite)
- **Phase gate:** Full suite green (coverage thresholds met, all pgTAP files passing) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/engine/recurring/__tests__/schedule.test.ts` — property tests for REC-05/06 (weekly/biweekly/monthly-clamped/quarterly/yearly, DST boundaries, month-end clamping)
- [ ] `src/engine/csv/__tests__/tokenize.test.ts`, `detectColumns.test.ts`, `inferFormat.test.ts` — property tests for REC-09/10
- [ ] `src/engine/categorize/__tests__/guessCategory.test.ts` — unit tests for D-14's keyword + learned-description rules
- [ ] `src/engine/undo/__tests__/computeInverse.test.ts` — unit tests covering every mutation kind's inverse (add↔delete, edit↔edit-back, bulk-op↔bulk-inverse, import-batch↔batch-delete, category-merge↔un-merge)
- [ ] `supabase/tests/database/25_categories_rls.test.sql` through `28_soft_delete.test.sql` (or next available numbers) — RLS isolation for `categories`/`recurring_series`/`undo_log`, soft-delete read-path filtering
- [ ] `supabase/tests/fixtures/recurring-schedule-cases.json` — shared fixture proving `engine/recurring`'s TS implementation and the plpgsql `next_occurrence_date()` mirror agree, mirroring `money-conversion-cases.json`'s existing role
- [ ] Framework install: none — Jest/fast-check/pgTAP are all already present; only new test *files*, not new tooling, are needed

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged from Phase 0) | N/A — this phase adds no auth surface |
| V3 Session Management | No (unchanged from Phase 0/1) | N/A |
| V4 Access Control | Yes | RLS on every new table (`categories`, `recurring_series`, `undo_log`), owner/household-scoped exactly per the established `custom_currencies`/`transactions` patterns; system-owned categories (`is_system`) rejected on client insert/update via policy `with check`, not just app-layer validation |
| V5 Input Validation | Yes | CSV-imported amounts go through Phase 1's strict `parseAmount` (D-24) — never `parseFloat`; column-mapping preview validates before commit (REC-10); `category_id`/`account_id` foreign keys enforced at the database level, not just client-side |
| V6 Cryptography | No new surface | N/A — no new secrets or crypto introduced this phase; reuses Phase 0/1's encrypted cache and secure-store patterns unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A client crafts an insert/update naming a server-only column (e.g. trying to set `version` or another user's `created_by` directly) | Tampering | Already mitigated at the grant level in this codebase's existing pattern: `grant insert (id, household_id, ...)` / `grant update (...)` column lists exclude anything server-controlled — extend the same column-list grants for every new writable column this phase adds, never a blanket `grant insert on table to authenticated` |
| A client attempts to insert a transaction into another user's household by guessing a `household_id` | Elevation of Privilege | Already mitigated: `insert ... with check (household_id in (select public.user_household_ids()) and created_by = (select auth.uid()))` — Record must not weaken this when extending the insert grant with new columns |
| A client tries to read or modify another user's `categories`/`undo_log` rows | Information Disclosure / Tampering | Per-user RLS exactly as `custom_currencies` already proves — `owner_id = (select auth.uid())` on every policy, verified with a pgTAP cross-user isolation test (mirroring `02_rls_isolation.test.sql`'s existing pattern) |
| CSV import used as a vector to insert malformed/oversized data (extremely long descriptions, absurd amounts, malicious Unicode in the `name` field) | Denial of Service / Tampering | The existing `transactions.original_amount` bound (`abs(original_amount) <= 10000000000000`) and any new `name` length check (mirroring `note`'s `char_length(note) <= 500`) apply uniformly to imported rows since they go through the same `insertTransaction` path — no separate validation surface to keep in sync |
| A user's `undo_log` entry retains sensitive `attempted`/`before`/`after` payloads (amounts, payee names) indefinitely | Information Disclosure (data retention) | `undo_log` is per-user RLS-scoped (not readable by anyone else) and purged on account deletion (D-23); the 12-deep ring plus no-time-limit-but-bounded-depth design (D-25) already bounds retention naturally as new steps push old ones out |

---

## Sources

### Primary (HIGH confidence)
- In-repo verification (Read tool, this session): `supabase/migrations/20260924000300_accounts.sql`, `20260924000400_transactions.sql`, `20260924000500_fx_stamping.sql`, `20260924000100_custom_currencies.sql`, `20260922000100_household_of_one.sql`, `20260922000400_fx_sync_schedule.sql`, `20260924000700_fx_monitor_jobs.sql`
- In-repo verification: `src/data/mutations/transactions.ts`, `writeClient.ts`, `cacheRows.ts`, `src/data/keys.ts`, `src/data/sync/versionChain.ts`, `writeErrors.ts`, `failedWrites.ts`, `src/db/transactions.ts`, `src/db/errors.ts`, `src/engine/time/localDate.ts`, `src/README.md`, `jest.config.js`, `.dependency-cruiser.cjs`, `package.json`
- `npm view expo-document-picker version` → `57.0.2` [VERIFIED 2026-09-25]
- `.planning/phases/02-record/02-CONTEXT.md`, `02-UI-SPEC.md`, `.planning/phases/01-money-core/01-CONTEXT.md`, `.planning/phases/00-foundation/00-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `CLAUDE.md`

### Secondary (MEDIUM confidence)
- `npm view papaparse version/description` [VERIFIED existence/description 2026-09-25, but RN/Hermes compatibility of its string-mode parser not independently tested this session — informs the hand-roll recommendation, not a blocking claim]
- Recurring-materialisation-as-plpgsql-function-mirror-of-money-mirror-pattern: an architectural inference from this project's own `stamp_fx_rate`/`07_money_rounding_mirror.test.sql` precedent, not a documented Supabase recipe for recurring transactions specifically

### Tertiary (LOW confidence)
- `pg_trgm` availability on this specific Supabase project instance: assumed standard (it ships in Supabase's Postgres image as a contrib extension) but not verified by actually running `create extension pg_trgm;` against this project this session — flagged in Assumptions Log A1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every existing dependency verified directly from `package.json`; the one new dependency (`expo-document-picker`) verified via `npm view`; the one "don't add a dependency" call (CSV tokenizer) is reasoned from the project's own stated purity/testing requirements, not just preference
- Architecture: HIGH for reuse-of-Phase-1-patterns (mutation pipeline, RLS shapes, version conflicts — all read directly from working code); MEDIUM for the recurring-materialisation SQL-mirror design (architecturally sound and precedented by the project's own money-mirror pattern, but not a verified external recipe)
- Pitfalls: HIGH for soft-delete/RLS/conflict pitfalls (directly grounded in reading the actual conflict-handling code); MEDIUM for CSV date-ambiguity and search-indexing pitfalls (general software-engineering knowledge, not project-specific verification)

**Research date:** 2026-09-25
**Valid until:** 30 days (stable domain — no fast-moving external dependency drives this phase; the CLAUDE.md SDK-57 staleness table governs the underlying Expo/RN versions and was last verified 2026-09-21, applies unchanged here)
