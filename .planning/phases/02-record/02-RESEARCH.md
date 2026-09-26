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


---

## Import Extension Addendum (2026-09-25)

**Researched:** 2026-09-25 (same day as the extension to CONTEXT.md)
**Scope:** D-39…D-52, REC-13…REC-18, plus the wider REC-09 and ANL-05. Everything above this heading still holds except where this addendum says otherwise. Where they conflict, the addendum wins. The conflicts are Open Question 1 (resolved there: direction still comes from sign, and transfers are identified by `transfer_id`), the D-13 duplicate rule (replaced by D-47), and plan 02-03's `parseSignedAmount` (see §A3).
**Confidence:** MEDIUM-HIGH. The engine design is grounded in this repo's code (HIGH). OFX format facts are cross-checked against the ofxtools reference parser and several secondary sources (MEDIUM-HIGH). Real-bank quirk frequency is MEDIUM: each quirk is documented somewhere, but none was tested against a real statement. CONTEXT.md's "Specific Ideas" asks for real redacted statements before the screens are planned, and that still stands.

### Extension requirements map

| ID | Description (REQUIREMENTS.md) | Research support |
|----|------|------|
| REC-09 (widened) | Import from a statement file (CSV or OFX/QFX) during onboarding or later | §A1 (OFX adapter, byte decoding, file picking), §A0 (one pipeline) |
| REC-13 | Work out the format first, state it in plain words, allow a flip, ask when ambiguous, remember per file layout | §A2 (profile inference; the sign/balance "product ambiguity" and how the target account breaks it), §A6 (`import_profiles` table) |
| REC-14 | Read every amount notation, store one sign rule, keep the originals | §A3 (`parseNotatedAmount` beside `parseAmount`, which stays unchanged), §A6 (`raw_amount`/`raw_balance`) |
| REC-15 | Reconcile against balances, highlight what can't be checked, never flag negatives | §A4 (link-level reconciliation, BigInt sums, orientation detection, sparse balances) |
| REC-16 | No duplicates on re-import, but keep identical genuine rows | §A5.1 (occurrence-count multiset matching, FITID rules) |
| REC-17 | Limits and standing, never an error | §A6 (additive limit columns), §A7 (`accountStanding`) |
| REC-18 | Transfers as one linked pair, import suggestions, excluded from totals | §A5.2 (matcher), §A5.3 (schema, pair constraint, undo, FX) |
| ANL-05 (widened) | Funnel through "first statement import" | §Security (extension): add a literal `format` property (`'csv'`, `'ofx'` or `'qfx'`), and nothing else new |

### A0. Pipeline shape (D-40) mapped onto modules

```
bytes (expo-file-system File.bytes())                                  [services/files, impure]
  └─▶ engine/statement/decodeText      BOM → UTF-8 (strict) → CP1252 fallback
        └─▶ sniffFormat                'ofx' | 'csv' | 'unknown'
              ├─▶ engine/ofx/parse     → StatementDraft (rows + ledger/avail balances + acct type + currency)
              └─▶ engine/csv/*         → StatementDraft (rows + raw cells + optional balance column)
                    └─▶ engine/statement/profile     inferProfile(draft, targetAccountKind, remembered?)
                          └─▶ engine/statement/convert     rows → stored sign rule (D-44), raw strings kept (D-45)
                                └─▶ engine/statement/reconcile   (D-46) per-link verification
                                      └─▶ engine/statement/duplicates  (D-47) occurrence-count + FITID
                                            └─▶ engine/transfer/match     (D-52) suggestions only
                                                  └─▶ preview (features/record/import) → commit (existing importChunk path)
```

- **`StatementDraft` is the adapter contract.** Both adapters produce it, and Phase 2.1's PDF adapter will too. It holds pre-sign rows (`magnitude`, `marker`, `rawAmount`, `rawBalance?`, `balanceMagnitude?`/`balanceMarker?`, `localDate`, `description`, `externalId?`, `trnType?`), plus file-level facts: `statedOpening?`, `statedClosing?` (with as-of date), `available?`, `statedLimit?`, `currency?`, `accountHint?` (`'bank' | 'card'`, without the account number), and a `layoutSignature`. Adapters **never apply a sign meaning**. That is D-43's "notation never decides the sign on its own", made structural. `[VERIFIED: design derived from 02-CONTEXT.md D-40/D-43 and plan 02-03's CandidateRow]`
- **Directories.** `src/engine/statement/` holds the format-agnostic steps. `src/engine/ofx/` is the adapter. `src/engine/transfer/` and `src/engine/accounts/` hold matching and standing. `parseNotatedAmount` goes in `src/engine/money/` so it inherits the 100% coverage bucket.

### A1. OFX/QFX parsing on-device

**Recommendation: hand-write a small OFX tokenizer and extractor in `src/engine/ofx/` and add no dependency.** This matches CONTEXT's stated preference, and the evidence below supports it.

| Candidate | Verdict | Evidence |
|---|---|---|
| `ofx-js` 1.1.1 (MIT, zero deps, rewritten 2026-05) | **Reject** | `[VERIFIED: npm pack + source read]` The SGML→XML fallback, which is the path every OFX 1.x file takes, applies `/<([A-Z0-9_]*)+\.+([A-Z0-9_]*)>([^<]+)/g`. That is a nested quantifier with catastrophic backtracking. Measured under Node on this machine: a 20-char dotless tag took 82 ms, 24 chars 1.24 s and 26 chars 4.9 s, roughly ×4 for every 2 characters. A malformed or hostile file freezes the JS thread. It also returns every value as a raw string, so all the semantics (dates, amounts, signs) would still be ours to write. It ships ESM-only `.ts`/`.js`, which needs `transformIgnorePatterns` work in jest-expo. |
| `ofx-data-extractor` 1.5.0 | **Reject** | `[VERIFIED: npm pack + grep]` Minified-only dist (unauditable). It references `Buffer` and `FileReader` (Node/browser APIs) and makes 21 `Number(` calls, which is float parsing of amounts and breaks MON-01. |
| `ofx`, `node-ofx-parser`, `ofx-parser`, `banking`, `ofx4js` | **Reject** | `[VERIFIED: npm view]` Last published between 2022 and 2024. All depend on `xml2js`/`xml2json`/`sax`/`fast-xml-parser@3`, which bring Node stream/events assumptions into Hermes, and some pull in `debug` or `assert`. |

The reference behaviour to copy comes from `ofxtools` (Python, widely used). Its tokenizer rule is that **a start tag followed by text is a leaf element and is closed implicitly, whether or not an end tag follows**. Aggregates must be closed explicitly, and a mismatched close is a parse error. `[CITED: raw.githubusercontent.com/csingley/ofxtools/master/ofxtools/Parser.py]`

**Hand-written parser design (~250 lines, linear time, no regex backtracking):**
1. **Header split.** Find the first `<OFX>`, matched case-insensitively. Earlier matchers only accepted the upper-case form. Everything before it is the header:
   - 1.x: `KEY:VALUE` lines such as `OFXHEADER:100`, `DATA:OFXSGML`, `VERSION:102`, `ENCODING:USASCII`, `CHARSET:1252`.
   - 2.x: `<?xml …?>` followed by `<?OFX OFXHEADER="200" VERSION="220" …?>`.

   Record `VERSION` and `CHARSET`. They are hints only: many banks send headers that don't match the body. `[CITED: ofxtools docs; ASSUMED: header/body mismatch frequency]`
