# Requirements: FincWin United

**Defined:** 2026-09-21
**Core Value:** The Decide tab must give a trustworthy answer — a verdict computed from the user's own logged months, not a survey.

## v1 Requirements

Requirements for initial release. Each maps to exactly one roadmap phase.

### Platform & Foundation

- [ ] **FND-01**: Project builds and runs on Expo SDK 57 with TypeScript `strict: true` and Expo Router pinned to `~57.x`
- [ ] **FND-02**: Developer can run the app on a local Android emulator with a development build
- [ ] **FND-03**: Developer can install a signed iOS development build on a physical device via EAS Build, from Windows
- [ ] **FND-04**: CI fails any change where a file under `engine/` imports from `db/`, `state/`, `services/`, `ui/` or `react`, including transitively
- [ ] **FND-05**: CI fails any change that drops `engine/` branch coverage below the agreed threshold
- [ ] **FND-06**: App applies any of 4 accent colours and any of 4 font pairings live, without a reload
- [ ] **FND-07**: All animations collapse to near-zero duration when the OS reports reduce-motion enabled
- [ ] **FND-08**: Apple Developer Program enrolment is submitted before any store-dependent work begins

### Environment & Credentials

Every external dependency is provisioned to a working state, or explicitly deferred with a recorded blocker and a phase it must land by. No secret is ever committed to source.

- [ ] **ENV-01**: All runtime configuration is read from environment variables and EAS secrets, with a committed `.env.example` documenting every key and its purpose
- [ ] **ENV-02**: `.env` and any local secret file are gitignored, and CI fails if a credential pattern appears in a tracked file
- [ ] **ENV-03**: Supabase project is provisioned, with its URL and publishable key wired in and a connection verified from the running app
- [ ] **ENV-04**: Supabase service-role key is stored as an EAS secret and used only by Edge Functions, never shipped to the client
- [ ] **ENV-05**: EAS project is initialised with development, preview and production build profiles
- [ ] **ENV-06**: Google OAuth client IDs exist for iOS, Android and Web, and Google Sign-In completes end to end
- [ ] **ENV-07**: Sign in with Apple is configured with its Service ID and key, and completes end to end — *deferrable, blocked on ENV-10*
- [ ] **ENV-08**: Frankfurter rate-refresh Edge Function is deployed and populating the `fx_rates` table on schedule
- [ ] **ENV-09**: A dependency status register is maintained listing every external service as provisioned, pending or deferred, with its blocker and the phase it must land by
- [ ] **ENV-10**: Apple Developer Program membership is active — *external clock, days to weeks; gates ENV-07, iOS device builds, TestFlight and submission*
- [ ] **ENV-11**: Google Play Console developer account is active and an app entry exists — *deferrable to Phase 11*
- [ ] **ENV-12**: RevenueCat project exists with iOS and Android API keys, and products are configured in both stores — *deferrable to Phase 9; store products depend on ENV-10 and ENV-11*
- [ ] **ENV-13**: Sentry project exists and its DSN is wired in — *deferrable; non-blocking for every other phase*
- [ ] **ENV-14**: PostHog project exists on the EU host, with its project key wired in through the environment

### Analytics

Product analytics exist to measure the two risks research flagged — manual-entry drop-off and onboarding misclassification — without ever observing a user's money.

- [ ] **ANL-01**: App sends product analytics to PostHog's EU host, identifying users only by their Supabase UUID, never by email or name
- [ ] **ANL-02**: No analytics event leaves the device until the user has opted in, and the user can change that choice in settings at any time
- [ ] **ANL-03**: Every event is drawn from a typed catalogue whose properties cannot carry amounts, payee names, account names or free text
- [ ] **ANL-04**: Session replay is excluded from production builds
- [ ] **ANL-05**: Drop-off from signup through first entry and first CSV import is measurable
- [ ] **ANL-06**: Checks started, completed, their verdict state and decisions recorded are measurable, with no amounts attached
- [ ] **ANL-07**: Onboarding asks for analytics consent once, in plain language
- [ ] **ANL-08**: The level onboarding assigns, and any later change the user makes to it, is measurable

### Account & Access

