import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

const subscribe = (listener: () => void): (() => void) => onlineManager.subscribe(listener);
const isOnline = (): boolean => onlineManager.isOnline();

/**
 * 06.1-72 (G-73-1): only whether the app is online. useSyncStatus also reads the last-synced time, which moves on every
 * successful fetch, so a screen that needs only this flag re-rendered once per fetch (Decide home under the answer: one
 * commit per refetched read). This hook re-renders only when the online state flips.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline);
}
