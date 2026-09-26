# EAS environment variables

ENV-04 / ENV-01: how client configuration reaches EAS builds, and where secrets live.

Anything prefixed `EXPO_PUBLIC_` is inlined into the JS bundle at build time and is public by design — readable by anyone who downloads and decompiles the app. Secrets never carry that prefix, and never reach client code.

All three EAS environments (`development`, `preview`, `production`) point at the same Supabase project. There is only one Supabase project (`Fincwin United`, ref `cohmcbdfgqmiwykztrdg`), and it is production — see `.planning/PROJECT.md`'s Key Decisions and `CLAUDE.md`'s Supabase access section. Every Supabase-derived value below is therefore identical in all three environments; only `EXPO_PUBLIC_APP_ENV` (and, later, feature-gating flags) differs by environment.

## Variables

| Variable | Environments | Visibility | Consumer |
|---|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | development (`development`), preview (`preview`), production (`production`) — each environment's own name | plaintext | Client — labels the running build, read by app code/analytics context |
| `EXPO_PUBLIC_SUPABASE_URL` | development, preview, production (same value) | plaintext | Client — Supabase client init |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | development, preview, production (same value) | plaintext | Client — Supabase client init (RLS is the real security boundary, not this key) |
| `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED` | development, preview, production (`false` until 00-20) | plaintext | Client — shows the Apple button disabled until enrolment clears |
| `EXPO_PUBLIC_POSTHOG_HOST` | development, preview, production (`https://eu.i.posthog.com`) | plaintext | Client — PostHog SDK init, EU host only (D-23). Analytics only as of D-19 — PostHog no longer carries error tracking |
| `EXPO_PUBLIC_POSTHOG_KEY` | development, preview, production (same value) | plaintext | Client — PostHog SDK init |
| `EXPO_PUBLIC_ERROR_TRACKING` | development, preview, production (`sentry`) | plaintext | Client — selects the error-tracking provider read by `src/config/env.ts`; `sentry` since D-19 |
| `EXPO_PUBLIC_SENTRY_DSN` | development, preview, production (same value) | plaintext | Client — `Sentry.init()` in `src/services/errors/errorReporter.ts` (D-19). A DSN is not a secret — it is designed to be public, like a PostHog project key |
| `SENTRY_AUTH_TOKEN` | development, preview, production (same value) | **secret** | Build-time only — read by the `@sentry/react-native/expo` config plugin's generated `sentry.properties` (never passed as a plugin prop, so it's never written into the app package) to upload Hermes source maps during the Android Gradle build (D-19) |
| `SENTRY_ORG` | development, preview, production (same value) | plaintext | Build-time only — `app.config.ts` passes it to the `@sentry/react-native/expo` plugin |
| `SENTRY_PROJECT` | development, preview, production (same value) | plaintext | Build-time only — `app.config.ts` passes it to the `@sentry/react-native/expo` plugin |
| `EAS_PROJECT_ID` | development, preview, production | plaintext | Build-time only — `app.config.ts` reads it to set `updates.url` and `extra.eas.projectId`; never inlined under an `EXPO_PUBLIC_` name |
| `EXPO_OWNER` | development, preview, production | plaintext | Build-time only — `app.config.ts` reads it for the Expo/EAS owner slug |

Google client IDs (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME`) are added in plan 00-15, once the Google Cloud OAuth clients exist. They follow the same environment/visibility pattern: the two `EXPO_PUBLIC_*` values as plaintext, none as secret (they are not sensitive — OAuth client IDs are not secrets).

## Loading variables

```bash
eas env:set <environment> --name <NAME> --value "<value>" --visibility <plaintext|secret> --non-interactive
```

(`eas env:create` exists but is deprecated in eas-cli 24.7.0 in favour of `eas env:set`, which is idempotent — safe to rerun if a value changes.)

Inspecting what is loaded, without printing secret values:

```bash
eas env:list --environment production --non-interactive
```

Add `--include-sensitive` only when a human explicitly needs to see a `sensitive`-visibility value; it is never used for `secret`-visibility values, which EAS never displays back through the CLI regardless of the flag.

## `SUPABASE_SERVICE_ROLE_KEY` removed from EAS (2026-09-25)

The owner removed `SUPABASE_SERVICE_ROLE_KEY` from all three EAS environments on 2026-09-25. No build reads it — `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are all the app needs, and RLS enforces access from there — and Edge Functions get the service-role key directly from Supabase (it is injected into the Edge Function runtime automatically) rather than from a second, separately-managed EAS copy. Removing it is a least-privilege cleanup: a secret with no reader anywhere in this project's build or deploy path is pure exposure with no offsetting benefit.

## Root cause of the Sentry delivery outage (PR #19)

Separately, on 2026-09-25 the owner re-set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_ERROR_TRACKING` and `EXPO_PUBLIC_SENTRY_DSN` in all three EAS environments without the literal wrapping quotes they had previously been stored with — that quoting was the root cause of PR #19 (the whole-env reader threw on the quoted Supabase URL, which silently took Sentry initialisation down with it). `src/config/env.ts` now also detects and reports quoted `EXPO_PUBLIC_` values by name rather than failing confusingly downstream.
