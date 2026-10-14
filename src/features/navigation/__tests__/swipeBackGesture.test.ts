import { isSwipeBackRoute, shouldSwipeBack } from '../swipeBackGesture';

const s = (o: Partial<Parameters<typeof shouldSwipeBack>[0]> = {}) => ({
  startX: 5,
  translationX: 120,
  translationY: 4,
  velocityX: 100,
  ...o,
});

describe('shouldSwipeBack', () => {
  it('accepts a long edge swipe', () => expect(shouldSwipeBack(s())).toBe(true));
  it('accepts a fast short flick', () => expect(shouldSwipeBack(s({ translationX: 30, velocityX: 700 }))).toBe(true));
  it('rejects a slow short drag', () => expect(shouldSwipeBack(s({ translationX: 50, velocityX: 100 }))).toBe(false));
  it('rejects a mid-screen start', () => expect(shouldSwipeBack(s({ startX: 100 }))).toBe(false));
  it('rejects a tiny fast swipe', () => expect(shouldSwipeBack(s({ translationX: 10, velocityX: 2000 }))).toBe(false));
  it('rejects vertical or diagonal motion', () => expect(shouldSwipeBack(s({ translationY: 200 }))).toBe(false));
  it('rejects a leftward swipe', () => expect(shouldSwipeBack(s({ translationX: -120 }))).toBe(false));
});

describe('isSwipeBackRoute', () => {
  it.each(['(tabs)', 'consent', 'setup/account', 'setup/history'])('is off for %s', (r) => expect(isSwipeBackRoute(r)).toBe(false));
  it.each(['accounts/index', 'accounts/[id]', 'categories', 'history', 'import', 'you'])('is on for %s', (r) =>
    expect(isSwipeBackRoute(r)).toBe(true)
  );
});
