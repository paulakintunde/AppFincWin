import * as Crypto from 'expo-crypto';
import { pushOnce } from '@/shell/navigation/pushOnce';
import {
  answerHref, DECIDE_TAB_HREF, DECISIONS_HREF, ENVELOPES_HREF, helpHref, insteadHref, openV3NewCheck,
  planHref, purchaseHref, REFINE_HREF, WORKED_HREF,
} from '../hrefs';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));

describe('v3 hrefs', () => {
  it('builds id routes', () => {
    expect(purchaseHref('a')).toEqual({ pathname: '/decide/purchase/[id]', params: { id: 'a' } });
    expect(purchaseHref('a', { focus: 'price' })).toEqual({ pathname: '/decide/purchase/[id]', params: { id: 'a', focus: 'price' } });
    expect(answerHref('a')).toEqual({ pathname: '/decide/answer/[id]', params: { id: 'a' } });
    expect(planHref('a')).toEqual({ pathname: '/decide/plan/[id]', params: { id: 'a' } });
    expect(insteadHref('a')).toEqual({ pathname: '/decide/instead/[id]', params: { id: 'a' } });
    expect(helpHref('a')).toEqual({ pathname: '/decide/help/[id]', params: { id: 'a' } });
  });
  it('has fixed paths, none of them an old route', () => {
    expect([WORKED_HREF, REFINE_HREF, DECISIONS_HREF, ENVELOPES_HREF, DECIDE_TAB_HREF]).toEqual([
      '/decide/worked', '/decide/refine', '/decide/decisions', '/decide/envelopes', '/decide',
    ]);
    const all = JSON.stringify([WORKED_HREF, REFINE_HREF, DECISIONS_HREF, ENVELOPES_HREF, purchaseHref('a'), answerHref('a')]);
    expect(all).not.toMatch(/\/decide\/(check|past|open|changes|lines|pots)/);
  });
  it('openV3NewCheck mints one id and pushes once', () => {
    openV3NewCheck();
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(pushOnce).toHaveBeenCalledTimes(1);
    expect(pushOnce).toHaveBeenCalledWith(purchaseHref('11111111-1111-4111-8111-111111111111'));
  });
});
