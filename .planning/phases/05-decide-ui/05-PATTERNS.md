# Phase 5: Decide UI - Pattern Map

**Mapped:** 2026-10-15
**Worktree:** `C:/dev/fincwin-04ctx` (all paths below are relative to it)
**Files analyzed:** 58 new/modified (grouped into 14 classes below)
**Analogs found:** 52 / 58

> **Engine is not built.** `src/engine/decide/` and `src/engine/payoff/` do not exist. No `04-PHASE5-ALIGNMENT.md` exists. Every engine name below comes from `.planning/phases/04-decide-engine/04-05-PLAN.md` (types block, lines 110-419) and `04-12-PLAN.md` (barrel, lines 61-78). Import only from `@/engine/decide` (the barrel), never from a deep path.

---

## Engine contract Phase 5 codes against (from 04-05 / 04-12, not code)

Barrel entry points (04-12-PLAN.md L64-77):
```typescript
assess(snapshot, check): Verdict
prepareContext(snapshot): ContextResult
buildOptions(context, check, assessment): readonly DecideOption[]
buildAlternatives(context, check, assessment, cheaperRatioPercent?): Alternatives
applySetbacks(assessment, setbacks): SetbackReport          // + DEFAULT_SETBACKS
affordablePrice(context, check): AffordablePrice
firstRead(figures, check): FirstRead
monthlyEquivalent(amount, freq); nextDueDate(bill); billsDueWithin(bills, asOf, horizonDays)
resolveSpendingShare(scope, householdSpending)
purchaseSize(context, price): PurchaseSize
suggestItemType(name): ItemType; suggestSecured(name): boolean   // step-1 pre-fill ONLY
MARKET_DEFAULTS, minimumTermsFromDefaults                        // snapshot-builder data
percent, ZERO_PERCENT (values); Percent, CardMinimumTerms (types) // re-exported from payoff
// also via export *: resolvePriceInputs / netRunningCosts (04-06, D-37)
```

Key types (04-05-PLAN.md): `DecideSnapshot` L166-181, `RecordLine` L114-125, `MonthRecord` L130-134, `RecurringBill` L135-146, `DebtRecord` L147-152, `CardRecord` L153, `DecideLimits` L156-163, `BuyPayment` L186-190, `BuyCheck` L192, `PriceAdjustment`/`PriceInputs` L195-202, `CostLine`/`RunningCosts` L210-211, `InvestCheck` L212, `PlanReason` L216-218, `Plan` L227-239 (`finalMonthly` for the D-09 series), `VerdictState` L274, `WarningCode` L275, `MissingReason` L277, `BasisMarker` L278, `PurchaseSize` L283, `Assessment` L329-350, `Verdict` L351, `DecideOption` L355-361, `AlternativeCode`/`SuppressionCode` L365-366, `Alternatives` L382-388, `SetbackInput`/`SetbackReport` L392-399, `WaitPlan` L402-409, `RoughFigures`/`FirstRead` L412-419.

Code unions the copy maps must cover exhaustively (`satisfies Record<Code, string>`):
- `VerdictState = 'fits'|'adjust'|'no'|'missing'`
- `WarningCode = 'month'|'cash'|'dsr'|'owe'|'inv'`
- `PlanReason = 'card_not_accepted'|'card_missing'|'card_apr_missing'|'card_minimum_terms_missing'|'dealer_cap_missing'|'loan_term_missing'|'loan_apr_missing'|'instalment_amount_missing'|'instalment_count_missing'|'invest_term_missing'`; `MissingReason = PlanReason | 'no_full_month'|'split_weights_zero'|'split_amounts_zero'`
- `SuppressionCode = 'month_short'|'too_thin'|'nothing_freed'|'past_horizon'|'nothing_spare'`
- `AlternativeCode = 'as_planned'|'cheaper'|'wait_and_save'|'skip'`
- `OptionCode = 'affordable_price'|'longer_term'|'cut_line'|'earn_more'|'save_first'|'do_without'`
- `PurchaseSize = 'from_spare_this_month'|'from_savings'|'needs_spreading'`
- `SetbackCode = 'unexpected_expense'|'income_drop'|'job_loss'|'late_invoice'`; `CashOutcome = 'absorbed'|'through_cushion'|'wiped_out'`
- `Steadiness = 'steady'|'variable'|'volatile'|'insufficient'`; `LedgerCode`, `LedgerDirection`
- `BasisMarker = 'logged_months'|'first_read_rough_figures'`; `BasisFactCode = 'debt_rate_exceeds_return'`

