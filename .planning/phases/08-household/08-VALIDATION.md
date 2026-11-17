---
phase: 8
slug: household
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-10
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 08-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7 + fast-check ^4.10 (engine, data); pgTAP via `supabase test db` (database); separate Jest config for the Realtime two-client spike |
| **Config file** | `jest.config` (default), `jest.engine.config.js` (engine coverage gate), `supabase/tests/database/*.test.sql`; Wave 0 adds the `test:realtime` config |
| **Quick run command** | `npx jest src/engine/split src/engine/household src/data/realtime` |
| **Full suite command** | `npm test && npm run test:engine && supabase test db` |
| **Estimated runtime** | ~180 seconds (pgTAP needs the local Supabase stack in Docker) |

---

## Sampling Rate

- **After every task commit:** `npx jest <touched dir>` and, for migrations, `supabase test db`
- **After every plan wave:** `npm test && npm run test:engine && supabase test db`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Phase gate (SC7, blocking):** `101_household_privacy_two_user.test.sql` green before any invite-flow PR merges
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement-level map.

Revised 2026-11-15 (quick 261114-x0q): the pre-planning test names 89_..95_ now belong to Grow's real files on main (89_grow_goals .. 96_grow_review_fixes), so this map uses the planned Phase 8 numbers 100..110. Waves are unchanged. SC8 moved to 08.1 with the partner opt-in.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| SC7 (CMP-F18/ARC-22) | B cannot read/update/delete/RPC-read/view-read A's personal rows, every household table | pgTAP two-user | `supabase test db` (101_household_privacy_two_user) | ✅ | ✅ green (2026-11-16 gate run) |
| SC7 (coverage) | Every `household_id` table is listed in 101 | pgTAP meta-test | `supabase test db` (102_household_table_coverage) | ✅ | ✅ green (2026-11-16 gate run) |
| SC7 / D-14 | Only the creator or named payer edits a shared line's amount, date, note | pgTAP | `supabase test db` (103_household_shared_line_guard) | ✅ | ✅ green (2026-11-16 gate run) |
| SC7 (live/export) | B gets no Realtime events for A's personal rows; export excludes them | integration + Jest | `npm run test:realtime` (tests/realtime/twoClients.realtime.test.ts); `npx jest src/data/__tests__/exportManifest`; pgTAP 104_household_realtime_publication | ✅ | export Jest ✅ green; realtime spike and 104 ✅ green |
| HH-01 | Invite 7-day expiry, single use, cancel, owner-only, 6-member cap race | pgTAP | 105_household_invites | ✅ | ✅ green (2026-11-16 gate run) |
| HH-15 | 6th wrong code refused, counter persists, hashed at rest, no oracle | pgTAP | 105_household_invites | ✅ | ✅ green (2026-11-16 gate run) |
| HH-02 | Joiner sees only shared rows; move-in keeps rows personal | pgTAP | 106_household_join_movein | ✅ | ✅ green (2026-11-16 gate run) |
| HH-03 | Colour unique, role label ≤24, weight 0 allowed, all-zero refused | pgTAP + Jest | `npx jest src/engine/household` (colours, weights); 100_household_members_v2 | ✅ | Jest ✅ green; pgTAP ⬜ pending |
| HH-04/05 | Split rules; shares sum to total; stored split not recomputed | fast-check + pgTAP | `npx jest src/engine/split` (allocate) and src/engine/household/lineSplit; 107_household_splits | ✅ | Jest ✅ green; pgTAP ⬜ pending |
| HH-06 | Category default applied when sharing | Jest + pgTAP | `npx jest src/features/household` (rules/CategoryDefaultsScreen, rules/ApplyToExistingSheet); 107_household_splits | ✅ | Jest ✅ green; pgTAP ⬜ pending |
| HH-07 | Per-pair balances; settled lines excluded | Jest/fast-check | `npx jest src/engine/household` (balances, settlement) | ✅ | ✅ green |
| HH-08 | Pending/confirm, day-7 reminder, day-14 lapse idempotent; settlements not spend/income | pgTAP + Jest | 108_household_settlements; `npx jest -c jest.engine.config.js src/engine/activity` (08-30) | ✅ | Jest ✅ green; pgTAP ⬜ pending |
| HH-09 | Own vs household toggle uses the one my-share function | RNTL | `npx jest src/features/home` (08-25) | ❌ (08-25) | gated on 05.5 (08-25) |
| HH-10 | Hidden names fall back to colour name everywhere | Jest + pgTAP | `npx jest src/engine/household/memberLabel`; src/features/household/__tests__/useMemberLabel, memberNameOnly | ✅ | ✅ green (Jest) |
| HH-11 | Live appearance; reconcile never regresses; offline-mid-edit | fast-check + two-client spike | `npx jest src/data/realtime` (reconcile, applyEvent, channel); `npm run test:realtime` | ✅ | Jest ✅ green; spike ✅ green |
| HH-12 | Summary link expiry/revoke, aggregates only | pgTAP | n/a — not built (D-45) | n/a | Deferred (D-45) |
| HH-13 | Leave/remove/transfer; open balance kept "(left)" | pgTAP + RNTL | 109_household_leave_remove; 110_household_account_deletion; `npx jest src/features/household/leave` | ✅ | Jest ✅ green; pgTAP ⬜ pending |
| HH-14 | Account delete: owner handoff, personal erased, shared kept, balances unchanged | pgTAP (extend 36) + Deno + Jest | `supabase test db` (110_household_account_deletion, 36_account_deletion); `npm run test:deno` (delete-account/delete.test.ts); `npx jest src/services/account src/features/you` | ✅ | Deno ✅ green, Jest ✅ green; pgTAP ⬜ pending |
| SC8 | Partner opt-in off by default; partners' Fits never exceed shared money | fast-check | moved to 08.1 (former 08-28); Phase 8 only asserts "off by default" in 08-25's point-6 contract | n/a | moved to 08.1 (partner opt-in) |
| SC9 | One my-share source; settlements excluded; owed-to-you not spendable | Jest property | `npm run test:engine` (`src/engine/month/__tests__/bo07.point6` / `bo07.phase8` contracts, switched on in place by 08-25 and 08-30; manifest `npx jest src/test/contracts`) | ✅ (todos) | gated on 05.5 (08-25); 08-30's settlement titles ✅ green in test:engine |

