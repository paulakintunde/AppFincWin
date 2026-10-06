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
status: fixed
fix_status: all_in_scope_fixed
fixed_at: 2026-10-06
fixed: 17
not_applicable: 1
---

## Fix status (gsd-code-fixer, 2026-10-06)

Every Critical and Warning finding is fixed, and so are six of the seven Info items. The seventh (D-IN-07) is notes only. Each fix has a pgTAP test, and each test was run against the pre-fix code and seen to fail before the fix was applied, with one exception: D-CR-02, whose fix landed before its first run (see its row). The eight unpushed Phase 2 migrations were edited in place, so no corrective migration was added. Everything was run on the local stack only (`supabase db reset --local && supabase test db`); nothing touched a remote project.

| ID | Status | Commit | What changed |
|----|--------|--------|--------------|
| D-CR-01 | fixed | `2f42784` | See "D-CR-01 approach" below. New `recurring_series.generation` (bumped by the materialiser without a version bump); `undo_log.series_generations` captured server-side at insert; new `undo_replay()` shared by `apply_undo_step`/`rollback_undo_to`. Test: `35_series_undo.test.sql` sections 1-4. |
| D-CR-02 | fixed | `f23c59b` | `apply_patches` requires a JSON-number `expectedVersion` matching `^[1-9][0-9]{0,8}$` (a missing key or null raises 22023). `undo_log_fill` validates every stored op's shape at insert (22023). `serialiseOps` throws `RangeError` for a version-less op. Tests: `29` (4 cases), `patches.test.ts`. The fix was applied before its first run, so this test was not seen to fail against the pre-fix code. |
| D-WR-01 | fixed | `92fb86e` | Each series in `materialise_recurring` runs in its own subtransaction (`raise warning` on failure). A null `created_by` falls back to the household owner as author. Test: `28` section 14 (a poisoned series and an orphaned-author series). |
| D-WR-02 | fixed | `a079f9e` | The replay in `undo_replay` runs in a subtransaction and forces `transfer_pair_check` immediate (then deferred again). Integrity errors (class 23), 42501 and 22023 become a refusal (reason `changed`, naming the step's first op) instead of an exception. Test: `35` section 5 (the 23505 scenario from the review) and section 6 (a lone transfer leg). |
| D-WR-03 | fixed | `4c72b83` | New `undo_step_replayed(p_undo_step)`: if the client's step id already exists for the caller, `apply_patches` returns `already-applied` with each row's current version, and `edit_recurring_series_from`/`end_recurring_series` return `already-applied`. A step id owned by someone else raises 42501. The undo-step insert no longer uses `on conflict do nothing`. `applyPatches` maps `already-applied` like `applied`. Test: `35` section 8, `patches.test.ts`. |
| D-WR-04 | fixed | `930ab68` | The three series RPCs take `p_undo_step jsonb default null` (`{id,label_key,label_params}`). The server builds the inverse with `series_change_inverse()` (the SQL mirror of `inverseOfSeriesChange`, same op order) and inserts it in the same transaction (`record_series_undo_step`), returning `undo_step_id`. The db wrappers take an optional `SeriesUndoLabel` and only send `p_undo_step` when given. Test: `35` section 7, `recurringSeries.test.ts`. **src/data follow-up below.** |
| D-WR-05 | fixed | `5e3bbc2` | When the anchor moves (a `freq` change or an explicit `anchor_date`) and `occurrence_count` is set but not patched, the count becomes `old - occurrences dated before the new anchor`. If nothing is left, the edit raises 22023. The old count goes into `before`, so undo restores it. Test: `28` section 15. |
| D-WR-06 | fixed | `d76682a` | `purge_record_tombstones` pins only on `status = 'available'`. Test: `29` section 13. The suggested 90-day hard ceiling was **not** added: it is a retention-policy decision (D-25 says "no time limit") for the Compliance phase and the privacy policy. |
| D-WR-07 | fixed | `288873a` | `revoke all on public.transactions_active from authenticated`, then grant select. Test: `26` section 14 (update through the view, and the grant list is exactly SELECT). |
| D-WR-08 | fixed | `97c6de7` | **The new test reproduced a real failure.** Deleting a user with Phase 2 data failed: (1) `set_updated_by` re-stamped the departing user's id during the ON DELETE SET NULL action, which violated `*_updated_by_fkey`; (2) `guard_recurring_series` re-validated an unchanged category owned by the user being deleted (23514), and reverted a cleared `created_by` (FK violation). Now `set_updated_by` leaves the FK action alone, the guard only re-validates columns that changed on UPDATE, and `created_by` may be cleared. The RESTRICT diamond itself is fine. Test: new `36_account_deletion.test.sql` (member deletion, then owner deletion, with every Phase 2 table populated, and zero rows left). |
| D-WR-09 | fixed | `0487d16` | A null `p_end_date` or `p_effective_from` raises 22023. `p_effective_from` earlier than the start of the current month minus 12 months raises 22023, and an earlier date is clamped up to `anchor_date`. Test: `28` section 16. |
| D-IN-01 | fixed | `842274a` | `check_transfer_pair` counts legs in `new.household_id` only. A leg in another household is still rejected, because each household's group then holds a lone leg. Test: `33` section 11. |
| D-IN-02 | fixed | `c4fdd16` | `undo_log.ops` check adds `octet_length(ops::text) <= 2097152` (2 MB). Test: `29`. |
| D-IN-03 | fixed | `96564a2` | The purge only honours steps whose owner is a member of the row's household. Test: `29` section 13 (an outsider's step). |
| D-IN-04 | fixed | `2ba1111` | `recurring_occurrence_date`/`recurring_horizon` are revoked from `public, anon`. Test: `28` section 17. |
| D-IN-05 | fixed | `251d290` | The series RPC `conflict` goes through `parseConflict`, so `serverRow` is an `UndoConflict`. Test: `recurringSeries.test.ts`. |
| D-IN-06 | fixed | `180d8b6` | New check `recurring_series_anchor_range` (`anchor_date >= 1900-01-01`). `materialise_series` starts at a computed `n_start`, and the 5000-step guard is relative to it. If the guard trips, `materialised_through` only advances to the last processed date (with `raise warning`). Test: `28` section 18. |
| D-IN-07 | not applicable (notes) | - | Ordering, locking and backfill are notes with nothing to change. The pg_trgm-in-another-schema check belongs in the push preflight script (out of this task's scope), so it is left for the Phase 2 push task (02-31). |

### D-CR-01 approach (how series undo now treats system-added rows)

A stored series step is a fixed op list, but the daily materialiser keeps adding occurrences after it. The choice follows D-24 (system actions never enter the stack) and D-26 (refuse rather than clobber, including after a "system job"):

- **Undo of a series create.** Every live occurrence of the series that the step does not reference must have been added by the materialiser, because any user change to the series bumps its version, which `apply_patches` already refuses. If all of those rows are still untouched system rows (pending, version 1), they are soft-deleted together with the series, so the undo still works after a month boundary and nothing is left attached to a deleted series. If a user has acted on one of them (paid, skipped or edited it), the step is **refused**, naming that transaction.
- **Undo of a template edit or end.** If the materialiser has added rows since the step (the series `generation` moved), those rows were built from the template the undo would revert, and a fixed op list cannot rebuild them. The step is **refused**, naming the series with `updated_by = null` (the system), which is exactly D-26's "or a system job" case. Before the next materialisation, the undo works as before.
- **Not chosen:** re-running the regeneration inside an `undo_recurring_series_edit` RPC. It could resurrect occurrences the user deleted (tombstones sit outside the unique index), and it makes undo produce new rows. Refusing is the conservative, declared behaviour.
- **Known limit:** an edit or end of a series stops being undoable after the next month boundary on which the materialiser adds rows. The History copy for a series refusal with a null `updated_by` should say the app itself has since scheduled newer occurrences.

### Follow-ups for the orchestrator (outside src/db)

1. **src/data, series mutations (plan 02-18):** pass a `SeriesUndoLabel` (`{id, labelKey, labelParams}`) to `createRecurringSeries`, `editRecurringSeriesFrom` and `endRecurringSeries`, and do **not** call `insertUndoStep` or `inverseOfSeriesChange` for those actions. The server now records the step atomically (D-WR-04). Keep the same step id across paused-mutation replays, because it is the replay key (D-WR-03).
2. **src/data, every `applyPatches` caller:** a replay is only recognised when the call carries its undo step (the step id is the key). Any forward write sent without a step will still self-conflict on replay.
3. **src/ui History copy:** a refusal with `entity = 'recurring_series'` and `updated_by = null` means the system added occurrences since (D-CR-01). A refusal produced by D-WR-02 has `updated_by = null`/`record_name = null` and names the step's first op.
4. **Compliance phase:** decide whether to add a hard retention ceiling for tombstones (D-WR-06), and whether to document it in the privacy policy.
5. **02-31 push preflight:** check that `pg_trgm` is either absent or installed in `extensions` before `db push` (D-IN-07).

# Phase 02 (Record) Waves 1-5, Area B: DB schema, RPCs and typed db layer

**Reviewed:** 2026-09-28
**Depth:** deep (security focus)
**Status:** issues_found (all fixed 2026-10-06; see Fix status above)

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
