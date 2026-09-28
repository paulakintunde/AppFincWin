---
phase: 02-record
scope: "Waves 1-5, Area B: database schema/RPCs and typed db layer"
reviewed: 2026-09-28T00:00:00Z
depth: deep
files_reviewed: 22
files_reviewed_list:
  - supabase/migrations/20260926000100_categories.sql
  - supabase/migrations/20260926000200_transactions_record_fields.sql
  - supabase/migrations/20260926000300_recurring_series.sql
  - supabase/migrations/20260926000400_recurring_materialisation.sql
  - supabase/migrations/20260926000500_undo_log.sql
  - supabase/migrations/20260926000600_record_read_rpcs.sql
  - supabase/migrations/20260926000700_transfer_pairs.sql
  - supabase/migrations/20260926000800_import_profiles.sql
  - supabase/tests/database/25_categories.test.sql .. 34_import_profiles.test.sql (coverage only)
  - scripts/gen-recurring-mirror-test.mjs
  - .github/workflows/ci.yml
  - src/db/accounts.ts
  - src/db/categories.ts
  - src/db/errors.ts
  - src/db/importProfiles.ts
  - src/db/patches.ts
  - src/db/recordReads.ts
  - src/db/recurringSeries.ts
  - src/db/rows.ts
  - src/db/transactions.ts
  - src/db/undoLog.ts
findings:
  critical: 2
  warning: 9
  info: 7
  total: 18
status: issues_found
fix_status: paused_not_started
---

## Fix status (gsd-code-fixer, 2026-09-28)

The fix run was paused by the user before any finding was started. No migration, test or `src/db` file has been changed. Every finding is still open.

| ID | Status |
|----|--------|
| D-CR-01 | not started |
| D-CR-02 | not started |
| D-WR-01 | not started |
| D-WR-02 | not started |
| D-WR-03 | not started |
| D-WR-04 | not started |
| D-WR-05 | not started |
| D-WR-06 | not started |
| D-WR-07 | not started |
| D-WR-08 | not started |
| D-WR-09 | not started |
| D-IN-01..D-IN-07 | not started |

Notes for resuming:
- None of the 8 Phase 2 migrations has been pushed, so fixes go in place.
- WR-07's cited lines (282-287) do not match `20260926000200_transactions_record_fields.sql`, which has 133 lines. The `transactions_active` grant block is near the end of that file (section 6).

# Phase 02 (Record) Waves 1-5, Area B: DB schema, RPCs and typed db layer

**Reviewed:** 2026-09-28
**Depth:** deep (security focus)
**Status:** issues_found

## Summary

I read all eight Phase 2 migrations in full, plus the Phase 1 helpers they depend on: `bump_version`, `user_household_ids`, `stamp_fx_rate`, `per_eur_rate`, `is_known_currency` and the transactions/accounts RLS. I also read every changed `src/db` wrapper and the engine inverse builder (`src/engine/undo/inverse.ts`), because the correctness of `apply_patches` depends on it. I only read the pgTAP files to judge coverage and did not run them. Nothing was run against any Supabase project.

**What holds up.** The RLS boundary is solid. Every new table has RLS enabled, anon is revoked, and the column-level insert/update grants are narrow. Every SECURITY DEFINER function pins `search_path = ''` and fully qualifies its references. The maintenance functions (`materialise_*`, `purge_record_tombstones`, `seed_user_categories`) are properly revoked from `authenticated`/`anon`.

Crafted ids do not cross households:
- `apply_patches` checks household or owner scope on the *current* row before comparing versions.
- `household_id`, `owner_id` and `created_by` are never allowlisted.
- Account moves are held in-household by the composite FKs `(account_id, household_id)`.
- Category and currency references are held to the actor or the row's author by the definer guards.

The SQL schedule mirror matches `schedule.ts` (PG interval month-end clamping equals the TS `min(day, daysInMonth)`).

**Migration order is safe.** 0500/0600 only reference objects from 0200/0300, and 0700/0800 are standalone. The SUMMARYs confirm nothing has been pushed to production, so all eight will apply in filename order in a single push.

