// CONTEXT D-11: the once-per-session request for the "Clear the sample figures?" prompt. Any
// real save path may call requestSampleClearPrompt(); the host (SampleClearPrompts) renders it.
// Cross-cutting UI state, so it lives outside data/ like undoToast.ts; no copy is formatted here.
import { useSyncExternalStore } from 'react';
import { registerWipeHandler } from '@/services/storage/wipe';

let requested = false;
let askedThisSession = false;
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

/** Asks for the prompt. At most one request per session, however many paths call it. */
export function requestSampleClearPrompt(): void {
  if (askedThisSession) return;
  askedThisSession = true;
  requested = true;
  notify();
}

export function dismissSampleClearPrompt(): void {
  if (!requested) return;
  requested = false;
  notify();
}

export function useSampleClearPromptRequest(): boolean {
  return useSyncExternalStore(subscribe, () => requested);
}

/** Test helper: the current request, readable outside React. */
export function getSampleClearPromptRequestForTests(): boolean {
  return requested;
}

/** Test helper: resets the session flag and the request. */
export function resetSamplePromptForTests(): void {
  requested = false;
  askedThisSession = false;
  notify();
}

registerWipeHandler({
  id: 'sample-prompt',
  wipe: async () => {
    requested = false;
    askedThisSession = false;
    notify();
  },
});
