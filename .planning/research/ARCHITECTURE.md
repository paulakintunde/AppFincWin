# Architecture Research

**Domain:** Cloud-first Expo/React Native personal finance app, pure financial-calculation engine, Supabase Postgres source of truth, household sharing
**Researched:** 2026-09-21
**Confidence:** MEDIUM-HIGH (boundary tooling and RLS performance claims are HIGH, sourced against Supabase's own docs and maintained plugin docs; the offline/Realtime/undo reconciliation design is a synthesis of documented primitives — no single source specifies FincWin's exact reconciliation protocol, so that section is engineering judgment built on verified building blocks, flagged inline)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  app/ (Expo Router v7)                — screens, navigation only          │
│  src/features/<area>/                 — screen-level composition          │
│  src/ui/                              — presentational primitives         │
├──────────────────────────────────────────────────────────────────────────┤
│  src/state/  (Zustand)                — navStack, sheetStack, undoStack,  │
│                                          toast, bulk-select, ephemeral UI  │
├──────────────────────────────────────────────────────────────────────────┤
│  src/data/  (TanStack Query/DB)       — persisted query cache, optimistic │
│                                          mutations, write queue, Realtime │
│                                          subscription → cache patcher     │
├──────────────────────────────────────────────────────────────────────────┤
│  src/engine/  ── PURE. Zero I/O. Zero react. Zero db/state/services/ui   │
│    decide/  money/  split/  payoff/  health/  undo/ (inverse computation)│
│    Inputs: plain snapshot objects.  Outputs: plain verdict/patch objects.│
├──────────────────────────────────────────────────────────────────────────┤
│  src/services/                        — supabase client, revenuecat,     │
│                                          plaid (stub), notifications,     │
│                                          biometrics, frankfurter cache    │
├──────────────────────────────────────────────────────────────────────────┤
│  Supabase (remote, source of truth)                                      │
│    Postgres (RLS) · Auth (Apple/Google/passkey) · Realtime · Edge Fns    │
│    (Frankfurter FX scheduled sync, Coach LLM proxy, redeem_invite RPC)   │
└──────────────────────────────────────────────────────────────────────────┘
```

The engine sits deliberately *outside* the vertical UI→state→data stack. Nothing above it may skip it (calculations must not be reimplemented in a screen), and it may not reach down into anything below it. It is a leaf dependency: everything can import it, it can import nothing project-local except types.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| `engine/` | Deterministic financial logic: verdicts, payoff math, splits, health score, undo-inverse computation | Pure TS functions/modules, no React, no `fetch`, no Supabase client, no Zustand — takes plain objects, returns plain objects |
| `data/` | Reads Supabase directly, persists a query cache, queues writes offline, patches cache from Realtime pushes | TanStack Query (or the official `@supabase/tanstack-db` collection adapter) + a persister to MMKV/AsyncStorage + a durable mutation queue |
| `state/` | Ephemeral, device-local UI state that has no business being in Postgres | Zustand slices: nav stack, sheet stack, undo stack (compensating-write descriptors), toast queue, bulk-select mode |
| `services/` | All I/O adapters — Supabase client init, Auth, RevenueCat, notifications, biometrics, file pickers | Thin wrappers, one per external system, no business logic |
| `ui/` | Presentational primitives (Card, Pill, Sheet, Row, Money, Sparkline) | Pure components, theme-aware, no data fetching |
| `features/<area>/` | Screen-level composition: wires `data/` hooks + `engine/` calls + `ui/` primitives into a screen | React components, one folder per feature area from §5 |
| `app/` | Routing only | Expo Router v7 file-based routes, thin re-exports of `features/` screens |
| Postgres (Supabase) | Source of truth, RLS enforcement, optimistic-concurrency versioning, triggers for `version`/`updated_at` | SQL migrations via Supabase CLI, one migration file per schema change |

## Recommended Project Structure

```
app/                              Expo Router v7 routes (thin)
  (tabs)/                          home · activity · grow · decide · insights
  decide/[checkId]/                step 1–5
  detail/[kind]/[id]/              push-in record screens
  onboarding/
  lock.tsx
src/
  engine/                        ── PURE. Enforced by lint + dependency-cruiser + CI
    decide/                        dplan · dassess · dmoney · dSimMin · dpmt · dfv · bisect
    money/                         Money type, minor units, rounding, allocate(), FX conversion
    split/                        household split rules, largest-remainder allocation
    payoff/                       avalanche · snowball · projection
    health/                       0–100 score
    undo/                         invertOperation(op, priorSnapshot) → CompensatingWrite
    types/                        shared plain types (Money, Snapshot, Verdict, CompensatingWrite)
    __tests__/
  data/
    client.ts                     Supabase client singleton (services/ owns auth, data/ owns queries)
    queries/                      one file per table/view, typed selects
    mutations/                    one file per mutation, builds the optimistic patch + the queued write
    cache/                        persister config (MMKV), cache key conventions, TTL
    queue/                        durable write queue: enqueue, flush-on-reconnect, collapse-per-row
    realtime/                     subscription setup, event → cache-patch reconciler
  state/                          Zustand: navStack, sheetStack, undoStack, toast, bulk
  ui/                              primitives — Card, Pill, Sheet, Row, Money, Sparkline…
  theme/                          tokens, 4 accents, 4 font pairings, reduced-motion
  features/<area>/                screen-level composition per §5
  services/                       supabase-auth · revenuecat · plaid (stub) · notifications · biometrics · frankfurter
