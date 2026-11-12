---
phase: 8
slug: household
status: draft
nyquist_compliant: false
wave_0_complete: false
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
- **Phase gate (SC7, blocking):** `89_household_privacy_two_user.test.sql` green before any invite-flow PR merges
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement-level map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| SC7 (CMP-F18/ARC-22) | B cannot read/update/delete/RPC-read/view-read A's personal rows, every household table | pgTAP two-user | `supabase test db` (89_household_privacy_two_user) | ❌ W0 | ⬜ pending |
| SC7 (live/export) | B gets no Realtime events for A's personal rows; export excludes them | integration + Jest | `npm run test:realtime`; `npx jest src/data/__tests__/exportManifest` | ❌ W0 | ⬜ pending |
| HH-01 | Invite 7-day expiry, single use, cancel, owner-only, 6-member cap race | pgTAP | 90_household_invites | ❌ W0 | ⬜ pending |
| HH-15 | 6th wrong code refused, counter persists, hashed at rest, no oracle | pgTAP | 90_household_invites | ❌ W0 | ⬜ pending |
| HH-02 | Joiner sees only shared rows; move-in keeps rows personal | pgTAP | 91_household_join_movein | ❌ W0 | ⬜ pending |
| HH-03 | Colour unique, role label ≤24, weight 0 allowed, all-zero refused | pgTAP + Jest | `npx jest src/engine/household` | ❌ W0 | ⬜ pending |
| HH-04/05 | Split rules; shares sum to total; stored split not recomputed | fast-check + pgTAP | `npx jest src/engine/split`; 92_household_splits | extend | ⬜ pending |
| HH-06 | Category default applied when sharing | Jest + pgTAP | `npx jest src/features/household` | ❌ W0 | ⬜ pending |
| HH-07 | Per-pair balances; settled lines excluded | Jest/fast-check | `npx jest src/engine/household` | ❌ W0 | ⬜ pending |
| HH-08 | Pending/confirm, day-7 reminder, day-14 lapse idempotent; settlements not spend/income | pgTAP + Jest | 93_household_settlements | ❌ W0 | ⬜ pending |
| HH-09 | Own vs household toggle uses the one my-share function | RNTL | `npx jest src/features/household` | ❌ W0 | ⬜ pending |
| HH-10 | Hidden names fall back to colour name everywhere | Jest + pgTAP | `npx jest src/engine/household/memberLabel` | ❌ W0 | ⬜ pending |
| HH-11 | Live appearance; reconcile never regresses; offline-mid-edit | fast-check + two-client spike | `npx jest src/data/realtime`; `npm run test:realtime` | ❌ W0 | ⬜ pending |
| HH-12 | Summary link expiry/revoke, aggregates only | pgTAP | 94_household_summary_link | ❌ W0 | ⬜ pending |
| HH-13 | Leave/remove/transfer; open balance kept "(left)" | pgTAP | 95_household_leave_remove | ❌ W0 | ⬜ pending |
| HH-14 | Account delete: owner handoff, personal erased, shared kept, balances unchanged | pgTAP (extend 36) | `supabase test db` | extend | ⬜ pending |
| SC8 | Partner opt-in off by default; partners' Fits never exceed shared money | fast-check | `npm run test:engine` | ❌ W0 (after 05.5 gate) | ⬜ pending |
| SC9 | One my-share source; settlements excluded; owed-to-you not spendable | Jest property | `npm run test:engine` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/database/89_household_privacy_two_user.test.sql` + meta-test enumerating every `household_id` table
- [ ] `src/data/realtime/` module, `reconcile.test.ts` (fast-check), `test:realtime` script and Jest config
- [ ] `src/engine/household/` (balances, my-share picture, countsForMe interface, memberLabel)
- [ ] Extended `allocate` tests for zero weights
- [ ] Gate task confirming 05.5 (`countsForMe`, BO-07 contract tests) landed
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
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
