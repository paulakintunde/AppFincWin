# Phase 8: Household - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 34 new or modified (grouped)
**Analogs found:** 32 / 34 (two have no codebase analog: Realtime channel code, web/anon summary page)

All paths are relative to `C:\dev\fincwin-h8`. Excerpts are short on purpose; open the analog for the rest.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/2026111x_household_privacy_wave1.sql` (is_shared, policies, views, RPC rewrites, backfill) | migration | CRUD / RLS | `20261012000100_category_rules.sql` (personal/shared policies) + `20261016000100_decide_tables.sql` (owner-private) | role-match |
| `..._household_members_v2.sql` (weight 0, `is_owner`, `role_label`, `colour_key`, `name_hidden`) | migration | CRUD | `20260922000100_household_of_one.sql` (table being altered) | exact (same table) |
| `..._household_invites.sql` (invites, `redeem_attempts`, create/cancel/redeem RPCs) | migration | request-response | `20260924000600_fx_monitoring.sql` L234-270 (`fx_resolve_calls`) + `handle_new_user` | role-match |
| `..._household_splits.sql` (`transaction_splits`, `paid_by`, `household_amount`, category defaults) | migration | CRUD | `20260924000400_transactions.sql` (grants, triggers) + `20260924000500_fx_stamping.sql` | role-match |
| `..._household_settlements.sql` (settlements, lines, confirm RPC, cron lapse) | migration | event-driven / batch | `20261103000600_decide_purge_job.sql` (cron) | role-match |
| `..._household_leave_remove_delete.sql` (leave/remove/transfer, `before delete on auth.users`) | migration | CRUD | `20260922000100` `handle_new_user` (auth.users trigger) | partial |
| `..._household_realtime.sql` (publication, replica identity, `household_events`) | migration | pub-sub | none in repo | none |
| `..._apply_patches_v4.sql` (allow-list + creator-only rules for `is_shared`, `paid_by`) | migration | request-response | `20261028001100_apply_patches_v3.sql` | exact |
| `supabase/tests/database/79..9x_*.test.sql` (two-user RLS, invite, settlement, deletion) | test | request-response | `02_rls_isolation.test.sql`, `22_fx_resolve_rate_limit.test.sql`, `36_account_deletion.test.sql` | exact |
| `supabase/functions/delete-account/{index.ts,deno.json,*.test.ts}` | edge function | request-response | `supabase/functions/resolve-rate/index.ts` (+ `config.toml` entry) | role-match |
| `src/engine/split/allocate.ts` (allow 0 weights) | utility | transform | itself | exact |
| `src/engine/household/*` (balances per pair, `memberLabel`, `owedToMe`, `mySharePicture`, weight rebalance) | engine | transform | `src/engine/split/allocate.ts`, `src/engine/decide/share.ts` | role-match |
| `src/engine/split/__tests__/*` (fast-check zero-weight, sums) | test | transform | `src/engine/split/__tests__/allocate.test.ts` | exact |
| `src/data/realtime/{channel.ts,reconcile.ts}` + `npm run test:realtime` spike | service | pub-sub | none (no `postgres_changes` in `src/`); wipe hook from `src/data/queryClient.ts` | none |
| `src/db/household.ts` (extend), `src/db/householdMembers.ts`, `householdInvites.ts`, `settlements.ts`, `transactionSplits.ts` | db access | CRUD / RPC | `src/db/categoryRules.ts`, `src/db/household.ts` | exact |
| `src/db/errors.ts` (`WriteEntity` additions) and `src/db/rows.ts` row types | config/types | n/a | existing union | exact |
| `src/data/queries/household*.ts`, `src/data/keys.ts` | query hook | CRUD | `src/data/queries/household.ts`, `categoryRules.ts` | exact |
| `src/data/mutations/household*.ts`, `settlements.ts`, `index.ts` registration | mutation | CRUD (paused queue) | `src/data/mutations/categoryRules.ts` | exact |
| `src/data/exportManifest.ts` | config | n/a | itself (`EXPORT_MANIFEST`, `NOT_USER_DATA`) | exact |
| `src/config/householdFeatures.ts` (D-44) | config | n/a | `src/config/env.ts` (typed module) | partial |
| `src/features/household/*` screens and sheets | component | request-response | `src/features/record/accounts/AccountSheet.tsx`, `src/features/you/YouScreen.tsx`, `src/ui/ConfirmSheet.tsx`, `src/ui/ToggleRow.tsx` | role-match |
| `app/(app)/household/*.tsx` routes | route | request-response | `app/(app)/you.tsx`, `app/(app)/accounts/` | exact |
| You screen "Household" and "Delete my account" rows | component | request-response | `src/features/you/YouScreen.tsx` | exact |
| Invite deep link handler (`fincwin://invite?...`) | hook | event-driven | none specific (`expo-linking` not confirmed installed) | none |
| `src/features/decide/settings/settingsRows.ts` (drop `share_pct`) + `decide_settings` migration | migration/component | CRUD | `20261028000100_decide_settings_v3.sql` | exact |
| Decide wiring (BO-07 point 6, behind 05.5 gate task) | engine | transform | `src/engine/decide/share.ts` (`SplitRule`, `myPart`) | exact |

## Pattern Assignments

### Wave 1 privacy migration (migration, RLS)

**Analog A, personal/shared policy shape:** `supabase/migrations/20261012000100_category_rules.sql` L83-95.
```sql
create policy "members read category rules" on public.category_rules for select to authenticated
  using ((scope = 'personal' and owner_id = (select auth.uid()))
      or (scope = 'shared' and household_id in (select public.user_household_ids())));
```
**Analog B, owner-private shape:** `20261016000100_decide_tables.sql` L87-90 (`created_by = (select auth.uid()) and household_id in (select public.user_household_ids())`).

**Current policy to replace** (`20260924000400_transactions.sql` L108-116): `members read household transactions` is `household_id in (select public.user_household_ids())` only. The new form (RESEARCH Pattern 1) is that plus `and (is_shared or created_by = (select auth.uid()))`.

**Grant discipline to copy** (same file L118-122): `revoke insert, update, delete, truncate ... from authenticated; grant select ...; grant insert (cols...) ...; grant update (cols...) ...`. New columns (`is_shared`, `paid_by`) go in column grants only if the client may write them; D-14/D-15 say creator-only changes go through `apply_patches`/RPC.

**Rules for the planner**
- Every `security definer` function referencing `user_household_ids()` needs the same predicate (inventory with `grep -rn user_household_ids supabase/migrations`).
- Views `transactions_active`, `statement_periods_live` must stay `security_invoker = true` when re-created.
- Backfill `created_by` from `households.owner_id` where null BEFORE switching policies.
- D-43: `statement_periods` visibility derives from its account (`exists (select 1 from accounts a ...)`), not published to Realtime.

### `..._apply_patches_v4.sql` (migration, request-response)

**Analog:** `supabase/migrations/20261028001100_apply_patches_v3.sql`. The entity allow-list appears literally at L22 (trigger), L101, L137; the per-entity authorisation `if/elsif` chain is L231-262. Excerpt of the chain to extend:
```sql
elsif v_entity in ('transactions', 'recurring_series', 'accounts') then
  if not ((v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
    raise exception 'apply_patches: op % is not in a household the caller belongs to', v_idx using errcode = '42501';
```
This branch is household-only: it is a leak path (member B can patch or probe A's personal row, and the refusal payload echoes `record_name`; RESEARCH Pattern 1). Replace with `(is_shared or created_by = auth.uid())`, and add the D-14 creator/payer-only column rule for amount/date/note. `debts`, `recurring_dismissals`, `income_payer_prompts` (L254-258) are household-scoped and must also change. Also note L107 does `select to_jsonb(t) ... where id = $1` before any authorisation; the not-found/refusal payload must not reveal another member's personal row.

### `..._household_invites.sql` (migration, request-response)

**Analog (rate limiter):** `20260924000600_fx_monitoring.sql` L234-270: table with `(user_id, window_start)` PK, RLS enabled, `revoke all ... from anon, authenticated`, a service-role-only upsert-counter function. Copy the table/RLS/revoke shape for `redeem_attempts`; difference: invite redemption is called by `authenticated`, so the function is `security definer` and returns `jsonb {ok:false,reason}` on failure instead of raising (a raise rolls back the attempt insert; RESEARCH Pitfall 4).

**Analog (RPC hardening):** `handle_new_user` in `20260922000100_household_of_one.sql` L96-120.
```sql
create or replace function public.handle_new_user() returns trigger language plpgsql
security definer set search_path = '' as $$ ...
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```
For client RPCs flip the last line to `revoke ... from public, anon; grant execute ... to authenticated;` as `user_household_ids()` does (L88-89). Always fully qualify `public.` and `extensions.digest`.

**Membership writes:** `household_members` has `revoke insert, update, delete, truncate ... from authenticated` (L146); all membership changes are RPCs. The existing `role in ('owner','member')` and `weight > 0` checks (L33-34) need drop/replace in the v2 migration (`is_owner boolean`, `role_label text check (char_length <= 24)`, `weight >= 0`, plus a guard that at least one weight is > 0). Keep `bump_version()` trigger (L66-68) on any new versioned table.

**Test analog:** `22_fx_resolve_rate_limit.test.sql` (set role authenticated/service_role, `throws_ok(..., '42501')` for blocked paths, per-user counter independence). Assert the guess-futility numbers here (D-07 discretion).

### Two-user pgTAP suite (test)

**Analog:** `supabase/tests/database/02_rls_isolation.test.sql` L14-40 and `36_account_deletion.test.sql` L16-60.
```sql
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(N);
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-...', '00000000-...', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1111...","role":"authenticated"}', true);
```
How 36 makes a two-member household: a `create temp table hh as select owner_id, id from public.households; grant select on hh to authenticated;` then a direct `insert into public.household_members (...)` as the superuser BEFORE `set local role`. Phase 8 keeps this fixture style for B-joins-A's-household (the old `role` column insert in 36 L28 will break once `role` changes; update 36 and 01/02 tests, which assert `role = 'owner'`). Test numbering: last is `78_*`; RESEARCH says next free is 89, but the directory listing shows 78 as the highest, so confirm before naming (re-check `ls supabase/tests/database | tail`).

Each new test must cover, per table: B select, update, delete, RPC read, view read, patch-refusal payload, and A's `profiles` row invisible to B.

### `..._household_settlements.sql` cron (migration, batch)

**Analog:** `20261103000600_decide_purge_job.sql` (whole file). Idempotent schedule:
```sql
do $$ begin
  if exists (select 1 from cron.job where jobname = 'decide-purge-nightly') then
    perform cron.unschedule('decide-purge-nightly');
  end if;
end; $$;
select cron.schedule('decide-purge-nightly', '41 3 * * *', $$select public.purge_deleted_decide_rows()$$);
```
Function shape: `security definer`, `set search_path = ''`, `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`. Copy for hourly `lapse_settlements()` and the day-7 reminder; make the job idempotent (unique `(settlement_id, kind)` on events). Also compute effective lapsed state lazily in the read RPC.

### Account deletion trigger (migration) and `delete-account` Edge Function

**Trigger analog:** `handle_new_user` (`after insert on auth.users`, security definer, search_path empty, revoke all). The Phase 8 trigger is `before delete on auth.users`. It must do the owner handoff first because `households.owner_id references auth.users on delete cascade` (L22 of the household migration) would otherwise cascade-delete everyone's shared data.

**Erasure test analog:** `36_account_deletion.test.sql` header explains the RESTRICT diamond (transactions/series/accounts); extend it rather than writing a second harness. `70_decide_v3_erasure.test.sql` is the Decide-side erasure analog.

**Edge Function analog:** `supabase/functions/resolve-rate/index.ts` L1-45. Copy the JWT-derived caller pattern (never trust client-supplied user id), user client from the `Authorization` header, admin client from `SUPABASE_SERVICE_ROLE_KEY`:
```ts
const authHeader = req.headers.get('Authorization');
if (!authHeader) return json({ ok: false, error: 'unauthorized' }, 401);
const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
callerPromise ??= userClient.auth.getUser().then(({ data, error }) => (error || !data?.user ? null : data.user.id));
```
New function: `admin.auth.admin.deleteUser(callerId)`. Layout to copy: `index.ts` thin, logic in a separate `delete.ts` with injected deps and a `delete.test.ts` (see `purge-statement-uploads/{index,purge,purge.test}.ts`, `resolve-rate/{index,resolve,resolve.test}.ts`), plus `deno.json` (`{ "imports": {} }`) and a `supabase/config.toml` block:
```toml
[functions.resolve-rate]
verify_jwt = true
```
Import pin used by all functions: `npm:@supabase/supabase-js@2.116.0`.

Client side: after success call `wipeDeviceData()` (`src/services/storage/wipe.ts`) then sign out, reusing the flow in `src/features/auth/signOut.ts` (`requestSignOut`/`performSignOut`).

### `src/engine/split/allocate.ts` (utility, transform)

**Analog:** itself. The only change is the validation loop (L24-28):
```ts
for (const w of weights) {
  if (!Number.isInteger(w) || w <= 0) {
    throw new RangeError(`allocate: weight ${w} must be a positive integer`);
```
becomes `w < 0`, plus a new throw when all weights are 0 (the 04 D-15 guard; check how `resolveShare` in `src/engine/decide/share.ts` already guards: its doc says "Non-negative integer weights with a positive sum"). Update the existing test that expects a zero weight to throw (`allocate.test.ts` "throws RangeError on a zero weight"). Tie-break is index order, so callers must pass weights in `household_members.created_at` order; document and test that.

**Important existing code:** `src/engine/decide/share.ts` already defines `SplitRule` (`mine | even | weight | amount`), `ShareScope` (`personal | household` with `memberCount`, `myIndex`, `rule`), `resolveShare` and `myPart`, all delegating to `allocate`. Do NOT create a second rule type: `engine/household` and the line-share stored value must import or re-export this one (ARC-17). It imports `../split/allocate`, which is allowed (engine-internal).

**Test analog:** `src/engine/split/__tests__/allocate.test.ts` (plain `it` cases + `fast-check`). Add properties: sum of shares equals total; no negative share for non-negative total; zero-weight member is always 0; determinism. Engine gate: `npm run test:engine` (`jest -c jest.engine.config.js`); branch coverage threshold applies.

**Boundary:** nothing in `src/engine/household/` may import `db/`, `state/`, `services/`, `ui/` or `react`.

### `src/data/realtime/*` (service, pub-sub) and spike

**No analog** (no `postgres_changes` or `.channel(` in `src/`). Use RESEARCH Pattern 6 and its `reconcile(eventVersion, cacheVersion, hasPendingWrite)` sketch. Pieces to hook into, which do exist:
- Wipe on leave/remove/sign-out, `src/data/queryClient.ts` L36-60:
```ts
registerWipeHandler({ id: QUERY_WIPE_HANDLER_ID, async wipe() { bumpSessionEpoch(); queryClient.getMutationCache().clear(); queryClient.clear(); ... } });
```
Register a second handler (id e.g. `realtime-channels`) that calls `supabase.removeChannel` for each channel.
- Online/foreground refetch: `src/data/onlineManager.ts`; invalidate shared keys on every `SUBSCRIBED`.
- Version rules that decide conflicts server-side: `src/data/sync/versionChain.ts` (in-memory only) and `src/data/sync/failedWrites.ts`; classification in `src/data/sync/writeErrors.ts` ('conflict' is never retried).
- Cache key shape: `src/data/keys.ts` (`['transactions', householdId, month]` etc.). Patch with `setQueryData` using the helpers in `src/data/mutations/cacheRows.ts` (`upsertRow`).
- Client: `src/services/supabase/client.ts` (import `supabase` from `@/services/supabase`).

### `src/db/householdMembers.ts`, `householdInvites.ts`, `settlements.ts`, `transactionSplits.ts` (db access)

**Analog:** `src/db/categoryRules.ts` (L1-50). Conventions to copy:
- A `*_COLUMNS` string constant and a typed `*Row` interface.
- `*_INSERT_KEYS` / `*_UPDATE_KEYS` arrays that mirror the SQL grants exactly, enforced by `assertAllowedKeys` (from `./rows`) so a stray key fails offline instead of with 42501.
- Client-injected UUIDs; duplicate-id-safe insert (re-fetch by id on 23505); version-conditional update (`.eq('version', expected)` then `VersionConflictError` / `NotFoundError`).
- `import { toDbError } from './errors'; import type { DbClient } from './rows';`
- Errors: `throw toDbError(error, status)`.
RPC calls follow the same `client.rpc(...)` then `toDbError` shape; copy from `src/db/undoLog.ts` or `src/db/patches.ts` for RPC returning jsonb.

**Existing file to extend:** `src/db/household.ts` (`fetchCurrentHouseholdId`, `.from('household_members').select('household_id').eq('user_id', userId).limit(1).maybeSingle()`). Note `useHouseholdId` in `src/data/queries/household.ts` has `staleTime: Infinity` and a comment "nothing changes which household a user belongs to". Phase 8 invalidates that: join, leave, remove must `invalidateQueries({ queryKey: queryKeys.household(userId) })` and reset the cache. Update the comments.

**Guard that will fail until updated:** `src/data/__tests__/exportManifest.test.ts` scans `src/db/*.ts` for `.from('table')` and fails if the table is in neither `EXPORT_MANIFEST` nor `NOT_USER_DATA`. Every new table read from `src/db` needs a row in `src/data/exportManifest.ts` (shape: `table: ['col', ...]`; `household_members: ['household_id','user_id','display_name']` currently). Add `is_shared`, `paid_by` to `transactions`/`accounts` lists. Export must respect personal-vs-shared (B cannot export A's rows); that rides on RLS, add a test.

Also extend the `WriteEntity` union in `src/db/errors.ts` (L4-24) with each new patchable entity, and the SQL allow-lists in `apply_patches`.

### `src/data/mutations/household*.ts`, `settlements.ts` (mutation, paused queue)

**Analog:** `src/data/mutations/categoryRules.ts`. Full pattern per mutation:
```ts
qc.setMutationDefaults(mutationKeys.editRule, {
  mutationFn: (vars) => guardSession(vars, async () => {
    const expected = resolveExpectedVersion('category_rules', vars.id, vars.expectedVersion);
    const client = await writeClient();
    const row = await updateCategoryRule(client, vars.id, expected, vars.patch).catch(
      (err) => acceptIfAlreadyApplied<CategoryRuleRow>(err, vars.patch));
    recordWrittenVersion('category_rules', vars.id, [vars.expectedVersion, expected], row.version);
    const step = buildStep(vars.undo.stepId, vars.undo.labelKey, vars.undo.labelParams,
      inverseOfPatches('category_rules', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }]));
    await recordUndoStepSafely(qc, client, step, vars.ownerId);
    return row;
  }),
  scope: WRITE_SCOPE, retry: shouldRetryWrite, retryDelay: writeRetryDelay,
  onMutate: ..., onSuccess: ..., onError: async (err, vars) => { const cls = classifySettledWriteError(err); ... recordFailedWrite({...}) },
});
```
Imports to copy are at `categoryRules.ts` L6-33 (`expo-crypto`, `@tanstack/react-query`, `@/engine/undo` `buildStep/inverseOfInserts/inverseOfPatches`, `@/data/keys` `mutationKeys, queryKeys, WRITE_SCOPE`, `@/data/sync/{writeErrors,failedWrites,sessionEpoch,versionChain}`, `./writeClient`, `./cacheRows`, `./undoCapture`).
- Register in `src/data/mutations/index.ts` (one `registerXMutations(qc)` import and call; must run at module scope before persisted-cache restore).
- Add keys to `mutationKeys` / `queryKeys` in `src/data/keys.ts`.
- Settlement confirm and membership changes are RPCs, not patches: use the same wrapper but call `client.rpc`; confirm is NOT optimistic (D-19: money owed is not spendable until it arrives). Per RESEARCH Pattern 5 and D-42, undo of a confirmed settle-up is a server RPC (`undo_settlement`, 24h window) rather than `inverseOfPatches`; analog for server-side undo: `20261031000100_decide_outcome_server_undo.sql` and `78_decide_outcome_server_undo.test.sql`.
- Every named change ("Sam changed the split") goes through the undo log (`src/db/undoLog.ts`, `undo_log` table, `apply_patches`).

### `src/config/householdFeatures.ts` (config, D-44)

**Analog:** `src/config/env.ts` (typed, single module for runtime config, commented with decision ids) and `src/features/decide/entitlements.ts` (existing entitlement-style gate; read it before writing, it is the nearest "switch" precedent). Shape suggested by D-12/D-44:
```ts
export const HOUSEHOLD_FEATURES = {
  weightSplits: true, amountSplits: true, categoryDefaults: true, summaryLink: true,
} as const; // Phase 9 points these at the real entitlement
```
Add a unit test that asserts the key set and that all are `true` today.

### Household screens and sheets (component, request-response)

**Sheet analog:** `src/features/record/accounts/AccountSheet.tsx` (imports L5-37): `Sheet, SheetScroll` from `@/ui/Sheet`, `SheetHeader`, `Pill`, `Row`, `Chip`, `TextInput`, `useIsDirty`, `useT` from `@/i18n`, `useTheme` from `@/theme/ThemeProvider`, `radii, space` from `@/theme/layout`, `textRole` from `@/theme/typography`, `showToast` from `@/state/undoToast`, `getAnalytics`. Header comment convention: state the decision ids and "Copy is declarative, never advice."
**Confirm/destructive analog:** `src/ui/ConfirmSheet.tsx` props `{visible,title,body,children,cancelLabel,confirmLabel,destructive,onConfirm,onCancel}` for leave/remove/delete/"Not yet".
**Switch row:** `src/ui/ToggleRow.tsx` (`{label,value,onChange,disabled,accessibilityHint,accessibilityLabel}`) for the "Shared" switch and "show real name".
**Screen/route:** `src/features/you/YouScreen.tsx` (imports L7-38: `Screen`, `BackButton`, `useBackHistory`, `pushOnce`, `SettingsGroup`, `SyncStatusLine`) and the thin route file `app/(app)/you.tsx`:
```tsx
import { YouScreen } from '@/features/you/YouScreen';
export default function YouRoute() { return <YouScreen />; }
```
Rows are declared as typed const arrays with i18n key unions (`MONEY_ROWS`, L44-57); Household entry rows follow that pattern. All copy goes through `useT` keys; follow 08-UI-SPEC for strings. Member names go through ONE resolver `memberLabel(member, viewer)` in `src/engine/household/` (D-32); never read `profiles.full_name` for other users.
Other UI primitives available: `Chip`, `Pill`, `SwatchDot` (member colours), `SegmentedToggle` (Mine/Household figures toggle), `WarningCard`, `EmptyState`, `Dropdown`, `OptionPicker` (`features/record/entry/pickers`), `ToastView` + `showToast`.
Design tokens only (`src/theme`): no extra colours, no gradients (CLAUDE.md design fidelity).

### Decide wiring (engine, behind the 05.5 gate)

**Analog:** `src/engine/decide/share.ts` (SplitRule/ShareScope/myPart) and `src/engine/decide/ownership.ts` L33-40 (`myPart(planTotal, verdict.context.purchaseShare)`). Removal of `decide_settings.share_pct` touches: migration `20261028000100_decide_settings_v3.sql`, `src/db/decideSettings.ts`, `src/data/mutations/decideSetup.ts`, `src/features/decide/settings/settingsRows.ts` L40 and L194-195, its test `settingsRows.test.ts`, and `exportManifest.ts`. Order: add new source, switch reads, then drop the column (RESEARCH Pattern 9). First task of these plans: confirm 05.5 landed (`countsForMe` is not in `src/` as of mapping).

## Shared Patterns

### Security-definer function hardening
**Source:** `supabase/migrations/20260922000100_household_of_one.sql` L78-90 and L96-125; `20261103000600_decide_purge_job.sql`.
**Apply to:** every new RPC and trigger function.
`security definer`, `set search_path = ''`, fully qualified names, then `revoke execute on function ... from public, anon;` plus either `grant ... to authenticated` (client RPC) or `to service_role` (cron). Trigger functions revoke from all client roles. Use `(select auth.uid())` initPlan form (comment L5-7).

### Version-checked writes, never last-write-wins
**Source:** `bump_version()` (household migration L12-22) wired as `create trigger set_version before update on ... for each row execute function public.bump_version();`; client side `src/data/sync/versionChain.ts`, `writeErrors.ts` ('conflict' class). Also `set_updated_by` trigger as in `decide_tables.sql` L75-76.
**Apply to:** every new mutable table (`transaction_splits`, `settlements`, `household_category_rules`, member rows).

### Column-grant discipline
**Source:** `20260924000400_transactions.sql` L118-122 (revoke whole-table writes, grant explicit columns); mirrored by `*_UPDATE_KEYS` in `src/db/*.ts`.
**Apply to:** all new tables and the new columns on old ones. Server-only columns (stamps, `household_amount`, `is_settlement`) are never client-grantable (D-39 stamps via the existing FX stamping path in `20260924000500_fx_stamping.sql` / `20261007000400_fx_on_demand_stamping.sql`).

### Soft delete, no hard delete on published tables
**Source:** `deleted_at` convention across transactions, decide_*; purge by cron (`decide_purge_job`).
**Apply to:** anything in the Realtime publication (DELETE events bypass RLS).

### Typed errors and write classification
**Source:** `src/db/errors.ts` (`toDbError`, `VersionConflictError`, `NotFoundError`), `src/data/sync/writeErrors.ts` (`REJECTED_CODES` includes 42501, 23514, 23503). New refusal SQLSTATEs (locked line, D-15 make-private refused) must be mapped in `writeErrors.ts` and `src/ui/failedWriteLabels.ts`.

### Wipe on membership change / sign-out
**Source:** `src/services/storage/wipe.ts` `registerWipeHandler`, used in `src/data/queryClient.ts`.
**Apply to:** realtime channels, shared-cache wipe on leave/remove/delete.

### Test conventions
- DB: pgTAP via `supabase test db` (CI `ci.yml` L79). Wrap in `begin;` ... rollback is implicit at end, `extensions.plan(N)`, `extensions.is/ok/throws_ok`.
- Engine: Jest + fast-check, `npm run test:engine`.
- Edge: Deno tests beside the function, deps injected (see `purge.test.ts`).
- Realtime spike: separate Jest config / `npm run test:realtime`, not in the default run.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/data/realtime/*` | service | pub-sub | No Realtime code or publication entries exist; use RESEARCH Pattern 6 plus the spike |
| `..._household_realtime.sql` | migration | pub-sub | No `supabase_realtime` publication changes in any migration |
| Invite deep-link handler | hook | event-driven | `expo-linking` not confirmed installed (grep `package.json`); app scheme `fincwin` is in `app.config.ts`. D-38: custom scheme plus typed code only, no web page, no universal links |
| `household_summary` anon RPC and read-only summary output (HH-12) | service | request-response | No anon-callable function exists today (every function revokes `anon`); D-38 removes the web page, so decide the delivery surface (in-app share of a token link vs. a hosted page) with the owner before planning |

## Conflicts and Traps Found While Mapping

1. `src/data/queries/household.ts` and `src/db/household.ts` assert "one household, immutable, staleTime Infinity". Joining/leaving breaks this; invalidate on every membership change.
2. Existing pgTAP files `01_household_of_one`, `02_rls_isolation`, `36_account_deletion` insert/assert `role = 'owner'/'member'`; they break when `role` is replaced by `is_owner` + `role_label`.
3. `apply_patches` (`20261028001100`) authorises `transactions/recurring_series/accounts/debts/recurring_dismissals/income_payer_prompts` by household only, a read/patch-refusal leak for personal rows (L107, L235-258).
4. `households.owner_id ... on delete cascade` (household migration L22) wipes shared data on owner deletion; the `before delete on auth.users` handoff must come first.
5. `SplitRule` already exists in `src/engine/decide/share.ts`; reuse it.
6. Highest existing pgTAP file is `78_decide_outcome_server_undo.test.sql` in this worktree (RESEARCH said 88 files, next 89); confirm numbering at plan time.

## Metadata

**Analog search scope:** `supabase/migrations`, `supabase/tests/database`, `supabase/functions`, `src/engine/{split,decide}`, `src/db`, `src/data/{mutations,queries,sync}`, `src/features/{you,record/accounts}`, `src/ui`, `src/config`, `app/(app)`.
**Files scanned:** about 45 (targeted reads, no re-reads).
**Pattern extraction date:** 2026-11-10
