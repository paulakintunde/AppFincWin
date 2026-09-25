---
phase: 2
slug: record
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 via `jest-expo` ~57.0.5, `fast-check` / `@fast-check/jest` (property tests), pgTAP (`supabase/tests/database/*.test.sql`) |
| **Config file** | `jest.config.js` (per-directory coverage thresholds) |
| **Quick run command** | `npm test -- <changed-file-pattern>` |
| **Full suite command** | `npm run test:coverage` and `supabase test db` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <changed-file-pattern>`
- **After every plan wave:** Run `npm run test:coverage` and `supabase test db`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor as tasks are created. Baseline mapping from research:

| Requirement | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|-------------------|-------------|--------|
| REC-01/02 | unit + property | `npm test -- src/data/mutations/__tests__/transactions.test.tsx` | ❌ W0 (extend) | ⬜ pending |
| REC-03/04 | unit | `npm test -- src/data/mutations/__tests__/transactions.test.tsx` | ❌ W0 (extend) | ⬜ pending |
| REC-05/06 | property + pgTAP | `npm test -- src/engine/recurring` / `supabase test db` | ❌ W0 | ⬜ pending |
| REC-07 | unit + pgTAP (RLS) | `npm test -- src/db/__tests__/categories.test.ts` / `supabase test db` | ❌ W0 | ⬜ pending |
| REC-08 | unit | `npm test -- src/data/queries/__tests__/accounts.test.ts` | ❌ W0 | ⬜ pending |
| REC-09/10 | property | `npm test -- src/engine/csv` | ❌ W0 | ⬜ pending |
| REC-11/12 | unit + pgTAP (RLS) | `npm test -- src/engine/undo` / `supabase test db` | ❌ W0 | ⬜ pending |
| ACT-01..05 | unit + pgTAP | `npm test -- src/data/queries/__tests__/activitySearch.test.ts` | ❌ W0 | ⬜ pending |
| ANL-05 | unit (typed catalogue) | `npm test -- src/services/analytics` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engine/recurring/__tests__/schedule.test.ts` — property tests for REC-05/06 (weekly, biweekly, monthly clamped, quarterly, yearly, month-end clamping)
- [ ] `src/engine/csv/__tests__/tokenize.test.ts`, `detectColumns.test.ts`, `inferFormat.test.ts` — property tests for REC-09/10
- [ ] `src/engine/categorize/__tests__/guessCategory.test.ts` — unit tests for keyword and learned-description rules
- [ ] `src/engine/undo/__tests__/computeInverse.test.ts` — inverse of every mutation kind
- [ ] pgTAP files (next free numbers) — RLS isolation for `categories`, `recurring_series`, `undo_log`; soft-delete read-path filtering
- [ ] `supabase/tests/fixtures/recurring-schedule-cases.json` — shared fixture proving TS and plpgsql schedule maths agree
- [ ] `jest.config.js` — add `recurring`, `csv`, `categorize`, `undo` to the 100% coverage bucket

*No new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSV file picked from device storage | REC-09 | Native document picker needs a real device or emulator | Dev build on Android emulator / iPhone XR: Import CSV, pick a bank export, confirm preview |
| Undo toast timing and haptics | REC-11 | Haptics and toast feel need a real device | Add a transaction, tap Undo on the toast, confirm the row disappears |
| Household conflict refusal on undo | REC-12 | Needs two signed-in household members | Member A edits, member B edits the same row, member A undoes; confirm the refusal copy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