**The real problems are integrity and lifecycle defects in the undo and recurring machinery:**
- Undoing a series create/edit does not reverse rows the daily cron materialised in the meantime, and nothing refuses the undo.
- `apply_patches`'s version check fails open when `expectedVersion` is missing.
- Undo steps that hit an integrity error throw instead of being refused, which can wedge the history.
- The cron materialiser has no per-series isolation.
- Several paths that are supposed to be "one action = one undoable step" are not atomic or not replay-safe.

## Critical Issues

### CR-01: Undoing a series create/edit leaves cron-materialised occurrences alive, and the undo is never refused

**File:** `supabase/migrations/20260926000400_recurring_materialisation.sql:31-94, 431`; `src/engine/undo/inverse.ts:138-161`; `supabase/migrations/20260926000500_undo_log.sql:203-204`

**Issue:** The undo step for a series change is built only from the RPC's own change set (`inserted`, `soft_deleted`, `linked`, `series.before`). After the RPC returns, the daily job (`recurring-materialise-daily`, `materialise_recurring()` → `materialise_series()`) keeps inserting new `pending` occurrences whenever the horizon moves into a new month. Its bookkeeping update runs under `fincwin.system_restamp = 'on'`, so the series `version` does not bump. The inserted rows are brand-new ids that the stored step does not reference.

When the user later undoes the step (D-25 sets no time limit):
- **Undo of create:** the ops soft-delete the series and the RPC-inserted rows. Every row the cron added afterwards stays live as a `pending` bill attached to a soft-deleted series. `materialise_series` never touches a deleted series again, so nothing cleans them up. `purge_record_tombstones` can never purge the series either (line 471 requires that no transaction reference it).
- **Undo of "this and future" edit:** the template reverts to the old values, but next month's cron-inserted row keeps the *new* amount/account/category. `materialised_through` is past it, so it is never regenerated with the old template.

No version moved, so `apply_patches` returns `applied`. This contradicts D-26 ("…or a system job… that step is refused").

**Failure scenario:** On 28 Sep a user creates a monthly £1,200 rent series. On 1 Oct the cron materialises Nov rent (horizon = 30 Nov). On 3 Oct the user undoes "Created Rent". Sep/Oct rows are soft-deleted, but the Nov £1,200 `pending` row stays in `account_balances.pending_sum`, the month list and the Decide inputs, attached to a series the UI no longer shows.

**Fix:** Make series undo server-authoritative rather than a fixed op list. Either:
1. Handle it in `apply_patches` when an op sets `recurring_series.deleted_at` to `$now`: also soft-delete every `pending`, `deleted_at is null` occurrence of that series, and restore the matching set on undo. For template edits, route the inverse through an `undo_recurring_series_edit` RPC that re-runs the "this and future" regeneration with the `before` template from the original `p_effective_from`.
2. Or, at minimum, have the materialiser bump a `generation` counter on the series (not `version`), store it in the step, and have `apply_patches` refuse the undo if it has moved:

```sql
-- in materialise_series, when v_id is not null at least once:
update public.recurring_series set generation = generation + 1 where id = s.id;
-- in the series op of the undo step: {"expectedGeneration": n}; refuse with reason 'changed' when it differs
```

Add a pgTAP case: create → `materialise_series(id, <next month>)` as service_role → `apply_undo_step` → assert zero live pending rows for the series.

### CR-02: `apply_patches` version check fails open when `expectedVersion` is absent or null

**File:** `supabase/migrations/20260926000500_undo_log.sql:185-191, 245-257`

**Issue:**
```sql
if v_op ->> 'expectedVersion' !~ '^[0-9]+$' then   -- NULL !~ ... is NULL -> IF not taken
...
v_expected_version := (v_op ->> 'expectedVersion')::integer;  -- NULL
if v_expected_version < 1 then                     -- NULL -> not taken
...
if v_current_version <> v_expected_version then    -- NULL -> not taken: no conflict
```
An op with no `expectedVersion` key, or with `"expectedVersion": null`, passes every check and is applied unconditionally.