2. **Tokenize with a single hand-written character scan**, like `parseAmount`'s loop. It emits `open(tag)`, `close(tag)` and `text(value)`. Tag names are `[A-Za-z0-9._]+`, upper-cased. Keep dotted proprietary tags such as `INTU.BID` and `INTU.USERID` (QFX) as-is and ignore them. Decode entities `&amp; &lt; &gt; &quot; &apos;` and `&#NNN;`, and leave a bare `&` alone, because SGML files often contain unescaped `&`. Support `<![CDATA[…]]>` (ofxtools issue #141). Skip `<!-- -->` comments.
3. **Tree build with a stack.** An `open` followed by non-whitespace `text` is a leaf: attach the value and swallow a matching `close` if it comes next. An `open` followed by another tag is an aggregate: push it. On `close(X)`, pop to X. If X is not on the stack, record a `malformed` warning and ignore it rather than throwing, because real bank files have stray closes. Unclosed aggregates at EOF are closed implicitly with a warning.
4. **Budget guards.** Stop at 5 MB of input, 20,000 elements or a 64-deep stack, and return `{ ok: false, error: 'too-large' | 'too-deep' }`. This mirrors the D-18 row ceiling and makes a hostile file cost O(n).
5. **Extraction.** Walk to each `STMTTRS` (inside `BANKMSGSRSV1`/`STMTTRNRS`) or `CCSTMTRS` (inside `CREDITCARDMSGSRSV1`/`CCSTMTTRNRS`). **One file can hold several statements, for several accounts.** D-12 requires one target account per import, so the preview must list them and have the user pick one. `INVSTMTMSGSRSV1` (investment) and `LOANMSGSRSV1` return `unsupported-statement`.
   - Per statement: `CURDEF`; `BANKACCTFROM/ACCTTYPE` (`CHECKING|SAVINGS|MONEYMRKT|CREDITLINE|CD`), or `CCACCTFROM` meaning a card; `BANKTRANLIST/DTSTART,DTEND`; each `STMTTRN`; `LEDGERBAL/BALAMT,DTASOF`; `AVAILBAL/BALAMT,DTASOF`.
   - Per `STMTTRN`: `TRNTYPE`, `DTPOSTED` (required), `DTUSER` (optional), `TRNAMT`, `FITID`, `NAME` or the `PAYEE/NAME` aggregate, `MEMO`, `CHECKNUM`, `REFNUM`, and `CURRENCY`/`ORIGCURRENCY` (a foreign-currency purchase; `TRNAMT` is still in `CURDEF`).
   - **Never extract or keep `ACCTID`, `BANKID` or `BRANCHID`.** They are account numbers, and the layout signature doesn't need them (see Security).
6. **Description.** Use `NAME`, plus ` · MEMO` when the memo adds text not already in the name. OFX 1.x caps `NAME` at 32 characters, so the useful payee text is often in `MEMO`. Trim to `MAX_NAME_LENGTH` (200, per plan 02-03). `[ASSUMED: 32-char NAME limit from OFX 1.x spec memory, MEDIUM]`

**Dates (`DTPOSTED`).** The format is `YYYYMMDD[HHMMSS[.XXX]][[gmt offset[:tz name]]]`, for example `20260912120000.000[-5:EST]`. Offsets can be fractional (`[+5.30:IST]`) or bare (`[-3]`). ofxtools treats a missing offset as GMT, which is the spec reading. `[CITED: ofxtools Types.py DateTime; CITED: FNB OFX spec summary via search]`
- **Take `localDate` from the first 8 characters, as written. Never convert through an instant.** Plenty of banks write `20260912000000` with no offset and mean their own local midnight. Read as GMT and converted to `America/Vancouver`, that becomes 11 September, which puts rows in the wrong day and sometimes the wrong month. MON-14 already says a transaction happens on a day, not at a timestamp. Validate with `isValidLocalDate` from `engine/time`. Parse the time and offset only to reject malformed input. `[VERIFIED: engine/time/localDate exports isValidLocalDate]`
- Use `DTPOSTED`, not `DTUSER`, for `local_date`. It is required, and it is the date the bank's balance progression uses. Keep `DTUSER` out of v1 storage.

**Amounts (`TRNAMT`, `BALAMT`).** The spec says signed decimal with `.` as the mark. In practice:
- Some European banks send `,`; ofxtools falls back to it explicitly.
- Some add a leading `+`.
- Some pad to four decimals (`-12.5000`).

Parse with a dedicated `parseOfxAmount`: accept `^[+\-]?\d+([.,]\d+)?$` (no grouping), **strip trailing zeros beyond the currency exponent and reject non-zero excess** (never round), then build minor units the same way `parseAmount` does, with an integer string and BigInt bound check against `MAX_ABS_AMOUNT_MINOR`. `[CITED: ofxtools Types.py Decimal comma fallback]` A `TRNAMT` of 0 is a real quirk (information-only lines, zero-interest lines). Give it the row issue `zero-amount` and leave it unticked, because the DB check `original_amount <> 0` would reject it. `[VERIFIED: 20260924000400_transactions.sql]`

**Sign convention in OFX.** The spec is written from the account holder's side: credits to the account are positive and debits negative, **for credit-card statements too**. So a purchase is negative and a payment positive. That already matches D-44's stored rule. `[CITED: multiple secondary sources; MEDIUM]` Known deviations, which is why OFX still goes through the profile step (§A2) and is not trusted blindly:
- Some issuers send card purchases as positive.
- `LEDGERBAL` on card statements is inconsistent. Some send it negative (spec view), many send the amount owed as a positive number.
- `TRNTYPE` can disagree with the sign, for example `DEBIT` with a positive `TRNAMT`.

Use a `TRNTYPE`/sign disagreement across most rows as strong evidence of an inverted file. `[ASSUMED: prevalence, from community reports; MEDIUM]`

**What OFX can and can't reconcile.** OFX carries **no opening balance**, only `LEDGERBAL` as of `DTASOF`. `DTASOF` is often the download time, not `DTEND`, and it may include rows posted after the list closed. So D-46's "opening + rows = closing" cannot be checked from the file alone. OFX reconciliation therefore means one of:
- (a) checking the account's stored FincWin balance just before `DTSTART`, plus the rows, against `LEDGERBAL`, but only when the account already has history covering that date;
- (b) otherwise, the note "Couldn't check this file against a balance". This is honest.

On a first import into an empty account, **offer to set the account's `opening_balance`** so the FincWin balance ends at `LEDGERBAL`. That is one confirm and one undo step. It gives users the "matches my bank" moment D-10 is aiming for. `[VERIFIED: design reasoning against D-10/D-46; the offer itself is ASSUMED product scope — planner confirm]`

**Limits from OFX (D-48).**
- **Card:** `limit = owed + AVAILBAL`, where owed is `LEDGERBAL` read under the confirmed profile.
- **Bank:** `AVAILBAL − LEDGERBAL` *may* be an overdraft limit, but it also absorbs holds and uncleared items.

Only ever offer the figure through the "This statement shows a {limit} limit. Add it to {account}?" confirm. Never write it silently. Don't offer a bank overdraft figure derived this way unless it is a round number. `[ASSUMED: heuristic; LOW-MEDIUM]`

**QFX** is Intuit-branded OFX. Treat it the same, ignore `INTU.*` tags and set `format: 'qfx'` for analytics only. `[CITED: ofxtools notes proprietary INTU.* tags are dropped]`

**FITID** is supposed to be unique and stable per account. Real-world violations are documented:
- Some banks reuse one FITID for several same-day entries (Banco do Brasil).
- Some change the FITID when a transaction moves from pending to posted (US Bank).
- Discover once regenerated a daily serial inside the FITID.
- One open-source importer had to keep rows that share a FITID but differ in amount.

`[CITED: HomeBank bug 1942379; Infinite Kind/MoneyDance support threads; PocketSense "Scrubbing Statements"; securo-finance PR #998; quinthar.com FITID blog]` The rules that follow are in §A5.1.

**Byte decoding, which matters for CSV as well as OFX.** `File.text()` decodes as UTF-8. OFX 1.x files commonly declare `CHARSET:1252`, and many UK and EU bank CSVs are Windows-1252, where `£` is `0xA3` and becomes U+FFFD under UTF-8. **Expo's `TextDecoder` polyfill is UTF-8 only and throws `RangeError` for any other label.** `[VERIFIED: node_modules/expo/src/winter/TextDecoder.ts]` So:
- Read bytes with `new File(uri).bytes()`. `[VERIFIED: expo-file-system src/internal/NativeFileSystem.types.ts: bytes(): Promise<Uint8Array>]`
- Decode in a pure `engine/statement/decodeText.ts`:
  1. Honour a BOM (UTF-8 `EF BB BF`, UTF-16LE `FF FE`, UTF-16BE `FE FF`; UTF-16 is common in Excel "Unicode text" exports).
  2. Otherwise run a strict UTF-8 validator.
  3. On the first invalid sequence, fall back to CP1252, which is Latin-1 identity plus a 27-entry table for `0x80–0x9F`.

  This replaces plan 02-26's `f.text()` call. `[VERIFIED: 02-26-PLAN.md line 74 uses File.text()]`

