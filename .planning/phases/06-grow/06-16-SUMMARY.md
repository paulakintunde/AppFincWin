---
phase: 06-grow
plan: 16
subsystem: ui
tags: [grow, safety-net, lines, d-07, d-27, preview, soft-delete, undo]
requires: ["06-10", "06-12", "06-14", "06-15", "06-22"]
provides:
  - "app/(app)/grow/safety-net.tsx and SafetyNetScreen (G04), NetSizeSheet (G04a), NetMonthSheet, FirstOpenNetSheet (D-07)"
  - "netPreview.ts: previewNetSize, withNetSize, netStateOf, essentialMonthOf, coverWeeks (pure)"
  - "app/(app)/grow/lines.tsx, GrowLinesScreen (G10), LineSheet (G10a) on the existing lines store (D-27)"
  - "useRemoveDebt (soft delete) and undo label debtRemoved"
  - "Grow detail routes registered outside the Decide gate"
affects: [06-19, 06-20]
key-files:
  created:
    - app/(app)/grow/safety-net.tsx
    - app/(app)/grow/lines.tsx
    - src/features/grow/safetyNet/ (SafetyNetScreen, NetSizeSheet, NetMonthSheet, FirstOpenNetSheet, netPreview + 2 test files)
    - src/features/grow/lines/ (GrowLinesScreen, LineSheet + test)
    - src/features/grow/__tests__/growRoutes.test.ts
  modified:
    - src/data/queries/decideV3.ts
    - src/data/mutations/debts.ts
    - src/data/keys.ts
    - src/engine/undo/types.ts
    - src/features/grow/home/{GrowHome,GoalRow,ToolsRow}.tsx
    - src/features/grow/debts/{DebtDetailScreen,DebtsSegment,AddDebtSheet}.tsx
    - src/features/grow/investing/{HoldingDetailScreen,InvestingSegment,AddHoldingSheet}.tsx
    - src/features/grow/goals/{GoalDetailScreen,NewGoalSheet}.tsx
    - src/features/record/accounts/{AccountSheet,AccountDetailRows}.tsx
    - src/i18n/locales/en.ts
    - app/(app)/_layout.tsx
key-decisions:
  - "The size preview runs the same computeV3 Decide uses, on a copy of the snapshot source whose flagged goal has the new size. useDecideV3 now also returns the source and settings it was built from (optional fields, read only) so Grow can do this without a second build path."
  - "Only NetSizeSheet in create mode sends is_safety_net (one line in the file). A flagged row with no size (case B) and any existing net take the edit path (useEditGoal). pgTAP 92's one-live-flagged-goal rule is therefore never at risk from this screen."
  - "'What it covers' uses the engine's own starter (one month of essential costs) from the prepared inputs, rounded to half weeks."
  - "Remove debt is a soft delete with its own undo label. No server change was needed."
requirements-completed: [GRW-02, GRW-03]
completed: 2026-11-06
---

# Phase 6 Plan 16: Safety net screens and Your money rules Summary

The safety net as one flagged, always-locked goal (G04) with a size sheet that re-judges Decide's open checks before saving (G04a), the one-time "We moved your safety net here" confirm (D-07), and "Your money rules" (G10) on the existing lines store, plus the wave 6 follow-ups (routes, FAB wiring, copy, a real soft delete for debts).

## Commits

| Task | Commit | Result |
|------|--------|--------|
| 1 Safety net screen, size sheet with preview, first-open sheet | 651535dd | 38 new tests |
| 2 Your money rules (G10, G10a) | d5750399 | 10 new tests |
| X-a Remove debt as a real soft delete | 6239b987 | 3 mutation tests, label tests |
| X-b Routes, strings, APY copy, goal row | f3a72362 | route test, string tests |

Task 1's commit also carries the Task X FAB wiring in `GrowHome.tsx` (same file, mounted together with FirstOpenNetSheet) and all new `en.ts` strings for the whole run.

## What was built