**`Percent` is a bigint** (04-01). It must never enter query data, mutation variables or `decide_checks.inputs` (the persister and paused-mutation dehydration are JSON). Store APR/tax/return as decimal strings and call `percent(str)` at the engine boundary.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| **Migrations / SQL** | | | | |
| `supabase/migrations/2026101x_decide_tables.sql` (`decide_checks`, `decide_settings`, `decide_links`, `debts`) | migration | CRUD + RLS | `supabase/migrations/20261012000100_category_rules.sql` | exact |
| `supabase/migrations/2026101x_decide_patches.sql` (`undo_log_fill` + `apply_patches` full re-create adding `decide_checks`, `debts`, `decide_links`) | migration | undo / patch | `supabase/migrations/20261012000200_category_rules_patches.sql` | exact |
| `supabase/migrations/2026101x_decide_go.sql` (`record_decide_go`, `record_decide_wait`, `record_decide_pass` RPCs) | migration (definer RPC) | batch, one undo step | `supabase/migrations/20261012000300_entry_list.sql` | exact |
| `supabase/migrations/2026101x_decide_demo_seed.sql` (versioned `seed_sample_data` / `clear_sample_data`) | migration (definer RPC) | batch seed | `supabase/migrations/20261010000600_sample_data.sql` | exact |
| `supabase/migrations/2026101x_statement_periods.sql` (optional, OQ3) | migration | CRUD | `20261012000100_category_rules.sql` | role-match |
| `supabase/tests/database/5x_decide_*.test.sql` | test (pgTAP) | RLS / RPC | `supabase/tests/database/51_category_rules.test.sql`, `53_entry_list.test.sql`, `52_category_rules_patches.test.sql` | exact |
| **db layer** | | | | |
| `src/db/decideChecks.ts` | db module | CRUD | `src/db/categoryRules.ts` | exact |
| `src/db/decideSettings.ts` | db module | CRUD (per user, unconditional) | `src/db/recordPrefs.ts` | exact |
| `src/db/debts.ts`, `src/db/decideLinks.ts` | db module | CRUD | `src/db/categoryRules.ts` | exact |
| `src/db/decideGo.ts` (RPC wrappers) | db module | RPC request-response | `src/db/entryList.ts` | exact |
| `src/db/samples.ts` (modify: new counts) | db module | RPC | itself | exact |
| **data layer** | | | | |
| `src/data/keys.ts` (modify) | config | — | itself L5-54, L56-94 | exact |
| `src/data/queries/decide.ts` (`useDecideSnapshot`, `useChecks`, `useDecideSettings`, `useDebts`) | query hook | read / cache | `src/data/queries/categoryRules.ts`, `src/data/queries/recurringSeries.ts`, `src/features/home/useHomeViewModel.ts` | exact |
| `src/data/mutations/decideChecks.ts` (autosave upsert, abandon, remove) | mutation | write queue + undo | `src/data/mutations/categoryRules.ts` | exact |
| `src/data/mutations/decideGoAhead.ts` | mutation | batch, one undo step | `src/data/mutations/bulkAdd.ts` | exact |
| `src/data/mutations/decideSettings.ts` (limits, rough figures) | mutation | unconditional write | `src/data/mutations/recordPrefs.ts` | exact |
| `src/data/mutations/index.ts` (modify) | config | — | itself L29-60 | exact |
| `src/data/mutations/sampleData.ts` (modify: invalidate decide keys) | mutation | online RPC | itself L24-34 | exact |
| **Pure feature logic** | | | | |
| `src/features/decide/snapshot/buildSnapshot.ts`, `fullMonths.ts`, `toCheck.ts` | utility (pure) | transform | `src/features/home/comingUp.ts` + `src/data/queries/homeAmount.ts` | role-match |
| `src/features/decide/copy/{verdictCopy,warningCopy,suppressionCopy,sizeCopy,optionCopy,reasonCopy}.ts` | utility (pure) | transform (code→key) | RESEARCH Pattern 8 (no in-repo code→key map with `satisfies`); nearest `src/features/record/history/undoCopy.ts` | partial |
| `src/features/decide/quickParse.ts`, `offsets.ts`, `estimateActual.ts`, `inputsSchema.ts` | utility (pure) | transform | `src/features/home/comingUp.ts` (pure helper + `__tests__`) | role-match |
| `src/features/decide/entitlements.ts` (`canUse`) | utility | — | `src/shell/tabBar/availableTabs.ts` (pure switch) | role-match |
| **Screens / components** | | | | |
| `app/(app)/(tabs)/decide.tsx` | route | — | `app/(app)/(tabs)/home.tsx` | exact |
| `app/(app)/decide/check/[id].tsx` | route | — | `app/(app)/accounts/[id].tsx` | exact |
| `app/(app)/decide/past.tsx` | route | — | `app/(app)/history.tsx` | exact |
| `app/(app)/setup/rough.tsx`, `app/(app)/setup/first-check.tsx` | route | — | `app/(app)/setup/history.tsx` | exact |
| `app/(app)/_layout.tsx` (modify: Stack.Screens + notification observer) | layout | — | itself L51-66 | exact |
| `src/features/decide/home/DecideHomeScreen.tsx` | component (tab root) | read | `src/features/home/HomeScreen.tsx` | exact |
| `src/features/decide/home/{QuickCheckCard,YourMonthCard,OpenChecksCard,LinesCard}.tsx` | component (card) | read + write | `src/features/home/ThisMonthCard.tsx` | role-match |
| `src/features/decide/check/CheckFlowScreen.tsx` + `steps/Step1..Step5.tsx` | component (outer-stack flow) | read + autosave | `src/shell/screen/DetailScreen.tsx` (chrome) + `src/features/record/import/ImportScreen.tsx` (multi-step outer flow) | role-match |
| `src/features/decide/check/{VerdictCard,StateChip,WarningCard,CollapsibleSection,StepBar,ChoiceCard,CheckRow,FigureStrip,SpreadLine,OptionRow}.tsx` | component (primitive) | — | `src/ui/Chip.tsx`, `src/features/you/components/FontPairingSwitcher.tsx` (radio) | role-match |
| `src/features/decide/check/StepSlider.tsx` | component | gesture | `src/ui/Sheet.tsx` L230-260 (`Gesture.Pan` + shared values) | partial |
| `src/features/decide/past/{PastDecisionsScreen,DecisionDetailSheet}.tsx` | component | read | `src/shell/screen/DetailScreen.tsx`, `src/ui/DetailSheet.tsx`, `src/ui/ConfirmSheet.tsx` | exact |
| `src/features/decide/onboarding/{RoughFiguresScreen,FirstCheckScreen}.tsx` | component (setup step) | write + read | `src/features/record/setup/SetupHistoryScreen.tsx` | exact |
| `src/features/record/setup/SetupAccountScreen.tsx` (modify: onSaved → `/setup/rough`) | component | — | itself L43 | exact |
| `src/features/decide/DecideShellHost.tsx` (quick action `newCheck`) | component (host) | event | `src/features/record/entry/ShellEntryHost.tsx` | exact |
| `src/features/record/entry/pickers/DateField.tsx` (modify: clamp past dates) | component | — | itself L37-40 | exact |
| **Shell / config / services** | | | | |
| `src/shell/tabBar/availableTabs.ts` (+ its test L8, L22) | config | — | itself L11-17 | exact |
| `src/features/navigation/swipeBackGesture.ts` | config | — | itself L29 | exact |
| `src/services/analytics/catalogue.ts` | config | — | itself L10-60 | exact |
| `src/i18n/locales/en.ts`, `src/i18n/copyStatus.ts` | config (copy) | — | `copyStatus.ts` L126-134 (`leafPaths`) | exact |
| `src/i18n/__tests__/decideCopy.test.ts` | test | — | `src/i18n/__tests__/catalogue.test.ts` | exact |
| `src/engine/undo/types.ts` (modify `UndoEntity`, `UNDO_LABEL_KEYS`) | model | — | itself L14, L32 | exact |
| `src/features/decide/notifications/{waitReminder,useNotificationObserver}.ts` | service | event-driven | **none** (expo-notifications not installed) | no analog |
| wipe registration for notifications | service | — | `src/services/storage/wipe.ts` L24-29 | exact |
| `app.config.ts` (add `expo-notifications` plugin) | config | — | — | trivial |
| `jest.config.js` (100% on `src/features/decide/snapshot/`) | config | — | itself L37-42 | exact |
| `.dependency-cruiser.cjs` (extend `fx-fetch-never-from-reads` `from` to `^src/features/decide/`) | config | — | itself L31-36 | exact |
| `scripts/gen-decide-demo-mirror.mjs` (`--check`) + `package.json` script | script | — | `scripts/gen-recurring-mirror-test.mjs`, `package.json` L99-100 | exact |
| **Tests** | | | | |
| `src/data/mutations/__tests__/decide*.test.tsx` | test | — | `src/data/mutations/__tests__/categoryRules.test.tsx`, `bulkAdd.test.tsx` | exact |
| `src/features/decide/**/__tests__/*.test.ts(x)` | test | — | `src/features/home/__tests__/*` (`comingUp.test.ts`, `HomeScreen.test.tsx`) | exact |
| `src/features/decide/__tests__/demoScenario.test.ts` | test (engine-backed) | — | none in repo (needs real engine) | no analog |

---

## Pattern Assignments

### `supabase/migrations/2026101x_decide_tables.sql` (migration, CRUD + RLS)

**Analog:** `supabase/migrations/20261012000100_category_rules.sql`

**Table shape: client uuid, cascade FKs, soft delete, version** (L11-36):
```sql
create table public.category_rules (
  id uuid primary key,                                               -- client-generated (MON-08)
  ...
  owner_id uuid references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  keyword text not null check (char_length(btrim(keyword)) between 1 and 60),
  ...
  deleted_at timestamptz,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
```
For Decide: use `created_by uuid not null default auth.uid() references auth.users(id) on delete cascade` (owner-private, PLANNING-NOTES OQ5) so account deletion purges (RESEARCH Security, GDPR).

**Server-pinned ownership triggers** (L45-80): copy `fill_category_rule` (before insert: pin `created_by`/`updated_by` from `auth.uid()`) and `guard_category_rule` (before update: `new.id := old.id; new.household_id := old.household_id; new.created_at := old.created_at; new.updated_at := now();`), then:
```sql
create trigger set_version before update on public.category_rules
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.category_rules
  for each row execute function public.set_updated_by();
```
Each trigger function: `security definer set search_path = ''` and `revoke execute ... from public, anon, authenticated;`.

