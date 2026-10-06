// REC-11, REC-12, D-26: pure copy helpers turning an undo step's stored label and a refusal
// into sentences. Pure over `t`, so the toast host and the History screen share them.
// Declarative voice only: it says what happened, never what the user should do.
import type { TFunction } from 'i18next';
import { describeRefusal } from '@/engine/undo';
import type { RefusalDescription, UndoConflict, UndoLabelKey, UndoLabelParams } from '@/engine/undo';
import { undoLabelText } from '@/i18n/undoLabel';

// Keys are built at runtime (the engine's label key set), so they sit outside the typed catalogue.
type LooseT = (key: string, params?: Record<string, string | number>) => string;
const loose = (t: TFunction): LooseT => t as unknown as LooseT;

/** C-WR-06: nameless rows get the `undo.labelUnnamed.*` copy; plural keys use count = params.n. */
export function stepLabel(t: TFunction, labelKey: UndoLabelKey | string, params: UndoLabelParams): string {
  const text = undoLabelText(labelKey, params);
  return loose(t)(text.key, text.params);
}

function recordText(t: TFunction, d: RefusalDescription): string {
  const l = loose(t);
  switch (d.record.kind) {
    case 'name':
      return d.record.name;
    case 'builtin':
      return l(`categories.builtin.${d.record.key}`);
    case 'entity':
      return l(`undo.refusal.record.${d.record.entity}`);
  }
}

export function refusalText(t: TFunction, d: RefusalDescription): string {
  const l = loose(t);
  const record = recordText(t, d);
  switch (d.actor) {
    case 'member':
      return d.actorName
        ? l('undo.refusal.member', { person: d.actorName, record })
        : l('undo.refusal.memberUnknown', { record });
    case 'self':
      return l('undo.refusal.self', { record });
    case 'system':
      return l('undo.refusal.system', { record });
  }
}

/**
 * Refusal sentence straight from a conflict. A series refusal with `updated_by = null`
 * (D-CR-01: the daily job scheduled newer occurrences) gets its own wording; every other
 * shape, including D-WR-02's both-null case (falls back to "this line"), goes through
 * describeRefusal.
 */
export function conflictText(
  t: TFunction,
  conflict: UndoConflict,
  currentUserId: string,
  memberNames: ReadonlyMap<string, string>
): string {
  const d = describeRefusal(conflict, currentUserId, memberNames);
  if (conflict.entity === 'recurring_series' && conflict.updatedBy === null && conflict.reason === 'changed') {
    return loose(t)('undo.refusal.seriesScheduled', { record: recordText(t, d) });
  }
  return refusalText(t, d);
}
