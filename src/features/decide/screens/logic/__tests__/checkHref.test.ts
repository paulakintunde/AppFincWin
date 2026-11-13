import { CHANGES_HREF, LINES_HREF, NEW_CHECK_HREF, OPEN_HREF, PAST_HREF, POTS_HREF, checkHref, openNewCheck } from '../checkHref';

const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ router: { dismissTo: (...a: unknown[]) => mockDismissTo(...a) } }));

describe('checkHref', () => {
  it('names the check route with its id and optional params', () => {
    expect(checkHref('abc')).toEqual({ pathname: '/decide/check/[id]', params: { id: 'abc' } });
    expect(checkHref('abc', { kind: 'invest', step: '3', cleared: 'z', clearedStep: '2' })).toEqual({
      pathname: '/decide/check/[id]',
      params: { id: 'abc', kind: 'invest', step: '3', cleared: 'z', clearedStep: '2' },
    });
  });

  it('openNewCheck returns to Decide home with the field focused, never pushing another copy (06.1-64 CN-4)', () => {
    openNewCheck('buy');
    expect(mockDismissTo).toHaveBeenCalledWith(NEW_CHECK_HREF);
    expect(NEW_CHECK_HREF).toBe('/decide?focus=check');
  });

  it('keeps the list hrefs', () => {
    expect([PAST_HREF, OPEN_HREF, CHANGES_HREF, LINES_HREF, POTS_HREF]).toEqual(['/decide/past', '/decide/open', '/decide/changes', '/decide/lines', '/grow?segment=goals']);
  });
});