**RLS + column grants** (L82-105):
```sql
alter table public.category_rules enable row level security;
create policy "members read category rules" on public.category_rules for select to authenticated
  using (...);
...
revoke all on public.category_rules from anon;
revoke insert, update, delete, truncate on public.category_rules from authenticated;
grant select on public.category_rules to authenticated;
grant insert (id, scope, household_id, keyword, ...) on public.category_rules to authenticated;
grant update (keyword, keyword_norm, ..., deleted_at) on public.category_rules to authenticated;
```
Decide-specific grants (RESEARCH L479-482): `status`, `decided_at`, `estimate_*`, `verdict_at_decision`, `wait_monthly`, `ready_by` and `is_sample` are **not** in any client grant; only the `record_decide_*` definer RPCs write them. No `delete` grant anywhere (soft delete).

**Bounds:** `jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) < 32768`; amounts `abs(x) <= 10000000000000`; enum `check (... in (...))` for `status`, `last_seen_state`, `last_seen_basis`, `kind`.

---

### `supabase/migrations/2026101x_decide_patches.sql` (undo allow-list extension)

**Analog:** `supabase/migrations/20261012000200_category_rules_patches.sql`. Header convention (L1-9): "copied IN FULL from ... and changed only where marked `05`". Every one of these five places must be extended (RESEARCH Pitfall 5):

1. `undo_log_fill` entity list (L27):
```sql
or (coalesce(e ->> 'entity', '') not in ('transactions', 'categories', 'recurring_series', 'accounts', 'category_rules') -- 02.3
```
2. `apply_patches` pre-read entity check (L104) and main entity check (L135).
3. Allowed-columns `case` (L159-171):
```sql
v_allowed := case v_entity
  ...
  when 'category_rules' then array['keyword', 'keyword_norm', 'category_id', 'target_builtin_key', 'target_name', 'deleted_at']  -- 02.3
end case;
```
4. Ownership branch (L208-225), e.g. add `elsif v_entity in ('decide_checks','debts','decide_links') then` requiring `created_by = auth.uid()` and `household_id in user_household_ids()`.
5. Column type map (L257-304): `when 'category_rules.deleted_at' then 'timestamptz'  -- 02.3` (add `decide_checks.deleted_at`, `decide_checks.status`, `debts.deleted_at`, `decide_links.deleted_at`, ...).

Also `record_name` on conflict (L234): `coalesce(v_row_json ->> 'name', v_row_json ->> 'keyword')` already covers `decide_checks.name` and `debts.name`.

**Test analog:** `supabase/tests/database/52_category_rules_patches.test.sql` / `44_record_polish_patches.test.sql`.

---

### `supabase/migrations/2026101x_decide_go.sql` (definer RPC, one undo step)

**Analog:** `supabase/migrations/20261012000300_entry_list.sql`

**Header contract block** (L1-15): copy the commented client contract (`record_decide_go(p_row_ids uuid[], p_series jsonb, p_debt jsonb, p_check_id uuid, p_decision jsonb, p_undo_step jsonb) -> {status, undo_step_id}`).

**Step validation + replay = success** (L32-47):
```sql
if jsonb_typeof(p_undo_step) is distinct from 'object' then
  raise exception 'record_entry_list: p_undo_step must be an object' using errcode = '22023';
end if;
begin
  v_step_id := (p_undo_step ->> 'id')::uuid;
exception when others then
  raise exception 'record_entry_list: p_undo_step.id must be a uuid' using errcode = '22023';
end;
...
-- D-WR-03: a replay of the action that already landed is success, before any row check.
if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
  return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
end if;
```

**Rows must be the caller's fresh rows** (L59-70):
```sql
select count(*) into v_found
  from public.transactions t
 where t.id = any (p_row_ids)
   and t.deleted_at is null
   and t.household_id in (select public.user_household_ids())
   and t.created_by = (select auth.uid())
   and t.version = 1
   and t.recurring_series_id is null;
```

**Series creation inside the same step** (L84):
```sql
v_change := public.create_recurring_series(v_item -> 'series', v_anchor, '{}'::uuid[], null, true);
```

**Inverse ops + one undo_log row** (L93-110):
```sql
select coalesce(jsonb_agg(jsonb_build_object(
         'entity', 'transactions', 'id', t.id, 'expectedVersion', t.version,
         'patch', jsonb_build_object('deleted_at', '$now')) order by o.ord), '[]'::jsonb)
  into v_ops ...
for v_change in select value from jsonb_array_elements(v_changes) loop
  v_ops := v_ops || public.series_change_inverse(v_change);
end loop;
insert into public.undo_log (id, owner_id, label_key, label_params, ops)
values (v_step_id, (select auth.uid()), p_undo_step ->> 'label_key',
        coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);
```
Decide adds: insert the `debts` row (inverse `{entity:'debts', patch:{deleted_at:'$now'}}`), update `decide_checks.status='bought'` + estimate columns (inverse restores `status:'open'`, needs `decide_checks.status` in the patch allow-list), insert `decide_links` (inverse soft-deletes). Verify every linked target is in the caller's household (Security: link tampering).

**Grants** (L116-117):
```sql
revoke execute on function public.record_entry_list(uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.record_entry_list(uuid[], jsonb, jsonb) to authenticated;
```

---

### `supabase/migrations/2026101x_decide_demo_seed.sql` (versioned sample seed)

**Analog:** `supabase/migrations/20261010000600_sample_data.sql`

**Membership + date guards** (L53-61):
```sql
if v_user is null or p_household_id is null
   or p_household_id not in (select public.user_household_ids()) then
  raise exception 'not a member of household %', p_household_id using errcode = '42501';
end if;
if p_today is null or abs(p_today - current_date) > 2 then
  raise exception 'p_today must be within 2 days of today' using errcode = '22023';
end if;
if public.sample_data_exists(p_household_id) then
  return jsonb_build_object('status', 'already-seeded');
end if;
```
**Currency scaling** (L65-68): `v_mult` scales non-USD homes, so screenshots must use a USD-home demo account (RESEARCH Pitfall 6).
**Series + materialise** (L152-162): `insert into public.recurring_series (..., is_sample) values (..., true); perform public.materialise_series(v_series, p_today);`
**Clear** (L167-237): extend with `delete from public.decide_checks where household_id = p_household_id and is_sample`, then `decide_links`, `debts`; return counts. Update `src/db/samples.ts` `ClearSampleResult` (L14-20) and its `num()` validation (L49-60) for any new count keys.

---

### `src/db/decideChecks.ts`, `src/db/debts.ts`, `src/db/decideLinks.ts` (db module, CRUD)

**Analog:** `src/db/categoryRules.ts`

