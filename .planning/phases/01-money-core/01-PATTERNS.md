# Phase 1: Money Core - Pattern Map

**Mapped:** 2026-09-24
**Files analyzed:** 36 (new/modified) across engine, migrations, Edge Functions, pgTAP, client data layer, UI, CI
**Analogs found:** 33 / 36 (3 genuinely novel: `stamp_fx_rate()` trigger, `resolve-rate` Edge Function, `fx-monitor` Edge Function — no prior trigger-with-external-callback or scheduled-email pattern exists in the codebase yet; closest partial analogs given anyway)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/engine/money/types.ts` | model (types) | transform | `.planning` ARCHITECTURE.md Pattern 7 (no code analog yet) | no-analog |
| `src/engine/money/rounding.ts` | utility | transform | `src/engine/guards/assertNever.ts` (engine-purity convention only) | role-match |
| `src/engine/money/arithmetic.ts` | utility | transform | `src/engine/guards/assertNever.ts` | role-match |
| `src/engine/money/currencyExponents.ts` | config (static data) | transform | `src/theme/accents.ts`-style const map (not read, same shape referenced via `themeCache.ts` usage) | role-match |
| `src/engine/money/parseAmount.ts` | utility | transform | `src/config/env.ts` (`readClientEnv` — pure fn, collects all problems, typed result union) | role-match |
| `src/engine/money/formatAmount.ts` | utility | transform | `src/config/env.ts` | role-match |
| `src/engine/money/localDate.ts` | utility | transform | `src/config/env.ts` | role-match |
| `src/engine/split/allocate.ts` | utility | transform | `src/engine/guards/assertNever.ts` | role-match |
| `src/engine/money/__tests__/*.test.ts` | test | — | `src/engine/guards/__tests__/assertNever.test.ts` | exact |
| `supabase/migrations/..._accounts.sql` | migration | CRUD | `supabase/migrations/20260922000100_household_of_one.sql` | exact |
| `supabase/migrations/..._transactions.sql` (+ `stamp_fx_rate()` trigger) | migration | event-driven (trigger) + CRUD | `supabase/migrations/20260922000100_household_of_one.sql` (`bump_version()` trigger shape) | role-match |
| `supabase/migrations/..._custom_currencies.sql` | migration | CRUD | `supabase/migrations/20260922000100_household_of_one.sql` | exact |
| `supabase/migrations/..._currencies.sql` (Frankfurter metadata cache) | migration | CRUD (service-role write, client read) | `supabase/migrations/20260922000300_fx_rates.sql` | exact |
| `supabase/migrations/..._fx_holds.sql` | migration | CRUD (quarantine) | `supabase/migrations/20260922000300_fx_rates.sql` | exact |
| `supabase/migrations/..._fx_monitor_schedule.sql` | migration (pg_cron) | batch/event-driven | `supabase/migrations/20260922000400_fx_sync_schedule.sql` | exact |
| `supabase/migrations/..._profile_money_prefs.sql` (home_currency, show_cents on `profiles`) | migration (additive) | CRUD | `supabase/migrations/20260922000100_household_of_one.sql` (`profiles` table + column grant) | exact |
| `supabase/functions/fx-sync/index.ts` (extended: fallback + plausibility) | service (Edge Function) | batch + request-response | `supabase/functions/fx-sync/index.ts` (itself, extend in place) | exact |
| `supabase/functions/fx-sync/openErApi.ts` | service (pure parser) | transform | `supabase/functions/fx-sync/parse.ts` | exact |
| `supabase/functions/fx-sync/plausibility.ts` | service (pure fn) | transform | `supabase/functions/fx-sync/parse.ts` | role-match |
| `supabase/functions/resolve-rate/index.ts` | service (Edge Function) | request-response | `supabase/functions/fx-sync/index.ts` | role-match (novel: JWT-authed not shared-secret) |
| `supabase/functions/fx-monitor/index.ts` | service (Edge Function, scheduled) | batch | `supabase/functions/fx-sync/index.ts` | role-match (novel: Resend email side-effect) |
| `supabase/tests/database/05_accounts_transactions.test.sql` | test (pgTAP) | — | `supabase/tests/database/01_household_of_one.test.sql` | exact |
| `supabase/tests/database/06_fx_stamping.test.sql` | test (pgTAP) | — | `supabase/tests/database/04_fx_rates.test.sql` | exact |
| `supabase/tests/database/07_money_rounding_mirror.test.sql` | test (pgTAP, fixture cross-check) | — | `supabase/tests/database/04_fx_rates.test.sql` | role-match |
| `supabase/tests/database/08_custom_currencies.test.sql` | test (pgTAP) | — | `supabase/tests/database/02_rls_isolation.test.sql` | exact |
| `supabase/tests/fixtures/moneyRoundingCases.ts` | config (shared test fixture) | — | none (novel — see Open Questions in RESEARCH) | no-analog |
| `src/data/client.ts` | provider/config | request-response | `src/services/supabase/client.ts` | role-match |
| `src/data/onlineManager.ts` | provider | event-driven | `src/services/supabase/client.ts` (`AppState.addEventListener` lifecycle wiring) | role-match |
| `src/data/queries/accounts.ts` | hook (query) | CRUD (read) | `src/services/supabase/client.ts` (client usage convention) | role-match |
| `src/data/queries/transactions.ts` | hook (query) | CRUD (read) | `src/services/supabase/client.ts` | role-match |
| `src/data/mutations/addTransaction.ts` | hook (mutation) | CRUD (write) + event-driven (queue) | `src/services/supabase/largeSecureStore.ts` (write/registration discipline), `src/services/storage/wipe.ts` (registration pattern) | role-match |
| `src/data/mutations/editTransaction.ts` | hook (mutation) | CRUD (write) + event-driven (queue) | same as above | role-match |
| `src/data/cache/persister.ts` | service (storage adapter) | file-I/O | `src/services/supabase/largeSecureStore.ts` | exact |
| `src/data/sync/useSyncStatus.ts` | hook | event-driven | `src/theme/ThemeProvider.tsx` (`ready`-gated hook + context pattern) | role-match |
| `src/services/fx/currencyPicker.ts` | service | CRUD (read) | `src/theme/themeCache.ts` (profile-row + local-cache read pattern) | role-match |
| `src/ui/RateAttribution.tsx` | component | request-response (display) | `src/ui/Screen.tsx` | role-match |
| `src/ui/SyncStatusLine.tsx` | component | request-response (display) | `src/ui/Screen.tsx` | role-match |
| `src/i18n/locales/en.ts` (new `money.*`, `sync.*`, `currency.*` keys) | config (i18n) | — | `src/i18n/locales/en.ts` (itself, extend in place) | exact |
| `.github/workflows/ci.yml` (add squawk step) | config (CI) | batch | `.github/workflows/ci.yml` (itself, extend in place) | exact |

## Pattern Assignments

### Engine: `src/engine/money/*`, `src/engine/split/allocate.ts` (utility, transform)

**Analog:** `src/engine/guards/assertNever.ts` + `src/engine/guards/__tests__/assertNever.test.ts` — the only existing engine file. It is thin, but it is the sole proof-in-code of the engine-purity convention every new engine file must follow: no imports outside `engine/`, no React/RN, no I/O, one focused exported function, a docstring explaining *why* (not just what), and a colocated `__tests__/` file.

**Full file** (`src/engine/guards/assertNever.ts`):
```typescript
/**
 * Exhaustive-switch helper. Call in the `default` branch of a switch over a
 * union type; TypeScript narrows `value` to `never` when every member of the
 * union has been handled in an earlier `case`, so a missing case becomes a
 * compile-time error here rather than a silent runtime fallthrough.
 */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
