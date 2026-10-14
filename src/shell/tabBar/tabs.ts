// NAV-01 / D-01: the canonical tab order. Pure: no React, Expo Router or I/O import, so the
// order and everything derived from it stay trivially testable.

// D-01: Decide in the centre slot (deliberate deviation from the prototype's Home, Activity,
// Grow, Decide, Insights).
export const TAB_ORDER = ['home', 'activity', 'decide', 'grow', 'insights'] as const;

export type TabId = (typeof TAB_ORDER)[number];

export const HOME_TAB: TabId = 'home';

export function isTabId(value: string): value is TabId {
  return (TAB_ORDER as readonly string[]).includes(value);
}
