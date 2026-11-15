// 06.1-39 (D39): where quick estimates return to. Only a path inside /decide is followed (letters, digits, - and _ per segment);
// anything else, including full URLs, "//host" and ".." segments, goes to Decide home.
// Owner 2026-11-11: onboarding runs account -> quick estimates -> import history, so exactly /setup/history (with an optional
// accountId of letters, digits, - and _) is also followed. Nothing else outside /decide is.
const SAFE_RETURN = /^\/decide(\/[A-Za-z0-9_-]+)*$/;
const SETUP_HISTORY_RETURN = /^\/setup\/history(\?accountId=[A-Za-z0-9_-]{1,64})?$/;
export const DECIDE_HOME_PATH = '/decide';

export function safeReturnTo(returnTo: string | string[] | undefined): string {
  const v = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  return typeof v === 'string' && v.length <= 120 && (SAFE_RETURN.test(v) || SETUP_HISTORY_RETURN.test(v)) ? v : DECIDE_HOME_PATH;
}

/** 06.1-64 (CN-5 b, T-06.1-64-01): only an answer path counts as "back to the answer"; checked after safeReturnTo's allowlist. */
const ANSWER_RETURN = /^\/decide\/answer\/[A-Za-z0-9_-]+$/;
export type ReturnKind = 'answer' | 'other';

/** The safe return path and whether it is an answer (which the user came from, so it is the screen below). */
export function parseReturnTo(returnTo: string | string[] | undefined): { path: string; kind: ReturnKind } {
  const path = safeReturnTo(returnTo);
  return { path, kind: ANSWER_RETURN.test(path) ? 'answer' : 'other' };
}
