/**
 * 05.4 BO-08 (D-10, T-05.4-36-01): what one shadow answer sends, and nothing more. The answer code and variant; a list of codes,
 * each prefixed with its list (m: missing, d: readiness, r: reasons, f: facts, c: caveats, n: notices) so lists that share a
 * code stay apart, cut at the table's limit of 12 in that order; and numbers rounded to 2 significant figures. Every string
 * other than a code is dropped, and so is every value key named like an id, name, account or category.
 *
 * figures: am / aum / ab (the after-buy month, usual month and before), s.<source> (the funding split), band, rbm (months from
 * asOf to the ready-by month), ready (1, or 0 when records are not up to date, D-145), cut (codes cut), then each fact's numbers
 * as <fact>.<key> in emitted order, up to FIGURES_MAX entries and FIGURES_CHARS characters of JSON.
 */
import type { LocalDate, Result, YearMonth } from '../types';

export const SHADOW_CODES_MAX = 12;
export const SHADOW_FIGURES_MAX = 24;
export const SHADOW_FIGURES_CHARS = 1100;

export interface ShadowRound {
  readonly code: string;
  readonly variant: string | null;
  readonly reasons: readonly string[];
  readonly figures: Readonly<Record<string, number>>;
}

/** 2 significant figures, ties away from zero (exact on safe integers): 62743 -> 63000, -1250 -> -1300, 99 -> 99. Never -0. */
export function roundSig2(v: number): number {
  if (v === 0) return 0;
  return Number(v.toPrecision(2));
}

const PRIVATE_WORDS = new Set(['id', 'ids', 'name', 'names', 'account', 'accounts', 'category', 'categories']);

/** True for a key named like an id, name, account or category, by word (accountId, account_id, name; not "paid"). */
export function isPrivateKey(key: string): boolean {
  return key
    .split(/[._]|(?=[A-Z])/)
    .some((w) => PRIVATE_WORDS.has(w.toLowerCase()));
}

function monthsBetween(from: YearMonth, to: YearMonth): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
}

function codesOf(result: Result): readonly string[] {
  const all = [
    ...result.missing.map((c) => `m:${c}`),
    ...(result.readiness?.missing ?? []).map((c) => `d:${c}`),
    ...result.reasons.map((c) => `r:${c}`),
    ...result.facts.map((f) => `f:${f.code}`),
    ...(result.caveats ?? []).map((c) => `c:${c.code}`),
    ...result.notices.map((n) => `n:${n.code}`),
  ];
  return [...new Set(all)];
}

export function roundForShadow(result: Result, asOf: LocalDate): ShadowRound {
  const codes = codesOf(result);
  const figures: Record<string, number> = {};
  const put = (key: string, v: number): void => {
    figures[key] = roundSig2(v);
  };
  put('am', result.afterBuy.month);
  if (result.afterBuy.usualMonth !== null) put('aum', result.afterBuy.usualMonth);
  put('ab', result.afterBuy.before);
  const split = new Map<string, number>();
  for (const s of result.split) split.set(s.source, (split.get(s.source) ?? 0) + s.amount);
  for (const [source, amount] of split) put(`s.${source}`, amount);
  if (result.band !== null) put('band', result.band);
  if (result.readyBy !== null) {
    const to = result.readyBy.kind === 'date' ? result.readyBy.date.slice(0, 7) : result.readyBy.month;
    put('rbm', monthsBetween(asOf.slice(0, 7), to));
  }
  put('ready', result.readiness?.ready === false ? 0 : 1);
  put('cut', Math.max(0, codes.length - SHADOW_CODES_MAX));
  let chars = JSON.stringify(figures).length;
  for (const fact of result.facts) {
    for (const [k, v] of Object.entries(fact.values)) {
      const key = `${fact.code}.${k}`;
      if (typeof v !== 'number' || !Number.isFinite(v) || isPrivateKey(key) || key in figures) continue;
      const rounded = roundSig2(v);
      const extra = JSON.stringify(key).length + String(rounded).length + 2;
      if (Object.keys(figures).length >= SHADOW_FIGURES_MAX || chars + extra > SHADOW_FIGURES_CHARS) {
        return { code: result.code, variant: result.variant, reasons: codes.slice(0, SHADOW_CODES_MAX), figures };
      }
      figures[key] = rounded;
      chars += extra;
    }
  }
  return { code: result.code, variant: result.variant, reasons: codes.slice(0, SHADOW_CODES_MAX), figures };
}
