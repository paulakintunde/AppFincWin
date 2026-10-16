// 05-21: the check route's href and the one place a new check id is minted (T-05-21-03: the check route
// validates the id again). The route itself lands in 05-30, hence the `as Href`.
import * as Crypto from 'expo-crypto';
import { type Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';

export type CheckKind = 'buy' | 'invest';

export function checkHref(id: string, params: { kind?: CheckKind; step?: '1' | '2' | '3' } = {}): Href {
  return { pathname: '/decide/check/[id]', params: { id, ...params } } as Href;
}

/** Opens a brand-new check. Nothing is written until the check itself saves a draft. */
export function openNewCheck(kind: CheckKind): void {
  pushOnce(checkHref(Crypto.randomUUID(), { kind }));
}

export const PAST_HREF = '/decide/past' as Href;
