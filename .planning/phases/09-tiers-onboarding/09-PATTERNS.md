# Phase 9: Tiers & Onboarding - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 41 (new or modified)
**Analogs found:** 36 / 41
**Scope searched:** `supabase/migrations`, `supabase/tests/database`, `supabase/functions`, `src/data`, `src/features/{you,consent,household,grow,decide,auth}`, `src/services/analytics`, `src/ui`, `src/i18n`, `app/`
All paths are relative to `C:\dev\fincwin-p9`. Excerpts are short; the line pointers are the contract.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/20261124*_plans_tables.sql` (household_plans, plan_events, plan_products, trial_ledger, household_leave_log, plan_join_requests, feature_switches, profiles.level/onboarding_state, backfill) | migration | CRUD | `20261122000200_household_members_v2.sql` (tables + RLS + `household_events`) | role-match |
| `supabase/migrations/..._plans_functions.sql` (`household_seats`, `household_plan_state`, `household_writable`, `plan_state()`) | migration (SQL fn) | request-response | `20261122000200_household_members_v2.sql` `hh_event` / `hh_uid` (lines 215-230) | role-match |
| `supabase/migrations/..._plans_lock_triggers.sql` (`guard_plan_lock` + trigger per records table) | migration (trigger) | event-driven | `20261122000500_household_invites.sql` guard_* functions (lines 260-660) | exact (idiom) |
| `supabase/migrations/..._plans_invites_seats.sql` (redefine create/restore/preview/redeem_invite; `p_store_country`; extend `household_events.kind` CHECK) | migration (RPC) | request-response | `20261122000500_household_invites.sql` lines 660-860 | exact (same fns) |
| `supabase/migrations/..._plans_cron.sql` (reconcile sweep) | migration (cron) | batch | `20261011000200_statement_uploads_purge.sql` lines 22-35 | exact |
| `supabase/tests/database/1NN_plans_*.test.sql` (state, seats, lock, invites, switch rule, backfill, RLS) | test (pgTAP) | CRUD | `supabase/tests/database/105_household_invites.test.sql`, `99_decide_go_end_reason.test.sql`, `102_household_table_coverage.test.sql` | exact |
| `supabase/functions/plan-webhook/{index,verify,sync}.ts` + tests | Edge Function | event-driven | `supabase/functions/purge-statement-uploads/{index,auth,purge}.ts` | exact (verify_jwt=false + own secret) |
| `supabase/functions/plan-refresh/index.ts` | Edge Function | request-response | `supabase/functions/delete-account/index.ts` | exact (caller JWT) |
| `supabase/functions/plan-grant/*` (tester/owner promo grants) | Edge Function / script | batch | `supabase/functions/purge-statement-uploads` (service-only) | role-match |
| `supabase/functions/_fixtures/revenuecat/*.json` | test fixture | - | `supabase/functions/_fixtures` | exact |
| `supabase/config.toml` (new `[functions.*]` blocks) | config | - | config.toml lines 10-26 | exact |
| `src/data/sync/writeErrors.ts` (add `'locked'`) | utility | request-response | self | modify |
| `src/data/sync/failedWrites.ts` (`kind` adds `'locked'`), `src/ui/FailedWritesSheet.tsx`, `src/ui/failedWriteLabels.ts` | utility / component | event-driven | self | modify |
| `src/features/plans/store/purchasesClient.ts` | service (SDK wrapper) | request-response | RESEARCH "Purchases client wrapper"; nearest in repo `src/services/supabase` + `src/services/analytics/posthog.ts` (single-file SDK seam) | partial |
| `src/features/plans/usePlanState.ts` | hook | request-response + pub-sub | `src/features/household/useHouseholdScope.ts`, `src/data/queries/household.ts`, `src/data/realtime/useHouseholdRealtime.ts` | role-match |
| `src/data/queries/plan.ts` + `src/db/plans.ts` + `src/data/keys.ts` entry | query layer | CRUD | `src/data/queries/household.ts` (+ `src/db/household.ts`) | exact |
| `src/data/realtime/*` (plan row subscription) | provider | pub-sub | `src/data/realtime/{channel,applyEvent,reconcile}.ts`, migration `20261122000900_household_realtime_tables.sql` | exact |
| `src/features/plans/PlansScreen.tsx`, `PlanCard`, `PeriodToggle`, `DisclosureBlock` | component | request-response | `src/features/consent/ConsentScreen.tsx` (full-screen, equal-weight choices) + `src/ui/ChoiceCard.tsx`, `SegmentedControl.tsx` | role-match |
| `src/features/plans/SubscriptionScreen.tsx`, `PlanStatusCard` | component | request-response | `src/features/you/DeleteAccountScreen.tsx`, `src/features/household/HouseholdHomeScreen.tsx` | role-match |
| `src/features/plans/LockedSheet.tsx`, `LockBanner.tsx`, `NoticeCard.tsx` | component | event-driven | `src/ui/ConfirmSheet.tsx`, `src/ui/Sheet.tsx`, `src/ui/WarningCard.tsx`, `src/features/household/DepartureCard.tsx` | role-match |
| `src/features/levels/{featureRegistry,levelFor,applyOnb}.ts` | utility (pure) | transform | `src/features/grow/growFeatureFlags.ts` | exact (pure seam) |
| `src/features/levels/useFeatureAccess.ts` | hook | transform | `src/features/household/useFeature.ts` | exact |
| `src/features/levels/FeaturesScreen.tsx`, `FeatureRow` | component | CRUD | `src/ui/ToggleRow.tsx` + `src/features/you/YouScreen.tsx` groups | role-match |
| `src/features/levels/OfferCard.tsx`, `offers.ts` (weekly cap, local counters) | component + utility | event-driven | `src/data/queries/offers.ts`, `NoticeCard` | partial |
| `src/features/onboarding/{QuestionScreen,Summary,PartnerVersion,SampleBar}.tsx` | component | request-response | `src/features/consent/ConsentScreen.tsx`; `src/features/income/IncomeProfileSteps.tsx` (reuse); decide setup stepper | role-match |
| `src/features/consent/ConsentScreen.tsx` (add `onDone` mode) | component | request-response | self lines 1-60 | modify |
| `src/features/auth/appHome.ts`, `app/index.tsx` (first-run route) | route/config | request-response | `app/index.tsx` `AppEntry` lines 28-47 | exact |
| `app/(app)/{plans,subscription,features,onboarding}.tsx` | route | request-response | existing `app/(app)/consent.tsx`, `delete-account.tsx`, `you.tsx` thin route files | exact |
| `src/features/decide/entitlements.ts` (redesign, D-04) | utility | transform | self | modify |
| `src/config/householdFeatures.ts`, `src/features/household/useFeature.ts` | config + hook | transform | self | modify |
| `src/features/grow/growFeatureFlags.ts` | utility | transform | self (comment says "Phase 9 swaps the default") | modify |
| `src/features/you/YouScreen.tsx` (rows Subscription, Features, Free help) | component | request-response | self lines 244-262 (`MONEY_ROWS` + `Row` + `tileFor`) | modify |
| `src/features/you/DeleteAccountScreen.tsx` (billing warning) | component | request-response | self | modify |
| `src/features/household/{InviteSheet,leave/*,HouseholdHomeScreen}.tsx` (plan line, approval, switch-rule refusal) | component | request-response | self | modify |
| `src/services/analytics/catalogue.ts` + `__tests__/catalogue.typecheck.ts` | config (typed) | event-driven | self lines 28-50 | exact |
| `src/ui/status/statusMap.ts` (8 new keys) | config | - | self | modify |
| `src/i18n/locales/en.ts` + `locales/appLife/*` (`plans.*`, `onboarding.*`, `features.*`, `lock.*`) | config (copy) | - | `src/i18n/locales/appLife`, `locales/household`, `copyGuard/` | exact |
| `src/features/export/csvExport.ts` (minimal CSV, D-03) | utility | file-I/O | `src/data/exportManifest.ts` (column contract) | role-match |
| `src/**/__tests__/*` for all of the above | test | - | `src/data/sync/__tests__/writeErrors.test.ts`, `src/features/household/__tests__/*` | exact |

## Pattern Assignments

### Migrations: lock trigger (`guard_plan_lock`) and records-table coverage

**Analog:** `supabase/migrations/20261122000500_household_invites.sql`
- Trigger-function idiom (security definer, `set search_path = ''`, "newest body" header comment naming the file that last redefined it): lines 260-300 (`guard_recurring_series`), 304-330 (`guard_decide_check`).
- The existing GUC bypass precedent: `perform set_config('fincwin.household_rpc', 'on', true);` at lines 198 and 227, read as `coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on'` (line 293, 309 and others). Copy this exact spelling for `fincwin.plan_bypass`.
- Because every `guard_*` here is already a BEFORE trigger on a records table, the new `guard_plan_lock` should be a separate trigger (alphabetically ordered after the guards if order matters) so it does not edit 20 function bodies. Do NOT redefine the guard bodies.
- Table inventory for the trigger loop: take the list from the RLS/table-coverage test `supabase/tests/database/102_household_table_coverage.test.sql` so the lock list and the coverage test cannot drift. Add a pgTAP assertion that every table with a `household_id` column either has the trigger or is on a named exclusion list (profiles, household_members, plan tables).
- Error code: `raise exception 'plan locked' using errcode = 'PT402', hint = 'plan_locked';` (RESEARCH "Lock trigger"; shape given there).

### Migrations: invites with seat cap

**Analog:** same file, the four literal-6 sites. Line numbers in RESEARCH (678, 766, 804, 847) are from an older read; the current `create_invite` cap is at line **676**:
```sql
if v_members + v_open >= 6 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;  -- D-10
```
Replace `6` with `public.household_seats(hid)`; keep the `perform 1 from public.households h where h.id = hid for update;` lock (line 673) so seat counting stays race-free. Failure convention: RPCs return `{"ok": false, "reason": ...}`; only a missing session raises 42501 (`household_members_v2.sql` line ~233 comment). New reason `needs_approval` follows this shape. Use `public.hh_uid()` for the caller.
- Re-declare the functions with `create or replace` and a header "newest body" comment.
- `household_events.kind` CHECK to extend: `20261122000200_household_members_v2.sql` line 170 lists every kind; the migration must `alter table ... drop constraint ... add constraint` with the old list plus `plan_approval_needed, plan_payer_left, plan_takeover, plan_grace, plan_locked, plan_downgrade_offer`. Find the constraint name in the pgTAP table-coverage test or with `\d`.
- `hh_event` (lines 218-227) writes `actor_id = (select auth.uid())` and is revoked from all client roles. The webhook runs as service role (auth.uid() null), so write a sibling `plan_event_notice(...)` with `actor_id null` rather than calling `hh_event`. Insert shape: `insert into public.household_events (household_id, kind, actor_id, subject_id, ref_id, audience, params)`.
- Unique index precedent for once-only notices: `household_events_once` (line 177) on `(ref_id, kind)`.

### Migrations: reconcile cron

**Analog:** `supabase/migrations/20261011000200_statement_uploads_purge.sql` lines 22-35: `cron.schedule(name, cron, $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = '...'), headers := jsonb_build_object('Content-Type','application/json','x-statement-purge-secret', (select decrypted_secret ...)) ...$$)`. Copy for a `plan-reconcile-daily` job calling `plan-refresh`-style sweep (or a SQL-only sweep like `20260926000400_recurring_materialisation.sql` line 569: `select cron.schedule('recurring-materialise-daily', '20 0 * * *', $$ select public.materialise_recurring(); $$);`). Vault secret names are an owner/ops step (HUMAN-UAT).

### pgTAP tests

**Analogs:** `supabase/tests/database/99_decide_go_end_reason.test.sql` (header block, begin/rollback, `select extensions.plan(N)`, insert `auth.users` rows to fire the household-of-one trigger, `create temp table hh ... grant select to authenticated`, `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', true);`). Use `105_household_invites.test.sql` and `106_household_join_movein.test.sql` for invite limits at 1/2/6/12 and `101_household_privacy_two_user.test.sql` for "a member cannot read another member's feature_switches". Header convention: first comment lists which migrations the test needs. Next free number is above 108 (list shows 108 as highest named household test; also 98/99 non-household); check `ls` before naming.
Lock tests must cover: authenticated write on locked household raises SQLSTATE `PT402`; same write via a SECURITY DEFINER RPC raises; `auth.uid() is null` bypass works; `fincwin.plan_bypass='on'` works inside leave/remove/delete RPCs only; `profiles` update (consent/level) still works; client cannot flip the GUC to gain access.

### `supabase/functions/plan-webhook/` (HMAC, no JWT)

**Analog:** `supabase/functions/purge-statement-uploads/` (index.ts, auth.ts, purge.ts, auth.test.ts, purge.test.ts, deno.json). Split exactly the same way: pure `verify.ts` (testable), pure `sync.ts` taking injected deps, thin `index.ts`.
- Auth module shape (`auth.ts` lines 1-21): `export const X_ENV`, `export function safeEqual(a,b)` constant-time, `export function isAuthorized(getEnv, getHeader)` with injected getters so tests need no Deno env. Replace the shared-secret header with HMAC: parse `t=...,v1=...` from `X-RevenueCat-Webhook-Signature`, compute HMAC-SHA256 over `${t}.${raw}`, compare with `safeEqual`, reject if `|now-t| > 300s`. Keep the "own secret per endpoint" rule (IN-B03 comment, line 2): `REVENUECAT_WEBHOOK_HMAC_SECRET` must not be reused elsewhere.
- Entry (`index.ts` lines 1-34): `import { createClient } from 'npm:@supabase/supabase-js@2.116.0';`, `const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json'}})`, `if (req.method !== 'POST') return json({ok:false,error:'method'},405)`, 403 on failed auth, `admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`, then call a pure function with injected deps and return its result. Webhook adds: read raw body once (`await req.text()`) before JSON parse; respond 200 fast and finish with `EdgeRuntime.waitUntil`.
- Config: add to `supabase/config.toml` next to lines 15-16: `[functions.plan-webhook]\nverify_jwt = false` with a comment explaining the own-secret guard (same style as purge).
- Tests: `deno test` per function dir (`deno.json`); `npm run test:deno` must be extended. Fixtures into `supabase/functions/_fixtures/revenuecat/`.

### `supabase/functions/plan-refresh/` and `plan-grant/`

**Analog:** `supabase/functions/delete-account/index.ts` (caller JWT, gateway-verified):
```ts
const authHeader = req.headers.get('Authorization');
if (!authHeader) return json({ ok: false, error: 'unauthorized' }, 401);
const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
// getCallerId: userClient.auth.getUser(); body is never read, so no client can name another user.
```
`[functions.plan-refresh] verify_jwt = true`. Logic in a separate pure file taking `deps` (like `delete.ts` + `delete.test.ts`). `plan-grant` is service-only: copy the purge style (own secret, `verify_jwt = false`) or make it an operator script; it must never be reachable with a user JWT.

### `src/data/sync/writeErrors.ts` (add `locked`)

Self-modify. Insertion points:
- Union at line 29: `export type WriteErrorClass = 'transient' | 'auth' | 'conflict' | 'rejected' | 'not-found' | 'discarded';` add `'locked'` and a doc bullet in the comment block (lines 6-21) in the same style.
- In `classifyWriteError` (lines 62-81), inside `if (err instanceof DbError) {` BEFORE the `REJECTED_CODES` check (line 71) and before the generic 4xx fallthrough at line 73, add `if (err.code === 'PT402' || err.status === 402) return 'locked';`.
- `shouldRetryWrite` (line 120): `cls !== 'transient'` already returns false for `locked`, so no code change, but add a test.
- `classifySettledWriteError` (line 135) returns `Exclude<WriteErrorClass,'transient'|'auth'>`; `locked` passes through; callers (`failedWrites.ts` line 16 `kind: 'conflict' | 'rejected' | 'not-found'`) must accept it. Find consumers with `grep -rn "classifySettledWriteError\|FailedWrite\['kind'\]" src`. Also `src/ui/failedWriteLabels.ts` and `FailedWritesSheet.tsx` need the new kind and its copy ("Saved on this phone. Choose a plan to sync").
- Tests: extend `src/data/sync/__tests__/writeErrors.test.ts` and `failedWrites.test.ts`. Wave 0 spike (RESEARCH A8): decide replay (from `attempted`) vs holding the paused mutation. `coalesceDrafts.ts` and `writeQueueState.ts` are neighbours to read first.

### `src/features/plans/usePlanState.ts`, queries, realtime

**Analogs:** `src/data/queries/household.ts` (useQuery with `queryKeys`, `staleTime`, `resetHouseholdScope` on membership change, lines 1-12), `src/features/household/useHouseholdScope.ts` lines 1-40 (compose `useAuth` + `useHouseholdId` + `useSyncStatus`), and `src/data/realtime/` (`channel.ts`, `applyEvent.ts`, `reconcile.ts`, `HouseholdRealtimeHost.tsx`) for the Realtime pattern (unsubscribe in cleanup, patch cache or invalidate). Add `household_plans` to the realtime publication migration the way `20261122000900_household_realtime_tables.sql` does, and to the pgTAP publication test `104_household_realtime_publication.test.sql`.
- Key points: all queries live under `src/data/queries/` with a key in `src/data/keys.ts`; `src/db/*` holds the Supabase calls (`src/db/household.ts`, `householdEvents.ts`). Put `fetchPlanState` in `src/db/plans.ts` calling the `plan_state()` RPC.
- On membership change call the same reset helper so plan state drops with the household.
- Derived `usePlanState()` returns `trial | active | grace | locked | tester | sample` plus size, payer, dates (UI-SPEC dependency 1). Offline: serve the cached value; never optimistic-unlock (UI-SPEC 9e).

### `src/features/plans/store/purchasesClient.ts`

No exact analog (no purchase SDK yet). Nearest single-file SDK seam: `src/services/analytics/posthog.ts` and `src/services/supabase`. Use the RESEARCH "Purchases client wrapper" sketch. Rules: this is the only file importing `react-native-purchases`; pin exact `10.16.0`; provide a fake with the same interface for Jest (the RESEARCH test plan relies on a "fake store adapter"). Never `logOut()` between users. Architecture note: `engine/` must not import it; keep it out of `src/data`.

### Levels and feature access

**Analog (pure seam):** `src/features/grow/growFeatureFlags.ts` (no React/I/O imports; header comment states the seam; `ALL_ON` default; `growFeatureFlags(overrides)`). New `featureRegistry.ts`, `levelFor.ts`, `applyOnb.ts` follow it: pure, table-driven, fast-check properties (skip-all = 2; debt/investments never lower the level). Re-point `growFeatureFlags()` default from `ALL_ON` to the level-derived value, keep the function signature so Grow screens do not change.
**Analog (hook):** `src/features/household/useFeature.ts` (key -> feature map, one hook, screens never read config). `useFeatureAccess(id)` returns `{visible, reason, switchable}` in D-35 order plan, household, level. `src/config/householdFeatures.ts` `HOUSEHOLD_FEATURES` all `true` constant becomes plan-state + sharing-derived; keep `householdFeatureEnabled` call signature so existing tests in `src/features/household/__tests__` still pass.
**Entitlements:** `src/features/decide/entitlements.ts` lines 1-40: `PRO_CANDIDATES`, `ALWAYS_FREE`, `PRO_SWITCHES` (all false), `canUseWith(switches, feature, isPro)`, `canUse`. Per D-04 there is one paid entitlement plus a read-only lock: keep `ALWAYS_FREE` semantics ("safety net and confidence sentence are safety, not features") and keep `canUseWith` as the pure testable function; delete the Pro-candidate gating. Search for callers with `grep -rn "canUse\|PRO_CANDIDATES" src` before changing.
The prototype source for `QS`, `levelFor`, `applyOnb`, `LEVELS`, `FEATS` is `FincWin United.dc.html` (lines 3230-3300 and 3618-3640 per RESEARCH): port, drop the tax rule, drop unbuilt features (RESEARCH 6b table).

### Onboarding and consent

**Analog:** `src/features/consent/ConsentScreen.tsx` (imports lines 1-17; `choose()` busy/idle/done state, lines 23-41; `if (status === 'done') return <Redirect href={APP_HOME_HREF} />` at line 44). Refactor: extract the body into `ConsentContent({ onDone })`; `ConsentScreen` keeps the Redirect wrapper. Onboarding calls `ConsentContent` as its last question and skips it when `consentAnswered` (src/features/consent/consentAnswered.ts). Keep the equal-weight test `src/features/consent/__tests__`.
**Imports pattern to reuse for screens:** `Screen` from `@/ui/Screen`, `Text` from `@/ui/Text`, `useT` from `@/i18n`, `useTheme` from `@/theme/ThemeProvider`, `space, radii` from `@/theme/layout`, `fontSize` from `@/theme/typography`, `captureError` from `@/services/errors`.
**Routing:** `app/index.tsx` `AppEntry` (lines 28-47) already does `useEffect` + `peekPendingInvite()` -> `'checking' | 'join' | 'home'` target state. Add an `'onboarding'` target: first-run = no `profiles.onboarding_state.completed`, no level. Keep invite branch ahead of onboarding for partner short version (D-30). Add a route constant beside `APP_HOME_HREF` in `src/features/auth/appHome.ts` (`'/onboarding' as Href`, same cast comment).
**Income steps:** reuse `src/features/income/IncomeProfileSteps.tsx` unmodified for Q4-Q6 (D-26).
**Sample look-around:** reuse `src/data/samples/` (never write sample rows to real tables).
**Level and answers storage:** `profiles.level`, `profiles.onboarding_state`; read/write through `src/features/you/useProfile.ts` pattern.

### You screen rows

**Analog:** `src/features/you/YouScreen.tsx` lines 244-262: groups are `<SettingsGroup title={t('appLife.you.groups.money')}>`; rows from a `MONEY_ROWS` array with `{id,label,href}` rendered as `<Row label=... leading={tileFor(row.id)} chevron onPress={() => pushOnce(row.href)} />`; `HouseholdYouRow` (line 76) is the pattern for a live sublabel row (Subscription status, Features "Everyday . 27 of 44 on"). Add `acctCard`, `categories`, `headphones` to the tile map `tileFor`. Free help row must never read plan state (Pitfall 10).

### Analytics

**Analog:** `src/services/analytics/catalogue.ts` lines 28-50: `export type EventCatalogue = { name: { prop: 'literal' | 'union' } }`, comments forbid amounts, payees, free text. Finite-literal guard `CATALOGUE_IS_FINITE` rejects loose `string`/`number`. Add `onboarding_started`, `onboarding_question_answered { step: <literal union of 11 keys> }`, `onboarding_finished`, `onboarding_level_assigned { level: 1|2|3|4; source: 'answers'|'skipped'|'existing' }`, `level_changed`, `feature_switch_changed { feature: <feature id union> }`, `paywall_shown { trigger: ... }`, `trial_started`, `plan_changed { plan: 'solo'|'duo'|'household'|'extended' }`, `offer_shown/accepted/dismissed`. Update proof fixture `src/services/analytics/__tests__/catalogue.typecheck.ts`. `account_created.context:'onboarding'` already exists. Consent gating is inside `track()`; do not bypass.

### i18n copy

**Analog:** `src/i18n/locales/en.ts` plus split files under `src/i18n/locales/appLife/`, `household/`, `decideScreens/`; copy guard in `src/i18n/copyGuard/` (`rules.json`, `allowlist.json`, `guard.cjs`, `eslintRule.cjs`) bans "advice/recommend/you should". New namespaces `plans.*`, `onboarding.*`, `features.*`, `lock.*`, `appLife.status.*` go in new files in the same folder layout (e.g. `locales/plans/`), imported into `en.ts` the way household is. Mandated disclosure lines: `src/i18n/mandatedCopy.ts`. Decide wording sign-off files (`decideWordingSigned.json`) are Decide-only; plans wording needs the owner's signed file before keys are frozen (owner item).

### Status keys

`src/ui/status/statusMap.ts`: add `trial, planActive, trialEnding, paymentFailed, readOnly, waitingApproval, coveredBy, freeAccess` using existing tones/icons only (UI-SPEC table). Follow the shape of existing keys in that file; test in `src/ui/__tests__`. Red not used.

### CSV export (D-03)

Analog: `src/data/exportManifest.ts` (column coverage contract with an existing coverage test); add a serializer module and a share-sheet call. Records are read through existing queries, so it works while locked (reads stay open). Include offline "saved on this phone" locked writes (D-40).

### Delete account warning

`src/features/you/DeleteAccountScreen.tsx` + `useAccountDeletionPreview.ts`: add billing warning block (UI-SPEC 10). The Edge Function stays unchanged; it is service-role (`auth.uid()` null) so the lock bypass holds. Add a deletion-cascade check for every new table (pgTAP, DSU-22 style).

## Shared Patterns

### Server access is enforced twice, client is cosmetic
**Source:** RESEARCH Pattern 5 + `src/features/household/useHouseholdScope.ts` header comment ("Owner actions are hidden from members here; the server refuses them anyway (T-08-62)"). Apply to LockedSheet, LockBanner, Features screen, invite approval.

### RPC result shape
**Source:** `20261122000500_household_invites.sql` lines ~676-690. `{"ok": false, "reason": "<code>"}` for business failures; raise only for missing session. Apply to every new RPC (`plan_state`, approval, takeover, switch-rule checks).

### SECURITY DEFINER hygiene
**Source:** `20261122000200_household_members_v2.sql` lines 215-230: `security definer`, `set search_path = ''`, fully qualified names, `revoke execute ... from public, anon, authenticated` then grant only what is needed. `(select auth.uid())` wrapped.

### Edge Function skeleton
**Source:** `supabase/functions/purge-statement-uploads/index.ts` lines 1-34 and `delete-account/index.ts` lines 1-53. Pure logic in sibling files with injected deps; thin `index.ts`; `json()` helper; service-role client created inside the handler and never logged.

### Secrets
**Source:** gitleaks memory and `purge-statement-uploads/auth.ts` header. Own secret per endpoint; function secrets via Supabase, RC public SDK keys only in the app; never in git.

### Typed copy and banned words
**Source:** `src/i18n/copyGuard/`; all new keys under the guarded namespaces.

### UI primitives and tokens
**Source:** `src/ui/*` (Screen, Row, Sheet, ConfirmSheet, ChoiceCard, SegmentedControl, ToggleRow, WarningCard, StateBadge/`src/ui/status`), `src/theme/*` tokens; icons only from `src/ui/icons` (`npm run check:icons`). No new colours; red unused in Phase 9.

### Analytics
**Source:** `catalogue.ts` typed events, consent-gated `track()`. No money, no price, plan id only.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/features/plans/store/purchasesClient.ts` | service | request-response | No purchase SDK in repo; use RESEARCH sketch and `react-native-purchases@10.16.0` typings; fake adapter for Jest |
| Local Expo module for Apple `DCDevice.generateToken()` | native module | request-response | No local native modules exist; iOS only, after Apple enrolment (D-24); not required to close Phase 9 |
| Local trial reminder (scheduled `expo-notifications`) | service | event-driven | Closest is Decide local reminders (`grep -rn "scheduleNotificationAsync" src/features/decide`); read that before writing |
| Webhook HMAC verification | utility | transform | Only shared-secret compare exists (`purge-statement-uploads/auth.ts`); reuse `safeEqual`, add HMAC with Web Crypto |
| Offer cadence store (weekly cap, snooze) | utility | event-driven | Check `src/data/queries/offers.ts` (name suggests recurring-offer queries, not UI offers); local AsyncStorage counters are new |

## Gotchas from the codebase (for planner actions)

1. RESEARCH line numbers for the literal `6` in `20261122000500_household_invites.sql` are approximate; `create_invite` is at line 676. `grep -n ">= 6\|>= 6\|, 6" ` the file when writing the replacement.
2. `household_events.kind` is a CHECK list (members_v2 line 170): any new notice kind needs a migration that rewrites the constraint, and a pgTAP test that inserts each new kind.
3. `hh_event` records `auth.uid()` as actor, and is not callable by clients; the webhook needs its own insert path.
4. `classifyWriteError` currently sends unknown 4xx to `'rejected'` (line 73): without the PT402 branch a locked write is parked as failed with no replay.
5. Every records table already has a `guard_*` BEFORE trigger with the `fincwin.household_rpc` GUC; the lock trigger is additive. Backfill `household_plans` in the same migration set as the lock trigger or the lock locks every existing household.
6. Supabase pushes go through `npm run supabase:db:push` from the main checkout only (CLAUDE.md); worktrees cannot reach the remote.
7. Native fingerprint changes with `react-native-purchases`: a new dev/preview build is required, OTA alone will not carry it.

## Metadata

**Analog search scope:** `supabase/{migrations,tests/database,functions,config.toml}`, `src/{data,db,features/{you,consent,household,grow,decide,auth},services/analytics,ui,i18n}`, `app/`
**Files read in full or in part:** about 20
**Pattern extraction date:** 2026-11-18
