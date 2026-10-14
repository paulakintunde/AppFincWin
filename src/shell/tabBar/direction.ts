// NAV-01 / D-01 / D-05: tab slide direction. Pure: no React or I/O import.
// Prototype: dir = TABS.indexOf(to) >= TABS.indexOf(from) ? 1 : -1; goBack always dir -1.

import { TAB_ORDER, type TabId } from './tabs';

export const SLIDE_OFFSET = 22; // fw-slideL / fw-slideR translateX, html 26-27

export type SlideDirection = 'fromRight' | 'fromLeft' | 'none';

export const BACK_SLIDE: SlideDirection = 'fromLeft'; // D-05: prototype goBack dir:-1 -> fw-slideR

/** Forward move: compares D-01 TAB_ORDER indices, never visible positions. */
export function slideDirection(from: TabId, to: TabId): SlideDirection {
  const a = TAB_ORDER.indexOf(from);
  const b = TAB_ORDER.indexOf(to);
  if (b === a) return 'none';
  return b > a ? 'fromRight' : 'fromLeft';
}

export function slideFor(from: TabId, to: TabId, isBack: boolean): SlideDirection {
  if (from === to) return 'none';
  return isBack ? BACK_SLIDE : slideDirection(from, to);
}

export function slideStartX(direction: SlideDirection): number {
  if (direction === 'fromRight') return SLIDE_OFFSET;
  if (direction === 'fromLeft') return -SLIDE_OFFSET;
  return 0;
}