`apply_patches` is SECURITY DEFINER. It is the only write path to `recurring_series` and the replay engine for undo. Undo ops are client-authored: `undo_log` has a direct `insert (id, label_key, label_params, ops)` grant, and `p_undo_step.ops` is not validated. So a malformed or old-client step silently overwrites whatever another member or device wrote since, which is exactly what D-26 forbids ("It never clobbers"). The typed TS layer always sends a number, but the SQL guard is the enforcing boundary and it fails open.

**Failure scenario:** A replayed step `{"entity":"transactions","id":X,"patch":{"original_amount":-5000}}` (no `expectedVersion`) run through `apply_undo_step` overwrites Sam's later edit of X with no refusal.

**Fix:**
```sql
if coalesce(v_op ->> 'expectedVersion', '') !~ '^[1-9][0-9]{0,8}$' then
  raise exception 'apply_patches: op % has an invalid expectedVersion', v_idx using errcode = '22023';
end if;
```
Also validate the shape of `p_undo_step.ops` at insert time (every element an object with entity/id/expectedVersion/patch), so a malformed step is rejected when it is written, not when it is replayed. Add a pgTAP case for a missing key and for a `null` value.

## Warnings

### WR-01: One failing series aborts the whole daily materialisation for every household

**File:** `supabase/migrations/20260926000400_recurring_materialisation.sql:100-119`

**Issue:** `materialise_recurring()` loops over every active series inside one transaction, with no `begin … exception … end` around each `materialise_series(s.id)`. Any exception from one series rolls back the entire run for all users, and it fails again the next day, and every day after, because the poisoned series is still active. The run also holds `FOR UPDATE` locks on every series row until it finishes.

Paths that raise inside the loop include:
- `stamp_fx_rate` raising `no profile for transaction author` when `created_by` is null. The FK is `on delete set null`, which becomes reachable as soon as a non-owner member who created a series is deleted (Phase 8).
- `guard_transaction_currency`/`guard_recurring_series` rejecting a custom currency for a null `created_by`.
- `guard_recurring_series` re-validating the time zone against `pg_timezone_names` on the bookkeeping update, which breaks if a zone is dropped in a PG/tzdata upgrade.
- Any future guard added to `transactions`.

**Fix:** Isolate each series and record failures:
```sql
for s in select id from public.recurring_series where ... loop
  begin
    total := total + (select count(*) from public.materialise_series(s.id));
  exception when others then
    raise warning 'materialise_series % failed: % (%)', s.id, sqlerrm, sqlstate;
    -- optionally insert into a monitoring table
  end;
end loop;
```
Also skip series whose `created_by` is null, or fall back to the household owner as author.

### WR-02: An undo step that hits an integrity error throws instead of being refused, and wedges history

**File:** `supabase/migrations/20260926000500_undo_log.sql:352-385, 390-433`; unique index `20260926000300_recurring_series.sql:122-124`

**Issue:** `apply_undo_step` and `rollback_undo_to` only map a `conflict` *return* to `refused`. Any exception raised in Phase B leaves the step `available` and makes every later attempt throw the same error. Examples:
- 23505 from `transactions_series_occurrence_uidx`
- 23514 from `transactions_skipped_needs_series` or the deferred transfer-pair trigger
- 23503 from the composite account FK
- 42501 after the user has left the household

`rollback_undo_to` to any older step also throws, so everything beneath it becomes permanently un-undoable.

**Concrete scenario (verified by reading):**
1. The user deletes pending occurrence O (date D). Step S1 restores O at version v.
2. The user runs "edit this and future" from a date ≤ D. `materialised_through` is rewound, and because O is a tombstone, the partial unique index lets `materialise_series` insert a new row N on date D.
3. From History the user undoes S1 on its own (`apply_undo_step(S1)`). O's version is unchanged, so the check passes, and `deleted_at = null` raises 23505.
4. S1 now throws on every tap, forever.