**Header + imports** (L1-11):
```typescript
// Typed reads and version-conditional writes for ... Same shape as src/db/categories.ts: client-injected id,
// duplicate-id-safe insert, version-conditional update.
// ... *_KEYS mirror the SQL grants exactly. assertAllowedKeys is the offline-capable mirror of that boundary.
import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';
```
**Grant-mirroring key lists** (L51-69):
```typescript
export const CATEGORY_RULE_INSERT_KEYS = ['id', 'scope', 'household_id', ...] as const satisfies readonly (keyof NewCategoryRule)[];
export const CATEGORY_RULE_PATCH_KEYS = ['keyword', ..., 'deleted_at'] as const satisfies readonly (keyof CategoryRulePatch)[];
```
**Live read** (L75-84): `.from(...).select(COLUMNS).is('deleted_at', null).order(...)`; `if (error) throw toDbError(error, status);`
**Replay-safe insert** (L93-111):
```typescript
if (!error) return data as CategoryRuleRow;
// MON-08: a duplicate client id means this exact write already landed (replay).
if (error.code === UNIQUE_VIOLATION) {
  const existing = await fetchCategoryRule(client, rule.id);
  if (existing) return existing;
}
throw toDbError(error, status);
```
**Version-conditional update** (L113-136):
```typescript
assertAllowedKeys(patch, CATEGORY_RULE_PATCH_KEYS, 'updateCategoryRule');
const { data, error, status } = await client.from('category_rules').update(patch)
  .eq('id', id).eq('version', expectedVersion).select(CATEGORY_RULE_COLUMNS);
...
const serverRow = await fetchCategoryRule(client, id);
if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
throw new NotFoundError(ENTITY, id);
```
Autosave of a draft (RESEARCH Pattern 4, last write wins) may use an `upsert` without `.eq('version', ...)`; abandon/remove use the version-conditional update.

---

### `src/db/decideSettings.ts` (db module, per-user unconditional)

**Analog:** `src/db/recordPrefs.ts`

**Row + patch keys mirroring the grant** (L9-20):
```typescript
export interface RecordPrefsRow { week_start: 0 | 1 | null; sample_prompt_answered_at: string | null; }
export const RECORD_PREFS_COLUMNS = 'week_start, sample_prompt_answered_at';
export const RECORD_PREFS_PATCH_KEYS = ['week_start', 'sample_prompt_answered_at'] as const satisfies readonly (keyof RecordPrefsRow)[];
```
**Unconditional update** (L33-49): `assertAllowedKeys(...)`, `.update(patch).eq('id', userId).select(COLUMNS).single()`. For `decide_settings` (pk `user_id`, row may not exist yet) use `.upsert({ user_id, ...patch })`. Numeric `dsr_line`/`projection_return` columns are read `::text` (strings in TS, RESEARCH L484) so no bigint enters the cache.

---

### `src/db/decideGo.ts` (RPC wrapper)

**Analog:** `src/db/entryList.ts`

**Client-side bounds + envelope validation** (L18-45):
```typescript
export async function recordEntryList(client: DbClient, rowIds: readonly string[], items: readonly EntryListSeriesItem[], undo: SeriesUndoLabel): Promise<EntryListResult> {
  if (rowIds.length < 1 || rowIds.length > ENTRY_LIST_MAX_ROWS) { throw new RangeError(...); }
  const { data, error, status } = await client.rpc('record_entry_list', {
    p_row_ids: rowIds,
    p_items: items.map((i) => ({ series: i.series, anchor_transaction_id: i.anchorTransactionId })),
    p_undo_step: { id: undo.id, label_key: undo.labelKey, label_params: undo.labelParams },
  });
  if (error) throw toDbError(error, status);
  const rec = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  ...
  if ((state !== 'applied' && state !== 'already-applied') || typeof undoStepId !== 'string' || undoStepId.length === 0) {
    throw new DbError(`record_entry_list response: unrecognised ${JSON.stringify(state)}`, BAD_RESPONSE, null);
  }
```
Note: cash-only Go ahead may write zero series; the loan path writes rows only if a day-one deposit row exists. Allow `rowIds.length` 0 when a series or debt is present (the analog requires >= 1; the new RPC must define its own bounds).

---

### `src/data/keys.ts` (modify)

**Analog:** itself. Row-derived reads **must** nest under `['transactions', householdId]` so every transaction write invalidates them (comment L23-24, L43, L51):
```typescript
// Both nested under transactionsRoot's ['transactions', householdId] prefix so any
// transaction invalidation refreshes them too.
transactionMonths: (householdId: string) => ['transactions', householdId, 'months'] as const,
accountBalances: (householdId: string) => ['transactions', householdId, 'balances'] as const,
```
Add (RESEARCH Pattern 2): `decideHistory: (hh, from, to) => ['transactions', hh, 'decide-history', from, to] as const`; own-key entries `decideChecks: (userId, hh)`, `decideSettings: (userId)`, `debts: (hh)`. Add a `// Phase 5 (Decide)` block to `mutationKeys` (L56-94) with `saveCheck`, `editCheck`, `decideGoAhead`, `decideWait`, `decidePass`, `updateDecideSettings`, `editDebt`, `linkLine`. All writes use `WRITE_SCOPE` (L96-99).

---

### `src/data/queries/decide.ts` (query hooks + snapshot hook)

**Analogs:** `src/data/queries/categoryRules.ts` (L10-16), `src/data/queries/recurringSeries.ts` (L9-15), `src/features/home/useHomeViewModel.ts` (L44-73), `src/data/queries/activity.ts` `useAccountBalances` (L315-345).

**Simple read hook** (`categoryRules.ts` L10-16):
```typescript
export function useCategoryRules(userId?: string, householdId?: string) {
  return useQuery({
    queryKey: queryKeys.categoryRules(userId ?? '', householdId ?? ''),
    queryFn: () => fetchCategoryRules(supabase),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}
```
**Composing existing hooks, no extra server call** (`useHomeViewModel.ts` L44-73):
```typescript
const rc = useRecordContext();
const formatter = useMoneyFormatter(rc.showCents);
...
const accountsQuery = useAccounts(rc.householdId ?? undefined);
const allAccounts = useMemo(() => accountsData ?? [], [accountsData]);
const accounts = useMemo(() => allAccounts.filter((a) => a.archived_at === null && a.deleted_at === null), [allAccounts]);
const { balances, isLoading: balancesLoading } = useAccountBalances(rc.householdId, allAccounts);
const position = useMemo(() => monthPositionOf({...}), [...]);
```
`useDecideSnapshot()` = same shape: `useRecordContext`, `useAccounts`, `useAccountBalances`, `useRecurringSeries`, `useFxLatest`, the history range read (`fetchTransactionsInRange`, `src/db/transactions.ts` L265-285, under the nested key), `useDecideSettings`, `useDebts`, then one `useMemo(() => buildDecideSnapshot(input), [...])`. Never return a bigint-bearing object from a `queryFn`; build the snapshot in `useMemo`, not in the cache.

---

### `src/data/mutations/decideChecks.ts` (autosave, abandon, remove)

**Analog:** `src/data/mutations/categoryRules.ts`

**Imports** (L6-34): `expo-crypto`, `useMutation`, `buildStep`/`inverseOfInserts`/`inverseOfPatches` from `@/engine/undo`, `VersionConflictError`, db functions, `mutationKeys, queryKeys, WRITE_SCOPE`, `classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay`, `recordFailedWrite`, `guardSession, markSession`, `recordWrittenVersion, resolveExpectedVersion`, `writeClient`, `acceptIfAlreadyApplied, upsertRow`, `newStepId, recordUndoStepSafely`.

