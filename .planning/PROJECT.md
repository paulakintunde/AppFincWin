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
- [ ] Expo SDK 55 project on TypeScript strict, Expo Router v7, building to Android emulator and to iOS via EAS
- [ ] `engine/` purity boundary enforced by ESLint `no-restricted-imports` and by CI
- [ ] Design tokens ported exactly: the §2 palette, 4 selectable accents, 4 selectable font pairings, live switching without reload
- [ ] Reduced-motion honoured via `AccessibilityInfo.isReduceMotionEnabled()`

**Money core**
- [ ] `Money` type on integer minor units — no floats, no `parseFloat` on user input, anywhere
- [ ] Multi-currency with FX rates cached from Frankfurter v2, rate stored per transaction and per settlement
- [ ] Supabase Postgres schema with RLS, normalised from the prototype's flat key dump

**Record**
- [ ] User can log income and expenses against accounts, categories and a date
- [ ] Activity list with month switcher, search, filter, bulk select and bulk delete
- [ ] Toast with inline Undo, 12 deep, implemented as compensating writes

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
- [ ] Investments with holdings, 14 account types, cost-basis lots, per-holding history, gain/loss
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
- [ ] RevenueCat entitlements and the prototype's own Pro gate sheet design

**System**
- [ ] Account required at onboarding via Sign in with Apple, Google and passkeys
- [ ] Active-session list showing where the user is signed in, with a this-device marker and sign-out-everywhere
- [ ] Alerts: five kinds, amount thresholds, instant or digest, quiet hours, alert log
- [ ] Face ID / biometrics and PIN lock screen
- [ ] Offline tolerance: cached reads, queued writes flushed on reconnect
- [ ] CSV-style import for expenses, income, goals, debt, investments and accounts
- [ ] Month archive with restore, CSV export, and in-app account deletion that actually purges

**Compliance & release**
- [ ] Privacy manifest, App Privacy answers, Play Financial features declaration, Data safety form
- [ ] Privacy policy and terms at real URLs; not-financial-advice disclaimer present and findable
- [ ] Store assets for both stores; TestFlight and internal testing builds exercised on real devices

### Out of Scope

**Deferred to v1.1**
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
- **Apple Developer Program**: not yet enrolled. Blocks TestFlight and submission entirely, and enrolment takes days to weeks. Starting it is a day-one task in phase 0, ahead of any code.
- **Tech stack**: settled in `BUILD-PROMPT.md` §3 as amended by Key Decisions below. Do not re-derive it.
- **Architecture**: nothing in `engine/` may import from `db/`, `state/`, `services/`, `ui/` or `react`. This is the most important line in the codebase — it is what lets the financial maths be tested exhaustively and reviewed in isolation. Enforced by lint and by CI.
- **Money**: integer minor units everywhere, with explicit rounding rules. Never floats.
- **Quality gate**: an engine change that drops branch coverage below threshold fails CI. No exceptions.
- **Compliance**: positioned as personal record-keeping and planning. Never "advice", "recommendation" or "you should" in verdict copy — hold the prototype's declarative-not-prescriptive voice. In-app account deletion is mandatory and must actually purge. Sign in with Apple is mandatory because Google sign-in is offered.
- **Data residency and privacy**: global from day one, built to GDPR as the standard everywhere — right to erasure, data portability, DPA.
- **Design fidelity**: the §2 token set is the complete palette and type scale. No gradients, no extra shadows, no additional colours, no substituted icon set. The prototype's restraint is deliberate.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloud-first with Supabase as source of truth, rejecting local-first | Unified cross-platform footprint across web, iOS and Android; eliminates anonymous-to-authenticated migration and conflict resolution; anchors identity for cross-platform entitlements | — Pending |
| Account required at onboarding, via Sign in with Apple, Google and passkeys | One-tap standards neutralise traditional signup friction; a single cloud source of truth from second one | — Pending |
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
| What sits in the on-device cache, and does it need encrypting? | Reframed by the cloud-first decision — no longer a SQLCipher-versus-platform-encryption question about a local database, but a narrower one about cached financial data and `expo-secure-store` for tokens. Also determines the `ITSAppUsesNonExemptEncryption` answer |

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
*Last updated: 2026-09-21 after initialization*
