# Phase 9: Tiers & Onboarding - Research

**Researched:** 2026-11-18
**Domain:** Store subscriptions through RevenueCat, a store-neutral household plan record on Supabase, server-enforced read-only lock, level gating, onboarding
**Confidence:** MEDIUM-HIGH (store rules and RevenueCat behaviour verified against official docs; price points, Android device signal and iOS trial-suppression need owner or sandbox confirmation)

<user_constraints>
## User Constraints (from 09-CONTEXT.md, revision 3)

The full, exact decision text is `.planning/phases/09-tiers-onboarding/09-CONTEXT.md` (D-01..D-45). The planner MUST read it. This block is a digest so the research can be read alone; where wording matters (paywall, pledge, D-17, D-20, D-23, D-40 lines) the exact words are in CONTEXT and in 09-UI-SPEC.md.

### Locked Decisions (digest, not a substitute for the file)
- D-01 hard paywall after a 14-day store-managed trial (card taken by the store, D-15); D-02 locked = read-only; D-03 always open: CSV export, Delete account, Manage subscription, Restore purchases, Sign out, Free help row; D-04 update `entitlements.ts` to one paid entitlement plus a read-only lock; D-05 same features on every plan.
- D-06/D-07 four plans (Solo 1, Duo 2, Household up to 6, Extended up to 12), monthly and yearly = 8 products per store in one subscription group, ranked Solo < Duo < Household < Extended; Family Sharing off. US prices $6.99/$49.99, $9.99/$69.99, $14.99/$109.99, $24.99/$189.99.
- D-08 store rules for upgrade/downgrade, app always says immediate vs next renewal; D-09 payer counts as a seat; D-10 trial cap 2 members, paid cap = plan size, server cap rises from 6 to plan size (before paid plans go live); D-11 non-US price table signed by owner before products are created (Canada, UK, euro zone, Australia); D-12 price pledge (exact words in CONTEXT); D-13 one household one bill, store-neutral plan record fed by RevenueCat webhook to an Edge Function, payer separate from owner, feature flags never grant paid access; D-14 member of a covered home sees "Your home already has a plan", Restore always visible, small "Start your own plan".
- D-15 trial = Apple/Google introductory free-trial offer on Solo and Duo only; D-16 four-level trial-reuse limits (store account, payment identity enforced by stores only, device: Apple DeviceCheck / Android researched, person+household on our server); D-17 trial covers 2 people, 3rd person moves to Household with warning; D-17b look-around on sample data before trial; D-18 reminders.
- D-19 payer leaves/fails: any member can take over, first to buy wins, grace 7 days or store grace if longer, payer keeps own store sub, no double charge on takeover (planner decides which covers, tests incl. iOS to Android); D-20 Solo payer invite confirm; D-21 invite beyond plan size needs payer approval + push; D-21a downgrade offer; D-39 once-a-year switch rule only for store countries inside US/CA/EU/EEA/UK/CH/AU/NZ, server-enforced in invite/accept RPCs, store country not app region preference.
- D-22 paywall/disclosure wording; D-23 Manage subscription / Delete account / Leave household are three separate actions; D-24 Apple timing: design both adapters now, real purchases tested on a Google Play test track now, iOS products and iOS purchase test wait for Apple enrolment (Phase 9 may close with them open).
- D-25 Coach not built; D-26 11 questions (prototype 12 minus tax; income questions are shared `IncomeProfileSteps`); D-27 all skippable, skip all = Everyday (level 2); D-28 first-run order sign in, questions (analytics yes/no last), sample look-around (sample answer counts for the 60-second target), paywall, app; D-29 testers free via RevenueCat promotional entitlements until a date, owner free, existing users start on Everything (level 4) with a one-time card; D-30 invited partner short version; D-31 setup re-runnable.
- D-32 four levels from `static LEVELS`, features from `static FEATS` mapped to the real app, mapping table goes to the owner before it is built; D-33 Decide visible at every level; D-34 hidden not greyed, You > Features lists all with switches, a feature holding data never hides; D-35 check order plan, household, level; D-36 suggestions never auto-apply; D-37 at most one offer a week, never on a Decide answer; D-38 typed PostHog events, no money, consent only.
- D-40 offline saves never lost to a lock, server refuses on replay, app keeps them ("Saved on this phone. Choose a plan to sync"), included in export, lock enforced on server (RLS or RPC) as well as app. D-41..D-45 moving out, going Solo, downgrade must fit member count, locked-with-no-payer data kept read-only (retention decided in Phase 11).

### Claude's Discretion
- Default answers for skipped questions, and how answers map to a level.
- The data model and webhook details for the plan record, trial and seats.
- The paywall layout, within the §2 design tokens.

### Deferred Ideas (OUT OF SCOPE)
- The AI Coach: backlog 999.4.
- Bank Sync (Plaid) as a paid add-on: v1.1.
- Apple Small Business Program enrolment: the Phase 11 checklist.
- The iOS purchase test and iOS products: when Apple enrolment lands.
- Refund and chargeback handling beyond RevenueCat's revoke events, and Google's "pause subscription": raise at planning if the store setup needs them.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TIER-01 | 11-question flow sets starting level | Prototype `QS`/`levelFor`/`applyOnb` read (html 3286, 3618, 3629); shared `IncomeProfileSteps`; level+answers stored on `profiles`; section "Levels and onboarding" |
| TIER-02 | Features appear/hide by level | Single `useFeatureAccess()` seam; existing seams `growFeatureFlags.ts`, `useFeature.ts`; check order D-35 |
| TIER-03 | Change level any time | You > Features switches + "Run setup again"; level stored per user |
| TIER-04 | Re-run onboarding | Same flow in re-run mode, pre-filled from stored answers |
| TIER-05 | In-context offer of a hidden feature | `OfferCard`, local counters, weekly cap; trigger table in Levels section |
| TIER-06 | Household features by whether user shares money, independent of level | Second check in D-35; `householdFeatureEnabled` re-pointed to plan state + sharing |
| TIER-07 | Purchase subscription, entitlement recognised across devices | RevenueCat identity = Supabase user id; server plan record via webhook; `usePlanState()` reads server record |
| TIER-08 | Restore purchases | `Purchases.restorePurchases()`; set RC restore behaviour to "Transfer if there are no active subscriptions" |
| TIER-09 | Told which feature a paywall gates and why | `LockedSheet` names the action; write-entry registry (section "Lock") |
| TIER-10 | Cancel via path no harder than deletion | Subscription screen one level from You; Manage subscription deep link |
| ENV-12 | RevenueCat project, keys, products in both stores, Paid Apps Agreement | Product matrix, store setup checklist, status of 00-07 (open) |
| ANL-07 | Onboarding asks analytics consent once, plain language | Existing `ConsentScreen` content mounted with `onDone`; see Don't Hand-Roll |
| ANL-08 | Assigned level and later changes measurable | Typed events `onboarding_level_assigned`, `level_changed`, `feature_switch_changed` in catalogue |
</phase_requirements>

## Summary

Phase 9 is mostly server design and gating plumbing around a thin RevenueCat client. The client buys and restores through `react-native-purchases`; **the app never trusts the client for access**. A RevenueCat webhook (HMAC-signed) wakes a Supabase Edge Function, which re-reads the payer's subscriber state from RevenueCat's REST API, and writes one store-neutral `household_plans` record per household. The app reads that record (plus Realtime) through one hook, `usePlanState()`. Access is enforced a second time in Postgres: a BEFORE-write trigger on every records table (so it also catches the SECURITY DEFINER RPC write paths) raises an HTTP-402 error when the household is locked, and the existing write queue classifies that as a new `locked` failure that is kept on the phone, not dropped.

Four findings change the plan and are not in CONTEXT:
1. **`react-native-purchases` must be pinned to 10.16.0, not 11.x.** 11.0.0 shipped 2026-10-28; RevenueCat's own release notes say "Expo apps should stay on 10.x for now" (CocoaPods trunk freeze, Kotlin 2.1/Billing 9). `latest` on npm is 11.0.4, so a bare `npm install` picks the wrong major. CLAUDE.md's 10.9.1 is stale (10.16.0 is the newest 10.x).
2. **On iPhone the store applies the introductory free trial automatically to any eligible Apple ID.** There is no RevenueCat or StoreKit setting to decline it. D-16's "offer the plans without a trial" therefore needs either trial-free sibling products on Apple (+4 products) or StoreKit's signed `introductoryOfferEligibility` override (not verified here). Google is easier: the app picks the base plan without the offer.
3. **Android has no usable device signal at launch.** Play Integrity "device recall" (the only lasting, privacy-preserving one) is beta and limited to apps with production usage thresholds. D-16 level 3 on Android must be "not available yet" (or an owner-accepted alternative).
4. **CSV export (D-03, DAT-02) is not built.** Only `src/data/exportManifest.ts` (a coverage contract) exists; the download UI is Phase 10. D-03 says export stays open when locked, and the lock explainer (UI-SPEC 9c) has an "Export your data" row. Phase 9 needs a minimal CSV export plan, or the owner moves DAT-02 forward.

