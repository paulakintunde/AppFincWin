import {
  SWIPE_BACK_EDGE_WIDTH,
  dragOffset,
  interceptSwipeBack,
  isSwipeBackRoute,
  setSwipeBackInterceptor,
  shouldSwipeBack,
} from '../swipeBackGesture';

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

describe('D-40 edge zone and drag offset', () => {
  it('edge width is 40', () => expect(SWIPE_BACK_EDGE_WIDTH).toBe(40));
  it('accepts a start at 35 and rejects 41', () => {
    expect(shouldSwipeBack(s({ startX: 35 }))).toBe(true);
    expect(shouldSwipeBack(s({ startX: 41 }))).toBe(false);
  });
  it('follows rightward drags only', () => {
    expect(dragOffset(60, 5)).toBe(60);
    expect(dragOffset(-30, 0)).toBe(0);
    expect(dragOffset(50, 80)).toBe(0);
  });
});

describe('isSwipeBackRoute', () => {
  it.each(['(tabs)', 'consent', 'setup/account', 'setup/rough', 'setup/first-check', 'setup/history'])('is off for %s', (r) => expect(isSwipeBackRoute(r)).toBe(false));
  it.each(['accounts/index', 'accounts/[id]', 'categories', 'history', 'import', 'you'])('is on for %s', (r) =>
    expect(isSwipeBackRoute(r)).toBe(true)
  );
});

describe('swipe-back interceptor (A8)', () => {
  afterEach(() => setSwipeBackInterceptor(null));
  it('is false when none is set', () => expect(interceptSwipeBack()).toBe(false));
  it('returns the interceptor result', () => {
    setSwipeBackInterceptor(() => true);
    expect(interceptSwipeBack()).toBe(true);
    setSwipeBackInterceptor(() => false);
    expect(interceptSwipeBack()).toBe(false);
  });
  it('is false again once cleared', () => {
    setSwipeBackInterceptor(() => true);
    setSwipeBackInterceptor(null);
    expect(interceptSwipeBack()).toBe(false);
  });
});
