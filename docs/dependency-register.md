# Dependency Register

Every external service FincWin depends on. Status is one of provisioned / pending / deferred. Update the row and the Last checked date whenever status changes.

| Service | Needed for | Status | Account / org | Blocker | Must land by | Last checked | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-U-N-S number | Apple + Google org enrolment | pending | company | none yet: lookup not done | Phase 0 | 2026-09-22 | Check via Apple's lookup tool on day one; ~28 days if a new one must be issued (D-01) |
| Domain | website, email, Apple enrolment | provisioned | company, DNS on Cloudflare | — | Phase 0 | 2026-09-22 | Already owned (D-05); domain name recorded in Task 3 |
| Company website | Apple org enrolment; later hosts privacy/terms/support | pending | company | Not yet audited against Apple's bar | Phase 0 | 2026-09-22 | Audit in plan 00-07 (D-06) |
| Work email (inbound: Cloudflare Email Routing) | Apple verification mail | pending | company | Not yet set up | Phase 0 | 2026-09-22 | D-07 |
| Work email (outbound: Resend) | replying as the domain, later transactional mail | pending | company team in Resend | Not yet set up | Phase 0 | 2026-09-22 | D-07; SPF/DKIM/DMARC in Cloudflare |
| Apple Developer Program (organisation) | Sign in with Apple, iOS device builds, TestFlight, submission | pending | company (enrol as organisation only, D-03) | D-U-N-S, website, work email | Phase 0 submission; Phase 11 hard gate | 2026-09-22 | $99/yr. No individual fallback (D-03) |
| Google Play Console (organisation) | Play submission, IAP products | pending | company | D-U-N-S | Phase 0 (pulled forward from Phase 9 per D-04) | 2026-09-22 | $25 one-off |
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
