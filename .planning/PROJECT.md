# FincWin United

## What This Is

FincWin United is a personal and household money app for iOS and Android. It records money in and out across multiple accounts, currencies, categories and a shared household; it runs real financial maths against a user's actual logged months to answer whether they can afford a specific purchase; and it reveals its own depth gradually, gating ~50 features behind four levels set by an onboarding question flow so a first-time user meets a small app and an expert meets all of it.

It is a **money-management tool, not a financial institution and not a lender.** It holds no money, executes no trades, offers no loans and gives no regulated advice. That distinction governs store compliance and must be reflected in every piece of copy.

## Core Value

**The Decide tab must give a trustworthy answer.** A user types an item and a price; FincWin tells them whether it fits, what breaks if they buy it, and what the cheaper or later versions look like — computed from their own logged months, not a survey. Everything else in the app is a well-made money app. Decide is the reason to use it, and it is the only place where a wrong answer causes real harm to a real person's finances.

## Requirements

### Validated

(None yet — ship to validate)

The existing files in this repo are a **design prototype handoff**, not shipped product: `FincWin United.dc.html` (7,018 lines, a Claude Design HTML/CSS/JS mock), `ios-frame.jsx`, `support.js`, `doc-page.js` and `screens/*.png`. They are the specification, not a codebase. Nothing here has shipped or been validated with a user.

### Active

All of these are hypotheses until shipped.

**Foundation**
- [ ] Expo SDK 57 project on TypeScript strict, Expo Router (SDK-tracked `~57.x`), building to Android emulator and to iOS via EAS
- [ ] `engine/` purity boundary enforced by **two** tools: `eslint-plugin-boundaries` for editor feedback and `dependency-cruiser` as the non-bypassable CI gate
- [ ] Supabase project provisioned, with Sign in with Apple and Google, and a "household of one" schema plus RLS model auto-provisioned on signup
- [ ] Sign in with Apple name/email captured on **first authorization only** and persisted immediately — it is never returned again
- [ ] Design tokens ported exactly: the §2 palette, 4 selectable accents, 4 selectable font pairings, live switching without reload
- [ ] Reduced-motion honoured via `AccessibilityInfo.isReduceMotionEnabled()`

**Money core**
- [ ] `Money` type on integer minor units — no floats, no `parseFloat` on user input, anywhere. Hand-rolled in `engine/money/`, no third-party dependency
- [ ] Largest-remainder rounding for splits, with a property test asserting shares always sum back to the original total
- [ ] Multi-currency with FX rates cached from Frankfurter v2, rate stored per transaction and per settlement
- [ ] Client-generated UUID primary keys, and a single integer `version` column backing optimistic concurrency, Realtime reconciliation and undo
- [ ] Data layer: TanStack Query v5 cached reads with a persister, and paused mutations as the offline write queue
- [ ] FX resilience: staleness alerts per currency, a plausibility hold on day-on-day moves beyond ~10%, and open.er-api as a fallback source with in-app attribution

**Record**
- [ ] User can log income and expenses against accounts, categories and a date
- [ ] **Recurring transactions as a first-class entity** — rent, salary, subscriptions. `dmoney`'s income steadiness and the bills-due alert both depend on it, and with no bank feed there is nothing else to infer recurrence from
- [ ] **CSV import, early** — the answer to Decide's cold-start problem. A new user brings existing history rather than waiting months to earn a useful verdict
- [ ] Activity list with month switcher, search, filter, bulk select and bulk delete
- [ ] Toast with inline Undo, 12 deep, as compensating writes — every mutation defines its inverse in `engine/`

**Shell**
- [ ] Five tabs with the bespoke SVG glyphs, directional slide animation, 8-deep back-history stack
- [ ] Push-in detail screens, ~14 bottom sheets with drag-to-dismiss, context-aware FAB

**Decide**
- [ ] Pure TypeScript engine — `dplan`, `dassess`, `dmoney`, `dSimMin`, `dpmt`, `dfv`, bisection, advice, alternatives, setbacks — with no React and no I/O
- [ ] Engine at the branch-coverage threshold, including the never-clears branch of `dSimMin` and every warning in `dassess`
- [ ] Quick check, five-step flow, open checks with live verdict, past decisions, estimate-vs-actual
- [ ] Four-way alternatives table with rows suppressed and flagged when the money is not genuinely spare

