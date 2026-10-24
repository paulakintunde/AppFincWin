// IN-D04: route and notification parameters arrive from a URL or a notification payload, so each is checked before it
// reaches a screen (T-05-30-01). One copy of the id pattern and of the array-param rule, shared by every route.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical hyphenated UUID (any version), the shape of every row id in the app. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** A search param that may repeat comes back as an array; the first value is the one used. */
export function oneParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The param as a UUID, or null when it is missing or malformed. */
export function uuidParam(value: string | string[] | undefined): string | null {
  const v = oneParam(value);
  return isUuid(v) ? v : null;
}