**Fix:** Wrap the replay in a sub-block and turn the expected integrity errors into a refusal:
```sql
begin
  v_result := public.apply_patches(s.ops);
exception when unique_violation or check_violation or foreign_key_violation or insufficient_privilege then
  v_result := jsonb_build_object('status','conflict','conflict', jsonb_build_object(
    'entity', null, 'id', null, 'updated_by', null, 'record_name', null, 'builtin_key', null, 'reason', 'changed'));
end;
```
Match `parseConflict`'s expectations. Note that the deferred transfer-pair trigger fires at commit and cannot be caught here. Consider `set constraints transfer_pair_check immediate` at the end of `apply_patches`, so its failure also becomes catchable.

### WR-03: `apply_patches`, `edit_recurring_series_from` and `end_recurring_series` are not replay-safe

**File:** `supabase/migrations/20260926000500_undo_log.sql:245-257, 342-344`; `20260926000400_recurring_materialisation.sql:276-284, 370-378`; `src/db/patches.ts:107-133`; `src/db/recurringSeries.ts:445-479`

**Issue:** The write queue replays paused mutations when a response is lost (MON-08 pattern). Every other `src/db` writer treats a replay of its own landed write as success (23505 → fetch the existing row). These three RPCs do not:
- **`apply_patches`:** the replay's `expectedVersion` no longer matches the version its own first attempt produced, so it returns `conflict` and the wrapper throws `VersionConflictError`. The `on conflict (id) do nothing` on the undo-step insert shows a replay was anticipated, but the version check returns before that line is reached.
- **`edit_recurring_series_from` / `end_recurring_series`:** same failure. Their replay returns `conflict`.

**Failure scenario:** A bulk "Delete 30 lines" commits, but the response is lost on a flaky network. The replay reports a version conflict for the user's own action and parks it as a failed write, even though the delete and its undo step both landed.

**Fix:** Before Phase A, if `p_undo_step.id` already exists for `auth.uid()`, return `{"status":"already-applied"}`. The client already generates that id at action time. Give the series RPCs an optional client action id (or the undo step id) and apply the same short-circuit. Handle `already-applied` in `applyPatches`/`interpretSeriesResponse`.

### WR-04: Series RPCs do not record their undo step atomically (violates D-24)

**File:** `src/db/recurringSeries.ts:430-479`; `supabase/migrations/20260926000400_recurring_materialisation.sql:130-238, 248-343, 347-409`

**Issue:** `apply_patches` takes `p_undo_step`, so the forward write and its inverse commit together. The three series RPCs do not. The client must call `insertUndoStep` in a second request after parsing the change set. If the app is killed, the network drops, or the second insert fails between the two requests, the series action is committed with no undo step.

On a replayed create, the RPC returns `already-applied` with no change set (lines 157-161), so the client cannot build the step at all. D-24 names "a series edit with this and future" as one undoable step.

**Fix:** Add a `p_undo_step jsonb default null` parameter to all three RPCs. Build the inverse server-side from the change set (the ordering in `inverseOfSeriesChange` is simple to mirror), or accept the client's pre-built step, and insert it in the same transaction. For the create replay, return the stored change set, or at least the step id.

### WR-05: Editing `freq` (or `anchor_date`) restarts `occurrence_count` from zero

**File:** `supabase/migrations/20260926000400_recurring_materialisation.sql:308-315, 61`

**Issue:** `occurrence_count` means "occurrences n = 0 .. count-1 counted from `anchor_date`" (`materialise_series` line 61, `schedule.ts` `occurrencesBetween`). A `freq` patch moves `anchor_date` to `p_effective_from` without reducing `occurrence_count`, so the count restarts. The same happens with an explicit `anchor_date` patch.

**Failure scenario:** A 12-instalment loan series, with 6 paid, is switched from monthly to fortnightly from today. It now generates 12 *more* instalments, and the projected debt doubles.

**Fix:** When the anchor moves and `occurrence_count` is not null and not in the patch, set `occurrence_count := greatest(1, s.occurrence_count - <number of occurrences of the old schedule dated before p_effective_from>)`, or end the series if that reaches 0. The client-side projection in `src/data/queries/activity.ts` reads the same row, so the fix belongs server-side. Add a pgTAP case.

### WR-06: Refused undo steps pin soft-deleted data indefinitely (erasure/storage-limitation)

