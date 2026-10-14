// D-05/D-22: translate an Expo Router / React Navigation state into the Location the back history
// records. Kept free of any React, React Native or Expo Router import (house style:
// src/features/system/routeDecision.ts); it only reads a plain state-shaped object.

import type { Location } from './backHistoryReducer';

export const OUTER_GROUP = '(app)';
export const TABS_GROUP = '(tabs)';

export interface NavStateLike {
  index?: number;
  routes: readonly { name: string; state?: NavStateLike }[];
}

function focusedIndex(state: NavStateLike): number {
  return state.index ?? state.routes.length - 1;
}

export function locationFromNavState(
  state: NavStateLike | undefined | null,
  pathname: string,
): Location | null {
  let cursor: NavStateLike | undefined | null = state;
  let outer: NavStateLike | undefined;
  while (cursor) {
    const route: NavStateLike['routes'][number] | undefined = cursor.routes[focusedIndex(cursor)];
    if (!route) return null;
    if (route.name === OUTER_GROUP) {
      outer = route.state;
      break;
    }
    cursor = route.state;
  }
  if (!outer) return null;

  const oi = focusedIndex(outer);
  const focused = outer.routes[oi];
  if (!focused) return null;
  if (focused.name === TABS_GROUP) {
    const tabs = focused.state;
    if (!tabs) return null;
    const tabRoute = tabs.routes[focusedIndex(tabs)];
    if (!tabRoute) return null;
    return { area: 'tab', tab: tabRoute.name, href: pathname };
  }
  return { area: 'outer', depth: oi, href: pathname };
}