```

**Test pattern** (`src/engine/guards/__tests__/assertNever.test.ts`, full file):
```typescript
import { assertNever } from '../assertNever';

describe('assertNever', () => {
  it('throws with the JSON of the value and the supplied context', () => {
    expect(() => assertNever('unexpected' as never, 'status')).toThrow(
      'Unhandled status: "unexpected"'
    );
  });

  it('throws with the default context when none is given', () => {
    expect(() => assertNever(42 as never)).toThrow('Unhandled value: 42');
  });
});
```

**Secondary analog for pure-function-with-collected-errors shape** — `src/config/env.ts` lines 49-114 (`readClientEnv`): a pure function taking a plain object, collecting every validation problem before throwing once. Use this exact shape for `parseAmount` (D-24's "rejected with a clear message, never silently rounded" — return a discriminated union `{ ok: true, value } | { ok: false, error }` rather than throwing, per RESEARCH.md Pattern 2, but keep the "validate everything, don't bail on the first problem" discipline from `env.ts` where multiple checks apply).

**Directly use RESEARCH.md Code Examples verbatim** (already vetted against this project's conventions) for:
- `halfUpAwayFromZero`, `add`, `MinorUnits` brand — RESEARCH.md Pattern 1 (lines 284-309)
- `parseAmount` region-aware parser — RESEARCH.md Pattern 2 (lines 320-345), **but** apply Pitfall 5 fixes (reject empty wholePart+fractionPart, reject a second decimal separator)
- `allocate` largest-remainder split — RESEARCH.md Pattern 3 (lines 356-373)
- `currencyExponent` exception table — RESEARCH.md Code Examples (lines 553-565), spot-check against `currency-codes` npm data per Assumption A4
- `formatAmount` — RESEARCH.md Code Examples (lines 574-590)
- `captureLocalDateAndZone` — RESEARCH.md Code Examples (lines 597-601)

**Coverage gate:** no wiring needed — `jest.config.js` already auto-adds a 100%-branch threshold for `src/engine/money/` and `src/engine/split/` the moment source files land (see `jest.config.js` lines 16-38, `hasSource()`/`FULL` logic). Do not touch `jest.config.js`.

---

### Migrations: `accounts`, `transactions`, `custom_currencies`, `currencies`, `fx_rate_holds`, `profile_money_prefs`

**Analog A (owned/versioned/RLS'd user tables):** `supabase/migrations/20260922000100_household_of_one.sql`

**Version-bump trigger, reuse verbatim** (lines 12-22, already exists — just attach to new tables, do not redefine):
```sql
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
```

**Table shape convention** (lines 25-56 — client UUID PK, `version integer not null default 1`, `created_at`/`updated_at timestamptz not null default now()`):
```sql
create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
**Deviation required for `accounts`/`transactions` per D-26/MON-08:** PK must be a **client-generated UUID with no server default** (`id uuid primary key` — no `default gen_random_uuid()`), since the client must generate it before the write leaves the device (Pattern 2, ARCHITECTURE.md). Every other table here (`households`, `custom_currencies` if server-assignable) can keep the server-default form.

