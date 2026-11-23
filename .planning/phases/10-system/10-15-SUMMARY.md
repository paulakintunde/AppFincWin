---
phase: 10-system
plan: 15
subsystem: database
tags: [supabase, pgtap, alerts, pg_cron, privacy]
requires: [10-02]
provides:
  - "alert_outbox, raise_alert(), alerts_on_transaction/alerts_on_goal triggers, alerts_bills_due() hourly cron, alerts_purge() nightly cron"
affects: [10-22, 10-23]
key-files:
  created:
    - supabase/migrations/20261126000500_alerts_raise.sql
    - supabase/tests/database/124_alerts_raise.test.sql
requirements-completed: [ALR-01, ALR-02, ALR-05, ALR-06]
duration: 40min
completed: 2026-11-23
---

# Phase 10 Plan 15: Server-side alert raising Summary

All five alert kinds plus partner large expenses are decided in SQL against saved thresholds and written to alert_log and alert_outbox, once per dedupe key, whether or not a push token exists.

## Commits
- 499d01a7: migration 0500 and pgTAP 124 (both tasks in one commit)

## Key points
- `raise_alert` rejects any params key outside the per-kind contract (raises 22023), so a note or payee cannot reach an alert even by mistake; execute revoked from clients; outbox has no client grants and is not a plan_lock table (no client write policy).
- Over cap uses the category owner's `monthly_cap` in their profile home currency and raises when this row crosses the cap. Low balance uses opening balance plus paid rows and raises when this row crosses below the saved amount (same-currency only).
- Bills due: creator, plus every household member for shared occurrences (key suffixed with the user id for non-creators); each person's own time zone and lead days (default 1).
- Partner large: shared outflows only, receiver needs a saved threshold and partner_alerts (default true). Sender name hidden or missing gives who null; sender-private custom category gives who null, hidden true, category null; receiver's own transaction_member_categories name wins.

## Deviations from Plan
- Tasks 1 and 2 committed together (SQL written as one function; pgTAP could not be run so no RED phase).
- Plan's partner test used builtin category 'Home'; the builtin list has no such key, so the test uses 'Housing'.
- raise_alert additionally validates the params whitelist (extra mitigation for T-10-15-01).
- Added a defensive `coalesce(lead_days, 1)` for a bills_due settings row saved without a lead.

## Verification
- `npm run lint:migrations`: OK (117 files).
- pgTAP run by orchestrator after merge (no local stack per wave-2 rules). Assertions: 38 (plan count set to 38). Expected risk points to check if it fails: FX stamp setting home_amount for USD to USD rows, savings_goals/transaction guard triggers under superuser inserts, jsonb equality assertions.

## Known Stubs
None.

## Self-Check: PASSED
