/** 05-15: turns a copy-layer CopyRef (05-09) into text. keyParams are translated first, then interpolated. */
import type { CopyRef } from '../copy/types';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function refText(t: Translate, r: CopyRef): string {
  const params: Record<string, string | number> = { ...(r.params ?? {}) };
  if (r.keyParams) {
    for (const [name, key] of Object.entries(r.keyParams)) params[name] = t(key);
  }
  return t(r.key, params);
}
