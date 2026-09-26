# Phase 2: Record - Pattern Map

**Mapped:** 2026-09-25
**Files analyzed:** 33 (new) + 3 (extended)
**Analogs found:** 33 / 33 (every file has at least a role-match; several are exact-structure copies)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/transactions.ts` (extend: status/name/category_id/payment_type/deleted_at/recurring_series_id/import_batch_id) | model | CRUD | itself (Phase 1) | exact — extend in place |
| `src/db/rows.ts` (extend: `TransactionRow`/`TransactionPatch`/`NewTransaction`, add `CategoryRow`, `RecurringSeriesRow`, `UndoLogRow`) | model (types) | CRUD | itself (Phase 1) | exact — extend in place |
| `src/db/categories.ts` | model | CRUD | `src/db/customCurrencies.ts` | exact (per-user table, same shape) |
| `src/db/recurringSeries.ts` | model | CRUD | `src/db/accounts.ts` | exact (household-scoped table, same shape) |
| `src/db/undoLog.ts` | model | CRUD (append + list + single-row read) | `src/db/customCurrencies.ts` | exact (per-user table, same shape) |
| `src/engine/recurring/schedule.ts` (nextOccurrence, clampToMonthEnd, projectBeyondHorizon) | utility (pure) | transform | `src/engine/time/localDate.ts` | exact (pure date maths, same file's primitives) |
| `src/engine/csv/tokenize.ts` | utility (pure) | transform | `src/engine/money/parseAmount.ts` | role-match (pure char-by-char scanner, typed `Result` union) |
| `src/engine/csv/detectColumns.ts` | utility (pure) | transform | `src/engine/money/parseAmount.ts` | role-match (pure inference, typed error union) |
| `src/engine/csv/inferFormat.ts` | utility (pure) | transform | `src/engine/money/parseAmount.ts` (`localeSeparators`) | role-match (locale/format inference pattern) |
| `src/engine/categorize/guessCategory.ts` | utility (pure) | transform | `src/engine/split/allocate.ts` | role-match (pure rule-based transform over money/category data) |
| `src/engine/undo/computeInverse.ts` | utility (pure) | transform | `src/engine/money/rounding.ts` / `arithmetic.ts` | role-match (pure function, typed discriminated-union input/output) |
| `src/data/mutations/transactions.ts` (extend: soft-delete, status patch, `category_id`/`payment_type`/`name` in optimistic row) | mutation hook | CRUD (optimistic + queued) | itself (Phase 1) | exact — extend in place |
| `src/data/mutations/categories.ts` | mutation hook | CRUD (optimistic + queued) | `src/data/mutations/customCurrencies.ts` | exact (per-user cache key, same `setMutationDefaults` shape) |
| `src/data/mutations/recurringSeries.ts` | mutation hook | CRUD (optimistic + queued) | `src/data/mutations/accounts.ts` | exact (household-scoped, add+edit pair) |
| `src/data/mutations/undo.ts` | mutation hook | request-response (replay through existing mutations) | `src/data/mutations/transactions.ts` (`useEditTransaction`'s edit path) | role-match (same `VersionConflictError` handling, new presentation only) |
| `src/data/mutations/csvImport.ts` | mutation hook | batch (chunked inserts) | `src/data/mutations/transactions.ts` (`insertTransaction`/`useAddTransaction`) | role-match (loop calling the existing insert mutation per chunk) |
| `src/data/queries/categories.ts` | query hook | CRUD (read) | `src/data/queries/accounts.ts` | exact (same `useQuery` + `fetchX` wrapper shape) |
| `src/data/queries/recurringSeries.ts` | query hook | CRUD (read) | `src/data/queries/accounts.ts` | exact |
| `src/data/queries/undoLog.ts` | query hook | CRUD (read) | `src/data/queries/accounts.ts` | exact |
| `src/data/queries/activitySearch.ts` | query hook | request-response (server search) | `src/data/queries/accounts.ts` | role-match (new query key, `ilike` filter instead of household `eq`) |
| `src/data/keys.ts` (extend: `categories`, `recurringSeries`, `undoLog`, `transactionsSearch` query keys; `addCategory`/`editCategory`/`addRecurringSeries`/`editRecurringSeries`/`undoStep`/`importBatch` mutation keys) | config | — | itself (Phase 1) | exact — extend in place |
| `supabase/migrations/20260926..._categories.sql` | migration | CRUD (schema + RLS) | `supabase/migrations/20260924000100_custom_currencies.sql` | exact (per-user RLS table, near-verbatim policy shape) |
| `supabase/migrations/20260926..._transactions_record_fields.sql` | migration | CRUD (additive schema) | `supabase/migrations/20260924000400_transactions.sql` + `20260924000500_fx_stamping.sql` | exact (additive columns + a new guard trigger, same style) |
| `supabase/migrations/20260926..._recurring_series.sql` | migration | CRUD (schema + RLS) | `supabase/migrations/20260924000300_accounts.sql` | exact (household-scoped RLS table) |
| `supabase/migrations/20260926..._undo_log.sql` | migration | CRUD (schema + RLS) | `supabase/migrations/20260924000100_custom_currencies.sql` | exact (per-user RLS table) |
| `supabase/migrations/20260926..._recurring_materialisation.sql` | migration | event-driven (scheduled batch) | `supabase/migrations/20260924000700_fx_monitor_jobs.sql` | exact (plpgsql function + `pg_cron`, `service_role`-only) |
| `supabase/migrations/20260926..._category_seed_backfill.sql` | migration | batch (one-time + trigger extension) | `supabase/migrations/20260922000100_household_of_one.sql` (`handle_new_user`) | role-match (extends the existing provisioning trigger, adds idempotent backfill) |
| `supabase/tests/database/25_categories_rls.test.sql` | test | CRUD (RLS isolation) | `supabase/tests/database/08_custom_currencies_prefs.test.sql` | exact |
| `supabase/tests/database/26_recurring_series.test.sql` | test | CRUD (RLS + materialisation) | `supabase/tests/database/05_accounts_transactions.test.sql` | role-match (household-scoped RLS test shape) |
| `supabase/tests/database/27_undo_log_rls.test.sql` | test | CRUD (RLS isolation) | `supabase/tests/database/08_custom_currencies_prefs.test.sql` | exact |
| `supabase/tests/database/28_soft_delete.test.sql` | test | CRUD (read-path filtering) | `supabase/tests/database/06_fx_stamping.test.sql` (trigger-behaviour test shape) | role-match |
| `src/features/record/` screens (entry sheet, Activity, Accounts, Categories, CSV import flow, History) | component | request-response (form + list) | `src/ui/Screen.tsx`, `src/ui/RateAttribution.tsx`, `src/ui/money/useAmountParser.ts` | role-match (only shared UI primitives exist yet; no prior feature screen to copy structurally) |
| `src/services/analytics/catalogue.ts` (extend: ANL-05 funnel events) | config | event-driven | itself (Phase 0) | exact — extend in place |
| `jest.config.js` (extend: add `recurring`, `csv`, `categorize`, `undo` to the `FULL` coverage folder list) | config | — | itself (Phase 0/1) | exact — extend in place |

---

## Pattern Assignments

### `src/db/categories.ts` (model, CRUD)

**Analog:** `src/db/customCurrencies.ts` (per-user table — this is the *only* other per-user table in the codebase besides `profiles`, and is the explicit precedent named in RESEARCH.md's Pattern 4)

**Imports pattern** (`src/db/customCurrencies.ts` lines 1-7):
```typescript
import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, CUSTOM_CURRENCY_COLUMNS, type CustomCurrencyRow, type DbClient } from './rows';
```
Copy verbatim, swapping in `CategoryRow`/`CATEGORY_COLUMNS` (new exports to add in `rows.ts`).

**Insert/patch key lists** (lines 25-41):
```typescript
export const CUSTOM_CURRENCY_INSERT_KEYS = [
  'id', 'code', 'symbol', 'decimals', 'reference_currency', 'unit_value', 'as_of',
] as const satisfies readonly (keyof NewCustomCurrency)[];

