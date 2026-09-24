# Dependency Register

Every external service FincWin depends on. Status is one of provisioned / pending / deferred. Update the row and the Last checked date whenever status changes.

| Service | Needed for | Status | Account / org | Blocker | Must land by | Last checked | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-U-N-S number | Apple + Google org enrolment | pending | company (Lead Strategy Canada Inc) | requested, not yet issued | Phase 0 | 2026-09-22 | Requested 2026-09-15; still pending on day 7 as of 2026-09-22; ETA 2026-10-13 (+28 days). Checked via Apple's lookup tool (D-01) |
| Domain (entity) | Apple enrolment contact address | provisioned | Lead Strategy Canada Inc, DNS on Cloudflare | — | Phase 0 | 2026-09-22 | leadstrategy.ca; two-domain deviation from original plan (D-05) — entity domain, inbound email only for now, not added to Resend |
| Domain (product) | website, support contact, store listings | provisioned | FincWin, DNS on Cloudflare | — | Phase 0 | 2026-09-22 | fincwin.com; two-domain deviation from original plan (D-05) — carries public support address and outbound mail |
| Company website | Apple org enrolment; later hosts privacy/terms/support | pending | company | Not yet audited against Apple's bar | Phase 0 | 2026-09-22 | Audit in plan 00-07 (D-06); entity domain (leadstrategy.ca) is what Apple checks at enrolment |
| Work email (inbound: Cloudflare Email Routing, entity) | Apple verification mail / enrolment contact | provisioned | Lead Strategy Canada Inc | — | Phase 0 | 2026-09-22 | fincwin@leadstrategy.ca; Cloudflare Email Routing enabled, test email received (D-07) |
| Work email (inbound: Cloudflare Email Routing, product) | public support contact for both store listings | provisioned | FincWin | — | Phase 0 | 2026-09-22 | support@fincwin.com; Cloudflare Email Routing enabled, test email received (D-07) |
| Work email (outbound: Resend) | replying as the domain, later transactional mail | provisioned | company team in Resend | — | Phase 0 | 2026-09-22 | fincwin.com added to Resend and shows Verified; outbound sends as no-reply@fincwin.com. leadstrategy.ca not added to Resend — entity domain is inbound-only for now (D-07) |
| Apple Developer Program (organisation) | Sign in with Apple, iOS device builds, TestFlight, submission | pending | company (enrol as organisation only, D-03) | D-U-N-S not yet issued (requested 2026-09-15) | Phase 0 submission; Phase 11 hard gate | 2026-09-22 | $99/yr. No individual fallback (D-03). Enrolment started but cannot be submitted/completed until D-U-N-S is issued; no submission date confirmed |
| Google Play Console (organisation) | Play submission, IAP products | pending | company | D-U-N-S | Phase 0 (pulled forward from Phase 9 per D-04) | 2026-09-22 | $25 one-off. Not started |
| GitHub repo | CI, source of truth | provisioned | paulakintunde/AppFincWin | — | Phase 0 | 2026-09-22 | Default branch main (D-09) |
| Supabase dev project | on-device testing | pending | company org in Supabase (D-08) | — | Phase 0 | 2026-09-22 | Region US East (D-22); plan 00-03 |
| Supabase prod project | real user data | pending | company org in Supabase | — | Phase 0 (Free), Pro by Phase 2 (ENV-16) | 2026-09-22 | plan 00-03 |
| EAS project + profiles | all builds, OTA | pending | company org in Expo (D-08) | — | Phase 0 | 2026-09-22 | plan 00-14 |
| Google OAuth client IDs (Web/Android/iOS) | Google Sign-In | pending | company org in Google Cloud | Android SHA-1s need the app identifier (00-02) and EAS keystore (00-14) | Phase 0 | 2026-09-22 | plan 00-15 |
| Sign in with Apple (Services ID + key) | Apple sign-in on iOS and Android | deferred | Apple org account | Apple Developer Program (ENV-10) | when enrolment clears | 2026-09-22 | plan 00-20; client secret JWT expires every 6 months |
| Frankfurter v2 | FX rates | pending | none (no key) | — | Phase 0 | 2026-09-22 | Pin v2 (`https://api.frankfurter.dev/v2`); plan 00-09 |
| open.er-api | FX fallback | deferred | none (no key) | — | Phase 1 (MON-12) | 2026-09-22 | Attribution required in-app |
| PostHog (EU host) | product analytics | pending | company org in PostHog | — | Phase 0 | 2026-09-22 | EU host kept despite US DB (D-23); plan 00-13 |
| Sentry | error reporting | pending | — | D-19 spike outcome | Phase 0 decision | 2026-09-22 | Dropped if PostHog error tracking holds up (D-19); plan 00-16 |
| APNs + FCM push credentials | server-sent alerts | deferred | Apple org / Firebase | APNs waits on ENV-10 | Phase 10 (ENV-19) | 2026-09-22 | |
| RevenueCat | subscriptions | deferred | company | Apple + Play accounts | Phase 9 | 2026-09-22 | |
| Cloudflare | DNS, inbound email | provisioned | company | — | Phase 0 | 2026-09-22 | D-05 |
| App identifier (bundle ID / Android package) | every store registration, Google OAuth clients | pending | — | decision in plan 00-02 | Phase 0 | 2026-09-22 | Cannot be changed after the first store registration |
| GitHub branch protection | non-bypassable CI gate on `main` (FND-04, FND-05) | provisioned (partial) | paulakintunde/AppFincWin | Admin bypass: `enforce_admins` is false, so owner direct pushes to `main` skip the checks | Phase 0 (FND-04/05) | 2026-09-23 | User made the repo public on 2026-09-23, which lifted the Free-plan 403. Branch protection applied: required checks `checks`, `secret-scan`, `rls`, strict (branch must be up to date). Any non-admin push or PR merge is now blocked on red CI. Remaining gap: owner pushes bypass (seen on the 00-13 push). To close fully: set `enforce_admins: true` and move to a PR-based flow for `main` |
