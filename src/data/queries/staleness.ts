import type { Query } from '@tanstack/react-query';

/**
 * staleTime for reference lists (currencies, latest FX rates) that are never
 * legitimately empty. A cached [] is a failed-upstream artefact, not data, so
 * it counts as stale immediately and the next mount refetches. Non-empty lists
 * keep the normal `ms` freshness window.
 *
 * Deliberately a staleTime function rather than a persister cache-buster
 * bump: a buster discards the whole persisted cache, including the cached
 * reads that queued offline writes depend on.
 */
export function staleUnlessEmpty<T extends readonly unknown[]>(ms: number) {
  return (query: Query<T, Error, T>): number => {
    const data = query.state.data;
    return Array.isArray(data) && data.length === 0 ? 0 : ms;
  };
}
