import { router } from 'expo-router';
import { ACTIVITY_HREF, APP_HOME_HREF } from '@/features/auth/appHome';
import { finishImport, hasTabsInStack, importReturnHref, parseImportReturn } from '../importReturn';

jest.mock('expo-router', () => ({
  router: { canDismiss: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('importReturn', () => {
  it('allow-lists the from param', () => {
    expect(parseImportReturn('home')).toBe('home');
    expect(parseImportReturn(undefined)).toBe('activity');
    expect(parseImportReturn('activity')).toBe('activity');
    expect(parseImportReturn('../x')).toBe('activity');
  });
  it('maps to hrefs', () => {
    expect(importReturnHref('home')).toBe(APP_HOME_HREF);
    expect(importReturnHref('activity')).toBe(ACTIVITY_HREF);
  });
  const withTabs = { routes: [{ name: '(app)', state: { routes: [{ name: '(tabs)' }, { name: 'import' }] } }] };
  const noTabs = { routes: [{ name: '(app)', state: { routes: [{ name: 'setup/account' }, { name: 'import' }] } }] };
  it('detects (tabs) in the outer stack', () => {
    expect(hasTabsInStack(withTabs)).toBe(true);
    expect(hasTabsInStack(noTabs)).toBe(false);
    expect(hasTabsInStack(undefined)).toBe(false);
  });
  it('dismisses when possible', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(true);
    finishImport('home', withTabs);
    expect(router.dismissTo).toHaveBeenCalledWith(APP_HOME_HREF);
    expect(router.replace).not.toHaveBeenCalled();
  });
  it('replaces when other screens are stacked but (tabs) is absent (WR-04)', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(true);
    finishImport('activity', noTabs);
    expect(router.replace).toHaveBeenCalledWith(ACTIVITY_HREF);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
  it('replaces when (tabs) is absent', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(false);
    finishImport('activity', withTabs);
    expect(router.replace).toHaveBeenCalledWith(ACTIVITY_HREF);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