**Registration skeleton** (L70-120):
```typescript
qc.setMutationDefaults(mutationKeys.addRule, {
  mutationFn: (vars: AddRuleVars) =>
    guardSession(vars, async () => {
      const client = await writeClient();
      const row = await insertCategoryRule(client, vars.row);
      const step = buildStep(vars.stepId, 'ruleAdded', { name: vars.row.keyword },
        inverseOfInserts('category_rules', [{ id: row.id, version: row.version }]));
      await recordUndoStepSafely(qc, client, step, vars.ownerId);
      return row;
    }),
  scope: WRITE_SCOPE,
  retry: shouldRetryWrite,
  retryDelay: writeRetryDelay,
  onMutate: async (vars) => { markSession(vars); await qc.cancelQueries({ queryKey: ... }); /* optimistic row, pending: true */ },
  onSuccess: (row, vars) => { patchRulesCache(qc, vars.cache, (rows) => upsertRow(rows, row, 'end')); },
  onError: async (err, vars) => {
    const cls = classifySettledWriteError(err);
    if (cls !== 'rejected' && cls !== 'not-found') return;
    ... await recordFailedWrite({ entity: 'category_rules', entityId: vars.row.id, kind: cls, code: settledWriteErrorCode(err), attempted: {...} });
  },
});
```
**Autosave = no undo step** (PLANNING-NOTES A5): drop `buildStep`/`recordUndoStepSafely` from the save path. **Abandon = soft delete with undo** (`useRemoveRule`, L296-311):
```typescript
mutation.mutate({
  id: row.id, ownerId: cache.userId, cache, expectedVersion: row.version,
  patch: { deleted_at: new Date().toISOString() },
  undo: { stepId, labelKey: 'ruleRemoved', labelParams: { name: row.keyword }, before: { deleted_at: null } },
});
return stepId;
```
**Edit with version chain + already-applied** (L123-139):
```typescript
const expected = resolveExpectedVersion('category_rules', vars.id, vars.expectedVersion);
const row = await updateCategoryRule(client, vars.id, expected, vars.patch).catch((err: unknown) =>
  acceptIfAlreadyApplied<CategoryRuleRow>(err, vars.patch));
recordWrittenVersion('category_rules', vars.id, [vars.expectedVersion, expected], row.version);
```
**Conflict handling** (L158-185): on `VersionConflictError`, patch the cache with `err.serverRow`. The caller then shows the abandon toast via `showToast({ kind: 'destructive', text: { key: 'decide.toast.abandoned' }, stepId })` (`src/state/undoToast.ts` L10-35; destructive = 6000 ms, L37-38). **Failed-write payloads: ids/labelKeys only, never names or amounts** (`bulkAdd.ts` L248).

---

### `src/data/mutations/decideGoAhead.ts` (batch, one undo step)

**Analog:** `src/data/mutations/bulkAdd.ts`

**Header convention** (L1-8): describe the replay key (step id minted once before `mutate()`; RPC replay returns `already-applied`).

**Pure builder separated from the hook** (L61-157): `buildEntryListWrite(items, ctx, mint)` returns `{ rows, series }`; copy as `buildGoAheadWrite(check, verdict, ctx, mint)` returning `{ rows, series, debt, links }`. Sign rule (L109-115): expenses are negative `original_amount`. Series via `seriesInputFromRow(...)` (L131-148) from `./recurringSeries`; loan series count = `plan.months`, last payment `plan.finalMonthly` (04-05 L237).

**Persisted vars are JSON only** (L160-168):
```typescript
export interface BulkAddVars {
  householdId: string; ownerId: string; homeCurrency: string;
  rows: NewTransaction[]; series: EntryListSeriesItem[]; stepId: string; n: number;
}
```
Add `checkId`, `decision` (estimate numbers as `number`, `verdictAtDecision` as the state string), `debt` (APR as decimal string).

**Two-request landing guard** (L176-182, L196-204):
```typescript
const rowsLanded = new Set<string>();
...
rowsLanded.add(vars.stepId);
// Called even when nothing was inserted: a replay answers 'already-applied'.
await recordEntryList(client, vars.rows.map((r) => r.id), vars.series,
  { id: vars.stepId, labelKey: 'addedMany', labelParams: { n: vars.n } });
rowsLanded.delete(vars.stepId);
```
**Optimistic placement + invalidation** (L210-234):
```typescript
onMutate: (vars) => { markSession(vars); for (const row of vars.rows) placeRowInMonth(qc, vars.householdId, optimisticTransactionRow(...), []); },
onSuccess: (result, vars) => {
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
  invalidateDerivedReads(qc, vars.householdId);
  ...followUpPendingByDate for rate_pending rows
},
```
Add invalidation of `decideChecks`, `debts`, decide links.

**onError with landed-rows honesty** (L235-258):
```typescript
const landed = rowsLanded.delete(vars.stepId);
...
await recordFailedWrite({ entity: 'transactions', entityId: vars.stepId, kind: cls, code: settledWriteErrorCode(err), attempted: { count: vars.rows.length } });
showToast({ kind: 'refusal', text: { key: landed ? 'undo.batchSavedNoUndo' : 'undo.batchRefused' } });
```
**Hook returns the step id** (L262-288): `const stepId = newStepId(); mutation.mutate({...}); return stepId;` The screen then calls `hapticMedium()` and `showToast({ kind: 'ordinary', text: { key: 'decide.toast.written' }, stepId })`.

---

### `src/data/mutations/decideSettings.ts` (limits, rough figures, basis override)

**Analog:** `src/data/mutations/recordPrefs.ts`

**Unconditional write with optimistic cache + rollback** (L27-60):
```typescript
qc.setMutationDefaults(mutationKeys.updateRecordPrefs, {
  mutationFn: (vars: UpdateRecordPrefsVars) =>
    guardSession(vars, async () => updateRecordPrefs(await writeClient(), vars.userId, vars.patch)),
  scope: WRITE_SCOPE, retry: shouldRetryWrite, retryDelay: writeRetryDelay,
  onMutate: async (vars): Promise<PrefsContext> => {
    markSession(vars);
    const key = queryKeys.recordPrefs(vars.userId);
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<RecordPrefsRow>(key);
    qc.setQueryData<RecordPrefsRow>(key, (old) => ({ ...(old ?? DEFAULT_RECORD_PREFS), ...vars.patch }));
    return { previous };
  },
  onSuccess: (row, vars) => { qc.setQueryData(queryKeys.recordPrefs(vars.userId), row); },
  onError: async (err, vars, context) => {
    const cls = classifySettledWriteError(err);
    if (cls !== 'rejected' && cls !== 'not-found') return; // unconditional, never conflicts
    ...restore previous or invalidate; recordFailedWrite(...)
  },
});
```
Do not put rough-figure amounts in `recordFailedWrite.attempted` (privacy); send field names only.

---

### `src/data/mutations/index.ts` (modify)

**Analog:** itself (L29-60). Append after L59 with a phase comment, before the provider restores the cache:
```typescript
  // 02.3-13: entry-sheet list (one step, one Undo).
  registerBulkAddMutations(qc);
  // 05-xx: Decide checks, Go ahead / Wait / Pass, settings and debts.
  registerDecideMutations(qc);
```

---

### `src/features/decide/snapshot/*.ts` (pure builder, 100% coverage)

**Analogs:** `src/features/home/comingUp.ts` (pure selection over query views, L1-36) and `src/data/queries/homeAmount.ts` (FX conversion, L23-70).

**Pure-module header style** (`comingUp.ts` L1-3): state the requirement ids and "Not money maths: selection and ordering only." The snapshot builder header must say: pure, no React, no I/O, never imports `@/db/fxResolve` (depcruise `fx-fetch-never-from-reads`, `.dependency-cruiser.cjs` L31-36 currently covers only `^src/(data/queries|engine)/`; extend `from.path` to include `^src/features/decide/`).

