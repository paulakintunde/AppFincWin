# Phase 9 production push log

**Date:** 2026-11-19
**Approved by:** the owner, in an AskUserQuestion popup in this session. Answer: "Approve, push from the Phase 9 folder (Recommended)".
**Branch / HEAD:** phase/09-tiers-onboarding @ 063c2df2 (checkout C:/dev/fincwin-p9). Linked for this step with owner approval, following the Phase 8 precedent, because the main checkout is shared with other sessions and does not hold these migrations.
**Supabase CLI:** 3.1.0
**Project:** cohmcbdfgqmiwykztrdg (Fincwin United, production)

## Before the push

- CI on PR #170 was fully green at 063c2df2: checks (full jest, 36,978 tests), rls (all pgTAP files including 111-116), deno, secret-scan, mutation-changed.
- Preflight passed: `supabase:db:push` with SUPABASE_PREFLIGHT_ENV_FILE pointing at the main checkout's env file. The ref matches config.toml.
- `migration list --remote`: every migration through 20261122000900 was applied remotely; only the five 20261124* migrations were local-only.
- `db push --remote --dry-run` listed exactly the five Phase 9 migrations.

## Applied

- 20261124000100_plans_core.sql
- 20261124000200_plans_lock.sql
- 20261124000300_plans_seats_invites.sql
- 20261124000400_plans_apply.sql
- 20261124000450_member_colours_twelve.sql

Result: "Finished supabase db push." with no errors.

## Functions deployed

- plan-webhook
- plan-refresh
- plan-grant

Each reported "Deployed Functions." with no errors.

## Secrets (names only)

- Function secrets set: PLAN_SWEEP_SECRET, PLAN_GRANT_SECRET (each a fresh 32-byte hex value, generated in the shell, never printed). Also saved, gitignored, in C:\dev\fincwin\.env.local for later tester grants.
- Vault secrets created: plan_refresh_url (the plan-refresh function URL), plan_sweep_secret (same value as PLAN_SWEEP_SECRET).
- Not yet set: REVENUECAT_SECRET_API_KEY and the webhook secret (REVENUECAT_WEBHOOK_HMAC_SECRET or REVENUECAT_WEBHOOK_AUTH). See the open item below.

## Post-push checks (read-only)

| Check | Result |
|---|---|
| Households without a plan row | 0 |
| plan_settings.paid_from | null (prelaunch: nothing locks) |
| user_setup level 4, source existing | 6 of 6 users |
| household_plans | 5 rows, status promo, promo_kind tester |
| cron jobs | plan-sweep-daily (35 0 * * *), plan-reconcile-daily (50 0 * * *) |
| plan_lock triggers | 27 |
| household_members colour_key check | 0..11; 6 of 6 members in range |
| vault names | plan_refresh_url, plan_sweep_secret present |

## Open item: ENV-12 (RevenueCat)

Task 4 waits for the owner: create the RevenueCat project (entitlement `access`, offerings `default` and `no_trial`, restore behaviour "Transfer if there are no active subscriptions", Family Sharing OFF), put REVENUECAT_SECRET_API_KEY and the webhook secret into C:\dev\fincwin\.env.local, add the webhook URL https://cohmcbdfgqmiwykztrdg.supabase.co/functions/v1/plan-webhook and send a TEST event. Until then the webhook refuses calls and plan-refresh cannot read RevenueCat; plan state stays tester/prelaunch, so no one is affected.

Webhook auth mode: open item (set when the RevenueCat dashboard is configured).
