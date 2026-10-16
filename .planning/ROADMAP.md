# Roadmap: FincWin United

## Overview

FincWin ships in build order dictated by one architectural fact: local-first was rejected, so there is no on-device database, and every phase from Record onward is hard-blocked on a working, authenticated, RLS-protected Supabase connection. Foundation therefore absorbs Supabase provisioning, Apple/Google sign-in and the household-of-one schema — work the original brief had filed under Household — which is why Household later shrinks to genuinely new multi-member work. Money core stands up the data layer (integer-money engine, UUID keys, the offline write queue) so Record has somewhere correct to write on day one. Shell, Grow and Insights follow standard dependency order. The Decide engine is pure TypeScript with zero data-layer dependency and can run in parallel with Money core / Record / Shell; Decide UI then depends on both the engine and a live data layer to source a user's logged months. Household, Tiers & onboarding and System close out remaining functional scope, and Compliance & release is the final gate before submission. Four phases carry an explicit research flag rather than an assumed-solved design: Foundation's EAS provisioning from Windows, Household's synthesized Realtime reconciliation state machine, the still-open Free/Pro and Coach-LLM decisions blocking Tiers & onboarding, and Compliance's re-read of Guideline 3.2.1(viii) against live text.

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, 3...): Planned milestone work
- Decimal phases (2.1, 2.2, 2.3): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 0: Foundation** - Expo project, engine purity CI gates, Apple/Google auth, household-of-one schema and RLS, design tokens
- [x] **Phase 1: Money Core** - Integer-money engine, client UUID keys, FX rate storage, TanStack Query data layer with the offline write queue (completed 2026-09-26)
- [x] **Phase 2: Record** - Transactions, recurring entries, transfers, statement import (CSV, OFX/QFX), account limits and standing, Activity list, compensating-write undo (completed 2026-10-09)
- [x] **Phase 2.1: PDF statement import** (INSERTED) - Text PDF statements through the same import pipeline, reconciliation-gated, with a server worker and retention policy (completed 2026-10-11; Android verified, iOS pending Apple enrolment)
- [x] **Phase 2.2: Record polish** (INSERTED) - Activity views and subtotals, sort, recurring-from-history, clone, detail sheet and swipe, entry-sheet extras, paste import, sample data (completed 2026-10-10; Android verified, iOS pending Apple enrolment)
- [x] **Phase 2.3: Record follow-ups** (INSERTED) - Import reconcile-or-new choice, description auto-categorise rules, signed-out account chooser, compact amount, Add account from the picker, bulk Add to list (completed 2026-10-13; Android verified, iOS pending Apple enrolment)
- [x] **Phase 3: Shell** - Five tabs, bespoke glyphs, back stack, bottom sheets, context-aware FAB, Home content (completed 2026-10-14)
- [x] **Phase 03.1: Activity header redesign** (INSERTED) - Activity header from ten bands to four: month row with Search/Filter/More, summary card, Display chip (completed 2026-10-15)
- [x] **Phase 4: Decide Engine** - Pure TypeScript affordability engine, fully tested, no UI (parallel-eligible with Phases 1-3) (completed 2026-10-16)
- [ ] **Phase 5: Decide UI** - Quick check, five-step flow, open checks, alternatives, decision journal
- [ ] **Phase 6: Grow** - Goals, investments with cost-basis lots, debt with payoff strategies
- [ ] **Phase 7: Insights** - Net worth, cash flow, category breakdowns, health score, remaining Activity views
- [ ] **Phase 8: Household** - Invites, members, split rules, settlements, Realtime sync
- [ ] **Phase 9: Tiers & Onboarding** - Question flow, feature levels, contextual offers, RevenueCat entitlements
- [ ] **Phase 10: System** - Session management, biometrics/PIN, offline queue hardening, extended import, archive, export, account deletion
- [ ] **Phase 11: Compliance & Release** - Privacy manifests, store declarations, policy pages, store assets, TestFlight/internal testing, submission

## When You First See It Running

Four distinct "first builds", in the order they become possible. Only one of them waits on anyone else.

| Milestone | When | Blocked by |
|---|---|---|
| **Android emulator, app boots** | Phase 0, first plan | Nothing. No account, no fee, no approval. This is the first thing that happens |
| **Android emulator, signed in against real Supabase** | Phase 0 | Supabase project — minutes to create |
| **iOS dev build on the iPhone XR** | Phase 0, whenever enrolment clears | **D-U-N-S number, then organisation enrolment.** If the company has no D-U-N-S yet, this can take a month or more — start it on day one so the clock runs during Phase 0 rather than after it |
| **Something worth showing someone** | End of Phase 2 | Phases 0–2. This is the first build with real data in it: log a month, see it in Activity, undo a mistake, import a CSV |

**The honest answer:** the app boots on an Android emulator within the first plan of Phase 0. It becomes *interesting* at the end of Phase 2, which is the first dogfoodable build. iOS on real hardware is the only milestone gated by someone else's timetable, which is exactly why enrolment is a day-one task rather than a Phase 11 task.

**If Apple enrolment stalls:** every phase except the iOS-specific criteria proceeds unaffected. Android carries the entire dev loop, Sign in with Apple (ENV-07) parks until the account exists, and nothing in Phases 1–10 is structurally blocked. The risk is concentrated in Phase 11, which is the only phase that genuinely cannot start without it.

## Phase Details

### Phase 0: Foundation
**Goal**: A signed-in user has a working authenticated cloud connection, and the app has the engine boundary, design system and store-enrolment machinery in place before any feature work begins.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, ENV-01, ENV-02, ENV-03, ENV-04, ENV-05, ENV-06, ENV-07, ENV-08, ENV-09, ENV-10, ENV-13, ENV-14, ANL-01, ANL-02, ANL-03, ANL-04, ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, DSG-02, DSG-03, DSG-04, FND-09, FND-11, FND-12, ENV-15, ENV-17, ENV-18, ACC-12, ENV-20
**Success Criteria** (what must be TRUE):
  1. Developer can run the app on a local Android emulator from Windows, on Expo SDK 57 with TypeScript strict and Expo Router pinned to `~57.x`. Apple Developer Program enrolment is submitted on day one. A signed iOS development build installs on the iPhone XR via EAS Build — *this criterion alone may lag the rest of the phase while enrolment clears; it does not block Phase 1.*
  2. A user can create an account with Sign in with Apple or Google Sign-In; a household-of-one and its RLS policies are auto-provisioned invisibly on first sign-in; Apple's name/email are captured only on that first authorization and persisted immediately; the user stays signed in across app restarts.
  3. CI fails any change where a file under `engine/` imports from `db/`, `state/`, `services/`, `ui/` or `react` (including transitively), and fails any change that drops `engine/` branch coverage below the agreed threshold.
  4. A user can switch live, without reload, between any of 4 accent colours and 4 font pairings, using only colours from the documented token set; every visible string renders from a typed i18n catalogue; and layout adapts to the device's safe-area insets.
  5. Animations collapse to near-zero duration when the OS reports reduce-motion enabled.
  6. Every external dependency is either provisioned and verified working, or recorded in the dependency register as deferred with its blocker and the phase it must land by. No secret appears in a tracked file, and `.env.example` documents every key.
  7. Analytics reach PostHog's EU host only after the user opts in, identify the user solely by Supabase UUID, and cannot carry an amount, payee, account name or free text; session replay is absent from production builds.
  8. The Supabase project runs in a deliberately chosen region and is changed only through migrations in git; CI proves one user cannot touch another user's or household's rows; the auth session is stored encrypted; and an app below the minimum supported version shows an update-required screen.
