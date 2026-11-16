// 08-19 (HH-05, T-08-70): what the split sheet shows is what the server will store, because the figures come from the
// engine's splitLine (08-03) and nowhere else. No second split maths lives here: this file only maps the sheet's state
// (rule key, who is in, typed amounts) onto the engine's inputs and the engine's answer back onto rows.
import { splitLine, type LineParticipant } from '@/engine/household/lineSplit';
import type { SplitRule as EngineRule } from '@/engine/decide/share';
import { minorUnits, type MinorUnits } from '@/engine/money/types';
import type { SplitRuleKey } from '../components/SplitRuleList';

export interface PreviewMember {
  userId: string;
  /** Household weight in percent. */
  weight: number;
}

export type PreviewReason = 'split_weights_zero' | 'amounts_not_total' | 'no_other_member';

export interface SplitPreviewRow {
  userId: string;
  /** This person's part, positive, in the line's minor units. */
  amount: number;
}

export interface SplitPreview {
  rows: SplitPreviewRow[];
  /** True when the parts add up to the total (only then can the split be saved). */
  addsUp: boolean;
  /** By amount only: what is still unassigned (0 when nothing is left). Negative never: over-assigned reads as 0 left and fails addsUp. */
  leftToAssign: number;
  /** Why it cannot be saved, when it cannot. */
  reason: PreviewReason | null;
  /** Over-assigned by this much (By amount). */
  over: number;
}

/**
 * `total` is the line's size as a positive number in minor units (the sign of an expense is the server's business).
 * `included` is the set of ticked user ids; `amounts` is typed minor units per user id (By amount only).
 */
export function splitPreview(
  total: number,
  rule: SplitRuleKey,
  members: readonly PreviewMember[],
  included: ReadonlySet<string> | readonly string[],
  payerId: string,
  amounts: Readonly<Record<string, number>> = {},
): SplitPreview {
  const inSet = new Set(included);
  const payerIndex = Math.max(0, members.findIndex((m) => m.userId === payerId));
  const participants: LineParticipant[] = members.map((m) => ({
    key: m.userId,
    included: inSet.has(m.userId),
    weight: m.weight,
  }));
  const abs = Math.abs(total);
  let engineRule: EngineRule;
  switch (rule) {
    case 'mine':
      engineRule = { kind: 'mine' };
      break;
    case 'even':
      engineRule = { kind: 'even' };
      break;
    case 'weight':
      engineRule = { kind: 'weight', weights: members.map((m) => m.weight) };
      break;
    case 'amount':
      engineRule = { kind: 'amount', amounts: members.map((m) => minorUnits(amounts[m.userId] ?? 0)) };
      break;
  }
  const res = splitLine(minorUnits(abs), engineRule, participants, payerIndex);
  if (!res.ok) {
    const left = res.leftToAssign !== undefined ? Number(res.leftToAssign) : 0;
    const typed = rule === 'amount' ? members.reduce((s, m) => s + (inSet.has(m.userId) ? (amounts[m.userId] ?? 0) : 0), 0) : 0;
    return {
      rows: members
        .filter((m) => inSet.has(m.userId))
        .map((m) => ({ userId: m.userId, amount: rule === 'amount' ? (amounts[m.userId] ?? 0) : 0 })),
      addsUp: false,
      leftToAssign: left > 0 ? left : 0,
      reason: res.reason,
      over: rule === 'amount' && typed > abs ? typed - abs : 0,
    };
  }
  const rows: SplitPreviewRow[] = members
    .map((m, i) => ({ userId: m.userId, amount: Number(res.parts[i] as MinorUnits) }))
    .filter((r, i) => inSet.has(members[i]!.userId) || r.amount !== 0);
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, addsUp: sum === abs, leftToAssign: 0, reason: null, over: 0 };
}
