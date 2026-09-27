/**
 * Rollback planning (D-27) and refusal attribution (D-26, D-28). Both are pure
 * read-side interpretations over data the caller already has -- neither talks to the
 * server. The authoritative apply of a rollback happens server-side (plan 02-09's
 * `rollback_undo_to`), following the same newest-first, stop-at-refused rule this
 * module plans against.
 */
import type { UndoEntity, UndoConflict } from './types';

export interface StepSummary {
  id: string;
  status: 'available' | 'undone' | 'refused';
}

/**
 * Plans a "roll back to before X" (D-27): walking newest-first from the top of the
 * stack down to and including `targetId`, collecting every `available` step (an
 * `undone` step is already reversed and is skipped, not re-collected), and stopping the
 * moment a `refused` step is reached -- steps beyond that point are never planned.
 */
export function rollbackRange(
  stepsNewestFirst: readonly StepSummary[],
  targetId: string
): { stepIds: string[]; blockedBy: string | null } {
  const targetIndex = stepsNewestFirst.findIndex((step) => step.id === targetId);
  if (targetIndex === -1) {
    return { stepIds: [], blockedBy: null };
  }

  const stepIds: string[] = [];
  let blockedBy: string | null = null;

  for (let i = 0; i <= targetIndex; i++) {
    const step = stepsNewestFirst[i]!;
    if (step.status === 'undone') {
      continue;
    }
    if (step.status === 'refused') {
      blockedBy = step.id;
      break;
    }
    stepIds.push(step.id);
  }

  return { stepIds, blockedBy };
}

export type RefusalRecord =
  | { kind: 'name'; name: string }
  | { kind: 'builtin'; key: string }
  | { kind: 'entity'; entity: UndoEntity };

export interface RefusalDescription {
  actor: 'self' | 'member' | 'system';
  actorName: string | null;
  record: RefusalRecord;
}

/**
 * Describes who changed what and what the record is (D-26), for the declarative
 * refusal copy ("Sam edited Groceries after this, so it can't be undone"). A
 * `not-found` conflict, or one with no `updatedBy`, is always attributed to the system
 * -- there is no other actor to name.
 */
export function describeRefusal(
  conflict: UndoConflict,
  currentUserId: string,
  memberNames: ReadonlyMap<string, string>
): RefusalDescription {
  let actor: RefusalDescription['actor'];
  let actorName: string | null = null;

  if (conflict.reason === 'not-found' || conflict.updatedBy === null) {
    actor = 'system';
  } else if (conflict.updatedBy === currentUserId) {
    actor = 'self';
  } else {
    actor = 'member';
    actorName = memberNames.get(conflict.updatedBy) ?? null;
  }

  let record: RefusalRecord;
  if (conflict.recordName) {
    record = { kind: 'name', name: conflict.recordName };
  } else if (conflict.builtinKey) {
    record = { kind: 'builtin', key: conflict.builtinKey };
  } else {
    record = { kind: 'entity', entity: conflict.entity };
  }

  return { actor, actorName, record };
}
