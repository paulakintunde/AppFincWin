// 05-21: the check route's href and the one place a new check id is minted (T-05-21-03: the check route
// validates the id again). The route itself lands in 05-30, hence the `as Href`.
import * as Crypto from 'expo-crypto';
import { type Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';

export type CheckKind = 'buy' | 'invest';

type CheckStepParam = '1' | '2' | '3' | '4' | '5';

/** `cleared` and `clearedStep` (05-75, D-77) name the check Clear just removed, so Undo can route back to it. */
export function checkHref(id: string, params: { kind?: CheckKind; step?: CheckStepParam; cleared?: string; clearedStep?: CheckStepParam } = {}): Href {
  return { pathname: '/decide/check/[id]', params: { id, ...params } } as Href;
}

/** Opens a brand-new check. Nothing is written until the check itself saves a draft. */
export function openNewCheck(kind: CheckKind): void {
  pushOnce(checkHref(Crypto.randomUUID(), { kind }));
}

export const PAST_HREF = '/decide/past' as Href;

// 05-113 (D-99): the lists' own pushed screens.
export const OPEN_HREF = '/decide/open' as Href;
export const CHANGES_HREF = '/decide/changes' as Href;
export const LINES_HREF = '/decide/lines' as Href;

// 05-125 (D-101, R18.1): the Pots screen, reached from Month details. 05-127 creates the route, hence the `as Href`.
export const POTS_HREF = '/decide/pots' as Href;
