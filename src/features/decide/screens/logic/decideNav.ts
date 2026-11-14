// 06.1-64 (H-3, FQ2, CN-1, CN-4, DN-3): the one place Decide decides "go to Decide home" and "go back to where you came from".
// The router is passed in, so this stays a pure helper (no hook, no screen import) and every branch is tested here.
import type { Href } from 'expo-router';
import { DECIDE_HOME_PATH, parseReturnTo } from '../setup/safeReturnTo';

/** The router calls these helpers use; expo-router's `router` and `useRouter()` both fit. */
export interface DecideNavRouter {
  back(): void;
  canGoBack(): boolean;
  dismissTo(href: Href): void;
}

/** The `from` param a step carries when the answer opened it. */
export const FROM_ANSWER = 'answer';

const DECIDE_HOME = '/decide';
const DECIDE_HOME_FOCUS = '/decide?focus=check';

/**
 * Goes to Decide home without stacking another copy: dismissTo pops back to the Decide home already in the stack, and only adds one
 * when none is there. `focusCheck` lands with the "What is it?" field focused (a new check).
 */
export function goDecideHome(router: Pick<DecideNavRouter, 'dismissTo'>, opts: { focusCheck?: boolean } = {}): void {
  router.dismissTo((opts.focusCheck === true ? DECIDE_HOME_FOCUS : DECIDE_HOME) as Href);
}

/** Back to the screen below (the answer that pushed this step); with nothing below, the fallback runs, so Back never leaves the app. */
export function backToCaller(router: Pick<DecideNavRouter, 'back' | 'canGoBack'>, fallback: () => void): void {
  if (router.canGoBack()) router.back();
  else fallback();
}

/** True when a route's `from` param says the answer opened this screen. */
export function isFromAnswer(from: string | string[] | undefined): boolean {
  const v = Array.isArray(from) ? from[0] : from;
  return v === FROM_ANSWER;
}

/** Adds `from=answer` to a step href (the object form stepHref builds, or a plain path). */
export function withFromAnswer(href: Href): Href {
  if (typeof href === 'string') return `${href}${href.includes('?') ? '&' : '?'}from=${FROM_ANSWER}` as Href;
  const obj = href as { pathname: string; params?: Record<string, unknown> };
  return { ...obj, params: { ...(obj.params ?? {}), from: FROM_ANSWER } } as unknown as Href;
}

/**
 * 06.1-64 (CN-5 b): leaving quick estimates. Opened from an answer, that answer is the screen below, so go back to it (the same answer,
 * now judged with the estimates) rather than adding a second copy; with nothing below, dismissTo it. No return path: Decide home.
 * Any other allowed path (the onboarding import step): dismissTo, which pops to it when it is below and otherwise takes this screen's place.
 */
export function returnFromQuickEstimates(router: DecideNavRouter, returnTo: string | string[] | undefined): void {
  const { path, kind } = parseReturnTo(returnTo);
  if (kind === 'answer') backToCaller(router, () => router.dismissTo(path as Href));
  else if (path === DECIDE_HOME_PATH) goDecideHome(router);
  else router.dismissTo(path as Href);
}
