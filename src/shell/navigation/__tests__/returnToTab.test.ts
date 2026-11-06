import { router } from 'expo-router';
import { focusedIsTabs, hasTabsInStack, returnToTab } from '../returnToTab';

jest.mock('expo-router', () => ({
  router: { canDismiss: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), navigate: jest.fn(), push: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

const withTabs = { routes: [{ name: '(app)', state: { routes: [{ name: '(tabs)' }, { name: 'import' }] } }] };
const noTabs = { routes: [{ name: '(app)', state: { routes: [{ name: 'setup/account' }, { name: 'import' }] } }] };
const tabsFocused = {
  index: 0,
  routes: [
    {
      name: '(app)',
      state: {
        index: 0,
        routes: [{ name: '(tabs)', state: { index: 2, routes: [{ name: 'index' }, { name: 'activity' }, { name: 'decide' }] } }],
      },
    },
  ],
};
const answerOverTabs = {
  index: 0,
  routes: [{ name: '(app)', state: { index: 1, routes: [{ name: '(tabs)' }, { name: 'decide/answer/[id]' }] } }],
};
const answerNoTabs = {
  index: 0,
  routes: [{ name: '(app)', state: { index: 1, routes: [{ name: 'onboarding' }, { name: 'decide/answer/[id]' }] } }],
};

describe('hasTabsInStack', () => {
  it('detects (tabs) in the outer stack', () => {
    expect(hasTabsInStack(withTabs)).toBe(true);
    expect(hasTabsInStack(noTabs)).toBe(false);
    expect(hasTabsInStack(undefined)).toBe(false);
    expect(hasTabsInStack(null)).toBe(false);
  });
});

describe('focusedIsTabs', () => {
  it('is true only when the focused (app) route is (tabs)', () => {
    expect(focusedIsTabs(tabsFocused)).toBe(true);
    expect(focusedIsTabs(answerOverTabs)).toBe(false);
    expect(focusedIsTabs(answerNoTabs)).toBe(false);
    expect(focusedIsTabs(undefined)).toBe(false);
  });
  it('uses the last route when index is absent', () => {
    expect(focusedIsTabs(withTabs)).toBe(false);
    expect(focusedIsTabs({ routes: [{ name: '(app)', state: { routes: [{ name: 'x' }, { name: '(tabs)' }] } }] })).toBe(true);
  });
});

describe('returnToTab', () => {
  it('switches tabs with navigate when (tabs) is focused', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(false);
    returnToTab('/activity' as never, tabsFocused);
    expect(router.navigate).toHaveBeenCalledWith('/activity');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it('dismisses to the existing (tabs) from an outer screen, never navigates or pushes (UAT gap 33)', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(true);
    returnToTab('/decide' as never, answerOverTabs);
    expect(router.dismissTo).toHaveBeenCalledWith('/decide');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it('replaces when no (tabs) is beneath (onboarding)', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(true);
    returnToTab('/activity' as never, answerNoTabs);
    expect(router.replace).toHaveBeenCalledWith('/activity');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('replaces when the stack cannot be dismissed', () => {
    (router.canDismiss as jest.Mock).mockReturnValue(false);
    returnToTab('/decide' as never, answerOverTabs);
    expect(router.replace).toHaveBeenCalledWith('/decide');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
