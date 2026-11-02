import { isOfflinePaused, isQueuedBehind } from '../writeQueueState';

describe('writeQueueState', () => {
  it('reads a paused write as offline only when the app is offline', () => {
    expect(isOfflinePaused({ status: 'pending', isPaused: true }, false)).toBe(true);
    expect(isOfflinePaused({ status: 'pending', isPaused: true }, true)).toBe(false);
    expect(isOfflinePaused({ status: 'pending', isPaused: false }, false)).toBe(false);
    expect(isOfflinePaused({ status: 'error', isPaused: true }, false)).toBe(false);
  });
  it('reads a paused write while online as queued behind another write', () => {
    expect(isQueuedBehind({ status: 'pending', isPaused: true }, true)).toBe(true);
    expect(isQueuedBehind({ status: 'pending', isPaused: true }, false)).toBe(false);
    expect(isQueuedBehind({ status: 'pending', isPaused: false }, true)).toBe(false);
  });
});
