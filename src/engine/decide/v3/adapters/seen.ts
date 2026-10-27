/**
 * Seen-state re-baseline and "changed since you looked" (05.1-20). C7, D-20, I42.
 * Pure: takes the previous seen state and the new Result only. A recorded decision is never an input here.
 */
import type { Code, LegacyState, ReadyBy, Result, Variant } from '../types';

export interface SeenV3 {
  readonly v: 3;
  readonly code: Code;
  readonly variant: Variant | null;
  readonly readyBy: ReadyBy | null;
  readonly unspentAfter: number | null;
  readonly lineFacts: readonly string[];
}
export type ChangeReason = 'code_changed' | 'ready_by_changed' | 'unspent_changed' | 'line_changed';

export function seenOf(r: Result): SeenV3 {
  let unspentAfter: number | null = null;
  const lines: string[] = [];
  for (const f of r.facts) {
    if (f.code === 'unspent_before_after') {
      const a = f.values.after;
      if (typeof a === 'number') unspentAfter = a;
    } else if (f.code === 'line_crossed') {
      const id = f.values.lineId; // key emitted by judge/lines.ts fact()
      if (id !== undefined && id !== null) lines.push(String(id));
    }
  }
  return { v: 3, code: r.code, variant: r.variant, readyBy: r.readyBy, unspentAfter, lineFacts: lines.sort() };
}

function readyByKey(r: ReadyBy | null): string {
  return r === null ? '' : r.kind === 'date' ? `d:${r.date}` : `m:${r.month}`;
}

function isSeenV3(x: unknown): x is SeenV3 {
  return typeof x === 'object' && x !== null && (x as { v?: unknown }).v === 3 && typeof (x as { code?: unknown }).code === 'string';
}

/** null or a legacy 4-state string (or anything unreadable) re-baselines: never a change (C7). */
export function changeSinceLooked(prev: SeenV3 | LegacyState | null, next: Result): { readonly changed: boolean; readonly reasons: readonly ChangeReason[]; readonly seen: SeenV3 } {
  const seen = seenOf(next);
  if (prev === null || typeof prev === 'string' || !isSeenV3(prev)) {
    return { changed: false, reasons: [], seen };
  }
  if (prev.code !== seen.code) return { changed: true, reasons: ['code_changed'], seen };
  const reasons: ChangeReason[] = [];
  if (readyByKey(prev.readyBy) !== readyByKey(seen.readyBy)) reasons.push('ready_by_changed');
  const a = prev.unspentAfter;
  const b = seen.unspentAfter;
  if ((a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > 1)) reasons.push('unspent_changed');
  const pl = Array.isArray(prev.lineFacts) ? prev.lineFacts : [];
  if (pl.length !== seen.lineFacts.length || pl.some((id, i) => id !== seen.lineFacts[i])) reasons.push('line_changed');
  return { changed: reasons.length > 0, reasons, seen };
}
