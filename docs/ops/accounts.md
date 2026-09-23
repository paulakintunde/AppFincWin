# Accounts and credentials

Every external account FincWin United needs, what it unblocks, and where its
values go. Fill `.env.local` (gitignored, at the repo root) as you create each
account. This file tracks *status only* — never write a secret into it.

Per D-08, every account is created under Paul's personal login, with a company
organisation or team inside it. No shared logins.

## Two entities

**Lead Strategy Canada Inc** is the legal entity. It owns both store accounts,
holds the D-U-N-S number, signs the developer agreements, and is the data
controller in the privacy policy. Its own domain and website are what Apple
checks during organisation enrolment, and the enrolment contact email must be
on that domain.

**FincWin** is the product. Its domain carries the marketing site, the support
page and the support email, and it is what users see in the store listing.

Both domains need DNS and email set up, and the D-U-N-S request covers the
entity only. In `.env.local`, `COMPANY_*` is the entity and `APP_*` is the
product — the two must not be crossed.

Plans 00-01 and 00-07 were written assuming a single domain. They now cover
two: the entity domain for enrolment, the product domain for the listing.

## Status

| Account | Cost | Blocks | Status |
|---|---|---|---|
| GitHub (`paulakintunde/AppFincWin`) | free | 00-08 CI | Done |
| Domain + Cloudflare DNS | owned | 00-01, 00-07 | Existing |
| Cloudflare Email Routing | free | 00-01 | Not started |
| Resend | free tier | 00-01 | Not started |
| D&B / D-U-N-S number | free | 00-07 Apple enrolment | Not started |
| Supabase org "FincWin United" | Free plan | 00-03 and everything after | Production project live |
| Expo / EAS org `fincwin` | free tier | 00-14, 00-20 | Not started |
| PostHog EU Cloud | free tier | 00-13, 00-16 | Not started |
| Google Cloud + Play Console | Play: $25 once | 00-07, 00-15 | Not started |
| Apple Developer Program (org) | $99/year | 00-20, TestFlight | Not started |
| Sentry | free tier | only if 00-16's spike rejects PostHog | Conditional |

## What each account needs from you

### Cloudflare Email Routing — plan 00-01
Enable Email Routing on the domain, create `hello@<domain>` forwarding to your
inbox, and send a test message to confirm delivery. The address becomes the
app's support contact, which Apple checks at review.

### Resend — plan 00-01
Create a company team, add the domain, and put the SPF and DKIM records it
gives you into Cloudflare DNS. Add a `_dmarc` TXT record with
`v=DMARC1; p=none; rua=mailto:hello@<domain>`. Wait for Verified.
Nothing in Phase 0 sends email, so the API key can wait, but the domain still
has to reach Verified here — SPF and DKIM propagation is slow and later phases
depend on it.
→ `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

### D-U-N-S number — plan 00-07
Look the company up at https://developer.apple.com/enroll/duns-lookup/. The
D&B legal name and address must match the government registration exactly, or
Apple rejects the enrolment. A correction restarts the clock, so check it
before submitting. A new request can take up to about 28 days.

### Supabase — plan 00-03
The organisation exists and one Free project is live: `Fincwin United`, ref
`cohmcbdfgqmiwykztrdg`, in us-west-2. That region was chosen over an EU one
because most users are in North America, and it is permanent — Supabase fixes
a project's region at creation. It is the production project, and the only
one. The access token is generated and verified against the Management API;
the CLI and Docker Desktop are still outstanding — install the CLI with
Scoop, as `npm install -g supabase` is unsupported. Keys are the new
`sb_publishable_` and `sb_secret_` style, and the legacy `anon` and
`service_role` JWTs are deprecated at the end of 2026, so do not mint them.
Accept the Supabase DPA while you are in the dashboard: it carries the
Standard Contractual Clauses and the UK addendum, which is what makes a
us-west-2 database lawful for users worldwide. Do not use the Supabase MCP
connector on this project — see `## Supabase access` in `CLAUDE.md`. Save
the database password in a password manager, since Supabase shows it once.
→ `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_PROJECT_REF`,
`SUPABASE_DB_PASSWORD`, `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — the last
keeps its legacy name but holds a new-style secret key.

### Expo / EAS — plan 00-14
Create the `fincwin` organisation at https://expo.dev. `eas init` prints the
project ID. Non-public values are uploaded as EAS secrets so cloud builds can
read them; `.env.local` is not uploaded.
→ `EXPO_OWNER`, `EAS_PROJECT_ID`

### PostHog — plans 00-13, 00-16
Sign up on **EU Cloud** (https://eu.posthog.com), not US — data residency is a
requirement. Session replay must stay off. The project API key ships in the
app; the personal API key does not.
→ `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`,
`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`

### Google — plans 00-07, 00-15
Two separate things. The **Play Console** organisation account costs $25 once
and needs identity verification, so start it early. **Google Cloud** OAuth
clients are free: create a web client, an iOS client, and one Android client
per signing certificate. The web client secret goes into Supabase's Google
provider settings, not into the app.
→ `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET`,
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME`,
`GOOGLE_ANDROID_CLIENT_IDS`

### Apple — plan 00-20
Organisation enrolment needs the D-U-N-S number, a public company website, and
a work email on the company domain. Approval takes days to weeks, and nothing
iOS ships until it lands. Afterwards, create a Services ID and a Sign in with
Apple key; the `.p8` downloads exactly once — store it outside this repo.
→ `APPLE_TEAM_ID`, `APPLE_SERVICES_ID`, `APPLE_KEY_ID`, `APPLE_P8_PATH`,
`EXPO_PUBLIC_APPLE_SIGNIN_ENABLED`, `EXPO_PUBLIC_IOS_APP_STORE_ID`

### Sentry — plan 00-16, only if needed
Create this account only if the 00-16 spike cannot get symbolicated stack
traces out of PostHog. Skip it otherwise.
→ `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

## Where secrets are allowed to live

| Place | What goes there |
|---|---|
| `.env.local` | everything, on this machine only; gitignored |
| EAS secrets | non-public values cloud builds need (plan 00-14) |
| GitHub Actions secrets | values CI needs (plan 00-08) |
| Supabase dashboard | the Google web client secret, Apple provider config |
| Password manager | database passwords, the Apple `.p8` |
| Anywhere tracked by git | nothing, ever |

`EXPO_PUBLIC_*` values are compiled into the app bundle and can be read by
anyone who downloads it. Only publishable keys and feature flags carry that
prefix. A value with that prefix is public, whatever it is named.
