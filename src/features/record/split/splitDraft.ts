// 10.1-18 (SPL-01, D-02, D-03): the split sheet's draft as pure functions. All balance maths is the engine's partsBalance;
// this module only holds what the user has typed. Amounts here are positive magnitudes in minor units (null = empty field);
// the sign of the line is applied when the parts are handed back for saving.
import { partsBalance, PARTS_MAX, PARTS_MIN } from '@/engine/parts';
import type { Balance, Part } from '@/engine/parts';

export interface DraftPart {
  key: string;
  categoryId: string | null;
  amount: number | null;
  touched: boolean;
}

export interface SplitDraft {
  total: number;
  sign: 1 | -1;
  parts: DraftPart[];
  firstIsRest: boolean;
}

let counter = 0;
const nextKey = (): string => `part-${++counter}`;

function withRest(d: SplitDraft): SplitDraft {
  if (!d.firstIsRest) return d;
  const others = d.parts.slice(1).reduce((s, p) => s + (p.amount ?? 0), 0);
  const first = d.parts[0]!;
  const amount = Math.max(0, d.total - others);
  if (first.amount === amount) return d;
  return { ...d, parts: [{ ...first, amount }, ...d.parts.slice(1)] };
}

export function initDraft(line: { amount: number; categoryId: string | null; parts: readonly Part[] | null }): SplitDraft {
  const total = Math.abs(line.amount);
  const sign: 1 | -1 = line.amount < 0 ? -1 : 1;
  if (line.parts && line.parts.length >= PARTS_MIN) {
    return {
      total,
      sign,
      firstIsRest: false,
      parts: line.parts.map((p) => ({ key: nextKey(), categoryId: p.categoryId, amount: Math.abs(p.amount), touched: true })),
    };
  }
  return {
    total,
    sign,
    firstIsRest: true,
    parts: [
      { key: nextKey(), categoryId: line.categoryId, amount: total, touched: false },
      { key: nextKey(), categoryId: null, amount: null, touched: false },
    ],
  };
}

export function setAmount(d: SplitDraft, key: string, amount: number | null): SplitDraft {
  const index = d.parts.findIndex((p) => p.key === key);
  if (index < 0) return d;
  const parts = d.parts.map((p, i) => (i === index ? { ...p, amount, touched: true } : p));
  return withRest({ ...d, parts, firstIsRest: index === 0 ? false : d.firstIsRest });
}

export function setCategory(d: SplitDraft, key: string, categoryId: string | null): SplitDraft {
  if (!d.parts.some((p) => p.key === key)) return d;
  return { ...d, parts: d.parts.map((p) => (p.key === key ? { ...p, categoryId } : p)) };
}

export function addPart(d: SplitDraft): SplitDraft {
  if (d.parts.length >= PARTS_MAX) return d;
  return { ...d, parts: [...d.parts, { key: nextKey(), categoryId: null, amount: null, touched: false }] };
}

export function removePart(d: SplitDraft, key: string): SplitDraft {
  if (d.parts.length <= PARTS_MIN || !d.parts.some((p) => p.key === key)) return d;
  return withRest({ ...d, parts: d.parts.filter((p) => p.key !== key) });
}

export function draftBalance(d: SplitDraft): Balance {
  return partsBalance(
    d.total,
    d.parts.map((p) => p.amount),
  );
}

export function canSave(d: SplitDraft): { ok: true } | { ok: false; reason: 'needsAmount' | 'notAddingUp' | 'tooFew' } {
  if (d.parts.length < PARTS_MIN) return { ok: false, reason: 'tooFew' };
  if (d.parts.some((p) => p.amount === null || p.amount <= 0)) return { ok: false, reason: 'needsAmount' };
  if (draftBalance(d).state !== 'addsUp') return { ok: false, reason: 'notAddingUp' };
  return { ok: true };
}

export function toSaveParts(d: SplitDraft): Part[] {
  return d.parts.map((p) => ({ categoryId: p.categoryId, amount: d.sign * (p.amount ?? 0) }));
}
