// NAV-04 / D-12b: pure drag-to-dismiss decision, no React/RN import (pattern: src/features/navigation/swipeBackGesture.ts).
// Prototype html L6481-6494: 1:1 follow, release past 92px slides out and dismisses at ~190ms, else snaps back.
// The fling rule is behind constants so on-device tuning is a one-line change (set SHEET_FLING_VELOCITY to Infinity to disable).
export const SHEET_DISMISS_DISTANCE = 92; // prototype L6489
export const SHEET_FLING_MIN = 24;
export const SHEET_FLING_VELOCITY = 1000; // px/s, 03-RESEARCH A4: tune on Pixel + iPhone XR
export const SHEET_DISMISS_DELAY = 190; // prototype L6490 dismissTop timer
export const BACKDROP_OPACITY = 0.38; // D-23: prototype backdrop is colors.ink at 38% alpha

export function clampDrag(dy: number): number {
  'worklet';
  return Math.max(0, dy);
}

export function sheetDragOutcome(dy: number, vy: number): 'dismiss' | 'snap' {
  'worklet';
  if (dy > SHEET_DISMISS_DISTANCE) return 'dismiss';
  return dy >= SHEET_FLING_MIN && vy >= SHEET_FLING_VELOCITY ? 'dismiss' : 'snap';
}
