---
phase: 02-record
verified: 2026-10-07T00:00:00Z
status: human_needed
score: 7/7 roadmap success criteria verified (code + tests + production evidence); 1 device step pending
overrides_applied: 0
gaps: []
deferred:
  - truth: "Money accounts can be deleted while they have no lines"
    addressed_in: "Follow-up task after Phase 2 (REVIEW-FOLLOWUPS item 21; user decision 2026-10-07)"
    evidence: "Not a Phase 2 requirement; REC-08 only requires create plus balance. Needs a migration and production push."
  - truth: "ACT-02 'archived months' as a real archive concept"
    addressed_in: "DAT-01 (later phase)"
    evidence: "02-CONTEXT.md line 110: met in Phase 2 by the switcher reaching every month that has data; monthsForSwitcher in src/engine/activity/status.ts."
human_verification:
  - test: "Step 20: statement file picker on the iPhone XR (iOS development build)"
    expected: "expo-document-picker opens and a CSV/OFX can be chosen and imported on iOS"
    why_human: "Needs a physical iOS device and Apple Developer enrolment, which has not happened. Android (Pixel 9) walkthrough steps 1-19 were approved 2026-10-07."
---

# Phase 2: Record Verification Report

**Phase Goal:** A user can log and manage their real financial activity against a live backend.
**Verified:** 2026-10-07
**Status:** human_needed (no code gaps; one iOS device step is pending Apple enrolment)
**Re-verification:** No, initial verification

## Evidence re-run by the verifier

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, clean |
| `npx jest` (full) | 143 suites, 4,262 tests, all passing |
| Remote Supabase | not touched; production state taken from docs/acceptance/phase-02-record.md |
| pgTAP, depcruise, lint | not re-run; relied on the acceptance doc (37 files / 678 tests, clean) |

## Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Log, edit and delete income/expense; per-account balance; user categories | VERIFIED | `src/features/record/entry/TransactionSheet.tsx`, `src/data/mutations/transactions.ts`, `accounts/AccountDetailScreen.tsx`, `categories/CategoriesScreen.tsx` and `CategorySheet.tsx`; routes under `app/(app)/`; walkthrough steps 5, 9, 10 pass |
| 2 | Recurring entries generated, with skip or end of one occurrence without deleting the series | VERIFIED | `src/engine/recurring`; migrations `20260926000300_recurring_series.sql` and `...000400_recurring_materialisation.sql` (materialiser plus cron `recurring-materialise-daily` live); `entry/OccurrenceActions.tsx`, `EditScopePrompt.tsx`; walkthrough step 6 |
| 3 | CSV and OFX/QFX import with a format reading, column mapping and reconciliation shown before commit | VERIFIED | `src/engine/{csv,ofx,statement}`; `features/record/import/{FormatStep,MappingStep,ReviewStep}.tsx`, `formatSentence.ts`, `useStatementImport.ts`; onboarding entry `app/(app)/setup/history.tsx` and later entry `app/(app)/import.tsx`; walkthrough steps 1-3, 16, 18 |
| 4 | Month list, month switching, cross-month search, filters, bulk delete | VERIFIED | `activity/{ActivityScreen,MonthSwitcher,SearchBar,FilterSheet,BulkBar}.tsx`; `src/db/transactions.ts` escaped `ilike` search plus `pg_trgm` index; walkthrough steps 7-8. "Archived months" is met by the switcher reaching every month with data, as 02-CONTEXT line 110 specifies (real archiving is DAT-01) |
| 5 | Undo of the last 12 changes from toast and history; refusal when another member changed the record | VERIFIED | `src/engine/undo`; migration `20260926000500_undo_log.sql`; `history/{HistoryScreen,UndoToastHost,undoCopy}.tsx`; walkthrough steps 11-12 (refusal observed as "changed elsewhere" after a server-side change) |
| 6 | Overdrawn, beyond-overdraft and over-card-limit shown plainly; card statements import with correct signs | VERIFIED | `src/engine/accounts` (standing), `accounts/standingText.ts`, `AccountSheet.tsx` limit fields, account limit columns live in production; OFX LEDGERBAL/AVAILBAL orientation handling per D-53 amendment; walkthrough steps 15-16 |
| 7 | Transfers as a linked pair, import suggests pairs, transfers excluded from income/spending | VERIFIED | `src/engine/transfer`; migration `20260926000700_transfer_pairs.sql` (trigger `transfer_pair_check` live); `MatchesStep.tsx`; engine month totals exclude transfers; walkthrough steps 17, 19 |

