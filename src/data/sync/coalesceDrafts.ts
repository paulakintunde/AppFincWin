// D-88 (R16.4): at most one queued draft save per check. Typing offline would otherwise queue one
// saveCheckDraft per autosave; only the latest inputs need to travel. A newer save removes the
// older one from the MutationCache while it is still waiting (never sent), then the caller adds
// the new one, so the queue holds one save per check.
//
// Ordering in WRITE_SCOPE is kept: a save never moves ahead of the create of its check and never
// behind a queued delete of it. WR-A03 chaining is untouched: a removed save never ran, so it never
// recorded a written version, and the surviving save records its own bump.
import type { Mutation, QueryClient } from '@tanstack/react-query';
import { mutationKeys } from '@/data/keys';

type AnyMutation = Mutation<unknown, unknown, unknown, unknown>;

type Kind = 'create' | 'save' | 'delete';

interface Queued {
  kind: Kind;
  mutation: AnyMutation;
}

function sameKey(key: readonly unknown[] | undefined, expected: readonly unknown[]): boolean {
  return key !== undefined && key.length === expected.length && key.every((part, i) => part === expected[i]);
}

function kindOf(m: AnyMutation, id: string): Kind | null {
  const vars = m.state.variables as { id?: string; patch?: { deleted_at?: unknown } } | undefined;
  if (vars?.id !== id) return null;
  const key = m.options.mutationKey;
  if (sameKey(key, mutationKeys.createCheck)) return 'create';
  if (sameKey(key, mutationKeys.saveCheckDraft)) return 'save';
  if (sameKey(key, mutationKeys.editCheck) && vars.patch?.deleted_at) return 'delete';
  return null;
}

/** A save that is waiting its turn (or for the network) and has never reached the server. */
function isUnsent(m: AnyMutation): boolean {
  return m.state.status === 'pending' && m.state.isPaused && m.state.failureCount === 0;
}

/**
 * Removes the unsent saves of check `id` that a new save supersedes. Returns how many were removed.
 * A save is removed only when it sits after the last queued create of the check and has no queued
 * delete of the check behind it. A save already in flight (not paused) is left alone.
 */
export function coalesceDraftSave(qc: QueryClient, id: string): number {
  const queued: Queued[] = [];
  for (const mutation of qc.getMutationCache().getAll() as AnyMutation[]) {
    if (mutation.state.status !== 'pending') continue;
    const kind = kindOf(mutation, id);
    if (kind !== null) queued.push({ kind, mutation });
  }

  let lastCreate = -1;
  queued.forEach((q, i) => {
    if (q.kind === 'create') lastCreate = i;
  });
  let lastDelete = -1;
  queued.forEach((q, i) => {
    if (q.kind === 'delete') lastDelete = i;
  });

  let removed = 0;
  queued.forEach((q, i) => {
    if (q.kind !== 'save' || i < lastCreate || i < lastDelete || !isUnsent(q.mutation)) return;
    qc.getMutationCache().remove(q.mutation);
    removed += 1;
  });
  return removed;
}