**FX to home, null = cannot convert** (`homeAmount.ts` L23-48):
```typescript
export function homeAmountFor(row: Pick<TransactionRow, 'home_currency' | 'home_amount' | 'original_amount' | 'original_currency' | 'orig_per_eur'>, homeCurrency: string, rates: readonly FxLatestRow[]): number | null {
  if (row.home_currency === homeCurrency) return row.home_amount;
  if (row.orig_per_eur === null) return null;
  ...
}
export function projectionHomeAmount(amount: number, currency: string, homeCurrency: string, rates: readonly FxLatestRow[]): number | null
```
Use `homeAmountFor` for rows, `projectionHomeAmount` for series amounts and account balances. A `null` result excludes the row and increments an "unconverted" count for "Assumptions in play" (PLANNING-NOTES A9).

**Builder rules** (RESEARCH L279-289): `RecordLine.amount = abs(home)`, `direction` from sign, `isRefund` from `is_refund`, `transferId` from `transfer_id`, `seriesId` from `recurring_series_id`; omit `Debt`/`Savings` builtin-category outflows that are not transfer legs; `RecurringBill` only for live outflow series, `confirmed: true`; `cashOnHand` = cash|checking|savings balances; `asOf = rc.today`; full-month rule per PLANNING-NOTES A3. Return `{kind:'logged', snapshot} | {kind:'rough', figures} | {kind:'none'}`.

**Coverage:** add to `jest.config.js` (L37-42 pattern) `if (hasSource('src/features/decide/snapshot')) coverageThreshold['./src/features/decide/snapshot/'] = FULL;`.

---

### `src/features/decide/copy/*.ts` (code→i18n key maps)

**Analog:** no in-repo `satisfies Record<Code, ...>` map; use RESEARCH Pattern 8 (L346-355) verbatim:
```typescript
import type { WarningCode, SuppressionCode, PurchaseSize } from '@/engine/decide';
export const WARNING_TITLE = { month: 'decide.warn.month.title', cash: 'decide.warn.cash.title',
  dsr: 'decide.warn.dsr.title', owe: 'decide.warn.owe.title', inv: 'decide.warn.inv.title' } as const satisfies Record<WarningCode, string>;
export const SIZE_LABEL = { from_spare_this_month: 'decide.size.spare', from_savings: 'decide.size.savings',
  needs_spreading: 'decide.size.spreading' } as const satisfies Record<PurchaseSize, string>;
```
Nearest repo precedent for key selection by code: `src/features/record/history/undoCopy.ts` (L13: "nameless rows get the `undo.labelUnnamed.*` copy; plural keys use count = params.n"). Data layer never formats copy (`src/state/undoToast.ts` L1-5): maps return keys + params, screens call `t()`.

---

### `src/features/decide/quickParse.ts`, `offsets.ts`, `estimateActual.ts`, `entitlements.ts` (pure helpers)

**Analog:** `src/features/home/comingUp.ts` + `__tests__/comingUp.test.ts`. Parser body is given in RESEARCH L425-438 (use `parseAmount`/`useAmountParser`, never `parseFloat`). `offsets.ts` must work on `'YYYY-MM-DD'` strings via `src/engine/time` helpers, never `Date#toISOString` (`DateField.tsx` L1-3 MON-14 comment, `toLocalDateString` L24-26). `entitlements.ts` copies the pure switch shape of `src/shell/tabBar/availableTabs.ts` L6-28:
```typescript
export const TAB_AVAILABILITY: Readonly<Record<TabId, boolean>> = { home: true, activity: true, decide: false, ... };
export function isTabAvailable(id: TabId, availability = TAB_AVAILABILITY): boolean { return availability[id]; }
```
→ `PRO_CANDIDATES` record + `canUse(feature): boolean` returning true (D-16).

---

### Routes: `app/(app)/(tabs)/decide.tsx`, `app/(app)/decide/check/[id].tsx`, `app/(app)/decide/past.tsx`, `app/(app)/setup/rough.tsx`, `app/(app)/setup/first-check.tsx`

**Analogs:** thin route files.
- Tab root (`app/(app)/(tabs)/home.tsx` L1-5):
```typescript
import { HomeScreen } from '@/features/home/HomeScreen';
export default function HomeRoute() { return <HomeScreen />; }
```
- Param route (`app/(app)/accounts/[id].tsx` L1-12): `const { id } = useLocalSearchParams<{ id: string }>();` Validate `id` (and `step` in `'1'..'5'`) against a UUID regex before use (Security: deep-link injection).
- Setup step with params (`app/(app)/setup/history.tsx` L1-7):
```typescript
const params = useLocalSearchParams<{ accountId?: string }>();
return <SetupHistoryScreen accountId={params.accountId ?? null} />;
```

### `app/(app)/_layout.tsx` (modify)

**Analog:** itself. Register new outer-stack screens next to L56-64:
```tsx
<Stack.Screen name="setup/account" />
<Stack.Screen name="setup/history" />
```
→ add `decide/check/[id]`, `decide/past`, `setup/rough`, `setup/first-check`. Mount the notification observer as a sibling of `<UndoToastHost />` (L68), i.e. after the consent redirect at L39-41 (RESEARCH Pitfall 7).

### `src/features/navigation/swipeBackGesture.ts` (modify)

L29:
```typescript
const NO_SWIPE_BACK: ReadonlySet<string> = new Set(['(tabs)', 'consent', 'setup/account', 'setup/history']);
```
→ add `'setup/rough'`, `'setup/first-check'`. The check flow stays swipe-back-enabled but its handler must step back first (RESEARCH Pattern 6, A8).

### `src/shell/tabBar/availableTabs.ts` (modify)

L14: `decide: false,` → `true`. Update `src/shell/tabBar/__tests__/availableTabs.test.ts` L8 and L22 expectations. The tabs layout maps `availableTabs()` to `<Tabs.Screen name={id}/>` (`app/(app)/(tabs)/_layout.tsx` L46-48), so `app/(app)/(tabs)/decide.tsx` must exist in the same change.

---

### `src/features/decide/home/DecideHomeScreen.tsx` (tab root)

**Analog:** `src/features/home/HomeScreen.tsx`

**Imports + scaffold** (L14-15, L53-95):
```tsx
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
...
return (
  <TabRootScreen
    title={t('home.title')}
    eyebrow={eyebrow}
    refreshKeys={vm.refreshKeys}
    overlay={<>{/* every Sheet / ConfirmSheet lives here, outside the ScrollView */}</>}
  >
    <QuickActions month={vm.month} />
    <ThisMonthCard ... />
```
UI-SPEC: no pull-to-refresh on Decide, so omit `refreshKeys`. Cards in order: QuickCheckCard, YourMonthCard, OpenChecksCard, Past decisions `Row`, LinesCard, sources note. A view-model hook (`useDecideHomeViewModel`) mirrors `useHomeViewModel` (see data layer above).

**FAB registration** (`src/shell/fab/FabProvider.tsx` L164-186):
```typescript
export function useRegisterFab(config: FabConfig | null): void
// config = { label, accessibilityLabel, onPress }
```
Call `useRegisterFab({ label: t('shell.fab.newCheck'), accessibilityLabel: t('decide.fab.a11y'), onPress })` in DecideHomeScreen. The check flow is an outer route, so the FAB hides automatically (`shouldHideFab.ts` L23-36: `surface === 'tabRoot'` required).

### `src/features/decide/DecideShellHost.tsx` (quick-menu `newCheck`)

**Analog:** `src/features/record/entry/ShellEntryHost.tsx` (L17-31):
```tsx
useProvideQuickAction('importStatement',
  useCallback(() => pushOnce({ pathname: '/import', params: { entry: 'you', from } } as Href), [from]));
```
→ `useProvideQuickAction('newCheck', useCallback(() => pushOnce({ pathname: '/decide/check/[id]', params: { id: Crypto.randomUUID() } } as Href), []))`. Mount next to `<ShellEntryHost />` in `app/(app)/(tabs)/_layout.tsx` L52. `newCheck` is already in `QUICK_ACTION_ORDER` (`quickActions.ts` L5) and `shell.quick.newCheck` copy exists (`en.ts` L1313); add `'shell.quick.newCheck'` to `copyStatus.ts` beside L139-143 if not yet listed.

