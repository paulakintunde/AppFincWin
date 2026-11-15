/**
 * 06.1-79 (H-16, DS-8, OQ-79-1 A): the one list of money rules Decide home's "Your money rules" card and Setup > Your money rules
 * both show. Before this, home listed the debt share, Grow's regular saving and investing and the stored rules, while setup's
 * "No rules" line and the checklist counted only the engine's limit lines, so "Saving at least $800" showed as On on home while
 * setup said "No rules set yet". Grow's regular saving and investing are rules that come from Grow: they show in both lists,
 * marked "Set in Grow", and count as rules that are on. Pure: no React, no I/O.
 */
import type { V3Inputs, V3Series } from '@/engine/decide/v3';
import type { StoredRule } from '@/features/decide/snapshot/v3/rulesDoc';

export type ShownRule =
  | { readonly key: 'debt'; readonly kind: 'debt'; readonly on: boolean; /** Whole percent; null when off. */ readonly percent: number | null }
  | { readonly key: 'saving'; readonly kind: 'saving'; readonly on: true; /** A month, minor units. */ readonly amount: number }
  | { readonly key: 'investing'; readonly kind: 'investing'; readonly on: true; /** A month, minor units. */ readonly amount: number }
  | { readonly key: string; readonly kind: 'stored'; readonly on: boolean; readonly rule: StoredRule };

export interface RulesSource {
  /** The debt share in whole percent (debtPercentOf of dsr_line); null = off. */
  readonly debtPercent: number | null;
  /** The person's own rules, in the stored document's order. */
  readonly rules: readonly StoredRule[];
  /** Regular saving and investing a month from Grow, minor units; null = none. */
  readonly saving: number | null;
  readonly investing: number | null;
}

/** The rules in the order both lists show them: the debt share, Grow's saving and investing, then the person's own rules. */
export function rulesShown(src: RulesSource): ShownRule[] {
  const out: ShownRule[] = [{ key: 'debt', kind: 'debt', on: src.debtPercent !== null, percent: src.debtPercent }];
  if (src.saving !== null) out.push({ key: 'saving', kind: 'saving', on: true, amount: src.saving });
  if (src.investing !== null) out.push({ key: 'investing', kind: 'investing', on: true, amount: src.investing });
  for (const rule of src.rules) out.push({ key: rule.id, kind: 'stored', on: rule.on, rule });
  return out;
}

/** How many of the shown rules are on. */
export function shownOnCount(shown: readonly ShownRule[]): number {
  return shown.filter((r) => r.on).length;
}

/** A monthly figure for a series: weekly amounts are spread over a 52-week year (the same rule as the setup reads). */
export function seriesMonthlyMinor(s: V3Series): number {
  const every = Math.max(1, s.cadence.every);
  return s.cadence.unit === 'month' ? Math.round(Number(s.amount) / every) : Math.round((Number(s.amount) * 52) / 12 / every);
}

/** Grow's regular saving and investing a month, from the live series of each role; null when there is none. */
export function growRulesOf(inputs: V3Inputs | null): { saving: number | null; investing: number | null } {
  if (inputs === null) return { saving: null, investing: null };
  const sum = (role: V3Series['role']): number | null => {
    const live = inputs.series.filter((s) => s.role === role && s.status === 'live');
    return live.length === 0 ? null : live.reduce((total, s) => total + seriesMonthlyMinor(s), 0);
  };
  return { saving: sum('saving'), investing: sum('investing') };
}

/**
 * The rules that are on, read from the Decide inputs alone (the checklist's count): the engine's limit lines that are on, plus
 * Grow's saving and investing. Agrees with `shownOnCount` when the settings and the inputs are the same read.
 */
export function rulesOnOf(inputs: V3Inputs): number {
  const grow = growRulesOf(inputs);
  return inputs.limits.lines.filter((l) => l.on).length + (grow.saving === null ? 0 : 1) + (grow.investing === null ? 0 : 1);
}