nyquist_compliant covers every row except Deferred (D-45), gated-on-05.5 and moved-to-08.1 rows; those are excluded by design.

pgTAP 111 and 112 are no longer Phase 8 files (share_pct removal moved to 05.5 Band B; 08-28 moved to 08.1).

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/database/101_household_privacy_two_user.test.sql` + meta-test `102_household_table_coverage.test.sql` enumerating every `household_id` table
- [ ] `src/data/realtime/` module, `reconcile.test.ts` (fast-check), `test:realtime` script and Jest config
- [ ] `src/engine/household/` (balances, my-share function, countsForMe input adapter, memberLabel; `countsForMe` itself is 05.5's `src/engine/month/countsForMe.ts`)
- [ ] Extended `allocate` tests for zero weights
- [ ] Gate task confirming 05.5 (`countsForMe`, BO-07 contract tests) landed (gate (c) met 2026-11-15; 08-25 Task 1 re-confirms)
- [ ] `exportManifest` entries for new tables

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Invite link opens the app and joins on a real phone | HH-01/02 | Deep link + sign-in on device | Send invite from Pixel 9 to Pixel 6, open link, sign in, confirm household shown |
| Shared line appears on the other phone without refresh | HH-11 | Two real devices on a network | Log a shared line on device A; device B shows it within seconds |
| Haptics and calm motion on settle-up | HH-08 | Physical feel | Settle up on device; confirm one haptic, no jank |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Phase gate run

**Date:** 2026-11-16 (plan 08-26). **HEAD:** `c12d796a` on `phase/08-household` (worktree `fincwin-hh`). Local only; nothing touched production.

**Result: PASS (completed 2026-11-16 after a Docker Desktop restart).** First attempt, kept for the record: INCOMPLETE. The Jest, engine, Deno, lint and type checks are green. The database half (pgTAP and the Realtime spike) could not run: the local Docker engine stopped answering before the run began (`docker ps` / `docker info` time out; the Docker Desktop VM log repeats "Health check ... rootfs/overlayfs/...: no such file or directory" and "backend /time request timed out"). `supabase db reset` sat at `docker container inspect supabase_db_*` for over two hours and was stopped. This is an environment fault, not a test failure. `nyquist_compliant` stays false until the database half runs green right after a fresh `db reset`.

| # | Command | Result | Counts |
|---|---------|--------|--------|
| 1 | `npx supabase db reset && npx supabase test db` | ✅ PASS (re-run after Docker Desktop restart) | Files=110, Tests=2937 |
| 2 | `npm test -- --silent` (whole repo) | ⚠️ 9 suites failed in the batch, all on the 5000 ms jest timeout; **all 9 pass alone** (`--runInBand`) | Batch: 1032 suites passed, 9 failed, 3 skipped (1044); tests 36454 passed, 9 failed, 19 skipped, 15 todo (36497); 11 snapshots; 3626 s |
| 2a | Re-run alone, `npx jest --runInBand <suite>` | ✅ all pass | accountsUndo 10/10, decideLinks 12/12, decideSettingsQueue 8/8, setupBanner 19/19, leaveToChecklist 14/14, useDeviceHomeCurrencyDefault 18/18, shellNavigation 12/12, Fab 11/11, tabsLayoutStable 4/4 |
| 3 | `npm run test:engine -- --silent` (coverage gate) | ✅ PASS | 368 suites passed, 1 skipped (369); 6629 tests passed, 16 skipped, 15 todo (6660); 768 s |
| 4 | `npx supabase start && npm run test:realtime` | ✅ PASS (Realtime container restarted after reset) | 9/9 (scenarios a-i) |
| 5 | `npm run test:deno` | ✅ PASS | 19 passed, 0 failed (read-pdf-statement 11, delete-account 8) |
| 6 | `npm run lint` | ✅ PASS | 0 errors, 1473 warnings (existing) |
| 7 | `npx tsc --noEmit` | ✅ PASS | 0 errors |
| D-45 | `grep -rniE "summary_link\|household_summary\|summaryLink" supabase/migrations src app` | ✅ prints nothing (after fix `c12d796a`) | First run found one unused copy key `rules.summaryLink` in `src/i18n/locales/household/home.ts` (08-12/08-17); removed |

Rows gated on 05.5 (HH-09, SC9: plan 08-25), the Deferred (D-45) row and the SC8 row moved to 08.1 are outside this run by design.

Batch-only timeouts: 2 of the 9 (`shellNavigation`, `tabsLayoutStable`) were edited by Phase 8; the other 7 are not Phase 8 files. None fails alone, so none counts as a real failure.

**Done:** rows 1 and 4 ran green right after a fresh `db reset` on 2026-11-16, under the shared lock.