- **G04 Safety net.** Locked badge ("Locked, no Decide answer spends it"), saved of size, a blue bar, the explainer card, Size / Each month ("$100 · reaches it by <month>") / Kept in rows, "What it covers", Add money / Take some out (06-22's MoneyMoveSheet with its D-08 confirm), History with Expected rows the user confirms, the footer. There is no Remove action. No net or no size shows $0 and "Set a size".
- **G04a Size sheet.** Four radio rows (what you set, 1 month, 3 months of going out, own amount), a protect switch, and a preview card. Rows read like "Sofa $X · Fits → Tight" and announce "Sofa, now Tight" through `useSettledLabel`. Create (no net): one `useSaveGoalPlan` call with `{ name, currency, locked: true, protect, target, ready_by: null, monthly_amount: null, opening_saved: 0, is_safety_net: true }` and `series: null`. Edit: `useEditGoal` with the row and `{ target }` (plus `protect` only if changed). A size below what is saved is refused in the sheet.
- **Each month.** Amount, "Record it each month for me to confirm" switch and day. One `useSaveGoalPlan` with the net's version: the series payload (existing record handed back at the new amount, or a new one from another account) when on, `series: null` when off.
- **D-07 FirstOpenNetSheet.** Reads the flagged goal's current values from `useGoalsRead` while open. "Looks right" calls `useConfirmSafetyNet` once; "Change it" opens the size sheet; Close and the backdrop dismiss for the app session only (module flag), so an unconfirmed net asks again on the next launch. Skipped when `needsNetConfirm` is false.
- **G10 Your money rules.** Safety net row (pushes `/grow/safety-net`), debt payments at most (value, "Now N%"), investing at least and saving at least ("Met · $200 set up" or "Not yet · $X set up"), the note that these are the user's own rules. A rule with no figure of its own shows the engine default with a "default" tag.
- **G10a LineSheet.** Stepper in 1-point steps for the debt rule, amount field for the others, "Use this rule" switch, "Save rule". Writes only `dsr_line`, `investing_floor` or `saving_floor` through the existing `useUpdateDecideSettings` (currency stamped as Decide's editor does). Light haptic; toast whose Undo writes the previous value back.
- **Entry to G10.** A "Your money rules" row on the Grow Tools card (see deviations).

## Task X (wave 6 follow-ups)

1. **Routes.** `grow/debt/[id]`, `grow/holding/[id]`, `grow/safety-net`, `grow/lines` declared as `Stack.Screen` next to `grow/goal/[id]`, before `Stack.Protected`. `growRoutes.test.ts` asserts file exists and declaration precedes the gate.
2. **FAB wiring.** Debts FAB sets `addDebtOpen` and renders `DebtsSegment addOpen/onAddClosed`; Investing FAB opens an `AddHoldingSheet` in the home overlay. The dead `onAdd` props are gone from both segments. GrowHome tests assert each FAB opens its sheet.
3. **APY copy.** Strings moved to `en.accounts.sheet.rateLabel/rateHelp/rateInvalid` and `en.accounts.detail.interest/interestValue`, used through `t()`. The constants are deleted. The file held the rate rules too, so it was renamed `accountRate.ts` (rules only) rather than deleted. Add holding has its own `grow.investing.add.rate` ("Yearly rate (optional)").
4. **GoalRow.** Uses `grow.home.goalRowNotReached` when a monthly amount, an unreached target and no reach month (the engine's never-reached signal) coincide. Test: $1 a month on Lisbon reads "$640 of $1,800 · $1 a month doesn't reach the target".
5. **Missing strings, added and used.** "Confirm" on the Expected row sheet; `MM/YYYY` placeholder; spoken names for the eight icon tiles ("Calendar icon" and so on); the unlocked-goal note "Unlocked: this goal's $640 counts as spare money in Decide." (shown instead of the lock helper when unlocked); "Debt not found" and "Holding not found" headings with a way back; a debt row with no due day ("6.9% · $312 a month"); toasts "Debt saved" and "Debt removed".
6. **Debt remove.** `useRemoveDebt` sets `deleted_at` through `updateDebt`/`patchDefaults`; the debt leaves the cache at once; one undo step with label `debtRemoved` (patch `deleted_at: null`). `debtRemoved` appended to `UNDO_LABEL_KEYS` with named and unnamed English; `growUndoLabels` and `types.test` updated (20 Grow keys). **Server check:** grepped the migrations for label enforcement. `undo_log.label_key` only has the shape check `^[a-zA-Z]{1,40}$` (`debtRemoved` passes); `apply_patches` stores the client label without a list, and `grow_check_undo_step` applies only to the Grow RPCs, which this key does not use. `debts.deleted_at` is in the `apply_patches` debts allow-list. No DB change needed. The debt screen has no separate "Mark paid off" action (the old stopgap was the only path), so none was kept.

## Deviations from Plan

**1. [Design] `kind: 'pot'` is not in the create payload.** `GoalPlanGoal` omits `kind` (the RPC defaults it), so the test asserts the exact `fields` the hook takes (`is_safety_net: true, locked: true, protect: true, opening_saved: 0, target`) and the hook-level `series: null`.

**2. [Design] G10 entry is a Tools-card row, not a header overflow.** The tab header has no overflow component and `TabRootScreen` only has a large-header slot. A Tools row reaches the screen from every segment with no new header pattern. Easy to move if the owner wants the overflow.

**3. [Rule 3] `useDecideV3` returns `source` and `v3` (optional fields).** Needed to re-judge checks without a second builder. No behaviour change to existing callers.

**4. [Rule 3] Task 1's commit contains the GrowHome FAB wiring and every new `en.ts` string.** Both files are shared by Task 1 and Task X; splitting them would have needed hunk staging.

**5. [Design] `accountRateText.ts` renamed to `accountRate.ts`** instead of deleted, because it also holds `kindHasRate`, `validRateInput`, `rateToStore`.

**6. [Rule 1 lint] SafetyNetScreen history is computed unmemoised.** The React Compiler lint refused the manual `useMemo` over values derived from the goal row; a pure `historyOf` called directly passes.

## Needs the owner's eye

- **"Use this rule" off writes null, which in the lines store means "use the engine default", not "no rule".** The plan and the spec say off saves null and the note reads "Answers stop checking this." Decide's builder still applies the default (for example 36% for debt payments) when the column is null. The row after saving shows the default with a "default" tag, but the sheet's note overstates what happens. Making a rule truly off needs an engine/limits change, which was out of scope. Suggest either rewording the note or adding a real off state.
- G10a's "Open checks with this rule" preview card from the spec is not built (the plan's behaviour list does not include it). The strings (`previewTitle`, `previewRow`) exist and are unused.
- The Grow tab is still hidden, so the screens were exercised in Jest only, not on a device.

## Known Stubs

None. Every figure on the new screens is read from the same hooks Decide uses.

## Threat Flags

None beyond the plan's register. T-06-16-01: preview before save plus Undo toast. T-06-16-04: create only when no flagged row exists; case B tested to make no insert. T-06-16-02: test reads the lines sources and refuses any direct table access. T-06-16-03: "your own rules ... doesn't set them for you", no advice words (checked by test and copyLint).

## Verification

- `npm run typecheck`, `npm run depcruise`: clean. `npx eslint src app`: 0 errors (existing warnings).
- Jest, whole folders `src/features/grow`, `src/i18n`, `src/engine/undo`, `src/theme`, plus `src/features/record/accounts`, `src/data/mutations`, `src/data/queries`: 143 suites, 26,964 tests pass (2 skipped, pre-existing).
- Acceptance greps: no `Remove` in `SafetyNetScreen.tsx`; `is_safety_net: true` once in `NetSizeSheet.tsx`; no `from('...')` table access under `src/features/grow/lines`.
- Not run: full coverage (per milestone rule), device check, `supabase db push` (no migration touched).

## Self-Check: PASSED

Files exist; commits 651535dd, d5750399, 6239b987 and f3a72362 exist.
