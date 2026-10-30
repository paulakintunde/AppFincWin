// 05.3: every v3 Decide route in one place. New names only, so the D-01 follow-up deletes the old route files without renames.
import * as Crypto from 'expo-crypto';
import { type Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';

export type PurchaseFocus = 'price';

export function purchaseHref(id: string, params: { focus?: PurchaseFocus } = {}): Href {
  return { pathname: '/decide/purchase/[id]', params: { id, ...params } } as Href;
}
export function answerHref(id: string): Href {
  return { pathname: '/decide/answer/[id]', params: { id } } as Href;
}
export function planHref(id: string): Href {
  return { pathname: '/decide/plan/[id]', params: { id } } as Href;
}
export function insteadHref(id: string): Href {
  return { pathname: '/decide/instead/[id]', params: { id } } as Href;
}
export function helpHref(id: string): Href {
  return { pathname: '/decide/help/[id]', params: { id } } as Href;
}
export const WORKED_HREF = '/decide/worked' as Href;
export const REFINE_HREF = '/decide/refine' as Href;
export const DECISIONS_HREF = '/decide/decisions' as Href;
export const ENVELOPES_HREF = '/decide/envelopes' as Href;
export const DECIDE_TAB_HREF = '/decide' as Href;

/** Opens a brand-new check. Nothing is written until the check saves a draft. */
export function openV3NewCheck(): void {
  pushOnce(purchaseHref(Crypto.randomUUID()));
}
