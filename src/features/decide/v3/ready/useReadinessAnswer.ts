/**
 * 05.3-56 (D-24, D-28, D-29): what a readiness answer can do. features/decide may not reach the write path (depcruise
 * fx-fetch-never-from-reads), so the writes are supplied by src/shell/decide/ReadinessAnswerProvider.tsx through this
 * context. Types and the consumer only: nothing here imports a mutation.
 */
import { createContext, useContext } from 'react';
import type { ReadinessItem, ReadinessWaiver } from '@/engine/decide/v3';

export type ReadinessAction =
  | { readonly kind: 'markPaid'; readonly lineId: string }
  | { readonly kind: 'skip'; readonly lineId: string }
  | { readonly kind: 'waive'; readonly waiver: ReadinessWaiver }
  | { readonly kind: 'open'; readonly target: 'activity' | 'envelopes' };

/** Told once whether the answer's write landed (true), or was refused, failed or could not be made (false). */
export type ReadinessSettled = (ok: boolean) => void;

export interface ReadinessAnswer {
  /** item is null for the month link. */
  answer(item: ReadinessItem | null, action: ReadinessAction, onSettled?: ReadinessSettled): void;
  /** "Ask again": removes the stored waiver, with Undo. Does nothing when no live row holds it. */
  clearWaiver(waiver: ReadinessWaiver, name?: string | null): void;
}

/** With no provider mounted nothing is written: an answer settles false and Ask again does nothing. */
const INERT: ReadinessAnswer = {
  answer: (_item, _action, onSettled) => onSettled?.(false),
  clearWaiver: () => undefined,
};

export const ReadinessAnswerContext = createContext<ReadinessAnswer>(INERT);

export function useReadinessAnswer(): ReadinessAnswer {
  return useContext(ReadinessAnswerContext);
}
