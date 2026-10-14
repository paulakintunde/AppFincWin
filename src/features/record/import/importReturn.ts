// G3 / CR-01: import is an outer-stack screen above (tabs). replace() would mount a SECOND (tabs)
// (two FABs, two entry hosts, two TransactionSheets on one draft). Pop back to the existing one;
// replace only when (tabs) is absent (onboarding). An import started on Home finishes on Home.
import { router, type Href } from 'expo-router';
import { ACTIVITY_HREF, APP_HOME_HREF } from '@/features/auth/appHome';

export type ImportReturn = 'home' | 'activity';

/** T-02-29-01 pattern: the route param is untrusted; only 'home' is honoured. */
export function parseImportReturn(raw: string | undefined): ImportReturn {
  return raw === 'home' ? 'home' : 'activity';
}

export function importReturnHref(r: ImportReturn): Href {
  return r === 'home' ? APP_HOME_HREF : ACTIVITY_HREF;
}

// G3 locked shape: router.canDismiss() ? router.dismissTo(href) : router.replace(href)
export function finishImport(r: ImportReturn): void {
  const href = importReturnHref(r);
  if (router.canDismiss()) router.dismissTo(href);
  else router.replace(href);
}