export const CUSTOM_CURRENCY_PATCH_KEYS = [
  'symbol', 'reference_currency', 'unit_value', 'as_of',
] as const satisfies readonly (keyof CustomCurrencyPatch)[];
```
For categories: `CATEGORY_INSERT_KEYS = ['id', 'name', 'color_key']` (no `is_system` — clients can never set it, per the migration's `with check (... and not is_system)`), `CATEGORY_PATCH_KEYS = ['name', 'color_key', 'archived_at']`.

**Fetch-by-owner pattern** (lines 59-68):
```typescript
export async function fetchCustomCurrencies(client: DbClient, ownerId: string): Promise<CustomCurrencyRow[]> {
  const { data, error, status } = await client
    .from('custom_currencies')
    .select(CUSTOM_CURRENCY_COLUMNS)
    .eq('owner_id', ownerId)
    .order('code', { ascending: true });
  if (error) throw toDbError(error, status);
  return (data as CustomCurrencyRow[] | null) ?? [];
}
```
`fetchCategories(client, ownerId)` copies this exactly, ordering by name (or a `sort_order` if the planner adds one).

**Insert with duplicate-id tolerance** (lines 70-94) and **version-conditional update** (lines 96-122): copy verbatim, swapping table/type names. Both already handle MON-08 (client-generated UUID replay) and D-18 (version conflict → `VersionConflictError`) with zero new logic needed.

---

### `src/db/recurringSeries.ts` (model, CRUD)

**Analog:** `src/db/accounts.ts` (household-scoped table, add+edit+fetch, no delete — matches D-08's "ending a series sets `end_date`", never a hard delete)

**Full shape to copy** (`src/db/accounts.ts` lines 1-98): insert-key list, patch-key list, `fetchAccount`/`fetchAccounts` (swap `household_id` filter), `insertAccount`→`insertRecurringSeries`, `updateAccount`→`updateRecurringSeries`. The series-specific columns (`freq`, `interval_count`, `day_of_month`, `end_date`, `occurrence_count`, `anchor_date`, `last_materialized_date`) go in `RecurringSeriesRow`/`NewRecurringSeries`/`RecurringSeriesPatch` in `rows.ts`, following the exact `TransactionRow`/`NewTransaction`/`TransactionPatch` split already there.

**"This and future" regeneration is NOT a plain patch** — D-07 requires updating the template *and* regenerating not-yet-paid occurrences. This needs one additional function beyond the accounts.ts shape:
```typescript
// New, no direct analog — combines updateRecurringSeries (template patch) with a call to
// a server RPC/function that regenerates pending rows. Mirrors the shape of
// src/db/transactions.ts's requestRateResolution (an RPC call wrapping DbError handling),
// not a plain table update.
export async function editSeriesFromDate(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: RecurringSeriesPatch,
  effectiveFrom: string
): Promise<RecurringSeriesRow> { /* update template, then client.rpc('regenerate_series_occurrences', {...}) */ }
```
Pitfall 2 (RESEARCH.md) applies directly here: the regeneration query inside that RPC must filter `status = 'pending' AND local_date >= p_effective_date`, never on date alone.

---

### `src/db/undoLog.ts` (model, append-only + list)

**Analog:** `src/db/customCurrencies.ts` (per-user RLS, same owner-scoped fetch pattern) — but write shape is closer to `insertTransaction`'s "insert once, never update" than to a full CRUD table, since D-23's inverse ops are written once per step and never edited (only read, and marked `refused` by a server-side function during replay, not by client `update`).

**Fetch pattern** (copy `fetchCustomCurrencies`'s shape, lines 59-68): `fetchUndoLog(client, ownerId, limit = 12)` — order by `created_at desc`, `.limit(12)` per D-25's fixed depth.

**Insert pattern** (copy `insertCustomCurrency`'s shape, lines 70-94): `insertUndoStep(client, step: NewUndoStep)` — same duplicate-id tolerance (MON-08's replay-safety applies to every client-generated-UUID table equally).

**No update function needed on the client side** — D-28's "refused, greyed, stays in history" is a read-side interpretation (the replay attempt's outcome is written by whatever function performs the replay, or the row simply isn't removed), not a client-initiated patch. Confirm this against the planner's exact `undo_log` schema once chosen (e.g. a `status` column set by the replay call).

---

### `src/db/transactions.ts` (extend in place)

**Analog:** itself — this is Pattern 1 from RESEARCH.md, quoted directly because it is the literal instruction for this file:

```typescript
// src/db/transactions.ts — extend, do not replace
export const TRANSACTION_PATCH_KEYS = [
  'account_id', 'original_amount', 'original_currency', 'local_date', 'time_zone', 'note',
  'name', 'category_id', 'payment_type', 'status', 'deleted_at', // NEW
] as const satisfies readonly (keyof TransactionPatch)[];
```

**Soft delete reuses `useEditTransaction`, not a new delete function** (RESEARCH.md Code Example 1, `src/data/mutations/transactions.ts` extended):
```typescript
export function useDeleteTransaction(): { remove(vars: { id: string; householdId: string; month: string; expectedVersion: number }): void } {
  const { edit } = useEditTransaction();
  return {
    remove(vars) {
      edit({ id: vars.id, householdId: vars.householdId, month: vars.month, expectedVersion: vars.expectedVersion,
        patch: { deleted_at: new Date().toISOString() } });
    },
  };
}
```
`TRANSACTION_COLUMNS` (line 51-52 of the current file) must also gain `name, category_id, payment_type, status, recurring_series_id, import_batch_id` — `deleted_at` should NOT be added to `TRANSACTION_COLUMNS`'s default select if a shared "active rows only" view/filter is used instead (see Shared Patterns → Soft Delete below); if it is added, every existing call site of `fetchTransactionsForMonth` needs the `deleted_at is null` filter added explicitly (Pitfall 1).

---

### `src/engine/recurring/schedule.ts` (pure, CRUD schedule maths)

**Analog:** `src/engine/time/localDate.ts` — build directly on its exports (`isValidLocalDate`, `monthOf`, `monthRange`), do not reimplement date validation.

**Style to copy** (`localDate.ts` lines 1-11, module doc establishing the no-I/O contract):
```typescript
/**
 * Local-date and month maths (MON-14). ... This module never reads the device's own
 * configured time zone -- the engine has no I/O and no device state.
 */