**File:** `supabase/migrations/20260926000500_undo_log.sql:451-461` (and `474`)

**Issue:** The purge keeps any tombstone referenced by an `available` **or `refused`** step. A refused step can never be applied (`apply_undo_step` returns `refused` straight away, line 369), so it has no reason to keep data alive. Combined with D-25 ("no time limit"), a user who deletes a transaction and then rarely acts keeps that "deleted" row on the server with no end date.

The raw table stays readable (`grant select on public.transactions`), so the row remains visible to every household member through `from('transactions')`, which `fetchTransaction` uses. D-30's intent ("hard-deletes tombstones once no undo stack references them") treats a refused step as dead.

**Fix:** Pin only on `u.status = 'available'`. Also consider a hard ceiling, for example purging tombstones older than 90 days regardless, and document it in the privacy policy.

### WR-07: `transactions_active` keeps Supabase's default write grants for `authenticated`

**File:** `supabase/migrations/20260926000200_transactions_record_fields.sql:282-287`

**Issue:** The migration revokes everything from `anon` and `public` and grants `select` to `authenticated`, but it never revokes the INSERT/UPDATE/DELETE/TRUNCATE that Supabase's `alter default privileges … on tables … to authenticated` hands every new relation in `public`, views included. The view is auto-updatable (`select * from one table where …`).

Today this is not exploitable: `security_invoker = true` makes PG check the base-table column grants and RLS as the caller. However, the whole write surface now depends on that one reloption. Recreating the view without it (for example `create or replace view` in a later migration, or a tool that drops reloptions) would let `authenticated` INSERT/UPDATE/DELETE through the view **as the view owner**, bypassing the column grants and the `created_by = auth.uid()` insert policy. I verified that the default grant is standard Supabase behaviour, but did not verify it against this project's catalog.

**Fix:**
```sql
revoke insert, update, delete, truncate, references, trigger on public.transactions_active from authenticated;
```
Add a pgTAP `throws_ok` for `update public.transactions_active set note = 'x'` as authenticated.

### WR-08: No coverage for account deletion cascading through the new `ON DELETE RESTRICT` graph (uncertain)

**File:** `supabase/migrations/20260926000300_recurring_series.sql:46-47, 118-120`; `20260924000400_transactions.sql:53-54`

**Issue:** Deleting an `auth.users` row cascades to `households`, and from there to *both* `transactions` and `recurring_series`, and also to `accounts`. Meanwhile `transactions → recurring_series`, `transactions → accounts` and `recurring_series → accounts` are all `ON DELETE RESTRICT`.

Whether this diamond succeeds depends on the RESTRICT checks firing only after every sibling cascade has run. PG queues RI actions from cascades to the end of the outer statement, so I expect it to pass, but I could not confirm it without running it. No pgTAP file deletes an `auth.users` row (`grep "delete from auth.users"` finds nothing). D-30 and CLAUDE.md require deletion to "actually purge".

If it fails, in-app account deletion errors for any user who has a recurring series. That is a store-compliance blocker.

**Fix:** Add a pgTAP test: user with accounts, transactions (live + tombstones), a series with materialised and linked rows, a transfer pair, undo steps and import profiles → `delete from auth.users where id = …` succeeds → zero rows remain in every table for that user and household. If it fails, change the three FKs to `NO ACTION` (deferrable), or delete in an explicit order inside a `delete_account` definer function.

### WR-09: `end_recurring_series` / `edit_recurring_series_from` accept null or unvalidated dates and still "apply"

**File:** `supabase/migrations/20260926000400_recurring_materialisation.sql:379-399, 308-325`

**Issue:**
- `end_recurring_series(id, v, null)`: `p_end_date < s.anchor_date` is NULL, so the check passes. `end_date` is set to null and nothing is soft-deleted, yet the version bumps and `applied` is returned. An "End series" action silently becomes "remove the end date".
- `edit_recurring_series_from(..., p_effective_from => null)` with no `freq`: the version bumps, nothing is regenerated, and `applied` is returned.
- `p_effective_from` is also not bounded (for example years in the past). The rewind then regenerates every user-deleted occurrence after that date, because tombstones fall outside the partial unique index.

