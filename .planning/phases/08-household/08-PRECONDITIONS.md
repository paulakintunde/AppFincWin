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

## 08-25 gate (D-41), 2026-11-16

05_5_GATE_2026-11-16: landed (05.5 complete on main, PR #144 29/29; Band B in production 2026-11-16; gate c met 2026-11-15). origin/main bb27d24b merged into phase/08-household (6 docs-only commits, no conflict).
COUNTS_FOR_ME_PATH: src/engine/month/countsForMe.ts
COUNTS_FOR_ME_SIGNATURE: export function countsForMe(line: CountsLine): MinorUnits; export function countsForMeTotal(lines: readonly CountsLine[]): MinorUnits; CountsLine { id; amount: MinorUnits (signed, viewer's home currency; for a shared line already the viewer's stored share); isShared; isMine; isSettlement?; partnerOptIn? }
BO07_CONTRACT_TESTS: src/engine/month/__tests__/bo07.point6.contract.test.ts (4 point-6 todos), src/engine/month/__tests__/bo07.phase8.contract.test.ts (visibility todo; settlement titles on since 08-30; income-profile todo stays for 08.1), src/test/contracts/contractManifest.test.ts (frozen), src/test/contracts/bo07.contracts.test.ts
HOME_FIGURES: useHomeViewModel position = monthPositionOf(monthView rows); afterPlans = monthPicture(useDecideV3().prepared).leftAfterPlans (current month only)
HOUSEHOLD_SMALL_LINE: fits. preparedV3/buildInputs take any SnapshotSource; a shared-lines-only source (shared rows at household amounts, joint accounts, no personal debts/goals/settings money/series) runs through the same builder and monthPicture, with settlements already skipped by the builder. No second sum, no second counting rule.
08-25_DECISION: proceed (owner pre-authorised 2026-11-17 on all interfaces fitting; 08-25 runs before 08-27, ordering-only dependency)