```
`schedule.ts` should carry an equivalent header note: pure calendar arithmetic on `local_date` strings only, no `Date.now()`, no time zone lookups (the series' own `time_zone` column, captured once at creation, is passed in — mirrors how `localDateIn` takes `timeZone` as a parameter rather than reading it).

**Function shape to copy** (`monthRange`, lines 73-87 — validate input, compute pure output, no exceptions swallowed):
```typescript
export function monthRange(month: string): { start: string; endExclusive: string } {
  if (!MONTH_PATTERN.test(month)) {
    throw new RangeError(`monthRange: "${month}" is not a valid 'YYYY-MM' month`);
  }
  // ...
}
```
`nextOccurrenceDate(anchorDate, freq, intervalCount, afterDate)` and `clampToMonthEnd(year, month, day)` should follow this exact validate-then-compute shape, each individually property-tested per D-04's "property-tested" requirement (RESEARCH.md flags `engine/recurring` for the `FULL` (100%) coverage bucket in `jest.config.js`).

**SQL mirror requirement (Pitfall 3, Pattern 2):** whatever `nextOccurrenceDate` computes in TypeScript must be re-implemented in plpgsql for `generate_occurrences()` and proven to agree via a shared fixture — mirrors the existing `07_money_rounding_mirror.test.sql` proving `engine/money` and `stamp_fx_rate()` agree. Create `supabase/tests/fixtures/recurring-schedule-cases.json` alongside the new `.test.ts` file, the same way `money-conversion-cases.json` (if present) backs the money mirror test — check for that fixture's exact name/location before inventing a new convention.

---

### `src/engine/csv/*.ts` (pure, transform)

**Analog:** `src/engine/money/parseAmount.ts` — the project's canonical "strict, pure, region-aware string parser with a typed error union" pattern.

**Result-type pattern to copy** (lines 83-89):
```typescript
export type ParseError = 'empty' | 'invalid' | 'ambiguous-separator' | 'too-many-decimals' | 'too-large';
export type ParseDecimalResult = { ok: true; value: string } | { ok: false; error: ParseError };
```
`tokenize.ts` should define `TokenizeError = 'unterminated-quote' | 'inconsistent-columns' | ...` and `TokenizeResult = { ok: true; rows: string[][] } | { ok: false; error: TokenizeError; line: number }` in the same discriminated-union shape — every downstream caller (the preview UI, the property tests) narrows on `.ok` exactly as `parseAmount` callers already do throughout the codebase.

**Character-by-character scan pattern to copy** (lines 149-189, `parseDecimalString`'s `for (const ch of trimmed)` loop with early-return on any disallowed character): this is the right shape for the RFC-4180 tokenizer too — iterate once, maintain minimal state (current field, current row, in-quotes flag), return a typed error the instant an invalid state is reached, never partially recover.

**Locale/format inference pattern to copy** (`localeSeparators`, lines 36-41):
```typescript
export function localeSeparators(locale: string): LocaleSeparators {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  return { decimal, group };
}
```
`inferFormat.ts`'s date-format/decimal-mark inference from sample rows should follow this "derive from data, fall back to a safe default, never guess silently" shape — and per Pitfall 5, an ambiguous case (no row disambiguates DD/MM vs MM/DD) must be its own explicit return variant, not a silent default.

**Reuse, do not reimplement:** amount parsing inside the CSV commit path calls `parseAmount` from `engine/money` directly (D-11 explicitly requires this) — `csv/` never defines its own amount parser, only feeds `parseAmount` the inferred decimal mark via its `separators` option (see `parseAmount.ts` lines 220-245, the `separators` parameter already exists for exactly this kind of override).

---

### `src/engine/categorize/guessCategory.ts` (pure, transform)

**Analog:** `src/engine/split/allocate.ts` (pure rule-based transform taking typed inputs, no I/O) — read this file directly before implementing; it is the closest existing "apply a set of rules to produce a categorical/numeric result" pure module. `guessCategory(description: string, keywordRules: KeywordRule[], learnedDescriptions: Map<string, string>): string | null` should combine keyword matching (checked first or in a defined priority order) with the learned-description lookup (D-14: "a description the user has categorised before reuses that category"), returning `null` for "uncategorised" rather than throwing or defaulting to a category — matching `parseAmount`'s discipline of an explicit failure/absence variant over a silent default.

---

### `src/engine/undo/computeInverse.ts` (pure, transform)

**Analog:** `src/engine/money/rounding.ts`/`arithmetic.ts` for the "pure function returning a typed discriminated union" shape (RESEARCH.md Code Example 2 is authoritative here, reproduced from the actual RESEARCH.md content):

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
```
Use `src/engine/guards/assertNever.ts` (already used in `useAmountParser.ts` line 70 for its `switch`'s default case) to make the `switch` exhaustive over `RecordedAction['kind']` — this is the established pattern for exhaustiveness-checked switches in this codebase:
```typescript
// src/ui/money/useAmountParser.ts line 70, the pattern to copy for computeInverse's switch
default:
  return assertNever(result.error, 'ParseError');
```

**Critical ordering constraint (Anti-Pattern, RESEARCH.md):** `computeInverse` must be called and its result stored in `undo_log` at the moment the *original* mutation succeeds (inside that mutation's `onSuccess`, alongside the `undo_log` insert), never reconstructed later from a snapshot fetched at undo time — the "before" state is only available at the moment of the original edit.

---

### `src/data/mutations/categories.ts` (mutation hook, CRUD)

**Analog:** `src/data/mutations/customCurrencies.ts` — copy essentially verbatim; both are per-user tables with the identical `add`+`edit` `setMutationDefaults` shape.

**Full pattern to copy** (`customCurrencies.ts` lines 63-162, the two `qc.setMutationDefaults(...)` blocks): swap `custom_currencies`→`categories`, `CustomCurrencyRow`→`CategoryRow`, `queryKeys.customCurrencies(userId)`→`queryKeys.categories(userId)`. The `guardSession`/`markSession`/`recordWrittenVersion`/`resolveExpectedVersion`/`acceptIfAlreadyApplied`/`upsertRow` plumbing (lines 1-36) is imported unchanged from `@/data/sync/*` and `./writeClient`/`./cacheRows` — none of it is category-specific.

**Merge and archive are edit-shaped, not new mutation kinds** (D-36): "archive" is `edit({ patch: { archived_at: now } })` exactly like `useEditAccount`'s `archived_at` patch already does for accounts (`src/data/mutations/accounts.ts` line 28, `AccountPatch` includes `archived_at`). "Merge" (rewriting every transaction's `category_id` from the removed category to the target, plus archiving the source) is a **bulk operation** and belongs in the same `data/mutations/undo.ts`-adjacent bulk-op family (see Shared Patterns → Bulk Operations below), not a bespoke category mutation.

---

### `src/data/mutations/recurringSeries.ts` (mutation hook, CRUD)

**Analog:** `src/data/mutations/accounts.ts` — copy verbatim (household-scoped, add+edit pair, no FX stamping needed — same reason accounts.ts has none). See the full file already read above; swap `accounts`→`recurring_series`, `AccountRow`→`RecurringSeriesRow`.

**"This and future" edit needs its own mutation, not a plain `editAccount`-shaped patch** — it must call `editSeriesFromDate` (see `db/recurringSeries.ts` above) inside the `mutationFn`, and its `onSuccess` must invalidate every affected month's `transactionsMonth` cache (the regenerated occurrences live in `transactions`, not in the series' own cache entry) — mirroring how `useEditTransaction`'s `onSuccess` (in `src/data/mutations/transactions.ts` lines 250-259) invalidates both the source and destination month when a row's month changes.

---

### `src/data/mutations/undo.ts` (mutation hook, request-response replay)

**Analog:** `src/data/mutations/transactions.ts`'s `useEditTransaction`/`updateTransaction` conflict path — RESEARCH.md Code Example 2's second half is the literal target shape:

```typescript
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
This module dispatches by `InverseOp['entity']`/`kind` to the matching existing `update*`/`insert*` function (`updateTransaction`, `updateCategory`, `updateRecurringSeries`, ...) — it is a thin router, not a new write pipeline (Anti-Pattern warning in RESEARCH.md).

**Bulk undo needs the two-phase verify-then-apply shape from Pitfall 4**, which has no direct analog in the codebase yet (Phase 1 never had multi-row atomic writes) — implement as: (1) batch `select id, version from <entity> where id = any($1)` to check every inverse op's `expectedVersion` still matches, refuse the whole step if any mismatch (D-26's "never clobbers, never partial"), (2) only then apply every inverse op. Model the batch-select step after `fetchTransaction`'s single-row lookup (`src/db/transactions.ts` lines 59-68), generalized to `.in('id', ids)`.

---

### `src/data/mutations/csvImport.ts` (mutation hook, batch)

**Analog:** `src/data/mutations/transactions.ts`'s `useAddTransaction`/`insertTransaction` — the commit path is a loop calling the exact same insert function per row/chunk, tagged with a shared `import_batch_id`.

**Pattern:** build `NewTransaction[]` from parsed+mapped CSV rows (each with `status: 'paid'` per D-15, `import_batch_id: batchId`), then call `insertTransaction` (or a new `insertTransactionsBatch` wrapping a single multi-row Supabase `.insert([...])` call — check whether PostgREST's grant list supports a bulk insert before assuming a single-row loop is required) in chunks of ~200 (RESEARCH.md Pattern 3). Each chunk's optimistic cache update follows `AddTransactionVars`'s `onMutate` shape (`src/data/mutations/transactions.ts` lines 140-189) but batched — prepend all optimistic rows for the chunk's target month(s) at once rather than one `patchMonthCache` call per row.

**Do not block commit on FX resolution** (Anti-Pattern, D-19): rows insert with `rate_pending: true` when historical rates aren't cached yet; `followUpIfRatePending` (already defined in `transactions.ts` lines 116-132) is the exact function to reuse per inserted row, fired-and-forgotten (`void followUpIfRatePending(...)`), not awaited.

---

### `src/data/queries/categories.ts` / `recurringSeries.ts` / `undoLog.ts` (query hooks, CRUD read)

**Analog:** `src/data/queries/accounts.ts` — copy verbatim, this is the entire pattern:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '@/db/accounts';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useAccounts(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.accounts(householdId ?? ''),
    queryFn: () => fetchAccounts(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
```
`useCategories(userId?)`, `useRecurringSeries(householdId?)`, `useUndoLog(userId?)` are each a direct swap of the fetch function, the query key, and the `enabled` guard's parameter name.

---

### `src/data/queries/activitySearch.ts` (query hook, request-response search)

**Analog:** `src/data/queries/accounts.ts`'s shape, but the query itself is new (`ilike` cross-month search, per RESEARCH.md Pattern 6) rather than a straight household `eq`:
```typescript
export function useTransactionsSearch(householdId?: string, term?: string) {
  return useQuery({
    queryKey: queryKeys.transactionsSearch(householdId ?? '', term ?? ''),
    queryFn: () => fetchTransactionsSearch(supabase, householdId as string, term as string),
    enabled: Boolean(householdId) && Boolean(term),
  });
}
```
The underlying `fetchTransactionsSearch` in `db/transactions.ts` should follow `fetchTransactionsForMonth`'s pagination shape (lines 80-120 of the current file) if result sets can be large, but for a search box a simple `.ilike('name', \`%${term}%\`).limit(N)` is more likely sufficient — planner's call, per RESEARCH.md's Open Question 1 area not being fully settled either way here.

---

## Shared Patterns

### Version-conditional optimistic mutation (the one write pipeline)
**Source:** `src/data/mutations/transactions.ts` and `customCurrencies.ts`/`accounts.ts` (all three are the same shape)
**Apply to:** Every new mutation file (`categories.ts`, `recurringSeries.ts`, `undo.ts`, `csvImport.ts`) — register via `qc.setMutationDefaults(mutationKeys.xxx, { mutationFn, scope: WRITE_SCOPE, retry: shouldRetryWrite, retryDelay: writeRetryDelay, onMutate, onSuccess, onError })`. Never build a parallel write path — RESEARCH.md's Anti-Pattern #1 warns this breaks D-20's cross-entity write ordering.
```typescript
// The shape every new mutation file must follow (from src/data/mutations/accounts.ts)
qc.setMutationDefaults(mutationKeys.addX, {
  mutationFn: (vars) => guardSession(vars, async () => insertX(await writeClient(), vars.row)),
  scope: WRITE_SCOPE,
  retry: shouldRetryWrite,
  retryDelay: writeRetryDelay,
  onMutate: async (vars) => { markSession(vars); /* optimistic cache write */ },
  onSuccess: (row, vars) => { /* upsertRow into cache */ },
  onError: async (err, vars) => { /* classify, roll back optimistic row, recordFailedWrite */ },
});
```

### Per-user RLS table (categories, undo_log)
**Source:** `supabase/migrations/20260924000100_custom_currencies.sql`
**Apply to:** `categories.sql`, `undo_log.sql` migrations
```sql
create policy "owner reads own categories" on public.categories for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own categories" on public.categories for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_system);
create policy "owner updates own categories" on public.categories for update to authenticated
  using (owner_id = (select auth.uid()) and not is_system) with check (owner_id = (select auth.uid()));