- [ ] **ACC-01**: User can create an account with Sign in with Apple
- [ ] **ACC-02**: User can create an account with Google Sign-In
- [ ] **ACC-03**: User's name and email from Sign in with Apple are captured on first authorization and persisted immediately
- [ ] **ACC-04**: A new account is auto-provisioned with a household-of-one and its RLS policies, with no setup step visible to the user
- [ ] **ACC-05**: User stays signed in across app restarts
- [ ] **ACC-06**: User can see every device where their account is signed in, with the current device marked
- [ ] **ACC-07**: User can sign out of one listed device, or all devices at once
- [ ] **ACC-08**: User can unlock the app with Face ID, Touch ID or Android biometrics
- [ ] **ACC-09**: User can set and use a PIN as an alternative to biometrics
- [ ] **ACC-10**: User can delete their account in-app, and doing so purges their data from Supabase

### Money & Data Integrity

- [ ] **MON-01**: All monetary values are stored and computed as integer minor units, with no float arithmetic on any path
- [ ] **MON-02**: User input of an amount is parsed to minor units without passing through `parseFloat`
- [ ] **MON-03**: Splitting an amount across members always produces shares that sum exactly to the original, using largest-remainder rounding
- [ ] **MON-04**: User can set a home currency from the supported list or add a custom currency
- [ ] **MON-05**: A transaction in a non-home currency records the FX rate applied at the time it was written
- [ ] **MON-06**: FX rates refresh daily from Frankfurter v2 into the project's own store, and the app reads only that store
- [ ] **MON-07**: A rate's own publication date is visible wherever a converted figure is shown, rather than implied to be current
- [ ] **MON-08**: Every record carries a client-generated UUID primary key assigned before the write leaves the device
- [ ] **MON-09**: Every mutable record carries an integer version that increments server-side on write
- [ ] **MON-10**: An alert fires when any currency's latest stored rate is older than its staleness limit
- [ ] **MON-11**: A day-on-day rate move beyond the plausibility threshold (about 10%) is held back until a second source confirms it
- [ ] **MON-12**: When Frankfurter cannot be reached, rates refresh from open.er-api instead, and its required attribution is shown in the app

### Offline & Sync

- [ ] **SYN-01**: User can browse previously loaded data with no network connection
- [ ] **SYN-02**: User can create and edit records with no network connection, and those writes flush automatically on reconnect
- [ ] **SYN-03**: A queued write that is retried does not produce a duplicate record
- [ ] **SYN-04**: The write queue survives a force-quit and resumes on next launch
- [ ] **SYN-05**: The write queue is bounded, and the user is told when it cannot grow further
- [ ] **SYN-06**: User sees whether the app is offline and how many changes are waiting

### Recording

- [ ] **REC-01**: User can log an expense with amount, category, account and date
- [ ] **REC-02**: User can log income with amount, category, account and date
- [ ] **REC-03**: User can edit any transaction they created
- [ ] **REC-04**: User can delete a transaction
- [ ] **REC-05**: User can mark a transaction as recurring on a schedule, and it generates entries without re-typing
- [ ] **REC-06**: User can skip or end a single occurrence of a recurring transaction without deleting the series
- [ ] **REC-07**: User can create, rename and colour their own categories beyond the built-in set
- [ ] **REC-08**: User can create accounts and see a balance per account
- [ ] **REC-09**: User can import transactions from a CSV file during onboarding or later
- [ ] **REC-10**: Import shows what will be created and lets the user correct column mapping before committing
- [ ] **REC-11**: User can undo any of their last 12 changes from the toast or the history screen
- [ ] **REC-12**: Undo is refused with an explanation when another household member has since changed the same record

### Activity

- [ ] **ACT-01**: User can see all transactions for a month in a list
- [ ] **ACT-02**: User can switch months, including into archived months
- [ ] **ACT-03**: User can search transactions across all months
- [ ] **ACT-04**: User can filter the list by category, account and amount
- [ ] **ACT-05**: User can select multiple transactions and delete them in one action
- [ ] **ACT-06**: User can view the month as a week breakdown, a split view, a balance view and a calendar

### Shell & Navigation

