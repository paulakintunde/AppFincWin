import { IDLE_TIMEOUT_MS, scheduleIdle } from '../scheduleIdle';

const g = globalThis as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };

describe('scheduleIdle (D-88)', () => {
  const saved = { request: g.requestIdleCallback, cancel: g.cancelIdleCallback };
  afterEach(() => {
    g.requestIdleCallback = saved.request;
    g.cancelIdleCallback = saved.cancel;
    jest.useRealTimers();
  });

  it('uses requestIdleCallback where it exists, and cancels with cancelIdleCallback', () => {
    const request = jest.fn(() => 7);
    const cancel = jest.fn();
    g.requestIdleCallback = request;
    g.cancelIdleCallback = cancel;
    const task = jest.fn();
    const stop = scheduleIdle(task);
    expect(request).toHaveBeenCalledWith(task, { timeout: IDLE_TIMEOUT_MS });
    stop();
    expect(cancel).toHaveBeenCalledWith(7);
    g.cancelIdleCallback = undefined;
    expect(() => scheduleIdle(task)()).not.toThrow();
  });

  it('falls back to a 0 ms timeout, which cancels', () => {
    jest.useFakeTimers();
    g.requestIdleCallback = undefined;
    const task = jest.fn();
    scheduleIdle(task);
    jest.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledTimes(1);
    const cancelled = jest.fn();
    scheduleIdle(cancelled)();
    jest.advanceTimersByTime(10);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
