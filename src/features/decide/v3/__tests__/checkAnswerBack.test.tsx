// 05.3-86: check and answer replace each other, so Back from either returns to Decide home in one step.
// Drives the real pushOnce/replaceOnce over a mocked router that records a stack.
import { pushOnce, replaceOnce, resetPushOnceForTests, PUSH_GUARD_MS } from '@/shell/navigation/pushOnce';
import { answerHref, purchaseHref } from '../nav/hrefs';

const mockStack: string[] = [];
const label = (h: unknown) => (typeof h === 'string' ? h : JSON.stringify(h));

jest.mock('expo-router', () => ({
  router: {
    push: (h: unknown) => mockStack.push(label(h)),
    replace: (h: unknown) => {
      mockStack[mockStack.length - 1] = label(h);
    },
    back: () => mockStack.pop(),
  },
}));

let now = 1000;
beforeEach(() => {
  mockStack.length = 0;
  mockStack.push('home');
  resetPushOnceForTests();
  now = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

const tap = (fn: () => void) => {
  now += PUSH_GUARD_MS;
  fn();
};

describe('check <-> answer back history', () => {
  it('repeated Change details and Check it leaves [home, answer]; one back returns home', () => {
    tap(() => pushOnce(purchaseHref('c1')));
    tap(() => replaceOnce(answerHref('c1')));
    for (let i = 0; i < 3; i++) {
      tap(() => replaceOnce(purchaseHref('c1')));
      tap(() => replaceOnce(answerHref('c1')));
    }
    expect(mockStack).toHaveLength(2);
    expect(mockStack[0]).toBe('home');
    expect(mockStack[1]).toContain('/decide/answer/[id]');
    (jest.requireMock('expo-router') as { router: { back: () => void } }).router.back();
    expect(mockStack).toEqual(['home']);
  });

  it('a fast double tap on Check it opens one screen', () => {
    tap(() => pushOnce(purchaseHref('c1')));
    now += PUSH_GUARD_MS;
    replaceOnce(answerHref('c1'));
    replaceOnce(answerHref('c1'));
    expect(mockStack).toHaveLength(2);
  });
});