- [ ] **NAV-01**: User can move between five tabs, with the direction of the slide matching the direction of travel
- [ ] **NAV-02**: User can go back through up to 8 previous screens, across tabs and detail screens
- [ ] **NAV-03**: Detail screens push in over the current screen and dismiss back to it
- [ ] **NAV-04**: Bottom sheets can be dismissed by dragging them down
- [ ] **NAV-05**: The FAB changes its action to match the current tab, and hides during sheets, bulk select, onboarding and step flows
- [ ] **NAV-06**: The app is navigable and readable with a screen reader on both platforms

### Decide — Engine

- [ ] **DEC-01**: Engine computes an amortised monthly payment for a principal, APR and term, including the zero-rate case
- [ ] **DEC-02**: Engine computes future value of a monthly contribution plus a seed, including the zero-rate case
- [ ] **DEC-03**: Engine simulates minimum payments on a revolving balance and correctly reports when the balance never clears
- [ ] **DEC-04**: Engine resolves any of four payment methods — paid in full, deposit plus loan, instalment plan, credit card — into a comparable plan
- [ ] **DEC-05**: Engine flags a plan as incomplete when its terms are not yet specified
- [ ] **DEC-06**: Engine returns a verdict of fits, adjust, no, or missing, with up to five warnings ordered by shortfall size
- [ ] **DEC-07**: Engine derives income steadiness from the coefficient of variation across logged months, not from a user-stated answer
- [ ] **DEC-08**: Engine computes a household's share of a cost under the active split rule
- [ ] **DEC-09**: Engine finds the largest affordable price by bisection, and handles both "nothing is affordable" and "the full price already fits"
- [ ] **DEC-10**: Engine determines card eligibility for an item, distinguishing blocked, capped and permitted
- [ ] **DEC-11**: Engine decides whether a debt is secured by reading a field on the record, not by matching its name
- [ ] **DEC-12**: Engine runs with no React, no I/O and no database access, taking a snapshot in and returning a verdict out

### Decide — Experience

- [ ] **DCU-01**: User can get a cash answer from an item and a price without entering a multi-step flow
- [ ] **DCU-02**: User can work through the five steps — item, price and payment, impact, alternatives, decision
- [ ] **DCU-03**: User can leave a check open and return to it with its verdict recomputed against current figures
- [ ] **DCU-04**: User can abandon an open check
- [ ] **DCU-05**: User sees four alternatives — as planned, cheaper, wait and save, skip entirely — each with its outcome
- [ ] **DCU-06**: An alternative is suppressed and labelled when the money it assumes is not genuinely spare
- [ ] **DCU-07**: User can record a decision and later compare what they estimated against what actually happened
- [ ] **DCU-08**: Date selection refuses past dates and offers quick offsets
- [ ] **DCU-09**: No verdict copy uses "advice", "recommendation" or "you should"

### Grow

- [ ] **GRW-01**: User can create a savings goal with a target amount, or an open-ended one
- [ ] **GRW-02**: User can flag exactly one goal as their emergency fund
- [ ] **GRW-03**: User can set an automatic contribution to a goal
- [ ] **GRW-04**: User can record investment holdings across the supported account types
- [ ] **GRW-05**: User can record cost-basis lots — buys, sells, dividends and fees — against a holding
- [ ] **GRW-06**: User can see gain or loss per holding and in total
- [ ] **GRW-07**: User can record loans and revolving credit with balance, rate and minimum
- [ ] **GRW-08**: User can compare avalanche and snowball payoff strategies with an optional extra payment
- [ ] **GRW-09**: User can see a projected payoff date and total interest for their chosen strategy
- [ ] **GRW-10**: User records a holding's market value by hand, and its as-of date is shown wherever that value appears

### Insights

- [ ] **INS-01**: User can see net worth over time with a selectable range
- [ ] **INS-02**: User can see money in and money out per month as bars
- [ ] **INS-03**: User can switch between bars and a comparison mode
- [ ] **INS-04**: User can see spending broken down by category for a period
- [ ] **INS-05**: User can compare a month against the previous one
- [ ] **INS-06**: User can see a financial health score with the figures behind it

### Household