**Score:** 7/7

## Decision amendments and follow-up contract checks

| Item | Status | Evidence |
|---|---|---|
| 2026-10-06 decision: one undo removes a new entry and its series (follow-up 20) | VERIFIED | `TransactionSheet.tsx` lines 262-323 pass `anchorIsNew: true` for a brand-new entry and `false` for an existing one; `src/db/recurringSeries.ts:212` sends `p_anchor_is_new`; the migration `20260926000400` handles it |
| D-53 amended for OFX cards (both orientations tried) | VERIFIED | Described in followups; walkthrough step 16 passes; the unit suites pass |
| Toast: no auto-dismiss under a screen reader (follow-up 9) | VERIFIED | `toastDurationMs` and `isScreenReaderEnabled` used in `src/state/undoToast.ts`, `UndoToastHost.tsx` and `ToastView.tsx`; walkthrough step 14 |
| `undoLabelText` used for history (follow-up 10) | VERIFIED | Used in `AccountDetailScreen`, `ActivityScreen`, `CategoriesScreen` and others |
| Series RPCs carry their own undo step (follow-up 1) | VERIFIED | `src/db/recurringSeries.ts`, `src/data/mutations/recurringSeries.ts` |
| Dev build with new native modules (item 18a) | VERIFIED | The walkthrough ran on a rebuilt dev client on the Pixel 9 (date picker and file picker worked) |
| Follow-up 16: trigger refusing a leg that already has a `transfer_id` | UNCERTAIN, non-blocking | Client-side enforcement only, per the followup. Not re-checked in SQL, but pgTAP is green and walkthrough step 19 passes |
| Items 15, 17, 19 (backlog, retention, engine infos) | Open by design | Assigned to later phases or the backlog |

## Requirements Traceability

All 24 IDs are claimed by at least one plan's `requirements:` frontmatter (plans 02-01 to 02-40; 02-31 claims all 24). Every one appears in REQUIREMENTS.md and maps to Phase 2. There are no orphans, because the REQUIREMENTS.md traceability table assigns no other IDs to Phase 2 (ACT-06 belongs to Phase 7).

