/**
 * Undo domain types (REC-11/REC-12, D-23...D-28, D-50, D-55). One user action is one
 * `UndoStepDraft`: a labelled, ordered list of `PatchOp`s that reverse it. Every op
 * carries the record `version` the forward step left behind (`expectedVersion`), so the
 * server can refuse a step when any touched record moved on since (D-26) -- the same
 * optimistic-concurrency mechanism Phase 1 already uses for ordinary writes.
 *
 * This module has no I/O and no knowledge of the server: it is the pure vocabulary that
 * `inverse.ts` and `history.ts` build on, and that plan 02-09's `apply_patches` RPC
 * consumes (as untrusted input -- see the threat model in 02-05-PLAN.md).
 */

/** The entities an undo step can touch (transfers are two `transactions` rows; 05: Decide checks, debts and decision links). */
export type UndoEntity = 'transactions' | 'categories' | 'recurring_series' | 'accounts' | 'category_rules' | 'decide_checks' | 'debts' | 'decide_links' | 'decide_changes' | 'savings_goals';

/** A patch value as it travels over the wire to `apply_patches`. */
export type PatchValue = string | number | boolean | null;

/** Server-substituted `now()` (plan 02-09), used wherever an inverse sets a timestamp. */
export const NOW_SENTINEL = '$now' as const;

/** One version-conditional patch, as `apply_patches` (plan 02-09) expects it. */
export interface PatchOp {
  entity: UndoEntity;
  id: string;
  expectedVersion: number;
  patch: Readonly<Record<string, PatchValue>>;
}

// transfer* added for D-50: creating, editing or deleting a transfer is one undo step
// covering both legs.
// 05: Decide (DCU-04 abandon, D-09 Go ahead, D-11 remove, D-12 unlink; D-27 changes, D-34 goal tags)
// 05-131 (D-101, D-103): pot add/edit/delete/done/reopen and the housing marker on a debt each name one undo step.
// 05-54: the refresh names its steps checkCleared, checkDeleted, decisionDeleted, changeDeleted; the old checkAbandoned, decisionRemoved and changeRemoved stay because saved undo rows still carry them.
export const UNDO_LABEL_KEYS = ['added','edited','deleted','deletedMany','markedPaid','markedPaidMany','markedUnpaidMany','skipped','imported','seriesCreated','seriesEdited','seriesEnded','categoryAdded','categoryEdited','categoryArchived','categoryMerged','accountAdded','accountEdited','accountArchived','transferAdded','transferEdited','transferDeleted','cloned','pasted','markedMonthly','monthAdded','accountDeleted','addedMany','ruleAdded','ruleEdited','ruleRemoved','checkAbandoned','decisionWritten','decisionRemoved','lineUnlinked','changeAdded','changeEdited','changeRemoved','transferTagged','transferUntagged','checkCleared','checkDeleted','decisionDeleted','changeDeleted','potAdded','potEdited','potDeleted','potDone','potReopened','debtHousingChanged'] as const;

export type UndoLabelKey = (typeof UNDO_LABEL_KEYS)[number];

/** Interpolation values for a step's i18n label (D-24, e.g. "Deleted 30 lines"). */
export interface UndoLabelParams {
  n?: number;
  name?: string;
}

/** One user action (D-24): a labelled, ordered list of inverse ops. */
export interface UndoStepDraft {
  id: string;
  labelKey: UndoLabelKey;
  labelParams: UndoLabelParams;
  ops: PatchOp[];
  /** Every id touched by `ops`, unique, in first-seen order. */
  touchedIds: string[];
}

/** Denial-of-service guard (T-02-05-03): mirrors the server-side size check (plan 02-09). */
export const MAX_UNDO_OPS = 6000;

/**
 * The shape the data layer converts a series RPC's (plan 02-08) result into, so
 * `inverseOfSeriesChange` never has to know about Supabase response shapes.
 */
export interface SeriesChangeSet {
  /** `before === null` means the series itself was created by this change. */
  series: { id: string; versionAfter: number; before: Readonly<Record<string, PatchValue>> | null };
  /** Occurrence rows the change created. */
  inserted: readonly { id: string; version: number }[];
  /** Occurrence rows the change soft-deleted. */
  softDeleted: readonly { id: string; versionAfter: number }[];
  /** Existing rows the change linked to the series (D-09, D-21). */
  linked: readonly { id: string; versionAfter: number }[];
}

export type UndoStepStatus = 'available' | 'undone' | 'refused';

/** Why a step was refused (D-26), and enough context to describe it (D-26, D-28). */
export interface UndoConflict {
  entity: UndoEntity;
  id: string;
  updatedBy: string | null;
  recordName: string | null;
  builtinKey: string | null;
  reason: 'changed' | 'not-found';
}