**Primary recommendation:** Build in this order: (1) store-neutral plan tables, seat/lock SQL functions and the `locked` write class with pgTAP and Jest tests, no store needed; (2) webhook Edge Function with HMAC, idempotency and re-fetch, tested against RevenueCat sample payloads; (3) `react-native-purchases@10.16.0` client, Plans/Subscription screens and Google Play test-track purchases; (4) levels, onboarding and Features screen; (5) tester/owner grants; leave iOS products, DeviceCheck and the iOS purchase test as listed open items (D-24).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Buy, restore, price display | Browser/Client (RN app + store SDK) | API (RevenueCat) | Store purchase sheet is native; prices must be store strings |
| "Is this household covered, for how many seats, until when" | Database (`household_plans`) | API (Edge Function writes it) | One record, server-owned, store-neutral (D-13) |
| Webhook intake, idempotency, re-fetch, plan upsert | API (Supabase Edge Function) | Database | Needs secret keys and a transaction |
| Read-only lock | Database (trigger) | Client (UI mirror) | App check is cosmetic; server must refuse every write incl. RPCs and queued replays (D-40) |
| Seat cap and D-39 switch rule | Database (invite/accept RPCs) | Client (messages) | Phase 8 RPCs already own membership writes |
| Level, onboarding answers, feature switches | Database (`profiles`/new table, per user) | Client (derives visibility) | Personal, private by default (D-30); client hides, server does not need to |
| Feature visibility gating | Client | — | Hidden-not-greyed UI; no security value server-side |
| Trial reuse (person, household) | Database | API (DeviceCheck check later) | Our own ledger; store enforces Apple ID / Google account |
| Reminders: trial end local notice | Client (local scheduled notification) | — | No server push infra exists; see Push section |
| Payer approval / takeover notices | Database (`household_events`) + Client (realtime) | API (push, Phase 10) | Existing notice channel from Phase 8 |
| CSV export while locked | Client + Database reads | — | Reads stay allowed under lock |
| Analytics events | Client (PostHog, consent-gated) | — | Existing typed catalogue |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-native-purchases` | **10.16.0** (pin exact; NOT 11.x) | Purchases, restore, offerings, customer info, storefront | RevenueCat is settled in CLAUDE.md/PROJECT.md. `npm view` 2026-11-18: `latest` = 11.0.4, newest 10.x = 10.16.0. RC 11.0.0 notes: "Expo apps should stay on 10.x for now" [CITED: github.com/RevenueCat/react-native-purchases/releases] |
| RevenueCat REST API v1 | n/a | `GET /v1/subscribers/{app_user_id}` after each webhook; promotional grants | RC recommends calling GET /subscribers after a webhook so state is always in one format [CITED: revenuecat.com/docs/integrations/webhooks] |
| Supabase Edge Function (Deno) | existing pattern (`supabase/functions/*`) | Webhook receiver, `plan-refresh`, DeviceCheck check later | Precedent: `purge-statement-uploads` uses `verify_jwt = false` plus own shared secret [VERIFIED: supabase/config.toml] |
| `@supabase/supabase-js` | 2.116.0 (installed) | Plan record reads, Realtime | Existing |
| `expo-notifications` | ~57.0.23 (installed) | Local trial reminder (scheduled on device) | Already used for local Decide reminders; no push token code exists [VERIFIED: grep of src, supabase] |
| `posthog-react-native` | 4.86.0 (installed) | Level and plan events | Existing typed catalogue |
| pgTAP | existing (`supabase/tests/database`) | Lock, seat cap, switch rule, RLS | Existing pattern, 99+ test files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Local Expo module for `DCDevice.generateToken()` | n/a (write ~25 lines Swift) | Apple DeviceCheck token (D-16 level 3, iOS) | iOS only, after Apple enrolment. No maintained Expo module exists: `react-native-ios11-devicecheck` last modified 2022-05 [VERIFIED: npm view]; others are Capacitor/Flutter [CITED: search]. Server side needs a DeviceCheck key (.p8) from the Apple developer portal |
| `react-native-purchases-ui` | not installed, do not add | RC prebuilt paywalls | Not used: the paywall is the owner-approved UI-SPEC screen |
| `@react-native-community/netinfo` | 12.0.1 (installed) | Already wired to `onlineManager` | Existing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RevenueCat 10.16.0 | RevenueCat 11.0.4 | 11 raises Android Billing to 9.1.0 and needs Kotlin 2.1.0; RC itself says Expo should stay on 10.x. Revisit after Expo SDK 57 patch notes confirm 11 |
| Trust webhook payload | Re-fetch `GET /subscribers` per event | RC documents no ordering guarantee and up to ~80 minutes of retry; re-fetch makes the write order-independent. Use re-fetch |
| Per-table RLS `RESTRICTIVE` policies for the lock | One BEFORE trigger function on every records table | SECURITY DEFINER RPCs bypass RLS; triggers do not. Use triggers (see Pitfall 5) |

**Installation:**
```bash
npx expo install react-native-purchases@10.16.0   # then confirm package.json holds the exact version
# dev build required (no Expo Go): eas build --profile development
```
No config plugin is needed for a standard install [CITED: revenuecat.com/docs/getting-started/installation/expo]. Do not add `react-native-purchases-ui`.

**Version verification (2026-11-18):** `npm view react-native-purchases` -> `latest` 11.0.4 (modified 2026-11-18), dist-tag `hotfix` 9.15.3; `npm view react-native-purchases versions` includes 10.16.0 (released 2026-10-27 per RC releases page). `getStorefront()` is present in 10.16.0's typings [VERIFIED: unpkg `purchases.d.ts` line 511].

## Architecture Patterns

### System Architecture Diagram

```
 PURCHASE            Phone (dev build)                       RevenueCat                 Supabase
 ------------------------------------------------------------------------------------------------
 person taps  -->  Plans screen --Purchases.purchasePackage--> Apple / Google store
                      |   (app_user_id = auth.users.id,           |  server notifications
                      |    set by Purchases.logIn after sign-in)  v
                      |                                      RevenueCat ----webhook (HMAC)---->  Edge fn  plan-webhook
                      |                                                                           |  1 verify signature, 200 fast
                      |                                                                           |  2 insert plan_events (rc_event_id UNIQUE) -> duplicate? stop
                      |                                                                           |  3 GET /v1/subscribers/{app_user_id}  (re-fetch truth)
                      |                                                                           |  4 one tx: lock household row, upsert household_plans,
                      |                                                                           |     trial_ledger, admit waiting join_requests, hh_event notices
                      |                                                                           v
   usePlanState() <------ Realtime on household_plans + RPC plan_state() <-------------------  household_plans
        |  trial | active | grace | locked | tester | sample
        v
   UI gates (LockBanner, LockedSheet, Features screen)

 WRITE PATH (lock)
   screen/queue -> supabase REST or RPC -> table BEFORE INSERT/UPDATE/DELETE trigger guard_plan_lock()
                                              | household_writable(household_id)?
                                              |-- yes -> write
                                              '-- no  -> RAISE SQLSTATE 'PT402'  -> HTTP 402
   client: classifyWriteError -> 'locked' -> kept on phone (FailedWrite kind 'locked'), replay when plan_state = covered

 INVITE PATH
   create_invite / restore_invite / preview_invite / redeem_invite
      seat limit = household_seats(hid)  (was literal 6)
      redeem over seats -> plan_join_requests row (waiting) + hh_event 'plan_approval_needed' -> payer approves via store plan change
      -> webhook raises seats -> request admitted
      D-39: redeem/leave RPC takes p_store_country (not stored), checks household_leave_log
```

### Recommended Project Structure
```
supabase/migrations/20261124..._plans_*.sql      # tables, functions, triggers, RPC changes (one concern per file)
supabase/functions/plan-webhook/                 # index.ts, verify.ts, sync.ts, *.test.ts  (verify_jwt = false)
supabase/functions/plan-refresh/                 # caller-JWT; re-fetch for the caller's household (fallback when webhook lags)
supabase/functions/plan-grant/                   # service-only script/function: tester + owner promotional grants
supabase/tests/database/NNN_plans_*.test.sql     # pgTAP
src/features/plans/                              # usePlanState, PlansScreen, SubscriptionScreen, LockedSheet, LockBanner, store adapter
src/features/plans/store/                        # purchasesClient.ts (only file importing react-native-purchases)
src/features/levels/                             # level model, feature registry, useFeatureAccess, FeaturesScreen, OfferCard
src/features/onboarding/                         # QuestionScreen flow, summary, partner version
src/services/analytics/catalogue.ts              # new typed events
engine/                                          # untouched: nothing in this phase belongs in engine/
```

### Pattern 1: Store-neutral plan record (D-13)

**What:** `household_plans` (one current row per household) + `plan_events` (append-only audit, `rc_event_id` unique) + `plan_products` (product_id -> plan size, period, store, has_trial).
**Suggested columns (planner finalises):**
- `household_plans`: `household_id pk`, `payer_id`, `store` (`APP_STORE|PLAY_STORE|PROMOTIONAL`), `environment`, `product_id`, `plan_size int`, `period`, `status` (`trial|active|grace|lapsed|promo`), `store_expires_at`, `grace_until`, `covered_until` (= greatest of store expiry and grace), `will_renew bool`, `trial_started_at`, `trial_ends_at`, `original_transaction_id`, `updated_at`, `version`.
- `plan_events`: `rc_event_id text unique`, `type`, `app_user_id`, `payload jsonb` (scrubbed: no email), `received_at`, `applied bool`.
- `trial_ledger`: `user_id`, `household_id`, `started_at` (person and household reuse, D-16 level 4), plus later `device_flags_checked`.
- `household_leave_log` (D-39): `user_id`, `household_id`, `left_at`, `reason` (`left|removed|household_closed`); purge after 13 months and on account delete; declare in the Phase 11 DPIA.
- `plan_join_requests` (D-21): `household_id`, `invite_id`, `user_id`, `status` (`waiting|admitted|cancelled|expired`), `needed_plan_size`.
- Profile/level: `profiles.level smallint`, `profiles.onboarding_state jsonb`, and a per-user `feature_switches` table (or jsonb), private by default, not readable by other members (D-30).

**SQL functions:** `household_seats(hid)` (trial 2, paid plan size, promo 6 or 12, none 1), `household_plan_state(hid)`, `household_writable(hid)`, `plan_state()` (security definer RPC for the caller's household), `guard_plan_lock()` trigger function.
**Source:** CONTEXT D-13, existing guard-trigger idiom (`guard_decide_check`, etc.) in 20261122000500_household_invites.sql.

### Pattern 2: Webhook that cannot be reordered

**What:** Treat the webhook as a doorbell, not the data.
```ts
// supabase/functions/plan-webhook/index.ts (shape; verify_jwt = false in config.toml)
// 1. HMAC: header X-RevenueCat-Webhook-Signature = "t=<ts>,v1=<hex>"; HMAC-SHA256 over `${t}.${rawBody}`;
//    constant-time compare; reject |now - t| > 5 min  [CITED: revenuecat.com/docs/integrations/webhooks]
//    Also accept the dashboard Authorization header as a second check if HMAC is not enabled.
// 2. insert into plan_events (rc_event_id = event.id) on conflict do nothing; if already applied -> 200.
// 3. respond 200 quickly; do the work with EdgeRuntime.waitUntil (RC disconnects after 60 s).
// 4. GET https://api.revenuecat.com/v1/subscribers/{event.app_user_id}  (secret API key in function secrets)
//    also resolve aliases: search original_app_user_id and aliases [CITED: event fields page]
// 5. derive status from the subscriber object, not from event.type:
//      store expiry, period_type (TRIAL/INTRO/NORMAL/PROMOTIONAL), billing_issues_detected_at, grace_period_expires_date
// 6. one transaction: select ... for update on households row; upsert household_plans; admit waiting requests; hh_event notices.
```
Retries reuse the payload `id`, so dedupe on `id` [CITED: event types page]. Failed deliveries retry 5 times over about 80 minutes then stop [CITED: webhooks page]. Therefore also run a **reconciliation sweep** (pg_cron, same pattern as the existing purge job) that re-fetches any household whose `covered_until` is within 24 h or whose last sync is older than a day, and a `plan-refresh` function the app calls at foreground and after a purchase (the UI-SPEC "Updating your plan..." state).

Event semantics to handle (all [CITED: event types page]): `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE` (new subscription may not be effective yet), `CANCELLATION` (does not mean auto-renew is off after a refund), `UNCANCELLATION`, `BILLING_ISSUE` (not an expiration; `grace_period_expiration_at_ms` may be null), `EXPIRATION` (revoke), `SUBSCRIPTION_PAUSED` (revoke only on EXPIRATION with reason SUBSCRIPTION_PAUSED), `SUBSCRIPTION_EXTENDED`, `REFUND_REVERSED`, `TRANSFER` (sent only to the destination user), `TEMPORARY_ENTITLEMENT_GRANT` (<=24 h, fewer fields), `TEST`. Handle unknown future types by doing the re-fetch anyway.

### Pattern 3: Identity
- `Purchases.configure({ apiKey })` with **no** appUserID, then `Purchases.logIn(session.user.id)` immediately after the Supabase session is available. Use the auth UUID only, never email (RC advises against emails: guessability and GDPR) [CITED: revenuecat.com/docs/customers/identifying-customers].
- On account switch (the app has a signed-out account chooser) call `logIn(newId)`; do not call `logOut()` between users. RC says to avoid `logOut()` when you only use custom IDs because it creates a new anonymous ID [CITED: same page].
- Purchases are disabled until `logIn` resolves, so no anonymous purchase is ever created.
- Set the RC project **restore behaviour to "Transfer if there are no active subscriptions"** (project setting, dashboard). Default "Transfer to new App User ID" lets a second FincWin account on the same Apple ID/Google account pull an active subscription away from the payer [CITED: revenuecat.com/docs/projects/restore-behavior]. With the safer option, a member tapping Restore on the payer's store account sees "already used by another account" and the UI points to D-14's "Your home already has a plan".

### Pattern 4: Payer, takeover, double-cover (D-19, D-42)
- `household_plans.payer_id` is the RevenueCat `app_user_id` holder; `household_id` is the payer's current household (maintained by a trigger on `household_members` so a payer who moves out carries the plan to the new household of one, D-42).
- Takeover: member B buys; webhook sees B's active subscription; B becomes `payer_id`; previous payer A keeps their store subscription (their RC record is unchanged) and gets the "cancel it in your app store" notice. **Recommended rule when A recovers later:** the plan recorded at takeover time stays the covering plan; A's recovered subscription is recorded in `plan_events` but never re-linked; notify A. Deterministic, easy to test (planner confirms with owner in the tests list).
- iOS -> Android takeover: different `store` and `original_transaction_id` on the same household row; test that the old Apple transaction is unlinked and the Play token linked in one transaction.
- Never double-count seats: seats come from the single covering row.

### Pattern 5: Lock enforcement (D-02, D-40)
- `guard_plan_lock()` BEFORE INSERT/UPDATE/DELETE trigger on every records table. Raise `RAISE EXCEPTION USING ERRCODE = 'PT402'` -> PostgREST returns HTTP 402 with `"code":"PT402"` [CITED: docs.postgrest.org errors, "PTxyz" custom status]. Tables to cover (from `WriteEntity` and RLS list): transactions, accounts, categories, category_rules, recurring_series, recurring_dismissals, dismissed_series_offers, custom_currencies, import_profiles, undo_log, decide_checks, decide_settings, decide_answers, decide_links, decide_changes, decide_check_history, debts, debt_line_applied, savings_goals, holdings, holding_lots, statement_periods, income_payer_prompts, household shares/settlements tables. **Exclude** `profiles` (consent, theme, level, onboarding must work when locked), `household_members` leave paths, `households`' plan columns, and tables the webhook writes.
- Bypass cases (explicit, tested): `auth.uid() is null` (service role, cascades from `auth.users` delete, the webhook), a transaction-local GUC `fincwin.plan_bypass = 'on'` set inside leave, remove, delete and "leave and continue on Solo" RPCs (the existing `fincwin.household_rpc` GUC is the precedent).
- Per-row household id lookups must be cheap: `household_writable(hid)` reads one row of `household_plans` (indexed by PK) and is `STABLE`; wrap `(select auth.uid())` per project convention.
- **Client class:** add `'locked'` to `WriteErrorClass` (`src/data/sync/writeErrors.ts`). Today an unrecognised code falls to `'rejected'`, which would park the write as failed with no replay. `shouldRetryWrite` must return false for `'locked'` (no hammering), `classifySettledWriteError` must pass it through, and `FailedWrite.kind` gains `'locked'`. These writes are already encrypted at rest (`LargeSecureStore`) and never silently dropped (D-19 of Phase 1).
- **Replay:** `FailedWrite` stores `attempted` payload, not a re-runnable function. Wave 0 spike: confirm whether each entity can be replayed from `attempted`; if not, keep the original paused mutation instead (do not mark it failed; hold it behind a plan gate that resumes with `queryClient.resumePausedMutations()` when `plan_state` flips to covered). Both are viable; the spike decides. [ASSUMED: replay feasibility not inspected beyond writeErrors/failedWrites.]
- Locked UI: reads stay open; write entry points show `pinLock` and open `LockedSheet` (owner Q2).

### Pattern 6: Seats and invites (D-10, D-21, D-39)
Replace the literal `6` in four places of `20261122000500_household_invites.sql`: `create_invite` (line 678), `restore_invite` (766), `preview_invite` (804, the `full` flag), `redeem_invite` (847). New rule: `limit = household_seats(hid)`. Trial = 2, paid = plan size, locked = current member count (no new joins), tester/promo = 6 (or the grant's size).
- Over-limit `redeem_invite` returns `{ok:false, reason:'needs_approval'}` and inserts a `plan_join_requests` row plus `hh_event(..., 'plan_approval_needed', audience = array[payer_id])`. `household_events.kind` has a CHECK constraint listing kinds; the migration must extend it (`plan_approval_needed`, `plan_payer_left`, `plan_takeover`, `plan_grace`, `plan_locked`, `plan_downgrade_offer`). Note `hh_event` writes `actor_id = auth.uid()`; the webhook runs as service role so it needs its own insert helper.
- Approval completes after the **store** accepts the bigger plan (the payer buys the change on the phone) and the webhook raises `plan_size`; then `plan_admit_waiting(hid)` moves the invitee in using the existing `redeem_invite` internals. "Approve" in the app therefore opens the store purchase; there is no server-side approve that changes the bill.
- D-39: add `p_store_country text` to `redeem_invite` (and the join confirm). Compare with the in-rule list (US, CA, EU 27, IS, LI, NO, UK, CH, AU, NZ). Use it for the decision only and **do not store it** (Apple: storefront can change and should not be saved with customer data) [CITED: developer.apple.com Storefront docs via search]. The value is client-supplied, so it is an anti-abuse speed bump, not a guarantee; say so in the DPIA. Read it with `Purchases.getStorefront()` (iOS: App Store storefront; Android: Play country) [VERIFIED: typing exists in 10.16.0; Android implementation detail ASSUMED]. TestFlight/sandbox often reports US regardless of Apple ID country [CITED: developer.apple.com/forums/thread/810860], so tests must inject the country.
- Check `household_leave_log`: refuse join to a *different* household within 12 months when country is in the rule list, except removed-by-owner, household closed (deleted or lapsed), same household, or a support exception (an `exception_until` flag set by service role; no reason stored).

### Pattern 7: Levels and feature access (D-32..D-37)
- One pure module `src/features/levels/featureRegistry.ts`: `{ id, area, minLevel, needsHousehold, holdsDataProbe }[]`. One hook `useFeatureAccess(id)` returns `{ visible, reason: null | 'plan' | 'household' | 'level', switchable }` evaluating plan -> household -> level (D-35). Existing seams to re-point, not duplicate: `growFeatureFlags()` (explicit "Phase 9 swaps the default"), `useFeature('hh.*')` / `householdFeatureEnabled`, and `entitlements.ts`.
- "Holds data never hides" needs a cheap probe per feature (e.g. `exists debts`, `exists holdings`). Reuse existing queries' cached counts; do not add new fetches on every render.
- Level derivation: port prototype `levelFor` (html 3618: track=0, stop/save=1, debt/biz=2, debt owed -> >=2, investments some -> >=2, lots -> 3, lumpy income -> >=2; drop the tax rule) and `applyOnb` (feature switches from answers: debt -> debt+payoff, inv -> inv, share -> household bundle, stop -> caps, save -> goals, lumpy/mixed -> forecast, non-home currency -> multi-currency, watch none -> alerts off). Skipped question = default per UI-SPEC section 2; skip-all = Everyday.
- Offers (TIER-05): local counters in AsyncStorage per user (last-shown date, per-feature snooze/never). Triggers are rules like "debt line exists and Debt is off". Never in Decide answer/stepper, onboarding, sample mode, when locked, or on a payment-notice day.

### Pattern 8: Onboarding
- `QuestionScreen` per UI-SPEC; answers saved after each step to `profiles.onboarding_state` (resume), level written at summary Continue.
- Questions 4-6 reuse `IncomeProfileSteps`; Decide setup and onboarding share the saved income profile (D-26).
- `ConsentScreen` redirects to Home on answer today; mount its content with an `onDone` callback (UI-SPEC dependency 4). Consent is already `useConsent`/`consentAnswered`; skip the step if answered.
- `appHome.ts` gains a first-run route: signed in and no `onboarding_state.completed` and no level -> Onboarding; existing users get level 4 by migration/backfill and the one-time card.
- Sample look-around reuses the 02.2 sample data and the 08.1 First read treatment; a `sample` plan state makes every write entry open the "That needs your own records" `LockedSheet`. The sample data must never be written to the user's real records (existing `samples/` module).

### Anti-Patterns to Avoid
- **Gating on a feature flag or on the client's RevenueCat entitlement alone.** PROJECT.md forbids it, and a modified client would bypass it. Server record plus trigger is the authority; the client's `CustomerInfo` is only used to speed up the "purchase went through" UI.
- **Using `event.type` to compute state.** Compute from the re-fetched subscriber.
- **Calling `Purchases.logOut()` on sign-out** (creates anonymous IDs).
- **Storing store country or device identifiers beyond the decision.** See privacy notes.
- **Optimistic unlock after purchase.** UI-SPEC 9e: the lock lifts only when the server record says covered.
- **One RLS RESTRICTIVE policy per table as the only lock.** Misses SECURITY DEFINER RPCs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Purchase flow, receipts, restore | Custom StoreKit/Billing wrapper | `react-native-purchases` | Store validation, StoreKit 2 and Play Billing 7+ handled |
| Price/period/currency strings | Own formatter or hard-coded prices | `product.priceString`, `introPrice` from RC | UI-SPEC: never hard-code; localised and tax-correct |
| Trial eligibility "once per Apple ID / Google account" | Own check of cards/accounts | The stores' own rules (D-16 levels 1-2) | We never see card or account identity |
| Webhook signature | Home-made scheme | RC HMAC signing (`X-RevenueCat-Webhook-Signature`) + constant-time compare | Documented, recomputed on every retry |
| Webhook ordering/dedupe | Event-sourced state machine | Re-fetch `GET /v1/subscribers` + unique `id` | Ordering undocumented; retries up to 80 min |
| Subscription management / cancel | In-app cancel | `Purchases.showManageSubscriptions()` (iOS 13+) and Play deep link `https://play.google.com/store/account/subscriptions` | App must never claim to cancel (D-23). [ASSUMED: Android URL and `customerInfo.managementURL`; verify in the dev build] |
| Free access for testers/owner | Feature flags or a boolean column | RC promotional entitlement (`POST /v1/subscribers/{id}/entitlements/{ent}/promotional` with `end_time_ms`) | D-29, PROJECT.md. `duration` is deprecated; use `end_time_ms`. A request within 2 hours of an active promo's expiry is treated as a duplicate [CITED: revenuecat.com/docs/api-v1/entitlements.md] |
| Consent screen | New analytics prompt | Existing `ConsentScreen` content + `useConsent` | ANL-07, equal-weight buttons already tested |
| Local reminder | Server cron + push | `expo-notifications` scheduled local notification at trial start | No push infra exists; see Push |
| CSV writer | New format logic | `EXPORT_MANIFEST` column contract + a small CSV serializer | Coverage test already exists |
| Level->feature rules | New logic | Port `levelFor`/`applyOnb` | Owner-approved prototype behaviour |

**Key insight:** every hard part (money movement, trial eligibility by account, receipt validation, price localisation, cancellation) belongs to the stores or RevenueCat. Our code owns exactly one thing: translating "covered / not covered, how many seats, until when" into UI and database rules.

## Runtime State Inventory

Not a rename/refactor/migration phase in the strict sense; two data-migration items still exist:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Every existing `households` row (production, testers) has no plan record; `household_invites` checks the literal 6 | Data migration: backfill a `household_plans` row (`status='promo'`, size 6, `covered_until` = owner-set date) for all existing households, or the lock trigger would lock everyone the moment it ships. Backfill `profiles.level = 4` and `onboarding_state` = existing-user card pending |
| Live service config | RevenueCat project, products, offerings, webhook URL and HMAC secret, Play Console subscriptions, App Store Connect subscription group | New (none exists). Owner/dashboard work; see Environment Availability |
| OS-registered state | None | None |
| Secrets/env vars | New: `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_HMAC_SECRET`, RC public SDK keys (Apple, Google; `EXPO_PUBLIC_` ok, public by design), later `DEVICECHECK_KEY_P8/KEY_ID/TEAM_ID` | Add as Supabase function secrets and EAS env; never in git (gitleaks guide in memory) |
| Build artifacts | Native fingerprint changes (new native module) | New dev client / preview build needed; OTA alone will not carry `react-native-purchases` |

**Order matters:** ship the backfill in the same migration set as the lock trigger, never before it is verified in pgTAP, and push to production only through `npm run supabase:db:push` with the owner's approval.

## Common Pitfalls

### Pitfall 1: `npm install react-native-purchases` installs 11.x
**What goes wrong:** `latest` is 11.0.4; RC says Expo apps stay on 10.x; 11 needs Kotlin 2.1.0 and Play Billing 9.1.0 and CocoaPods resolution failed during the trunk freeze. **How to avoid:** pin `10.16.0` exactly (no caret); add a Jest/CI check that `package.json` holds that exact string; CLAUDE.md Technology Stack row needs updating (stale 10.9.1). **Warning signs:** pod install errors, Gradle Kotlin errors.

### Pitfall 2: Apple applies the free trial automatically
**What goes wrong:** D-16 says a person with a used trial sees plans "without a trial". On iOS the App Store applies the introductory offer to any eligible Apple ID; RevenueCat says the SDK does not control this [CITED: revenuecat.com/docs/subscription-guidance/subscription-offers]. A household/device flagged as used but a fresh Apple ID would still get a trial. **How to avoid:** on iOS create trial-free sibling products for Solo and Duo (monthly and yearly: +4, so 12 on Apple) in the same group/level and buy those when our checks fail; or use StoreKit's signed `introductoryOfferEligibility` purchase option (iOS 17.2+; named in search results, not verified in Apple docs here; RevenueCat support unknown) [ASSUMED]. Decide before creating Apple products. Google: choose `SubscriptionOption` = base plan without the offer; eligibility "New customer acquisition" lets Google also enforce per-account (do **not** use "Developer determined", which turns Google's own check off) [CITED: support.google.com/googleplay/android-developer/answer/12154973].

### Pitfall 3: Upgrade during a trial differs by store
**Apple (official):** "Upgrade From Introductory Offer: the introductory price ends immediately and the customer's prorated amount from the prior In-App Purchase is refunded... The new In-App Purchase is charged and goes into effect immediately at the full price, which changes the customer's renewal date to the upgrade date." So D-17's "Your free trial ends and {price} is charged today" is **correct on Apple** for Duo to Household (Household has no trial) [CITED: developer.apple.com/help/app-store-connect/reference/subscription-events]. Solo to Duo (both with a trial) in the same group: an Apple staff reply says the existing trial is kept [CITED: developer.apple.com/forums/thread/699356]; D-17 does not cover this case. Crossgrade (same level) with different durations takes effect at the next renewal; design Apple levels so monthly and yearly of one plan share a level (a switch between them is "at next renewal").
**Google (official):** table of replacement modes. For a trial-ending upgrade Google lists `CHARGE_PRORATED_PRICE` ("access immediately, remaining value of the free trial carried over, based on base plan pricing"), `WITHOUT_PRORATION` keeps the trial; `CHARGE_FULL_PRICE` "charges the full price for the new entitlement immediately" [CITED: developer.android.com/google/play/billing/subscriptions]. It is **not certain** that `CHARGE_PRORATED_PRICE` charges the full price on a trial upgrade. **Recommended matrix** (verify each cell with a license tester before the copy is frozen):

| Change | Google mode | Result to say in the app |
|---|---|---|
| Upgrade while in trial to a no-trial plan (Duo->Household) | `CHARGE_FULL_PRICE` | "Trial ends, {price} charged today" (matches D-17) |
| Upgrade while in trial, both with trial (Solo->Duo) | `WITHOUT_PRORATION` | "Your trial continues; the new price starts when it ends" |
| Paid upgrade, same billing period | `CHARGE_PRORATED_PRICE` (D-08 preference, upgrades only) | "Takes effect now; the store charges the difference" |
| Paid upgrade, different billing period (monthly->yearly) | `CHARGE_FULL_PRICE` | "Takes effect now, full price today" |
| Any downgrade | `DEFERRED` | "Takes effect at your next renewal on {date}" |
RevenueCat's SDK default is `WITHOUT_PRORATION` if you pass nothing, so always pass `GoogleProductChangeInfo` with an explicit mode [CITED: RC google-play upgrades guide].

### Pitfall 4: Grace and hold do not line up with D-19
Google: during grace the entitlement stays active (RC sets `billingIssueDetectedAt`); during **account hold the entitlement is inactive** and RC sends EXPIRATION at the end of the hold; account hold defaults to 60 days minus grace, total must be at least 30 days [CITED: revenuecat.com guides, support.google.com]. Apple grace is optional and configurable in App Store Connect. D-19 says the app's grace is 7 days or the store's if longer and "never ends access while the store still treats the subscription as active". **Implement** `grace_until = greatest(first_billing_issue_at + 7 days, store grace_period_expires_date)` and `covered_until = greatest(store_expires_at, grace_until)`; a Google account-hold period is not "store active", so the app's 7 days from the first failure is what keeps access. Turn grace on in both stores. Product changes during billing retry/grace: Apple documents only that cancel and win-back states exist, not whether a product change is allowed (the page is silent) [CITED: Apple subscription events]. [ASSUMED] Treat as "not allowed"; show "Fix payment first" and test in sandbox (UI fallback is a planned edge case, D-44).

### Pitfall 5: A lock that SECURITY DEFINER code walks around
Phase 8 RPCs (`hh_move_rows`, import finalisation, Decide apply patches, etc.) write with owner rights and skip RLS. A pure RLS lock would let them write when locked. The trigger approach fires for them too, so every bypass must be explicit (GUC) and covered in pgTAP, including: delete-account cascade, leave/remove RPCs, `redeem_invite` moving rows, webhook writes, and `profiles` writes (consent, theme, level).

### Pitfall 6: Webhook timeouts and sandbox traffic
RC disconnects after 60 s; respond 200 first. Sandbox events (`environment: SANDBOX`) include Apple App Review and TestFlight purchases, which must unlock the review account, so accept them but record `environment` and exclude from any revenue reporting. One Supabase project is production [CITED: CLAUDE.md]; there is no staging, so webhook tests use recorded payload fixtures plus RC's `TEST` event.

### Pitfall 7: Store-country spoofing and test blindness
`getStorefront()` is client-supplied; TestFlight/sandbox storefront can be US regardless of account [CITED: Apple forums 810860]. Unknown/null storefront needs a rule (owner question Q6).

### Pitfall 8: Notification claims you cannot keep
D-21 and D-18 promise pushes. No push token table, send function or FCM/APNs credential exists (grep of `src` and `supabase` found no `push_token`; ENV-19 pending; APNs blocked on Apple enrolment). See Push section.

### Pitfall 9: CocoaPods and RC release timing
RC notes say CocoaPods trunk becomes read-only 2026-12-02. Build and cache the iOS dev build before that date, and pin versions (including `PurchasesHybridCommon`) [CITED: RC releases page].

### Pitfall 10: Free-help and the lock
D-03 says the Free help row never sits behind the paywall. The existing 08.1 trigger (PR #159/163) shows links inside a Decide answer; You > Free help is a new row that must read static links with no plan check.

## Code Examples

### Purchases client wrapper (only file that imports the SDK)
```ts
// src/features/plans/store/purchasesClient.ts  (sketch)
// Source: react-native-purchases 10.16.0 typings (unpkg purchases.d.ts)
import Purchases, { type PurchasesPackage, type GoogleProductChangeInfo, type Storefront } from 'react-native-purchases';

export async function startPurchases(apiKey: string, userId: string) {
  Purchases.configure({ apiKey });            // no appUserID: logIn sets the Supabase user id
  await Purchases.logIn(userId);              // never logOut() on sign-out between users
}
export const storefront = (): Promise<Storefront | null> => Purchases.getStorefront();
export const restore = () => Purchases.restorePurchases();
export const manage = () => Purchases.showManageSubscriptions();   // iOS sheet; Android opens Play URL (ASSUMED)
export function buy(pkg: PurchasesPackage, change?: GoogleProductChangeInfo | null) {
  return Purchases.purchasePackage(pkg, null, change ?? null);       // pass explicit replacement mode on Android
}
```

### Lock trigger (shape)
```sql
-- Source: PostgREST errors doc (PTxyz custom status); project guard_* trigger idiom
create or replace function public.guard_plan_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare hid uuid := coalesce(new.household_id, old.household_id);
begin
  if (select auth.uid()) is null or current_setting('fincwin.plan_bypass', true) = 'on' then
    return coalesce(new, old);
  end if;
  if not public.household_writable(hid) then
    raise exception 'plan locked' using errcode = 'PT402', hint = 'plan_locked';
  end if;
  return coalesce(new, old);
end $$;
```

### Client class
```ts
// src/data/sync/writeErrors.ts addition (shape)
if (err instanceof DbError && (err.code === 'PT402' || err.status === 402)) return 'locked';
// shouldRetryWrite: return false for 'locked'; recordFailedWrite({ kind: 'locked', ... })
```

### Webhook signature check (Deno)
```ts
// Source: revenuecat.com/docs/integrations/webhooks (HMAC-SHA256 over `${t}.${rawBody}`, constant-time compare, ~5 min tolerance)
const [tPart, vPart] = header.split(',');               // "t=...,v1=..."
const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`));
// compare hex with timingSafeEqual from @std/crypto; reject if |now-t| > 300 s
```

### Tester/owner grant
```bash
# Source: revenuecat.com/docs/api-v1/entitlements.md ; end_time_ms replaces deprecated duration
curl -X POST https://api.revenuecat.com/v1/subscribers/$USER_UUID/entitlements/$ENTITLEMENT/promotional \
  -H "Authorization: Bearer $REVENUECAT_SECRET_API_KEY" -H "Content-Type: application/json" \
  -d '{"end_time_ms": 1798675200000}'
```
Run from a service-side script (never from the app), idempotent per user; record grants in `plan_events`. Grants create the RC customer if absent.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `duration`/`start_time_ms` promotional grants | `end_time_ms` | RC API v1 (duration deprecated) | Use end date |
| Play `ProrationMode` | `ReplacementMode` (`CHARGE_PRORATED_PRICE`, `DEFERRED`, ...) | Play Billing 5+ | Explicit mode per change |
| Fixed Apple price tiers | ~900 equalised price points, per-storefront overrides | Dec 2022; storefront prices stop auto-updating once overridden | Owner price table is feasible [CITED: RevenueCat blog, iclarified] |
| Anonymous RC IDs | `logIn(customId)` | RC docs | Use Supabase UUID |
| Play Integrity classic | Play Integrity standard + device recall (beta) | 2024-2026 | Device recall not available at launch |

**Deprecated/outdated:** `Purchases.syncPurchases()` (use `syncPurchasesForResult`), `purchasePackage(…, upgradeInfo, …)` second argument (use `productChangeInfo`), RC `entitlement_id` webhook field (use `entitlement_ids`).

## Study areas answered (the eight open questions)

### 1. RevenueCat on Expo SDK 57 (verified)
Config plugin: not required for a standard install; dev build required, Expo Go only mocks the API (Preview API mode) [CITED: installation/expo]. Version: pin 10.16.0 (see above). Identity: Supabase UUID via `logIn`. Offerings: one Offering `default` with 8 Packages mapped by product ids (Apple product ids are flat; Google product = subscription id, base plan = period, RC id `subId:basePlanId`). One entitlement `access` for all paid products; seat size comes from `plan_products` (do not encode seats in entitlements). A second entitlement `promo_household`/`promo_extended` is not needed: tester grants use the same entitlement, with seat size set from the grant script into `household_plans`. Promotional grants: REST `POST .../promotional` with `end_time_ms`; the owner uses a far-future end time (a "lifetime" value exists but `duration` is deprecated) [CITED: api-v1/entitlements]. Webhook: HMAC (preferred) or Authorization header; 200 required; retries 5 times over about 80 min; at-least-once; dedupe on `id`; no ordering guarantee documented; most events arrive in 5-60 s, cancellations within about 2 h [CITED: webhooks page]. Transfer/restore: set "Transfer if there are no active subscriptions" [CITED: restore-behavior]. Webhook `TRANSFER` event goes only to the destination user.

### 2. Apple
- Intro free trial on Solo/Duo only inside one group: eligibility is per group (once per Apple ID) [CITED: Apple "Implementing introductory offers"]; offers attach per product, so Household/Extended simply have no offer.
- Upgrade in intro offer: immediate, trial ends, prorated refund, full price charged, renewal date moves (see Pitfall 3, HIGH). Downgrade from an intro offer: not immediate; charged at the next billing cycle (free trial: after the trial, per the "pay up front"/"as you go" text: apply to free trial by analogy) [CITED: Apple subscription events]. Crossgrade with different durations: next renewal date.
- Family Sharing: configured per product in App Store Connect; keep off [ASSUMED: Apple states it cannot be disabled again once enabled; verify before first product save].
- Product change during billing retry/grace: undocumented in Apple's page (Pitfall 4).
- Storefront before purchase: `Purchases.getStorefront()` [VERIFIED typing]; sandbox/TestFlight reports US [CITED].
- DeviceCheck two bits: server calls `api.devicecheck.apple.com/v1/query_two_bits` / `update_two_bits` with an ES256 JWT from the DeviceCheck key; fresh token per request; tokens are single-use [CITED: Apple docs/forum 750678]. Needs a local Expo module (no maintained one). Bits persist across reinstall; declare in App Privacy; GDPR legitimate-interest note goes in the DPIA (Phase 11) [ASSUMED for the Apple "declare" requirement wording].

### 3. Google Play
- Free trial = an offer on a base plan; use eligibility "New customer acquisition" (Google evaluates per account); "Developer determined" disables Google's check [CITED: Play Console help 12154973].
- Replacement modes: see matrix. Behaviour in grace/hold: entitlement active in grace, inactive in account hold [CITED: RC state-machine guide].
- Billing country before purchase: `BillingClient.getBillingConfigAsync()` is the Play country API (do not cache; one-off use) [CITED: search, Flutter wrappers; official page not fetched]; RC `getStorefront()` presumably wraps it [ASSUMED].
- Lasting device signal: **none viable at launch.** Play Integrity device recall: 3 bits per device, survives reset, 3-year retention, but the beta is open only to apps with production Play Integrity and Billing usage above thresholds, and it needs a Play-licensed account and real devices (not emulators) [CITED: developer.android.com/google/play/integrity/device-recall]. Alternatives (ANDROID_ID, advertising ID, hardware identifiers) are resettable, identifier-like and hard to declare under GDPR/Data safety; **do not use**. Recommend: Android trial reuse relies on levels 1, 2 and 4 until device recall opens; record this as an accepted gap (owner Q3) and re-check after launch.
- Internal test track: required to test real Play purchases with license testers; RC Test Store covers neither trials nor billing issues, and Test Store keys crash in release builds, so Play-track builds use the Play key [CITED: revenuecat.com/docs/test-and-launch/sandbox/test-store]. Status of 00-07 (Play org account) is **unknown**: no SUMMARY exists and STATE shows it waiting on the D-U-N-S number (ETA was 2026-10-13). Owner Q1.

### 4. Server changes
See Patterns 5 and 6. Exact places: `create_invite` line 678, `restore_invite` 766, `preview_invite` 804, `redeem_invite` 847 of `20261122000500_household_invites.sql`. New migration redefines them with `household_seats()`; keep the existing locking (`for update` on `households`). Detecting a refused replay: HTTP 402 / code `PT402` -> `locked` class. pgTAP must prove every records table refuses writes while locked, and that `profiles`, leave, delete-account and webhook paths still work.

### 5. Push
What exists: `expo-notifications` for **local** scheduled Decide reminders and a notification observer; no push-token storage, no server send code, no FCM/APNs credentials (ENV-19 pending, APNs blocked on Apple). Phase 10 owns server alerts (ALR-06). **Recommended Phase 9 scope:** (a) trial-end reminder as a local notification scheduled at purchase from `trial_ends_at - 2 days`, re-checked and cancelled on app open when `willRenew` is false or the plan changed; (b) every other notice (approval needed, payer left, grace, takeover, downgrade) rides `household_events` + Realtime and shows in-app (UI-SPEC already says notices appear in-app if the channel is not ready); (c) leave a clean seam: `plan_notifications` rows (`user_id`, `kind`, `params`, `push_sent_at null`) that Phase 10's sender consumes. If the owner wants D-21's push now, add a minimal `push_tokens` table + `send-push` Edge Function over the Expo Push API, which needs FCM v1 credentials uploaded to EAS first (Android only until APNs). Owner Q4.

### 6. Codebase map (what exists, what changes)
| Path | Exists | Phase 9 change |
|---|---|---|
| `src/features/decide/entitlements.ts` | `PRO_CANDIDATES` (multipleOpenChecks, setbacks, decisionJournal, payoffComparisons), `ALWAYS_FREE`, `PRO_SWITCHES` all false, `canUse(feature, isPro)` | Replace with `usePlanState()`-backed single access check; keep `ALWAYS_FREE` semantics as "Decide parts that always travel together" (D-04); record change against 05 D-17 and APP-18 |
| `src/config/householdFeatures.ts`, `src/features/household/useFeature.ts` | all true | Point at plan state + sharing eligibility (TIER-06); screens keep calling `useFeature` |
| `src/features/grow/growFeatureFlags.ts` | `ALL_ON`, comment says Phase 9 swaps the default | Feed from level/switches |
| `src/features/income/IncomeProfileSteps.tsx` | shared income steps | Reuse for onboarding Q4-Q6 |
| `src/features/consent/*` | `ConsentScreen`, `useConsent`, `consentAnswered`; redirects Home on answer | Add `onDone` mode |
| `src/features/auth/appHome.ts` / `app/index.tsx` | `APP_HOME_HREF`; `AppEntry` already branches on a pending invite | Add onboarding branch ahead of Home; keep invite branch |
| `src/services/analytics/catalogue.ts` | typed `EventCatalogue`, finite-literal guard; `onboarding_history_choice`, `account_created{context:'onboarding'}` already exist | Add events: `onboarding_started/question_answered/finished`, `level_assigned{level,source}`, `level_changed`, `feature_switch_changed{feature}`, `paywall_shown{trigger}`, `trial_started`, `plan_changed`, `offer_shown/accepted/dismissed`. No amounts, no price, only plan id [PRICING §8 item 9] |
| `src/features/you/YouScreen.tsx` | groups Add, Money, Appearance, Alerts and feel, Privacy and data, Account | New rows Subscription, Features, Free help |
| `src/features/you/DeleteAccountScreen.tsx`, `supabase/functions/delete-account` | exists | Add billing warning; Edge Function already service-role so lock bypass holds |
| `src/data/sync/writeErrors.ts`, `failedWrites.ts`, `src/ui/FailedWritesSheet.tsx` | classes conflict/not-found/rejected/transient/auth/discarded | Add `locked` |
| `app/(app)/household/*`, `InviteSheet`, `leave/` | Phase 8 | Plan line, approval screen, switch-rule refusal, "Leave and continue on Solo" |
| `src/data/exportManifest.ts` | coverage contract only | Build CSV export (see Summary finding 4) |
| `supabase/functions/` | delete-account, purge-statement-uploads, read-pdf-statement, resolve-rate | Add plan-webhook, plan-refresh, grant script |

### 6b. Inventory for the owner's level-mapping table (D-32)
Prototype `FEATS` items checked against the repo (route/file evidence). "Built" = a screen or module exists; "Cut/not built" must not appear in You > Features. Levels shown are the prototype's, for the owner to change.

| Prototype feature (level) | Status in this repo | Evidence |
|---|---|---|
| Money in and out, Categories, Search, A month at a time (1) | Built | `features/record/entry`, `categories`, `activity/SearchBar`, `MonthSwitcher` |
| Repeating bills (2), Clone a month (2), Refunds (2) | Built | `recurring_series`, `CloneMonthSheet`, `refundLinks` |
| Receipts (2) | **Cut/not built** | no module |
| Split a line across categories (3), Select several / bulk (3) | Bulk built (`BulkBar`); category split unconfirmed | `BulkBar.tsx`; no split-lines module found: **owner/planner confirm** |
| Search every month (4) | Likely built | `app/(app)/history.tsx`: confirm |
| One account, balances (1), Several accounts (2), Transfers (2) | Built | `accounts/`, `mutations/transfers.ts` |
| Reconcile (3) | Partly: reconcile-or-new on import | `ReconcileChoice.tsx`, `statement_periods`; stand-alone reconcile unconfirmed |
| Other currencies (3) | Built | `custom_currencies`, FX stamping |
| Connect a bank (4) | **Cut (v1.1 Plaid)** | deferred |
| Envelopes and caps (2) | Built | category caps / rule caps |
| Alerts (2) | **Phase 10 not built** (Decide reminders exist as local notifications) | ALR-* pending |
| Health score, Envelope rollover, Forecast, Compare months, Cash flow, Extra views, Year calendar (2-4) | Mostly **not found** as separate features; Decide owns forecasting | owner confirm each |
| What is coming (2) | Built | `home/ComingUpCard.tsx`, `comingUp.ts` |
| Savings goals (2), Automatic saving (2), Debt (3), Payoff planner (3), Investments (3), Cost basis and lots (4) | Built (Grow) | `grow/goals`, `debts`, `investing`, `lots` |
| Round-ups (3), Price feed (4) | **Cut/not built** | no module |
| Household, Category split rules, Settle up (9) | Built (Phase 8) | `household/*` |
| Read-only summary link (9) | Deferred (HH-12, D-45 of 08) | `householdFeatures.ts` comment |
| Chart modes (2) | Partly: `decide/charts`, home charts | confirm |
| Coach (3), Tax pack (3), Widgets (4), Licence and devices (4) | **Cut** | D-25, tax removed |
| Export (2) | **Not built yet** (manifest only; DAT-02 Phase 10) | see Summary |
| Import and paste (3) | Built: CSV/OFX/QFX/PDF/paste | `record/import`, `PasteSheet` |
| Undo history (4) | Built | `undo_log`, `mutations/undo.ts` |
| Archive (4) | Phase 10, not built | pending |
| **Built but not in the prototype list** | PDF statement import; Decide parts (open checks, setbacks, decision journal, payoff comparisons, safety net, repeating-bill setup, pots, past decisions, "go ahead"); household split types (weights, amounts, category defaults, shared accounts, settle-ups); Grow parts (growth illustration, calculators, safety-net card, debt plan, goal contributions); pay/income tagging; refund links; recurring review sheet | `decide/*`, `grow/*`, `household/*` |

### 7. Non-US price points (proposal for owner sign-off, D-11)
Method: multiplier per market from the owner's own earlier research (PRICING §1 used CA ≈ ×1.35, UK ≈ ×0.88 VAT-inclusive for the old $7.99/$59.99 plan), then snapped to the nearest `.49`/`.99`. Apple and Google both allow manual per-storefront prices from a large price-point list (Apple ~900 points; manual overrides stop auto-updating) [CITED: RevenueCat/iclarified]. **All figures below are [ASSUMED] proposals**; the planner's first task is to open App Store Connect and the Play Console price pickers and replace any value that is not an available price point. UK and euro prices include VAT; CAD and AUD show before sales tax in Canada (GST/HST added) and include GST in Australia [ASSUMED]; effective net differs by market, so the owner should look at net-of-tax and store fee (15%) not only the shelf price.

| Plan | US $ mo / yr | Canada CAD (x1.35) | UK GBP (x0.88, VAT incl.) | Euro zone EUR (x1.00, VAT incl.) | Australia AUD (x1.55, GST incl.) |
|---|---|---|---|---|---|
| Solo | 6.99 / 49.99 | 9.49 / 67.99 | 5.99 / 43.99 | 6.99 / 49.99 | 10.99 / 77.99 |
| Duo | 9.99 / 69.99 | 13.49 / 94.99 | 8.99 / 61.99 | 9.99 / 69.99 | 15.49 / 108.99 |
| Household (6) | 14.99 / 109.99 | 19.99 / 148.99 | 12.99 / 96.99 | 14.99 / 109.99 | 22.99 / 170.99 |
| Extended (12) | 24.99 / 189.99 | 33.99 / 256.99 | 21.99 / 166.99 | 24.99 / 189.99 | 38.99 / 294.99 |

Rules to keep: yearly stays under 12 monthly payments in every market; Household stays at the YNAB-up-to-6 anchor idea; all other countries use store auto-conversion (D-11). The price pledge applies per storefront.

### 8. Testing without real money
- **Postgres (pgTAP):** plan state function, `household_seats`, every lock-trigger table, bypass cases, `create/restore/preview/redeem_invite` limits at 1/2/6/12, D-39 matrix by country/exemption, takeover single-cover, join-request admit, `household_events` kind extension, backfill, RLS (a member cannot read another member's feature switches or answers).
- **Edge Function (`deno test`, added to `npm run test:deno`):** HMAC valid/invalid/replayed/too old, duplicate `id`, out-of-order events (apply EXPIRATION then older RENEWAL: final state follows re-fetch), unknown event type, SANDBOX and PROMOTIONAL stores, TRANSFER, BILLING_ISSUE with null grace, iOS->Android takeover, refund. Feed recorded JSON fixtures; stub the RC REST client.
- **Jest:** `usePlanState` transitions, level derivation (property tests with fast-check over answer combinations: skip-all = 2, monotonic with debt/investments), feature access order, `classifyWriteError` PT402, failed-write `locked` retention/replay, offer cadence (weekly cap, 30-day snooze), banned-word guard on new copy keys, catalogue typecheck for new events.
- **Real store flows:** Google Play license testers on an internal-track build with the Play RC key (renewals accelerate; RC Test Store does not cover trials/billing issues and must not ship) [CITED]. Apple: sandbox/TestFlight later (D-24). Maestro for the Android first-run flow through paywall using license-tester purchase is flaky; keep it manual with a checklist in HUMAN-UAT.
- **Webhook end to end:** RC dashboard "send test event" (`TEST`) against the deployed function with a signature, then a license-tester purchase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | StoreKit `introductoryOfferEligibility` signed override can force "not eligible" and RC can pass it | Pitfall 2 | If wrong, iOS needs the trial-free sibling products (the safe default) |
| A2 | Apple Family Sharing cannot be turned off once on | Study area 2 | Low: we keep it off from the first save |
| A3 | Apple does not allow product change during billing retry/grace | Pitfall 4 | UI fallback copy would be wrong; sandbox test |
| A4 | `getStorefront()` on Android returns the Play billing country | Pattern 6 | D-39 uses a different source; test on device |
| A5 | `showManageSubscriptions` on Android and `customerInfo.managementURL` deep link | Don't Hand-Roll | Use `Linking.openURL` to the Play URL instead |
| A6 | Google `CHARGE_FULL_PRICE` on a trial-to-no-trial upgrade charges full price today | Pitfall 3 matrix | D-17 wording changes on Android; verify with license tester |
| A7 | Non-US price figures and tax-inclusive behaviour per market | Section 7 | Wrong shelf prices; owner sign-off plus price-picker check mitigates |
| A8 | FailedWrite `attempted` can replay every entity | Pattern 5 | Need paused-mutation hold instead; Wave 0 spike |
| A9 | DeviceCheck use must be declared in Apple App Privacy | Study area 2 | Compliance wording; confirm in Phase 11 |
| A10 | Apple "downgrade from free trial" takes effect after the trial | Study area 2 | Wording on the Manage screen; sandbox check |

## Open Questions

1. **Replay of locked saves** (A8): paused-mutation hold vs FailedWrite replay. Recommend: a half-day spike in plan 1; default to holding the original mutation.
2. **Which covers when A recovers after takeover** (D-19 leaves this to the planner): research recommends "takeover plan stays". Confirm in the plan.
3. **Do Solo-to-Duo changes during a trial keep the trial?** Apple forum says yes; Google `WITHOUT_PRORATION`. D-17 only words the 3rd-person case. Needs UI-SPEC copy for "your trial continues".
4. **Sandbox App Review account** must be granted store access without a real subscription: either a sandbox purchase flow in review notes or a promotional grant to the review account. Plan with Phase 11.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, jest | yes | v24.15.0 | none needed |
| Deno | `test:deno` | yes | 2.9.5 | none needed |
| npm registry | version checks | yes | n/a | none needed |
| Supabase CLI | migrations | not run in this session (`npx --no-install` found nothing; repo uses pinned devDependency) | repo pinned (3.x per CLAUDE.md) | run from `C:\dev\fincwin` main checkout only |
| EAS CLI | dev/preview builds | not probed | n/a | run from the real-node_modules checkout |
| RevenueCat project and keys | ENV-12 | **not verified; `react-native-purchases` not installed** | n/a | owner creates; blocks purchase testing |
| Google Play Console + internal test track + license testers | D-24 Android purchases | **unknown, 00-07 has no SUMMARY** | n/a | Without it, only webhook fixtures and RC Test Store (no trials) are testable; blocks "real purchase" acceptance |
| Play subscriptions need an uploaded app version with the billing permission | product creation | unknown | n/a | upload an internal build first [ASSUMED standard Play behaviour] |
| Apple Developer enrolment, Paid Apps Agreement, banking and tax | ENV-12 iOS side, DeviceCheck key | no (blocked on D-U-N-S/00-07) | n/a | iOS adapter designed and fixture-tested only (D-24) |
| FCM v1 / APNs push credentials | server push | no (ENV-19) | n/a | in-app notices + local reminder |

**Missing with no fallback:** none blocks starting Phase 9 code. Real Android purchase acceptance is blocked on the Play account/test track.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + RNTL (app), pgTAP (Postgres), `deno test` (Edge Functions), fast-check 4.x (properties) |
| Config file | `jest.config.*` (existing), `supabase/tests/database/*.test.sql`, `deno.json` per function |
| Quick run command | `npx jest src/features/plans src/features/levels src/features/onboarding src/data/sync` |
| Full suite command | `npm run lint && npm run typecheck && npm test && npm run test:deno` plus the rls CI job (pgTAP) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TIER-01 | answers -> level (skip-all = 2; debt/inv/lumpy rules) | unit + property | `npx jest src/features/levels/__tests__/levelFor` | Wave 0 |
| TIER-02/03 | access order plan>household>level; holds-data never hides | unit | `npx jest src/features/levels/__tests__/featureAccess` | Wave 0 |
| TIER-04 | re-run pre-fills, Keep changes nothing | RNTL | `npx jest src/features/onboarding` | Wave 0 |
| TIER-05 | weekly cap, 30-day snooze, never-on-Decide | unit | `npx jest src/features/levels/__tests__/offers` | Wave 0 |
| TIER-06 | household feature needs sharing, not level | unit | `npx jest src/features/household/__tests__/useFeature` | exists, extend |
| TIER-07 | webhook -> plan record; cross-device read | deno + pgTAP | `deno test supabase/functions/plan-webhook` ; pgTAP `plans_*` | Wave 0 |
| TIER-08 | restore path, "already used by another account" | RNTL with store adapter mock | `npx jest src/features/plans` | Wave 0 |
| TIER-09 | LockedSheet names the action | RNTL | `npx jest src/features/plans/__tests__/lockedSheet` | Wave 0 |
| TIER-10 | Subscription row one level from You; Manage opens store | RNTL | `npx jest src/features/you/__tests__` | exists, extend |
| D-10/D-21/D-39 | seats 1/2/6/12, approval, switch rule | pgTAP | `npm run test:rls` (existing CI job) | Wave 0 |
| D-02/D-40 | every records table refuses writes when locked; bypasses work | pgTAP | pgTAP `plans_lock` | Wave 0 |
| D-40 client | 402 -> `locked`, kept, replayed | Jest | `npx jest src/data/sync` | exists, extend |
| ENV-12 | RC project/products/webhook live | manual checklist | HUMAN-UAT | n/a |
| ANL-07 | consent once, last step, equal weight | RNTL | `npx jest src/features/consent src/features/onboarding` | exists, extend |
| ANL-08 | typed level events, consent-gated | Jest + typecheck fixture | `npx jest src/services/analytics` | exists, extend |

### Sampling Rate
- **Per task commit:** quick run for the touched folder (memory: quick checks per plan, full suite at milestones).
- **Per wave merge:** lint + typecheck + Jest + `test:deno`; pgTAP when migrations change.
- **Phase gate:** full suite green; pgTAP on a local stack; owner device pass on Android license-tester purchase; iOS items listed open (D-24).

### Wave 0 Gaps
- [ ] pgTAP files for plan state, seats, lock (all tables), invites, switch rule, backfill
- [ ] `supabase/functions/plan-webhook/*.test.ts` and recorded RC payload fixtures (`_fixtures/revenuecat/`)
- [ ] Jest fixtures: fake store adapter, plan-state provider, level answer matrix
- [ ] `test:deno` script extended to the new functions
- [ ] Catalogue typecheck fixture rows for new events

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (webhook caller) | RC HMAC signature, constant-time compare, timestamp window; Authorization header as second factor; secrets in Supabase function secrets |
| V3 Session Management | yes | Existing Supabase session; RC `logIn` only after session; sign-out wipe covers failed-write store |
| V4 Access Control | yes | Trigger-enforced lock; RLS on every new table (plan, ledger, join requests, leave log, feature switches); members read plan record, not other members' answers (D-30) |
| V5 Input Validation | yes | Zod-style parsing of webhook JSON; unknown event types tolerated; RPC argument checks (`p_store_country` allowlist) |
| V6 Cryptography | yes | HMAC via Web Crypto; ES256 JWT for DeviceCheck via standard library; never hand-roll |
| V8 Data Protection / privacy | yes | No email to RC; no card data; store country not persisted; leave log retention + deletion; DeviceCheck/Play device-recall declarations; account-deletion cascade covers every new table (DSU-22 style manifest test) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook grants a household access | Spoofing/Tampering | HMAC + timestamp + re-fetch from RC with the secret API key (payload never trusted) |
| Replayed or reordered webhook | Tampering | Unique `rc_event_id`, state from re-fetch |
| Client modified to skip the lock | Elevation | Server trigger; client UI is cosmetic |
| Second account steals the payer's subscription via Restore | Spoofing | RC restore behaviour "transfer only if no active subscription" |
| Trial farming via new accounts/households | Repudiation/abuse | Person+household ledger, store per-account rules, DeviceCheck on iOS; Android gap accepted |
| Spoofed storefront to dodge the 12-month switch rule | Tampering | Accepted limitation, documented (speed bump) |
| Leaking sample data into real records | Information disclosure | Sample mode is read-only and write-guarded |
| Secrets in git (RC keys) | Information disclosure | Function secrets, EAS env, gitleaks guide in memory; RC *public* SDK keys only in app |
| Receipt or invoice data in logs | Information disclosure | Scrub `plan_events.payload` (drop email, subscriber attributes) |
| Service-role bypass abused through the plan bypass GUC | Elevation | GUC is transaction-local and set only inside named security-definer RPCs; pgTAP asserts clients cannot set it (it has no effect from `authenticated` REST because `set_config` is not callable via PostgREST table writes) [ASSUMED: confirm in test] |

## Sources

### Primary (HIGH confidence)
- RevenueCat webhooks: https://www.revenuecat.com/docs/integrations/webhooks (auth, HMAC, retries, idempotency, GET /subscribers advice)
- RevenueCat event types and fields: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
- RevenueCat Expo installation: https://www.revenuecat.com/docs/getting-started/installation/expo
- RevenueCat identifying customers: https://www.revenuecat.com/docs/customers/identifying-customers
- RevenueCat restore behaviour: https://www.revenuecat.com/docs/projects/restore-behavior
- RevenueCat promotional entitlement API: https://www.revenuecat.com/docs/api-v1/entitlements.md
- RevenueCat Test Store: https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store
- RevenueCat subscription offers: https://www.revenuecat.com/docs/subscription-guidance/subscription-offers
- react-native-purchases releases (11.0.0 notes, 10.16.0): https://github.com/RevenueCat/react-native-purchases/releases ; typings https://unpkg.com/react-native-purchases@10.16.0/dist/purchases.d.ts
- npm registry (`npm view react-native-purchases`, 2026-11-18)
- Apple App Store Connect subscription events (upgrade/downgrade/crossgrade rules): https://developer.apple.com/help/app-store-connect/reference/subscription-events/
- Apple introductory offers: https://developer.apple.com/documentation/storekit/implementing-introductory-offers-in-your-app.md
- Google Play Billing subscriptions (replacement modes, grace/hold): https://developer.android.com/google/play/billing/subscriptions
- Google Play Integrity device recall: https://developer.android.com/google/play/integrity/device-recall
- Play Console subscriptions help: https://support.google.com/googleplay/android-developer/answer/12154973
- PostgREST errors (PTxyz custom status): https://docs.postgrest.org/en/v12/references/errors.html
- Repo: `09-CONTEXT.md`, `09-UI-SPEC.md`, `supabase/migrations/20261122000500_household_invites.sql`, `20261122000200_household_members_v2.sql`, `src/data/sync/writeErrors.ts`, `failedWrites.ts`, `src/features/decide/entitlements.ts`, `supabase/config.toml`, `FincWin United.dc.html` (lines 3230-3300, 3618-3640)

### Secondary (MEDIUM confidence)
- RevenueCat Google Play upgrade/downgrade guide: https://www.revenuecat.com/guides/google-play-billing/subscription-upgrades-downgrades-and-plan-changes
- Apple developer forum on trial kept on upgrade: https://developer.apple.com/forums/thread/699356 ; Storefront in TestFlight: https://developer.apple.com/forums/thread/810860 ; DeviceCheck token single use: https://developer.apple.com/forums/thread/750678
- RevenueCat grace/hold guides (search results): revenuecat.com/guides/google-play-billing/payment-recovery-grace-period-and-account-hold

### Tertiary (LOW confidence, needs validation)
- Apple `introductoryOfferEligibility` override (search result only)
- Play `getBillingConfigAsync` Android billing country (third-party wrappers)
- Non-US price points (derived from PRICING.md ratios)

## Owner Questions (genuine blockers, plain English, recommended option first)

1. **Is the Google Play developer account ready, and can we make a test release track?** The Android purchase test needs it (the 00-07 task never recorded a result).
   1. Yes, it is active, and I will add the app and testers (Recommended).
   2. Not yet. Build everything and test with practice data only; real purchase testing waits.
   3. I do not know. Check the account and tell me.

2. **CSV export is not built yet, but the rules say it must stay open when the plan has ended.** What do we do?
   1. Build a simple CSV export inside this phase, from the data list we already have (Recommended; needed for the locked screen and for GDPR).
   2. Move the whole export feature from Phase 10 into this phase.
   3. Leave the Export row out of the locked screen until Phase 10.

3. **On Android there is no lasting device check for trial reuse at launch** (Google's tool is invited-only beta). iPhone has one.
   1. Accept it for launch: Android relies on Google's one-trial-per-account rule plus our person and home checks, and we re-check after launch (Recommended).
   2. Use a device ID on Android anyway. It resets and is harder to explain in the privacy forms.
   3. Hold the trial back on Android until Google opens the tool.

4. **Push messages (payer approval, payer left, takeover) need server push, which is not set up (needs FCM/APNs keys).** Phase 10 owns alerts.
   1. In this phase, show these in the app (they appear on open and live) plus a local trial reminder on the phone; Phase 10 adds real push (Recommended).
   2. Build a small push sender now. It needs Android push keys first and iPhone waits for Apple.

5. **On iPhone, Apple gives the free trial automatically to anyone who has not had one.** To offer "plans without a trial" to people we have flagged, we need extra products.
   1. Add four no-trial copies of Solo and Duo on Apple (12 products on Apple, 8 on Google). Simple and certain (Recommended).
   2. Try Apple's signed override instead (needs testing after enrolment; may not work with RevenueCat).
   3. Do not block trials on iPhone; rely on Apple's one-per-Apple-ID rule and our person and home checks.

6. **If we cannot tell a person's store country (the phone does not say), does the 12-month switch rule apply?**
   1. It does not apply when the country is unknown (kinder; easier to dodge) (Recommended).
   2. It applies when the country is unknown (stricter; can wrongly block a real family).

7. **Please sign the non-US price table** in section 7 of this file (Canada, UK, euro zone, Australia). I snap every figure to the stores' real price points before products are created.

8. **Tester end date and who is a "named tester".** All current production households become free-access households when this ships. Give the end date (for example 3 months after paid plans open) and confirm the list of names (everyone else keeps Everything but gets the normal paywall after the date).

(Separate documents still owed to the owner: the level-to-feature mapping table, using the inventory in section 6b, and the signed wording file.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions and the 10.x pin checked against npm and RC release notes.
- Architecture (webhook, plan record, trigger lock): HIGH for pattern, MEDIUM for the exact replay mechanism (spike).
- Store rules: HIGH for Apple upgrade-from-intro and Google replacement modes (official text); MEDIUM for trial-to-trial and grace/hold interactions (sandbox must confirm).
- Android device signal and iOS trial suppression: MEDIUM-HIGH that the constraints are real; LOW on the Apple JWS override.
- Prices: LOW until checked against the store price pickers.
- Pitfalls: HIGH.

**Research date:** 2026-11-18
**Valid until:** 2026-12-02 (RevenueCat and CocoaPods trunk are changing; re-check `react-native-purchases` majors and Expo SDK 57 notes before the dev build)

## Owner Answers (2026-11-18, binding for planning)

1. **Google Play account:** not yet active / not sure. Plans build everything; the real Android purchase test (license testers, internal track) is listed as an open human item, like the iOS test (D-24). Do not block phase close on it.
2. **CSV export:** build a simple CSV export of the person's records in Phase 9 (reachable when locked, D-03). Phase 10 DAT-02 adds the full export screen later.
3. **Android trial reuse:** accept no lasting device check at launch. Rely on Google's one-trial-per-account rule plus our server one-trial-per-person-and-household rule. Re-check Play Integrity device recall after launch. No Android ID storage.
4. **Push:** in-app notices (household_events + Realtime) plus a locally scheduled trial reminder now. No push-token table or send function in Phase 9; Phase 10 adds server push.
5. **iPhone trial off-switch:** add 4 trial-free Apple products (Solo and Duo, monthly and yearly): 12 Apple products, 8 Google products. Do not depend on the signed eligibility override.
6. **Unknown store country:** the D-39 12-month switch rule does NOT apply when the store country is unknown.
7. **Non-US prices:** the section 7 table is signed as proposed, snapped to the nearest available store price point when products are created.
8. **Testers:** all current production users become named testers with free access (RevenueCat promotional entitlement) until 3 months after paid plans go live; the exact date is set at launch and shown in the app. The owner stays free with no end date.

Still owed by the owner before the matching plans execute: the level-to-feature mapping table (inventory in 6b) and sign-off of the wording file.