**File picking.** Add OFX/QFX MIME types to the picker list in plan 02-26: `application/x-ofx`, `application/ofx`, `application/vnd.intu.qfx` and `application/x-qfx`. iOS may grey out `.ofx`/`.qfx` if no UTType is registered for them, so fall back to `*/*` and **sniff content**: OFX if it starts with `OFXHEADER:`, or contains `<OFX>` within the first 4 KB, or starts with `<?xml` followed by `<?OFX`. Extension and MIME are hints only. `[ASSUMED: iOS UTType greying behaviour — verify on the iPhone XR]`

### A2. Card sign conventions and format-profile inference (D-41, D-42, D-44)

**How statements present the same activity** `[CITED: search results incl. Arden (Chase export guide), Koody, Lunch Money CSV docs, bankxlsx Citi guide; MEDIUM]`:

| Presentation | Purchase | Payment to card | Balance column |
|---|---|---|---|
| Account-holder view (OFX spec; Chase card CSV) | negative | positive | often negative when owing, sometimes positive "owed" |
| Issuer view (common card CSVs, e.g. Amex-style; many UK card CSVs) | positive | negative | positive = owed |
| Debit/credit columns (Citi-style, Capital One-style) | in Debit column | in Credit column | varies |
| Type column ("Sale"/"Payment"/"Return", "DEBIT"/"CREDIT") + unsigned amount | type-labelled | type-labelled | varies |
| Available-credit balance | — | — | available = limit − owed |

**The key finding for the planner: running-balance reconciliation cannot tell sign convention from balance meaning.** With `s ∈ {+1 (positive = money in), −1 (positive = spent)}` and `k ∈ {+1 (balance = held or available), −1 (balance = owed)}`, every running-balance link checks `bal[i] − bal[i−1] = s·k·raw[i]`. Only the product `s·k` is observable, so the reading `(s, k)` and its mirror `(−s, −k)` **both reconcile, always**. As written, D-41's "the one that reconciles wins; if more than one, ask" would ask on every file with a balance column. `[VERIFIED: algebra; this is a property the tests must encode]`

Two more facts:
- "Available credit" can't be told from "held" by differences either, because Δavailable = −Δowed = Δheld in cardholder view. Only the level and the label separate them.
- A running-balance file where both readings reconcile is only ambiguous about the *label*. The converted amounts are the same either way. The ambiguity that changes stored values is `s` itself.

**Recommended resolution order.** This keeps D-41's "labels first, then numbers" and adds the fixed evidence the user has already supplied:
1. **Target account kind (D-12: the user picks or creates it before preview) fixes the balance family.** `checking|savings|cash` gives `k = +1` (held). `credit` gives owed or available (`k = −1` or available). `loan` gives owed. This is not a guess: the user said what the account is. With `k` known, the running-balance check determines `s` uniquely.
2. **Labels decide between owed and available on a card**, and act as independent evidence for `s`:
   - Headers containing "available" mean available credit. "credit limit"/"limit" are a stated limit. "owed", "balance due" and "statement balance" mean owed.
   - Separate debit/credit (paid out / paid in, withdrawals / deposits) columns decide `s` outright.
   - A `DR`/`CR` marker on a row: `DR` is money out and `CR` is money in, on bank and card statements alike. Debits to a deposit account are withdrawals, and debits to a card account are purchases, so this reads the same from the account holder's side.
   - A payment-like description ("PAYMENT – THANK YOU", "PAYMENT RECEIVED", "DIRECT DEBIT PAYMENT") on a card account is money in, so its raw sign reveals `s`. On a bank account, "SALARY", "PAYROLL" and "INTEREST PAID" play the same role.
   - `OD` on a balance means overdrawn (held, negative).

   `[ASSUMED: DR/CR customer-side consistency is standard banking usage — HIGH in practice, not verified against a spec]`
3. **Numbers.** Run §A4 under `s = +1` and `s = −1` with `k` from step 1. Exactly one reconciles → decided. Both or neither → go to step 4.
4. **Weak priors, which may pre-select a candidate but never allow commit without confirmation:**
   - The majority of rows are money out on both card and bank statements, so the majority sign is probably "spent". Do not use this alone.
   - Card balance level: under "owed", balances are mostly ≥ 0 and rise with purchases.
5. **Otherwise the profile is `ambiguous`.** The preview shows the candidate readings and commit stays blocked (D-42).

**Ambiguity cases to encode as example tests:**

| Case | Outcome |
|---|---|
| No balance column, no labels, signed amounts all one sign | `ambiguous`. A file that is all one sign is usually a card statement with no payment in the period, or an export filtered to one direction. |
| No balance column, mixed signs, a payment-like row present on a card | decided from that row's sign |
| One-row file, with or without a balance | nothing to reconcile. Decide by labels or kind if possible, otherwise `ambiguous`. |
| Running balance present on only some rows (end-of-day balances) | still decisive; see §A4 segment checks |
| Balance column is available credit, no limit stated | converted amounts are still correct, since only differences are used. D-44's owed = limit − available needs a limit, so without one the standing figure waits until the user enters a limit. Do not invent one. |
| Remembered profile exists for this `layoutSignature` + account | apply it, show "Read the same way as your last statement from this account.", and **still run reconciliation**. If the remembered reading fails to reconcile a file that has balances, drop back to the confirmation step. Banks do change exports. |

**Profile object (engine type, also the JSON stored per D-42):**
```typescript
export interface FormatProfile {
  version: 1;
  source: 'csv' | 'ofx';
  accountFamily: 'deposit' | 'card' | 'loan';          // from target account kind
  positiveMeans: 'money-in' | 'money-spent';            // s
  balanceMeans: 'held' | 'owed' | 'available' | 'none'; // k (+ available)
  statedLimit: MinorUnits | null;                        // offered, never auto-applied (D-48)
  decidedBy: 'labels' | 'reconciliation' | 'remembered' | 'user';
}
export type ProfileResult =
  | { kind: 'decided'; profile: FormatProfile; evidence: ProfileEvidence[] }
  | { kind: 'ambiguous'; candidates: FormatProfile[]; evidence: ProfileEvidence[] };
```
`evidence` holds enum codes such as `'debit-credit-columns'`, `'payment-row-sign'`, `'dr-cr-markers'`, `'running-balance'` and `'trntype-agrees'`, never cell text. The preview sentence ("We read this as a credit card statement…") is assembled in UI i18n from `profile` plus one example row. `[VERIFIED: design; copy per 02-UI-SPEC lines 190–194]`