- [ ] **HH-01**: User can invite another person with an expiring link and code
- [ ] **HH-02**: An invited person joins by signing in, and gains access only to that household's shared records
- [ ] **HH-03**: User can assign members a colour, a role and a weight, including custom roles
- [ ] **HH-04**: User can mark a transaction as shared and have it split by the active rule
- [ ] **HH-05**: User can choose a split rule per household: even, by weight, by amount, or mine only
- [ ] **HH-06**: User can set a default split rule per category
- [ ] **HH-07**: User can see what each member owes or is owed
- [ ] **HH-08**: User can settle up with a member and have the matching record appear on their side
- [ ] **HH-09**: User can toggle between their own figures and the household's
- [ ] **HH-10**: User can hide real names from other members, falling back to colour names
- [ ] **HH-11**: A shared record created by one member appears on another member's device without a manual refresh
- [ ] **HH-12**: User can share a read-only household summary as a link that expires

### Tiers & Onboarding

- [ ] **TIER-01**: New user answers an 11-question flow that sets a starting feature level
- [ ] **TIER-02**: Features appear or stay hidden according to the current level
- [ ] **TIER-03**: User can change their level at any time after onboarding
- [ ] **TIER-04**: User can re-run the onboarding flow
- [ ] **TIER-05**: User is offered a specific hidden feature in context, at the moment it would have helped
- [ ] **TIER-06**: Household features are governed by whether the user shares money, independently of level
- [ ] **TIER-07**: User can purchase a subscription, and entitlement is recognised across their devices
- [ ] **TIER-08**: User can restore a previous purchase
- [ ] **TIER-09**: User is told which specific feature a paywall is gating and why
- [ ] **TIER-10**: User can cancel their subscription through a path no harder to find than account deletion

### Alerts

- [ ] **ALR-01**: User can enable alerts for bills due, over cap, goal reached, large transactions and low balance
- [ ] **ALR-02**: User can set an amount threshold per alert kind
- [ ] **ALR-03**: User can choose instant alerts or a digest
- [ ] **ALR-04**: User can set quiet hours during which no alert is delivered
- [ ] **ALR-05**: User can see a log of alerts already raised

### Data Management

- [ ] **DAT-01**: User can archive a month and restore it later
- [ ] **DAT-02**: User can export their data as CSV
- [ ] **DAT-03**: User can import goals, debts, investments and accounts from CSV
- [ ] **DAT-04**: Deleting the account offers a clearly-labelled choice about any locally cached data

### Design Fidelity

- [ ] **DSG-01**: Rendered screens match the prototype's screenshots within tolerance on both platforms
- [ ] **DSG-02**: Colours used are drawn only from the documented token set
- [ ] **DSG-03**: Layout adapts to device safe-area insets rather than assuming a fixed height
- [ ] **DSG-04**: All user-facing strings are served from a typed i18n catalogue
- [ ] **DSG-05**: No user-facing string claims data stays on the device or is not sent anywhere

### Compliance & Release

- [ ] **CMP-01**: A findable disclaimer states the app is not financial advice and involves no institution
- [ ] **CMP-02**: The App Privacy questionnaire is completed and matches actual data handling
- [ ] **CMP-03**: The Play Data safety form is completed and matches the privacy policy
- [ ] **CMP-04**: The Play Financial features declaration is filed covering the full v1 feature set, before first internal-testing upload
- [ ] **CMP-05**: `PrivacyInfo.xcprivacy` is present with required-reason API declarations, re-verified after every dependency bump
- [ ] **CMP-06**: Privacy policy and terms are live at real URLs
- [ ] **CMP-07**: Subscription products are correctly attached to the submitted version, with required disclosure copy present
- [ ] **CMP-08**: Store listing carries screenshots for all required device sizes and a 1024×1024 icon
- [ ] **CMP-09**: `ITSAppUsesNonExemptEncryption` is answered correctly for the shipped build
- [ ] **CMP-10**: A TestFlight build is installed and exercised on a physical iPhone, and an internal-testing build on a physical Android
- [ ] **CMP-11**: Guideline 3.2.1(viii) is re-read against live text before submission, and the positioning argument confirmed against its current wording

## v2 Requirements

Deferred to a future release. Tracked, not in the current roadmap.

### Web

- **WEB-01**: User can sign in and use the app in a browser
- **WEB-02**: Entitlements purchased on web via Stripe are recognised on mobile, and vice versa

### Feeds

- **FEED-01**: User can connect a bank account and have transactions import automatically
- **FEED-02**: User can connect a brokerage and have holdings import automatically
- **FEED-03**: User can enable round-ups from purchases into a goal
- **FEED-04**: Holdings are valued from live security prices, sourced through the brokerage link or a feed licensed for display to end users

