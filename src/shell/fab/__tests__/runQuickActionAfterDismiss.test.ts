// 05-98 (D-85, R16.1): the quick action runs after the dismissal's transitionEnd, once.
import { runQuickActionAfterDismiss, TRANSITION_FALLBACK_MS } from '../runQuickActionAfterDismiss';

function setup() {
  let fire: () => void = () => undefined;
  const unsubscribe = jest.fn();
  const dismissTo = jest.fn();
  const onTransitionEnd = jest.fn((l: () => void) => {
    fire = l;
    return unsubscribe;
  });
  const handler = jest.fn();
  return { dismissTo, onTransitionEnd, unsubscribe, handler, fire: () => fire() };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('runQuickActionAfterDismiss', () => {
  it('D-85 dismisses first and runs the handler once on transitionEnd, then unsubscribes', () => {
    const s = setup();
    const ran = runQuickActionAfterDismiss('transfer', {
      dismissTo: s.dismissTo,
      onTransitionEnd: s.onTransitionEnd,
      handlers: { transfer: s.handler },
    });
    expect(ran).toBe(true);
    expect(s.dismissTo).toHaveBeenCalledTimes(1);
    expect(s.handler).not.toHaveBeenCalled();
    s.fire();
    s.fire();
    expect(s.handler).toHaveBeenCalledTimes(1);
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(TRANSITION_FALLBACK_MS * 2);
    expect(s.handler).toHaveBeenCalledTimes(1);
  });

  it('D-85 a missing handler does nothing', () => {
    const s = setup();
    const ran = runQuickActionAfterDismiss('newCheck', {
      dismissTo: s.dismissTo,
      onTransitionEnd: s.onTransitionEnd,
      handlers: {},
    });
    expect(ran).toBe(false);
    expect(s.dismissTo).not.toHaveBeenCalled();
    expect(s.onTransitionEnd).not.toHaveBeenCalled();
  });

  it('D-85 falls back to a timer when the transition event never arrives', () => {
    const s = setup();
    runQuickActionAfterDismiss('addIncome', {
      dismissTo: s.dismissTo,
      onTransitionEnd: s.onTransitionEnd,
      handlers: { addIncome: s.handler },
    });
    jest.advanceTimersByTime(TRANSITION_FALLBACK_MS);
    expect(s.handler).toHaveBeenCalledTimes(1);
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