### `src/features/decide/home/*Card.tsx` (cards)

**Analog:** `src/features/home/ThisMonthCard.tsx`

**Imports** (L6-23): `useTheme`, `useFontScale`, `radii, size, space` from `@/theme/layout`, `DURATION, EASING` from `@/theme/motion`, `shadows` from `@/theme/tokens`, `fontSize, textRole` from `@/theme/typography`, `MoneyFormatter`. Named prototype-literal exceptions as consts with a UI-SPEC comment (L25-31):
```typescript
// UI-SPEC Spacing "prototype-literal exceptions (Home)": ...
const FIGURE_STACK_ABOVE = 1.3;
```
Header comment states "this component only formats" and "read failures are disclosed, never shown as an empty month" (L1-5) — the Decide cards follow the same rule: all maths from the engine, loading/error/empty states per UI-SPEC.

### `src/features/decide/check/CheckFlowScreen.tsx` + steps

**Analog (chrome):** `src/shell/screen/DetailScreen.tsx` (L22-44):
```tsx
const { colors } = useTheme();
const insets = useScreenInsets();
const titleRef = useRef<TextRef>(null);
a11yFocus.useScreenTitleFocus(titleRef as never);
return (
  <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <DetailHeader title={title} right={right} titleRef={titleRef} />
    <SyncProblemLine />
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.screenH, paddingBottom: insets.bottom + space.groupGap }}>
```
The flow needs its own sticky header (eyebrow "STEP n OF 5" + StepBar) and pinned action bar, so build a `CheckFlowHeader` copying `DetailHeader` + `useScreenTitleFocus`, re-focusing on each step change (UI-SPEC "Focus moves to the step title"). Analog for a multi-step outer flow with local step state: `src/features/record/import/ImportScreen.tsx` (format → mapping → review steps).

**Haptics** (`src/ui/haptics.ts` L18-36): `hapticSuccess()` (fits reveal), `hapticWarning()` (adjust/no/missing reveal), `hapticMedium()` (commit), `hapticSelection()` (method/chip/segment). Never import `expo-haptics` directly.

**Confirm** (`src/ui/ConfirmSheet.tsx` L15-26, L28-54): `<ConfirmSheet visible title body cancelLabel confirmLabel destructive? onConfirm onCancel />`; Go ahead uses non-destructive, Remove decision uses `destructive`.

### `src/features/decide/check/{StateChip,ChoiceCard,StepBar,...}.tsx` (primitives)

**Chip/tint analog:** `src/ui/Chip.tsx` (L23-49) — accent tint via an absolute-fill `View` at `ACCENT_TINT_OPACITY`, `minHeight: space.touchMin`, `radii.pill`:
```tsx
{selected ? (<View testID="accent-tint" pointerEvents="none"
  style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]} />) : null}
```
StateChip "fits" uses exactly this; other states use token fills from the UI-SPEC StateChip map. The `surface`@0.12 over `ink` derivation uses the same absolute-fill + opacity technique (no new colour).

**Radio analog:** `src/features/you/components/FontPairingSwitcher.tsx` (L28-47):
```tsx
<Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange(key)} style={styles.row}>
```
UI-SPEC asks for `checked` on radios: use `accessibilityState={{ checked: selected }}` for ChoiceCard / Cash|Credit / duration chips, `role="checkbox"` + `checked` for CheckRow.

### `src/features/decide/check/StepSlider.tsx`

**Partial analog:** `src/ui/Sheet.tsx` L230-260 — `Gesture.Pan()` with `.activeOffsetY/.failOffsetX`, `.withTestId(...)`, shared values mutated in `onUpdate` with the `react-hooks/immutability` eslint-disable comments. Slider uses `.activeOffsetX` and snaps to `step` on end; `accessibilityRole="adjustable"` with `accessibilityActions` increment/decrement (no in-repo precedent for adjustable).

### `src/features/decide/past/*`

- `PastDecisionsScreen` → `DetailScreen` (above) with `title={t('decide.past.title')}`; list empty state uses `src/ui/EmptyState.tsx`.
- `DecisionDetailSheet` → `src/ui/DetailSheet.tsx` + `ConfirmSheet` for Remove.

### `src/features/decide/onboarding/{RoughFiguresScreen,FirstCheckScreen}.tsx`

**Analog:** `src/features/record/setup/SetupHistoryScreen.tsx`

**Imports + layout** (L3-18, L51-72):
```tsx
import { router } from 'expo-router';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { Screen } from '@/ui/Screen';
...
<Screen>
  <SyncProblemLine inset={false} />
  <View style={styles.block}>
    <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>{t('...')}</Text>
    <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('...')}</Text>
  </View>
  <View style={styles.actions}>
    <Pill label={t('...')} variant="primary" onPress={...} />
    <Pill label={t('...')} variant="secondary" onPress={...} />
  </View>
</Screen>
...
const styles = StyleSheet.create({ block: { gap: space.gapSm }, actions: { marginTop: space.groupGap, gap: space.gapSm } });
```
**Analytics fire point** (L34-36): `getAnalytics().track('onboarding_history_choice', { choice: 'import' });` → `getAnalytics().track('first_read_shown', { state })`.
**Linear navigation** (L36, L40): `router.replace({ pathname: '/setup/history', params: { accountId } })` — never `push` in the setup chain.

### `src/features/record/setup/SetupAccountScreen.tsx` (modify)

L43:
```tsx
onSaved={(id) => router.replace({ pathname: '/setup/history', params: { accountId: id } })}
```
→ `pathname: '/setup/rough'`. Rough → first-check → history all pass `accountId`. Update `src/features/record/setup/__tests__/setup.test.tsx`.

### `src/features/record/entry/pickers/DateField.tsx` (modify)

L37-40 passes any picked date through:
```typescript
const handle = (event: DateTimePickerEvent, date?: Date) => {
  if (Platform.OS === 'android') setOpen(false);
  if (event.type === 'set' && date) onChange(toLocalDateString(date));
};
```
Add: when `minDate` is set and `toLocalDateString(date) < minDate`, do not call `onChange` (string compare is safe on `YYYY-MM-DD`). Keep `toLocalDateString` (L24-26), never `toISOString`.

---

## Shared Patterns

### Write queue (every Decide mutation)
**Source:** `src/data/mutations/categoryRules.ts` L70-120, `src/data/keys.ts` L96-99
**Apply to:** all `src/data/mutations/decide*.ts`
- `qc.setMutationDefaults(key, { mutationFn: (vars) => guardSession(vars, async () => { const client = await writeClient(); ... }), scope: WRITE_SCOPE, retry: shouldRetryWrite, retryDelay: writeRetryDelay, onMutate: (vars) => { markSession(vars); ... }, onError: classify → recordFailedWrite })`.
- Hooks: `useMutation({ mutationKey, scope: WRITE_SCOPE })` with no inline `mutationFn` (it comes from the registered default, so paused replays work).
- Client-minted ids (`Crypto.randomUUID()`), step ids via `newStepId()` minted before `mutate()`.
- Vars are JSON-safe: no bigint, no `Verdict`, no `Percent`.

