// D-31: the single toast the host (plan 02-28) renders, carrying the latest undoable
// message and the step id its Undo action should replay. Cross-cutting UI state -- it
// lives outside data/ so any mutation hook can set it without a React context, and it
// never formats copy itself: `text` is an i18n key plus params, translated by the host
// (data/ never formats copy, per this module's own doc comment).
import { useSyncExternalStore } from 'react';
import type { UndoConflict } from '@/engine/undo';
import { registerWipeHandler } from '@/services/storage/wipe';

export type ToastKind = 'ordinary' | 'destructive' | 'refusal' | 'info';

/** An i18n key plus interpolation params -- the host (plan 02-28) translates it. */
export interface ToastText {
  key: string;
  params?: Record<string, string | number>;
}

/** Colour treatment only; `kind` alone decides duration and Undo. */
export type ToastTone = 'default' | 'warning';

export interface ToastState {
  id: number;
  kind: ToastKind;
  tone: ToastTone;
  text: ToastText | null;
  stepId: string | null;
  /**
   * A local Undo (nothing on the server), e.g. putting a removed entry-list item back. In memory
   * only: never persisted or serialised, and dropped with the toast on dismiss.
   */
  onUndo: (() => void) | null;
  refusal: UndoConflict | null;
  /** ms epoch when this toast became visible; hosts schedule the REMAINING time so moving between layers never restarts it (03 D-16, research Pitfall 9). */
  shownAt: number;
}

export const TOAST_MS_ORDINARY = 3200; // D-31 (prototype say())
export const TOAST_MS_DESTRUCTIVE = 6000; // D-31 deletes, bulk deletes, imports

/**
 * D-31 / C-CR-02: how long the host keeps a toast up before auto-dismissing it. `null` means
 * never auto-dismiss: with a screen reader running the user dismisses it themselves (the
 * History screen stays the fallback either way). A refusal carries a longer sentence ("Sam
 * edited Groceries after this...") so it gets the longer timing too.
 */
export function toastDurationMs(kind: ToastKind, screenReaderEnabled: boolean): number | null {
  if (screenReaderEnabled) return null;
  return kind === 'destructive' || kind === 'refusal' ? TOAST_MS_DESTRUCTIVE : TOAST_MS_ORDINARY;
}

type ToastInput = Parameters<typeof showToast>[0];

let toast: ToastState | null = null;
let nextId = 1;
// UI-SPEC 15: a toast that must follow another is "queued behind the first (never stacked)".
let pending: ToastInput[] = [];
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

/** Replaces any current toast with a new one (a new id), even mid-display. */
export function showToast(t: {
  kind: ToastKind;
  tone?: ToastTone;
  text?: ToastText | null;
  stepId?: string | null;
  onUndo?: (() => void) | null;
  refusal?: UndoConflict | null;
}): void {
  toast = {
    id: nextId++,
    kind: t.kind,
    tone: t.tone ?? 'default',
    text: t.text ?? null,
    stepId: t.stepId ?? null,
    onUndo: t.onUndo ?? null,
    refusal: t.refusal ?? null,
    shownAt: Date.now(),
  };
  notify();
}

/**
 * Shows `t` now when no toast is up; otherwise holds it (FIFO) and shows it once the current
 * toast is dismissed, by timeout or by the user. Never replaces a toast on screen.
 */
export function queueToast(t: ToastInput): void {
  if (toast === null) {
    showToast(t);
    return;
  }
  pending.push(t);
}

/** Clears the current toast, then shows the next queued one. A stale `id` is a no-op. */
export function dismissToast(id?: number): void {
  if (toast === null) return;
  if (id !== undefined && id !== toast.id) return;
  toast = null;
  const next = pending.shift();
  if (next !== undefined) {
    showToast(next);
    return;
  }
  notify();
}

export function getToast(): ToastState | null {
  return toast;
}

export function useToast(): ToastState | null {
  return useSyncExternalStore(subscribe, getToast);
}

// 05.2-23: a full-screen flow with its own footer (the setup stepper) lifts the app-layer toast above that footer so it
// never covers the primary button. The floor is a bottom offset in dp; null means no floor.
let toastFloor: number | null = null;
const floorListeners = new Set<() => void>();

export function setToastFloor(value: number | null): void {
  if (toastFloor === value) return;
  toastFloor = value;
  for (const listener of floorListeners) listener();
}

function subscribeFloor(listener: () => void): () => void {
  floorListeners.add(listener);
  return () => {
    floorListeners.delete(listener);
  };
}

export function useToastFloor(): number | null {
  return useSyncExternalStore(subscribeFloor, () => toastFloor);
}

/** Test helper: resets in-memory toast state between tests. */
export function resetToastForTests(): void {
  toast = null;
  pending = [];
  nextId = 1;
  notify();
}

// T-02-15-04: cleared on sign-out, same as every other in-memory UI store this project wipes.
registerWipeHandler({
  id: 'undo-toast',
  wipe: async () => {
    toast = null;
    pending = [];
    notify();
  },
});