supabase/
  migrations/                     SQL migrations (Supabase CLI), one per schema change
  functions/                      Edge Functions: fx-sync (scheduled), redeem-invite, coach-proxy
  seed.sql
.dependency-cruiser.cjs           CI-level architecture gate (see below)
```

### Structure Rationale

- **`engine/` has its own `undo/` and `types/` subfolders**, not shared with `state/`, because compensating-write *computation* is pure business logic (what is the inverse of this edit) even though compensating-write *execution* (checking current version, writing, queueing) is not. Splitting the seam this way is what lets undo logic be unit-tested with fixtures instead of a running Supabase instance.
- **`data/` replaces `db/`** from the original brief's folder layout. There is no local relational database (no SQLite, no Drizzle — ruled out by the cloud-first decision), so this folder is a query/cache/queue/realtime layer over the Supabase client, not a schema-and-migrations layer (that lives in `supabase/migrations/`, versioned with the Supabase CLI, not with app code).
- **`supabase/` is a sibling of `src/`, not inside it** — migrations, RLS policies and Edge Functions are deployed independently of the app bundle and reviewed as SQL, not as TypeScript.

## Architectural Patterns

### Pattern 1: Engine purity enforced by a two-layer lint gate

**What:** Two tools, not one, doing different jobs. `eslint-plugin-boundaries` (or the simpler `import/no-restricted-paths` from `eslint-plugin-import`) gives inline, editor-time red squiggles the moment a developer types a forbidden import. `dependency-cruiser` runs as a separate CI step and does the exhaustive check: transitive violations, circular dependencies, orphaned modules, and produces a dependency graph artifact for review. Relying on `no-restricted-imports` alone (the bare core-ESLint rule named in the brief) works for direct imports but is weaker at catching *transitive* leaks — e.g., `engine/decide/dassess.ts` importing a "pure-looking" helper from `services/format.ts` that itself imports React. `dependency-cruiser` walks the whole graph and catches that; a single-level `no-restricted-imports` rule does not.

**When to use:** From the first commit of the Foundation phase, both tools, both wired into CI as required (non-bypassable) checks — not just `eslint --fix`-able locally, because the entire value of the boundary is that it cannot erode silently over sixty PRs.

**Trade-offs:** Two tools means two configs to keep in sync as folders move. `eslint-plugin-boundaries` is more actively marketed at "layered architecture" use cases (it names element *types*, not just paths, so `engine` can be declared a type that may only depend on `engine`) and gives immediate IDE feedback; `dependency-cruiser` is the more battle-tested tool for CI-level architectural gates and produces a visual graph (`dependency-cruiser --output-type dot`) that is genuinely useful in a solo/small-team project to eyeball drift during code review. Community guidance converges on using both rather than picking one, since ESLint gives fast local feedback and dependency-cruiser gives the CI-level guarantee ESLint's per-file model is weaker at.

**Example — ESLint (fast local feedback):**
```js
// eslint.config.js (flat config, ESLint 9+)
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'engine', pattern: 'src/engine/**' },
        { type: 'data', pattern: 'src/data/**' },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'services', pattern: 'src/services/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'features', pattern: 'src/features/**' },
      ],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'allow',
        rules: [
          { from: 'engine', disallow: ['data', 'state', 'services', 'ui', 'features'] },
        ],
      }],
      // Belt-and-braces: engine may never import react or react-native at all
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'engine/ is pure — no React.' },
          { name: 'react-native', message: 'engine/ is pure — no React Native.' },
        ],
      }],
    },
  },
];
```

**Example — dependency-cruiser (CI-level, transitive-safe):**
```js
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'engine-purity',
      severity: 'error',
      comment: 'engine/ must not depend on db/data, state, services, ui, features, or react(-native), including transitively.',
      from: { path: '^src/engine' },
      to: {
        path: '^(src/data|src/state|src/services|src/ui|src/features)',
      },
    },
    {
      name: 'engine-no-react',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: 'node_modules/(react|react-native)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: { tsPreCompilationDeps: true, tsConfig: { fileName: 'tsconfig.json' } },
};
```
CI wiring: a dedicated GitHub Actions / EAS Workflows step (`npx depcruise src --config .dependency-cruiser.cjs` and `eslint .`) that fails the build on any `error`-severity violation, run on every PR, not just `main` — the brief's own quality gate language ("an engine change that drops branch coverage below threshold fails CI, no exceptions") should apply identically here.

**How pure engines take data in and hand verdicts out:** the engine never reaches for data itself. The calling layer (`data/` or `features/`) assembles a plain "snapshot" object — logged months, current balances, active limits, the household split state — and passes it as an argument; the engine returns a plain "verdict" or "patch" object with no side effects. This is the same shape as a reducer: `(snapshot, input) => verdict`. Concretely for FincWin: `dassess(plan, extra, snapshot: MonthSnapshot[]): Verdict`. The snapshot's *shape* is defined inside `engine/types/`, but *fetching* it is entirely `data/`'s job — the engine doesn't know Supabase exists.

### Pattern 2: Optimistic-first data flow with client-generated IDs

**What:** Reads go straight to Supabase through TanStack Query (or the official `@supabase/tanstack-db` collection adapter, which wires queries, mutations and Realtime subscriptions together), backed by a persister (MMKV or AsyncStorage) so the last-known cache survives app restarts and flights. Every mutable row (transaction, goal, settlement, check) gets its primary key generated **client-side as a UUID at creation time**, not server-generated. This single decision is what makes the rest of the optimistic/queue/Realtime story tractable: the locally-created optimistic row *is* the final row, identity-wise — there is no server-assigned-id swap to reconcile later, only a status field (`pending → synced → failed`) that flips.

**When to use:** Every write path in the app, from day one — this is not an optimization to add later, it is a foundational decision that the whole undo and Realtime reconciliation design in Pattern 3/4 depends on.

**Trade-offs:** Client-generated UUIDs are slightly larger on the wire and on disk than serial bigints, and open (very slightly) a client-can-choose-my-primary-key surface, closed off by RLS: a client can only insert a row with `household_id` and `created_by` matching its own membership, so a colliding/malicious UUID guess from another tenant still can't write into your household's rows. Confidence: MEDIUM — this is a standard offline-sync pattern (documented by Supabase's own TanStack DB collection work and RxDB's Supabase-replication writeups), not something FincWin-specific sources describe verbatim.

**Example:**
```ts
// data/mutations/addTransaction.ts
export function addTransaction(input: NewTransactionInput) {
  const id = generateUUID(); // client-generated, becomes the permanent PK
  const optimisticRow: Transaction = { id, ...input, status: 'pending', version: 0 };
  queryClient.setQueryData(['transactions', householdId], (old) => [...old, optimisticRow]);
  return enqueueWrite({ opId: id, table: 'transactions', kind: 'insert', payload: optimisticRow });
}
```

### Pattern 3: Write queue flushed on reconnect, collapsed per row

**What:** A durable, persisted (not in-memory-only) FIFO queue of pending mutations. On reconnect (`NetInfo`/TanStack `onlineManager` transition to online), the queue flushes. Before flushing, operations targeting the *same row* are collapsed into a single net operation (e.g., "insert then immediately edit" while offline collapses to a single insert with the final field values; "insert then delete" while offline collapses to a no-op and is dropped from the queue entirely) — this avoids replaying a stale intermediate state to the server and avoids a Realtime echo storm for edits nobody but this device ever needed to know about individually.

**When to use:** Any write made while offline, and as the uniform code path for *all* writes (even online writes go through the same enqueue → optimistic-apply → flush pipeline; "online" just means the queue drains near-instantly) — this uniformity is what keeps the mutation code simple, since there is only one write path to test, not an online path and a separate offline path.

**Trade-offs:** Collapsing requires the queue to be row-aware, not just an opaque operation log — worth the complexity, because without it a flaky connection (repeated brief drops) can otherwise replay dozens of intermediate edits as separate server writes, each firing its own trigger/Realtime event.

### Pattern 4: Realtime reconciliation against locally-pending writes

**What:** Supabase Realtime (`postgres_changes` on household-scoped tables) pushes row changes to every subscribed client, including, by default, changes the client's *own* writes caused (Supabase echoes your own committed writes back over Realtime same as anyone else's). The reconciler must therefore treat every incoming Realtime event by checking it against the local pending-write queue and an integer `version` column (incremented by a Postgres trigger on every update) before touching the cache:

1. **Event for a row with no local pending write** → a genuine external change (another household member, another device). Merge it straight into the cache.
2. **Event for a row with a local pending write still in the queue (not yet flushed)** → the event necessarily predates the local device's intended state (the local write hasn't reached the server yet). Ignore the event; keep the optimistic local state; let the eventual flush-and-echo be the thing that confirms it.
3. **Event that *is* the echo of this device's own just-flushed write** → matches on `opId`/`version`; flip the row's status from `pending` to `synced`. No visible change.
4. **Event for a row whose `version` is higher than the `expectedVersion` this device's queued (not yet flushed) write was based on** → a genuine conflict: someone else edited the row after this device went offline but before it reconnected. Do not silently overwrite either side. Apply the remote change to the cache (server is authoritative) and surface the local queued write as failed-with-conflict rather than flushing it blind — see Pattern 5 for what happens to that failed write when it's an undo.

**Where the seams are / what breaks:** Realtime message *arrival order is not guaranteed to match commit order* under load or reconnect bursts — the reconciler must key all decisions on the `version` integer (or `updated_at`), never on arrival sequence. A queued delete racing a queued edit on the *same row from two different devices* is the one scenario that cannot be fully resolved client-side; it needs the server-side optimistic-concurrency check (`update ... where id = $1 and version = $2`) to make exactly one of them win and the other come back as a conflict for Pattern 5 to handle. Confidence: MEDIUM — Supabase and TanStack's own documentation confirm the building blocks (optimistic mutations that roll back on rejection, Realtime sync per row) but do not spell out this exact reconciliation state machine; it is synthesized from those primitives plus standard offline-first practice, and should be validated with integration tests (two simulated clients, one taken offline mid-edit) during the Household phase rather than assumed correct from the design alone.

### Pattern 5: Undo as compensating writes, not snapshots

**What:** Every mutation type has a pure inverse-computation function in `engine/undo/`. Popping the (Zustand-held) 12-deep undo stack does not restore a saved blob of app state — it constructs a new, small compensating write (a patch of only the fields that changed, plus the `expectedVersion` the undo is conditioned on) and pushes it through the *same* mutation → queue → Realtime pipeline as any other write. This is the standard "compensating transaction" pattern from distributed-systems/saga literature, applied at the row level instead of the workflow level: rather than trying to roll back a whole system, each local operation defines its own reverse operation and that reverse operation is itself just a normal, safe write.

**Where the logic lives given the purity rule:** the *decision* of what the inverse looks like — e.g., "undoing this split-expense delete means re-inserting the transaction and re-running the split allocation, because the household's split rule may have changed since" — is pure, deterministic, and testable with fixtures, so it belongs in `engine/undo/invertOperation(op, priorSnapshot): CompensatingWrite`. The *execution* of that compensating write — reading the row's current `version`, enqueueing it, waiting for confirmation, showing a conflict toast — is I/O and belongs in `state/undoStack` + `data/mutations`.

**Handling undo of a row another household member has since modified:** because every compensating write carries the `expectedVersion` it was computed against, the server-side conditional update either succeeds (nothing else touched the row) or fails the version check (something did). A failed undo surfaces as "Can't undo — Priya changed this since" rather than silently clobbering their edit. This is the correct behavior for shared rows and is a direct consequence of Pattern 4's `version` column already existing for Realtime reconciliation — the two problems (household sync conflicts, undo conflicts) share one mechanism.

**Interaction with the write queue:** if the operation being undone is still sitting *unflushed* in the local write queue (this device is offline, or hasn't synced yet), undo should cancel/mutate the queued operation directly rather than push a second compensating write on top of it — collapsing per Pattern 3's row-collapse logic. Only an already-flushed (server-confirmed) operation needs a genuine compensating write.

**Trade-offs:** storing only a small patch (not a full snapshot) per undo entry keeps the stack cheap and keeps it correct under concurrent edits, but it means every mutation type needs its inverse explicitly authored and tested (there's no free "undo anything" generic diff) — this is a real, bounded amount of engine work per feature area (roughly one `invert*` function per mutation kind: add/edit/delete transaction, add/remove goal contribution, create/cancel settlement), not a one-time framework cost.

### Pattern 6: RLS modeled so every user is a "household of one" from day one

**What:** There is no schema fork between "solo user" and "shared household." Every account gets an auto-created `households` row and a `household_members` row (role: owner, weight: 1) at signup, and every data table (`transactions`, `goals`, `accounts`, `holdings`, `loans`, `checks`, `decisions`) carries a `household_id` FK from the first migration, never added later. This is what lets the Household *feature* phase (multi-member, split rules, settlements, Realtime) be additive UI and RPC work on top of an RLS model that never has to migrate live data.

**Core policy shape (per data table):**
```sql
create policy "household members can select their rows"
on transactions for select
to authenticated
using (
  household_id in (
    select household_id from household_members
    where user_id = (select auth.uid())
  )
);
```
Concrete performance traps, not generic ones:
- **`auth.uid()` re-evaluated per row.** Wrapping it as `(select auth.uid())` lets Postgres cache it via an initPlan instead of calling it once per row scanned; Supabase's own troubleshooting benchmarks show this alone taking a query from 179ms to 9ms, and a security-definer role check from 178 seconds to 12ms in their published numbers. Do this on every policy, no exceptions.
- **Missing index on the RLS join column.** `create index on household_members (user_id)` and a composite `create index on household_members (household_id, user_id)` are not optional — Supabase's benchmarks show >100x improvement on large tables from adding the index the policy's subquery depends on. Also index `household_id` on every data table (`transactions(household_id)`, etc.) since that's the other side of the join.
- **Subquery direction.** Write the policy as `household_id in (select household_id from household_members where user_id = (select auth.uid()))` — filtering the small `household_members` table by the indexed `user_id` and returning a set of household_ids to check the *table's own* `household_id` against — not as `(select auth.uid()) in (select user_id from household_members where household_id = transactions.household_id)`, which forces a correlated subquery re-run per row of `transactions` and cannot use the same index path. This exact direction mistake is the difference documented between "fast" and "170ms → very slow" in community RLS writeups.
- **Missing `to authenticated`.** Every policy should explicitly scope `to authenticated` (or `authenticated, anon` if genuinely intended for anonymous access); leaving the role clause off means the policy also applies to `public`/`anon`, where `auth.uid()` returns null and can produce unexpected matches against nullable comparison columns.
- **Cross-table joins inside RLS.** Where a policy needs to check membership via a join table, moving that lookup into a `security definer`, `stable` (not `volatile`) SQL function lets Postgres cache the result per statement rather than re-running the join per row — the same benchmark source reports a 178-second query dropping to 12ms from this change combined with the `auth.uid()` wrap.

**Invite-by-expiring-link, modeled safely:** a separate `household_invites` table (`code` unguessable, `expires_at`, `max_uses`/`used_count`, `created_by`) with a narrow RLS `select` policy allowing any authenticated user to look up a single invite *by exact code match*, scoped to `expires_at > now()`. The actual join-household action is **not** a raw client `insert` into `household_members` (that both duplicates validation logic client-side and races two simultaneous redemptions of a single-use code). It is a `security definer` Postgres RPC (`redeem_invite(code text)`) that, inside one transaction: `select ... for update` locks the invite row to close the race, checks expiry/use-count, inserts the membership, increments `used_count` — called from the client via `supabase.rpc('redeem_invite', { code })`. Security-definer functions used this way must be owned by a non-login role, have an explicit empty/safe `search_path` set inside the function, and have `execute` revoked from `public` and granted only to `authenticated`, or they become a privilege-escalation surface rather than a safe escape hatch from RLS.

**Privacy toggle (hide real names) — recommended pattern:** do not attempt conditional column-level masking inside RLS (Postgres RLS is row-level; true column-level security needs a view or a function, adding a layer of logic to keep in sync). Simpler and more robust: never grant `select` on `profiles.full_name` to other household members via RLS at all — no policy exists that lets member A read member B's `profiles` row. Instead, `household_members` carries its own `display_name` column that each member sets (defaulting to their assigned color-name, e.g. "Rust"), and every UI surface reads *that* column, never `profiles`. The "privacy toggle" becomes "does this household show custom display names or force the color fallback for everyone," a plain boolean read on the `households` row, not conditional RLS logic. This sidesteps an entire class of RLS bugs (forgetting to gate a `select *` behind the privacy flag on some new screen) by making the private data simply unreachable through the join other members use, structurally, rather than reachable-but-hopefully-filtered.

### Pattern 7: Money as integer minor units, end to end

**What:**
- **Postgres:** `bigint` for every monetary amount column (never Postgres's built-in `money` type, which is explicitly discouraged in the Postgres community for its locale-dependent formatting and rounding behavior, and never `numeric` for the amounts themselves — `numeric` costs materially more in aggregation performance, roughly 60% more time in published benchmarks, and buys nothing when the values are always whole minor units by construction). Pair every amount column with a `currency` `char(3)` (ISO 4217). The one legitimate use of `numeric` in this schema is FX **rates** (e.g. `numeric(18,8)`), which are multiplicative factors, not accumulated balances, and are never summed the way transaction amounts are.
- **Wire:** PostgREST (Supabase's REST layer) serializes `bigint` as a JSON number; for realistic personal/household-finance balances (well under `Number.MAX_SAFE_INTEGER`, ~9×10^15, even in cents) this is safe. The one thing to design against explicitly: never store *sub-minor-unit* precision (e.g. fractional cents, or 18-decimal crypto units) in the same `bigint`-as-JS-number pipeline without switching that specific column to `numeric` + string-typed wire — not a concern for FincWin's traditional-currency scope, but worth a one-line guard comment in `engine/money/` so a future crypto-holding type doesn't silently violate it.
- **TypeScript:** a branded/nominal type so a raw `number` cannot be assigned where a money amount is expected:
  ```ts
  type MinorUnits = number & { readonly __brand: 'MinorUnits' };
  type Money = { readonly amount: MinorUnits; readonly currency: CurrencyCode };
  function minorUnits(n: number): MinorUnits {
    if (!Number.isInteger(n)) throw new Error('Money amounts must be integers');
    return n as MinorUnits;
  }
  ```
  Branding alone doesn't stop float-introducing *arithmetic* on an already-branded value (`amount * 0.15` still type-checks). The actual guarantee comes from a convention enforced by code review plus tests, not by the type system alone: **all money arithmetic goes through named functions in `engine/money/`** (`add`, `subtract`, `multiplyAndRound`, `allocate`) that internally call `Math.round`/`Math.trunc` and return `MinorUnits`; raw `+`/`-`/`*` on `.amount` fields outside that module is the thing PR review and the brief's coverage gate should catch. Consider building `engine/money/` on top of **dinero.js v2** (functional, immutable, TypeScript-native, stores amount as integer + exponent, ships an `allocate(dineroObject, ratios)` primitive) rather than hand-rolling every operation — MEDIUM confidence, since the v1→v2 API changed meaningfully and the exact current API should be checked against its docs (or Context7, if available) before locking the dependency in.
- **Rounding rule for splits that don't divide evenly:** the largest-remainder method, the documented standard for this exact problem (used in payroll and dividend distribution, and the fix for the "balances are not zero-sum" bug class reported against at least one open-source bill-splitting tool). Compute each participant's exact share in a higher-precision intermediate, floor every share to whole minor units, then distribute the leftover minor units (`total − sum(floors)`) one at a time to the participants with the largest fractional remainder, tie-broken deterministically (e.g., household-member join order) so identical inputs always produce identical output. This belongs in `engine/split/allocate.ts`, covered by a property-based test asserting shares always sum exactly to the original total — the single invariant that, if it silently breaks, produces a settlement balance that's subtly wrong forever.

**Trade-offs:** none of this is exotic, but every piece (bigint-not-money-type, branded type, centralized arithmetic module, largest-remainder split) needs to be decided *before* Money core phase writes its first migration and its first `engine/money/` function, because retrofitting a rounding rule after transactions already exist means reconciling every historical split.

## Data Flow

### Write path (online or offline — same pipeline)

```
User action (features/)
    ↓
data/mutations/*.ts
    → generates client UUID (Pattern 2)
    → computes optimistic patch, applies to TanStack Query cache immediately
    → enqueues { opId, table, kind, payload, expectedVersion } (Pattern 3)
    ↓
data/queue/  (persisted; collapses same-row ops; flushes on reconnect)
    ↓  (online)
Supabase Postgres (RLS-checked insert/update, `version` trigger increments)
    ↓
Supabase Realtime — echoes the commit back to every subscribed client,
    including the originating device
    ↓
data/realtime/reconciler.ts (Pattern 4)
    → matches opId → flips cache row status pending → synced
    → OR (other devices) merges an external change into the cache
    → OR (version conflict) surfaces a conflict, does not overwrite silently
```

### Undo path

```
User taps Undo (state/undoStack, 12-deep)
    ↓
engine/undo/invertOperation(op, priorSnapshot)   — PURE
    → returns a CompensatingWrite { table, rowId, patch, expectedVersion }
    ↓
if op still unflushed in data/queue/ → cancel/mutate the queued op directly
else → data/mutations pushes the CompensatingWrite through the normal write path above
    ↓
server-side conditional update (`where id = $1 and version = $2`)
    → succeeds → undo applied, Realtime confirms
    → fails (someone else's edit won the race) → "Can't undo — changed by X" surfaced, not clobbered
```

### Read path

```
Screen mounts (features/)
    ↓
data/queries/*.ts (TanStack Query) — cache-first (MMKV-persisted), background-revalidates against Supabase
    ↓
engine/*  — screen calls pure functions with the fetched snapshot, gets a verdict/derived value back
    ↓
ui/  — renders
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| Single household, few devices (v1 target) | Everything above as designed. RLS overhead on tables with a few thousand rows per household is negligible once the `auth.uid()`-wrap and index fixes in Pattern 6 are applied. |
| Many households on shared Supabase project | The `household_id`-scoped index strategy already isolates per-tenant query cost; watch Realtime channel count (one channel per subscribed table per active household session) against Supabase's connection/channel limits on the plan tier in use. |
| Very active household (frequent concurrent edits) | The `version`-based optimistic concurrency in Patterns 4/5 is the load-bearing piece here — it is what turns "two people edit the same row" from silent data loss into a surfaced, recoverable conflict. No architecture change needed, just correct implementation of that one mechanism. |

### Scaling Priorities

1. **First likely bottleneck:** an unindexed or wrongly-directed RLS policy (Pattern 6) on the `transactions`/`checks` tables once a household has a few thousand rows of history — this is the one item worth load-testing explicitly before the Household phase ships, not after a user notices lag.
2. **Second:** Realtime channel/message volume if the reconciler (Pattern 4) isn't collapsing echoes correctly — the linked TanStack DB Supabase collection's own docs flag their Realtime integration as "still being stabilized and may consume more Realtime messages than expected," which is a signal to budget explicit integration testing here rather than assume the library's defaults are tuned for a household-sharing use case.

## Anti-Patterns

### Anti-Pattern 1: Full-state-snapshot undo under a live, multi-device server

**What people do:** Port the prototype's approach directly — push the entire app state onto a stack, pop to restore it (HTML line 3847 in the original prototype).
**Why it's wrong:** The server is authoritative and other household members may have already seen and built on the write being undone; restoring a stale full snapshot either silently discards their changes or silently reverts to data that's already wrong by the time it's applied.
**Do this instead:** Compensating writes (Pattern 5) — small, versioned, conditional inverse operations, computed by pure `engine/` logic and executed through the same write pipeline as any other mutation.

### Anti-Pattern 2: Letting `engine/` reach for "just one" service call

**What people do:** Add a single "helper" import from `services/` or `data/` into an engine function — usually to fetch the current FX rate, or to look up a category name — because it's *right there* and adding a parameter feels like more ceremony.
**Why it's wrong:** The very first exception is how the purity boundary erodes; once one engine function does I/O, the exhaustive branch-coverage testing strategy the whole product depends on stops being possible to trust, because tests can no longer assume determinism from inputs alone.
**Do this instead:** Enforce with both lint layers (Pattern 1) from commit one, treat any exception request as a signal that the snapshot object being passed in is incomplete, and fix the snapshot's shape instead.

### Anti-Pattern 3: RLS policy without the `(select ...)` wrap or a supporting index

**What people do:** Write the "obviously correct" policy (`using (household_id in (select household_id from household_members where user_id = auth.uid()))`) and ship it, because it returns correct rows in testing with a handful of seed records.
**Why it's wrong:** It is functionally correct and silently, catastrophically slow at real data volumes — Supabase's own published numbers show the unwrapped/unindexed version costing up to ~170x more, and it will not surface in testing until a household has enough transaction history to matter.
**Do this instead:** Apply the `(select auth.uid())` wrap and the supporting indexes (Pattern 6) as a written checklist item on every new RLS policy PR, not an optimization pass done later.

### Anti-Pattern 4: Trusting Realtime event order

**What people do:** Assume a Realtime `postgres_changes` event that arrives later reflects a state that is later, and apply events to the cache in arrival order.
**Why it's wrong:** Arrival order is not guaranteed to match commit order under reconnect bursts or network jitter; applying by arrival order can regress a row to an older state after a newer one was already shown.
**Do this instead:** Key every reconciliation decision on the row's `version`/`updated_at`, never on the order events were received (Pattern 4).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Supabase Postgres/Auth/Realtime | Direct client SDK from `services/supabase.ts`; RLS is the only authorization boundary | Auth (Apple/Google/passkey) must exist before any other data-layer work — see Build Order below |
| Supabase Edge Functions | `fx-sync` (scheduled, pulls Frankfurter v2), `redeem-invite` (security-definer RPC), `coach-proxy` (keeps LLM keys server-side) | Deployed and versioned independently via Supabase CLI, in `supabase/functions/` |
| RevenueCat | `services/revenuecat.ts`; `Purchases.configure` + `logIn(supabaseUserId)` | Identify RevenueCat's app-user-id with the Supabase user id **at sign-in, in Foundation**, not deferred to the Tiers phase — avoids an anonymous-to-identified RevenueCat merge later |
| Frankfurter v2 | Pulled server-side by a scheduled Edge Function into a Supabase table, never called directly from the client | Rates stored per-transaction/per-settlement at write time (already a Key Decision in PROJECT.md), consistent with Pattern 7's `numeric` treatment for rates only |
| Plaid (deferred to v1.1) | Provider-abstraction stub in `services/`, no live integration in v1 | Keep the interface shape stable so v1.1 is additive |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| `engine/` ↔ everything else | One-directional: called with plain objects, returns plain objects; nothing calls back into `engine/` from within `engine/`'s own execution except other `engine/` modules | Enforced by Pattern 1's dual lint gate |
| `data/` ↔ `state/` | `data/` owns anything that round-trips through Supabase (even optimistically); `state/` owns anything that never leaves the device (sheet-open/closed, nav history, toast visibility) | The undo stack is a `state/` structure holding `CompensatingWrite` descriptors, but *executing* an undo hands off to `data/mutations` |
| `features/` ↔ `engine/` | `features/` fetches a snapshot via `data/`, passes it to `engine/`, renders the returned verdict via `ui/` | No feature screen should contain inline financial arithmetic — that's the tell that logic leaked out of `engine/` |

## Build Order

Assessed against the brief's proposed shape (`BUILD-PROMPT.md` §8: Foundation → Money core → Record → Shell → Decide engine → Decide UI → Grow → Insights → Household → Tiers → System → Compliance), with the cloud-first decision applied.

**The central reordering point:** the brief's original order put "Supabase + RLS lands here" at phase 8 (Household), on the assumption the app was local-first through phase 7 and cloud sync was an additive feature for sharing. That assumption is gone. There is no local database at all (no SQLite, no Drizzle — cut outright per PROJECT.md's Out of Scope), so **every phase from Record onward is hard-blocked on a working, authenticated Supabase connection with RLS-protected tables**, not just the Household phase. PROJECT.md has already partly absorbed this — it lists "Supabase Postgres schema with RLS" under Money core (its phase 1) rather than phase 8 — but this research recommends moving the *auth and household-of-one bootstrap* even earlier, into Foundation itself, because:

- Record (writing a transaction) cannot function without a signed-in user and an existing `household_id` to attach the row to.
- Every data table's RLS policy is written against `household_members`, which means the "household of one" auto-provisioning (Pattern 6) has to exist before the *first* transaction table migration is written, not after.
- RevenueCat identity should anchor to the Supabase user id at first sign-in, so it needs auth wired in Foundation even though the paywall UI itself stays in the Tiers phase.

PROJECT.md's Active-requirements list still files "Account required at onboarding via Sign in with Apple, Google and passkeys" under a "System" heading (inherited from the brief's phase-name groupings) — that grouping should not be read as a *build-order* instruction. The functional mechanics of sign-in must land in Foundation; only the *surrounding* System-phase features (active-session list, sign-out-everywhere, biometric app lock) are genuinely late-phase work, because they're refinements on top of an auth system that already exists, not prerequisites for it.

**Revised phase-0/1 shape:**

| # | Phase | Delivers (cloud-first adjusted) |
|---|-------|-----------------------------------|
| 0 | **Foundation** | Expo SDK 55 + TS strict + Router v7. `engine/` boundary + dual lint gate (Pattern 1) + CI. Design tokens. **Supabase project provisioned; Auth (Apple/Google/passkey) wired end-to-end; `households`/`household_members` schema + household-of-one auto-provisioning at signup (Pattern 6) + baseline RLS; RevenueCat identity linked to the Supabase user id.** This is materially more than the brief's original Foundation scope — it now includes the minimum viable slice of what the brief called phase 8 |
| 1 | **Money core** | `Money` on integer minor units (Pattern 7), full transaction/account/category schema + RLS (building on the household-of-one model from phase 0, not introducing it), FX via Frankfurter Edge Function, `engine/money` suite green. `data/` layer scaffolding: query cache persister, write queue, Realtime subscription plumbing (Patterns 2–4) — needed now because Record (next) has nowhere else to write |
| 2 | **Record** | Entry sheet, transactions, Activity list, month switcher, toast + 12-deep undo **as compensating writes from day one** (Pattern 5) — this is materially different from the brief's original phase 2, which could have gotten away with snapshot-based undo under a local-first assumption. First real dogfood build, now against a live Supabase backend rather than a local DB |
| 3 | **Shell** | Unchanged by cloud-first — five tabs, bespoke glyphs, back stack, sheets, FAB. Pure UI/navigation work |
| 4 | **Decide engine** | Unchanged by cloud-first — pure TypeScript, zero dependency on Supabase, fully testable with fixtures. *Secondary note, not a required reordering:* because this phase has no data-layer dependency at all, it could in principle be developed in parallel with phases 1–3 rather than strictly after them, if parallel workstreams are available — flagged as an opportunity, not a recommendation to restructure the roadmap around |
| 5 | **Decide UI** | Unchanged in shape, but now reads its "logged months" snapshot from the live Supabase-backed `data/` layer built in phase 1, not a local DB |
| 6 | **Grow** | Unchanged by cloud-first |
| 7 | **Insights** | Unchanged by cloud-first |
| 8 | **Household** | **Re-scoped, not newly introduced.** Since the household-of-one schema and RLS already exist from phase 0, this phase is now: invite-by-expiring-link RPC (Pattern 6), multi-member roles/weights, four split rules + largest-remainder allocation (Pattern 7), settlements, scope toggle, privacy toggle, and — the genuinely new infrastructure work — turning on Realtime subscriptions and the conflict-reconciliation logic (Pattern 4) for real multi-device, multi-member concurrent edits. This is smaller than the brief's original phase 8, because "Supabase exists" is no longer part of its scope |
| 9 | **Tiers & onboarding** | Unchanged in shape; RevenueCat entitlement checks now sit on top of an identity link established in phase 0 |
| 10 | **System** | Unchanged in shape, but note the sign-in mechanism itself is *not* built here — only its refinements (active-session list, sign-out-everywhere, biometric lock, offline-mode polish, in-app account deletion that purges both Postgres and any local cache) |
| 11 | **Compliance & release** | Unchanged by cloud-first |
| 12 | **v1.1** | Unchanged — widgets, Plaid, brokerage linking |

**Net effect:** the roadmap's phase *names* and *feature content* barely change, but phase 0 (Foundation) gains real backend-provisioning weight it didn't have in the brief, phase 1 (Money core) gains the `data/` layer plumbing, phase 2 (Record) must implement compensating-write undo immediately rather than deferring the harder undo design, and phase 8 (Household) loses the "stand up Supabase" work it was originally scoped to carry, becoming purely about multi-member semantics and Realtime conflict handling. This is a sequencing correction, not a scope change — nothing in the feature inventory moves in or out, only *when the backend exists* moves from phase 8 to phase 0.

## Sources

- [eslint-plugin-boundaries — npm](https://www.npmjs.com/package/eslint-plugin-boundaries)
- [Taking Frontend Architecture Serious With Dependency-cruiser — Xebia](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)
- [Enforce Module Boundaries ESLint Rule — Nx](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries)
- [import/no-restricted-paths — eslint-plugin-import](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md)
- [no-restricted-imports — ESLint official docs](https://eslint.org/docs/latest/rules/no-restricted-imports)
- [Supabase Docs — RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [RLS Performance and Best Practices — Supabase GitHub Discussion #14576](https://github.com/orgs/supabase/discussions/14576)
- [Optimizing RLS Performance with Supabase(postgres) — AntStack/Medium](https://medium.com/@antstack/optimizing-rls-performance-with-supabase-postgres-fa4e2b6e196d)
- [Supabase RLS Slow? Fix RLS Performance With Benchmarks — Axonbuild](https://axonbuild.com/blog/supabase-rls-performance)
- [How to implement RLS for a team invite system with Supabase — Boardshape](https://boardshape.com/engineering/how-to-implement-rls-for-a-team-invite-system-with-supabase)
- [Supabase RLS using Functions - Security Definers — Entrostat](https://blog.entrostat.com/supabase-rls-functions/)
- [Supabase Multi-Tenant Design — RLS Tenant Isolation, Admin Roles, and Invite Flow — DEV Community](https://dev.to/kanta13jp1/supabase-multi-tenant-design-rls-tenant-isolation-admin-roles-and-invite-flow-3g07)
- [GitHub — supabase/tanstack-db](https://github.com/supabase/tanstack-db)
- [TanStack DB + Supabase: Adding True Offline Support — RxDB](https://rxdb.info/articles/tanstack-db/tanstack-db-supabase-offline.html)
- [Optimistic Updates — TanStack Query React Docs](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [Compensating Transaction Pattern — Azure Architecture Center, Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
- [Event Sourcing Pattern — Azure Architecture Center, Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [Pattern: Saga — microservices.io](https://microservices.io/patterns/data/saga.html)
- [Working with Money in Postgres — Crunchy Data](https://www.crunchydata.com/blog/working-with-money-in-postgres)
- [PostgreSQL Documentation — 8.2 Monetary Types](https://www.postgresql.org/docs/current/datatype-money.html)
- [Storing and querying monetary values in Postgres and Hasura — Level Up Coding](https://levelup.gitconnected.com/storing-and-querying-monetary-data-in-postgres-and-hasura-c0d2cdc2a560)
- [Splitting €10 three ways: the largest remainder method — DEV Community](https://dev.to/mollenthiel/splitting-eu10-three-ways-the-largest-remainder-method-and-the-tiebreak-everyone-forgets-4aag)
- [Balances are not zero-sum: independent per-participant rounding invents or destroys cents — spliit-app/spliit GitHub Issue #547](https://github.com/spliit-app/spliit/issues/547)
- [Dinero.js](https://www.dinerojs.com/)
- Project context: `PROJECT.md` and `BUILD-PROMPT.md` (this repository, read in full before research)

---
*Architecture research for: cloud-first Expo/React Native personal finance app, FincWin United*
*Researched: 2026-09-21*
