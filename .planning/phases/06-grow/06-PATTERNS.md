# Phase 6: Grow - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 34 new or modified (grouped by research plan groups 1-7)
**Analogs found:** 31 / 34 (3 have only a partial analog, listed in "No Analog Found")

All paths are relative to `C:\dev\fincwin-g6`. Line numbers are from this worktree.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/engine/payoff/fixedPayoff.ts` | engine util | transform | `src/engine/payoff/simulateMinimum.ts` | exact |
| `src/engine/payoff/strategies.ts` | engine util | transform | `src/engine/payoff/simulateMinimum.ts` (+ `design/calc.js strategy()` oracle) | role-match |
| `src/engine/payoff/compoundSteps.ts` | engine util | transform | `src/engine/payoff/futureValue.ts` / `futureValuePath.ts` | role-match |
| `src/engine/payoff/index.ts` (modify) | barrel | n/a | itself (lines 6-14) | exact |
| `src/engine/payoff/__tests__/{fixedPayoff,strategies,compoundSteps}.test.ts` | test | transform | `__tests__/simulateMinimum.test.ts`, `futureValue.test.ts`, `golden.test.ts` | exact |
| `src/engine/grow/{goalPlan,lots,gain,index}.ts` | engine util | transform | `src/engine/payoff/*` (bigint, `minorFromBigInt`) + `src/engine/recurring/schedule.ts` (`occurrenceDate`) | role-match |
| `jest.config.js` (modify) | config | n/a | list at lines 39-42 and 44-46 | exact |
| `src/features/grow/connect/*.ts` (goal, safetyNet, debt mappers) | pure mapper | transform | `src/features/decide/snapshot/v3/buildV3Inputs.ts` lines 412-424, 551-583 | exact |
| `src/features/grow/connect/__tests__/*` (contract, parity) | test | transform | `src/engine/decide/v3/__tests__/invariants/safetyNet.test.ts` + `rightAnswers/rightAnswers.test.ts` | role-match |
| `src/features/decide/snapshot/v3/buildV3Inputs.ts` (modify) | pure mapper | transform | itself | exact |
| `src/engine/decide/v3/{types,safetyNet,funds/envelopes}.ts` (modify: locked goals, new FactCode) | engine | transform | itself (`types.ts:68`, `:87`, `:140`) | exact |
| `src/i18n/locales/en.ts` (modify: fact copy + `grow.*` keys) | config / copy | n/a | `en.ts` `decide.info.*` (~2593) + `copyContract.test.ts` | exact |
| `src/engine/decide/v3/__tests__/rightAnswers/cases/goals.json` + `schema.ts` TOPICS | test data | request-response | `cases/safety-net.json` | exact |
| `supabase/migrations/20261106000100_grow_*.sql` (columns, tables, guards, grants, D-07 data step, `apply_patches` re-issue) | migration | CRUD | `20261103000200_overdraft_rate_and_debt_due_day.sql`, `20261024000100_pots_and_debt_housing.sql`, `20261016000110_decide_depth_tables.sql` | exact |
| `supabase/tests/database/89_grow_goals.test.sql`, `90_grow_safety_net_migration.test.sql`, `91_grow_holdings.test.sql` | pgTAP test | CRUD | `82_overdraft_rate_and_debt_due_day.test.sql`, `69_apply_patches_v3.test.sql`, `70_decide_v3_erasure.test.sql` | exact |
| `src/db/holdings.ts`, `src/db/holdingLots.ts` | db access | CRUD | `src/db/debts.ts` | exact |
| `src/db/savingsGoals.ts`, `src/db/debts.ts` (modify columns and key lists) | db access | CRUD | themselves | exact |
| `src/data/keys.ts` (modify: query and mutation keys) | config | n/a | `keys.ts:69`, `:73`, `:137-152` | exact |
| `src/data/queries/grow*.ts` | query hook | CRUD (read) | `src/data/queries/decide.ts` lines 1-60 | exact |
| `src/data/mutations/grow*.ts` (goals, holdings, lots, values) | mutation | CRUD (queued) | `src/data/mutations/debts.ts` | exact |
| `src/data/mutations/growSale.ts` (D-16 atomic sale) and goal "Add money" | mutation | multi-entity atomic | `src/data/mutations/boughtWrite.ts`, `decideGoAhead.ts`; `src/engine/transfer/pair.ts` | role-match |
| `src/data/mutations/index.ts` (modify: register) | registry | n/a | `index.ts:9-25` | exact |
| `src/data/exportManifest.ts` (modify) + `__tests__/exportManifest.test.ts` | config + test | batch | `exportManifest.ts:66-80`, test lines ~41-43 | exact |
| `scripts/cache-shape.lock.json` + `CACHE_SCHEMA_VERSION` | config | n/a | `scripts/check-cache-version.mjs` workflow | exact |
| `app/(app)/(tabs)/grow.tsx` + pushed routes | route | request-response | `app/(app)/(tabs)/decide.tsx` | exact |
| `src/shell/tabBar/availableTabs.ts` (modify, last task) | config | n/a | line 15 `grow: false` | exact |
| `src/features/grow/goals/*`, `debts/*`, `investing/*`, `safetyNet/*`, `lines/*` screens | component | CRUD / request-response | `src/features/decide/pots/{PotsScreen,PotSheet,usePots,potsModel}` | role-match |
| `src/features/grow/**/*Sheet.tsx` (Add money, Add a buy, Sold what this paid for, Make this the plan) | component (sheet) | request-response | `src/features/decide/check/LineEditorSheet.tsx` | exact |
| `src/features/grow/calculators/*` (GC01..GC40) | component | transform (never persisted) | `src/features/decide/charts` + `engine/payoff` callers; `design/calc.js` as oracle | partial |
| `src/features/grow/__tests__/copyLint.test.ts` | test | transform | `src/engine/decide/v3/copy/__tests__/copyContract.test.ts` | role-match |
| `src/features/grow/growFeatureFlags.ts` | utility | n/a | `src/shell/tabBar/availableTabs.ts` (build switch) | partial |
| Net-worth source (modify, one place) | utility | transform | Home AccountsCard sum (locate at task time) | partial |

## Pattern Assignments

### `src/engine/payoff/fixedPayoff.ts` and `strategies.ts` (engine, transform)

**Analog:** `src/engine/payoff/simulateMinimum.ts` (all bigint, one `divideHalfUp` per rounding point, explicit never-clears check independent of the cap).

**Imports pattern** (lines 18-30):
```typescript
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { SIMULATION_MONTH_CAP } from './constants';
import {
  MONTHLY_RATE_DENOMINATOR,
  ONE_HUNDRED_PERCENT,
  minorFromBigInt,
  type CardMinimumTerms,
  type MinimumPaymentResult,
  type Percent,
} from './types';
const FN = 'simulateMinimum';
```
Engine rule: no import from `db/`, `state/`, `services/`, `ui/`, `react`. Relative imports only inside `engine/`.

**Core loop pattern** (lines 54-92). Copy this shape for `fixedPayoff`; replace `scheduled` with `payment + extra`:
```typescript
const interest = divideHalfUp(bal * apr, D);
const due = bal + interest;
const paid = scheduled < due ? scheduled : due;
month += 1;
// D-17: explicit, per-month check, independent of the cap.
if (paid <= interest) {
  return { outcome: 'never_clears', months: month, /* ... */ totalInterest: null, remainingBalance: minorFromBigInt(bal, FN) };
}
totalInterest += interest;
bal = due - paid;
```
Cap handled at the top of the loop: `if (month === SIMULATION_MONTH_CAP) return { outcome: 'exceeds_month_cap', ... }` (lines 55-63). Do NOT port the prototype's 1200-month cap.

**Guard pattern** (lines 38-40): `if (balance < 0) throw new RangeError('simulateMinimum: balance must be >= 0');` Use the `fixedPayoff: ` prefix, because tests match `/^futureValue: /` style.

**Strategy port:** the oracle is `.planning/phases/06-grow/design/calc.js strategy()`. Per month: add interest to each live debt, pay `min(minimum, balance)` each, give the rest of the constant budget to live debts in `'rate'` (highest APR) or `'balance'` (smallest ORIGINAL balance) order, record `doneMonth`. Target fixtures: 24 months / 114,868 (rate), 24 / 128,030 (balance), 41 / 218,434 (minimums only).

**Barrel** (`src/engine/payoff/index.ts` lines 6-14): add `export * from './fixedPayoff'; export * from './strategies'; export * from './compoundSteps';`. Update the file header comment too, since it lists consumers.

**Test pattern** (`__tests__/simulateMinimum.test.ts` lines 1-15, 17-30 and `golden.test.ts` lines 1-20):
```typescript
import fc from 'fast-check';
import { percent, type CardMinimumTerms } from '../types';
import { minorUnits } from '../../money/types';
const m = minorUnits;
describe.each(fixtures.dpmt)('dpmt parity: $name', (c) => { /* tolerance vs prototype json */ });
```
Golden JSON lives in `__tests__/golden/prototype-payoff.json`; add a `calc-grow.json` generated by running `design/calc.js`. Property tests follow `futureValue.test.ts` lines 41-52 (`fc.property(amt, amt, apr, ...)`, `{ numRuns: 100 }`). The exact-integer LEDGER cases (24 months etc.) use exact equality, not the +/-1 tolerance of the old parity tests.

### `src/engine/payoff/compoundSteps.ts` (engine, transform)

**Analog:** `src/engine/payoff/futureValue.ts` and `futureValuePath.ts` (closed form, one rounding). Research Open decision A7: `compoundSteps` rounds per month (matches LEDGER $29,449.98 and $40,914.44) and does not replace `futureValue`, which Decide keeps. Add a test asserting the cent difference between the two on the LEDGER rows.

### `src/engine/grow/{goalPlan,lots,gain}.ts` (engine, transform)

**Analog:** the payoff folder for style; `ceilDivide` from `src/engine/payoff/types` (already imported by `engine/decide/v3/safetyNet.ts`: `import { ceilDivide } from '../../payoff/types';`) for the "needed each month rounds up" rule; `occurrenceDate(anchor, 'monthly', k)` from `src/engine/recurring/schedule.ts` for deposit dates (month-end clamped).

Same conventions: bigint internals, `minorFromBigInt`, no floats, units as decimal text or scaled bigint. Add `'grow'` to the 100% list in `jest.config.js` in the same task that creates the folder:

```javascript
// jest.config.js:39-42
for (const f of ['money', 'decide', 'payoff', 'split', 'recurring', /* ... */ 'entryList']) {
  if (hasSource(`src/engine/${f}`)) coverageThreshold[`./src/engine/${f}/`] = FULL;
}
// jest.config.js:44-46  (add 'src/features/grow/connect' beside 'src/features/decide/snapshot')
for (const d of ['src/features/decide/snapshot', 'src/features/decide/journal']) {
  if (hasSource(d)) coverageThreshold[`./${d}/`] = FULL;
}
```

### `src/features/grow/connect/*` (pure mapper, transform) - the BO-07 contracts

**Analog:** `src/features/decide/snapshot/v3/buildV3Inputs.ts`. `buildV3Inputs` must import only from `connect/`.

**Goal to Envelope** (lines 412-424), the code that moves into `goalToEnvelope`:
```typescript
const envelopes: Envelope[] = (built.pots ?? []).map((p) => {
  const g = goalRow.get(p.id);
  return { ...p, purposeId: null, accountId: g?.account_id ?? landing.get(p.id)?.account_id ?? null, bucket: (g?.bucket ?? null) !== null };
});
```
Saved per goal = `opening_saved` + goal-tagged paid lines. Reuse the pure `resolvePotAmounts` from `src/features/decide/pots/usePots.ts:27-41` (move it into `features/grow`, do not import Decide pots):
```typescript
let saved = opening;
for (const line of lines) {
  if (line.goal_id !== row.id || line.status !== 'paid' || line.deleted_at !== null) continue;
  const amount = homeAmountFor(line, ctx.home, ctx.rates);
  if (amount === null) return { saved: null, target };
  saved += Math.abs(amount);
}
```

**Safety net** (lines 580-590), today read from `decide_settings`; after D-07 read from the flagged goal:
```typescript
const safetyNet: SafetyNet | null =
  v3 === null ? null : {
    protect: v3.safety_net_protect !== false,
    size: netSize === null ? null : minorUnits(netSize),
    saved: minorUnits(reserve ?? 0),
    locked: v3.safety_net_locked !== false,
  };
```
Keep "no row = null (starter size, protection on, locked)". `size null` means the starter; do not coerce it to 0.

**Debt** (lines 551-583): `debts: V3Debt[] = debtList.map(...)`; `V3Debt` shape is `types.ts:75` (`id, kind, balance, minimum, apr, secured, isHousing, dueDay?, joint?, paidThisMonth?, seriesId?`). The debt connection point adds `paidOff` / payoff date and excludes `paid_off_on != null` and `deleted_at` debts before the engine call.

**Locked goals (new):** research example `lockedGoalsKept(goals)` (06-RESEARCH "Locked-goal protected amount"); `V3Inputs` (`types.ts:87`) gets a new optional field (use `readonly lockedGoals?: ...`, optional, like `safetyNet?` and `essentialCategoryIds?`, so hand-built test inputs keep compiling).

**Contract tests to write first (red):** (a) round-trip per point; (b) property "adding a debt never raises the lowest point" extending `src/engine/decide/v3/__tests__/invariants/debts.test.ts` and `arbitraries.ts`; (c) contribution counted once: `buildV3Inputs.ts:495` today does `if (tagged) return 'envelope_deposit'; // D-22 stand-in`; a goal-tagged series occurrence and its line must produce one saving amount; (d) parity: every `safety-net.json` case gives the same `SafetyNet` from the interim columns and from the goal row.

### `src/engine/decide/v3/*` (modify: locked goals, new FactCode)

**Analog:** itself. Relevant exact code:

`funds/envelopes.ts` (whole file) - today envelopes are only usable for their own purpose:
```typescript
export function ownEnvelope(envs: readonly Envelope[], envelopeId: string | null): MinorUnits {
  if (envelopeId === null) return minorUnits(0);
  const e = envs.find((x) => x.id === envelopeId);
  return e === undefined ? minorUnits(0) : e.saved;
}
```
`safetyNet.ts` `resolveSafetyNet` (lines 41-70): `floor = off ? 0 : Math.min(saved, size)`; `usable: off ? saved : locked ? 0 : floor`. Locked goals follow the same "kept out" idea, named separately from the net (D-06).

`types.ts:140` `FactCode` union: add the new code (for example `locked_goals_kept`) with its comment in the same trailing-comment style (`// net_locked: 05.4 D-61.` and so on). Ripple tests listed by research: `copy/__tests__/copyContract.test.ts`, `outputs-are-codes.test.ts`, `public-api.test.ts`, `barrel.test.ts`; also `FACT_KEYS` and `FACT_VALUE_KEYS` (imported in `copyContract.test.ts` lines ~33-40) and the en.ts copy placeholders must agree in both directions.

### `rightAnswers/cases/goals.json` (test data)

**Analog:** `cases/safety-net.json`. Case shape (lines 1-60): `{ id, topic, persona, situation, fixture: { asOf, currency, region, pay, usualMonth, thisMonth, historyMonths, quickEstimates, recordsAsOf, accounts[], safetyNet, bills, debts, userLine, factLines, check }, expected }`. Required edits beyond the new JSON:
- `rightAnswers/schema.ts:5` add `'goals'` to `TOPICS`.
- `rightAnswers/fixture.ts:383` maps `f.safetyNet` into engine inputs; add the locked/unlocked goal fixture field mapping there.
- `knownRed/goals.json` must exist if the loader requires one per topic (check `loader.ts`).
- Existing approved cases must not change (`npm run check:right-answers`); new cases need `status: approved` by the owner.
- Runner semantics: approved and not in knownRed must match; knownRed cases must fail (`rightAnswers.test.ts` header).

### `supabase/migrations/20261106000100_grow_*.sql` (migration, CRUD)

**Analogs:** `20261103000200_overdraft_rate_and_debt_due_day.sql` (newest `apply_patches`, 450 lines, function body lines 15-450), `20261024000100_pots_and_debt_housing.sql` (savings_goals evolution), `20261016000110_decide_depth_tables.sql` (table, guard, triggers).

**Column and grant style** (200-line header, lines 5-13):
```sql
alter table public.accounts add column if not exists overdraft_rate text ...;
alter table public.debts add column if not exists due_day smallint ...;
grant insert (due_day) on public.debts to authenticated;  -- 05.4
grant update (due_day) on public.debts to authenticated;  -- 05.4
```
Column-level grants only, never table-wide. Named constraints: `drop constraint if exists` then `add` (`20261024000100` lines 8-14).

**Shape check to relax** (A8): `20261024000100` lines 12-14:
```sql
alter table public.savings_goals drop constraint if exists savings_goals_pot_shape;
alter table public.savings_goals add constraint savings_goals_pot_shape
  check (kind <> 'pot' or (target is not null and ready_by is not null and monthly_amount is null and check_id is null));
```
This blocks open-ended goals and goals with `monthly_amount`; the Grow version must allow both.

**New table template** (`20261016000110` lines 76-98, 124-134): `id uuid primary key`, `household_id ... references public.households(id) on delete cascade`, `created_by uuid not null default auth.uid() references auth.users(id) on delete cascade`, `updated_by`, `is_sample`, `deleted_at`, `version integer not null default 1`, `created_at`, `updated_at`; bounded checks (`char_length(btrim(name)) between 1 and 80`, `currency ~ '^[A-Z0-9]{2,4}$'`, amounts `between ... and 10000000000000`); partial live index; `guard_*` trigger function (`security definer set search_path = ''`, `revoke execute ... from public, anon, authenticated`) that fixes `id`, `household_id`, `created_at`, `is_sample` on update and stamps `updated_at`; then `set_version` (`bump_version()`) and `set_updated_by` triggers; RLS policy for owner-private rows (as "own savings goals"); `on delete cascade` from `households` for erasure.

**D-07 data step:** idempotent `insert ... select ... where not exists (flagged goal)`, one flagged goal per `decide_settings` row that has a net record (size, locked, protect, `account_id = reserve_account_id`, `opening_saved` = account opening balance + sum of paid non-deleted transactions). Pots migrate as locked (Q1 default).

**Note on `paid_off`:** the research says `paid_off_at`; the real column is `debts.paid_off_on` (date), already in `DEBT_COLUMNS` and `DEBT_PATCH_KEYS`. Reuse it; do not add a duplicate.

**`apply_patches` re-issue:** copy `create or replace function public.apply_patches(...)` from `20261103000200` (lines 15-450) in full, add `holdings`, `holding_lots` and the new `savings_goals`/`debts` columns to the three entity lists, `v_allowed` list and column-type map, and end with `grant execute on function public.apply_patches(jsonb, jsonb) to authenticated;` (line 450). Do this once for the whole phase. `npm run lint:migrations` (squawk); destructive drops need `-- contract-ok: min_version >= X` and wait for a later migration.

Next free migration timestamp: after `20261103001000` use `20261106000100`.

### `supabase/tests/database/89-91_*.test.sql` (pgTAP)

**Analog:** `82_overdraft_rate_and_debt_due_day.test.sql`.

**Skeleton** (lines 1-30):
```sql
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values (...);
create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create function public.t82_ap(e text, i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', e, 'id', i, 'expectedVersion', public.t82_ver(e, i), 'patch', p))) ->> 'status');
$$;
```
Then `extensions.has_column`, `col_is_null`, `throws_ok($$...$$, '23514', null, 'msg')` under `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', true);`. Helper names are suffixed with the test number (`t89_`, `t90_`, `t91_`). Cases to include: second flagged goal fails (23505), open-ended goal insert passes, `holdings`/`holding_lots` patch + undo via `apply_patches`, cross-household reference refused (42501), D-07 migration copies and is idempotent.

**Erasure** (`70_decide_v3_erasure.test.sql` lines 100-135): delete the member, then the owner, and assert zero rows per table:
```sql
select extensions.is((select count(*)::int from public.savings_goals where household_id in (select id from a_hh_gone)), 0, 'no savings_goals (buckets) remain');
```
Add `holdings`, `holding_lots` lines to a new erasure file (file 91 or a copy of 70's structure); update the `plan(N)` count.

### `src/db/holdings.ts`, `src/db/holdingLots.ts` (db access, CRUD)

**Analog:** `src/db/debts.ts`.

**Structure to copy:** `Row` interface (lines 8-34), `*_COLUMNS` string (36-37, the cache-shape lock hashes it), `New*` = `Pick<Row,...>`, `*Patch = Partial<Pick<...>>`, `*_INSERT_KEYS`/`*_PATCH_KEYS` `as const satisfies readonly (keyof ...)[]` (lines 82-124; must mirror SQL grants exactly), then:
```typescript
export async function fetchDebts(client: DbClient, householdId: string): Promise<DebtRow[]> {
  const { data, error, status } = await client.from('debts').select(DEBT_COLUMNS)
    .eq('household_id', householdId).is('deleted_at', null).order('created_at', { ascending: true });
  if (error) throw toDbError(error, status);
  return (data as DebtRow[] | null) ?? [];
}
export async function insertDebt(client: DbClient, row: NewDebt): Promise<DebtRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, DEBT_INSERT_KEYS, 'insertDebt');
  const { data, error, status } = await client.from('debts').insert(row).select(DEBT_COLUMNS).single();
  if (!error) return data as DebtRow;
  if (error.code === UNIQUE_VIOLATION) { const existing = await fetchDebt(client, row.id); if (existing) return existing; } // MON-08 replay
  throw toDbError(error, status);
}
export async function updateDebt(client, id, expectedVersion, patch) { /* .update(patch).eq('id', id).eq('version', expectedVersion) ; 1 row ok; else VersionConflictError / NotFoundError */ }
```
Imports: `import { NotFoundError, VersionConflictError, toDbError } from './errors'; import { assertAllowedKeys, type DbClient } from './rows';`. Any change to `*_COLUMNS` requires `CACHE_SCHEMA_VERSION` bump + `npm run check:cache-version -- --update`.

### `src/data/queries/grow*.ts` (query hook, read)

**Analog:** `src/data/queries/decide.ts` lines 1-60.
```typescript
export function useDecideChecks(userId?: string, householdId?: string): UseQueryResult<DecideCheckRow[]> {
  return useQuery({
    queryKey: queryKeys.decideChecks(userId ?? '', householdId ?? ''),
    queryFn: () => fetchDecideChecks(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}
```
Imports: `import { supabase } from '@/services/supabase'; import { queryKeys } from '../keys';`. Keys live in `src/data/keys.ts` (`debts: (householdId) => ['debts', householdId] as const` line 69; `savingsGoals: (userId, householdId)` line 73). Owner-private tables key by user and household; household-scoped by household only. Derived models use `useMemo` and never go into the cache (bigint, Pitfall 8). Read-model composition pattern: `src/features/decide/pots/usePots.ts` `usePotsRead` (lines 43-63): `{status: 'loading'|'error'|'ready', model, refetch}`.

### `src/data/mutations/grow*.ts` (mutation, queued CRUD)

**Analog:** `src/data/mutations/debts.ts` (whole file; the patterns below).

**Imports** (lines 5-29) - copy verbatim, swapping debt for the entity:
```typescript
import { useMutation } from '@tanstack/react-query';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';
```

**Core write pattern: register defaults so the paused queue can replay** (`registerDebtMutations`, lines 175-216, insert flavour):
```typescript
qc.setMutationDefaults(mutationKeys.addDebt, {
  mutationFn: (vars: AddDebtVars) => guardSession(vars, async () => {
    const client = await writeClient();
    const row = await insertDebt(client, vars.row);
    const step = buildStep(vars.stepId, 'debtAdded', { name: vars.row.name }, inverseOfInserts('debts', [{ id: row.id, version: row.version }]));
    await recordUndoStepSafely(qc, client, step, vars.ownerId);
    return row;
  }),
  scope: WRITE_SCOPE, retry: shouldRetryWrite, retryDelay: writeRetryDelay,
  onMutate: async (vars) => { markSession(vars); await qc.cancelQueries({ queryKey }); /* optimistic upsertRow(..., 'end') with pending: true */ },
  onSuccess: (row, vars) => { /* upsertRow(real row); invalidate */ },
  onError: async (err, vars) => { const cls = classifySettledWriteError(err); /* roll back; recordFailedWrite({ entity, entityId, kind: cls, code: settledWriteErrorCode(err), attempted: { labelKey, fields } }) */ },
});
```
**Patch flavour** (`patchDefaults`, lines 100-173): `resolveExpectedVersion('debts', id, expectedVersion)` -> `updateX(...).catch((err) => acceptIfAlreadyApplied(err, patch))` -> `recordWrittenVersion('debts', id, [vars.expectedVersion, expected], row.version)` -> `buildStep(..., inverseOfPatches('debts', [{ id, before, versionAfter: row.version }]))`. Version conflicts are parked via `recordFailedWrite` with `'version-conflict'`; only field names are stored, never amounts or names.

**Validation helpers** (lines 63-82): `validName` (1-80), `validMinor` (`Number.isSafeInteger`, 0..10^13), `validApr` regex; mirror DB checks.

**Keys:** add to `mutationKeys` in `keys.ts` like `addDebt: ['debts','add'] as const` (line 150). Register in `src/data/mutations/index.ts` (imports lines 9-25; add `registerGrowMutations`). Unique-key rule from index.ts header: a key may be registered only once.

**Atomic multi-row writes** (D-16 sale; goal Add money = transfer pair + goal tag): analog is `src/data/mutations/boughtWrite.ts` / `decideGoAhead.ts` (multi-entity, single undo step). Prefer one `apply_patches` call with several ops (one undo step) or a dedicated RPC. Transfer legs come from `src/engine/transfer/pair.ts`:
```typescript
buildTransferLegs({ transferId, outId, inId, from: {id, currency}, to: {id, currency}, amountOut, amountIn, localDate })
// -> { ok: true, legs: [out, in] } | { ok: false, error: 'same-account' | 'non-positive' | 'same-currency-mismatch' | 'bad-date' }
```
The goal tag (`goal_id`) goes on the goal-side leg; DB trigger `check_transfer_pair` enforces pairing.

**Tests:** `src/data/mutations/__tests__/debts.test.tsx`, `debtsAddEdit.test.tsx`, `debtsPaysInFull.test.tsx` are the templates (paused queue, optimistic cache, undo step, conflict parked).

### `src/data/exportManifest.ts` (config) and its guard test

**Analog:** `exportManifest.ts:66-80` - one entry per table listing user-recognisable columns, with `// 05.4` style comments per phase block:
```typescript
debts: [ 'id', 'household_id', ..., 'deleted_at', 'created_at', 'updated_at',
  // 05.2
  'pays_in_full', 'paid_off_on',
  // 05.4
  'due_day' ],
```
Add `holdings`, `holding_lots` and a `// 06` block for new `savings_goals`/`debts` columns. `version` and `updated_by` are excluded. The guard test `src/data/__tests__/exportManifest.test.ts` (per-phase added-column assertions near lines 41-43) fails if a `src/db` module reads a table in neither `EXPORT_MANIFEST` nor `NOT_USER_DATA`; extend its per-phase assertion block too.

### `app/(app)/(tabs)/grow.tsx` (route, request-response)

**Analog:** `app/(app)/(tabs)/decide.tsx`: a default-export route component that renders the feature screen; dev-only modules are `require`d inside `if (!__DEV__) return null` branches. Create the route first, flip `TAB_AVAILABILITY.grow` (`src/shell/tabBar/availableTabs.ts:15`, `grow: false,`) last, because `Tabs.Screen` entries come from `availableTabs()` and a missing route breaks the shell. `TAB_ORDER` already includes `'grow'` (`tabs.ts:6`). Update `availableTabs` tests.

### Grow sheets (component, request-response)

**Analog:** `src/features/decide/check/LineEditorSheet.tsx`.

**Imports** (lines 1-17):
```typescript
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { MoneyInput } from '@/ui/MoneyInput';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
```
**Core** (lines 112-114, 131-145):
```tsx
<Sheet visible onDismiss={onCancel} accessibilityLabel={title} dirty={dirty}>
  <SheetHeader title={title} cancelLabel={t('decide.lineEditor.cancel')} onCancel={onCancel} />
  <SheetScroll contentContainerStyle={styles.column}>
    <MoneyInput value={value.amount > 0 ? value.amount : null} currency={currency}
      onChange={(minor) => setValue((v) => ({ ...v, amount: minor ?? 0 }))}
      label={t('decide.lineEditor.amount')} accessibilityLabel={t('decide.lineEditor.amount')} />
```
`canSave` gating, `useIsDirty` for discard-confirm, `Chip` radiogroup for choices, `textRole(pairing, 'body')` for text. Confirm sheets use `src/ui/ConfirmSheet.tsx`; toasts `ToastView`; haptics only via `src/ui/haptics.ts` (`hapticLight/hapticSelection/hapticWarning`, and a success wrapper; `*Async` expo-haptics only). Also `ToggleRow` (Lock this goal), `Pill`, `Keypad`.

### Grow list screens (component, CRUD)

**Analog:** `src/features/decide/pots/{PotsScreen,PotRow,PotSheet,potsModel,usePots}`. Reuse only the pure helpers (`resolvePotAmounts`, `wholePercent`, `buildPotsModel` shape) by moving them into `features/grow`; the research says Decide-made pots are "do not build on". Read-model hook shape: `usePotsRead()` returning `{status, model, refetch, userId, householdId, today}`.

### i18n copy (`src/i18n/locales/en.ts`)

**Analog:** `decide.info.*` entries ~lines 2593-2600 for declarative copy, and `{{placeholder}}` plural keys like `investPreview_one` / `investPreview_other` (~line 2635). Grow strings go under a new top-level `grow` key; money values are placeholders, never concatenated. Voice: declarative, never "recommend / advice / should / best / better / optimal". Copy lint test modelled on `copyContract.test.ts` (loads `en` and scans keys): scan every `en.grow.*` string against a forbidden-word regex. Payoff names are fixed: "Highest rate first", "Smallest balance first".

## Shared Patterns

### Money and rounding
**Source:** `src/engine/money/rounding.ts` (`divideHalfUp`), `src/engine/payoff/types.ts` (`ceilDivide`, `minorFromBigInt`, `percent`, `MONTHLY_RATE_DENOMINATOR`)
**Apply to:** every engine file and every connection mapper. Integer minor units; no floats; display rule: half-up to the cent except "needed each month", which rounds up. `npm run check:money-mirror` checks the SQL mirror `div_half_up`.

### Engine isolation
**Source:** `.dependency-cruiser.cjs`, `npm run depcruise`
**Apply to:** `src/engine/grow/*`, `src/engine/payoff/*`. Nothing under `engine/` imports `db/`, `state/`, `services/`, `ui/` or `react`.

### Version-conditional queued writes with one Undo step
**Source:** `src/data/mutations/debts.ts` lines 100-173 and 175-216
**Apply to:** all Grow mutations (see the mutation section above).

### Column-level grants + guard trigger + owner-private RLS
**Source:** `20261016000110_decide_depth_tables.sql` lines 98-134; `20261103000200` lines 10-13
**Apply to:** `holdings`, `holding_lots`, new `savings_goals`/`debts` columns.

### Cache-shape lock
**Source:** `scripts/check-cache-version.mjs`, `scripts/cache-shape.lock.json`
**Apply to:** any change to `*_COLUMNS`, `rows.ts`, `keys.ts`. Bump `CACHE_SCHEMA_VERSION`, run `npm run check:cache-version -- --update`.

### Haptics and success moment
**Source:** `src/ui/haptics.ts` (only `impactAsync` / `notificationAsync` / `selectionAsync`)
**Apply to:** goal reached (success), cap breach / confirm-withdraw (warning), button taps (light).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/features/grow/calculators/*` (typed loan/savings/compound/debt calculators, 150 ms debounce, "How it was worked out" box) | component | transform | No existing calculator UI; use `design/calc.js`, `design/calculators-screens.js`, `LEDGER.md` GC10/20/30/40 and 06-UI-SPEC as the contract. Engine calls follow the payoff modules. Chart components (`LineChart`, `BarChart`, `StackedBar`) per UI-SPEC are hand-rolled with `react-native-svg`; look at `src/features/decide/charts/` for geometry style. |
| `src/features/grow/growFeatureFlags.ts` | utility | n/a | No level system until Phase 9. Use the `availableTabs.ts` style (a pure, injectable all-on record) as the seam; test the Basics-level state with an injected flag. |
| Repeating-transfer "Expected line" for goal contributions (GRW-03) | migration + materialiser | event-driven | `recurring_series` / `materialise_series` only emit single-leg rows (Pitfall 5). Default (Q4): the series carries `goal_id`, the Expected line sits in the source account, and confirming it builds the pair via `buildTransferLegs`. Re-issue `materialise_series` from its newest definition (find with `grep -ln "materialise_series" supabase/migrations`). |
| Net worth with holdings (Q5) | utility | transform | The net-worth sum is on the Home AccountsCard; locate the single source at task time, add holdings there once. |
| Value history chart / cost-basis lots UI | component | CRUD | No analog; new tables `holdings`, `holding_lots` (kind `value` rows give history). |

## Gotchas Confirmed in the Codebase (for the planner)

1. `debts.paid_off_on` already exists (date) in `DEBT_COLUMNS`, `DEBT_PATCH_KEYS`, and the export manifest. RESEARCH names it `paid_off_at`; reuse the existing column.
2. `rightAnswers/schema.ts:5` has a closed `TOPICS` list; a `goals` topic needs it extended plus `knownRed/goals.json`.
3. `savings_goals` grant lists (`20261024000100` line 21-22) do not include `monthly_amount`, `kind`, or `account_id`/`bucket` on update/insert in that migration; later migrations added some. Read the cumulative grants (`grep -n "grant .* savings_goals" supabase/migrations/*.sql`) before writing the new ones.
4. `guard_savings_goal` freezes `check_id`, `name`, etc. unless `fincwin.decide_rpc = 'on'` in the original, and forces `kind := 'pot'` on insert in the 20261024 version. Re-issue it from the NEWEST definition (find with `grep -ln "function public.guard_savings_goal"` and take the last by timestamp) when adding `is_safety_net`/`locked`.
5. `jest.config.js` uses `hasSource(...)` guards, so a new folder under the 95% rest rule is silently under-enforced until added to the 100% list.
6. `V3Inputs` (types.ts:87) uses trailing optional fields with phase-tagged comments; follow that for `lockedGoals`.

## Metadata

**Analog search scope:** `src/engine/payoff`, `src/engine/transfer`, `src/engine/decide/v3` (types, safetyNet, funds, rightAnswers), `src/features/decide/{snapshot/v3,pots,check}`, `src/data/{keys,queries,mutations,exportManifest}`, `src/db/debts.ts`, `src/ui`, `src/shell/tabBar`, `app/(app)/(tabs)`, `supabase/migrations`, `supabase/tests/database`, `jest.config.js`, `src/i18n/locales/en.ts`
**Files scanned:** about 45 read or grepped
**Pattern extraction date:** 2026-11-06
