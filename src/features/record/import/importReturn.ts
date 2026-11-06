// G3 / CR-01: import is an outer-stack screen above (tabs). replace() would mount a SECOND (tabs)
// (two FABs, two entry hosts, two TransactionSheets on one draft). Pop back to the existing one;
// replace only when (tabs) is absent (onboarding). An import started on Home finishes on Home.
import { router, type Href } from 'expo-router';
import type { NavStateLike } from '@/shell/backHistory/navLocation';
import { hasTabsInStack } from '@/shell/navigation/returnToTab';
import { ACTIVITY_HREF, APP_HOME_HREF } from '@/features/auth/appHome';

export type ImportReturn = 'home' | 'activity';

/** T-02-29-01 pattern: the route param is untrusted; only 'home' is honoured. */
export function parseImportReturn(raw: string | undefined): ImportReturn {
  return raw === 'home' ? 'home' : 'activity';
}

export function importReturnHref(r: ImportReturn): Href {
  return r === 'home' ? APP_HOME_HREF : ACTIVITY_HREF;
}

// WR-04's hasTabsInStack moved to the shell (05.3-114) so every return-to-tab site shares it.
export { hasTabsInStack } from '@/shell/navigation/returnToTab';

// G3 locked shape: dismissTo when there is a (tabs) beneath, else replace. canDismiss() alone is
// true for any stack of two or more screens, and dismissTo then pushes (WR-04), so (tabs) must be
// confirmed from the navigation state.
export function finishImport(r: ImportReturn, navState: NavStateLike | undefined | null): void {
  const href = importReturnHref(r);
  if (router.canDismiss() && hasTabsInStack(navState)) router.dismissTo(href);
  else router.replace(href);
}
