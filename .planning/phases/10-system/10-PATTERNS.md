# Phase 10: System - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 34 new or modified (grouped by capability)
**Analogs found:** 29 / 34 (5 have no analog: native lock/cover layer, push drain function, backup workflows, wallet fixtures, local Expo module)

Excerpts are tight. Line numbers refer to the worktree `C:/dev/fincwin-10ctx`. Where an analog was read in full, line ranges are given; where only named, the file is a "copy the shape" pointer and the planner should open it.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/data/sync/queueCap.ts` (+ shared guard hook) | utility (pure) | request-response | `src/data/sync/useSyncStatus.ts`, `src/data/sync/writeQueueState.ts` | role-match |
| `src/features/record/entry/TransactionSheet.tsx` (modify: cap guard + calm notice) | component | CRUD | itself; `src/features/plans/components/NoticeCard.tsx` | exact |
| `src/services/lock/pin.ts`, `biometric.ts` | service | request-response | `src/services/supabase/largeSecureStore.ts` (SecureStore use) | partial |
| `src/features/lock/{LockGate,LockScreen,PinPad,AppCover}.tsx` | component | event-driven (AppState) | `src/data/onlineManager.ts` AppState listener (95), `src/data/cache/persister.ts` AppState flush | partial |
| `src/features/security/*` (Security screen, DeviceRow) | component | CRUD | `src/features/you/YouScreen.tsx`, `src/features/you/DeleteAccountScreen.tsx` | role-match |
| RPCs `list_my_devices`, `revoke_my_session`, table `devices` | migration | CRUD | `20261122000700_household_settlements.sql` (SECURITY DEFINER + RLS) | role-match |
| `supabase/functions/reviewer-signin/` | Edge Function | request-response | `supabase/functions/plan-grant/{index,grant}.ts` + `delete-account/` | role-match |
| `rate_limits` table + `rate_limit_hit` RPC | migration | CRUD | `settlement_nudges` in `20261122000700_household_settlements.sql` (71-76, 100-101, 704-710) | exact |
| `supabase/functions/alerts-deliver/` | Edge Function | event-driven / batch | `plan-refresh` (secret-guarded sweep mode) + `20260922000400_fx_sync_schedule.sql` | role-match |
| alert tables, triggers, `alert_outbox`, pg_cron | migration | event-driven | `20260922000400_fx_sync_schedule.sql`; `hh_settlement_sweep` (719+) | role-match |
| `src/engine/alerts/{defaults,quietHours}.ts` | utility (pure) | transform | `src/engine/month/*` + `src/engine/money` | role-match |
| `src/features/alerts/*` (screen, permission ask) | component | CRUD + permission | `src/features/plans/notices/trialReminder.ts`, `decide/notifications/waitReminder.ts` | role-match |
| `src/features/alerts/pushRegistration.ts` | service | request-response | `decide/notifications/waitReminder.ts` (`configureNotifications`, channels) | partial |
| `src/engine/archive/{monthTotals,isArchived}.ts` | utility (pure) | transform | `src/engine/month/picture.ts`, `src/engine/activity` | role-match |
| `archived_months` migration + `src/db/archivedMonths.ts` | migration + model | CRUD | any `src/db/*` owner-private module (e.g. `decideAnswers`) | role-match |
| `src/features/archive/*` | component | CRUD | `src/features/record/activity/*` | role-match |
| `src/features/levels/featureRegistry.ts` (add `archive`) | config | n/a | itself, line 51-53 | exact |
| `src/data/exportManifest.ts` (extend) | config | n/a | itself | exact |
| `src/features/export/ExportScreen.tsx`, `csvExport.ts` | component/service | file-I/O | `csvExport.ts` | exact |
| `src/engine/dataCsv/*` + CSV import UI | utility + component | file-I/O | `src/engine/csv/tokenize.ts`, `src/features/record/import/*` | role-match |
| diagnostic export (`DIAGNOSTIC_FIELDS`) | service | transform | `src/data/sync/queueDiagnostics.ts`, `csvExport.ts` | partial |
| `src/services/account/deleteAccount.ts` (modify) | service | request-response | itself | exact |
| `src/features/you/DeleteAccountScreen.tsx` (modify) | component | request-response | itself | exact |
| `supabase/functions/delete-account/*` (modify) + `account_deletion_log` trigger | Edge Function + migration | CRUD | itself | exact |
| `src/engine/statement/wallets/{paypal,wise,revolut}.ts` | utility (pure) | transform | `src/engine/statement/profile.ts`, `sniffFormat.ts`, `src/engine/csv/*` | role-match |
| wallet preview UI (account suggestions) | component | CRUD | `ClosingBalancePrompt.tsx`, `SuggestionsStep.tsx` | role-match |
| `src/services/storage/wipe.ts` handlers for lock/push | service | event-driven | itself (`registerWipeHandler`) | exact |
| `supabase/tests/database/1xx_*.test.sql` (pgTAP) | test | n/a | `99_decide_go_end_reason.test.sql` | exact |
| `supabase/functions/*/*.test.ts` (deno) | test | n/a | `delete-account/delete.test.ts`, `plan-grant/grant.test.ts` | exact |
| `supabase/config.toml` (function entries) | config | n/a | itself (10-40) | exact |
| `.github/workflows/{backup,restore-check}.yml` | config (CI) | batch | `ci.yml` `rls` job (67-83); `nightly.yml` | partial |
| reviewer reset SQL `seed_reviewer_life` / `reset_reviewer_account` | migration | batch | `fx_sync_schedule` cron; read `20261124000100_plans_core.sql` first | partial |
| Native cover module (Swift/Kotlin) | native module | event-driven | none | none |

## Pattern Assignments

### `src/data/sync/queueCap.ts` and the shared guard (SYN-05, D-27/D-28)

**Analog:** `src/data/sync/useSyncStatus.ts`. The "waiting to send" count is already `queued`, derived from the mutation cache. Do not add a second counter.

**Count source** (lines 47-52):
```typescript
const pending = useMutationState<PendingWrite>({
  filters: { status: 'pending' },
  select: (m) => ({ submittedAt: m.state.submittedAt, inFlight: !m.state.isPaused && m.state.failureCount === 0 }),
});
const queued = pending.length;
```
Copy for the new pure helper: `queueCap(queued): 'ok' | 'note' | 'blocked'` with thresholds 400 and 500, taking a number, no React. A hook `useQueueGuard()` wraps `useSyncStatus().queued`. Apply at entry points (`TransactionSheet.tsx`, bulk add, import finalize, clone month, recurring offers), never inside `mutationFn`. Block creates only. Neutral `NoticeCard` styling, no amber (D-28). Persistence: `src/data/cache/persister.ts` chunks and has an `oversizedSingle` path; add a 500-entry persist test beside `src/data/__tests__/persister.test.ts` and `offlineWrite.test.tsx` (existing SYN-03/04 tests: `idempotentRetry.test.tsx`, `offlineWrite.test.tsx`).

---

### `src/features/lock/*`, `src/services/lock/*` (ACC-08, ACC-09, DSG-08)

**Analog (AppState):** `src/data/onlineManager.ts` ~line 95 uses `AppState.addEventListener('change', (state: AppStateStatus) => {...})` and returns the subscription for cleanup. Copy that listener shape for `LockGate` and `AppCover`. Per RESEARCH Pitfall 8, ignore state changes while `authenticateAsync` is pending. Persist `backgroundedAt` (Pitfall 7).

**Analog (secure storage):** `src/services/supabase/largeSecureStore.ts` and `src/services/storage/wipe.ts`. Any SecureStore key must be registered for wipe:
```typescript
export async function registerSecureKey(name: string): Promise<void> { ... }   // wipe.ts 47-52
export function registerWipeHandler(handler: WipeHandler): () => void          // wipe.ts 22
```
Use `registerWipeHandler({ id: 'lock', wipe })` for PIN hash, salt, tries and lockUntil. D-29: the 10th-wrong-PIN path re-authenticates; only a different user triggers `wipeDeviceData`.

**No analog:** biometrics (`expo-local-authentication` is not installed; new dev build), the iOS/Android native snapshot cover. Use RESEARCH Patterns 1 and 2.

---

### `rate_limits` + `rate_limit_hit` (ACC-13) 

**Analog:** `settlement_nudges` in `supabase/migrations/20261122000700_household_settlements.sql`.

**Table + lockdown** (71-76, 100-101):
```sql
create table public.settlement_nudges (
  household_id uuid not null references public.households(id) on delete cascade,
  from_id uuid not null references auth.users(id) on delete cascade,
  ...
  primary key (household_id, from_id, to_id));
alter table public.settlement_nudges enable row level security;
revoke all on public.settlement_nudges from anon, authenticated;
```
**Upsert-counter shape** (704-710): `select ... for update`, then `insert ... on conflict (...) do update set sent_at = excluded.sent_at`. Functions use `security definer`, `set search_path = ''`, fully qualified `public.` names (see 106-111). Revoke execute from anon/authenticated for `rate_limit_hit`; call with the service role only.

---

### `supabase/functions/reviewer-signin/`, `devices` RPC helpers (ACC-11, ACC-06/07)

**Analog:** `supabase/functions/plan-grant/index.ts` (secret guard, JSON helper, service-role client) and `supabase/functions/delete-account/{index,delete}.ts` (pure logic in `delete.ts` with every effect injected, tested by `delete.test.ts`).

**Shape to copy** (`delete-account/index.ts` 7-27, 51-52):
```typescript
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  ...
  const result = await deleteAccount({ method: req.method }, deps);
  return json(result.body, result.status);
});
```
Caller id from `userClient.auth.getUser()`, never the body. Pin `npm:@supabase/supabase-js@2.116.0`. `reviewer-signin` is unauthenticated, so set `verify_jwt = false` in `supabase/config.toml` (pattern at lines 14-40: comment block above each `[functions.x]` stating who calls it and how it is guarded). Use `safeEqual` from `../plan-webhook/verify.ts` for any secret compare. Pure `*.ts` beside `index.ts` plus `*.test.ts` run by the `deno` CI job.

---

### Alerts: tables, triggers, cron drain, `alerts-deliver` (ALR-01..06)

**Analog (cron to Edge Function):** `supabase/migrations/20260922000400_fx_sync_schedule.sql` (whole file, 22 lines). Copy for the one-minute drain:
```sql
select cron.schedule('fx-sync-daily', '30 16 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_url'),
    headers := jsonb_build_object('Content-Type','application/json',
      'x-fx-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$$);
```
New names: `alerts_deliver_url`, `alerts_deliver_secret` in Vault; function guards with its own header secret like `plan-grant` (`safeEqual`) and `verify_jwt = false`. Idempotent sweeps: see `hh_settlement_sweep` (settlements migration 719+).

**Analog (local notification code):** `src/features/plans/notices/trialReminder.ts` lines 1-30 and `decide/notifications/waitReminder.ts` lines 1-60: channel constants, `configureNotifications()`, a module-level `locked()` queue, and the rule "this file never asks for permission". Phase 10 inverts the last rule in exactly one place: the handler that switches on the first alert (D-09). Create `alerts` and `digest` channels at boot before the token request. Register token cleanup with `registerWipeHandler`.

**Lock-screen privacy precedent:** waitReminder header, "fixed copy, data carries only { checkId, kind }". D-12 extends it: server text carries who/amount/category only, with a pgTAP sentinel test for note and payee.

**Pure defaults:** `src/engine/alerts/defaults.ts` follows `engine/` rules (no imports from db/state/services/ui/react). Integer minor units, half-up rounding via `src/engine/money`. Exhaustive tests with fast-check.

---

### `featureRegistry.ts` (archive entry, D-16)

**Analog:** itself, line 51-53 (the `System` rows). Add:
```typescript
{ id: 'archive', area: 'System', minLevel: 4, needsHousehold: false, holdsData: null, glyph: 'history' },
```
Also update `09-LEVEL-MAP.md` (a test parses it and fails on drift) and add `features.items.archive.label|sub` copy keys. Check `glyph: 'history'` is in `src/ui/icons/iconData` (used already at line 36).

---

### `src/data/exportManifest.ts` (DAT-02) and `csvExport.ts`

**Analog:** itself. Add new Phase 10 tables as `table: [cols]` entries or as `NOT_USER_DATA` with a reason (lines 128-182 show the comment style, naming the plan and why). Guard test `src/data/__tests__/exportManifest.test.ts` lines 14-33 scans `src/db/*.ts` for `.from('table')` and fails when a table is in neither list. It only reads `src/db`, so also add a migration-aware check (RESEARCH Pattern 10). Candidates for the manifest: `archived_months`, `alert_settings`, `alert_prefs`, `alert_log`; `devices`, `push_tokens`, `rate_limits`, `alert_outbox`, `account_deletion_log` go to `NOT_USER_DATA` with reasons.

**Reuse for the pre-delete copy** (`csvExport.ts` 54-69): `buildCsvFiles(deps)` takes injected `fetchPage` and `lockedWrites`, pages by `PAGE_SIZE = 1000`, throws `ExportError` so no partial set is offered. `toCsv` in `csvSerialize.ts` prefixes `'` on text starting `= + - @`; import must reverse it (Pitfall 10).

---

### `src/services/account/deleteAccount.ts` and `DeleteAccountScreen.tsx` (DAT-04, ACC-10, D-17..D-20)

**Analog:** itself. Injected-deps style (lines 10-28), server first, then wipe:
```typescript
const ok = !reply.error && (reply.data as { ok?: boolean } | null)?.ok === true;
if (!ok) return { ok: false, reason: 'failed' };
await deps.signOut({ resetTheme: deps.resetTheme, wipeDeviceData: deps.wipeDeviceData });
```
Add one injected dep `forgetGoogle: (email) => Promise<void>` defaulting to `forgetGoogleOnAccountDeletion` (`src/services/auth/google.ts` 91-95: `forgetRememberedAccount`, `GoogleSignin.revokeAccess`, `signOut`, each `.catch(() => null)`). Read the email before calling `invoke` (the user is gone after). Call it after server confirmation, before the wipe. The "Save a copy" step reuses `buildCsvFiles`. Deletion log: AFTER DELETE trigger on `auth.users` in a migration, not in `delete.ts` (RESEARCH Pattern 8). Extend pgTAP for deletion completeness.

---

### `src/engine/statement/wallets/{paypal,wise,revolut}.ts` (IMP-06)

**Analog:** `src/engine/statement/profile.ts` (header block 1-20, imports 12-24) and `sniffFormat.ts` (`sniffFormat(text): 'ofx'|'csv'|'pdf'|'unknown'`, line 33). Imports to copy:
```typescript
import { markerSign, minorUnits, type MinorUnits } from '../money';
import { convertDraft } from './convert';
import { reconcile, type FileCheck, type ReconcileRow } from './reconcile';
import { ... type StatementDraft } from './types';
```
Readers return `StatementDraft` rows so the existing reconcile, duplicates, refundMatch and FX-truth steps run unchanged. Header-signature detection runs before the generic `detectColumns` in `src/engine/csv`. Tokenise through `src/engine/csv/tokenize.ts`. Re-export from `src/engine/statement/index.ts` (lines 7-17 list the barrel). Tests beside `src/engine/statement/__tests__/` with fixtures under `fixtures/` (existing) or the `wallets/__fixtures__/` path from RESEARCH. Fixtures wait on the owner (D-24); build the synthetic-row skeleton first. UI: extend `src/features/record/import/ClosingBalancePrompt.tsx` and `SuggestionsStep.tsx` for the "Create 'Wise EUR'?" switch per currency (nothing created without a tap).

---

### pgTAP and deno tests

**pgTAP analog:** `supabase/tests/database/99_decide_go_end_reason.test.sql` lines 1-30: `begin;`, `create extension if not exists pgtap with schema extensions;`, `select extensions.plan(N);`, inserts into `auth.users` with the fixed UUIDs, `create temp table hh as select owner_id, id from public.households;` then `grant select on hh to authenticated;`. Numbered files continue after the highest existing prefix (check `ls supabase/tests/database`). CI runs them in the `rls` job (`ci.yml` 67-83: `supabase db start` then `supabase test db`, CLI 3.1.0, `SUPABASE_INTERNAL_IMAGE_REGISTRY: public.ecr.aws`).

**Deno analog:** `supabase/functions/delete-account/delete.test.ts` and `plan-grant/grant.test.ts`.

---

### `.github/workflows/{backup,restore-check}.yml` (ENV-16, DAT-05)

**Analog (partial):** `.github/workflows/ci.yml` pins actions by SHA with a version comment (line 71: `actions/checkout@3d3c42e5... # v4.4.0 (v4)`), and the `rls` job at 67-83 is the exact local-stack recipe for the restore check (reuse `supabase/setup-cli` pin `689adcfb... # v1.7.3`, `version: 3.1.0`). `nightly.yml` shows the cron-from-default-branch convention. Everything else (pooler `pg_dump`, `age`, R2 upload, lifecycle) is new; follow RESEARCH "Backups". Secrets by name only; add gitleaks allow-list by exact `^name$` only (memory: gitleaks guide).

## Shared Patterns

### Edge Function structure
**Source:** `supabase/functions/delete-account/index.ts` + `delete.ts` + `delete.test.ts`; `supabase/config.toml` per-function `verify_jwt` comment blocks.
**Apply to:** `reviewer-signin`, `alerts-deliver`, any devices/push-register function. Pure logic in a sibling file with injected deps; `index.ts` only wires the `Deno.serve`.

### Secret-guarded cron-callable function
**Source:** `plan-grant/index.ts` 19-22 (`safeEqual(expected, got)` else 403) and `20260922000400_fx_sync_schedule.sql`.
**Apply to:** `alerts-deliver`, any scheduled function.

### Device wipe registration
**Source:** `src/services/storage/wipe.ts` 22-28 (`registerWipeHandler`), 47-52 (`registerSecureKey`), 72-98 (`wipeDeviceData` collects errors, runs every step).
**Apply to:** lock state, push token, alert settings cache, archive cache. Delete the push token and device row server-side before the wipe on sign-out (Pitfall 5).

### Injected-deps services with lazy supabase import
**Source:** `src/services/account/deleteAccount.ts` 18-28 and `src/features/auth/signOut.ts` header (T-00-18: never statically import `@/services/supabase`; it reads env at load and breaks Jest).
**Apply to:** every new service that calls Supabase (`devices`, `pushRegistration`, `reviewerSignIn`, diagnostic send).

### SQL conventions
**Source:** `20261122000700_household_settlements.sql` (RLS on, `revoke all ... from anon`, policies using `(select auth.uid())`, `security definer` + `set search_path = ''`).
**Apply to:** all new tables and RPCs. Every migration runs on the local stack before `db push --remote` (CLAUDE.md, Supabase CLI 3 rules).

### Engine purity
**Source:** CLAUDE.md architecture rule: nothing in `engine/` imports `db/`, `state/`, `services/`, `ui/` or `react`. Integer minor units via `src/engine/money`.
**Apply to:** `engine/alerts`, `engine/archive`, `engine/dataCsv`, `engine/statement/wallets`.

### Local-notification discipline
**Source:** `trialReminder.ts` 1-30 and `waitReminder.ts` 1-60 (single `locked()` promise chain, fixed copy, data carries only a kind/id, `Notifications.setNotificationHandler` set once).
**Apply to:** alert permission flow and any new local scheduling.

### Calm notice styling
**Source:** `src/features/plans/components/NoticeCard.tsx` (used by `OfferCard.tsx`) and `src/ui/*` tokens; no amber for the queue message (D-28), page tint cover for DSG-08 (CLAUDE.md design fidelity: no blur, no new colours, FincWin icon set only).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Native app-switcher cover (Swift/Kotlin local Expo module, only if the JS `AppCover` loses the race) | native module | event-driven | No local Expo module exists in the repo; follow RESEARCH Pattern 2 and plan a device check |
| `src/services/lock/biometric.ts` | service | request-response | `expo-local-authentication` is not installed; needs `faceIDPermission` plugin option and a new dev build |
| `supabase/functions/alerts-deliver/` Expo push POST, receipts, digest windows | Edge Function | batch | No outbound push code exists; cron+secret shell comes from `fx_sync_schedule`, the rest from RESEARCH Pattern 5 |
| `backup.yml` pg_dump, age, R2 upload | CI | batch | No backup workflow exists; only the local-stack restore recipe in `ci.yml` `rls` job is reusable |
| Wallet fixtures (PayPal, Wise, Revolut) | test data | file-I/O | Owner step D-24; real files not yet in repo. Column schemas in RESEARCH are LOW confidence |

## Metadata

**Analog search scope:** `src/data`, `src/services`, `src/features/{you,export,levels,plans,record,decide,auth}`, `src/engine/{statement,csv,month}`, `supabase/functions`, `supabase/migrations`, `supabase/tests/database`, `.github/workflows`
**Files scanned:** about 40 read or grepped
**Pattern extraction date:** 2026-11-22
**Notes for planner:** `.github/workflows` has no keep-alive file (RESEARCH Open Question 7). Highest existing migration is `20261125000900_decide_shares_on_leave.sql`; Phase 10 migrations start after it. Read `20261124000100_plans_core.sql` and `plan-grant` before writing the reviewer seed (top plan grant path).