```
Do NOT use the household-scoped `user_household_ids()` pattern for these two tables — that pattern is structurally different (a join through `household_members`) and wrong for a directly-owned row.

### Household-scoped RLS table (recurring_series)
**Source:** `supabase/migrations/20260924000300_accounts.sql`
```sql
create policy "members read household accounts" on public.accounts for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "members insert household accounts" on public.accounts for insert to authenticated
  with check (household_id in (select public.user_household_ids()) and created_by = (select auth.uid()));
```
**Apply to:** `recurring_series.sql` migration, swapping table name only.

### Scheduled plpgsql job (recurring materialisation)
**Source:** `supabase/migrations/20260924000700_fx_monitor_jobs.sql`
**Apply to:** `recurring_materialisation.sql`
```sql
create or replace function public.generate_occurrences(p_horizon date default ...)
returns integer language plpgsql security definer set search_path = '' as $$ ... $$;
revoke execute on function public.generate_occurrences(date) from public, anon, authenticated;
grant execute on function public.generate_occurrences(date) to service_role;

select cron.schedule('recurring-materialise-daily', '0 6 * * *', $$ select public.generate_occurrences(); $$);
```
Note: unlike `fx-monitor`, this job needs no `net.http_post`/Vault secret (Pattern 2, RESEARCH.md) — it is pure SQL, called directly by `cron.schedule`, not via an Edge Function HTTP hop.

### Version conflict → typed error → conflict UI
**Source:** `src/db/errors.ts` (`VersionConflictError`), consumed in every `mutations/*.ts` file's `onError`
**Apply to:** `undo.ts` (REC-12's refusal is this exact error, new copy only), `categories.ts`, `recurringSeries.ts`
```typescript
export class VersionConflictError extends Error {
  readonly code = 'version-conflict';
  constructor(readonly entity: WriteEntity, readonly id: string, readonly serverRow: unknown) { ... }
}
```
**Extend `WriteEntity`** (`src/db/errors.ts` line 6) to add `'categories' | 'recurring_series' | 'undo_log'` — every new mutation's `recordFailedWrite` call needs its entity to type-check against this union.

### Soft delete + universal `deleted_at` filter
**Source:** D-30, mirrors `accounts.archived_at`'s existing convention
**Apply to:** every new read path this phase adds (`activitySearch.ts`, `fetchCategories` usage-counts, recurring-occurrence lists)
**Pitfall 1 (RESEARCH.md) is load-bearing here:** add the `deleted_at is null` filter once, centrally (a Postgres view `transactions_active`, or a single shared query-builder function), not repeated ad hoc in every new `db/` function — the existing `fetchTransactionsForMonth` (src/db/transactions.ts lines 80-120) is the one Phase 1 read path that will need this filter added, and every *new* Phase 2 read path must have it from the start.

### Client-generated UUID + duplicate-insert tolerance
**Source:** `src/db/customCurrencies.ts` lines 70-94 (and identically in `accounts.ts`, `transactions.ts`)
**Apply to:** every new `insertX` function (`insertCategory`, `insertRecurringSeries`, `insertUndoStep`)
```typescript
if (error.code === UNIQUE_VIOLATION) {
  const existing = await fetchX(client, x.id);
  if (existing) return existing;
}
throw toDbError(error, status);
```

### i18n typed catalogue, no inline strings
**Source:** `src/i18n/locales/en.ts` + `src/i18n/copyStatus.ts` (draft-key marking)
**Apply to:** every new copy line in `02-UI-SPEC.md`'s Copywriting Contract — route through `useT()` (as `RateAttribution.tsx` line 25 and `useAmountParser.ts` line 44 already do), never inline template strings in JSX.

### Amount input/display reuse
**Source:** `src/ui/money/useAmountParser.ts`, `src/ui/money/useMoneyFormatter.ts`
**Apply to:** the entry sheet's amount field, the CSV preview's amount column, every Activity row's amount display — `useAmountParser(regionOverride)` is already parameterized for the region-override case D-24 needs; do not write a second amount-parsing hook for CSV or the entry sheet.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/features/record/**` (Activity screen, entry sheet, CSV import flow UI, History screen, category management UI) | component | request-response | No feature screen exists yet in this codebase — Phase 0/1 built only `src/ui/` primitives (`Screen`, `RateAttribution`, `SyncStatusLine`) and no full-screen composition. The planner should compose these from the existing primitives per `02-UI-SPEC.md`'s Design System table, not copy a structural screen analog that doesn't exist. `src/features/auth/AuthProvider.tsx` is the only file under `src/features/` today and is a context provider, not a screen — not a useful structural analog for a list/sheet screen. |
| `src/engine/csv/tokenize.ts`'s RFC-4180 quote/escape handling specifically | utility (pure) | transform | No existing module in this codebase parses a delimited text format — `parseAmount.ts`'s char-scan discipline is the closest *style* analog (cited above), but the actual quote-doubling/embedded-delimiter state machine has no precedent to copy logic from, only pattern (typed result, pure, no partial recovery). |

---

## Metadata

**Analog search scope:** `src/db/`, `src/data/mutations/`, `src/data/queries/`, `src/engine/`, `src/ui/`, `src/features/`, `supabase/migrations/`, `supabase/tests/database/`, `jest.config.js`, `src/README.md`
**Files scanned/read in full this session:** `src/db/transactions.ts`, `rows.ts`, `errors.ts`, `accounts.ts`, `customCurrencies.ts`; `src/data/mutations/transactions.ts`, `accounts.ts`, `customCurrencies.ts`; `src/data/queries/accounts.ts`; `src/data/keys.ts`; `src/data/sync/versionChain.ts`, `failedWrites.ts`; `src/engine/time/localDate.ts`; `src/engine/money/parseAmount.ts`; `src/ui/Screen.tsx`, `RateAttribution.tsx`; `src/ui/money/useAmountParser.ts`; `src/services/analytics/catalogue.ts`; `supabase/migrations/20260924000100_custom_currencies.sql`, `20260924000300_accounts.sql`, `20260924000700_fx_monitor_jobs.sql`, `20260922000100_household_of_one.sql`; `src/README.md`; `jest.config.js`
**Pattern extraction date:** 2026-09-25
