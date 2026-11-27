// 10-review (L-7): the write-queue hold used by the lock screen's sign-in again.
import { onlineManager } from '@tanstack/react-query';
import { holdWrites, isWriteHeld, onWritesReleased, releaseWrites } from '../writeHold';

afterEach(() => {
  releaseWrites();
  onlineManager.setOnline(true);
});

describe('writeHold', () => {
  it('holding takes the queue offline; releasing with no bridge running puts it back online', () => {
    holdWrites();
    expect(isWriteHeld()).toBe(true);
    expect(onlineManager.isOnline()).toBe(false);
    releaseWrites();
    expect(isWriteHeld()).toBe(false);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('a release tells the bridge once; a release with no hold does nothing', () => {
    const listener = jest.fn();
    const stop = onWritesReleased(listener);
    releaseWrites();
    expect(listener).not.toHaveBeenCalled();
    holdWrites();
    releaseWrites();
    releaseWrites();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    holdWrites();
    releaseWrites();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
