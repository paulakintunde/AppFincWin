# Supabase environments

## Environments

| Environment | What it is | Used by |
|---|---|---|
| `local` | Supabase CLI stack running in Docker on the dev machine | pgTAP tests, CI's RLS isolation tests (FND-12), local iteration |
| `prod` | Fincwin United, Free plan now, moves to Pro before first real data lands (ENV-16) | The shipping app, TestFlight/internal testing builds |

There is no separate `dev` cloud project. Refs and keys are not repeated here — see `.env.local` (gitignored) for `SUPABASE_PROD_PROJECT_REF` and the local stack's fixed local URLs from `supabase status`. Keeping refs out of this doc means `.env.local` stays the single source of truth.

## Region (ENV-18, D-22)

**US West (us-west-2)**, chosen at project creation because launch users are mostly North American.

The region cannot be moved later without a dump/restore migration, so this was a deliberate, once-only choice rather than a default.

GDPR still applies everywhere the app is used, regardless of database region: EU users are covered by Supabase's Data Processing Agreement (DPA) and Standard Contractual Clauses (SCCs), which the privacy policy will state. PostHog stays on its EU host (D-23) — an accepted split geography, kept because it gives the stronger consent story for European users on the analytics side even though the database itself is US-hosted.

## Migrations-only rule (ENV-17)

Schema reaches the database only through `supabase/migrations/*.sql` in git:

- Locally: `supabase db reset` replays every migration against the local Docker stack from scratch.
- Production: `npm run supabase:db:push`, which chains `scripts/supabase-preflight.mjs` (asserts `supabase/config.toml`'s `project_id` matches `SUPABASE_PROD_PROJECT_REF` in `.env.local`) and then `supabase db push`.

There is no separate dev project, so every push is a production push. There are no dashboard SQL edits to schema, ever.

Migrations must stay compatible with the oldest supported app version — see `app_config.min_supported_version` (D-25, FND-09).
