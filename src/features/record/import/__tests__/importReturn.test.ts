import { router } from 'expo-router';
import { ACTIVITY_HREF, APP_HOME_HREF } from '@/features/auth/appHome';
import { finishImport, importReturnHref, parseImportReturn } from '../importReturn';

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
  it('dismisses when possible', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(true);
    finishImport('home');
    expect(router.dismissTo).toHaveBeenCalledWith(APP_HOME_HREF);
    expect(router.replace).not.toHaveBeenCalled();
  });
  it('replaces when (tabs) is absent', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(false);
    finishImport('activity');
    expect(router.replace).toHaveBeenCalledWith(ACTIVITY_HREF);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