**Trigger attachment convention** (lines 63-73):
```sql
create trigger set_version
  before update on public.profiles
  for each row execute function public.bump_version();
```

**RLS helper, reuse verbatim, do not redefine** (lines 78-89):
```sql
create or replace function public.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hm.household_id from public.household_members hm where hm.user_id = (select auth.uid())
$$;
```

**RLS policy shape** (lines 131-146 — `to authenticated`, `(select auth.uid())` or `user_household_ids()` initPlan form, explicit column-level grants, no blanket `insert/update` grant):
```sql
create policy "members read their households" on public.households for select to authenticated
  using (id in (select public.user_household_ids()));
...
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (full_name, email, accent, font_pairing, analytics_consent, analytics_consent_at) on public.profiles to authenticated;
```
For `accounts`/`transactions`, this becomes `using (household_id in (select public.user_household_ids()))` for select/insert/update, since these are household-scoped, not single-owner like `profiles`.

**Additive migration for D-25** (home_currency, show_cents on `profiles`): follow the same file as a template — add columns with `alter table public.profiles add column ...` plus a `check` constraint, then extend the existing `grant update (...)` column list (line 146) to include the new columns. Do not touch the RLS policies themselves (unchanged shape).

**Analog B (service-role-only reference table, client-read-only):** `supabase/migrations/20260922000300_fx_rates.sql` — use verbatim for `currencies` (Frankfurter metadata) and `fx_rate_holds` (quarantine table).

**Full file, as direct template:**
```sql
create table public.fx_rates (
  base char(3) not null check (base ~ '^[A-Z]{3}$'),
  quote char(3) not null check (quote ~ '^[A-Z]{3}$'),
  rate numeric(24,10) not null check (rate > 0),
  rate_date date not null,
  source text not null default 'frankfurter-v2' check (source in ('frankfurter-v2', 'open-er-api')),
  fetched_at timestamptz not null default now(),
  primary key (base, quote, rate_date, source)
);
create index fx_rates_quote_date_idx on public.fx_rates (quote, rate_date desc);
alter table public.fx_rates enable row level security;
create policy "signed-in users read fx rates" on public.fx_rates for select to authenticated using (true);
revoke all on public.fx_rates from anon;
revoke insert, update, delete, truncate on public.fx_rates from authenticated;
```
Apply this exact shape (check constraints on currency-code columns, `select`-only policy for `authenticated`, full `revoke` from `anon`, no client write grant) to `currencies` and `fx_rate_holds`. `fx_rate_holds` additionally needs the `>10%` quarantine columns (the held rate, the prior confirmed rate, `confirmed_at`/`auto_accepted_at` nullable columns per D-12) — no existing analog for the confirmation-window columns; design per D-11/D-12/RESEARCH.md Architectural Responsibility Map.

