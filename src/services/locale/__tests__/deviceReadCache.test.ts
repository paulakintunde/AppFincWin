import { DEVICE_READ_TTL_MS, deviceReadTtl, heldRead, setDeviceReadTtl } from '../deviceReadCache';

// jest.setup.ts turns the hold off for every suite; these cases turn it on and put it back.
afterEach(() => {
  setDeviceReadTtl(0);
  jest.restoreAllMocks();
});

describe('06.1-72 heldRead (G-73-2)', () => {
  it('reuses a read for the hold, per key, and reads again after it', () => {
    setDeviceReadTtl(DEVICE_READ_TTL_MS);
    expect(deviceReadTtl()).toBe(1_000);
    let now = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const read = jest.fn((zone: string) => `${zone}:${now}`);
    const held = heldRead(read);
    expect(held('UTC')).toBe('UTC:10000');
    now += 999;
    expect(held('UTC')).toBe('UTC:10000');
    expect(read).toHaveBeenCalledTimes(1);
    // a different key reads at once
    expect(held('Europe/Berlin')).toBe('Europe/Berlin:10999');
    now += 1;
    expect(held('Europe/Berlin')).toBe('Europe/Berlin:10999');
    // the hold ran out
    now += 1_000;
    expect(held('Europe/Berlin')).toBe('Europe/Berlin:12000');
    // a clock that went back reads again
    now -= 5_000;
    expect(held('Europe/Berlin')).toBe('Europe/Berlin:7000');
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('reads every time while the hold is off', () => {
    setDeviceReadTtl(0);
    const read = jest.fn(() => Math.random());
    const held = heldRead(read);
    held(null);
    held(null);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
