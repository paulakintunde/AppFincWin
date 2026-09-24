# Roadmap: FincWin United

## Overview

FincWin ships in build order dictated by one architectural fact: local-first was rejected, so there is no on-device database, and every phase from Record onward is hard-blocked on a working, authenticated, RLS-protected Supabase connection. Foundation therefore absorbs Supabase provisioning, Apple/Google sign-in and the household-of-one schema — work the original brief had filed under Household — which is why Household later shrinks to genuinely new multi-member work. Money core stands up the data layer (integer-money engine, UUID keys, the offline write queue) so Record has somewhere correct to write on day one. Shell, Grow and Insights follow standard dependency order. The Decide engine is pure TypeScript with zero data-layer dependency and can run in parallel with Money core / Record / Shell; Decide UI then depends on both the engine and a live data layer to source a user's logged months. Household, Tiers & onboarding and System close out remaining functional scope, and Compliance & release is the final gate before submission. Four phases carry an explicit research flag rather than an assumed-solved design: Foundation's EAS provisioning from Windows, Household's synthesized Realtime reconciliation state machine, the still-open Free/Pro and Coach-LLM decisions blocking Tiers & onboarding, and Compliance's re-read of Guideline 3.2.1(viii) against live text.

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, 3...): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 0: Foundation** - Expo project, engine purity CI gates, Apple/Google auth, household-of-one schema and RLS, design tokens
- [ ] **Phase 1: Money Core** - Integer-money engine, client UUID keys, FX rate storage, TanStack Query data layer with the offline write queue
- [ ] **Phase 2: Record** - Transactions, recurring entries, CSV import, Activity list, compensating-write undo
- [ ] **Phase 3: Shell** - Five tabs, bespoke glyphs, back stack, bottom sheets, context-aware FAB
- [ ] **Phase 4: Decide Engine** - Pure TypeScript affordability engine, fully tested, no UI (parallel-eligible with Phases 1-3)
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
- [x] 00-08-PLAN.md — GitHub Actions CI (checks, gitleaks, RLS) + required checks on main (W3) — *branch protection on since 2026-09-23 (repo public); owner bypass still open, see FND-04/05*
- [x] 00-09-PLAN.md — fx_rates + Frankfurter v2 fx-sync Edge Function + pg_cron + [BLOCKING] production push (W3)
- [x] 00-10-PLAN.md — Supabase client on encrypted LargeSecureStore, wipe registry, connection check (W3)
- [x] 00-11-PLAN.md — Design tokens, 4 accents / 4 pairings live theme, reduce-motion, safe-area, DSG-02 guard (W3)
- [x] 00-12-PLAN.md — Typed i18n catalogue with D-16 placeholders and D-20 drafts (W3)
- [x] 00-13-PLAN.md — Consent-gated PostHog EU analytics, typed event catalogue, no replay (W3)
- [ ] 00-14-PLAN.md — EAS project, profiles, env secrets, fingerprint OTA policy + rollback rehearsal (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 00-15-PLAN.md — Apple/Google sign-in services, first-auth profile capture, AuthProvider, Google OAuth (W4)
- [ ] 00-16-PLAN.md — D-19 error-tracking spike: PostHog vs Sentry, scrubbed consent-independent reporting (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 00-17-PLAN.md — Root layout, welcome screen, min-version gate + update-required screen (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 00-18-PLAN.md — Consent screen, You screen, theme profile sync, sign-out wipe flow (W6)

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 00-19-PLAN.md — Android acceptance, register consolidation, approved prod push (W7)

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
| Supabase production on Pro | Backups for real user data | No — $25/month | Development stays on Free. Production moves to Pro before the first real data (ENV-16, Phase 2) |
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
- [ ] 01-06-PLAN.md — FND-10 migration compatibility gate, self-test, mirror check in CI, PR checklist (W3)
- [ ] 01-08-PLAN.md — FX ingest: open.er-api fallback, plausibility holds, second-source confirm, currency metadata (W3)
- [ ] 01-10-PLAN.md — DB access layer, query keys, read hooks, device locale service (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 01-11-PLAN.md — resolve-rate backfill + fx-monitor staleness/auto-accept/Resend digest, runbook (W4)
- [ ] 01-12-PLAN.md — Offline write queue: mutation defaults, provisional FX, conflicts, QueryProvider (W4)
- [ ] 01-14-PLAN.md — RateAttribution, SyncStatusLine, money formatter hook, catalogue keys (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 01-13-PLAN.md — Money prefs, custom currencies and currency options hooks (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 01-15-PLAN.md — Wire QueryProvider, failure reporting, sync line, credits and dev probe into the app (W6; needs Phase 0 00-16/17/18)

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 01-16-PLAN.md — Production rollout: schema push [BLOCKING], function deploy, live smoke, device check (W7)
**UI hint**: no (data layer and engine work; no screens ship in this phase)

### Phase 2: Record
**Goal**: A user can log and manage their real financial activity against a live backend.
**Depends on**: Phase 1
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05, REC-06, REC-07, REC-08, REC-09, REC-10, REC-11, REC-12, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ANL-05, ENV-16
**Success Criteria** (what must be TRUE):
  1. A user can log an expense or income with amount, category, account and date; edit or delete any transaction they created; and see a balance per account they define, using categories they can create, rename and colour.
  2. A user can mark a transaction as recurring on a schedule, have it generate entries without re-typing, and skip or end a single occurrence without deleting the series.
  3. A user can import transactions from a CSV file — during onboarding or later — previewing what will be created and correcting the column mapping before committing.
  4. A user can view all of a month's transactions in a list, switch months including into archived ones, search across all months, filter by category/account/amount, and bulk-select and delete transactions in one action.
  5. A user can undo any of their last 12 changes from the toast or the history screen as a compensating write, and is refused with an explanation when another household member has since changed the same record.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Shell
**Goal**: The app's navigation chrome matches the design system exactly.
**Depends on**: Phase 2
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, DSG-07
**Success Criteria** (what must be TRUE):
  1. A user can move between five tabs with the bespoke SVG glyphs, and the slide direction matches the direction of travel.
  2. A user can go back through up to 8 previous screens across tabs and detail screens; detail screens push in over the current screen and dismiss back to it.
  3. A user can drag any of the ~14 bottom sheets down to dismiss it.
  4. The FAB's action changes to match the current tab, and it hides during sheets, bulk select, onboarding and step flows.
  5. A user can navigate and read every screen with a screen reader on both platforms.
**Plans**: TBD
**UI hint**: yes — heaviest design-fidelity phase in the roadmap: bespoke SVG tab glyphs, sheet infrastructure, seven named animations.

### Phase 4: Decide Engine
**Goal**: The affordability engine computes correct verdicts in complete isolation, before any UI exists.
**Depends on**: Nothing (pure TypeScript, zero data-layer dependency — parallel-eligible with Phases 1-3)
**Requirements**: DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-11, DEC-12
**Success Criteria** (what must be TRUE — test-suite observable, no UI in this phase):
  1. The engine computes an amortised monthly payment for any principal/APR/term including the zero-rate case, and future value of a monthly contribution plus a seed including the zero-rate case.
  2. A credit card at 22.9% APR with a 1% minimum payment is correctly reported as never clearing, via an explicit payment-vs-interest check rather than inference from hitting the simulation's month cap.
  3. The engine resolves paid-in-full, deposit-plus-loan, instalment-plan and credit-card payment methods into a comparable plan, flags a plan incomplete when its terms are unspecified, and returns a verdict of fits/adjust/no/missing with up to five warnings ordered by shortfall size.
  4. The engine derives income steadiness from the coefficient of variation across logged months (not a user-stated answer), computes a household's cost share under the active split rule, finds the largest affordable price by bisection (handling both "nothing is affordable" and "the full price already fits"), and determines card eligibility as blocked/capped/permitted.
  5. The full engine suite is green at the agreed branch-coverage threshold, runs with no React, no I/O and no database access, and `dsecured` reads a boolean field on the loan record rather than matching its name.
**Plans**: TBD
**UI hint**: no (pure TypeScript engine; deliverable is a green suite and a coverage report)

### Phase 5: Decide UI
**Goal**: A user gets a trustworthy, explained affordability verdict computed from their own logged months.
**Depends on**: Phase 4 (engine), Phase 1 (data layer to source the snapshot)
**Requirements**: DCU-01, DCU-02, DCU-03, DCU-04, DCU-05, DCU-06, DCU-07, DCU-08, DCU-09, ANL-06
**Success Criteria** (what must be TRUE):
  1. A user can get a cash answer from just an item and a price without entering the multi-step flow, and can work through the five steps — item, price and payment, impact, alternatives, decision — for the full picture.
  2. A user can leave a check open, return to it later and see its verdict recomputed against current figures, or abandon it.
  3. A user sees four alternatives — as planned, cheaper, wait and save, skip entirely — each with its outcome, and an alternative is suppressed and labelled when the money it assumes is not genuinely spare.
  4. A user can record a decision and later compare what they estimated against what actually happened; date selection refuses past dates and offers quick offsets.
  5. No verdict copy anywhere uses "advice", "recommendation" or "you should".
**Plans**: TBD
**UI hint**: yes — this phase should carry the deepest testing and design-iteration budget in the roadmap; it is the product's actual moat.

### Phase 6: Grow
**Goal**: A user can track savings goals, investments and debt payoff against their real numbers.
**Depends on**: Phase 3 (Shell provides the navigation these screens live in)
**Requirements**: GRW-01, GRW-02, GRW-03, GRW-04, GRW-05, GRW-06, GRW-07, GRW-08, GRW-09, GRW-10
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
**Requirements**: INS-01, INS-02, INS-03, INS-04, INS-05, INS-06, ACT-06
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
**Requirements**: ACC-06, ACC-07, ACC-08, ACC-09, ACC-10, SYN-03, SYN-04, SYN-05, ALR-01, ALR-02, ALR-03, ALR-04, ALR-05, DAT-01, DAT-02, DAT-03, DAT-04, ENV-19, ACC-11, ACC-13, DAT-05, DAT-06, ALR-06, DSG-08
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

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4* → 5 → 6 → 7 → 8 → 9 → 10 → 11
*Phase 4 has no data-layer dependency and may run concurrently with Phases 1-3 if parallel workstreams are available.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Foundation | 9/20 | In Progress|  |
| 1. Money Core | 0/TBD | Not started | - |
| 2. Record | 0/TBD | Not started | - |
| 3. Shell | 0/TBD | Not started | - |
| 4. Decide Engine | 0/TBD | Not started | - |
| 5. Decide UI | 0/TBD | Not started | - |
| 6. Grow | 0/TBD | Not started | - |
| 7. Insights | 0/TBD | Not started | - |
| 8. Household | 0/TBD | Not started | - |
| 9. Tiers & Onboarding | 0/TBD | Not started | - |
| 10. System | 0/TBD | Not started | - |
| 11. Compliance & Release | 0/TBD | Not started | - |