| Req | Status | Implementation evidence | Acceptance (device) |
|---|---|---|---|
| REC-01 expense | SATISFIED | TransactionSheet, transactions mutations, db/transactions.ts | step 5 |
| REC-02 income | SATISFIED | same | step 5 |
| REC-03 edit | SATISFIED | TransactionSheet edit path, version-checked patches | steps 5-6 |
| REC-04 delete | SATISFIED | delete hook, soft delete via `transactions_active` | steps 8, 19 |
| REC-05 recurring | SATISFIED | engine/recurring, series RPCs, materialiser cron | steps 4, 6 |
| REC-06 skip/end occurrence | SATISFIED | OccurrenceActions, `end_recurring_series`, skip hook | step 6 |
| REC-07 categories | SATISFIED | CategoriesScreen, CategorySheet, categories migration plus seeding (live check: 0 profiles under 15) | step 9 |
| REC-08 accounts and balances | SATISFIED | AccountsScreen, AccountSheet, AccountBalanceBlock, engine/accounts | step 10 |
| REC-09 import CSV/OFX/QFX | SATISFIED | engine/csv, engine/ofx, ImportScreen, onboarding and later entries | steps 1-3, 16 (iOS picker pending, step 20) |
| REC-10 preview and mapping correction | SATISFIED | MappingStep, ReviewStep | steps 2-3 |
| REC-11 undo 12 | SATISFIED | engine/undo, undo_log migration, UndoToastHost, HistoryScreen | steps 5, 11 |
| REC-12 refusal with explanation | SATISFIED | refusal descriptor plus history copy | step 12 |
| REC-13 format reading in plain words | SATISFIED | engine/statement, FormatStep, formatSentence.ts | steps 15-16 |
| REC-14 notations and single sign rule | SATISFIED | `parseNotatedAmount`, original values kept (import provenance columns live) | steps 15-16 |
| REC-15 reconciliation | SATISFIED | engine/statement reconciliation, ReviewStep | step 15 |
| REC-16 dedupe | SATISFIED | engine dedupe (FITID 7-day window), ReviewStep | steps 3, 19 |
| REC-17 limits and standing | SATISFIED | account limit columns, engine/accounts standing, standingText.ts | steps 15-17 |
| REC-18 transfers | SATISFIED | engine/transfer, transfer_pairs migration, MatchesStep, totals exclusion | steps 17, 19 |
| ACT-01 month list | SATISFIED | ActivityScreen, read RPCs | step 7 |
| ACT-02 switch months | SATISFIED | MonthSwitcher, `monthsForSwitcher`; archived months by the CONTEXT line 110 interpretation | step 7 |
| ACT-03 search all months | SATISFIED | `searchTransactions` with escaped ilike plus trigram index | step 7 |
| ACT-04 filters | SATISFIED | FilterSheet, engine/activity/filters.ts | step 7 |
| ACT-05 bulk delete | SATISFIED | BulkBar, bulk planner | step 8 |
| ANL-05 funnel measurable | SATISFIED | Typed catalogue events (`account_created`, `onboarding_history_choice`, `transaction_added`, `import_started`, `import_committed`, and others) emitted from AccountSheet, TransactionSheet, useStatementImport and SetupHistoryScreen. The catalogue is finite-typed, so no amounts or payees can be included | n/a (no analytics dashboard check in the walkthrough) |

## Findings

| Severity | Finding |
|---|---|
| WARNING (bookkeeping) | `.planning/REQUIREMENTS.md` still shows all 24 Phase 2 requirements as `[ ]` and `Pending` (checkboxes lines 108-133 and traceability rows 380 and 418-440). They should be ticked and marked Complete when the phase closes. This is not a code gap. |
| WARNING (human) | Walkthrough step 20 (iPhone XR file picker) is pending Apple enrolment. REC-09's iOS path is unverified on a device. The Android path was approved. |
| INFO | `deferred-items.md` records a flaky `YouScreen` timeout under full-suite load (a Phase 1 test). It did not occur in this verifier's full run (143/143). |
| INFO | The acceptance doc cites 141 suites / 4,223 tests at gate time; the current tree has 143 / 4,262, so tests were added afterwards (the walkthrough fixes). The count is consistent with the brief. |
| INFO | Anti-pattern scan of `src/features/record`, `src/engine`, `src/db` and `src/data` (non-test files) found no TODO, FIXME or "not implemented" markers. |
| INFO | Account deletion for empty accounts is a user-approved follow-up (item 21). It is outside the Phase 2 requirements and is not a gap. |

## Gaps Summary

No must-have is failed. All 7 roadmap success criteria and all 24 requirement IDs have code, automated-test and production or device evidence. Remaining before the phase is fully closed:

1. The iOS file-picker check (step 20) on the iPhone XR, once Apple enrolment allows an iOS dev build.
2. Tick the REQUIREMENTS.md checkboxes and traceability rows for the 24 IDs.

---

_Verified: 2026-10-07_
_Verifier: Claude (gsd-verifier)_
