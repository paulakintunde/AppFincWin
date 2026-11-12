import { CHANGES_HREF, LINES_HREF, NEW_CHECK_HREF, OPEN_HREF, PAST_HREF, POTS_HREF, checkHref, openNewCheck } from '../checkHref';
import { pushOnce } from '@/shell/navigation/pushOnce';

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));

describe('checkHref', () => {
  it('names the check route with its id and optional params', () => {
    expect(checkHref('abc')).toEqual({ pathname: '/decide/check/[id]', params: { id: 'abc' } });
    expect(checkHref('abc', { kind: 'invest', step: '3', cleared: 'z', clearedStep: '2' })).toEqual({
      pathname: '/decide/check/[id]',
      params: { id: 'abc', kind: 'invest', step: '3', cleared: 'z', clearedStep: '2' },
    });
  });

  it('openNewCheck pushes Decide home with the field focused', () => {
    openNewCheck('buy');
    expect(pushOnce).toHaveBeenCalledWith(NEW_CHECK_HREF);
    expect(NEW_CHECK_HREF).toBe('/decide?focus=check');
  });

  it('keeps the list hrefs', () => {
    expect([PAST_HREF, OPEN_HREF, CHANGES_HREF, LINES_HREF, POTS_HREF]).toEqual(['/decide/past', '/decide/open', '/decide/changes', '/decide/lines', '/grow?segment=goals']);
  });
});