**Grow**
- [ ] Goals with targets, open-ended goals, auto-contributions, one flagged as the emergency fund
- [ ] Investments with holdings, 14 account types, cost-basis lots, per-holding history, gain/loss — valued by hand with an as-of date, no live price feed
- [ ] Debt with loans, revolving cards, avalanche and snowball strategies, extra payment, payoff projection

**Insights**
- [ ] Net-worth series, cash-flow in/out bars, range selector, comparison mode, category breakdowns
- [ ] Activity's remaining four views: week, split, balance, calendar

**Household**
- [ ] One household with members, colours, roles and weights, including custom roles
- [ ] Four split rules (even / by weight / by amount / mine only) and per-category split defaults
- [ ] Settlements with per-person balances and an expiry window
- [ ] Scope toggle between mine and household; name-sharing privacy toggle with colour-name fallback
- [ ] Expiring invite link with a code; members join by signing in and attaching to the household
- [ ] Supabase Realtime so shared transactions, settlements and goal contributions push live

**Tiers & onboarding**
- [ ] 11-question onboarding flow setting a starting level
- [ ] Four levels gating ~50 features, each with area and minimum level, with per-feature contextual offers
- [ ] Sharing capability modelled as an orthogonal flag, not a level (the prototype's level-9 marker)
- [ ] **Level is user-changeable after onboarding, and onboarding is re-runnable** — the prototype already supports both (`setLevel` at 3668, `onbRerun` at 6429); making it explicit removes the misclassification risk of one-time tier assignment
- [ ] RevenueCat entitlements and the prototype's own Pro gate sheet design
- [ ] **Pro cancellation as frictionless as account deletion** — the FTC's 2025 action against a direct category competitor covered hard-to-cancel subscriptions alongside deceptive claims

**System**
- [ ] Active-session list showing where the user is signed in, with a this-device marker and sign-out-everywhere
- [ ] Alerts: five kinds, amount thresholds, instant or digest, quiet hours, alert log
- [ ] Face ID / biometrics and PIN lock screen
- [ ] Offline queue hardening: idempotency keys, bounded queue growth, durable persistence across force-quit, and correct replay when a target row has moved
- [ ] Extended import beyond transactions — goals, debt, investments and accounts
- [ ] Month archive with restore, CSV export, and in-app account deletion that actually purges

**Analytics**
- [ ] PostHog product analytics on the EU host, opt-in only, identifying users by Supabase UUID and never recording amounts, payees, account names or free text
- [ ] Funnels for activation (signup → first entry → first import), Decide usage, and onboarding level assignment versus later changes

**Compliance & release**
- [ ] Privacy manifest, App Privacy answers, Play Financial features declaration, Data safety form
- [ ] Privacy policy and terms at real URLs; not-financial-advice disclaimer present and findable
- [ ] Store assets for both stores; TestFlight and internal testing builds exercised on real devices

### Out of Scope

**Deferred to v1.1**
- **Passkeys** — cut after research. Supabase's `signInWithPasskey()` calls the browser-only `navigator.credentials.get()`, and Supabase documents passkey support only for Flutter and Swift natively. The alternatives were building custom WebAuthn against an Edge Function, or fronting Supabase with Clerk and redesigning the schema around string user IDs — both disproportionate for one auth method when Apple and Google are already one-tap
- Web app — decided to ship mobile first, but build cloud-first and platform-agnostic so web is additive rather than a rewrite
- iOS Widgets and Android Glance widgets — require WidgetKit in Swift and Glance in Kotlin, iterated through slow cloud builds with no Mac; they are already the deepest feature tier, so deferring costs little
- Plaid bank feeds and brokerage linking — per-account cost, support burden and extra store scrutiny; ship the manual path behind a provider abstraction and turn feeds on when paying users justify it
- Round-ups — they only feel automatic when driven by a bank feed, so they land with Plaid
- Multiple households — the prototype supports many; one household in v1 cuts the scope-toggle and settlement surface considerably
- Stripe billing for web entitlements — arrives with the web app

**Cut outright**
- Tax pack and all tax framing — anything computing a liability is regulated advice; users can already flag and export through general export, so the framing buys risk without buying capability
- Licence keys, seats and device transfer — RevenueCat anchors entitlement to the Apple ID or Google account, and the stores already handle device coverage, Family Sharing and restore; the prototype's entire licence surface is orphaned by that choice
- Local-first architecture — deliberately rejected in favour of cloud-first; see Key Decisions
- `expo-sqlite` and Drizzle ORM — removed with local-first
- Expo Router `unstable-native-tabs` — would replace the bespoke tab bar with the platform's, losing the brand
- Live security prices from free APIs — every free tier checked is licensed for internal use only; displaying prices to app users needs a redistribution licence. Prices arrive in 1.1 through the brokerage link or a properly licensed feed
- Session replay in production — PostHog masks text inputs and images by default but not displayed text, so balances and payees would be recorded

## Context

**The prototype is the specification.** `FincWin United.dc.html` is dense but it answers more questions than it raises. Its section markers map one-to-one onto feature areas. It must be read in full before planning. Match its visual output pixel-for-pixel; do not port its internal structure — it uses a declarative DSL (`sc-if`, `sc-for`, `{{ }}`) that has no place in the real app.

**`BUILD-PROMPT.md` is the idea document** and its decisions are settled except where this file overrides them. It carries the extracted design system, the stack rationale, the Decide engine function-by-function, the architecture, the testing strategy and the store-compliance analysis.

**Copy is part of the design.** The prototype's microcopy is unusually good and doing real explanatory work — *"Pick the currency you get paid in, not the one you spend most in — it is the one your head does maths in."* Port the strings verbatim into a typed i18n catalogue from day one, keeping the British-ish spelling and typographic apostrophes.

**The exception is storage and privacy copy.** Roughly fifteen strings assert on-device-only storage — *"Saves as you go, nothing leaves the phone"* (5365), *"Data stays on this device"* (5837), *"Nothing is sent anywhere"* (3310), *"Worked out on this device"* (6303), and *"Signed out. Your figures stay on this device"* (2945), which assumes a signed-out state that no longer exists. Cloud-first makes all of them false. They get rewritten in the same voice, leaning on what is actually true: RLS-isolated, encrypted in transit and at rest, exportable, deletable. These strings also feed the App Privacy questionnaire and the Play Data safety form, where an inaccurate answer is a rejection.

**Three porting corrections, all the same bug.** The prototype's engine logic reads names and seed ids where it should read explicit fields. Fix all three while porting, not after:

1. **Integer money throughout.** Floating-point drift in an amortisation loop over 600 months is real, and this engine tells people whether they can afford a car.
2. **`dsecured` must read a `secured` boolean on the loan record**, not regex a name. `forester` in the regex is a seed-data artefact. Keep the regex only as an import-time default.
3. **The health score must read an `isEmergencyFund` flag on a goal**, not the seed id `s1`. The formula itself (line 4922) is fully specified and deterministic — savings rate capped at 30% earns 35 points, emergency cover capped at 3 months earns 30, debt-to-income 20, unpaid ratio 15, banded at 75 Strong / 55 Steady / below Tight — and belongs in `engine/health/`.

**The undo stack needs redesigning before it is built.** The prototype pushes full state snapshots onto a 12-deep stack (line 3847). That is free when state is a local object and impossible when the server is authoritative and household rows sync live — the write is already accepted and another member may already have seen it. Undo becomes compensating writes: every mutation defines its inverse, which is pure logic and belongs in `engine/`.

**The Pro tier is hollowed out by the architecture decision.** The paywall (line 5299) sells five things: 12-month forecast, Coach, CSV and bank import, cloud sync across devices, and tax pack export. Cloud sync is now mandatory for everyone and tax framing is cut, so two of the five are gone before pricing is even discussed.

**The Coach is an undeclared LLM feature.** It takes free text, has five modes, and carries a daily quota — `PRO · 4 OF 20 TODAY` at line 5314. A per-day cap only exists where calls cost money. Its own copy claims nothing leaves the device, which would mean on-device inference. It is also the feature that most invites Apple 3.2.1 scrutiny, since a coach answering money questions is precisely the advice framing to avoid.

**The prototype already models the chosen data layer.** A `Work offline` toggle, a write queue (*"offline · 3 changes queued"*) and a sync stamp (*"synced 2 minutes ago"*) exist at lines 5329 and 5364. Cached-read-plus-queued-writes is designed in, not a retrofit.

**Design reference:** designed at 402 × 874 (iPhone 16 Pro logical size). The available test device is an iPhone XR at 414 × 896 with a notch rather than a Dynamic Island — which is an advantage, since it forces the safe-area flexibility the brief demands from the first build rather than the last.

## Constraints

- **Development environment**: Windows 11, no Mac, no Xcode — the single most important architectural driver. Expo managed with config plugins plus EAS is the only path that builds, signs and submits an iOS app from Windows. Expo Go is unusable because Plaid, RevenueCat, Face ID and biometrics all need custom native code; use a development build throughout.
- **iOS test device**: an iPhone XR. Covers Face ID, real haptics and real push, none of which a simulator reproduces. But it is A12, so it tops out at iOS 18 — anything iOS 26-specific needs EAS Simulator. Mostly moot, since native tabs and Liquid Glass are already ruled out.
- **Apple Developer Program**: not yet enrolled. Enrol **as an organisation under the user's company**, not as an individual — Guideline 5.1.1(ix) says apps in financial services, or that require sensitive user information, *"should be submitted by a legal entity that provides the services, and not by an individual developer."* Organisation enrolment needs a D-U-N-S number, which can take around 28 days to issue if the company doesn't already have one; the same number also serves Google Play's organisation account. Checking for it is a day-one task, ahead of any code.
- **App Review access**: an account is required and the only sign-in methods are Apple and Google, but Guideline 2.1 requires demo account details for any app with a login. A sign-in path restricted to allow-listed review accounts, pre-filled with sample data, is therefore a launch requirement rather than a convenience.
- **Tech stack**: settled in `BUILD-PROMPT.md` §3 as amended by Key Decisions below. Do not re-derive it.
- **Architecture**: nothing in `engine/` may import from `db/`, `state/`, `services/`, `ui/` or `react`. This is the most important line in the codebase — it is what lets the financial maths be tested exhaustively and reviewed in isolation. Enforced by lint and by CI.
- **Money**: integer minor units everywhere, with explicit rounding rules. Never floats.
- **Quality gate**: an engine change that drops branch coverage below threshold fails CI. No exceptions.
- **Compliance**: positioned as personal record-keeping and planning. Never "advice", "recommendation" or "you should" in verdict copy — hold the prototype's declarative-not-prescriptive voice. In-app account deletion is mandatory and must actually purge. Sign in with Apple is mandatory because Google sign-in is offered.
- **Compliance caveat — re-verify, do not assume**: the brief's positioning rests on Guideline 3.2.1(viii) applying *"where the app performs those services."* Fetched live on 2026-09-21, the current text no longer carries that qualifier. Dozens of budgeting apps ship as non-institution developers, so practical risk looks low — but the argument must be re-checked against live guideline text at the Compliance phase rather than treated as settled. Separately, the brief miscites the 36% APR / 60-day loan cap as 3.2.1(viii); it is **3.2.2(ix)**, and it does not apply here regardless.
- **Submission hygiene outranks content framing**: the one detailed 2026 rejection account found in this category failed on mechanical IAP issues — subscription not attached to the version (2.1(b)), missing disclosure copy (3.1.2(c)), a bad support URL (1.5) — and then again because the demo video showed Restore Purchases rather than a fresh purchase. Directional rather than proven, but it should shape where the Compliance phase spends its effort.
- **EAS Simulator is still waitlist-only** as of September 2026, with no GA announcement. Plan the iOS loop around the iPhone XR plus the Android emulator as the *certain* path; treat the simulator as a bonus if access arrives.
- **Data residency and privacy**: global from day one, built to GDPR as the standard everywhere — right to erasure, data portability, DPA.
- **Design fidelity**: the §2 token set is the complete palette and type scale. No gradients, no extra shadows, no additional colours, no substituted icon set. The prototype's restraint is deliberate.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloud-first with Supabase as source of truth, rejecting local-first | Unified cross-platform footprint across web, iOS and Android; eliminates anonymous-to-authenticated migration and conflict resolution; anchors identity for cross-platform entitlements | — Pending |
| Account required at onboarding, via Sign in with Apple and Google | One-tap standards neutralise traditional signup friction; a single cloud source of truth from second one. Sign in with Apple is mandatory anyway once Google is offered | — Pending |
| Passkeys dropped, not deferred as a build task | Research verified `signInWithPasskey()` is browser-only on the JS SDK; native support exists only for Flutter and Swift. Building custom WebAuthn or adopting Clerk are both disproportionate for one method when Apple and Google already deliver one-tap | — Pending |
| **Expo SDK 57**, not SDK 55 as the brief states | SDK 55 is two majors behind as of September 2026; 58 is preview-only. Verified live against npm: `expo@57.0.24`, `expo-router@57.0.22` — Router now tracks the SDK number rather than its own v7 scheme | — Pending |
| Supabase provisioning, Auth and a household-of-one RLS model move into Foundation | With no local database, every phase from Record onward is hard-blocked on an authenticated, RLS-protected connection. Household then shrinks to genuinely new work: multi-member semantics, invite RPCs and Realtime conflict handling | — Pending |
| Client-generated UUID primary keys, plus one integer `version` column | The optimistic local row *is* the final row, so there is no server-id swap to reconcile — only a status flipping pending to synced. One version column then backs optimistic concurrency, Realtime reconciliation and undo, collapsing three mechanisms into one | — Pending |
| `engine/money/` hand-rolled, no third-party money library | The operations needed are narrow, and `dinero.js` has an ambiguous alpha-versus-latest tag split with no activity since March 2026. A dependency sits badly against a near-100% branch coverage requirement | — Pending |
| Engine boundary enforced by two tools, not one | Bare `no-restricted-imports` — which the brief specifies — catches only direct imports. An engine file importing a helper that itself imports React passes straight through. `eslint-plugin-boundaries` for feedback, `dependency-cruiser` as the CI gate | — Pending |
| Recurring transactions added to v1, in Record | `dmoney`'s income steadiness and the bills-due alert both need them, and with no bank feed there is nothing to infer recurrence from | — Pending |
| PostHog for product analytics, opt-in, EU host | Measures the two risks research flagged — manual-entry drop-off and onboarding misclassification. Opt-in is the defensible position under the GDPR-everywhere standard. Identity is the Supabase UUID only | — Pending |
| Session replay off in v1 | Replay records displayed text by default, which here means balances, amounts and payee names. A `<Money>` masking component could make it safe later; no need justifies the risk yet | — Pending |
| Analytics events carry no money | A typed event catalogue makes amounts, payees, account names and free text unrepresentable, rather than relying on discipline | — Pending |
| Feature flags never control paid access | Flags are evaluated on the device. RevenueCat stays the only source of entitlement | — Pending |
| open.er-api as FX fallback, with staleness and plausibility checks | Stored per-transaction rates mean an outage never alters history, but volatile currencies can move 40–50% overnight during one. The larger risk is a refresh failing silently, which only monitoring catches. Costs: in-app attribution, and its no-redistribution clause | — Pending |
| Investments valued by hand with an as-of date | Holdings in the prototype are values, not share counts, and many account types (property, private equity, pensions) have no ticker. Free price APIs forbid display to end users | — Pending |
| Enrol with Apple and Google as an organisation, under the company | Guideline 5.1.1(ix) expects financial-services apps, and apps requiring sensitive information, from a legal entity. One D-U-N-S number serves both stores | — Pending |
| Production Supabase on Pro from the first real user data | Free projects pause after a week of inactivity and have no backups. With cloud-first, Supabase holds the only copy of every user's finances | — Pending |
| Supabase Cloud Pro for production; not self-hosted, not the free tier | Self-hosted Supabase has no managed backups or point-in-time recovery, runs one project per install, is community-supported, and makes the operator responsible for patching, backups and uptime for the only copy of users' finances. The free tier pauses after a week and has no backups. The self-hosted instance stays as an exit route and restore-test target, since Supabase is open source | — Pending |
| Local development through the Supabase CLI | Runs the full stack in Docker at no cost, never pauses, and keeps migrations in git. The single production project covers on-device testing, since a phone cannot easily reach the laptop | — Pending |
| One Supabase project, migrations in git | There is a single project, Fincwin United (us-west-2), and it is production. The safety property is the migration path, not a second project: schema reaches the database only through supabase/migrations/*.sql in git, guarded by the supabase:preflight ref check. No dashboard SQL edits to schema, ever | — Pending |
| Migrations stay compatible with the oldest supported app version, backed by a minimum-version gate | Users cannot be forced to update, and a cloud-first app talks to one shared schema | — Pending |
| Session and offline cache both encrypted, key in secure storage | Resolves the cache-encryption question. Expo's secure storage caps values at 2048 bytes, so data is encrypted with a key stored there — the pattern Supabase's own Expo guide uses for the session | — Pending |
| Currency decimal places from ISO 4217 | Integer minor units only work if the exponent is right: 0 for JPY, 3 for KWD. Assuming two decimals corrupts amounts by 100× or 10× | — Pending |
| Transactions store local date plus time zone | A transaction happens on a calendar day. UTC timestamps move late-evening entries into the wrong month and drift recurring schedules across clock changes | — Pending |
| CSV import moved early, into Record | It is an activation feature, not a utility: Decide needs months of history to say anything useful, and manual entry is the friction that causes churn before users accumulate any | — Pending |
| Supabase-direct with a persisted query cache and a write queue; no SQLite, no Drizzle, no sync engine | Postgres is the schema; the same data path web inherits in 1.1. Avoids owning a bidirectional sync engine | — Pending |
| Offline tolerance via cached reads and queued writes, not local-first | A money app gets opened on planes and in basements; a blank screen there is a one-star review. The prototype already models the queue | — Pending |
| Mobile v1, web in 1.1, built platform-agnostic | Web parity is a real architectural phase, not a build flag — `expo-sqlite`, `expo-local-authentication`, FlashList and `@gorhom/bottom-sheet` all have uneven web stories. Building cloud-first keeps web additive | — Pending |
| One household in v1 | Multiple households multiply the scope-toggle and settlement surface considerably for little early value | — Pending |
| Household joining by expiring invite link with a code | Mirrors the prototype's existing expiring-link pattern for household export, so it is already in the design language | — Pending |
| Supabase Realtime on household data | Household is the one place staleness actively misleads — a settlement balance that is wrong is worse than one that is slow. It is also the payoff for going cloud-first | — Pending |
| RevenueCat only; licence keys, seats and transfer cut | RevenueCat wraps StoreKit 2 and Play Billing with server-side validation and cross-platform entitlement sync; the stores already own device entitlement. Apple generally requires IAP for in-app digital unlocks | — Pending |
| Device list survives as active-session management on Supabase Auth | A genuine security feature for a finance app with mandatory accounts, and it preserves a designed screen that licensing would have deleted | — Pending |
| Undo as compensating writes rather than state snapshots | Correct under Realtime and across devices; the inverse logic is pure and testable, so it lives in `engine/` | — Pending |
| Storage and privacy copy rewritten, everything else verbatim | Cloud-first makes ~15 strings false, and they feed the App Privacy and Data safety forms where inaccuracy is a rejection | — Pending |
| Frankfurter v2 cached into Supabase via a scheduled Edge Function | 171 currencies verified live, no API key, no quota, MIT-licensed, historical lookup by date, arbitrary base free — the last two are paid features at Open Exchange Rates, Fixer and Currencylayer. Self-hostable via Docker against the Postgres already running, so the free service is never a single point of failure. **Pin v2 explicitly: v1 returns only the 30 ECB currencies and would silently exclude NGN, PKR, BDT, VND, EGP and KES** | — Pending |
| FX rates stored per transaction and per settlement, not looked up live | Rates become historical facts on the record, so past months and settled balances stay correct forever. Central-bank reference rates, not market tick data, which also keeps clear of looking like a trading app | — Pending |
| Tax framing cut entirely | Anything computing a liability is regulated advice; flag-and-export is already served by general export, so the framing buys risk without capability | — Pending |
| Decide engine built and fully tested before any Decide UI | Getting the financial maths right is the whole product; the UI is the part that can be iterated. The phase's deliverable is a green suite and a coverage report | — Pending |
| Roadmap follows `BUILD-PROMPT.md` §8 shape, adjusted for cloud-first | Each phase ends shippable and demoable | — Pending |

### Open — blocking decisions for the tiers phase

| Question | Why it is open |
|----------|----------------|
| **Which of the ~50 features are Free and which are Pro?** | `Component.FEATS` carries levels but not price tiers, and the architecture decision removed cloud sync and tax export from the paywall's five rows — leaving forecast, Coach and import. Needs a pricing decision before any gating is implemented. Everything built before then stays tier-agnostic behind a single entitlement check |
| **Is the Coach a real LLM, and on what terms?** | Decided in principle as a real LLM behind a Supabase Edge Function so keys never ship in the client, with the quota as real metering. Still needs prompt design, cost modelling, abuse limits, and non-advisory output framing that survives Apple 3.2.1 review |

### Deferred to phase discussion

| Question | Where it lands |
|----------|----------------|
| Does the Realtime reconciliation state machine actually hold? | The optimistic-update / write-queue / Realtime-echo design is synthesised from documented primitives, not a documented Supabase recipe. Needs a dedicated spike in the Household phase — two simulated clients, one taken offline mid-edit — before it is trusted |
| What happens when a household settlement expires unresolved? | The prototype specifies an expiry window but not the outcome. No competitor precedent to borrow from, so it is a design decision for the Household phase |
| Can PostHog error tracking replace Sentry? | Not verified for React Native. Evaluate in Phase 0; one fewer SDK is worth having if it holds up |
| How is prescriptive language kept out of Coach output? | Prompt instructions alone do not reliably control LLM output. A server-side post-filter against "should", "recommend" and similar is the suggested mitigation — scoped with the rest of the Coach decision in Tiers |

## Running Costs

Verified 2026-09-22 against each provider's pricing page.

| Item | Cost | When it starts |
|---|---|---|
| Apple Developer Program | $99 a year | Enrolment, Phase 0 |
| Google Play Console | $25 once | Registration, by Phase 9 |
| D-U-N-S number | Free through Apple's lookup | Phase 0 |
| Supabase — development | Free (2 active projects; pauses after a week idle) | Phase 0 |
| Supabase — production | $25 a month (Pro, one Micro compute, daily backups kept 7 days) | Before first real user data, Phase 2 |
| Supabase point-in-time recovery | $100 a month per 7 days of retention | Optional, when user numbers justify it |
| EAS | Free: 15 Android + 15 iOS builds a month, low-priority queue, updates to 1,000 users. Starter $19 a month (+ usage) for the fast queue and 3,000 update users | Free from Phase 0; Starter when build waits start costing time |
| RevenueCat | Free to $2,500 monthly revenue, then 1% of all gross revenue | Phase 9 |
| PostHog | Free: 1M events, 1M flag requests, 100K exceptions a month | Phase 0 |
| Sentry | Not yet priced — may be replaced by PostHog error tracking | Phase 0 decision |
| Frankfurter, open.er-api | Free | Phase 0–1 |
| Coach LLM | Unknown until the Phase 9 decision — per-token, metered by the daily quota | Phase 9 |
| Domain, website and domain email | Not yet priced | **Phase 0 — Apple organisation enrolment requires a functional public website and a work email on the company's domain** |

**Fixed floor before revenue:** about $99 a year plus $25 once, while everything else stays free. Once real users arrive the floor becomes roughly $25 a month more for Supabase Pro, with EAS Starter likely.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-22 after gap review — organisation enrolment, review access, backups and environments, version compatibility, encryption, currency and date correctness, running costs*
