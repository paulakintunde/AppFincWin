/**
 * 05-63 (D-74, UI-SPEC R2 "The key figures"): the verdict card's three figures, computed and worded in one place. Pure:
 * no React, no t(). The caller passes a resolver for CopyRefs so the months wording and the screen-reader line come out as text.
 * Cushion months are the engine's own runwayMonthsOf (D-39), never a re-derivation.
 */
import { runwayMonthsOf } from '@/engine/decide';
import type { MinorUnits } from '@/engine/decide';
import type { CheckComputation } from '../snapshot/types';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

const K = 'decide.verdict.key.';

export type CheckKind = 'buy' | 'invest';

export interface KeyFigureInputs {
  /** Month-end amount left after this, minor units. */
  left: MinorUnits;
  /** Whole months of cover, or null when there are no monthly costs. */
  cushionMonths: number | null;
  /** Net monthly cost of this, minor units. */
  monthly: MinorUnits;
  kind: CheckKind;
}

export interface KeyFigureItem {
  caption: string;
  value: string;
  kind: 'figure' | 'words';
  /** The value carries a minus: drawn in dangerTint2 on the dark card. */
  negative: boolean;
}

export interface KeyFigures {
  items: [KeyFigureItem, KeyFigureItem, KeyFigureItem];
  a11y: CopyRef;
}

export type TextOf = (r: CopyRef) => string;

/** D-93.2: a cushion above 600 months (50 years) reads as words, never as a four-digit month count. */
export const OVER_50_YEARS_MONTHS = 600;

function cushionRef(months: number | null): { value: CopyRef; words: boolean; spoken?: CopyRef } {
  if (months === null) return { value: ref(`${K}notLimited`), words: true };
  if (months <= 0) return { value: ref(`${K}underOne`), words: true };
  if (months > OVER_50_YEARS_MONTHS) {
    return { value: ref(`${K}over50Years`), words: true, spoken: ref(`${K}over50YearsSpoken`) };
  }
  return { value: ref(`${K}months`, { count: months }), words: false };
}

export function keyFigures(inputs: KeyFigureInputs, fmt: Fmt, fmtCents: Fmt, text: TextOf): KeyFigures {
  const leftText = fmt(inputs.left);
  const cushion = cushionRef(inputs.cushionMonths);
  const cushionText = text(cushion.value);
  const monthlyNone = inputs.monthly === 0;
  const monthlyText = monthlyNone ? text(ref(`${K}none`)) : fmtCents(inputs.monthly);
  return {
    items: [
      { caption: text(ref(`${K}leftCaption`)), value: leftText, kind: 'figure', negative: inputs.left < 0 },
      { caption: text(ref(`${K}cushionCaption`)), value: cushionText, kind: cushion.words ? 'words' : 'figure', negative: false },
      {
        caption: text(ref(inputs.kind === 'invest' ? `${K}putInCaption` : `${K}monthlyCaption`)),
        value: monthlyText,
        kind: monthlyNone ? 'words' : 'figure',
        negative: false,
      },
    ],
    a11y: ref(`${K}a11y`, { left: leftText, months: cushion.spoken ? text(cushion.spoken) : cushionText, monthly: monthlyText }),
  };
}

/**
 * Maps a computation to the three raw figures. A logged assessment reads its own left / cash / burn / monthly; a first read
 * uses the rough monthly spending as the burn. Null for missing, none, unconverted and incomplete.
 */
export function keyFigureInputs(c: CheckComputation, roughBurn: MinorUnits | null): KeyFigureInputs | null {
  const kind: CheckKind = c.check?.kind === 'invest' ? 'invest' : 'buy';
  if (c.status === 'logged' && c.verdict && c.verdict.state !== 'missing') {
    const a = c.verdict;
    return { left: a.left, cushionMonths: runwayMonthsOf(a.cashAfterBillsAndPurchase, a.burn), monthly: a.newMonthly, kind };
  }
  if (c.status === 'first_read' && c.firstRead && c.firstRead.state !== 'missing') {
    const fr = c.firstRead;
    return {
      left: fr.leftAfter,
      cushionMonths: roughBurn === null ? null : runwayMonthsOf(fr.cashAfter, roughBurn),
      monthly: fr.monthly,
      kind,
    };
  }
  return null;
}
