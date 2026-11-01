// UAT gap 33 (05.3-114): return to a tab without stacking a second (tabs). In expo-router 57.0.22,
// router.navigate('/decide') from an outer-stack screen (an answer, help, import) pushes a SECOND
// (tabs) above it, so the next Back pops that copy and shows the outer screen again. The record-import
// flow already solved this (G3 / WR-04): dismissTo when a (tabs) is beneath, else replace. From a tab,
// navigate is a plain tab switch and stays as is.
import { router, type Href } from 'expo-router';
import { OUTER_GROUP, TABS_GROUP, type NavStateLike } from '@/shell/backHistory/navLocation';

type Route = NavStateLike['routes'][number];

/** The (app) stack's own state, found by walking the focused path from the root. */
function outerStack(state: NavStateLike | undefined | null): NavStateLike | undefined {
  let cursor: NavStateLike | undefined | null = state;
  while (cursor) {
    const outer: Route | undefined = cursor.routes.find((r) => r.name === OUTER_GROUP);
    if (outer) return outer.state;
    const idx = cursor.index ?? cursor.routes.length - 1;
    cursor = cursor.routes[idx]?.state;
  }
  return undefined;
}

/** WR-04: true when the outer (app) stack holds a (tabs) route to pop back to. */
export function hasTabsInStack(state: NavStateLike | undefined | null): boolean {
  return (outerStack(state)?.routes ?? []).some((r) => r.name === TABS_GROUP);
}

/** True when the focused route of the (app) stack is (tabs), i.e. the caller runs on a tab. */
export function focusedIsTabs(state: NavStateLike | undefined | null): boolean {
  const outer = outerStack(state);
  if (!outer) return false;
  const idx = outer.index ?? outer.routes.length - 1;
  return outer.routes[idx]?.name === TABS_GROUP;
}

// G3 locked shape: canDismiss() alone is true for any stack of two or more screens, and dismissTo
// then pushes (WR-04), so (tabs) must be confirmed from the navigation state.
export function returnToTab(href: Href, state: NavStateLike | undefined | null): void {
  if (focusedIsTabs(state)) router.navigate(href);
  else if (router.canDismiss() && hasTabsInStack(state)) router.dismissTo(href);
  else router.replace(href);
}
