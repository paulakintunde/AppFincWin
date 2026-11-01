// 05.3-116 (UAT gap 34): one pure rule decides when the app counts as offline. A short
// reachability blip on a working connection must not pause the write queue.
import { createOnlineGate, netClass, UNREACHABLE_GRACE_MS } from '../connectivity';

describe('netClass', () => {
  it.each([
    [{ isConnected: false, isInternetReachable: false }, 'offline'],
    [{ isConnected: false, isInternetReachable: true }, 'offline'],
    [{ isConnected: false, isInternetReachable: null }, 'offline'],
    [{ isConnected: true, isInternetReachable: false }, 'unreachable'],
    [{ isConnected: null, isInternetReachable: false }, 'unreachable'],
    [{ isConnected: true, isInternetReachable: true }, 'online'],
    [{ isConnected: null, isInternetReachable: null }, 'online'],
    [{ isConnected: true, isInternetReachable: null }, 'online'],
  ] as const)('netClass(%o) === %s', (state, expected) => {
    expect(netClass(state)).toBe(expected);
  });
});

const ONLINE = { isConnected: true, isInternetReachable: true };
const UNREACHABLE = { isConnected: true, isInternetReachable: false };
const OFFLINE = { isConnected: false, isInternetReachable: false };

describe('createOnlineGate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses a 10 second grace', () => {
    expect(UNREACHABLE_GRACE_MS).toBe(10_000);
  });

  it('a reachability blip under 10 s stays online; 10 s sustained goes offline', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    expect(gate.update(UNREACHABLE)).toBe(true);
    expect(setOnline).not.toHaveBeenCalledWith(false);
    jest.advanceTimersByTime(9_999);
    expect(setOnline).not.toHaveBeenCalledWith(false);
    expect(gate.isOnline()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(setOnline).toHaveBeenLastCalledWith(false);
    expect(gate.isOnline()).toBe(false);
  });

  it('a reachable report cancels the pending timer and sets online at once', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    gate.update(UNREACHABLE);
    jest.advanceTimersByTime(3_000);
    expect(gate.update(ONLINE)).toBe(true);
    expect(setOnline).toHaveBeenLastCalledWith(true);
    jest.advanceTimersByTime(10_000);
    expect(setOnline).not.toHaveBeenCalledWith(false);
    expect(gate.isOnline()).toBe(true);
  });

  it('a not-yet-known report counts as reachable', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    gate.update(UNREACHABLE);
    expect(gate.update({ isConnected: null, isInternetReachable: null })).toBe(true);
    jest.advanceTimersByTime(20_000);
    expect(setOnline).not.toHaveBeenCalledWith(false);
  });

  it('repeated unreachable reports do not restart the timer', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    gate.update(UNREACHABLE);
    jest.advanceTimersByTime(6_000);
    gate.update(UNREACHABLE);
    jest.advanceTimersByTime(4_000);
    expect(setOnline).toHaveBeenLastCalledWith(false);
    expect(setOnline.mock.calls.filter((c) => c[0] === false)).toHaveLength(1);
  });

  it('a disconnect is instant and cancels a pending timer; reconnect is instant', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    gate.update(UNREACHABLE);
    expect(gate.update(OFFLINE)).toBe(false);
    expect(setOnline).toHaveBeenLastCalledWith(false);
    expect(gate.isOnline()).toBe(false);
    jest.advanceTimersByTime(10_000);
    expect(setOnline.mock.calls.filter((c) => c[0] === false)).toHaveLength(1);
    expect(gate.update(ONLINE)).toBe(true);
    expect(setOnline).toHaveBeenLastCalledWith(true);
    expect(gate.isOnline()).toBe(true);
  });

  it('an unreachable report while offline stays offline', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    gate.update(OFFLINE);
    expect(gate.update(UNREACHABLE)).toBe(false);
    expect(gate.isOnline()).toBe(false);
  });

  it('dispose cancels a pending timer', () => {
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline);
    gate.update(UNREACHABLE);
    gate.dispose();
    jest.advanceTimersByTime(20_000);
    expect(setOnline).not.toHaveBeenCalled();
    expect(gate.isOnline()).toBe(true);
  });

  it('accepts injected timers', () => {
    const fns: Array<() => void> = [];
    const timers = { set: jest.fn((fn: () => void) => fns.push(fn)), clear: jest.fn() };
    const setOnline = jest.fn();
    const gate = createOnlineGate(setOnline, timers);
    gate.update(UNREACHABLE);
    expect(timers.set).toHaveBeenCalledWith(expect.any(Function), UNREACHABLE_GRACE_MS);
    fns[0]();
    expect(gate.isOnline()).toBe(false);
    expect(setOnline).toHaveBeenLastCalledWith(false);
  });
});
