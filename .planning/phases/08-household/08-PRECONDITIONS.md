# Phase 8 preconditions (recorded 2026-11-15)

CHECK 1: git merge-base --is-ancestor origin/main HEAD -> yes (branch contains current origin/main)
CHECK 2: ls supabase/migrations | grep -c grow_schema -> 1 (20261106000100_grow_schema.sql present)
CHECK 3: newest migration on branch -> 20261115000100_category_icon_key.sql; newest planned 05.5 -> 20261121000300_decide_settings_drop_interim_columns.sql (Band B, not yet in tree). 20261122000100 sorts after both. No shift.
CHECK 4: highest pgTAP file -> 98_decide_rule_caps_copy / 98_category_icon_key; no 100..110 files exist. No shift.
CHECK 5: countsForMe on origin/main -> yes (src/engine/month/countsForMe.ts); bo07 contract tests present -> 05.5 landed yes
CHECK 6: grep -c '"expo-linking"' package.json -> 1
CHECK 7 (production, `supabase migration list --linked`): owner/orchestrator check pending. Not run by this executor (no production access). Phase 8 database push also waits for 05.5 Band B (gate g).

GROW_ON_BASE: yes
MIGRATION_DATE_BASE: 20261122
PGTAP_BASE: 100
05_5_LANDED: yes
