// Pure threshold logic for the Android in-app edge swipe-back (261010-kpe). Pixel-style
// 3-button navigation has no system edge swipe, so inner (app) screens get one of their own.
// D-40: about 40dp so the zone is findable on 3-button navigation; SwipeRow rows, horizontal
// ScrollViews and sliders start inside the 22dp screen padding plus content, and the pan also
// fails on vertical motion and never activates leftward. Phase 3 (03-13) kept it on the outer stack, where every
// detail screen lives (D-22).
export const SWIPE_BACK_EDGE_WIDTH = 40;
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
const NO_SWIPE_BACK: ReadonlySet<string> = new Set(['(tabs)', 'consent', 'setup/account', 'setup/rough', 'setup/first-check', 'setup/history']);

export function isSwipeBackRoute(routeName: string): boolean {
  return !NO_SWIPE_BACK.has(routeName);
}

/** D-40: how far the screen follows the finger; never left of its rest position, never on a mostly vertical drag. */
export function dragOffset(translationX: number, translationY: number): number {
  if (translationX <= 0 || Math.abs(translationY) > translationX) return 0;
  return translationX;
}

let interceptor: (() => boolean) | null = null;

/** A screen (the Decide check flow) claims the edge swipe to step back before it leaves; null releases it. */
export function setSwipeBackInterceptor(fn: (() => boolean) | null): void {
  interceptor = fn;
}

/** True when the screen handled the swipe itself, so the route must not pop. */
export function interceptSwipeBack(): boolean {
  return interceptor ? interceptor() : false;
}
