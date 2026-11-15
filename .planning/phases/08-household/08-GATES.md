# Phase 8: Gates and revision checklist

**Written:** 2026-11-11 (owner decisions). **Updated:** 2026-11-15, two revision passes: the first (quick 261114-x0q) against main 318d6799, the second against main cf53894b after 05.5 waves 1-3 (#116, #120, #121) and 06.2 App life (#122, #124) merged. **Applies to:** every Phase 8 plan.

(Not the same as `08-PRECONDITIONS.md`, which plan 08-01 writes when it runs.)

Plans 08-28 and 08-29 (the household parts on Decide) moved to Phase 08.1 on 2026-11-11. Phase 8 is 28 plans in 12 waves. This file is the one place for: what must be true before certain steps, the migration push order, and where Phase 8 shares files with other work. The "05.5 handoff" section at the end is kept as 05.5-06 wrote it; where it and the gates below differ, the gates below are newer and win (marked there).

## Gates (must be true before the named step)

- (a) Every migration on main dated before Phase 8 is in production before 08-27 pushes. **MET for 06.1** (`20261111000100`, pushed 2026-11-12) **and 05.5 Band A** (`20261113000100`). Also on main: `20261114000100` (PR #118) and `20261115000100` (06.2 `category_icon_key`; 06.2's summary says it must be pushed before any build that reads `icon_key`, and does not record the push). 08-27 Task 1 checks `npx supabase migration list --linked` and stops if any of them is missing.
- (b) The Nightly run is green before the wave containing 08-25. **MET 2026-11-15:** scheduled runs on 13 and 14 Nov were green. Re-check the latest run before wave 12.
- (c) 05.5's `countsForMe` rule and its contract tests are on main before 08-25. **MET 2026-11-15:** #116 (wave 1: `src/engine/month/countsForMe.ts`, the BO-07 todo files `src/engine/month/__tests__/bo07.*.contract.test.ts`, the frozen manifest `src/test/contracts/contractManifest.test.ts`), #120 (wave 2: the month picture) and #121 (wave 3: Home's "left after the month's plans" line) are merged. 08-25 Task 1 only re-confirms the interfaces.
- (d) `package.json`: land Dependabot #125 (successor of #114, which closed) before or after the Phase 8 plans that edit `package.json` (08-08, 08-17, 08-22), not while one of them is in flight.
- (e) Re-run `npm run supabase:preflight` after 08-22 touches `supabase/config.toml`. Every push uses `npm run supabase:db:push`.
- (f) Cache version. `scripts/check-cache-version.mjs` fails CI when a cached shape changes without a bump. On main cf53894b `CACHE_SCHEMA_VERSION` is '11', and 05.5's remaining plans may raise it. 08-13 (wave 5) and 08-15 (wave 7) each add one to the value on the branch when they run (never assume a number) and refresh `scripts/cache-shape.lock.json`. 08-17 (wave 7) does not bump; if it finishes after 08-15, the orchestrator runs `npm run check:cache-version -- --update` once at the end of wave 7.
- (g) Migration dates and push order (second pass, 2026-11-15). `supabase db push` refuses a local file dated before the newest applied one. Phase 8's dates must sort after every migration on main AND every planned 05.5 migration. Newest on main: `20261115000100`. Newest planned in 05.5: Band B `20261121000100`, `20261121000200`, `20261121000300` (plan 05.5-24). So Phase 8 is re-dated to **`20261122000100..20261122000900`** (same order; was `20261120*`). Push order: 05.5 Band A, then 05.5 Band B, then Phase 8. Re-check at build time with `ls supabase/migrations | tail` and the 05.5 plan list (08-01 Task 1); if anything newer has appeared, shift Phase 8 to the next free day. pgTAP: main tops out at the two 98 files (`98_decide_rule_caps_copy`, `98_category_icon_key`); 05.5 adds no new number; Phase 8's 100-110 are free.
  - Band B waits for the 05.5 native 0.2.0 build (05.5-24 Task 1). If Band B is still waiting when 08-27 is ready, 08-27 stops and asks the owner (Owner question 3).
  - 05.5-24's own stop rule still says "wait for Phase 8's `20261120*`". Those files no longer exist, so the owner writes `BAND_B_<date>: phase 8 confirmed absent by owner` in `05.5-PRECONDITIONS.md` to let Band B go first. 05.5-24 also stops if a Phase 8 `apply_patches` re-issue is not on main; under this order Phase 8 builds later and copies Band B's body instead (08-05).

## Revision record

- **First pass** (2026-11-15, quick 261114-x0q, main 318d6799): Grow, 06.1 and 05.5 Band A reconciled; the 08-05 bypass list, table lists, 08-25 / 08-30 against 05.5, ROADMAP criteria 8 and 9. Details: `.planning/quick/261114-x0q-phase-8-household-plan-revision-round/261114-x0q-SUMMARY.md`.
- **Second pass** (2026-11-15, main cf53894b): migrations re-dated to `20261122*` (gate g); 08-05 copies the newest `apply_patches` (`20261115000100`, or Band B's once it lands); cache text says '11'; 05.5 plug paths are `src/engine/month/...` and the todos are switched on in place; 08-30 fills `isSettlement` on Decide's source rows; 08-25 reads Home's real wiring; UI plans use the 06.2 kit and haptic names. Waves unchanged. Details: same SUMMARY, section "Second pass (post-merge)".

## Shared-file merge notes

- `YouScreen.tsx`: rewritten by 06.2-15 (groups, `YOU_ROW_ICON`). Phase 8 edits it in 08-17 (Household row, wave 7) and 08-22 (Delete my account, wave 8).
- `app/(app)/_layout.tsx`: 08-23, 08-24.
- `src/i18n/locales/en.ts`: 08-12 adds the `household` namespace next to `appLife`.
- `jest.config.js`: 08-03, 08-08.
- `package.json`: 08-08, 08-17, 08-22; Dependabot #125.
- `src/data/queries/decide.ts`: 08-30 (wave 8) and 08-25 (wave 12); 05.5 wave 4 (#126) also edits it.
- `src/engine/month/__tests__/bo07.phase8.contract.test.ts`: 08-30 (settlement titles), then 08-25 (the visibility title).
- `src/ui/StateChip.tsx`: still on main but unused since 06.2; Phase 8 uses `StatusBadge` instead.

## Open PRs that touch Phase 8 files (checked 2026-11-15, second pass)

#116, #120, #121 (05.5 waves 1-3) and #122 (06.2): **landed 2026-11-15, plans re-checked** in the second pass. Still open:

| PR | What | Phase 8 plans whose `files_modified` it also changes |
|---|---|---|
| #126 05.5 wave 4 (83 files: one cap per category, Grow lines on the shared month) | No migration | 08-30 and 08-25 (`src/data/queries/decide.ts`: re-read the `source` useMemo line numbers after it lands), 08-12 (`en.ts`) |
| #125 Dependabot minor and patch | Dependency bumps | 08-08, 08-17, 08-22 (`package.json`), gate (d) |

## Owner questions

Answered 2026-11-15 (kept in the plans):
1. **Home Mine / Household switch moves both figures** (the big "left after everything" figure and the small "left after the month's plans" line). 08-25.
2. **Debt payment and goal contribution lines stay personal.** 08-10's `share_transaction` refuses them (`linked_line_personal`); 08-12 and 08-19 carry the words.

Open (second pass), asked when the step comes:
3. **If 05.5 Band B is still waiting for the 0.2.0 build when Phase 8 is ready to push** (08-27): (a) wait for Band B, then push Phase 8; or (b) push Phase 8 now, and 05.5-24 re-dates its three files to the day after Phase 8's last migration before writing them.

## Moved out of Phase 8

- 08-28 -> `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-08-28.md` (its `20261120001000` must be re-dated after Phase 8's `20261122000900` when 08.1 re-plans).
- 08-29 -> `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-08-29.md`
- Grow's "Create from Decide" follow-up -> 08.1.

## 05.5 handoff (2026-11-14)

Written by plan 05.5-06. Source: `.planning/phases/05.5-one-shared-money-model/05.5-GATE.md` and `05.5-CONTEXT.md` (D-09, D-21). **Second-pass note (2026-11-15):** item 1's order is replaced by gate (g) above: Band B now pushes before Phase 8, and Phase 8's files are `20261122000100..000900`. Items 2 and 3 still hold.

1. **Gate (e): push order.** 05.5 Band A, `20261113000100_decide_rule_caps_to_categories.sql`, is pushed before 08-27 or any Phase 8 push. If `npx supabase migration list --linked` already shows any `2026112*` applied, Band A is re-dated to the next minute after the latest applied file (05.5-GATE.md records the new name). Add Band A to the 08-27 gate list. ~~Phase 8's `20261120000100..000900` push second; 05.5 Band B (`20261121000100`, `20261121000200`, `20261121000300`) pushes last, after the 05.5 release is installed.~~ Replaced by gate (g).
2. **share_pct removal moved to 05.5.** Phase 8's planned migration `20261120001100_decide_settings_share_from_household.sql` and pgTAP `112_*` are no longer Phase 8 or 08.1 work. 05.5 Band B `20261121000300` drops `decide_settings.share_pct` (with `safety_net_protect`, `safety_net_size`, `safety_net_locked`). Household's share rules start clean. `08.1-CARRY-OVER-08-29.md` carries the matching note. ROADMAP Phase 8 success criterion 9 says so.
3. **Where the plugs live.** `countsForMe` is at `src/engine/month/countsForMe.ts`. The BO-07 contract tests are the todo files `src/engine/month/__tests__/bo07.*.contract.test.ts`. When 08-25 turns a todo on, it keeps the exact test title, because 05.5's frozen manifest (`src/test/contracts/contractManifest.test.ts`) pins the titles.