**Analog C (pg_cron schedule):** `supabase/migrations/20260922000400_fx_sync_schedule.sql`, full file — copy verbatim for the `fx-monitor` schedule, changing only the cron name, schedule time (after `fx-sync-daily` completes) and the vault secret names (`fx_monitor_url`, `fx_monitor_secret` or reuse `fx_sync_secret` if `fx-monitor` shares the shared-secret auth model):
```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'fx-sync-daily',
  '30 16 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fx-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

**Novel piece — no analog:** the `stamp_fx_rate()` `BEFORE INSERT OR UPDATE` trigger (D-16/D-04). RESEARCH.md Pattern 4 (lines 384-429) already provides a fully drafted implementation grounded in the `bump_version()` precedent above; use it as the starting draft, not `bump_version()` directly (the logic is materially more complex — `NEW`/`OLD` branching, `fx_rates` lookup, `rate_pending` flag). Flagged MEDIUM confidence in RESEARCH.md — the rounding cast (`::bigint` truncates) must be replaced with an explicit `half_up_away_from_zero(numeric) returns bigint` SQL function per Pitfall 1, mirroring `src/engine/money/rounding.ts`.

---

### pgTAP tests: `supabase/tests/database/05..08_*.test.sql`

**Analog A (single-user provisioning/shape proof):** `supabase/tests/database/01_household_of_one.test.sql` — pattern: `begin; create extension if not exists pgtap; select extensions.plan(N);` then a mix of `extensions.is`, `extensions.ok`, `extensions.throws_ok`, ending `select * from extensions.finish(); rollback;`. Also demonstrates checking function hardening (`prosecdef`, `proconfig` search_path) and index existence (`extensions.has_index`) — reuse for asserting `stamp_fx_rate()` is not `security definer` unless intentionally, and that FX-lookup columns are indexed.

**Analog B (two-user RLS isolation):** `supabase/tests/database/02_rls_isolation.test.sql` — pattern for `08_custom_currencies.test.sql` (per-user-owned data, D-07's "stored per user"): seed two `auth.users`, impersonate each via `set local role authenticated; select set_config('request.jwt.claims', ...)`, assert A cannot see/write B's rows, assert anon is denied via `42501` before RLS even evaluates (line 11-13 comment explains this — anon has no table grant at all). Full block to copy the impersonation idiom from:
```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
...
reset role;
```

**Analog C (service-role-only write, client read-only, check constraints):** `supabase/tests/database/04_fx_rates.test.sql`, full file — direct template for `06_fx_stamping.test.sql`'s constraint assertions and for verifying `currencies`/`fx_rate_holds` reject client writes:
```sql
select extensions.throws_ok(
  $$insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'GBP', 0.85, '2026-09-22', 'frankfurter-v2')$$,
  '42501', null,
  'authenticated cannot insert into fx_rates'
);
```

**`05_accounts_transactions.test.sql`** should combine Analog A's provisioning-proof style with Analog B's cross-household isolation style (transactions are household-scoped, not single-owner), plus a `bump_version()`-on-update assertion copied from `02_rls_isolation.test.sql` lines 73-83 (`update ...; select extensions.is((select version from ...)::int, 2, 'own-row update bumps version via the shared trigger')`).

**`06_fx_stamping.test.sql`** needs new assertions with no direct analog: insert a foreign-currency transaction, assert `rate`/`rate_date`/`rate_source`/`home_amount` are stamped from `fx_rates` regardless of client-supplied values (D-16 "client cannot write a wrong rate" — insert with a deliberately wrong client-supplied `rate` and assert the stored value is the server's, not the client's).

**`07_money_rounding_mirror.test.sql`** is the one file type with no structural analog (a fixture-driven cross-check test, not a schema/RLS proof). RESEARCH.md Open Question 3 (lines 669-672) recommends hand-transcribing `supabase/tests/fixtures/moneyRoundingCases.ts`'s cases into literal `INSERT`/`SELECT` `extensions.is()` assertions here, with a comment referencing the TS file and case count for review-time drift detection.

---

### Edge Functions: `fx-sync` (extend), `resolve-rate` (new), `fx-monitor` (new)

**Analog:** `supabase/functions/fx-sync/index.ts` + `supabase/functions/fx-sync/parse.ts` + `supabase/functions/fx-sync/parse.test.ts` — the only existing Edge Function, and it is the direct parent of all three (extend it for the fallback, clone its shape for the two new ones).

**Imports/bootstrap pattern** (`index.ts` lines 1-2):
```typescript
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates } from './parse.ts';
```

**Constant-time shared-secret auth pattern** (`index.ts` lines 4-23) — reuse verbatim for `fx-monitor` (also pg_cron-invoked, same trust model):
```typescript
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
...
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const expected = Deno.env.get('FX_SYNC_SECRET');
  const got = req.headers.get('x-fx-sync-secret');
  if (!expected || !got || !safeEqual(expected, got)) return json({ ok: false, error: 'forbidden' }, 403);
  ...
});
```
**Deviation required for `resolve-rate`:** per RESEARCH.md Security Domain (V13), `resolve-rate` is client-invoked, not pg_cron-invoked — it must authenticate with the caller's own Supabase JWT (verify `req.headers.get('Authorization')` against `admin.auth.getUser(token)`, then re-check the transaction's `household_id` against that user's `user_household_ids()` server-side before acting), not the shared-secret pattern above. `fx-monitor` keeps the shared-secret pattern (it is pg_cron-only, like `fx-sync`).

**Service-role client + upsert pattern** (`index.ts` lines 36-49) — reuse for all three functions' writes:
```typescript
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const { error } = await admin
  .from('fx_rates')
  .upsert(
    rows.map((r) => ({ base: r.base, quote: r.quote, rate: r.rate, rate_date: r.date, source: 'frankfurter-v2' })),
    { onConflict: 'base,quote,rate_date,source' }
  );
