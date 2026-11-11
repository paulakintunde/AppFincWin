// 06.1-39 (D39): where quick estimates return to. Only a path inside /decide is followed (letters, digits, - and _ per segment);
// anything else, including full URLs, "//host" and ".." segments, goes to Decide home.
const SAFE_RETURN = /^\/decide(\/[A-Za-z0-9_-]+)*$/;
export const DECIDE_HOME_PATH = '/decide';

export function safeReturnTo(returnTo: string | string[] | undefined): string {
  const v = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  return typeof v === 'string' && v.length <= 120 && SAFE_RETURN.test(v) ? v : DECIDE_HOME_PATH;
}
