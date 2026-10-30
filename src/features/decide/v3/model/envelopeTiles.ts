/** 05.3-15: first four envelope tiles, then "All envelopes (n)". */
export function envelopeTiles<T extends { id: string }>(items: readonly T[]): { tiles: readonly T[]; more: number; empty: boolean } {
  return { tiles: items.slice(0, 4), more: items.length > 4 ? items.length : 0, empty: items.length === 0 };
}