### Undo + toast
**Source:** `src/engine/undo/types.ts` L14, L32; `src/state/undoToast.ts` L10-38; `src/features/record/history/undoCopy.ts`
**Apply to:** abandon, remove decision, unlink line, Go ahead
- Extend `UndoEntity` (L14) with `'decide_checks' | 'debts' | 'decide_links'` and `UNDO_LABEL_KEYS` (L32) with e.g. `'checkAbandoned', 'decisionWritten', 'decisionRemoved', 'lineUnlinked'`; add `undo.label.*` copy in `en.ts` near L1195-1263. `src/engine/undo` is a 100% coverage folder (`jest.config.js` L39): add tests.
- Server allow-list must match (see patches migration).
- `showToast({ kind: 'destructive' | 'ordinary', text: { key, params }, stepId })`.

### RLS + definer RPC hygiene
**Source:** `20261012000100_category_rules.sql` L82-105; `20261012000300_entry_list.sql` L16-21, L116-117
**Apply to:** every new table and RPC
- `security definer set search_path = ''`, `(select auth.uid())`, `household_id in (select public.user_household_ids())`, `revoke ... from public, anon; grant execute ... to authenticated`.
- Errors: `using errcode = '22023'` (bad input) / `'42501'` (not permitted).
- pgTAP per table/RPC copying `51_category_rules.test.sql` L7-35 setup (auth.users inserts, `hh` temp table, `set local role authenticated` + `request.jwt.claims`).

### Copy + compliance
**Source:** `src/i18n/copyStatus.ts` L126-134; `src/i18n/__tests__/catalogue.test.ts` L33-48
**Apply to:** every Decide string
- Add `decide: {...}` to `en.ts`; mark draft with `...leafPaths('decide', en.decide),` in `DRAFT_COPY_KEYS`.
- Global guard already enforces typographic apostrophes and `FORBIDDEN_VOICE = /\badvice\b|recommend|you should|.../i` (L35). New `decideCopy.test.ts` copies the `collectLeaves` helper (L10-20) over `en.decide` and asserts the UI-SPEC extended banned list (advise, we suggest, best option, guaranteed, approved, pre-approved, offer, apply for, lender except the footer key, loan offer, interest-free) plus title length caps (Pitfall 9).

### Analytics
**Source:** `src/services/analytics/catalogue.ts` L10-79
**Apply to:** quick check, flow, decision, first read
```typescript
quick_check_run: { state: 'fits' | 'adjust' | 'no' | 'missing' };
check_started: Record<string, never>;
check_step_viewed: { step: '1' | '2' | '3' | '4' | '5' };   // never a number (guard L65-74)
check_completed: { state: 'fits' | 'adjust' | 'no' | 'missing' };
check_abandoned: Record<string, never>;
decision_recorded: { decision: 'go' | 'wait' | 'pass' };
first_read_shown: { state: 'fits' | 'adjust' | 'no' | 'missing' };
```
Fire with `getAnalytics().track(name, props)` (`SetupHistoryScreen.tsx` L35).

### Haptics
**Source:** `src/ui/haptics.ts` L13-36 — `hapticSuccess/Warning/Medium/Selection` only.

### Device state wipe
**Source:** `src/services/storage/wipe.ts` L10, L24-29
**Apply to:** wait-reminder notification ids
```typescript
export const STORAGE_PREFIX = 'fincwin:';
export function registerWipeHandler(handler: WipeHandler): () => void
```
Register `{ id: 'decide-reminders', wipe: () => Notifications.cancelAllScheduledNotificationsAsync() }`; store `checkId → notificationId` in AsyncStorage under `fincwin:decide-reminders` so the prefix sweep removes it.

### Sample/demo data
**Source:** `src/data/mutations/sampleData.ts` L24-34 (refresh after seed/clear)
**Apply to:** demo seed — add `queryKeys.decideChecks(...)`, `queryKeys.debts(...)`, `queryKeys.decideSettings(...)` to `refresh()`.

### Test scaffolding
**Source:** `src/data/mutations/__tests__/categoryRules.test.tsx` L1-55
```typescript
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);
jest.mock('@/services/supabase', () => ({ get supabase() { return mockActiveClient; } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
function newClient(): QueryClient { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); registerCategoryRuleMutations(qc); return qc; }
```
`expo-notifications` mock goes per test file (`jest.setup.ts` holds only global mocks).

---

## No Analog Found

| File | Role | Data Flow | Reason / what to use |
|---|---|---|---|
| `src/features/decide/notifications/waitReminder.ts` | service | event-driven (OS schedule) | `expo-notifications` not installed; use RESEARCH Pattern 7 (L316-344) verbatim: module-level `setNotificationHandler` with `shouldShowBanner/shouldShowList`, Android channel before permission, `SchedulableTriggerInputTypes.DATE` trigger, `data: { checkId }` only |
| `src/features/decide/notifications/useNotificationObserver.ts` | hook | event-driven | Use `getLastNotificationResponseAsync()` once on mount + `addNotificationResponseReceivedListener` (cleanup `.remove()`), filter `DEFAULT_ACTION_IDENTIFIER`, UUID-validate, dedupe by request identifier, `router.push({ pathname: '/decide/check/[id]', params: { id, step: '3' } })` |
| `src/features/decide/check/StepSlider.tsx` | component | gesture | Only partial (`Sheet.tsx` pan); no `adjustable` accessibility precedent in the repo |
| `src/features/decide/copy/*.ts` | utility | code→key | No `satisfies Record<Code, string>` map exists yet; RESEARCH Pattern 8 |
| `src/features/decide/__tests__/demoScenario.test.ts` | test | engine-backed fixture | Needs the Phase 4 engine; fixture is the single source mirrored to SQL by a `--check` script modelled on `scripts/gen-recurring-mirror-test.mjs` |
| `CollapsibleSection`, `VerdictCard`, `WarningCard`, `FigureStrip` | component | — | New primitives per UI-SPEC; build from `textRole`/tokens like `ThisMonthCard.tsx`, no new colour/size |

## Planner notes surfaced during mapping

1. `fx-fetch-never-from-reads` (`.dependency-cruiser.cjs` L35) only guards `^src/(data/queries|engine)/`. The snapshot builder in `src/features/decide/snapshot/` is outside it; extend the rule so "Decide reads stored rates only" is enforced.
2. `record_entry_list` requires 1..200 row ids (L49-51). Go ahead on a loan with no deposit writes zero transaction rows (only a series + debt), so the new RPC needs its own bounds rather than calling `record_entry_list`.
3. `src/engine/undo/types.ts` changes touch a 100%-coverage engine folder; the plan must include tests there. That is the only `src/engine/` edit Phase 5 makes, and it is not under `engine/decide`.
4. `shell.quick.newCheck` copy exists (`en.ts` L1313) but is not in `copyStatus.ts`'s `shell.quick.*` list (L139-143); add it when the action goes live.

## Metadata

**Analog search scope:** `src/data/{keys.ts,queries,mutations}`, `src/db`, `src/features/{home,record/setup,record/entry,you}`, `src/shell/{fab,tabBar,screen}`, `src/ui`, `src/services/{analytics,storage}`, `src/i18n`, `src/engine/undo`, `app/(app)`, `supabase/migrations`, `supabase/tests/database`, `jest.config.js`, `.dependency-cruiser.cjs`, `scripts/`
**Files scanned:** ~60 read or grepped
**Engine contract source:** `.planning/phases/04-decide-engine/04-05-PLAN.md`, `04-12-PLAN.md` (no `04-PHASE5-ALIGNMENT.md` exists)
**Pattern extraction date:** 2026-10-15
