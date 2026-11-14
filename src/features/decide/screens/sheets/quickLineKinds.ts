// 06.1-15 (D-21): which quick-estimate tiles are offered. Owner decision at plan 09 (2026-11-11): approve-all, so all four kinds
// ship. Plan 09's overlay counts every kind (expense, loan, savings, income) and its eight right-answer cases are approved.
// Narrow this list to ['expense'] to offer only the expense tile; the sheet and its tests read it, nothing else does.
import type { QuickLine } from '@/engine/decide/v3';

export type QuickLineKind = QuickLine['kind'];

export const QUICK_LINE_KINDS: readonly QuickLineKind[] = ['expense', 'loan', 'savings', 'income'];

export function isOfferedQuickKind(kind: QuickLineKind): boolean {
  return QUICK_LINE_KINDS.includes(kind);
}
