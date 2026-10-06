# Phase 2 — Follow-ups from the Wave 1–5 review fixes

**Written:** 2026-10-06, after the engine, database and client fix passes were merged into `phase2/record`.
**Who reads this:** executors of plans 02-16 onward. Each item names the plan it lands in. Check it off in that plan's SUMMARY.

The three review files (`02-REVIEW-W1-5-{engine,db,client}.md`) give the per-finding detail. This file lists only what later plans must do differently because of those fixes.

## Contract changes later plans must follow

| # | Change | Affects | Source |
|---|--------|---------|--------|
| 1 | The three series RPCs (`create_recurring_series`, `edit_recurring_series_from`, `end_recurring_series`) now record their own undo step in the same transaction. Pass a `SeriesUndoLabel` to the `src/db/recurringSeries.ts` wrappers and use the returned `undoStepId`. Do **not** call `insertUndoStep` or `inverseOfSeriesChange` for these actions. Keep the same step id across paused-mutation replays — it is the replay key. | 02-18 | D-WR-04, D-WR-03 |
| 2 | `apply_patches` only recognises a replay as `already-applied` when the call carries its undo step. Every `applyPatches` caller should send `p_undo_step`; a write sent without one can still conflict with itself on replay. | 02-16, 02-17, 02-18, 02-40 | D-WR-03 |
| 3 | `serialiseOps` refuses an op without a positive integer `expectedVersion`. Always supply it. | all mutation plans | D-CR-02 |
| 4 | `transferEditPatches` now returns `{ ok: true, patches } \| { ok: false, error }` (new `date-mismatch` error). | 02-40 | E-WR-11 |
| 5 | `ConvertedRow.availableDelta` is now `availableSigned`. | 02-26, 02-39 | E-WR-07 |
| 6 | `planBulkPatch` throws on a duplicate `(entity, id)`. Deduplicate before calling. | 02-16 | E-WR-10 |
| 7 | Hooks for delete, mark-paid and skip return a `null` stepId when there is no honest before-state. Never offer Undo for a `null` stepId. | 02-28, 02-22 | C-WR-05 |
| 8 | `ImportMarkPaid` has a new required `line` field; `ImportLink` takes `storedTransferId`. The import preview must supply both. | 02-26, 02-27, 02-39 | C-CR-01, E-WR-06 |

## UI work that later plans own

| # | Item | Plan | Source |
|---|------|------|--------|
| 9 | Toast host: use `toastDurationMs(kind, screenReaderEnabled)` with `AccessibilityInfo.isScreenReaderEnabled`. No auto-dismiss while a screen reader runs (D-31). | 02-28 | C-CR-02 |
| 10 | History screen and toast: render undo labels through `undoLabelText()` so nameless rows get the `undo.labelUnnamed.*` copy. | 02-28 | C-WR-06 |
| 11 | History copy: handle two new refusal shapes — a series refusal with `updated_by = null` (the app has since scheduled newer occurrences), and D-WR-02 refusals with both `updated_by` and `record_name` null. | 02-28 | D-CR-01, D-WR-02 |
| 12 | Import preview: cap accepted suggestions so one finalize stays under the 6000-op limit. | 02-27 | C-IN-02 |
| 13 | Sheet accessibility label and the `AmountDisplay` `inkDim` tone contrast. | 02-20, 02-22 | C-IN-05 |
| 14 | Register the remaining unregistered mutation keys as their waves land; add a test for a queued undo-record landing after an undo-apply once `undoStep` is registered. | 02-16 | C-IN-06 |

## Behaviour to expect

- **Card imports (E-CR-04, D-53 amended):** OFX card files with both LEDGERBAL and AVAILBAL try both orientations. When both imply a valid limit the profile is ambiguous and the user confirms once per layout. Expect more first-time confirmations for cards under their limit.
- **Series undo (D-CR-01):** undoing a series edit or end is refused once the daily job has generated rows from the edited template — in practice after the next month boundary.
- **FITID duplicates (E-WR-05):** a FITID only counts as a duplicate within a 7-day date window.

## Open items outside Phase 2 plans

| # | Item | Where |
|---|------|-------|
| 15 | Add an exact `undoStepExists(client, id)` lookup to `src/db`, so the client's retried-finalize check (C-WR-02) no longer depends on the newest 12 steps. Optionally make `apply_patches` itself return `applied` when `p_undo_step.id` already exists. | small follow-up, any later plan touching `src/db/undoLog.ts` |
| 16 | Confirm the transfer-pair trigger refuses a leg that already has a `transfer_id`; E-WR-06 is enforced client-side only. | follow-up in `20260926000700_transfer_pairs.sql` |
| 17 | Decide whether soft-deleted rows get a hard retention limit (D-WR-06 removed the indefinite pin from refused steps but added no time cap). | Compliance phase |
| 18 | Check where `pg_trgm` is installed before `db push`. | 02-31 preflight |
| 18a | Plan 02-20 added the native module `@react-native-community/datetimepicker` 9.1.0. Build a new development build (EAS) before the 02-31 device check, or the date picker will not open. | 02-31 device check |
| 19 | 12 engine info items (IN-01..IN-12) are unfixed; each needs a design call. See the engine review file. | backlog |