if (error) return json({ ok: false, error: error.message }, 500);
```

**Pure zero-import parser pattern** (`parse.ts` lines 1-58, full file) — the exact template for `openErApi.ts` and `plausibility.ts`. Note the module comment explaining *why* zero imports: "loads identically under Deno ... and Jest ... with no runtime-specific glue." RESEARCH.md Code Examples (lines 619-641) already drafts `openErApi.ts`'s `parseOpenErApiRates` in this exact shape — use it directly, including the verbatim required attribution string (`'Rates By Exchange Rate API'`).

**Error handling convention** (`json` helper, `index.ts` lines 13-14, and the "nothing is written on parse failure" comment at line 32) — every Edge Function response is `{ ok: boolean, ... }` with an explicit status code; parse failures never partially write.

**Test pattern** (`parse.test.ts`, full file) — pure describe/it blocks against fixture data, one `it` per validation branch (reject non-ISO date, reject lowercase currency, reject non-finite rate, skip base===quote without throwing). Apply the same one-branch-per-`it` discipline to `openErApi.test.ts` and `plausibility.test.ts`.

**`deno.json`** (full file, copy verbatim into each new function's directory): `{ "imports": {} }`

**Pitfall to carry forward:** `index.ts` line 51's `date: rows[0]?.date` response field is explicitly flagged in RESEARCH.md Pitfall 4 as unsafe to reuse for staleness logic (it only reflects the first currency in the batch) — `fx-monitor`'s staleness check must query `max(rate_date)` per currency independently, never reuse this pattern.

---

### Client data layer: `src/data/*`

**Analog A (env-driven singleton with lifecycle wiring):** `src/services/supabase/client.ts`, full file — direct template for `src/data/client.ts` and `src/data/onlineManager.ts`:
```typescript
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/config/env';
import { LargeSecureStore } from './largeSecureStore';

const env = getEnv();
export const AUTH_STORAGE_KEY = 'fincwin:auth';
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, { ... });

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
```
Mirror this exact "module-scope singleton + external lifecycle listener" shape for `onlineManager.ts` (RESEARCH.md Pattern 6, lines 482-484 — `onlineManager.setEventListener` wired to `NetInfo.addEventListener` at module scope, matching `AppState.addEventListener` here). `data/client.ts` mirrors it for the `QueryClient` singleton + `PersistQueryClientProvider` wiring (RESEARCH.md Pattern 5, lines 441-467).

**Analog B (encrypted storage adapter, satisfies an external `Storage`-like interface):** `src/services/supabase/largeSecureStore.ts`, full file — direct template for `src/data/cache/persister.ts`. Key points to carry forward:
- The `fincwin:`-prefix and `registerSecureKey`/`registerWipeHandler` discipline (line 12, `import { registerSecureKey } from '@/services/storage/wipe';`) — `persister.ts` must call `registerWipeHandler` from `src/services/storage/wipe.ts` so sign-out actually clears the persisted query cache (Phase 0 D-15, this phase's own D-15).
- Class-based adapter implementing `getItem`/`setItem`/`removeItem` (lines 47-92) — `createAsyncStoragePersister({ storage: new LargeSecureStore() })` (RESEARCH.md Pattern 5 line 447) reuses this class directly; `persister.ts` should be a thin wrapper wiring `LargeSecureStore` + `buster`/`maxAge` options, not a new encryption layer.

**Wipe registration pattern** (`src/services/storage/wipe.ts`, lines 24-29, full function):
```typescript
export function registerWipeHandler(handler: WipeHandler): () => void {
  handlers.set(handler.id, handler);
  return () => {
    handlers.delete(handler.id);
  };
}
```
`WipeHandler` interface (lines 13-17) includes an optional `pendingWriteCount(): Promise<number>` — the mutation queue's wipe handler should implement this so the sign-out confirmation UI's "N changes not yet saved" warning (already shipped, see `src/i18n/locales/en.ts` `signOut.confirm.body_one`) picks up queued-mutation counts, not just the theme/session subsystems it currently sums.

**Analog C (`ready`-gated hook + context, local-cache-then-remote-apply):** `src/theme/ThemeProvider.tsx` + `src/theme/themeCache.ts` — direct template for `useSyncStatus.ts`'s "hydrate from cache, gate rendering on `ready`" shape and for `services/fx/currencyPicker.ts`'s "profile row is truth, local cache is a fast-path" shape.

**`themeCache.ts` read/write pattern** (lines 36-56, full functions) — apply the same "corrupt/missing data falls back to a safe default, never throws" discipline to any new local-cache reader (e.g., a cached home-currency/show-cents reader, if `currencyPicker.ts` needs one beyond what TanStack Query's own cache already provides):
```typescript
export async function readThemeCache(): Promise<ThemeCacheValue> {
  try {
    const raw = await AsyncStorage.getItem(THEME_CACHE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const { accent, pairing } = parsed as Record<string, unknown>;
    return {
      accent: isAccentKey(accent) ? accent : DEFAULTS.accent,
      pairing: isFontPairingKey(pairing) ? pairing : DEFAULTS.pairing,
    };
  } catch {
    return DEFAULTS;
  }
}
```

**`ThemeProvider.tsx` ready-gate + hydrate-then-persist pattern** (lines 24-49) — template for any new provider/hook needing "read cache on mount, don't re-write until hydration is done":
```tsx
const [ready, setReady] = useState(false);
useEffect(() => {
  let cancelled = false;
  readThemeCache().then((cached) => {
    if (cancelled) return;
    setAccent(cached.accent);
    setPairing(cached.pairing);
    setReady(true);
  });
  return () => { cancelled = true; };
}, []);

useEffect(() => {
  if (!ready) return;
  void writeThemeCache({ accent, pairing });
}, [ready, accent, pairing]);
```

**`useTheme()` context-hook-throws-if-missing-provider pattern** (lines 78-84) — apply the same shape if `useSyncStatus()` needs a context (it likely does not — RESEARCH.md Pattern 6 shows it as a standalone hook reading `useMutationState`/`onlineManager` directly, no provider needed).

**For `addTransaction.ts`/`editTransaction.ts` mutation bodies and `useSyncStatus.ts`:** no direct in-repo analog exists yet (TanStack Query is not installed). Use RESEARCH.md Pattern 5 (lines 439-467) and Pattern 6 (lines 476-491) verbatim as the starting implementation — they are already grounded in verified TanStack Query v5 docs and cross-referenced against this project's `LargeSecureStore`/`onlineManager` wiring needs. Register `setMutationDefaults` at module scope per Pitfall 3 (RESEARCH.md lines 526-530), not inside a component.

---

### `src/services/fx/currencyPicker.ts`

**Analog:** `src/theme/themeCache.ts` for the "local cache read with safe fallback" half; the actual currency list should come through a `data/queries/currencies.ts`-style TanStack Query hook reading the `currencies` table (D-08 — "no curated shortlist at the data layer"), not a bespoke service call. Treat `currencyPicker.ts` as a thin selector/formatter over that query's data plus the user's custom currencies, mirroring how `ThemeProvider.tsx` composes `themeCache` (local) with the `profiles` row (remote, via `applyRemote`).

---

### UI: `src/ui/RateAttribution.tsx`, `src/ui/SyncStatusLine.tsx`

**Analog:** `src/ui/Screen.tsx` (existing, only file currently in `src/ui/`) for component conventions (token-only styling per `docs/design/token-exceptions.md`, no raw colours — enforced by `src/theme/__tests__/noRawColours.test.ts`). Both new components must:
- Read all copy through `src/i18n/locales/en.ts` (extend the catalogue, do not inline JSX text — enforced by `eslint-plugin-i18next` per the `en.ts` module comment).
- Consume `useTheme()` from `src/theme/ThemeProvider.tsx` for `colors`/`fonts`, not hardcoded values.
- `SyncStatusLine.tsx` renders the copy shape already specified in D-14 (`offline · 3 changes queued` / `synced 2 minutes ago`) — add these as new i18n keys under a `sync.*` namespace, following the existing `signOut.confirm.body_one`/`body_other` pluralization pattern (lines 85-86 of `en.ts`) for the "N changes queued" count.
- `RateAttribution.tsx` needs a `sync.attribution.openErApi` (or `currency.attribution.*`) i18n key carrying the verbatim `'Rates By Exchange Rate API'` text plus a link, per D-13 and the Edge Function pattern above — do not paraphrase.

---

### `src/i18n/locales/en.ts` (extend in place)

**Analog:** the file itself — follow its existing structure exactly (nested namespace object, `as const`, module-level doc comment listing copy-ownership status per key group, typographic apostrophes only, `_one`/`_other` i18next pluralization keys where a count is involved). New namespaces needed: `money.*` (entry FX note, custom-currency validation, home-currency/auto-convert setting copy — ported verbatim from the prototype per CONTEXT.md Specific Ideas), `sync.*` (status line), `currency.*` (picker + attribution). Mark any copy not yet user-reviewed the same way line 22's `tagline` is marked (`// AWAITING USER COPY (D-16): placeholder only, do not invent final copy.`).

---

### `.github/workflows/ci.yml` (extend in place)

**Analog:** the file itself, full content already read. Add the squawk step (RESEARCH.md Code Examples lines 604-609) as a new step in the existing `checks` job, after `npm run verify:gates` and before the service-role grep step, or as its own job mirroring the `rls` job's shape:
```yaml
- name: Lint migrations for destructive DDL (FND-10)
  run: npx squawk-cli --exclude-files='**/seed.sql' supabase/migrations/*.sql
