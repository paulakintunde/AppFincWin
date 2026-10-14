// Pure threshold logic for the Android in-app edge swipe-back (261010-kpe). Pixel-style
// 3-button navigation has no system edge swipe, so inner (app) screens get one of their own.
// The edge is only 28dp wide so the pan never fights SwipeRow rows, horizontal ScrollViews or
// sliders, which all start mid-screen. Phase 3 (03-13) kept it on the outer stack, where every
// detail screen lives (D-22).
export const SWIPE_BACK_EDGE_WIDTH = 28;
export const SWIPE_BACK_DISTANCE = 80;
export const SWIPE_BACK_MIN_FLICK = 24;
export const SWIPE_BACK_VELOCITY = 600;

export interface SwipeSample {
  startX: number;
  translationX: number;
  translationY: number;
  velocityX: number;
}

export function shouldSwipeBack(s: SwipeSample): boolean {
  if (s.startX > SWIPE_BACK_EDGE_WIDTH) return false;
  if (s.translationX <= 0) return false;
  if (Math.abs(s.translationY) > s.translationX) return false;
  if (s.translationX >= SWIPE_BACK_DISTANCE) return true;
  return s.translationX >= SWIPE_BACK_MIN_FLICK && s.velocityX >= SWIPE_BACK_VELOCITY;
}

// Tab roots (the (tabs) group: Home, Activity, later Decide/Grow/Insights), the consent prompt
// and the linear setup flow never swipe back; detail screens do (D-07).
const NO_SWIPE_BACK: ReadonlySet<string> = new Set(['(tabs)', 'consent', 'setup/account', 'setup/history']);

export function isSwipeBackRoute(routeName: string): boolean {
  return !NO_SWIPE_BACK.has(routeName);
}
