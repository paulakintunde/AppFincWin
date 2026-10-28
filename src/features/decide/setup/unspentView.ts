/**
 * Plan 05.2-28 (DSU-10): the Unspent money card as a view of engine output. Pure: no React, no clock.
 *
 * The worked sum is `unspentSum` from the engine barrel (the same arithmetic buildFunds uses for the suggested figure),
 * so nothing here calculates money. Two things are only presentation: which lines are shown (UI-SPEC drops lines at 0)
 * and the state of the confirmed figure (the engine's own `drifted` and `stale` flags).
 *
 * Display units. Bridges hold money back from the confirmed figure (D-38), so the figure the user reads is the engine's
 * value less `held`. Every amount in a view is in display units; `toStoredAnchor` adds `held` back so what is saved
 * reads back, through the engine, as exactly the figure the user saw.
 */
import type { Evaluation, UnspentSum } from '@/engine/decide/v3';

export type UnspentLineKey = 'balance' | 'mixedSetAside' | 'billsDue' | 'everydayLeft' | 'envelopes' | 'emergency' | 'heldBack';

export interface UnspentLine {
  key: UnspentLineKey;
  /** Always >= 0 for a deduction; the balance may be 0. */
  amount: number;
  /** +1 for the starting balance, -1 for every deduction. */
  sign: 1 | -1;
}

export interface UnspentSumLines {
  lines: UnspentLine[];
  /** The unspent money the lines add up to (after held-back money). */
  total: number;
  unstatedAccounts: number;
  unplacedEnvelopes: number;
  hasMixed: boolean;
}

/** UI-SPEC lines: balance, bills and everyday always; the rest only above 0. */
export function unspentSumLines(sum: UnspentSum): UnspentSumLines {
  const lines: UnspentLine[] = [{ key: 'balance', amount: sum.gross, sign: 1 }];
  if (sum.mixedSetAside > 0) lines.push({ key: 'mixedSetAside', amount: sum.mixedSetAside, sign: -1 });
  lines.push({ key: 'billsDue', amount: sum.bills, sign: -1 });
  lines.push({ key: 'everydayLeft', amount: sum.everyday, sign: -1 });
  if (sum.envelopes > 0) lines.push({ key: 'envelopes', amount: sum.envelopes, sign: -1 });
  if (sum.emergency > 0) lines.push({ key: 'emergency', amount: sum.emergency, sign: -1 });
  if (sum.heldBack > 0) lines.push({ key: 'heldBack', amount: sum.heldBack, sign: -1 });
  return {
    lines,
    total: sum.total,
    unstatedAccounts: sum.unstatedAccounts,
    unplacedEnvelopes: sum.unplacedEnvelopes,
    hasMixed: sum.hasMixed,
  };
}

export type UnspentView =
  | { kind: 'notConfirmed'; sum: number }
  | { kind: 'fresh'; value: number; anchor: number; anchorAt: string }
  | { kind: 'drifted'; rolled: number; sum: number; anchorAt: string }
  | { kind: 'stale'; value: number; days: number; anchorAt: string };

/** Whole days from one ISO date (YYYY-MM-DD) to another; 0 when either does not parse. */
export function daysSince(from: string, today: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0;
}

/**
 * The state of the confirmed figure. Drifted wins over stale (the drifted buttons offer the new sum, which also
 * re-anchors it). `today` is the engine's own as-of date (`inputs.asOf`).
 */
export function unspentStateOf(evaluation: Evaluation, sum: UnspentSum, today: string): UnspentView {
  const state = evaluation.funds.unspent;
  if (state === null) return { kind: 'notConfirmed', sum: sum.total };
  const held = sum.heldBack;
  const value = state.value - held;
  const anchorAt = state.anchor.at;
  if (state.drifted) return { kind: 'drifted', rolled: value, sum: sum.total, anchorAt };
  if (state.stale) return { kind: 'stale', value, days: daysSince(anchorAt, today), anchorAt };
  return { kind: 'fresh', value, anchor: state.anchor.amount - held, anchorAt };
}

/** The figure to save as the anchor so the engine reads back `display` after taking held-back money off. */
export function toStoredAnchor(display: number, sum: UnspentSum): number {
  return display + sum.heldBack;
}