```
The existing `rls` job (already in the file — `supabase/setup-cli@v1` + `supabase db start` + `supabase test db`) is the direct analog for how a Supabase-CLI-dependent CI step is structured; `fx-monitor`/`resolve-rate` Edge Functions do not need their own CI job (Deno tests run through `npx jest supabase/functions/...` per the existing `test:coverage` step, same as `parse.test.ts` today — confirm `jest.config.js`'s `testMatch` already includes `supabase/functions/**/*.test.ts`, line 47, so no config change is needed).

## Shared Patterns

### Engine purity (FND-04)
**Source:** `.dependency-cruiser.cjs` (full file, already read) + `eslint.config.js` (not modified this phase)
**Apply to:** every file under `src/engine/money/` and `src/engine/split/`
```javascript
{
  name: 'engine-only-internal-src',
  from: { path: '^src/engine' },
  to: { path: '^src/', pathNot: '^src/engine' },
},
{
  name: 'engine-no-reach-impure',
  from: { path: '^src/engine' },
  to: {
    path: '^src/(db|data|state|services|ui|features)|node_modules/(react|react-native|expo[^/]*|@supabase|posthog-react-native)/',
    reachable: true,
  },
},
```
No engine file may import `src/data/*` (the TanStack Query layer being built this same phase) — `engine/money/`'s formatter takes `showCents`/`locale` as parameters (D-25) rather than reading them itself.

### Version-bump trigger + RLS membership helper (FND-12, MON-09)
**Source:** `supabase/migrations/20260922000100_household_of_one.sql` lines 12-22 (`bump_version()`) and 78-89 (`user_household_ids()`)
**Apply to:** `accounts`, `transactions`, and any other new versioned/household-scoped table — reuse both functions verbatim, only add new `create trigger set_version ... execute function public.bump_version();` and new RLS policies referencing `user_household_ids()`.

### Service-role-only reference tables (ENV-08)
**Source:** `supabase/migrations/20260922000300_fx_rates.sql`, full file
**Apply to:** `currencies`, `fx_rate_holds` — `select`-only policy for `authenticated`, full `revoke all ... from anon`, no client write grant, service-role Edge Function is the only writer.

### Constant-time shared-secret auth for pg_cron-invoked functions
**Source:** `supabase/functions/fx-sync/index.ts` lines 4-23
**Apply to:** `fx-monitor` (same trust model as `fx-sync`). `resolve-rate` must NOT use this — it needs JWT auth per the Security Domain note above.

### Encrypted local storage + wipe registration (SYN-07, D-15)
**Source:** `src/services/supabase/largeSecureStore.ts` (full file) + `src/services/storage/wipe.ts` lines 24-29 (`registerWipeHandler`)
**Apply to:** `src/data/cache/persister.ts` (the query-cache persister storage backend) and the mutation queue (register a `WipeHandler` with a `pendingWriteCount()` implementation so sign-out's "N changes not yet saved" warning is accurate).

### Ready-gated local-cache-then-remote hook (D-14, D-25)
**Source:** `src/theme/ThemeProvider.tsx` lines 24-49 + `src/theme/themeCache.ts` lines 36-56
**Apply to:** any new hook/provider hydrating from a local cache before a remote value is available (home-currency/show-cents preference reads, if a dedicated hook is built rather than relying solely on TanStack Query's own cache).

### i18n-only copy, no inline JSX strings (DSG-04)
**Source:** `src/i18n/locales/en.ts`, full file structure
**Apply to:** `RateAttribution.tsx`, `SyncStatusLine.tsx`, and any new validation-message strings in `parseAmount`/custom-currency flows — route every user-facing string through the typed catalogue; enforced by `eslint-plugin-i18next`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `stamp_fx_rate()` trigger function (in `..._transactions.sql`) | migration (trigger) | event-driven | No prior trigger in this codebase does a conditional `NEW`/`OLD`-branching external-table lookup; `bump_version()` is the only precedent and it is far simpler (unconditional). RESEARCH.md Pattern 4 (lines 384-429) is a fully drafted starting point, flagged MEDIUM confidence there. |
| `supabase/functions/resolve-rate/index.ts` | service (Edge Function) | request-response | No existing Edge Function is client-JWT-authenticated (both `fx-sync` today and `fx-monitor` planned use the shared-secret/pg_cron model) — the auth model itself is novel for this codebase, not just the business logic. |
| `supabase/functions/fx-monitor/index.ts` (Resend email side-effect) | service (Edge Function, scheduled) | batch | No existing code sends email; Resend is provisioned per `docs/dependency-register.md` but unused so far. RESEARCH.md's verified Resend REST API shape (Sources section) is the only available reference. |
| `supabase/tests/fixtures/moneyRoundingCases.ts` | config (shared fixture) | — | Novel artifact type for this codebase — no existing file is consumed by both Jest and a hand-transcribed pgTAP counterpart. RESEARCH.md Open Question 3 (lines 669-672) has the recommended approach. |
| `src/engine/money/types.ts` (`MinorUnits` brand, `Money`, `CurrencyCode`) | model (types) | — | First branded-type definitions in the codebase; ARCHITECTURE.md Pattern 7 specifies the shape (already reproduced in RESEARCH.md Pattern 1) but there is no in-repo code precedent to point to. |

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/functions/`, `supabase/tests/database/`, `src/engine/`, `src/services/`, `src/theme/`, `src/config/`, `src/i18n/`, `src/ui/`, `.github/workflows/`, `.dependency-cruiser.cjs`, `jest.config.js`, `scripts/verify-gates.mjs`, `package.json`
**Files scanned directly (Read):** `20260922000100_household_of_one.sql`, `20260922000300_fx_rates.sql`, `20260922000400_fx_sync_schedule.sql`, `20260922000200_app_config.sql`, `fx-sync/index.ts`, `fx-sync/parse.ts`, `fx-sync/parse.test.ts`, `fx-sync/deno.json`, `largeSecureStore.ts`, `wipe.ts`, `assertNever.ts` (+ test), `themeCache.ts`, `ThemeProvider.tsx`, `04_fx_rates.test.sql`, `01_household_of_one.test.sql`, `02_rls_isolation.test.sql`, `jest.config.js`, `verify-gates.mjs`, `.dependency-cruiser.cjs`, `package.json`, `env.ts`, `locales/en.ts`, `client.ts` (supabase), `ci.yml`
**Pattern extraction date:** 2026-09-24
