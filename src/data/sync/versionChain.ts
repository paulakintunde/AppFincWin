import type { WriteEntity } from '@/db/errors';
import { registerWipeHandler } from '@/services/storage/wipe';

/**
 * CR-A02: chains optimistic-concurrency versions across this device's own queued edits.
 *
 * A caller builds `expectedVersion` from the cached row. When the same row is edited twice
 * before the first edit reaches the server (offline, or two quick taps), both edits carry the
 * same stale base version. The first one lands and the server bumps the row, so the second
 * one would fail `.eq('version', base)` and be parked as "changed elsewhere" (D-18), although
 * nothing but this device changed it.
 *
 * Each successful version-conditional write records `base -> newVersion` here, and the next
 * write to the same row resolves its base through that chain at execution time. Only this
 * device's own writes ever enter the chain, so an edit from another device still surfaces as
 * a genuine conflict (the chain never maps to a version this device did not write itself).
 *
 * In-memory only: queued writes replay back-to-back in one WRITE_SCOPE run, so the chain is
 * needed only within one session. The one gap is an app kill between two replayed edits of
 * the same row -- the second then reports a conflict, keeps the server row, and records the
 * attempted change in the failed-writes list, so nothing is lost silently (D-19).
 */
const chains = new Map<string, Map<number, number>>();

function chainKey(entity: WriteEntity, id: string): string {
  return `${entity}:${id}`;
}

/** The version this device's own earlier writes moved `expected` to, or `expected` itself. */
export function resolveExpectedVersion(entity: WriteEntity, id: string, expected: number): number {
  const chain = chains.get(chainKey(entity, id));
  if (!chain) return expected;
  let version = expected;
  const seen = new Set<number>([version]);
  let next = chain.get(version);
  // `seen` guards a malformed cycle; versions only ever increase, so it never triggers in practice.
  while (next !== undefined && !seen.has(next)) {
    version = next;
    seen.add(next);
    next = chain.get(version);
  }
  return version;
}

/** Records that a write based on each of `bases` produced `newVersion` on the server. */
export function recordWrittenVersion(entity: WriteEntity, id: string, bases: readonly number[], newVersion: number): void {
  const key = chainKey(entity, id);
  const chain = chains.get(key) ?? new Map<number, number>();
  for (const base of bases) {
    if (base !== newVersion) chain.set(base, newVersion);
  }
  chains.set(key, chain);
}

/** Test/sign-out helper: forgets every recorded chain. */
export function clearVersionChains(): void {
  chains.clear();
}

registerWipeHandler({
  id: 'version-chain',
  wipe: async () => {
    clearVersionChains();
  },
});
