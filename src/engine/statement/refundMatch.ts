/**
 * Refund suggestions for statement import (CONTEXT D-07). A money-in row on a
 * card or current account whose merchant matches an earlier purchase is
 * offered as a refund of it. Same matcher style as transfer and pay matching:
 * suggestions only (default unticked), nothing is changed silently, and the
 * assignment is greedy and one-to-one.
 */
import { normaliseDescription } from '../categorize/guessCategory';
import { nameSimilarity } from './duplicates';

export const REFUND_LOOKBACK_DAYS = 120;
export const REFUND_NAME_SIMILARITY_MIN = 0.6;
export const REFUND_ACCOUNT_KINDS = ['credit', 'checking'] as const; // card or current account
const REFUND_WORDS: ReadonlySet<string> = new Set(['refund', 'return', 'credit', 'rfnd']);

export interface RefundImportRow {
  index: number;
  amount: number;
  currency: string;
  name: string;
  localDate: string;
  isTransfer: boolean;
}

export interface RefundPurchase {
  id: string;
  amount: number;
  currency: string;
  name: string | null;
  localDate: string;
  categoryId: string | null;
  isRefund: boolean;
}

export interface RefundMatch {
  index: number;
  purchaseId: string;
  merchant: string;
  categoryId: string | null;
}

function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number) as [number, number, number];
  const [yb, mb, db] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

function stripRefundWords(name: string): string {
  return normaliseDescription(name)
    .split(' ')
    .filter((t) => !REFUND_WORDS.has(t))
    .join(' ');
}

interface Candidate {
  rowIndex: number;
  purchaseId: string;
  merchant: string;
  categoryId: string | null;
  dayGap: number;
  amountDiff: number;
}

export function matchRefunds(
  rows: readonly RefundImportRow[],
  purchases: readonly RefundPurchase[],
  accountKind: string
): RefundMatch[] {
  if (!(REFUND_ACCOUNT_KINDS as readonly string[]).includes(accountKind)) return [];
  const candidates: Candidate[] = [];

  for (const row of rows) {
    if (row.amount <= 0 || row.isTransfer) continue;
    const rowName = stripRefundWords(row.name);
    for (const p of purchases) {
      if (p.isRefund || p.amount >= 0 || p.name === null) continue;
      if (p.currency !== row.currency) continue;
      const dayGap = daysBetween(p.localDate, row.localDate); // positive: refund after purchase
      if (dayGap < 0 || dayGap > REFUND_LOOKBACK_DAYS) continue;
      if (nameSimilarity(rowName, p.name) < REFUND_NAME_SIMILARITY_MIN) continue;
      candidates.push({
        rowIndex: row.index,
        purchaseId: p.id,
        merchant: p.name,
        categoryId: p.categoryId,
        dayGap,
        amountDiff: Math.abs(row.amount + p.amount),
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.dayGap !== b.dayGap) return a.dayGap - b.dayGap;
    if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
    if (a.purchaseId !== b.purchaseId) return a.purchaseId < b.purchaseId ? -1 : 1;
    return a.rowIndex - b.rowIndex;
  });

  const usedRows = new Set<number>();
  const usedPurchases = new Set<string>();
  const result: RefundMatch[] = [];
  for (const c of candidates) {
    if (usedRows.has(c.rowIndex) || usedPurchases.has(c.purchaseId)) continue;
    result.push({ index: c.rowIndex, purchaseId: c.purchaseId, merchant: c.merchant, categoryId: c.categoryId });
    usedRows.add(c.rowIndex);
    usedPurchases.add(c.purchaseId);
  }

  result.sort((a, b) => a.index - b.index);
  return result;
}
