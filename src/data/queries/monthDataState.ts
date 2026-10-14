// G4 / WR-01: whether Home can show figures. A read that failed or is paused offline with no cached data
// must not render as a real empty month. Cached data wins over a failed background refetch.
export type MonthDataState = 'ready' | 'loading' | 'offline' | 'error';

export interface QueryPart {
  data: unknown;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

export function monthDataState(p: { tx: QueryPart; series: QueryPart; fx: QueryPart }): MonthDataState {
  const core = [p.tx, p.series];
  if (core.some((q) => q.data === undefined && q.isError)) return 'error';
  if (core.some((q) => q.data === undefined && q.fetchStatus === 'paused')) return 'offline';
  if (core.some((q) => q.data === undefined)) return 'loading';
  if (p.fx.data === undefined && p.fx.fetchStatus === 'fetching') return 'loading';
  return 'ready';
}
