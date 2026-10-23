/** 05-15: turns a copy-layer CopyRef (05-09) into text. keyParams are translated first, then interpolated. */
import type { CopyRef } from '../copy/types';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * D-94: the accessible label of a sentence built from amounts. `a11yParams` carries the spoken
 * form of each money param ("1,500 Canadian dollars") beside the visible ones; any name it holds
 * replaces the visible value, so the visible text itself is never touched.
 */
export function refTextA11y(t: Translate, r: CopyRef, a11yParams?: Record<string, string | number>): string {
  return refText(t, { ...r, params: { ...(r.params ?? {}), ...(a11yParams ?? {}) } });
}

export function refText(t: Translate, r: CopyRef): string {
  const params: Record<string, string | number> = { ...(r.params ?? {}) };
  if (r.keyParams) {
    for (const [name, key] of Object.entries(r.keyParams)) params[name] = t(key);
  }
  return t(r.key, params);
}