**Plans**: 20 plans in 8 waves
Plans:
**Wave 1**
- [x] 00-01-PLAN.md — Day-one enrolment kickoff: dependency register, D-U-N-S lookup, work email (W1)
- [x] 00-02-PLAN.md — App identifier decision + Expo SDK 57 / Router scaffold with full Phase 0 deps (W1)
- [x] 00-03-PLAN.md — Supabase CLI toolchain, production project in us-west-2, local stack (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 00-04-PLAN.md — Android toolchain + first dev build on the emulator (W2)
- [x] 00-05-PLAN.md — Engine-purity lint/depcruise, D-21 coverage gates with self-test, typed env config (W2)
- [x] 00-06-PLAN.md — Household-of-one, profiles, app_config migrations + pgTAP + [BLOCKING] production push (W2)
- [ ] 00-07-PLAN.md — Website audit, Apple org enrolment submission, Play Console registration (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 00-08-PLAN.md — GitHub Actions CI (checks, gitleaks, RLS) + required checks on main (W3) — *branch protection on, `enforce_admins: true` (FND-04/05 complete 2026-09-26)*
- [x] 00-09-PLAN.md — fx_rates + Frankfurter v2 fx-sync Edge Function + pg_cron + [BLOCKING] production push (W3)
- [x] 00-10-PLAN.md — Supabase client on encrypted LargeSecureStore, wipe registry, connection check (W3)
- [x] 00-11-PLAN.md — Design tokens, 4 accents / 4 pairings live theme, reduce-motion, safe-area, DSG-02 guard (W3)
- [x] 00-12-PLAN.md — Typed i18n catalogue with D-16 placeholders and D-20 drafts (W3)
- [x] 00-13-PLAN.md — Consent-gated PostHog EU analytics, typed event catalogue, no replay (W3)
- [x] 00-14-PLAN.md — EAS project, profiles, env secrets, fingerprint OTA policy + rollback rehearsal (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 00-15-PLAN.md — Apple/Google sign-in services, first-auth profile capture, AuthProvider, Google OAuth (W4)
- [x] 00-16-PLAN.md — D-19 error-tracking spike: PostHog vs Sentry, scrubbed consent-independent reporting (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 00-17-PLAN.md — Root layout, welcome screen, min-version gate + update-required screen (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 00-18-PLAN.md — Consent screen, You screen, theme profile sync, sign-out wipe flow (W6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 00-19-PLAN.md — Android acceptance, register consolidation, approved prod push (W7)

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 00-20-PLAN.md — iOS: Sign in with Apple config, first EAS iOS build on iPhone XR (W8, waits on enrolment)
**Research flag**: EAS provisioning and credentials from Windows are unproven for this project. Trigger the first iOS EAS Build on day one — provisioning surprises are cheaper in week one than week ten.

**Dependency provisioning — what blocks on what:**

| Service | Needed for | External clock? | Defer condition |
|---|---|---|---|
| Supabase project | Everything from Record onward | No — minutes | **Cannot defer.** Phase 1 has nowhere to write without it |
| EAS account + profiles | All builds | No — minutes | **Cannot defer.** Free tier is sufficient to start |
| Google OAuth client IDs | Google Sign-In | No — same day | **Cannot defer past Phase 0.** No cost, no waiting |
| Frankfurter | FX rates | No — no key, no account | **Cannot defer.** Public API, nothing to provision |
| **Domain, website and work email** | Apple organisation enrolment | Yes — days, plus writing real content | **Cannot defer.** Apple rejects registrar placeholder pages and sites with minimal content. Build it while D-U-N-S is pending; it later hosts the policy, terms and support pages |
| **D-U-N-S number** | Organisation enrolment with both Apple and Google | **Yes — can be ~28 days if not already issued** | **Check on day one.** It is the first link in the longest chain in the project |
| **Apple Developer Program (organisation)** | Sign in with Apple, iOS device builds, TestFlight, submission | **Yes — after D-U-N-S, then days to weeks** | **Defer iOS-dependent work, not the enrolment.** Enrol as the company, not as an individual (Guideline 5.1.1(ix)). Android proceeds at full speed meanwhile; Sign in with Apple (ENV-07) and iOS builds wait |
| Google Play Console (organisation) | Play submission, IAP products | Yes — verification against D-U-N-S; $25 one-off | **Register in Phase 0** (D-04) using the same D-U-N-S as Apple. Products and first upload still land by Phase 9/11. |
| Production backups | Backups for real user data | No | Method TBD, likely AWS (e.g. a scheduled dump to S3). Deferred from Phase 2 to Phase 10 (ENV-16) on 2026-09-25; Supabase Pro no longer assumed. Until then production has no backups: accepted risk while dogfooding. Separately, a Free-plan project pauses after a week idle — see STATE.md Blockers |
| APNs and FCM push credentials | Server-sent alerts | APNs waits on Apple enrolment | Needed by Phase 10 (ENV-19) |
| RevenueCat | Subscriptions | No, but depends on store accounts | Defer to Phase 9. Blocked transitively by Apple and Play accounts |
| Sentry | Error reporting | No | Defer freely. Nothing depends on it. Evaluate in Phase 0 whether PostHog error tracking covers React Native well enough to drop Sentry |
| PostHog | Product analytics | No — minutes, free tier | **Provision in Phase 0.** No cost, no clock. Events are added phase by phase |
| open.er-api | FX fallback and second source | No — no key, no account | Nothing to provision. Attribution must be shown in-app |

**Rule:** anything with no external clock and no cost gets provisioned in Phase 0 regardless of when it is first used — the cost of doing it early is minutes, and the cost of discovering it late is a blocked phase. Anything gated on a third party's timeline gets started in Phase 0 and *consumed* later.

### Phase 1: Money Core
**Goal**: The money and data-layer foundation is correct and complete, so Record has somewhere to write on day one.
**Depends on**: Phase 0
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06, MON-07, MON-08, MON-09, MON-10, MON-11, MON-12, SYN-01, SYN-02, SYN-06, FND-10, MON-13, MON-14, SYN-07, DSG-06
**Success Criteria** (what must be TRUE):
  1. Every amount is stored and computed as integer minor units, parsed from user input without `parseFloat`, on every path.
  2. Splitting an amount across members always produces shares that sum exactly to the original total, using largest-remainder rounding.
  3. A user can set a home currency (or add a custom one); a transaction in another currency records the FX rate applied at write time, refreshed daily from Frankfurter v2 into the project's own store, with that rate's publication date shown wherever a converted figure appears.
  4. Every record is created with a client-generated UUID primary key before the write leaves the device, and carries an integer `version` that increments server-side on write.
  5. With no network connection, previously loaded data remains browsable, new writes queue locally and are visibly marked as queued, and flush automatically on reconnect.
  6. With Frankfurter unreachable, rates still refresh from open.er-api with its attribution shown; a currency whose latest rate exceeds its staleness limit raises an alert; and a simulated overnight move beyond ~10% is held rather than stored until a second source confirms it.
  7. A JPY amount has no decimal places and a KWD amount has three; a transaction entered at 23:30 local time stays in that local month; amounts and dates follow the device locale; and the offline cache is unreadable without the key in secure storage.
**Plans**: 16 plans
Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Engine money core: deps install, MinorUnits, half-up rounding, EUR-routed BigInt conversion, ISO exponents, shared fixture (W1)
- [x] 01-02-PLAN.md — Money schema: custom currencies, money prefs, accounts, transactions with RLS, versions, server-only stamp columns (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md — Engine parse/format: strict region-aware amount parsing, D-23 amount and date formatting (W2)
- [x] 01-04-PLAN.md — Engine split + time: largest-remainder allocate, local date/time zone and month maths (W2)
- [x] 01-05-PLAN.md — Server FX stamping: SQL money mirror, stamp_fx_rate trigger, restamp, generated mirror pgTAP (W2)
- [x] 01-07-PLAN.md — Query client, encrypted persister, NetInfo/AppState bridges (W2)
- [x] 01-09-PLAN.md — Sync bookkeeping: typed DB errors, write classification, failed list, useSyncStatus (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-06-PLAN.md — FND-10 migration compatibility gate, self-test, mirror check in CI, PR checklist (W3)
- [x] 01-08-PLAN.md — FX ingest: open.er-api fallback, plausibility holds, second-source confirm, currency metadata (W3)
- [x] 01-10-PLAN.md — DB access layer, query keys, read hooks, device locale service (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-11-PLAN.md — resolve-rate backfill + fx-monitor staleness/auto-accept/Resend digest, runbook (W4)
- [x] 01-12-PLAN.md — Offline write queue: mutation defaults, provisional FX, conflicts, QueryProvider (W4)
- [x] 01-14-PLAN.md — RateAttribution, SyncStatusLine, money formatter hook, catalogue keys (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 01-13-PLAN.md — Money prefs, custom currencies and currency options hooks (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 01-15-PLAN.md — Wire QueryProvider, failure reporting, sync line, credits and dev probe into the app (W6; needs Phase 0 00-16/17/18)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 01-16-PLAN.md — Production rollout: schema push [BLOCKING], function deploy, live smoke, device check (W7)
**UI hint**: no (data layer and engine work; no screens ship in this phase)

### Phase 2: Record
**Goal**: A user can log and manage their real financial activity against a live backend.
**Depends on**: Phase 1
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05, REC-06, REC-07, REC-08, REC-09, REC-10, REC-11, REC-12, REC-13, REC-14, REC-15, REC-16, REC-17, REC-18, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ANL-05
**Success Criteria** (what must be TRUE):
  1. A user can log an expense or income with amount, category, account and date; edit or delete any transaction they created; and see a balance per account they define, using categories they can create, rename and colour.
  2. A user can mark a transaction as recurring on a schedule, have it generate entries without re-typing, and skip or end a single occurrence without deleting the series.
  3. A user can import transactions from a CSV or OFX/QFX statement — during onboarding or later — seeing how the file was read (signs, what the balance means, any limit), confirming or correcting that reading and the column mapping, and seeing whether the balances check out, before committing.
  4. A user can view all of a month's transactions in a list, switch months including into archived ones, search across all months, filter by category/account/amount, and bulk-select and delete transactions in one action.
  5. A user can undo any of their last 12 changes from the toast or the history screen as a compensating write, and is refused with an explanation when another household member has since changed the same record.
  6. An account can be overdrawn, beyond its overdraft, or over its card limit, and the app shows that standing plainly rather than treating it as an error; card statements that show purchases as positive or balances as available credit import with the correct signs.
  7. A user can record a transfer between their own accounts, import suggests matching pairs such as a card payment, and transfers never count as income or spending.
**Plans**: 50 plans in 14 waves plus 4 gap-closure waves (31 original plans revised in place for the 2026-09-25 import extension, plus 02-32…02-40; gap closure 02-41…02-50 for on-demand FX, 2026-10-07)
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Engine: recurring schedule maths + shared TS/SQL fixture (W1)
- [x] 02-05-PLAN.md — Engine: undo steps, inverses (incl. transfer labels, import inverse at post-link versions), bulk planner, rollback, refusal descriptor (W1)
- [x] 02-06-PLAN.md — Engine: month totals (transfers excluded), filters/search, status rules, balances, built-in categories (W1)
- [x] 02-07-PLAN.md — Schema: categories + seeding, transaction record fields incl. import provenance and transfer_id, account limits, transactions_active, trigram index (W1)
- [x] 02-10-PLAN.md — Phase 2 copy catalogue (statement, transfers, standing, format, reconciliation), widened ANL-05 events, tokens (W1)
- [x] 02-32-PLAN.md — Engine: parseNotatedAmount, StatementDraft/FormatProfile contracts, byte decoder (CP1252), format sniffing (W1)
- [x] 02-37-PLAN.md — Engine: transfer matching and pair rules, account standing (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Engine: RFC-4180 CSV tokenizer, 5,000-row ceiling, date and number-notation inference (W2)
- [x] 02-08-PLAN.md — Schema: recurring series, materialiser + cron, series RPCs, mirror test (W2)
- [x] 02-11-PLAN.md — DB layer: row types (provenance, transfer, limits, import profiles), view reads, search, transfer reads, batch insert, keys (W2)
- [x] 02-19-PLAN.md — UI primitives: Sheet, Row, Pill, Chip, SwatchDot, glyph, toast, empty state (W2)
- [x] 02-33-PLAN.md — Engine: OFX header split, linear tokenizer with budgets, tree builder; coverage bucket extension (W2)
- [x] 02-35-PLAN.md — Engine: conversion to the stored sign rule, bigint running-balance reconciliation (W2)
- [x] 02-38-PLAN.md — Schema: deferred transfer pair trigger, import_profiles table (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Engine: CSV column detection (balance/direction/limit) and sign-free StatementDraft mapping (W3)
- [x] 02-09-PLAN.md — Schema: undo_log, apply_patches (transfer/limit keys), undo/rollback RPCs, tombstone purge, read RPCs (W3)
- [x] 02-12-PLAN.md — DB layer: categories and recurring-series RPC wrappers (W3)
- [x] 02-34-PLAN.md — Engine: OFX dates, amounts and statement extraction + synthetic fixtures (W3)
- [x] 02-36-PLAN.md — Engine: format-profile inference anchored on account kind, flip (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02-04-PLAN.md — Engine: category guessing, occurrence-count duplicates (FITID, ±2-day cross-format), pending-bill match, recurring suggestions (W4)
- [x] 02-13-PLAN.md — DB layer: apply_patches, undo log, balances/months/member reads, import profiles (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 02-14-PLAN.md — Read hooks: month view (transfer-aware), months, search, balances with standing, categories, history (W5)
- [x] 02-15-PLAN.md — Mutations: transaction fields, soft delete, mark paid, skip, import chunks + finalize (links, mark-paid, limit, post-link undo step), toast store (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 02-16-PLAN.md — Mutations: bulk delete (transfer partners)/mark paid/unpaid, undo and rollback (W6)
- [x] 02-40-PLAN.md — Mutations: transfer create/edit/delete as one pair and one undo step (W6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 02-17-PLAN.md — Mutations: categories (add/edit/archive/merge), account undo capture with limits (W7)
- [x] 02-20-PLAN.md — Transaction sheet: add/edit/delete expense, income and transfer (W7)
- [x] 02-28-PLAN.md — Undo toast host and History screen (W7)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 02-18-PLAN.md — Mutations: recurring series create/edit-from/end (W8)
- [x] 02-22-PLAN.md — Activity: month list, switcher, totals, projections, mark paid, transfer legs (W8)
- [x] 02-25-PLAN.md — Categories: manage, swatches, merge-or-archive (W8)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 02-21-PLAN.md — Entry sheet recurring controls: Repeats, this one/this and future, skip, end (W9)
- [x] 02-23-PLAN.md — Activity: search across months, filters (incl. Transfers), bulk select (W9)
- [x] 02-24-PLAN.md — Accounts: list, detail, create/edit sheet with limits and sign control, balances and standing (W9)
- [x] 02-26-PLAN.md — Statement import pipeline: CSV/OFX/QFX byte read, one D-40 pipeline, preview, commit input (W9)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 02-39-PLAN.md — Statement import state machine: format confirmation, mapping, review, matches, commit, funnel (W10)

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 02-27-PLAN.md — Statement import screens: account/file, format step, mapping, review with reconciliation, matches, suggestions (W11)

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 02-29-PLAN.md — Routes for Record screens + app-wide Undo toast host (W12; needs Phase 0 00-17/00-18 and 01-15)

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 02-30-PLAN.md — Onboarding first account + Bring your history (statement), You entry points, Activity landing (W13)

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 02-31-PLAN.md — Production rollout: schema push [BLOCKING], live checks, device walkthrough incl. OFX, standing and transfers (W14; needs 01-16)

**Gap closure: on-demand FX, built-in currency list, no daily sync** *(2026-10-07, `02-DECISION-fx-on-demand.md`; GW = gap-closure wave)*
- [x] 02-41-PLAN.md — Schema: fx_rate_lookups coverage, 6h negative cache, coverage-based per_eur_rate, is_iso_currency without a stored rate (GW1)
- [x] 02-43-PLAN.md — Edge Functions: shared _shared/fx library, delete fx-sync and fx-monitor (GW1)
- [x] 02-45-PLAN.md — Engine + picker: built-in ISO currency list, currencies-table query removed (GW1)
- [x] 02-46-PLAN.md — Client: fxResolve door, per-date import and series follow-ups, fxLatest refresh (GW1)
- [x] 02-42-PLAN.md — Schema: retire fx-sync/fx-monitor crons and monitor-only functions (GW2)
- [x] 02-44-PLAN.md — resolve-rate: on-demand fetch path, fallback, MON-11 hold with second-source witness, failure-only alerts (GW2)
- [x] 02-47-PLAN.md — Client: foreign-account opening-date fetch, budgeted pending sweep (GW2)
- [x] 02-48-PLAN.md — Client: "Waiting for a rate" display, read paths can never fetch (GW2)
- [x] 02-49-PLAN.md — Client: home-currency change fetches today's rates for every currency in use (GW3)
- [x] 02-50-PLAN.md — Production rollout [BLOCKING, approval], device check, then cleanup (GW4)
**UI hint**: yes

### Phase 02.1: PDF statement import (INSERTED)

**Goal:** A user can import a text-based PDF bank or card statement through the same import pipeline as CSV and OFX, with figures that are only committed once they reconcile or the user has reviewed them.
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05
**Note (2026-10-08, resolved 2026-10-10):** IMP-05 (statement-provided conversions, show both figures) was added after this phase was planned. Its decisions are locked as CONTEXT D-30 to D-35 and it is covered by plans 02.1-13 to 02.1-17.
**Depends on:** Phase 2 (the D-40 import pipeline, format profile, reconciliation, transfers), Phase 02.2 (complete; it changed the import commit path 02.1-09..11 build on). Plans revised 2026-10-10 against post-02.2 main (migrations re-dated to 20261011000100/200, pgTAP 49, fx-monitor references removed, 09-12 rebased); IMP-05 added as plans 13-17 the same day
**Success Criteria** (what must be TRUE):
  1. A text-based PDF statement from a supported layout imports with the same format read-back, preview, duplicate check and transfer suggestions as a CSV or OFX file.
  2. Nothing from a PDF is committed unless its balances reconcile or the user has reviewed each row that could not be verified.
  3. The uploaded file is deleted after a successful import unless the user chose to keep it, a kept file is removed on account deletion, and no statement content appears in logs or Sentry.
  4. The privacy copy says where the PDF is processed and how long it is kept.
  5. A foreign line whose statement gives the converted amount stores the account-currency figure as the truth, records that its conversion came from the statement, and shows the original amount, charged amount, the bank's implied rate and any linked fee, with no market comparison (IMP-05).
**Research flag**: PDF parsing needs a server-side worker, which breaks Phase 2 D-17 ("file never uploaded"). Decide the worker host, the retention default, and whether OCR or an opt-in LLM fallback is in scope, during discuss-phase. Collect real redacted statements first.
**Plans:** 17/17 plans executed
**Status (2026-10-11):** Complete. PR #60 (plans 01-11, 13-17 and review fixes, main 22f8f57) and PR #62 (walkthrough fixes: quick 261011-eio and signFromEnds, main ef8bbfa). Production at 20261011000300; read-pdf-statement and purge-statement-uploads deployed. Android device walkthrough approved on Pixel 9; preview APK d7f35c19. 02.1-VERIFICATION.md: 5/5 criteria, IMP-01..IMP-05 satisfied, no code gaps. The iOS walkthrough is pending Apple enrolment and the privacy-policy publication is unconfirmed (02.1-HUMAN-UAT.md).

Plans:

**Wave 1** *(Phase-2-independent server work and fixtures run first; engine/copy plans precondition-check Phase 2)*
- [x] 02.1-01-PLAN.md — Synthetic PDF statement fixtures, generator, expected ledgers, unpdf smoke (W1)
- [x] 02.1-02-PLAN.md — Private statement-uploads bucket + owner-folder RLS, hourly purge via Storage API, pgTAP 49 (W1)
- [x] 02.1-03-PLAN.md — read-pdf-statement pure core: wire contract, caps, delete-after-read, metadata-only logs (W1)
- [x] 02.1-04-PLAN.md — Engine foundation: 'pdf' source + uncertain-row codes, applyUncertainRows, balance delta, dates/years (W1)
- [x] 02.1-05-PLAN.md — PDF copy (server variant) + privacy line, analytics fingerprint event, decision record, privacy-policy draft (W1)
- [x] 02.1-13-PLAN.md — IMP-05 schema: insert-only statement figures + fee link, server-written conversion_source, pgTAP 50 (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02.1-06-PLAN.md — unpdf binding + Deno glue, real-parser Deno test (passwords, deletion), extraction snapshots, CI job (W2)
- [x] 02.1-07-PLAN.md — Generic layout reader: lines/columns, rows/figures/sections, response validation, fingerprint, contract guard (W2)
- [x] 02.1-14-PLAN.md — IMP-05 shared extractor: foreign amounts, OFX statement rate, implied rate, fee linking (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02.1-08-PLAN.md — pdfToDrafts adapter + real-fixture flow through Phase 2's engine + no-leak test (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02.1-09-PLAN.md — PDF sniff + picker, statementPdf read service (offline refusal), pipeline PDF branches + review gate (W4)
- [x] 02.1-15-PLAN.md — IMP-05 adapters: OFX CURRENCY/ORIGCURRENCY, CSV original-amount roles, PDF continuation lines, cross-format fixtures (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 02.1-10-PLAN.md — useStatementImport PDF branch: notice, password, sections, year, closing balance, checked-rows gate (W5)
- [x] 02.1-16-PLAN.md — IMP-05 commit path: preview foreign/fee links, insert-only statement figures, CSV mapping roles (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 02.1-11-PLAN.md — Screens: reading progress, password sheet, closing-balance prompt, notice, section/year, checked-rows gate (W6)
- [x] 02.1-17-PLAN.md — IMP-05 display: Activity foreign line, detail statement conversion + bank fee + provenance note (W6)

**Wave 7** *(blocked on Wave 6 completion; production is at 20261010000600 from Phase 02.2)*
- [x] 02.1-12-PLAN.md — Production rollout: PR to main, schema push (3 migrations) [BLOCKING], deploy both functions, live checks, worst-case timing, device walkthrough incl. IMP-05, preview APK (W7)

### Phase 02.2: Record polish (INSERTED)

**Goal:** Activity and the Record screens reach the prototype's depth (`FincWin United.dc.html`). Views have subtotals, with sort and counts; recurring lines are spotted from logged history; and entry, import and month tools are richer. The Phase 2 filter system stays.
**Requirements**: ACT-06, ACT-07, ACT-08, ACT-09, ACT-10, ACT-11, ACT-12, ACT-13, ACT-14, ACT-15, ACT-16, ACT-17, ACT-18, REC-19, REC-20, REC-21, REC-22, REC-23, REC-24, REC-25
**Depends on:** Phase 2 (Record). Phase 3 (Shell) was not executed first: 2.2 built its own primitives in `src/ui` (Dropdown, ToggleRow, DetailSheet, SwipeRow, Keypad) on the existing `Sheet`, and installed `expo-haptics` (D-27). Phase 3 adopts them.
**Inserted:** 2026-10-07, from the Phase 2 device walkthrough and a prototype gap audit (user decisions)
**Success Criteria** (what must be TRUE):
  1. Activity offers a view dropdown: By day, By week, In / out, Running balance, Calendar. Every group shows its net subtotal, including Week 1 to Week 5 and each day. The existing filters keep working in every view.
  2. A user can sort Activity (Newest, Oldest, Biggest, Smallest, A–Z) and sees the transaction count next to the total.
  3. Lines that recur in logged history are offered as a series ("N lines also ran in Aug at about the same amount…"), with Review each, Mark all monthly and Not now.
  4. A user can clone transactions, open a read-only detail sheet with Mark as paid, Edit and Delete, and swipe a row to pay or delete. Future-dated lines show as Scheduled.
  5. The entry sheet has the keypad, Automatic payment and Refund, the "Marking this paid moves…" and FX "Saves as…" notes, and Received/Expected for income. A list can be pasted to import it.
  6. The month list shows entry counts and "Add next month". The week start is a setting. Categories show usage and an optional monthly cap.
  7. A new user can look around on sample figures and clear them with "Start fresh". An empty money account can be deleted.
  8. An account's detail shows Coming in and Going out separately, plus the balance after everything pending. Rows carry a green Paid or Received tag.
**Notes:** ACT-06 moved here from Phase 7 on 2026-10-07 because the user wants the views with subtotals now. Clone was superseded by D-02/D-03 in Phase 2 and the user re-added it alongside recurring series. "Shared lines" stays with Phase 8 (HH-04).
**Plans:** 35/35 plans executed
**Status (2026-10-09):** Plans 01–34 executed and on main (PR #51 schema and engine, PR #52 app). Production schema at 20261010000600. Plan 35 waits on the Android device walkthrough (development build e07f9578); iOS waits on Apple enrolment. Follow-ups found in execution are fixed in quick task 261009-mvn.
**Status (2026-10-10):** Complete. Android device walkthrough passed on Pixel 9 after quick tasks 261010-i7u (PR #55) and 261010-kpe (PR #56); final main 9cb5c58. 02.2-VERIFICATION.md: 8/8 criteria, 20/20 requirements, no code gaps. The iOS walkthrough is pending Apple enrolment (02.2-HUMAN-UAT.md).

Plans:

**Wave 1**
- [x] 02.2-01-PLAN.md — Foundations: expo-haptics + haptics wrapper, full phase copy catalogue, undo label keys, UI-SPEC offer wording, cross-phase is_sample/is_refund rule (W1)
- [x] 02.2-02-PLAN.md — Schema: additive columns (refund, automatic, sample, cap, week start, horizon, account soft delete), view re-create, grants, sample trigger, delete guard, dismissed offers + pgTAP 42/43 (W1)
- [x] 02.2-03-PLAN.md — Engine: refund-aware totals/filters, count, horizon month list, row tags, sort, entry notes (W1)
- [x] 02.2-04-PLAN.md — Engine: series offers over detect.ts (unchanged), clone candidates, pay-match automatic flag (W1)
- [x] 02.2-05-PLAN.md — Engine (TDD): paste line parser, 100% coverage folder (W1)
- [x] 02.2-06-PLAN.md — Engine: category usage/cap, account pending split, delete-or-archive rule (W1)
- [x] 02.2-07-PLAN.md — Engine: keypad reducer, region week start, refund matcher (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02.2-08-PLAN.md — Engine: day/week/in-out groups with one net, week buckets, calendar cells, running balance (W2)
- [x] 02.2-09-PLAN.md — Schema: apply_patches new keys + server-only undo gate (allow_system_keys) + pgTAP 44 (W2)
- [x] 02.2-10-PLAN.md — Schema: series Automatic/sample flags, household-horizon materialiser, batch series RPC + pgTAP 45 (W2)
- [x] 02.2-11-PLAN.md — Schema: pending split, paid-before, atomic change_home_currency with cap conversion + pgTAP 46 (W2)
- [x] 02.2-12-PLAN.md — UI primitives: Dropdown, ToggleRow, DetailSheet, ConfirmSheet title (W2)
- [x] 02.2-13-PLAN.md — UI primitives: SwipeRow, Keypad (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02.2-14-PLAN.md — Schema: add_activity_month with one undoable step + pgTAP 47 (W3)
- [x] 02.2-15-PLAN.md — Schema: seed/clear sample data RPCs + pgTAP 48 (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02.2-16-PLAN.md — Schema PR merged to main, then production schema push [BLOCKING, approval] and live checks (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 02.2-17-PLAN.md — DB layer: new columns in row types/key lists, soft-deleted accounts filtered, batch series wrapper (W5)
- [x] 02.2-18-PLAN.md — DB layer: record prefs, horizon, dismissed offers, samples, pending split, paid-before, add month, keys (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 02.2-19-PLAN.md — Queries: record context (week start, horizon, samples), month counts, refund-aware totals, on-device series offers (W6)
- [x] 02.2-20-PLAN.md — Mutations: clone month, paste lines, mark all monthly (one step each), suggestionToSeries relocation (W6)
- [x] 02.2-21-PLAN.md — Activity row tags, swipe, balance note; read-only detail sheet (W6)
- [x] 02.2-22-PLAN.md — Categories: usage sub-labels, monthly cap field, usage-sorted picker (W6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 02.2-23-PLAN.md — Mutations: add month, delete account, dismiss offers, record prefs (W7)
- [x] 02.2-24-PLAN.md — Activity list views: view/sort dropdowns, group subtotals, running balance, count, view model (W7)
- [x] 02.2-25-PLAN.md — Entry sheet: keypad, Automatic/Refund toggles, notes, Received/Expected, clone prefill, cap warning (W7)
- [x] 02.2-26-PLAN.md — Paste to add sheet and Import entry (W7)
- [x] 02.2-27-PLAN.md — Import: refund suggestions and Automatic pre-tick (W7)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 02.2-28-PLAN.md — Actions: sample seed/clear/decline, all-or-nothing home-currency change (W8)
- [x] 02.2-29-PLAN.md — Calendar view, series offer card, recurring review sheet (W8)
- [x] 02.2-30-PLAN.md — Month switcher counts + Add month, clone-month sheet (W8)
- [x] 02.2-31-PLAN.md — Account detail: Coming in / Going out / after pending, delete empty or archive (W8)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 02.2-32-PLAN.md — You -> Money: week start, home-currency change sheet, toast queue (W9)
- [x] 02.2-33-PLAN.md — Sample figures: onboarding option, Start fresh banner, first-save prompt on every real save path (W9)
- [x] 02.2-34-PLAN.md — Activity integration: calendar, offer, detail sheet, swipe, More menu, months, empty state (W9)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 02.2-35-PLAN.md — New dev build, device walkthrough of all eight criteria, validation sign-off (W10)

### Phase 02.3: Record follow-ups from the 02.2 walkthrough (INSERTED)

**Goal:** Requests from the Phase 02.2 device walkthrough: choosing how a parsed statement meets existing entries, categorising manual entries from their description, offering the previous account on the signed-out screen, and a faster entry sheet (compact amount, Add account from the picker, bulk Add to list).
**Requirements**: REC-26, REC-27, ACC-14, REC-28, REC-29, REC-30
**Depends on:** Phase 02.2
**Inserted:** 2026-10-10 (device walkthrough, user requests)
**Success Criteria** (what must be TRUE):
  1. After a statement is parsed, the user chooses to reconcile against existing entries or to load every row as new. Reconcile shows only the rows missing from existing records, flags them, and adds them on approval.
  2. A manual entry is categorised from its description using the learned map and the default keyword rules, and the user can add, edit and remove description-to-category rules.
  3. The signed-out screen offers "Continue as <previous account>" or "Use a different account". Only the last account's display identity and provider are remembered, never tokens, and a different Google account shows the account picker.
  4. The entry sheet for money out, money in and transfer shows the amount as a compact field with an "Amount" placeholder; the number keypad opens only when it is tapped.
  5. The account picker in the entry sheet ends with "Add account"; creating an account there returns to the entry with the new account selected.
  6. "Add to list" keeps a valid entry in a list at the bottom of the sheet and clears the form, up to 30 per money out, money in or transfer list; listed entries can be edited or removed, survive an accidental swipe or close, and Save writes the current entry plus the list in one step with one Undo.
**Note:** criteria 4–6 change the entry sheet and Keypad that Phase 3's bottom-sheet migration carries over; plan 02.3 before re-checking the Phase 3 plans.
**Plans:** 20/20 plans complete
**Status:** Planned 2026-10-12 (not started). Three additive migrations (20261012000100 category_rules, 20261012000200 category_rules_patches, 20261012000300 entry_list) and pgTAP 51-53; the production push in 02.3-20 needs the user's go.

Plans:

**Wave 1**
- [x] 02.3-01-PLAN.md — Foundations: full phase copy, undo vocabulary (category_rules, addedMany, rule labels), write entity, keys (W1)
- [x] 02.3-02-PLAN.md — Schema: category_rules table, personal/shared RLS, guards, soft delete + pgTAP 51, 36 extended (W1)
- [x] 02.3-03-PLAN.md — Schema: record_entry_list RPC (list save with series as one undo step) + pgTAP 53 (W1)
- [x] 02.3-04-PLAN.md — Engine (TDD): rule tiers, D-25 precedence, shared-rule resolution, whole-word fix (W1)
- [x] 02.3-05-PLAN.md — Engine (TDD): reconcile extras and near-match hint (W1)
- [x] 02.3-06-PLAN.md — Engine (TDD): entry list model, caps, summary, draft format; entryList 100% folder (W1)
- [x] 02.3-07-PLAN.md — Remembered accounts store, Google continue/different/forget flows, AuthProvider, docs (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02.3-08-PLAN.md — Schema: apply_patches + undo_log_fill re-created with category_rules + pgTAP 52; 35/37/44/45 regression (W2)
- [x] 02.3-09-PLAN.md — Rules data layer: db, query, mutations with undo, useGuessContext (W2)
- [x] 02.3-10-PLAN.md — Import machine: choose-mode stage, mode, overlap, extras (W2)
- [x] 02.3-11-PLAN.md — Entry sheet: compact amount field, pad on tap; Add account from the picker (W2)
- [x] 02.3-12-PLAN.md — Welcome: Continue as tiles, Use a different account, Not you? Remove (W2)
- [x] 02.3-18-PLAN.md — Entry list parts: form/item conversion, device draft, useEntryList, EntryList, ConfirmSheet onDismiss (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02.3-13-PLAN.md — Bulk save path: buildEntryListWrite, useBulkAdd (one step, one Undo), optimistic transfer fix (W3)
- [x] 02.3-14-PLAN.md — Categories -> Rules screen and RuleSheet (W3)
- [x] 02.3-15-PLAN.md — Import UI: choice step, reconcile review, extras detail (W3)
- [x] 02.3-16-PLAN.md — Rules feed statement import and paste-a-list (W3)
- [x] 02.3-17-PLAN.md — Entry sheet: suggested category and the one-tap rule offer (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02.3-19-PLAN.md — Entry sheet: Add to list, list section, drafts and prompts, one-step Save (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 02.3-20-PLAN.md — Rollout: PR, full gate, production schema push [BLOCKING, user go], live checks, device walkthrough, preview APK (W5)

### Phase 3: Shell
**Goal**: The app's navigation chrome matches the design system exactly, and Home opens on real content.
**Depends on**: Phase 2
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, DSG-07, HOME-01, HOME-02, HOME-03, HOME-04
**Success Criteria** (what must be TRUE):
  1. A user can move between five tabs with the bespoke SVG glyphs, and the slide direction matches the direction of travel.
  2. A user can go back through up to 8 previous screens across tabs and detail screens; detail screens push in over the current screen and dismiss back to it.
  3. A user can drag any bottom sheet (about 35 call sites) down to dismiss it; an accidental dismissal of the entry sheet keeps a draft, and other edited sheets ask before discarding.
  4. The FAB's action changes to match the current tab, and it hides during sheets, bulk select, onboarding and step flows.
  5. A user can navigate and read every screen with a screen reader on both platforms.
  6. Home opens with quick actions, a This month card, what is coming up and an Accounts summary, built from the user's recorded data.
**Plans**: 38 plans: 24 in 8 waves (re-planned 2026-10-13) plus 14 gap-closure plans in 4 waves (2026-10-14)
**Updated 2026-10-13 (re-discussed):** 03-CONTEXT.md was reopened after Phases 2.2 and 2.3. The app keeps its own Sheet and adds drag-to-dismiss (no `@gorhom` migration). The backdrop is ink at 38% with a fade. Sheets stack and close top-first, toasts draw above sheets, and Home content (HOME-01…04) is added. Re-planned the same day: 03-01, 03-09, 03-13 and 03-16 rewritten or revised, the others edited, and 03-17…03-24 added (engine month figures and Unpaid filter, entry draft v2, toast layer, refresh toast, shared Home/Activity state, Home cards, entry-sheet draft and edit guard).
Plans:
**Wave 1**
- [x] 03-01-PLAN.md — Foundations: expo-blur, predictive back off, hapticMedium in the existing wrapper, shell/Home tokens and durations, src/shell lint boundary, Reanimated/worklets doc fix
- [x] 03-02-PLAN.md — Pure back-history core under D-22 (8-deep history, transitions, back decision, nav-state -> location) (TDD)
- [x] 03-03-PLAN.md — Pure tab order/availability, forward and always-reverse back slide, FAB hide rule, quick-action order (TDD)
- [x] 03-04-PLAN.md — Phase 3 copy: shell, sheet discard, refresh toasts, Home
- [x] 03-17-PLAN.md — Engine: unpaid outflows, left after everything, bar shares; Unpaid filter = bills out only, projections filter (TDD, 100%)
- [x] 03-18-PLAN.md — Engine: entry draft v2 with the form snapshot, v1 still parses (TDD, 100%)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-05-PLAN.md — DSG-07 text scaling: Text/TextInput primitives, root font-scale provider, 73-file migration + lint rule
- [x] 03-06-PLAN.md — Shell state: BackHistoryProvider, sheetStack store, Android back (steps 2-4), layout measurements, focus helper, test harness
- [x] 03-20-PLAN.md — Pull-to-refresh hook with the "updated / nothing new" completion toast
- [x] 03-21-PLAN.md — Shared selected month, Activity filter intent, entry-host store; Activity Unpaid lists projected bills

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 03-07-PLAN.md — Context-aware FAB: registration API, sheet-aware hide rule, quick actions, haptics, rise and lift above toast
- [x] 03-08-PLAN.md — Tab bar: bespoke glyphs, availability, accessibility, re-tap, shell-driven directional slide
- [x] 03-09-PLAN.md — Own Sheet: drag-to-dismiss, ink-at-38% backdrop and motion, stacking, dismissible, a11y escape, Dropdown backdrop
- [x] 03-10-PLAN.md — Header pieces: tab header, compact header, detail header, avatar, back chevron, problem-only sync line
- [x] 03-22-PLAN.md — Home view model, Coming-up selection, month chips, This month card

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 03-11-PLAN.md — Screen scaffolds: TabRootScreen / DetailScreen, large-to-compact header, refresh control, title focus
- [x] 03-12-PLAN.md — FAB long-press quick menu on the app Sheet (absorbs Activity's Add sheet)
- [x] 03-16-PLAN.md — Sheet dirty prop and stacked "Discard changes?"; dirty reports on seven edit sheets

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 03-19-PLAN.md — Toasts above sheets: top-sheet overlay, remaining-time timer, UI-SPEC position, FAB lift feed
- [x] 03-23-PLAN.md — Home: quick actions, Coming up with Pay, projection detail, Accounts card, HomeScreen
- [x] 03-24-PLAN.md — Entry sheet: draft on accidental dismissal, Discard changes? when editing, Cancel unchanged

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 03-13-PLAN.md — Route wiring: (tabs) group with Home landing, details in the outer stack, SwipeBack kept, gate moved up, providers, router tests

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 03-15-PLAN.md — Record integration: Activity as a tab root, Add pill/sheet and You link removed, ShellEntryHost

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 03-14-PLAN.md — Prototype-deviation record (D-01, D-12, D-23) + Android device acceptance A1-A16 (checkpoint)

**Gap closure (2026-10-14, from 03-FINDINGS.md: G1-G9, H1-H9, M1-M9, L1-L13)**

**Gap wave 1**
- [x] 03-25-PLAN.md — Shared contracts: gap copy ("Expected", Unpaid banner, Home states, compact account line), unused keys removed, PRESSED_OPACITY / ACCENT_TINT_OPACITY, FAB_CLEARANCE, monthRefreshKeys, pushOnce, SyncProblemLine inset
- [x] 03-26-PLAN.md — Engine (TDD): unconverted amounts excluded from range filters (H9), refund-safe bar share (L6), Repeats in the draft form, toCurrency cap, skipped -> paid
- [x] 03-27-PLAN.md — Sheet onDiscard + single-fire drag dismissal + dirty fling asks + prompt reset; Repeats Discard restores (G2, H5, H6, L9) [integration]
- [x] 03-33-PLAN.md — State hygiene: tabSlide wipe and stuck back-step flags, shared-month rollover, owner-only FAB cleanup (L1, L4, L8)
- [x] 03-34-PLAN.md — Primitives: toast rise-in and geometry (M3), Text without fontSize (M9 confirm-first), MonthChips tabs and labels (L2, L3)
- [x] 03-36-PLAN.md — Android edge swipe-back: 40dp, follows the finger, reduced motion (G7 / D-40)

**Gap wave 2** *(blocked on gap wave 1)*
- [x] 03-28-PLAN.md — Entry sheet: lossless draft restore, validated currencies, no guess on an untouched edit, early-dismiss merge (H1, H2, H4, L5)
- [x] 03-29-PLAN.md — Home This month / Coming up: true headline with expected bills (G1), error and offline states (G4), month-aware copy (M6), shared refresh keys (M8)
- [x] 03-30-PLAN.md — Account rows short on Home and Accounts list (G6 / D-39), accent-following tints (M4), card polish (M1, M2, M7)
- [x] 03-32-PLAN.md — Tab-root chrome: sync line in the large header (G5), offline refresh no toast (H3), FAB clearance (H8), avatar (M5)
- [x] 03-35-PLAN.md — Import returns to the one (tabs), to Home when started there (G3); push guards (H7) [integration]

**Gap wave 3** *(blocked on gap wave 2)*
- [x] 03-31-PLAN.md — Activity: Unpaid banner (G8 / D-41), tappable Expected rows (G9 / D-42), sync line at rest, FAB clearance
- [x] 03-37-PLAN.md — Sync line on every pushed screen (G5) [integration]

**Gap wave 4** *(blocked on gap wave 3)*
- [x] 03-38-PLAN.md — Pixel 9 re-check: A7, A9, A15, Accounts row, import from Home, H7/H8/M3 quick checks (checkpoint)
**UI hint**: yes — heaviest design-fidelity phase in the roadmap: bespoke SVG tab glyphs, sheet infrastructure, seven named animations.

### Phase 03.1: Activity header redesign (INSERTED)

**Goal:** The Activity tab's header shrinks from up to ten stacked bands to four (title; month row with Search, Filter and More; one summary card; a Display chip with active-filter chips), with no feature lost and the first entry above the fold.
**Requirements**: no new IDs; refines the Phase 2 Activity header (ACT-02 month switcher, ACT-03 search) and keeps Phase 3's D-41 Unpaid banner
**Proposal**: https://claude.ai/artifact/BNKMdaVimhwxtkev8PJ8Yp (approved 2026-10-15)
**Depends on:** Phase 3
**Plans:** 15/15 plans complete

Plans:
**Wave 1**
- [x] 03.1-01-PLAN.md — Copy catalogue for the new header, DURATION.searchFade, shared RadioDot
- [x] 03.1-02-PLAN.md — Pure helpers: active filters (count, chips, clear) and month layout / Intl labels (TDD)
- [x] 03.1-03-PLAN.md — Hand-drawn Search / Filter / More glyphs and HeaderIconButton with count badge
- [x] 03.1-04-PLAN.md — Row long-press and the Select accessibility action (SwipeRow, ActivityRow)
- [x] 03.1-05-PLAN.md — Chrome: compact title / role / trailing slot, avatar dropped, scrollToTop
- [x] 03.1-06-PLAN.md — Shared month-figure helper (Home parity), VM position / monthEmpty / entryCount / searchOpen

**Wave 2** *(blocked on wave 1)*
- [x] 03.1-07-PLAN.md — ActivitySummaryCard (left after everything, In/Out, still to come, D-70 count)
- [x] 03.1-08-PLAN.md — Display chip and two-section Display sheet; Chip focus ref
- [x] 03.1-09-PLAN.md — Filter chips with per-chip ×, sideways scroll and Clear all
- [x] 03.1-10-PLAN.md — More menu (three groups) and SelectBar
- [x] 03.1-11-PLAN.md — Month row with icon cluster and measured long / short / wrap fallback

**Wave 3** *(blocked on wave 2)*
- [x] 03.1-12-PLAN.md — ActivityHeaderBands composition and search Cancel / cross-fade

**Wave 4** *(blocked on wave 3)*
- [x] 03.1-13-PLAN.md — ActivityScreen wiring, compact header, long-press select; screen tests

**Wave 5** *(blocked on wave 4)*
- [x] 03.1-14-PLAN.md — Remaining Activity suites, Home-intent closes search, retired components and keys removed

**Wave 6** *(blocked on wave 5)*
- [x] 03.1-15-PLAN.md — Pixel 9 device acceptance record (checkpoint)

### Phase 4: Decide Engine
**Goal**: The affordability engine computes correct verdicts in complete isolation, before any UI exists.
**Depends on**: Nothing (pure TypeScript, zero data-layer dependency — parallel-eligible with Phases 1-3)
**Requirements**: DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-11, DEC-12, DEC-13, DEC-14, DEC-15, DEC-16, DEC-17, DEC-18, DEC-19, DEC-20, DEC-21, DEC-22, DEC-23, DEC-24, DEC-25, DEC-26, DEC-27, DEC-28, DEC-29, DEC-30, DEC-31, DEC-32, DEC-33, DEC-34, DEC-35, DEC-36, DEC-37
**Success Criteria** (what must be TRUE — test-suite observable, no UI in this phase):
  1. The engine computes an amortised monthly payment for any principal/APR/term including the zero-rate case, and future value of a monthly contribution plus a seed including the zero-rate case.
  2. A credit card at 22.9% APR with a 1% minimum payment is correctly reported as never clearing, via an explicit payment-vs-interest check rather than inference from hitting the simulation's month cap.
  3. The engine resolves paid-in-full, deposit-plus-loan, instalment-plan and credit-card payment methods into a comparable plan, flags a plan incomplete when its terms are unspecified, and returns a verdict of fits/adjust/no/missing with up to six warnings ordered by shortfall size (five ledgers plus the D-44 `cash_dip`).
  4. The engine derives income steadiness from the coefficient of variation across logged months (not a user-stated answer), computes a household's cost share under the active split rule, finds the largest affordable price by bisection (handling both "nothing is affordable" and "the full price already fits"), and determines card eligibility as blocked/capped/permitted.
  5. The full engine suite is green at the agreed branch-coverage threshold, runs with no React, no I/O and no database access, and `dsecured` reads a boolean field on the loan record rather than matching its name.
  6. The engine produces the options list, the four-way alternatives (suppressing and labelling rows whose money is not genuinely spare) and setback re-assessments, and returns a cash-level first read from rough figures when no full month exists — all as codes and numbers, with no English strings (04-CONTEXT D-11, D-19, D-21).
**Plans**: 22 plans in 8 waves (revised 2026-10-15 against 04-CONTEXT D-23…D-58 incl. the engine depth expansion and its consistency amendments; choices in 04-REPLAN-NOTES.md)
Plans:
**Wave 1**
- [x] 04-01-PLAN.md — payoff foundation: Percent type, amortise (DEC-01), futureValue (DEC-02)
- [x] 04-02-PLAN.md — card eligibility by item type, secured by field, household share under four split rules (DEC-08/10/11)
- [x] 04-03-PLAN.md — golden-fixture harness evaluating the prototype's own Decide code (D-22)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-04-PLAN.md — simulateMinimum with explicit never-clears (DEC-03, SC-2), payoff barrel, payoff parity
- [x] 04-05-PLAN.md — Decide contracts incl. D-41..D-56 types, cited behaviour constants (D-58), per-market defaults, currency guard, series maths, projection rates (DEC-12)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 04-13-PLAN.md — deriveMoney over Record lines: paid only, refunds netted, series smoothed, one-off lines excluded (D-47), exact CV steadiness (DEC-07/08)
- [x] 04-14-PLAN.md — payoff rate schedules (D-48) and independent published amortisation reference tests (D-57)
- [x] 04-15-PLAN.md — steadiness-scaled cushion (D-42), confidence (D-46), on-the-edge margins (D-43), worst of 12 future months (D-45)
- [x] 04-16-PLAN.md — running-cost prompt table (D-55) and estimate bias (D-56)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 04-06-PLAN.md — resolvePlan for cash/loan/instalment/card/invest with missing reason codes, check inputs (DEC-04/05/10)
- [x] 04-17-PLAN.md — day-by-day 90-day cash path and `cash_dip`, one card per cause (D-44)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 04-07-PLAN.md — prepareContext + assess: two shares, two cash figures, cash path, pausable saving/investing, confidence, D-36 size, ordered warnings (DEC-06)
- [x] 04-08-PLAN.md — cash-level first read from rough figures with a rough cushion, D-36 size and confidence (DEC-16)
- [x] 04-22-PLAN.md — credit terms: promotional rates and deferred interest (D-48), variable flag (D-49), BNPL late fees (D-50)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 04-09-PLAN.md — exact integer bisection and the ordered options list on the combined position, per-rate projections (DEC-09/13)
- [x] 04-10-PLAN.md — four-way alternatives with suppression and per-rate projections, setbacks, wait plan (DEC-14/15)
- [x] 04-11-PLAN.md — decide golden parity and named deviation tests (D-22)
- [x] 04-18-PLAN.md — position layer: combined open checks (D-41), future changes and purchase-linked income loss (D-45, D-53)
- [x] 04-19-PLAN.md — variable-rate stress (D-49) and payback months (D-53)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 04-20-PLAN.md — `decide()` report: combined and standalone verdicts, worst month, margins, stress, expected income; named tests D-41/D-43/D-44
- [x] 04-21-PLAN.md — investment views at 0% and user rates (D-51, D-52) and income at risk (D-54)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 04-12-PLAN.md — public barrel, codes-only guard, cross-suite phase gate (DEC-12)
**UI hint**: no (pure TypeScript engine; deliverable is a green suite and a coverage report)

### Phase 5: Decide UI
**Goal**: A user gets a trustworthy, explained affordability verdict computed from their own logged months.
**Depends on**: Phase 4 (engine), Phase 1 (data layer to source the snapshot)
**Requirements**: DCU-01, DCU-02, DCU-03, DCU-04, DCU-05, DCU-06, DCU-07, DCU-08, DCU-09, DCU-10, DCU-11, DCU-12, DCU-13, DCU-14, DCU-15, DCU-16, DCU-17, DCU-18, DCU-19, DCU-20, DCU-21, DCU-22, DCU-23, DCU-24, ANL-06
**Success Criteria** (what must be TRUE):
  1. A user can get a cash answer from just an item and a price without entering the multi-step flow, and can work through the five steps — item, price and payment, impact, alternatives, decision — for the full picture.
  2. A user can leave a check open, return to it later and see its verdict recomputed against current figures, or abandon it.
  3. A user sees four alternatives — as planned, cheaper, wait and save, skip entirely — each with its outcome, and an alternative is suppressed and labelled when the money it assumes is not genuinely spare.
  4. A user can record a decision and later compare what they estimated against what actually happened; date selection refuses past dates and offers quick offsets.
  5. No verdict copy anywhere uses "advice", "recommendation" or "you should".
  6. A brand-new user reaches a first verdict within their first session, in roughly a minute, without having logged or imported a month, and the verdict says plainly what it rests on and how an import sharpens it.
  7. Store screenshots 1–3 (verdict, what breaks, alternatives) can be captured from the App Review demo account's sample scenario with nothing staged outside the real app.
**Launch inputs** (from `research/LAUNCH-POSITIONING.md`, 2026-09-26): the store name is *FincWin: Can I Afford It?*, so the quick check is the product's public promise and stays in the free tier (see `research/PRICING.md`). The first-read question is settled (04-CONTEXT D-11: rough figures give a cash-level answer only, via DEC-16). Discuss-phase must still settle the demo-account scenario (sofa $1,800 in a household of two; car $14,500 on a loan). Onboarding order — welcome, consent, one account, rough month, first check, then "Bring your history" — is shared with Phase 2 (02-30) and Phase 9, where the level questions move after the first verdict.
**Plans**: 53 plans in 10 waves (planned 2026-10-15, revised 2026-10-16 against 05-CONTEXT D-01..D-44, DCU-01..DCU-24 and the final 22-plan Phase 4 `decide()` API; plan checker passed (0 blockers, 0 warnings); defaults in 05-PLANNING-NOTES.md). **Execution is blocked until Phase 4 is executed and verified** (every plan runs the Phase 4 gate).
Plans:
**Wave 1**
- [x] 05-01-PLAN.md — Phase 4 gate, shared contracts, jest/depcruise guards, ANL-06 events
- [x] 05-02-PLAN.md — Decide copy catalogue, DCU-09 guard, undo vocabulary
- [x] 05-03-PLAN.md — Decide tables (checks, settings, debts, links, statement periods), RLS, grants, pgTAP
- [x] 05-33-PLAN.md — fxConvert read-side module (custom-currency aware) for D-37
- [x] 05-34-PLAN.md — Record data layer: one_off and goal_id fields
- [x] 05-38-PLAN.md — db modules for decide_changes and savings_goals

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 05-05-PLAN.md — db modules and RPC wrappers for the Decide tables
- [x] 05-06-PLAN.md — Pure snapshot builder: full months, pending one-offs, payments counted once, FX, one-offs, changes (100% coverage)
- [x] 05-07-PLAN.md — Check inputs, quick-to-full carry, computeQuick/computeCheck/computeChip over decide()
- [x] 05-08-PLAN.md — parseQuick, date offsets, estimate-vs-actual, canUse, DateField past-date guard
- [x] 05-09-PLAN.md — Exhaustive code-to-copy maps (verdict, warnings, quick line, suppression, options)
- [x] 05-10-PLAN.md — Display and choice primitives (StateChip, WarningCard, StepBar, ...)
- [x] 05-11-PLAN.md — expo-notifications ~57, Wait and cooling-off reminders, tap observer
- [x] 05-28-PLAN.md — Input primitives (StepSlider, RateInput, MoneyInput)
- [x] 05-31-PLAN.md — Depth copy catalogue (D-24..D-37) and extended DCU-09 guard
- [x] 05-32-PLAN.md — Depth migrations: decide_changes, savings_goals, cooling_off_at, split estimates, link roles, transactions.one_off/goal_id

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05-04-PLAN.md — apply_patches allow-list, record_decide_go / record_decide_outcome RPCs, pgTAP
- [x] 05-12-PLAN.md — Query keys, read hooks, useDecideSnapshot, other open checks
- [x] 05-14-PLAN.md — Steps 1 and 2, line editor
- [x] 05-15-PLAN.md — Step 3 verdict card, warnings, core sections, Assumptions
- [x] 05-17-PLAN.md — Step 4 alternatives, step 5 decision, written lines
- [x] 05-18-PLAN.md — Demo fixture (6 steady months) and engine-backed demo-outcome test
- [x] 05-35-PLAN.md — Chart geometry, cash-path chart, net-worth chart
- [x] 05-36-PLAN.md — ConfidenceChip, EdgeTag, CombineToggle, GoalProgress
- [x] 05-37-PLAN.md — Depth copy maps (verdict and input sides)
- [x] 05-39-PLAN.md — Journal helpers: past decisions, attach roles, saved so far
- [x] 05-50-PLAN.md — Record one-off toggle

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 05-13-PLAN.md — Quick-check form and result (home and first-read variants)
- [ ] 05-16-PLAN.md — Step 3 setbacks and options, household scope toggle (hidden)
- [ ] 05-19-PLAN.md — Queued mutations: checks, settings, links, card rate, statement periods
- [ ] 05-41-PLAN.md — Step 3 verdict depth: combined line, worst month, confidence, edge, D-59 fact, warnings
- [ ] 05-43-PLAN.md — Step 1 income change; step 2 promo, variable-rate stress, late fee
- [ ] 05-44-PLAN.md — Step 2 running-cost prompts and estimate-gap notes
- [ ] 05-45-PLAN.md — Step 4 "If it went into investing instead"
- [ ] 05-46-PLAN.md — Step 5 cooling-off toggle, Wait goal preview, written lines
- [ ] 05-51-PLAN.md — Demo seed v2 SQL, pgTAP, samples.ts, mirror check in CI

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 05-20-PLAN.md — Go ahead (one undo step, incl. investment and card payoff), Wait (+goal, reminder), Pass
- [ ] 05-21-PLAN.md — Decide tab root, FAB, open checks with stacked chips, reminder reconcile
- [ ] 05-22-PLAN.md — Past decisions and detail sheet (estimate vs actual, attach/unlink)
- [ ] 05-23-PLAN.md — Onboarding rough figures and first check (cash-only skip path)
- [ ] 05-42-PLAN.md — Step 3 depth sections: day by day, expected income, cushion and margins, runway
- [ ] 05-53-PLAN.md — Step 2 card terms: card minimum pre-fill, paid in full, card fees and costs (D-40, D-44)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 05-24-PLAN.md — Check flow layout, swipe interceptor, useCheckDraft
- [ ] 05-27-PLAN.md — Your month, Lines, limit and rough-figure sheets, home order
- [ ] 05-40-PLAN.md — Change mutations (add, edit, remove with undo)
- [ ] 05-47-PLAN.md — Past decisions goal progress; tag and untag transfers to a goal
- [ ] 05-52-PLAN.md — withoutCheckWrites and useBoughtCheckComputation

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 05-30-PLAN.md — Check flow route, screen, header, action bar, step 3 section order
- [ ] 05-48-PLAN.md — Changes coming up card and sheet on Decide home
- [ ] 05-49-PLAN.md — Cushion months on Lines; missing-rate state in Your month

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 05-29-PLAN.md — Commit a decision; decided checks (bought checks recalculated without their own writes)

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 05-25-PLAN.md — Full local gate and [BLOCKING] human-gated production push (npm run supabase:db:push)

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 05-26-PLAN.md — Device verification: DCU-11 screenshots at 402x874, 60 s first read, reminders, haptics, back
**UI hint**: yes — this phase should carry the deepest testing and design-iteration budget in the roadmap; it is the product's actual moat.

### Phase 6: Grow
**Goal**: A user can track savings goals, investments and debt payoff against their real numbers.
**Depends on**: Phase 3 (Shell provides the navigation these screens live in)
**Requirements**: GRW-01, GRW-02, GRW-03, GRW-04, GRW-05, GRW-06, GRW-07, GRW-08, GRW-09, GRW-10, GRW-11
**Success Criteria** (what must be TRUE):
  1. A user can create a savings goal with a target amount or leave it open-ended, flag exactly one goal as their emergency fund, and set an automatic contribution to any goal.
  2. A user can record investment holdings across the supported account types, with cost-basis lots — buys, sells, dividends, fees — against each holding.
  3. A user can see gain or loss per holding and in total.
  4. A user can record loans and revolving credit with balance, rate and minimum, then compare avalanche and snowball payoff strategies with an optional extra payment.
  5. A user can see a projected payoff date and total interest for their chosen strategy.
  6. A user records a holding's market value by hand, and its as-of date appears wherever that value is shown — no live price feed exists in v1.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Insights
**Goal**: A user can see the shape of their finances over time.
**Depends on**: Phase 6
**Requirements**: INS-01, INS-02, INS-03, INS-04, INS-05, INS-06
**Success Criteria** (what must be TRUE):
  1. A user can see net worth over time with a selectable range.
  2. A user can see money in and out per month as bars, switch to a comparison mode, and compare a month against the previous one.
  3. A user can see spending broken down by category for a period.
  4. A user can see a financial health score with the figures behind it.
  5. A user can view a month's Activity as a week breakdown, a split view, a balance view and a calendar.
**Plans**: TBD
**UI hint**: yes

### Phase 8: Household
**Goal**: Multiple people can share one household's money, live, on top of the RLS foundation Phase 0 already laid.
**Depends on**: Phase 0 (schema/RLS foundation), Phase 3 (Shell for the UI this phase adds)
**Requirements**: HH-01, HH-02, HH-03, HH-04, HH-05, HH-06, HH-07, HH-08, HH-09, HH-10, HH-11, HH-12, HH-13, HH-14, HH-15
**Success Criteria** (what must be TRUE):
  1. A user can invite another person with an expiring link and code; the invited person joins by signing in and gains access only to that household's shared records.
  2. A user can assign members a colour, a role (including custom roles) and a weight; mark a transaction as shared and have it split by even/weight/amount/mine-only rules, with a default rule set per category.
  3. A user can see what each member owes or is owed, and settle up with a member so the matching record appears on their side.
  4. A user can toggle between their own figures and the household's, and hide real names from other members with a colour-name fallback.
  5. A shared record created by one member appears on another member's device without a manual refresh, and a user can share a read-only household summary as an expiring link.
  6. A member can leave, be removed, or receive ownership; deleting an account follows the documented rule and leaves the remaining members' balances correct; and guessing invite codes is rate-limited to futility.
**Plans**: TBD
**UI hint**: yes
**Research flag**: The Realtime reconciliation state machine (no pending write / write still queued / own-write echo / genuine version conflict) is a synthesized design, not a documented Supabase recipe. Budget a dedicated spike — two simulated clients, one taken offline mid-edit — before trusting it in production. Also resolve explicitly what happens when a settlement's expiry window lapses unresolved; the prototype specifies the window but not the outcome.

### Phase 9: Tiers & Onboarding
**Goal**: The app reveals its depth gradually and converts to a paid subscription cleanly.
**Depends on**: Phase 3 (Shell), Phase 0 (RevenueCat identity anchors to the Supabase user id from first sign-in)
**Requirements**: TIER-01, TIER-02, TIER-03, TIER-04, TIER-05, TIER-06, TIER-07, TIER-08, TIER-09, TIER-10, ENV-12, ANL-07, ANL-08
**Success Criteria** (what must be TRUE):
  1. A new user answers an 11-question flow that sets a starting feature level, and features appear or stay hidden according to the current level.
  2. A user can change their level at any time after onboarding, and re-run the onboarding flow.
  3. A user is offered a specific hidden feature in context, at the moment it would have helped, and is told which specific feature a paywall is gating and why.
  4. Household features are governed by whether the user shares money, independently of level.
  5. A user can purchase a subscription recognised across their devices, restore a previous purchase, and cancel through a path no harder to find than account deletion.
**Plans**: TBD
**UI hint**: yes
**Research flag**: Two blocking decisions, both currently open in PROJECT.md, must be resolved before gating is implemented — not during: (1) which of the ~50 features are Free versus Pro, since the paywall's original five-item pitch lost cloud sync and tax export to the architecture decision; (2) whether the Coach ships as a real LLM and on what terms, including a server-side post-filter against prescriptive language before implementation. Everything built before these decisions stays tier-agnostic behind a single entitlement check.

### Phase 10: System
**Goal**: The app is secure, resilient offline, and lets a user manage their own data completely.
**Depends on**: Phase 0 (auth), Phase 1 (write queue mechanism), Phases 2-9 (features being hardened, alerted on, imported and exported)
**Requirements**: ACC-06, ACC-07, ACC-08, ACC-09, ACC-10, SYN-03, SYN-04, SYN-05, ALR-01, ALR-02, ALR-03, ALR-04, ALR-05, DAT-01, DAT-02, DAT-03, DAT-04, ENV-19, ACC-11, ACC-13, DAT-05, DAT-06, ALR-06, DSG-08, ENV-16, IMP-06
**Note (02.3 D-20):** ACC-10's in-app account deletion must call `forgetGoogleOnAccountDeletion(email)` (src/services/auth/google.ts) to clear the remembered-account tile and sign out of / revoke Google.
**Success Criteria** (what must be TRUE):
  1. A user can see every device where their account is signed in with the current device marked, and sign out of one device or all devices at once.
  2. A user can unlock the app with Face ID, Touch ID or Android biometrics, or a PIN.
  3. A queued write that is retried never produces a duplicate record; the write queue survives a force-quit and resumes on next launch; and it is bounded, with the user told when it cannot grow further.
  4. A user can enable alerts for bills due, over cap, goal reached, large transactions and low balance, with a threshold per kind, instant or digest delivery, quiet hours, and a log of alerts already raised.
  5. A user can archive a month and restore it, export their data as CSV, import goals/debts/investments/accounts from CSV, and delete their account in-app in a way that actually purges their data from Supabase, with a clear choice about any locally cached data.
  6. A household member's large expense arrives on another member's phone as a push notification; balances are hidden in the app switcher; a backup has been restored into a non-production project and verified; and a store reviewer can sign in through an allow-listed account.
**Plans**: TBD
**UI hint**: no (not in the flagged UI-heavy set; ships mostly settings/security surfaces on top of existing shell patterns)

### Phase 11: Compliance & Release
**Goal**: The app is truthfully described and ready for store submission.
**Depends on**: Phases 0-10 (final verification gate)
**Requirements**: CMP-01, CMP-02, CMP-03, CMP-04, CMP-05, CMP-06, CMP-07, CMP-08, CMP-09, CMP-10, CMP-11, DSG-01, DSG-05, ENV-11, CMP-12, CMP-13
**Success Criteria** (what must be TRUE):
  1. A findable disclaimer states the app is not financial advice and involves no institution, and no user-facing string claims data stays on the device or is not sent anywhere.
  2. The App Privacy questionnaire, the Play Data safety form and the Play Financial features declaration are completed, match actual data handling, and are filed before first internal-testing upload.
  3. `PrivacyInfo.xcprivacy` is present with required-reason API declarations; privacy policy and terms are live at real URLs; `ITSAppUsesNonExemptEncryption` is answered correctly for the shipped build.
  4. Subscription products are correctly attached to the submitted version with required disclosure copy present, and Guideline 3.2.1(viii) has been re-read against live text with the positioning argument reconfirmed.
  5. A TestFlight build is installed and exercised on the physical iPhone, an internal-testing build on physical Android, and the store listing carries screenshots for all required device sizes plus a 1024×1024 icon.
  6. Rendered screens match the prototype's screenshots within tolerance on both platforms — the final visual-fidelity gate, verifiable here because every screen now exists.
  7. The review account opens onto months of sample data where Decide returns real verdicts, its credentials are filed with both stores, and a working support URL and in-app contact route exist.
**Plans**: TBD
**UI hint**: no (store assets and copy audit; no new app screens)
**Research flag**: Guideline 3.2.1(viii) must be re-read against live text; its wording changed since the brief was written. Separately, correct the brief's mis-citation — the 36% APR / 60-day loan cap is 3.2.2(ix), not 3.2.1(viii), and does not apply here regardless.

## Backlog

Ideas parked outside the active phases. Promote one with `/gsd-review-backlog`. Captured 2026-10-13 from the prototype review during the Phase 3 re-discussion.

### Phase 999.1: Split a transaction across categories (BACKLOG)
**Goal:** Divide one transaction between several categories, as in the prototype's split sheet (`FincWin United.dc.html` L2149–2151, L2572, L6514). This is separate from the household split (HH-04).
**Requirements:** none yet.
**Plans:** none.

### Phase 999.2: Receipt photo on a transaction (BACKLOG)
**Goal:** Attach a receipt image to a transaction (prototype receipt sheet L2747). The detail sheet currently omits Receipt (`src/features/record/activity/detailRows.ts` L3).
**Requirements:** none yet.
**Plans:** none.

### Phase 999.3: Envelope rollover of unspent caps (BACKLOG)
**Goal:** Unspent category caps roll into next month (prototype L5359).
**Requirements:** none yet.
**Plans:** none.

### Phase 999.4: Coach (BACKLOG)
**Goal:** The prototype's Coach screen and its Home quick action (L2357, L5321, L4945–4950). It appears only as an open decision in Phase 9's research flag. The Home quick action stays hidden until it exists (03-CONTEXT D-30).
**Requirements:** none yet.
**Plans:** none.

### Phase 999.5: Custom payment and account types (BACKLOG)
**Goal:** User-defined payment types and account types (prototype L2932, L5930). Custom household roles are HH-03.
**Requirements:** none yet.
**Plans:** none.

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 2.2 → 2.1 → 3 → 4* → 5 → 6 → 7 → 8 → 9 → 10 → 11
*Phase 4 has no data-layer dependency and may run concurrently with Phases 1-3 if parallel workstreams are available.
2.2 runs before 2.1 because it changes the import commit path that 2.1's plans build on; 2.1 is replanned after 2.2 (STATE.md Blockers).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Foundation | 18/20 | In Progress | - |
| 1. Money Core | 16/16 | Complete | 2026-09-26 |
| 2. Record | 50/50 | Complete | 2026-10-09 |
| 2.1 PDF statement import | 17/17 | Complete (Android verified; iOS pending enrolment) | 2026-10-11 |
| 2.2 Record polish | 35/35 | Complete (Android verified; iOS pending enrolment) | 2026-10-10 |
| 2.3 Record follow-ups | 20/20 | Complete (Android verified; iOS pending enrolment) | 2026-10-13 |
| 3. Shell | 38/38 | Complete    | 2026-10-14 |
| 4. Decide Engine | 22/22 | Complete | 2026-10-16 |
| 5. Decide UI | 0/53 | Planned | - |
| 6. Grow | 0/TBD | Not started | - |
| 7. Insights | 0/TBD | Not started | - |
| 8. Household | 0/TBD | Not started | - |
| 9. Tiers & Onboarding | 0/TBD | Not started | - |
| 10. System | 0/TBD | Not started | - |
| 11. Compliance & Release | 0/TBD | Not started | - |
