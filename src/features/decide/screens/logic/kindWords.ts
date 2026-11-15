/**
 * 06.1 (D-02, D-09): what kind of thing the typed words name, whether they read as a home, and whether they say it is paid over
 * time. Pure; word lists are data. Matching is case-insensitive on whole words (the field is capped at 80 characters).
 */
export type ItemKind = 'car' | 'home' | 'tech' | 'everyday';

export const CAR_WORDS: readonly string[] = Object.freeze(['car', 'van', 'scooter', 'motorbike', 'motorcycle', 'truck', 'pickup']);
export const HOME_WORDS: readonly string[] = Object.freeze(['house', 'home', 'flat', 'apartment', 'condo', 'mortgage', 'townhouse']);
/** A home word followed by one of these names a thing for the home, not a home. 'screen' keeps "flat screen tv" out. */
export const HOME_EXCEPTIONS: readonly string[] = Object.freeze(['theatre', 'theater', 'office', 'plant', 'insurance', 'cinema', 'gym', 'decor', 'screen']);
export const TECH_WORDS: readonly string[] = Object.freeze(['laptop', 'phone', 'tablet', 'camera', 'headphones', 'tv', 'computer']);
/** Single words or phrases (matched as whole-word runs). */
export const PLAN_WORDS: readonly string[] = Object.freeze(['loan', 'finance', 'on a plan', 'monthly payments', 'installments', 'instalments', 'mortgage']);

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

function hasAny(ws: readonly string[], list: readonly string[]): boolean {
  return ws.some((w) => list.includes(w));
}

/** True when the words name a home: a home word not followed by an exception word ("home theatre", "house plant"). */
export function isHomeWords(text: string): boolean {
  const ws = words(text);
  return ws.some((w, i) => HOME_WORDS.includes(w) && !HOME_EXCEPTIONS.includes(ws[i + 1] ?? ''));
}

/** The kind the words read as, or null. A home is checked first, so it is never judged as anything else. */
export function readKind(text: string): ItemKind | null {
  if (isHomeWords(text)) return 'home';
  const ws = words(text);
  if (hasAny(ws, CAR_WORDS)) return 'car';
  if (hasAny(ws, TECH_WORDS)) return 'tech';
  return null;
}

/** True when the words say it is paid over time (loan, finance, on a plan, monthly payments, installments, mortgage). */
export function readsAsPlan(text: string): boolean {
  const joined = ` ${words(text).join(' ')} `;
  return PLAN_WORDS.some((p) => joined.includes(` ${p} `));
}