**Layout signature (Claude's discretion).**
- CSV: normalised header cells (the lower-case, diacritic-stripped form plan 02-03 already uses) joined with `|`, plus the delimiter and decimal mark.
- OFX: `ofx|bank|CHECKING` or `ofx|card`.

Store it as plain text (≤ 500 chars). Hashing adds nothing: column titles are not personal data, and the key is scoped to user plus account. Don't include account numbers.

### A3. Amount notation (D-43) against the existing strict parser

**What the code does today:**
- `parseAmount` and `parseDecimalString` reject every sign character, including U+2212 and `+`. The only characters they accept are digits (22 Unicode digit blocks), the decimal mark and the group mark. `[VERIFIED: src/engine/money/parseAmount.ts]` That is correct for the entry sheet, where direction comes from the Expense/Income/Transfer toggle, and it is under the 100% coverage bucket.
- `useAmountParser` is the UI-only wrapper for typed input. `[VERIFIED: src/ui/money/useAmountParser.ts]` Import runs in `engine/`, so it can't use a hook and doesn't need one.

**Recommendation: leave `parseAmount` exactly as it is and add `parseNotatedAmount` in `src/engine/money/`, composed on top of it.** This "extends the strict parser" (D-43) without changing entry-sheet behaviour or its tests.

```typescript
export type AmountMarker = 'none' | 'plus' | 'minus' | 'parens' | 'dr' | 'cr' | 'od';
export type NotatedAmountResult =
  | { ok: true; magnitude: MinorUnits /* >= 0 */; marker: AmountMarker }
  | { ok: false; error: ParseError | 'conflicting-markers' };
export interface NumberNotation {           // inferred once per file
  decimal: '.' | ',';
  group: ',' | '.' | ' ' | '’' | "'" | null;
  grouping: 'western' | 'indian';           // chooses the locale handed to parseAmount
}
export function parseNotatedAmount(raw: string, n: NumberNotation, exponent: number): NotatedAmountResult;
```

**Plan 02-03 must change.** Its `parseSignedAmount` has "`CR` suffix forces positive" and "`DR` → negative" built in, and returns a value with the sign already applied. That is the notation deciding the sign. It should return `{ magnitude, marker }` and let `convert` apply the profile (D-43/D-44). `[VERIFIED: 02-03-PLAN.md Task 2]`

Notation rules, all string scanning with no `parseFloat`:
- **Strip:** surrounding whitespace, including NBSP (U+00A0), narrow NBSP (U+202F) and zero-width characters; a spreadsheet wrapper `="…"`; currency symbols (`/\p{Sc}/u`) at either end or between the sign and the digits (`-£12.50`, `£-12.50`, `(£12.50)`); a leading or trailing ISO code (`GBP 12.50`, `12.50 EUR`).
- **Markers:**
  - Leading `-`, U+2212 or en dash U+2013 (Excel exports sometimes use it) → `minus`.
  - Trailing `-` (SAP and German exports) → `minus`.
  - `(…)` → `parens`, which counts as minus-like.
  - Suffix or prefix `DR`, `Dr`, `D` (word-bounded) → `dr`.
  - `CR`, `Cr`, `C` → `cr`.
  - `OD` → `od` (balances only).
  - Leading `+` → `plus`.
  - Two markers that disagree (`-12.50 CR`) → `conflicting-markers`, a row issue. Never pick one.
- **Separators — two traps in today's code for file input:**
  1. Plan 02-02's `separatorsFor(',')` returns `{decimal: ',', group: '.'}`, so a French/Nordic file with space grouping (`1 234,56`) comes back `invalid`. `parseAmount` does accept whitespace groups when the group char *is* whitespace. So `NumberNotation.group` must be inferred from samples: `.`, `,`, space-like, or apostrophe (Swiss `1'234.50` and `1’234.50`). `[VERIFIED: parseAmount WHITESPACE_GROUP_CHARS; 02-02-PLAN separatorsFor]`
  2. `parseAmount`'s group-placement check reads the grouping from `opts.locale`. Passing the **device** locale is wrong for a file. An `en-IN` user importing a UK CSV (`1,234,567.00`) would get `ambiguous-separator`. A UK user importing an Indian bank CSV (`12,34,567.00`) would get the same. Pass a **file-neutral locale chosen by `NumberNotation.grouping`**: `'en-US'` for western, `'en-IN'` for Indian. Infer grouping from samples, and treat a mix as a file-level issue. `[VERIFIED: parseAmount.ts isWellGrouped/localeGrouping read opts.locale]`
- **Excess decimals:** `12.500` in a 2-exponent currency, or `1200.00` in JPY (exponent 0). Strip trailing zeros beyond the exponent before calling `parseAmount`. Non-zero excess stays `too-many-decimals` (a row issue), and is **never rounded**.
- **Debit/credit column pairs** are read by `parseNotatedAmount` per cell. The adapter turns them into `marker: 'dr' | 'cr'` according to which column held the value. When both cells are filled, the net is `credit − debit` (plan 02-03 already has this) with the marker derived from the result's sign. A value that is already signed inside a debit column (`-12.50` under "Paid out") is a known quirk. Treat the column as authoritative and the inner sign as `conflicting-markers` only when it contradicts.
- **A direction/type column** ("Type": DEBIT/CREDIT, Sale/Payment/Return) is a seventh role for plan 02-03's `detectColumns`. Its values map to `dr`/`cr` markers through a small keyword table, and it counts as label evidence in §A2.

**Conversion to the stored rule (D-44), in `engine/statement/convert.ts`:**

| Evidence | Rule |
|---|---|
| Markers `minus`/`parens`/`dr` | raw sign = −1 |
| Markers `none`/`plus`/`cr` | raw sign = +1 |
| Stored amount (signed amount column) | `stored = s × rawSign × magnitude`, with `s` from the profile |
| Stored amount (DR/CR or debit/credit input) | `dr → −magnitude`, `cr → +magnitude`, independent of `s`. The profile only confirms the evidence. |
| Stored balance, `held` | `balance` |
| Stored balance, `owed` | `−balance`. A `cr` marker on an owed card balance means in credit, so the result is positive. |
| Stored balance, `available` | `−(limit − available)` when the limit is known, otherwise differences only |

Keep `raw_amount`/`raw_balance` as the **trimmed original cell text**, capped at 64 characters (D-45).

### A4. Running-balance reconciliation (D-46)

**Algorithm, pure, in `engine/statement/reconcile.ts`:**
1. **Orientation.** Don't sort by date. Stable-sorting a newest-first file keeps the reversed same-day order, which breaks the balance chain. Try the file order and its reverse, and count the links that verify under each. Choose the orientation with more verified links, and the date-ascending one on a tie. Newest-first exports are common.
2. **Links, not a cumulative sum.** For consecutive rows `i−1, i` that both carry a balance, check `B[i] − B[i−1] = amt[i]` in the stored sign rule. Each link stands alone, so one bad or missing row flags one link and the check re-anchors on `B[i]`. This is what produces UI-SPEC's "The rest reconciled." `[VERIFIED: 02-UI-SPEC line 199]`
3. **Sparse balances** (end-of-day only, or blank on pending rows). Check segments instead: for balanced rows `i < j` with only unbalanced rows between them, `B[j] − B[i] = Σ amt(i+1..j)`. Every row in a passing segment is verified.
4. **Same-day order jitter.** If a segment fails but the whole same-date block's boundary balances satisfy `B_end − B_start = Σ block`, mark the block `verified-as-group`. Some banks compute the running balance in a different intra-day order from the export order.
5. **Stated opening and closing** (CSV footer or header lines such as "Opening balance", "Balance brought forward", "Closing balance"; OFX `LEDGERBAL` with §A1's caveats). Check `opening + Σ amt = closing` as one extra segment. **These summary lines must be detected and removed from the row set, never imported as transactions.** They have a balance and no amount, or a description matching `/^(opening|closing) balance|balance (brought|carried) forward/i`.
6. **Result per row:** `verified | verified-as-group | cannot-verify | no-balance`. **Per file:** `all-verified | partial | none-in-file`, which maps onto the three UI states (UI-SPEC lines 197–201). When only an opening and closing exist and they fail, individual rows can't be pinpointed. Every row becomes `cannot-verify`, and the heading copy needs a variant that says so. Flag this to the UI-SPEC owner, because the current body "The rest reconciled." would be false in that case.

**Integer and overflow safety.** Amounts are safe integers up to 1e13 (`MAX_ABS_AMOUNT_MINOR`). Summed over 5,000 rows that reaches 5e16, which is **above `Number.MAX_SAFE_INTEGER` (≈9.007e15)**. Accumulate in `bigint` (the money core already uses BigInt in `rounding`/`rates`) and compare as bigint. `[VERIFIED: types.ts MAX_ABS_AMOUNT_MINOR; arithmetic]`

**Negative balances are normal (D-46/D-49).** There must be no `B >= 0` check anywhere in reconcile, convert, standing or the DB. Test it with property generators whose opening balances cross zero in both directions.

**Partial statements** (a date-filtered export) are checked only for internal consistency. The derived opening `B[0] − amt[0]` is whatever it is. Comparing it with the stored FincWin balance is optional extra information, not part of D-46. Offer the opening-balance set-up only when the account has no rows.

**What reconciliation cannot catch — document for users and planner.** A missing row at the very start or end of a file with no stated opening or closing, and a row whose amount and balance are both wrong in a consistent way.

### A5. Duplicates, transfer matching, and how they land in the schema

#### A5.1 Duplicates (D-47, amends D-13 and plan 02-04's `findDuplicates`)

Plan 02-04 flags "two identical candidates in the file → second flagged" and keys on `date|amount`. **Both must change.** `[VERIFIED: 02-04-PLAN.md findDuplicates behaviour]`

**Multiset matching:**
- Group candidates by `(localDate, amount)` against existing *active* rows in the **same account**. The fetch is `transactions_active` filtered by account and the file's date range ±1 day. Include `pending` rows only for the occurrence-matching question noted below.
- Within each group, pair each file row with at most one existing row. Go greedily by `nameSimilarity` descending (keep 02-04's Jaccard ≥ 0.6 rule), and never reuse an existing row. The rows flagged equal `min(fileCount, existingCount)` among the similar-named rows.
- **Rows in the same file are never compared with each other.**

**FITID** (stored in a new `external_id` column; see §A6):
1. If this file itself contains the same FITID on rows with **different amounts or dates**, the bank's FITIDs are unreliable. **Ignore FITID for the whole file** and use multiset matching.
2. Otherwise, a file row whose `(account, external_id)` matches an existing row **with the same amount** is a certain duplicate, even when the date differs (pending→posted date shift).
3. The same FITID with a different amount is *not* a duplicate (securo PR #998). Fall through to multiset matching.
4. No FITID match does not prove a row is new, because banks regenerate FITIDs. Still run multiset matching.

**Cross-format overlap** (a CSV then an OFX for the same month). The CSV may carry the *transaction* date while OFX `DTPOSTED` is the *posting* date, one to three days later, so exact-date matching misses it. **Open Question 2 below.** The recommendation is a ±2-day window, only against existing rows whose `import_batch_id` came from a different source format. A false positive here just leaves a row unticked, while a false negative double-counts real money in Decide.

#### A5.2 Transfer-pair matching (D-52), in `engine/transfer/match.ts`

**Inputs:**
- The converted import rows, all on the target account.
- Existing active, unlinked rows (`transfer_id is null`) on the **other** accounts in the household, from `min(date) − 3` to `max(date) + 3`.
- Account metadata (kind, currency, name).
- Latest EUR-based rates as `ScaledRate` values for cross-currency comparison.

Pairs within the same import are impossible, because one import has one target account (D-12) and a transfer between two rows on one account isn't a transfer. `[VERIFIED: D-12]`

**Hard constraints:** different accounts; opposite stored signs; `|Δdays| ≤ 3`; and amounts that satisfy one of:
- same currency: exact magnitude match (a fee arrives as its own row);
- cross-currency: convert the out-leg to the in-leg's currency with `convertMinor` and require `|conv − |in|| × 10000 ≤ tolBps × |in|`.

`tolBps` defaults to 500 (5%). Integer maths throughout, with no float percentage. `[VERIFIED: engine/money/rates.ts exports convertMinor/crossRate/ScaledRate]`

**Score (for ranking only):**

| Factor | Points |
|---|---|
| Date proximity | 0 days = 3, 1 = 2, 2–3 = 1 |
| Payment-like description on either side | +2. Keywords such as `PAYMENT`, `THANK YOU`, `TRANSFER TO/FROM`, `TFR`, `XFER`, `CARD PAYMENT`, `DIRECT DEBIT` + card, OFX `TRNTYPE` `XFER`/`PAYMENT`, and `payment_type` = transfer |
| Description mentions the other account's name | +2 |
| Deposit→card with the card leg positive (the classic card payment) | +1 |

**Assignment:** one-to-one and greedy by score. Ties go to the smaller Δdays, then the smaller absolute amount difference, then a stable id order, so **the result does not depend on input order** (a property test). Where two candidates tie on every key, don't pick one: return `{ kind: 'choose', options }` and let the preview list both.

**Unmatched payment-like rows** become `{ kind: 'orphan-transfer', row }`. The preview offers "Transfer" with the other account left for the user to pick (D-52).
- **Same currency:** the counter-leg amount is the exact negation.
- **Cross-currency:** the user types the counter-leg amount. D-50 says the legs are "what the user or the statements say, not derived", so don't prefill a converted estimate as if it were a fact. `[ASSUMED: Claude's-discretion reading of D-50 — planner confirm]`

#### A5.3 Transfers against the actual schema, FX, undo and RLS

**Shape: a nullable `transfer_id uuid` column on `transactions`, shared by both legs, with no separate table.** Why:
- Each leg stays an ordinary row, so the `stamp_fx_rate` trigger, `guard_transaction_currency`, the household RLS policies, `transactions_active`, `account_balances` and the undo machinery all apply unchanged. `[VERIFIED: 20260924000400/0500 migrations; 02-07/02-09 plans]`
- A cross-currency pair gets **two independent FX stamps**, each at its own date and currency. The difference between the two legs' `home_amount` is real FX or fee effect. Since transfers are excluded from income and spending, it never shows as spending. Later net-worth views will show it, which is correct.

**Pair integrity: a deferred constraint trigger, not an application rule.** On `insert or update of transfer_id, deleted_at, account_id, original_amount`, a `deferrable initially deferred` constraint trigger checks the group for both `old.transfer_id` and `new.transfer_id` at commit. The rule: **count of active rows (`deleted_at is null`) with that `transfer_id` ∈ {0, 2}**, and when there are 2: different `account_id`, opposite signs, same `household_id`.
- Make it `security definer` with `set search_path = ''` (house style), so it sees every row sharing the id rather than an RLS-filtered subset.
- Raise `23514` so `classifyWriteError` treats it as a permanent rejection (a parked failed write), consistent with the existing guards. `[VERIFIED: guard_* functions use errcode 23514; 02-03 plan notes classifyWriteError on 23505]`
- Deferral matters. A transfer created from the entry sheet goes through **one** `insertTransactionsBatch` call with two rows, which is one INSERT statement and so atomic. Linking two existing rows goes through **one** `apply_patches` RPC call, which is all-or-nothing by plan 02-09. Either way the group is 2 at commit and never a visible singleton. `[VERIFIED: 02-11 insertTransactionsBatch = one upsert; 02-09 apply_patches all-or-nothing]`

**Grants and columns:**
- Add `transfer_id` to the insert and update column grants and to `TRANSACTION_INSERT_KEYS`/`PATCH_KEYS`/`COLUMNS`.
- Add a partial index `(transfer_id) where transfer_id is not null`.
- The Transfer category stays the per-user system category (D-34), set on both legs by the client.
- **Totals exclude on `transfer_id is not null`, never on category.** Categories are per user (D-33), and Phase 8 adds per-member category overrides. The structural link is the stable fact.
- Plan 02-06's month-total maths and plan 02-09's server reads must use the same predicate. The per-account balance **includes** transfer legs.

**Undo (D-50: one step covering both legs):**

| Action | Inverse ops |
|---|---|
| Create | soft-delete both legs at `expected_version = 1` (one `apply_patches` list) |
| Delete | clear `deleted_at` on both |
| Edit | patch both legs back, with both expected versions |

All of these go through the existing all-or-nothing `apply_patches`, so a conflict on either leg refuses the whole step (D-26). No new conflict code is needed.

**Import that links a stored row: the pitfall that needs a plan task.** Committing an import runs:
1. `importChunk` inserts, with the new rows carrying no `transfer_id`.
2. **A linking `apply_patches` call** that sets `transfer_id` and the Transfer category on the new leg *and* on the already-stored leg, with the stored leg's expected version.
3. **One** undo step, recorded after the link.

That step's inverse ops must contain:
- soft-deletes of the imported ids at their *post-link* versions (2, not 1);
- a patch returning the stored leg to `transfer_id = null` and its previous `category_id`, at its post-link version.

If the stored leg is left linked when its partner is soft-deleted, the pair constraint (one active row) **refuses the undo at the database**. Plan 02-15's current `inverseOfInserts … at version 1` is wrong for linked rows. `[VERIFIED: 02-15-PLAN line 145]`

**RLS.** No new policy is needed. Both legs belong to the same household, and the existing insert policy `household_id in user_household_ids() and created_by = auth.uid()` already covers them. The pair trigger's same-household check blocks linking to a row in another household by guessing a `transfer_id`.

**Recurring transfers** (a standing order to savings). D-02's series template has no to-account. Treat them as out of scope unless the planner chooses to widen `recurring_series`. See Open Question 3.

### A6. Additive migration shape (FND-10 / squawk / D-45 / D-48 / D-42)

Ground rules from `docs/ops/migration-compatibility.md`: only nine squawk rules are enforced. Nullable `add column` and `add constraint … check` are both allowed. Dropping, renaming, a type change and a NOT NULL column without a default are all blocked. `[VERIFIED: docs/ops/migration-compatibility.md]` Everything below is nullable or new, so no `contract-ok` marker is needed. Name files after plan 02-07's `20260926…` sequence, as one or two new migrations placed after 02-07/02-09's.

```sql
-- accounts: limits (D-48). Nullable, non-negative, same bound as money columns.
alter table public.accounts
  add column overdraft_limit bigint check (overdraft_limit is null or (overdraft_limit >= 0 and overdraft_limit <= 10000000000000)),
  add column credit_limit    bigint check (credit_limit    is null or (credit_limit    >= 0 and credit_limit    <= 10000000000000));
grant update (overdraft_limit, credit_limit) on public.accounts to authenticated;
grant insert (overdraft_limit, credit_limit) on public.accounts to authenticated;
-- No kind-coupled check (e.g. "overdraft only on checking"): kind is updatable, and a coupled
-- check would turn a kind change into a rejected write. The engine ignores the irrelevant limit.

-- transactions: provenance (D-45), FITID (D-39/D-47), transfer link (D-50)
alter table public.transactions
  add column raw_amount  text check (raw_amount  is null or char_length(raw_amount)  <= 64),
  add column raw_balance text check (raw_balance is null or char_length(raw_balance) <= 64),
  add column external_id text check (external_id is null or char_length(external_id) <= 255), -- OFX FITID (A-255)
  add column transfer_id uuid;
create index transactions_external_id_idx on public.transactions (account_id, external_id) where external_id is not null;
create index transactions_transfer_id_idx on public.transactions (transfer_id) where transfer_id is not null;
-- NOT unique on (account_id, external_id): real banks reuse FITIDs (§A1).
grant insert (raw_amount, raw_balance, external_id, transfer_id) on public.transactions to authenticated;
grant update (transfer_id) on public.transactions to authenticated;
-- raw_* and external_id are insert-only: provenance must not drift from the original file.

-- remembered format profiles (D-42): per-user, custom_currencies RLS pattern
create table public.import_profiles (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  layout_signature text not null check (char_length(layout_signature) between 1 and 500),
  profile jsonb not null check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 2048),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, account_id, layout_signature)
);
-- + bump_version trigger, RLS enable, three owner_id = (select auth.uid()) policies, column grants,
--   and the account must be in one of the caller's households (check via user_household_ids()).
```

**Compatibility and client code:**
- **Old installed apps are unaffected.** They send only their own column lists (`TRANSACTION_INSERT_KEYS`, `ACCOUNT_INSERT_KEYS`) and select explicit column lists (`TRANSACTION_COLUMNS`, `ACCOUNT_COLUMNS`). `[VERIFIED: src/db/transactions.ts, src/db/accounts.ts]`
- The pair constraint trigger is new DDL, not a contract change. It can only reject writes that old apps never make, since old apps never set `transfer_id`.
- Update in step: `src/db/rows.ts` (`AccountRow`, `NewAccount`, `AccountPatch`, `TransactionRow`, `NewTransaction`), `ACCOUNT_INSERT_KEYS`/`PATCH_KEYS`/`COLUMNS`, and the transaction key lists. Leave `raw_*`/`external_id` out of `TRANSACTION_PATCH_KEYS` so `assertAllowedKeys` catches mistakes before the server does.
- `opening_balance` already allows negatives (`abs(...) <= 1e13`), so UI-SPEC's "Overdrawn"/"I owe this" control needs no migration. It just stores a negative number. `[VERIFIED: 20260924000300_accounts.sql]`
- Where the profile lives (Claude's discretion): a per-user table rather than an account column. One account can receive several layouts (CSV and OFX), and a per-user table keeps one member's remembered reading from silently applying to another member's differently-laid-out export in Phase 8.

### A7. Account standing (D-49), in `engine/accounts/standing.ts`

```typescript
export type Standing =
  | { kind: 'in-credit'; balance: MinorUnits }                                            // deposit, balance >= 0
  | { kind: 'overdrawn-within'; overdrawnBy: MinorUnits; limit: MinorUnits }              // 0 < od <= limit
  | { kind: 'overdrawn-beyond'; overdrawnBy: MinorUnits; limit: MinorUnits; beyondBy: MinorUnits }
  | { kind: 'overdrawn-no-limit'; overdrawnBy: MinorUnits }                               // limit null or 0
  | { kind: 'card-in-credit'; creditBy: MinorUnits }                                      // card balance > 0 (refund)
  | { kind: 'owing-within'; owed: MinorUnits; limit: MinorUnits | null }                 // owed <= limit, or no limit
  | { kind: 'over-limit'; owed: MinorUnits; limit: MinorUnits; overBy: MinorUnits }       // owed > limit
  | { kind: 'loan-owing'; owed: MinorUnits } | { kind: 'loan-in-credit'; creditBy: MinorUnits }
  | { kind: 'plain' };                                                                    // cash/investment/other: no sentence
export function accountStanding(a: { kind: AccountKind; balance: MinorUnits; overdraftLimit: MinorUnits | null; creditLimit: MinorUnits | null }): Standing;
```

- **Inputs are in the account's own currency**, with the balance taken from `account_balances` (opening + paid, D-10), never the home-currency figure. A limit is always in the account currency (D-48).
- **Boundaries** (D-49's test list):
  - Exactly at the limit is *within* (`<=`), and one minor unit over is *beyond* or *over*.
  - A deposit balance of 0 is `in-credit`.
  - A card balance of 0 is `owing-within` with `owed: 0`. The UI may choose quieter copy. Flag this for UI-SPEC, which has no zero-balance string.
  - An overdraft limit of `0` is treated as `null`, since "£140 beyond your £0 overdraft" reads badly and UI-SPEC's "No overdraft set" is the honest reading.
- **Never throws and never returns an error kind.** Overdrawn is a state (D-49). Money maths uses `subtract`/`compare` from `engine/money/arithmetic`, and `beyondBy = overdrawnBy − limit`, computed as integers.
- Copy is assembled in the UI from the discriminant and the UI-SPEC strings (lines 176–183). The engine returns numbers only, so formatting (DSG-06, minus sign always visible) stays in `useMoneyFormatter`.

### Validation Architecture (extension)

**Framework:** unchanged (Jest via jest-expo, fast-check / `@fast-check/jest`, pgTAP). **Coverage:** add `ofx`, `statement`, `transfer` and `accounts` to `jest.config.js`'s `FULL` list, alongside the four folders recommended above (`recurring`, `csv`, `categorize`, `undo`). `parseNotatedAmount` sits in `engine/money`, which is already FULL. Wrong sign, balance or pair logic moves real money the wrong way. `[VERIFIED: jest.config.js FULL list]`

| Req | Module | Property tests (fast-check) | Example tests |
|---|---|---|---|
| REC-09 | `statement/decodeText` | any JS string → UTF-8 bytes (±BOM) → decode = original; UTF-16LE/BE with BOM round-trip; any byte array → never throws, output length ≤ bytes | CP1252 `0xA3` → `£`; `0x80` → `€`; invalid UTF-8 mid-file → CP1252 fallback |
| REC-09 | `ofx/tokenize`, `ofx/parse` | generated statement model → serialised as (a) SGML with unclosed leaves, (b) SGML with closed leaves, (c) XML 2.x, (d) single-line, (e) CRLF/LF, (f) random inter-tag whitespace → parse = model; **arbitrary strings up to 1 MB → never throws, finishes in time linear in the input** (a regression guard for the ReDoS class; assert a wall-clock bound on a 200 KB adversarial input such as long dotless tags) | multi-statement file → list; `CCSTMTRS` → card; investment → `unsupported-statement`; stray `</X>` → warning and not an error; bare `&` preserved; CDATA; `INTU.BID` ignored; redacted real-bank fixtures under `src/engine/ofx/__tests__/fixtures/` (commit only synthetic or scrubbed files) |
| REC-09 | `ofx/date`, `ofx/amount` | valid date string → `localDate` = first 8 chars for every offset form; int `a`, exponent `e` → render with `.`/`,` and extra zero padding → parse = `a` | `[-5:EST]`, `[+5.30:IST]`, `[0:GMT]`, no offset, month 13 → error; `-12.5000` ok; `-12.5001` → too-many-decimals; `+0.00` → zero-amount issue |
| REC-14 | `money/parseNotatedAmount` | int magnitude `m`, any renderer from {leading/trailing minus, U+2212, en dash, parens, DR/CR prefix/suffix, ±currency symbol or code, western/Indian/space/apostrophe grouping, NBSP} → parse = `(m, marker)`; applying the marker sign reproduces the signed input | `-12.50 CR` → conflicting-markers; `="12.50"`; `12.500` exp 2 → 1250; `1,234,567.00` with Indian grouping → ambiguous-separator; entry-sheet `parseAmount` tests **unchanged and still green** |
| REC-13 | `statement/profile` | generate a true ledger (opening any sign, rows) → render under random (s, balance meaning, order) and target kind → `inferProfile` recovers `s`; **the mirror pair (−s, −k) is never offered as a second candidate once kind is fixed**; no balance and no labels and all one sign → `ambiguous` | card over limit (issuer view, positive owed 1,250 vs limit 1,000); overdrawn current account (negative running balance); debit/credit columns; payment-row sign; one-row file; remembered profile that stops reconciling → back to confirm |
| REC-15 | `statement/reconcile` | consistent ledger (either orientation) → all verified; perturb one amount by δ ≠ 0 → exactly one link fails and the rest verify; delete one row → one link fails; blank random balances → still verified by segments; shuffle within same-date blocks → `verified-as-group`; amounts near 1e13 × 5,000 rows → no precision loss (bigint) | negative opening, closing and running balances all verify with no flag; opening/closing summary lines removed; opening+closing only and failing → all `cannot-verify` |
| REC-14 | `statement/convert` | for any decided profile, Σ converted = stored closing − stored opening; available-balance files: differences match held-view differences | card `CR` balance → positive stored balance |
| REC-16 | `statement/duplicates` (rewritten `csv/duplicates`) | file with k identical rows, account with m similar → exactly `min(k, m)` flagged; rows in the same file never flag each other; result independent of row order | FITID exact → dup even across a date shift; the same FITID on different amounts in one file → FITID disabled for the file; the same FITID with a different amount vs existing → not a dup; CSV then OFX overlap per the Open Question 2 decision |
| REC-18 | `transfer/match` | every pair one-to-one, different accounts, opposite signs, `|Δd| ≤ 3`, same-currency amounts equal; output invariant under input permutation; no suggestion for rows already linked | card payment 2 days later; two equal payments in a week → closest dates pair; cross-currency within 5%, not at 6%; exact tie → `choose`; payment-like row with no partner → `orphan-transfer` |
| REC-18 | view maths (02-06) | adding any transfer pair leaves month income and spending unchanged and moves each account balance by its leg | pending transfer leg is excluded from the balance per D-10 |
| REC-18 | `undo` (02-05) | inverse(create pair) then apply → both legs deleted; inverse(import-with-link) restores the stored leg's link state | versions captured post-link (2, not 1) |
| REC-17 | `accounts/standing` | for any balance and limit: exactly one kind; `beyondBy + limit = overdrawnBy`; never throws | 0; −limit; −limit−1; limit null vs 0; card +15 (refund); loan; cash → plain |

**pgTAP additions** (continue the numbering after plans 02-07…02-09 claim theirs):
- `accounts_limits.test.sql`:
  - limits nullable, and 0 accepted;
  - −1 → 23514;
  - above 1e13 → 23514;
  - member can update limits;
  - anon can't;
  - a negative `opening_balance` is accepted (an explicit "overdrawn is not an error" assertion);
  - changing `kind` with a limit set is accepted.
- `transactions_import_provenance.test.sql`:
  - insert with `raw_amount`/`raw_balance`/`external_id` ok;
  - update of any of them → 42501;
  - a 65-character `raw_amount` → 23514;
  - duplicate `(account_id, external_id)` **accepted** (not unique);
  - index exists.
- `transfer_pairs.test.sql`:
  - a two-row insert in one statement ok;
  - a lone leg rejected at commit (23514);
  - three rows rejected;
  - same account rejected;
  - same sign rejected;
  - a leg in another household rejected;
  - soft-deleting both in one statement ok, soft-deleting one rejected;
  - clearing `transfer_id` on both ok;
  - the stamp trigger stamps each leg in its own currency;
  - user B can't read A's legs.
- `import_profiles.test.sql`: owner-only RLS (select/insert/update); unique triple; cascade on account delete; profile size cap; a profile can't reference an account outside the caller's households.
- The account-balance RPC (02-09) includes transfer legs, and any server month-total RPC excludes them.

**Wave 0 gaps (extension):** create the test files listed above under `src/engine/{ofx,statement,transfer,accounts}/__tests__/` and `src/engine/money/__tests__/parseNotatedAmount.test.ts`, plus the four pgTAP files. Build a small **synthetic** OFX/CSV fixture set: bank SGML, card SGML with positive purchases, XML 2.x, a multi-statement file, a newest-first CSV with an end-of-day balance, a card CSV over its limit, and an overdrawn current account. Add the redacted real statements the user collects. No new tooling is needed.

### Security (extension)

| ASVS / area | Addition |
|---|---|
| V5 Input validation | The OFX parser is linear-time with explicit budgets (5 MB, 20k elements, depth 64) and no backtracking regex, **because the one candidate library shows measured catastrophic backtracking** (§A1). The notation parser rejects rather than guesses. `raw_*` ≤ 64 characters, `external_id` ≤ 255, profile JSON ≤ 2 KB. All DB-checked. |
| V4 Access control | The transfer pair trigger is `security definer`, `set search_path = ''`, and checks the same household. `import_profiles` uses the per-user `custom_currencies` RLS pattern plus an account-in-household check. `raw_*`/`external_id` are insert-only by column grant. |
| V8 Data protection / privacy | **The raw file never leaves the device (D-17 unchanged).** `raw_amount`/`raw_balance` are as sensitive as `original_amount`. They are covered by the existing account-deletion purge (row delete) and must be included in the GDPR export. **Don't extract or store `ACCTID`/`BANKID`/`BRANCHID`**, and never put the picked file's *name* anywhere (bank filenames often contain account numbers). Delete the picker's cache copy (`copyToCacheDirectory: true`) after reading. `[ASSUMED: cache-copy cleanup is manual — verify in expo-document-picker behaviour]` |
| V7 Logging / Sentry | **`scrubMessage` does not make statement text safe.** Running a copy of its exact regexes: `"bad amount 12,50 for TESCO STORES row 12"` came through **unchanged**, `"Missing closing tag for NAME: DR JONES PHARMACY"` came through unchanged, and `"balance 1 234,56 OD at ACME LTD"` came through unchanged. It redacts only quoted substrings, emails, currency-symbol amounts, dotted decimals and digit runs of 4 or more. Comma decimals, space-grouped numbers and unquoted payee names all pass. `[VERIFIED: node reproduction of src/services/errors/scrub.ts regexes]` **Rule for every new engine and import module:** never `throw new Error(...)` or `console.*` with cell, tag or description content. Return typed result unions carrying enum codes and row indexes only, as `parseAmount` already does. Add a unit test that parses a fixture of known sensitive strings with the parser in a failure mode and asserts that no thrown error or returned message contains them. Optionally widen `scrubMessage`, for example by redacting any `\d[\d\s.,']*\d` run, but treat that as a second layer and not the control. |
| Failed-writes list | Import chunk failures already record `{ import_batch_id, rows: n }` with no amounts or payees (02-15). Keep linking-patch failures the same: ids and counts only. |
| Analytics (ANL-05) | Only literal properties: `format: 'csv' \| 'ofx' \| 'qfx'`, the existing size band, and `profile_decided_by` and `reconciliation` as enum values. No bank name, header text, file name, amounts or row counts beyond the band (Phase 0 D-18). |
| Undo log | Import steps store ids, versions and field patches only. Never put `raw_*` or descriptions into `undo_log` payloads beyond what the patch strictly needs (the stored leg's previous `category_id` is an id, which is fine). |

**Threat patterns (extension):**

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Crafted OFX with long or nested tags hangs the UI thread | DoS | Hand-written linear tokenizer, budgets, adversarial property test with a time bound |
| Misread sign convention stores spending as income | Tampering (integrity) | Profile step with kind-anchored inference, reconciliation, a mandatory confirm when ambiguous, a flip control, and raw strings kept for re-conversion |
| Linking a transfer leg to another household's row | Elevation / Tampering | Definer pair trigger with a same-household check; RLS unchanged |
| Statement text leaking to Sentry | Information disclosure | Typed errors with codes only, plus a regression test (above) |
| An account number stored or sent inadvertently | Information disclosure | Never extracted by the adapter; the layout signature excludes it |

### Extension pitfalls (add to Common Pitfalls)

1. **Two readings that both reconcile.** Covered in §A2. Without anchoring on the target account's kind, every card file with balances comes out "ambiguous", or the code picks one silently and gets half of them backwards.
2. **Sorting before reconciling.** A newest-first file stable-sorted by date keeps the reversed same-day order and breaks the chain. Choose orientation first (§A4).
3. **Float or overflow in balance sums.** 5,000 rows × 1e13 exceeds `MAX_SAFE_INTEGER`. Use bigint accumulators.
4. **Converting OFX dates through an instant.** This shifts rows a day early for users west of GMT (§A1).
5. **Treating FITID as unique.** A unique index would reject real imports. Treating FITID as authoritative would drop genuine rows or double-import after regeneration (§A5.1).
6. **Summary lines imported as transactions** ("Opening balance", "Balance brought forward"). Detect and remove them (§A4).
7. **Undoing an import that linked a stored row.** Unless the inverse unlinks the stored leg at post-link versions, the pair trigger refuses the undo (§A5.3).
8. **Device locale used for file grouping.** `en-IN` versus a UK file, or the reverse (§A3).
9. **UTF-8-only decoding** mangles `£` in CP1252 files. Expo's `TextDecoder` can't help (§A1).
10. **Month totals keyed on the Transfer category** instead of `transfer_id`. This breaks once Phase 8's per-member category overrides land.

### Changes to existing plans (supplements the CONTEXT plan-impact table)

| Plan | Change grounded in this research |
|---|---|
| 02-02 | Add `decodeText` (bytes to string) and `sniffFormat`. Infer `NumberNotation` (group char, including space and apostrophe; western vs Indian grouping) instead of `separatorsFor(mark)` alone. |
| 02-03 | Replace `parseSignedAmount`'s sign application with `parseNotatedAmount` (`{magnitude, marker}`). Add a `balance` column role (today "balance" headers are explicitly excluded; D-46 now needs them) and a `direction` column role. Remove the `negate` toggle in favour of the profile flip. |
| 02-04 | Rewrite `findDuplicates` as §A5.1. The in-file flagging test case is inverted. |
| 02-11 | Replace `f.text()` with `File.bytes()` plus `decodeText`. New columns go in the key lists. |
| 02-15 | Import undo inverse versions after linking; linking `apply_patches` after the chunks; transfer create/edit/delete mutations reuse `insertTransactionsBatch` (2 rows) and `apply_patches`. |
| 02-26 | OFX MIME types plus `*/*` fallback and content sniffing; multi-statement OFX picker; profile, reconcile, duplicates and transfer stages; opening-balance offer on first import into an empty account. |
| New engine plans | `engine/ofx`, `engine/statement/{profile,convert,reconcile,duplicates}`, `engine/transfer/match`, `engine/accounts/standing`, `engine/money/parseNotatedAmount`. All TDD, all FULL coverage. |
| New schema plan (or 02-07 extension) | §A6 migrations plus the four pgTAP files. |

### Extension assumptions log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| E1 | `DR`/`CR` markers mean money out / money in from the account holder's side on both bank and card statements | A2, A3 | A card file using DR/CR from another angle would be read backwards. Mitigated: reconciliation and the confirm step still apply. |
| E2 | Card OFX from some issuers sends purchases positive and/or `LEDGERBAL` positive-when-owed | A1, A2 | Low. The profile step handles both readings either way. |
| E3 | OFX 1.x `NAME` is capped at 32 characters, so `MEMO` often carries the payee | A1 | Description quality only |
| E4 | iOS greys out `.ofx`/`.qfx` without a registered UTType, needing `*/*` | A1 | Users can't pick OFX on iOS. Verify on the iPhone XR early. |
| E5 | 3-day window and 5% cross-currency tolerance are good defaults for card payments and FX transfers | A5.2 | Missed or spurious suggestions. Suggestions are never applied silently (D-52). |
| E6 | Cross-currency orphan transfers should require a typed counter-leg rather than a prefilled estimate | A5.2 | UX friction vs. a figure that was never confirmed |
| E7 | A bank overdraft limit can sometimes be inferred from `AVAILBAL − LEDGERBAL` | A1 | A wrong limit offered. Always behind a user confirm. |
| E8 | The expo-document-picker cache copy needs manual deletion | A9 | A statement copy lingering in the app cache. Low severity, since it's on the device. |
| E9 | Offering to set `opening_balance` from the first import is in scope | A1, A4 | Scope creep. Planner or user confirm. |

### Extension open questions (RESOLVED — D-54, D-55, D-56 and UI-SPEC copy, 2026-09-25)

1. **Direction column, revisited.** RESOLVED here: keep direction derived from the sign (Open Question 1 above). A transfer is identified by `transfer_id` and not by a direction value, so no `direction` column is needed. Open Question 1's reasoning that "transfers explicitly out of scope" is outdated, but its conclusion still holds.
2. **Cross-format duplicate date window.** D-47 says "date + amount + description". A CSV transaction date and an OFX posting date can differ by one to three days.
   - Recommendation: ±2 days only against existing rows from a different source format. Otherwise exact date.
   - Needs a user decision, because it amends D-47's literal wording.
3. **Recurring transfers** (a standing order to savings).
   - Recommendation: out of scope for Phase 2, with a note on D-02's template. Materialising paired pending legs needs the pair trigger to handle pending status too, and it already does, since the constraint counts active rows regardless of status. The work is small but it is new surface.
4. **Imported rows that pay a materialised pending occurrence** (Netflix pending, plus Netflix imported as paid). Today the pending row keeps counting in "still to come".
   - Recommendation: a follow-on suggestion ("This looks like the Netflix bill due 3 Sep. Mark it paid with this line?") or a deferred idea. Flag it to the user, because it affects the cleanliness of the numbers Decide reads.
5. **Reconciliation copy when only opening and closing exist and they fail.** Rows can't be pinpointed, so UI-SPEC's "The rest reconciled." would be false. Ask for a copy variant.

### Extension sources

**Primary (HIGH):**
- In-repo reads this session:
  - `src/engine/money/{parseAmount,types,index,rates}.ts`, `src/ui/money/useAmountParser.ts`
  - `src/db/transactions.ts`, `src/db/rows.ts`
  - `supabase/migrations/20260924000300_accounts.sql`, `…0400_transactions.sql`
  - `docs/ops/migration-compatibility.md`, `.dependency-cruiser.cjs`, `jest.config.js`
  - `src/services/errors/{scrub,errorReporter}.ts`
  - `node_modules/expo/src/winter/TextDecoder.ts`, `node_modules/expo-file-system/src/internal/NativeFileSystem.types.ts`
  - plans 02-02, 02-03, 02-04, 02-07, 02-09, 02-11, 02-13, 02-15, 02-26; 02-UI-SPEC.md
- `npm view` and `npm pack` of `ofx-js@1.1.1` and `ofx-data-extractor@1.5.0`, plus metadata for `ofx`, `node-ofx-parser`, `ofx-parser`, `banking` and `ofx4js`. Source read and a backtracking timing test on this machine.
- The `scrubMessage` behaviour reproduction (node, the file's exact regexes).

**Secondary (MEDIUM):**
- [ofxtools Parser.py](https://raw.githubusercontent.com/csingley/ofxtools/master/ofxtools/Parser.py): implicit leaf closing, mismatched-tag errors
- [ofxtools Types.py](https://raw.githubusercontent.com/csingley/ofxtools/master/ofxtools/Types.py): date regex, missing offset treated as GMT, comma-decimal fallback
- [ofxtools parser docs](https://ofxtools.readthedocs.io/en/latest/parser.html): `INTU.*` proprietary tags dropped
- FITID instability: [HomeBank bug 1942379](https://bugs.launchpad.net/homebank/+bug/1942379), [securo PR #998](https://github.com/securo-finance/securo/pull/998), [Infinite Kind support thread](https://infinitekind.tenderapp.com/discussions/problems/11086-importing-data-sometimes-brings-in-duplicate-transactions), [PocketSense: Scrubbing Statements](https://sites.google.com/site/pocketsense/home/msmoneyfixp1/Bad-Statements), [quinthar.com FITID blog](http://blog.quinthar.com/2008/12/ofx-fitids-not-as-permanent-as-you.html)
- Card CSV sign conventions: [Arden Chase export guide](https://ardenmoney.com/guide/export-csv/chase/), [Koody credit-card CSV import](https://koody.com/credit-card-csv-import), [Lunch Money CSV import](https://support.lunchmoney.app/importing-transactions/import-via-csv), [bankxlsx Citi debit/credit columns](https://bankxlsx.com/blog/can-i-export-citi-citibank-credit-card-transactions-to-csv-or-excel)
- OFX sign and date summaries: [FNB OFX file layout spec](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/assets/docs/Statement_Type_-_OFX.pdf) (search summary only; the PDF could not be rendered here), [bankxlsx OFX format explainer](https://bankxlsx.com/blog/ofx-file-format-explained-tags-structure)

**Tertiary (LOW), flagged in the assumptions log:** iOS UTType greying for `.ofx`; how often card issuers use positive purchases or positive `LEDGERBAL`; the 32-character OFX 1.x `NAME` cap (from memory of the spec, not re-read).

**Addendum valid until:** 30 days. The OFX format is stable. Re-check the library landscape only if the planner reopens "use a dependency".
