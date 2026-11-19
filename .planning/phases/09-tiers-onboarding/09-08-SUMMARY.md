---
phase: 09-tiers-onboarding
plan: 08
status: complete
completed: 2026-11-19
open_items:
  - ENV-12 RevenueCat project, keys and TEST webhook event (owner, Task 4)
---

# 09-08 Summary: production push

The five Phase 9 migrations are live on production, the three plan functions are deployed, and the sweep and grant secrets are set. Full record in 09-PUSH-LOG.md.

## What happened

- Owner approved the push in a popup ("Approve, push from the Phase 9 folder").
- CI was green on 063c2df2 first, including the pgTAP files 111-116 that had never run before this phase.
- Dry run listed exactly 20261124000100, 000200, 000300, 000400 and 000450; the push applied all five with no errors.
- plan-webhook, plan-refresh and plan-grant deployed.
- PLAN_SWEEP_SECRET and PLAN_GRANT_SECRET generated and set without printing; vault plan_refresh_url and plan_sweep_secret created for the cron.
- Read-only checks: every household has a plan row (5 tester promos), paid_from is null, all 6 users on level 4 from the backfill, both cron jobs scheduled, the lock trigger on 27 tables, colour range 0..11.

## Deviations

- Pushed from the linked Phase 9 checkout (C:/dev/fincwin-p9), not the main checkout, as the owner chose (Phase 8 precedent).
- Five migrations, not four: 20261124000450_member_colours_twelve (09-26) was added after the plan was written.

## Open item

- ENV-12: RevenueCat is not configured yet. Task 4 stays with the owner. When the keys are in C:\dev\fincwin\.env.local, set REVENUECAT_SECRET_API_KEY and one webhook secret, then check for the TEST event and record the webhook auth mode in 09-PUSH-LOG.md.
