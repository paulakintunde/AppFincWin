/**
 * 05.5-15: the rule limits an open check is judged against after a rule change. Pure: no React, no I/O (kept out of useHomeCards so a
 * test can run it without the data layer). Category cap lines come from categories.monthly_cap (D-11): a document change keeps them,
 * and `patch.caps` replaces, removes or adds one.
 */
import type { LimitLine, Limits } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { ownLinesOf, type RulesDoc } from './homeCardsModel';

export interface RulesPatch {
  /** The new debt share as stored text ("30"), null = off. Undefined = untouched. */
  dsrLine?: string | null;
  /** The new rules document. Undefined = untouched. */
  doc?: RulesDoc;
  /** 05.5-15 (D-11): category caps being changed, category id to the new monthly cap (null = removed). Read by the crossing check only; written through the category mutation, never by `save`. Undefined = untouched. */
  caps?: Readonly<Record<string, number | null>>;
}

export function limitsWith(base: Limits, patch: RulesPatch): Limits {
  let lines: LimitLine[] = [...base.lines];
  if (patch.dsrLine !== undefined) {
    // The legacy debt line: off keeps its place with on = false; on writes the typed share.
    const text = patch.dsrLine;
    lines = lines.map((l) =>
      l.id === 'debt_share' && l.spec.kind === 'debt_share'
        ? { ...l, on: text !== null, spec: text === null ? l.spec : { kind: 'debt_share' as const, pct: percent(text) } }
        : l,
    );
  }
  if (patch.doc !== undefined) {
    // The category cap lines come from categories.monthly_cap, not from the document, so they stay.
    lines = lines.filter((l) => l.source !== 'own' || l.spec.kind === 'category_monthly_cap');
    for (const raw of ownLinesOf(patch.doc)) lines.push(raw as LimitLine);
  }
  if (patch.caps !== undefined) {
    const changed = patch.caps;
    lines = lines.filter((l) => !(l.spec.kind === 'category_monthly_cap' && l.spec.categoryId in changed));
    for (const id of Object.keys(changed).sort()) {
      const cap = changed[id];
      if (cap !== null && cap !== undefined) lines.push({ id: `cap_${id}`, on: true, source: 'own', spec: { kind: 'category_monthly_cap', categoryId: id, cap: minorUnits(cap) } });
    }
  }
  return { lines };
}