**Fix:** `if p_end_date is null or p_effective_from is null then raise … using errcode = '22023'`. Clamp `p_effective_from` to `>= s.anchor_date` and to a sane window, for example no earlier than the start of the current month minus 12 months.

## Info

### IN-01: `check_transfer_pair` counts legs across all households

**File:** `supabase/migrations/20260926000700_transfer_pairs.sql:78-82`
The definer query counts every row with that `transfer_id` in every household. Someone who knows a household's `transfer_id` can plant two valid legs with the same id in their own household while the victim's pair is soft-deleted. Knowing the id is plausible for a Phase 8 ex-member. The victim's later undo or restore then fails with 23514, which feeds into WR-02. The risk is low because ids are client-generated UUIDs. Fix: add `and t.household_id = new.household_id` (or `old.household_id`) to the count and drop the now-redundant household check.

### IN-02: `undo_log.ops` has an element-count cap but no size cap

**File:** `supabase/migrations/20260926000500_undo_log.sql:33, 121`
Clients can insert directly with up to 6,000 ops of unbounded size each. Trim keeps 12 steps per user, but each can be very large. Add `pg_column_size(ops) <= <n>` (for example 2 MB) alongside the existing `label_params` cap.

### IN-03: Tombstone pinning trusts `touched_ids` from every user's undo log

**File:** `supabase/migrations/20260926000500_undo_log.sql:53, 455-458`
`touched_ids` comes from client-authored `ops`, which can name any UUID, and the purge honours every owner's steps. A user can therefore keep another household's tombstones from being purged, if the ids are known. Fix: scope the check to steps whose owner is a member of the row's household.

### IN-04: The two pure schedule functions stay executable by `anon`

**File:** `supabase/migrations/20260926000300_recurring_series.sql:167-168, 183-184`
`revoke … from public` does not remove Supabase's explicit default `anon` grant. It is harmless because the functions are immutable and read no tables, but it is inconsistent with every other function in this wave. Use `from public, anon`.

### IN-05: The series RPC conflict payload is passed through unparsed

**File:** `src/db/recurringSeries.ts:411-412`
`VersionConflictError`'s `serverRow` is the raw `data.conflict`, whereas `applyPatches` validates it with `parseConflict`. Callers that narrow on `serverRow` for refusal copy get an unvalidated shape. Use `parseConflict(data.conflict)`.

### IN-06: The materialiser's hard-stop can silently skip occurrences

**File:** `supabase/migrations/20260926000400_recurring_materialisation.sql:62, 86-90`; `20260926000300_recurring_series.sql:36-39`
The loop always restarts at n = 0 and exits at n > 5000, yet `materialised_through` is still advanced to the horizon. `recurring_series.anchor_date`/`end_date` have no range check, and `apply_patches` can set `anchor_date` freely. A weekly series anchored about 96 or more years back therefore never materialises again, silently. Fix: add a check constraint (`anchor_date >= '1900-01-01'`), start the loop at a computed `startN` as `occurrencesBetween` does, and do not advance `materialised_through` when the guard trips.

### IN-07: Migration-safety notes for the 02-31 rollout

- **Ordering:** verified. 0500/0600 depend only on 0200/0300, and 0700/0800 are standalone. None of the eight has been pushed (per the 02-07/08/09/38 SUMMARYs), so one `db push` applies them in filename order. Do not push a subset.
- **Locking:** `20260926000200` adds CHECK-constrained columns and builds six indexes, including a GIN trigram index, without `CONCURRENTLY`, under `ACCESS EXCLUSIVE`/`SHARE` locks. That is fine at dogfood scale but will block writes on a large table.
- **pg_trgm:** `create extension if not exists pg_trgm with schema extensions` is followed by `extensions.gin_trgm_ops`. This fails if pg_trgm already exists in another schema. Check `pg_extension` in the preflight.
- **Backfill:** the `seed_user_categories` backfill (0100:168) is idempotent. Good.

---

_Reviewed: 2026-09-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
