/**
 * Likely-duplicate detection for statement import (D-47 amends D-13; D-54
 * amends D-47; REC-16). Matching counts occurrences rather than a single
 * boolean: a file holding k rows that look like the same payment against m
 * similar rows already stored on the same account flags exactly min(k, m).
 * The rows a file itself carries are never compared against each other --
 * only against the `existing` rows the caller supplies, which are expected
 * to already be scoped to the target account and a sensible date window.
 */
import { normaliseDescription } from '../categorize/guessCategory';
import type { ImportSource } from './types';

export interface DuplicateCandidate {
  index: number;
  localDate: string | null;
  amount: number | null;
  name: string;
  externalId: string | null;
}

export interface ExistingRow {
  id: string;
  localDate: string;
  amount: number;
  name: string | null;
  externalId: string | null;
  importFormat: string | null;
}

export type DuplicateMatch = { kind: 'existing'; id: string; by: 'fitid' | 'match' | 'cross-format-window' };

export const NAME_SIMILARITY_THRESHOLD = 0.6;
export const CROSS_FORMAT_WINDOW_DAYS = 2;

/**
 * Jaccard similarity over normalised whitespace tokens, with a containment
 * shortcut: either normalised string fully containing the other counts as
 * a match (e.g. 'TESCO' inside 'TESCO STORES 3021', where token overlap
 * alone would score low). Two empty strings are treated as identical; one
 * empty and one not are unrelated.
 */
export function nameSimilarity(a: string, b: string): number {
  const normA = normaliseDescription(a);
  const normB = normaliseDescription(b);
  if (normA === '' && normB === '') return 1;
  if (normA === '' || normB === '') return 0;
  if (normA.includes(normB) || normB.includes(normA)) return 1;

  const tokensA = new Set(normA.split(' '));
  const tokensB = new Set(normB.split(' '));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  // Both sets hold at least one token here (normA/normB are non-empty and
  // already excluded above), so union is always >= 1 -- never a /0 risk.
  const union = tokensA.size + tokensB.size - intersection;
  return intersection / union;
}

/**
 * False the moment one FITID appears on two rows of the same file whose
 * amount or date differ -- banks reuse and regenerate FITIDs, so a
 * conflicting one means they cannot be trusted for the whole file. A row
 * with no externalId never participates.
 */
export function fitidReliable(candidates: readonly DuplicateCandidate[]): boolean {
  const seen = new Map<string, { localDate: string | null; amount: number | null }>();
  for (const c of candidates) {
    if (c.externalId === null) continue;
    const prior = seen.get(c.externalId);
    if (prior === undefined) {
      seen.set(c.externalId, { localDate: c.localDate, amount: c.amount });
      continue;
    }
    if (prior.amount !== c.amount || prior.localDate !== c.localDate) return false;
  }
  return true;
}

function parseLocalDateParts(s: string): { year: number; month: number; day: number } {
  const [year, month, day] = s.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function daysBetween(a: string, b: string): number {
  const pa = parseLocalDateParts(a);
  const pb = parseLocalDateParts(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

interface ScoredCandidate {
  existing: ExistingRow;
  similarity: number;
  exact: boolean;
  dayGap: number;
}

/**
 * Best candidate: highest similarity, then exact date, then smaller day gap,
 * then smaller id. `existing` row ids are always distinct within one
 * findDuplicates call, so the id comparison never needs an equal branch.
 */
function pickBest(scored: readonly ScoredCandidate[]): ScoredCandidate | undefined {
  if (scored.length === 0) return undefined;
  return [...scored].sort((a, b) => {
    if (a.similarity !== b.similarity) return b.similarity - a.similarity;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.dayGap !== b.dayGap) return a.dayGap - b.dayGap;
    return a.existing.id < b.existing.id ? -1 : 1;
  })[0];
}

/**
 * Flags likely duplicates against already-stored rows: a certain FITID
 * match first (only while the file's own FITIDs are internally
 * consistent), then an occurrence-counting match on date, amount and a
 * similar name -- exact date normally, or within CROSS_FORMAT_WINDOW_DAYS
 * only against a row stored from a different source format (D-54). An
 * existing row is matched at most once, so k rows that look like the same
 * payment in the file, against m similar stored rows, flag exactly
 * min(k, m).
 */
export function findDuplicates(
  candidates: readonly DuplicateCandidate[],
  existing: readonly ExistingRow[],
  opts: { sourceFormat: ImportSource }
): { matches: Map<number, DuplicateMatch>; fitidDisabled: boolean } {
  const matches = new Map<number, DuplicateMatch>();
  const usedExisting = new Set<string>();
  const fitidDisabled = !fitidReliable(candidates);

  // Rows with no reliable date or amount are never flagged, by either pass.
  const eligible = candidates.filter((c) => c.localDate !== null && c.amount !== null);

  if (!fitidDisabled) {
    for (const c of eligible) {
      if (c.externalId === null) continue;
      const found = existing.find(
        (e) => !usedExisting.has(e.id) && e.externalId === c.externalId && e.amount === c.amount
      );
      if (found !== undefined) {
        matches.set(c.index, { kind: 'existing', id: found.id, by: 'fitid' });
        usedExisting.add(found.id);
      }
    }
  }

  // Amount-keyed index keeps the multiset pass near-linear for large files.
  const byAmount = new Map<number, ExistingRow[]>();
  for (const e of existing) {
    const list = byAmount.get(e.amount);
    if (list === undefined) byAmount.set(e.amount, [e]);
    else list.push(e);
  }

  for (const c of eligible) {
    if (matches.has(c.index)) continue;
    const sameAmount = byAmount.get(c.amount as number) ?? [];
    const scored: ScoredCandidate[] = [];
    for (const e of sameAmount) {
      if (usedExisting.has(e.id)) continue;
      const dayGap = Math.abs(daysBetween(e.localDate, c.localDate as string));
      const exact = dayGap === 0;
      const crossFormatEligible = e.importFormat !== null && e.importFormat !== opts.sourceFormat;
      if (!exact && !(crossFormatEligible && dayGap <= CROSS_FORMAT_WINDOW_DAYS)) continue;
      const similarity = e.name === null ? 1 : nameSimilarity(c.name, e.name);
      if (similarity < NAME_SIMILARITY_THRESHOLD) continue;
      scored.push({ existing: e, similarity, exact, dayGap });
    }
    const best = pickBest(scored);
    if (best === undefined) continue;
    matches.set(c.index, {
      kind: 'existing',
      id: best.existing.id,
      by: best.exact ? 'match' : 'cross-format-window',
    });
    usedExisting.add(best.existing.id);
  }

  return { matches, fitidDisabled };
}
