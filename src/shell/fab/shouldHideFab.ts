// D-10 / NAV-05: whether the floating action button is hidden. Pure: no React or I/O import.
// Mirrors prototype `fabShow` (html 6866).
//   'locked'     - set by Phase 10's lock screen
//   'onboarding' - set by Phase 9
//   'stepFlow'   - set by Phase 5's check editor and date pickers
//   'bulkSelect' / 'entryFlow' - set by Record
//   sheetOpen    - from the sheet stack store (03-06)
//   signedIn     - defence in depth: the (app) group is Stack.Protected
// D-22: an outer (detail) screen covers the tab group, so 'outer' hides the button.

export type FabHideReason = 'bulkSelect' | 'entryFlow' | 'onboarding' | 'stepFlow' | 'locked';

export type FabSurface = 'tabRoot' | 'outer' | 'unknown';

export interface FabVisibilityInput {
  signedIn: boolean;
  surface: FabSurface;
  sheetOpen: boolean;
  hideReasons: readonly FabHideReason[];
  hasAction: boolean;
}

export function shouldHideFab(input: FabVisibilityInput): boolean {
  return !(
    input.signedIn &&
    input.surface === 'tabRoot' &&
    !input.sheetOpen &&
    input.hideReasons.length === 0 &&
    input.hasAction
  );
}

export function fabSurface(location: { area: 'tab' | 'outer' } | null): FabSurface {
  if (location === null) return 'unknown';
  return location.area === 'tab' ? 'tabRoot' : 'outer';
}
