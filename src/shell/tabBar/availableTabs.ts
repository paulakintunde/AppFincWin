// D-02 / D-03 / D-20: which tabs are visible. Pure: no React or I/O import.
// Availability is a build-rollout switch, not access control; data stays behind RLS.

import { TAB_ORDER, type TabId } from './tabs';

/**
 * D-02 build-rollout switch: each feature phase flips its own tab on as it lands
 * (Decide: Phase 5, Grow: Phase 6, Insights: Phase 7). D-03: never derived from a
 * user setting or onboarding answer.
 */
export const TAB_AVAILABILITY: Readonly<Record<TabId, boolean>> = {
  home: true,
  activity: true,
  decide: false,
  grow: false,
  insights: false,
};

export function availableTabs(availability: Readonly<Record<TabId, boolean>> = TAB_AVAILABILITY): TabId[] {
  return TAB_ORDER.filter((id) => availability[id]);
}

export function isTabAvailable(
  id: TabId,
  availability: Readonly<Record<TabId, boolean>> = TAB_AVAILABILITY,
): boolean {
  return availability[id];
}

/** D-20: screen-reader "N of M" counts only visible tabs. */
export function tabPosition(
  id: TabId,
  availability: Readonly<Record<TabId, boolean>> = TAB_AVAILABILITY,
): { position: number; total: number } | null {
  const visible = availableTabs(availability);
  const index = visible.indexOf(id);
  return index === -1 ? null : { position: index + 1, total: visible.length };
}
