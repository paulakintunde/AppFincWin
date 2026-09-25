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
| `EXPO_PUBLIC_POSTHOG_HOST` | development, preview, production (`https://eu.i.posthog.com`) | plaintext | Client — PostHog SDK init, EU host only (D-23) |
| `EXPO_PUBLIC_POSTHOG_KEY` | development, preview, production (same value) | plaintext | Client — PostHog SDK init |
| `EAS_PROJECT_ID` | development, preview, production | plaintext | Build-time only — `app.config.ts` reads it to set `updates.url` and `extra.eas.projectId`; never inlined under an `EXPO_PUBLIC_` name |
| `EXPO_OWNER` | development, preview, production | plaintext | Build-time only — `app.config.ts` reads it for the Expo/EAS owner slug |
| `SUPABASE_SERVICE_ROLE_KEY` | development, preview, production (same value) | **secret** | Not read by any app/client code. Held on the EAS side so EAS Workflows can deploy Supabase Edge Functions later without the key ever living only on one machine. CI's `checks` job (00-08) greps the repo to prove no client code reads it |

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

## Why `SUPABASE_SERVICE_ROLE_KEY` lives in EAS at all

No client bundle ever reads it — `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are all the app needs, and RLS enforces access from there. The service-role key is stored as a `secret`-visibility EAS environment variable purely so the EAS side of the project (EAS Workflows, run from the cloud rather than a laptop) can deploy Supabase Edge Functions without a second, separately-managed copy of the same secret. `secret` visibility means EAS itself never displays the value back through the CLI or dashboard after it is set, matching the "no EXPO_PUBLIC_ prefix, never inlined" mitigation in this plan's threat register (T-00-14-01).
