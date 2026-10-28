// 05.2-43: the open/close store for the loan and card sheet. The setup host (src/shell/decide/SetupSheetHost) opens it
// from the Loans step's "Edit" and "Add a loan or card"; DebtSheetHost, mounted by the setup route, draws it.
// Types only from db: no write path is imported here.
import { useSyncExternalStore } from 'react';
import { registerWipeHandler } from '@/services/storage/wipe';
import type { DebtRow } from '@/db/debts';
import type { DebtKindChoice } from './steps/setupSheetHost';

export type DebtSheetRequest = { mode: 'edit'; debt: DebtRow } | { mode: 'add'; kind: DebtKindChoice };

let request: DebtSheetRequest | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openDebtSheet(req: DebtSheetRequest): void {
  request = req;
  notify();
}

export function closeDebtSheet(): void {
  if (request === null) return;
  request = null;
  notify();
}

export function useDebtSheetRequest(): DebtSheetRequest | null {
  return useSyncExternalStore(subscribe, () => request);
}

export function resetDebtSheetForTests(): void {
  request = null;
  notify();
}

registerWipeHandler({
  id: 'debt-sheet',
  wipe: async () => {
    request = null;
    notify();
  },
});
