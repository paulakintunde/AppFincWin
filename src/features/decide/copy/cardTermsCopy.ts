/**
 * 05-53 (D-40): card minimum terms copy. Terms are the user's own or the per-market pre-fill; never an invented rate (04 D-07).
 * Pure: no t(), no React. Integer and string maths only.
 */
import { parseAmount } from '@/engine/money';
import type { CardTermsView } from '../snapshot/types';
import { percentText as formatPercent } from './percentText';
import { percent } from '@/engine/decide';
import type { CopyRef } from './types';
import { ref } from './types';

const MIN = 'decide.depth.cardMin.';
const COSTS = 'decide.depth.cardCosts.';
const PERCENT_GRAMMAR = /^\d{1,4}(\.\d{1,10})?$/;
const FLOOR_GRAMMAR = /^\d+(\.\d+)?$/;
const MAX_PERCENT = 100;

export interface CardTermsSummary {
  value: CopyRef;
  tone: 'normal' | 'warn';
  note: CopyRef | null;
}

/** What the 'Minimum payment' row reads. `fmt` formats minor units in the given currency. */
export function cardTermsSummary(terms: CardTermsView, fmt: (minor: number, currency: string) => string): CardTermsSummary {
  if (terms.paidInFull) return { value: ref(`${MIN}paidInFull`), tone: 'normal', note: null };
  if (terms.source === 'none' || terms.percentText === null || terms.interestAdded === null || terms.floor === null) {
    return { value: ref(`${MIN}notSet`), tone: 'warn', note: null };
  }
  const params = { percent: formatPercent(percent(terms.percentText)), floor: fmt(terms.floor, terms.floorCurrency) };
  const value = ref(terms.interestAdded ? `${MIN}summaryInterest` : `${MIN}summaryNoInterest`, params);
  // Market terms apply only when the market row's currency equals the card's, so a CAD pre-fill is the CA row (CA-QC is unreachable).
  const note = terms.source === 'market' ? ref(terms.floorCurrency === 'CAD' ? `${MIN}marketNoteCa` : `${MIN}marketNote`) : null;
  return { value, tone: 'normal', note };
}

export interface CardTermsForm {
  percentText: string;
  interestAdded: boolean;
  floorText: string;
  paidInFull: boolean;
}
export interface CardTermsValues {
  percentText: string | null;
  interestAdded: boolean | null;
  floor: number | null;
  paidInFull: boolean;
}
export type CardTermsParse = { ok: true; terms: CardTermsValues } | { ok: false; field: 'percent' | 'floor' };

function validPercent(text: string): boolean {
  if (!PERCENT_GRAMMAR.test(text)) return false;
  const [whole = '', frac = ''] = text.split('.');
  const w = parseInt(whole, 10);
  return w < MAX_PERCENT || (w === MAX_PERCENT && /^0*$/.test(frac));
}

/** The floor as plain decimal text (a '.' mark, no grouping) to safe-integer minor units, or null. */
function parseFloor(text: string, exponent: number): number | null {
  const trimmed = text.trim();
  if (!FLOOR_GRAMMAR.test(trimmed)) return null;
  const result = parseAmount(trimmed, { locale: 'en-US', exponent, separators: { decimal: '.', group: ',' } });
  return result.ok && Number.isSafeInteger(result.value) && result.value >= 0 ? result.value : null;
}

/** The sheet's form to the values `onSaveCardTerms` takes. All-or-nothing: paid in full keeps the three terms only when all are valid. */
export function parseCardTermsForm(form: CardTermsForm, exponent: number): CardTermsParse {
  const percentOk = validPercent(form.percentText);
  const floor = parseFloor(form.floorText, exponent);
  if (form.paidInFull) {
    if (percentOk && floor !== null) return { ok: true, terms: { percentText: form.percentText, interestAdded: form.interestAdded, floor, paidInFull: true } };
    return { ok: true, terms: { percentText: null, interestAdded: null, floor: null, paidInFull: true } };
  }
  if (!percentOk) return { ok: false, field: 'percent' };
  if (floor === null) return { ok: false, field: 'floor' };
  return { ok: true, terms: { percentText: form.percentText, interestAdded: form.interestAdded, floor, paidInFull: false } };
}

/** D-44: the card costs line under the tiles, only when a fee was typed and the engine has both figures. */
export function cardCostsCopy(card: { fees: number; cardCosts: number | null } | null, interest: number | null, fmt: (minor: number) => string): CopyRef | null {
  if (card === null || card.fees <= 0 || card.cardCosts === null || interest === null) return null;
  return ref(`${COSTS}breakdown`, { interest: fmt(interest), fees: fmt(card.fees) });
}