### Analytics Expansion

- **ANLX-01**: Session replay in production, with every amount rendered through a `<Money>` component that always carries `ph-no-capture`, and a CI check that no amount renders outside it

### Widgets

- **WDG-01**: User can add an iOS home-screen and Lock Screen widget
- **WDG-02**: User can add an Android home-screen widget

### Household Expansion

- **HHX-01**: User can belong to more than one household, each with its own currency and split rule
- **HHX-02**: User can set per-account sharing granularity rather than a single name-privacy toggle

### Access

- **ACCX-01**: User can sign in with a passkey

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Tax pack, tax liability, tax categorisation | Computing a liability is regulated advice. Flag-and-export is already served by general export, so the framing buys risk without capability |
| Licence keys, seats, device transfer codes | RevenueCat anchors entitlement to the store account, and the stores already handle device coverage, Family Sharing and restore. Apple generally requires IAP for in-app digital unlocks |
| Local-first architecture, on-device database | Deliberately rejected. Cloud-first gives one source of truth, no anonymous-to-authenticated migration, and an entitlement anchor across platforms |
| `expo-sqlite`, Drizzle ORM, SQLCipher | Removed with local-first |
| Bidirectional sync engine | Not needed. Cached reads plus a write queue is sufficient and far smaller |
| Passkeys in v1 | Supabase's passkey support is browser-only on the JS SDK; native support exists for Flutter and Swift. Custom WebAuthn or adopting Clerk are both disproportionate for one method when Apple and Google are already one-tap |
| Expo Router `unstable-native-tabs` | Would replace the bespoke tab bar with the platform's, losing the brand |
| Trading, order execution, brokerage transactions | The app is a record-keeping tool. Executing anything would trigger the licensed-institution requirement |
| Lending, credit offers, APR marketing | No loans are offered. The Decide card path models a loan the user is considering elsewhere |
| Real-time market data | Central-bank reference rates only. Tick data would make it resemble a trading app |
| Live security prices from free APIs | Every free tier checked is licensed for internal or personal use only; showing prices to app users needs a separate redistribution licence. Tiingo's own pricing page confirms even its $50/month plan is internal-only |
| Session replay in production v1 | Replay masks text inputs and images by default but not displayed text, so balances, amounts and payee names would be recorded. Not worth the risk before there is a specific need |
| Feature flags controlling paid access | Flags are evaluated on the device and can be tampered with. Entitlement stays with RevenueCat; flags are for rollouts only |
| Prescriptive advice language anywhere | "Advice", "recommendation", "you should" are excluded by policy, not by preference |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 0 - Foundation | Pending |
| FND-02 | Phase 0 - Foundation | Pending |
| FND-03 | Phase 0 - Foundation | Pending |
| FND-04 | Phase 0 - Foundation | Pending |
| FND-05 | Phase 0 - Foundation | Pending |
| FND-06 | Phase 0 - Foundation | Pending |
| FND-07 | Phase 0 - Foundation | Pending |
| FND-08 | Phase 0 - Foundation | Pending |
| ENV-01 | Phase 0 - Foundation | Pending |
| ENV-02 | Phase 0 - Foundation | Pending |
| ENV-03 | Phase 0 - Foundation | Pending |
| ENV-04 | Phase 0 - Foundation | Pending |
| ENV-05 | Phase 0 - Foundation | Pending |
| ENV-06 | Phase 0 - Foundation | Pending |
| ENV-07 | Phase 0 - Foundation | Pending |
| ENV-08 | Phase 0 - Foundation | Pending |
| ENV-09 | Phase 0 - Foundation | Pending |
| ENV-10 | Phase 0 - Foundation | Pending |
| ENV-11 | Phase 11 - Compliance & Release | Pending |
| ENV-12 | Phase 9 - Tiers & Onboarding | Pending |
| ENV-13 | Phase 0 - Foundation | Pending |
| ENV-14 | Phase 0 - Foundation | Pending |
| ANL-01 | Phase 0 - Foundation | Pending |
| ANL-02 | Phase 0 - Foundation | Pending |
| ANL-03 | Phase 0 - Foundation | Pending |
| ANL-04 | Phase 0 - Foundation | Pending |
| ANL-05 | Phase 2 - Record | Pending |
| ANL-06 | Phase 5 - Decide UI | Pending |
| ANL-07 | Phase 9 - Tiers & Onboarding | Pending |
| ANL-08 | Phase 9 - Tiers & Onboarding | Pending |
| ACC-01 | Phase 0 - Foundation | Pending |
| ACC-02 | Phase 0 - Foundation | Pending |
| ACC-03 | Phase 0 - Foundation | Pending |
| ACC-04 | Phase 0 - Foundation | Pending |
| ACC-05 | Phase 0 - Foundation | Pending |
| ACC-06 | Phase 10 - System | Pending |
| ACC-07 | Phase 10 - System | Pending |
| ACC-08 | Phase 10 - System | Pending |
| ACC-09 | Phase 10 - System | Pending |
| ACC-10 | Phase 10 - System | Pending |
| MON-01 | Phase 1 - Money Core | Pending |
| MON-02 | Phase 1 - Money Core | Pending |
| MON-03 | Phase 1 - Money Core | Pending |
| MON-04 | Phase 1 - Money Core | Pending |
| MON-05 | Phase 1 - Money Core | Pending |
| MON-06 | Phase 1 - Money Core | Pending |
| MON-07 | Phase 1 - Money Core | Pending |
| MON-08 | Phase 1 - Money Core | Pending |
| MON-09 | Phase 1 - Money Core | Pending |
| MON-10 | Phase 1 - Money Core | Pending |
| MON-11 | Phase 1 - Money Core | Pending |
| MON-12 | Phase 1 - Money Core | Pending |
| SYN-01 | Phase 1 - Money Core | Pending |
| SYN-02 | Phase 1 - Money Core | Pending |
| SYN-03 | Phase 10 - System | Pending |
| SYN-04 | Phase 10 - System | Pending |
| SYN-05 | Phase 10 - System | Pending |
| SYN-06 | Phase 1 - Money Core | Pending |
| REC-01 | Phase 2 - Record | Pending |
| REC-02 | Phase 2 - Record | Pending |
| REC-03 | Phase 2 - Record | Pending |
| REC-04 | Phase 2 - Record | Pending |
| REC-05 | Phase 2 - Record | Pending |
| REC-06 | Phase 2 - Record | Pending |
| REC-07 | Phase 2 - Record | Pending |
| REC-08 | Phase 2 - Record | Pending |
| REC-09 | Phase 2 - Record | Pending |
| REC-10 | Phase 2 - Record | Pending |
| REC-11 | Phase 2 - Record | Pending |
| REC-12 | Phase 2 - Record | Pending |
| ACT-01 | Phase 2 - Record | Pending |
| ACT-02 | Phase 2 - Record | Pending |
| ACT-03 | Phase 2 - Record | Pending |
| ACT-04 | Phase 2 - Record | Pending |
| ACT-05 | Phase 2 - Record | Pending |
| ACT-06 | Phase 7 - Insights | Pending |
| NAV-01 | Phase 3 - Shell | Pending |
| NAV-02 | Phase 3 - Shell | Pending |
| NAV-03 | Phase 3 - Shell | Pending |
| NAV-04 | Phase 3 - Shell | Pending |
| NAV-05 | Phase 3 - Shell | Pending |
| NAV-06 | Phase 3 - Shell | Pending |
| DEC-01 | Phase 4 - Decide Engine | Pending |
| DEC-02 | Phase 4 - Decide Engine | Pending |
| DEC-03 | Phase 4 - Decide Engine | Pending |
| DEC-04 | Phase 4 - Decide Engine | Pending |
| DEC-05 | Phase 4 - Decide Engine | Pending |
| DEC-06 | Phase 4 - Decide Engine | Pending |
| DEC-07 | Phase 4 - Decide Engine | Pending |
| DEC-08 | Phase 4 - Decide Engine | Pending |
| DEC-09 | Phase 4 - Decide Engine | Pending |
| DEC-10 | Phase 4 - Decide Engine | Pending |
| DEC-11 | Phase 4 - Decide Engine | Pending |
| DEC-12 | Phase 4 - Decide Engine | Pending |
| DCU-01 | Phase 5 - Decide UI | Pending |
| DCU-02 | Phase 5 - Decide UI | Pending |
| DCU-03 | Phase 5 - Decide UI | Pending |
| DCU-04 | Phase 5 - Decide UI | Pending |
| DCU-05 | Phase 5 - Decide UI | Pending |
| DCU-06 | Phase 5 - Decide UI | Pending |
| DCU-07 | Phase 5 - Decide UI | Pending |
| DCU-08 | Phase 5 - Decide UI | Pending |
| DCU-09 | Phase 5 - Decide UI | Pending |
| GRW-01 | Phase 6 - Grow | Pending |
| GRW-02 | Phase 6 - Grow | Pending |
| GRW-03 | Phase 6 - Grow | Pending |
| GRW-04 | Phase 6 - Grow | Pending |
| GRW-05 | Phase 6 - Grow | Pending |
| GRW-06 | Phase 6 - Grow | Pending |
| GRW-07 | Phase 6 - Grow | Pending |
| GRW-08 | Phase 6 - Grow | Pending |
| GRW-09 | Phase 6 - Grow | Pending |
| GRW-10 | Phase 6 - Grow | Pending |
| INS-01 | Phase 7 - Insights | Pending |
| INS-02 | Phase 7 - Insights | Pending |
| INS-03 | Phase 7 - Insights | Pending |
| INS-04 | Phase 7 - Insights | Pending |
| INS-05 | Phase 7 - Insights | Pending |
| INS-06 | Phase 7 - Insights | Pending |
| HH-01 | Phase 8 - Household | Pending |
| HH-02 | Phase 8 - Household | Pending |
| HH-03 | Phase 8 - Household | Pending |
| HH-04 | Phase 8 - Household | Pending |
| HH-05 | Phase 8 - Household | Pending |
| HH-06 | Phase 8 - Household | Pending |
| HH-07 | Phase 8 - Household | Pending |
| HH-08 | Phase 8 - Household | Pending |
| HH-09 | Phase 8 - Household | Pending |
| HH-10 | Phase 8 - Household | Pending |
| HH-11 | Phase 8 - Household | Pending |
| HH-12 | Phase 8 - Household | Pending |
| TIER-01 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-02 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-03 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-04 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-05 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-06 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-07 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-08 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-09 | Phase 9 - Tiers & Onboarding | Pending |
| TIER-10 | Phase 9 - Tiers & Onboarding | Pending |
| ALR-01 | Phase 10 - System | Pending |
| ALR-02 | Phase 10 - System | Pending |
| ALR-03 | Phase 10 - System | Pending |
| ALR-04 | Phase 10 - System | Pending |
| ALR-05 | Phase 10 - System | Pending |
| DAT-01 | Phase 10 - System | Pending |
| DAT-02 | Phase 10 - System | Pending |
| DAT-03 | Phase 10 - System | Pending |
| DAT-04 | Phase 10 - System | Pending |
| DSG-01 | Phase 11 - Compliance & Release | Pending |
| DSG-02 | Phase 0 - Foundation | Pending |
| DSG-03 | Phase 0 - Foundation | Pending |
| DSG-04 | Phase 0 - Foundation | Pending |
| DSG-05 | Phase 11 - Compliance & Release | Pending |
| CMP-01 | Phase 11 - Compliance & Release | Pending |
| CMP-02 | Phase 11 - Compliance & Release | Pending |
| CMP-03 | Phase 11 - Compliance & Release | Pending |
| CMP-04 | Phase 11 - Compliance & Release | Pending |
| CMP-05 | Phase 11 - Compliance & Release | Pending |
| CMP-06 | Phase 11 - Compliance & Release | Pending |
| CMP-07 | Phase 11 - Compliance & Release | Pending |
| CMP-08 | Phase 11 - Compliance & Release | Pending |
| CMP-09 | Phase 11 - Compliance & Release | Pending |
| CMP-10 | Phase 11 - Compliance & Release | Pending |
| CMP-11 | Phase 11 - Compliance & Release | Pending |

**Coverage:**
- v1 requirements: 166 total
- Mapped to phases: 166
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-21*
*Last updated: 2026-09-21 after adding PostHog analytics (opt-in, no replay), FX fallback and monitoring, and manual investment valuations. 166/166 v1 requirements mapped across 12 phases*
