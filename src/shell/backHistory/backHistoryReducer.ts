// D-05/D-06/D-07/D-08/D-22: the pure core of the app-wide back history. Kept free of any React,
// React Native or Expo Router import so every rule is unit-tested in isolation (house style:
// src/features/system/routeDecision.ts). The provider (BackHistoryProvider) is the only writer and
// only ever calls applyTransition on an OBSERVED navigation change, so native pops (iOS edge swipe,
// Android SwipeBack) and programmatic dismissals go through the same path. D-22: details live in
// the outer stack and cover the tab bar, so a tab location has no depth.

export const MAX_HISTORY = 8; // D-05 / NAV-02

export type Location =
  | { area: 'tab'; tab: string; href: string }
  | { area: 'outer'; depth: number; href: string };

export type Transition = 'none' | 'push' | 'pop';

export type BackAction =
  | { type: 'stackBack' }
  | { type: 'switchTab'; tab: string }
  | { type: 'discardEntry' }
  | { type: 'exit' };

export function sameLocation(a: Location, b: Location): boolean {
  if (a.area === 'tab') return b.area === 'tab' && a.tab === b.tab;
  return b.area === 'outer' && a.depth === b.depth && a.href === b.href;
}

export function pushEntry(history: readonly Location[], entry: Location): Location[] {
  const last = history[history.length - 1];
  if (last !== undefined && sameLocation(last, entry)) return [...history];
  return [...history, entry].slice(-MAX_HISTORY);
}

function lastMatchIndex(history: readonly Location[], next: Location): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry !== undefined && sameLocation(entry, next)) return i;
  }
  return -1;
}

export function popTo(history: readonly Location[], next: Location): Location[] {
  const idx = lastMatchIndex(history, next);
  return idx === -1 ? [...history] : history.slice(0, idx);
}

export function classifyTransition(
  prev: Location,
  next: Location,
  pendingBack: boolean,
): Transition {
  if (prev.area === 'tab' && next.area === 'tab') {
    if (prev.tab === next.tab) return 'none';
    return pendingBack ? 'pop' : 'push';
  }
  if (prev.area === 'tab') return 'push';
  if (next.area === 'tab') return 'pop';
  if (prev.depth === next.depth && prev.href === next.href) return 'none';
  if (next.depth < prev.depth) return 'pop';
  if (next.depth > prev.depth) return 'push';
  return pendingBack ? 'pop' : 'push';
}

export function applyTransition(
  history: readonly Location[],
  prev: Location | null,
  next: Location,
  pendingBack: boolean,
): Location[] {
  if (prev === null) return history as Location[];
  const kind = classifyTransition(prev, next, pendingBack);
  if (kind === 'none') return history as Location[];
  if (kind === 'push') return pushEntry(history, prev);
  if (lastMatchIndex(history, next) !== -1) return popTo(history, next);
  return pendingBack ? history.slice(0, -1) : (history as Location[]);
}

export function decideBack(
  current: Location | null,
  history: readonly Location[],
  homeTab: string,
): BackAction {
  if (current === null) return { type: 'exit' };
  if (current.area === 'outer') return { type: 'stackBack' };
  const top = history[history.length - 1];
  if (top !== undefined) {
    if (top.area === 'tab' && top.tab !== current.tab) return { type: 'switchTab', tab: top.tab };
    return { type: 'discardEntry' };
  }
  return current.tab !== homeTab ? { type: 'switchTab', tab: homeTab } : { type: 'exit' };
}
