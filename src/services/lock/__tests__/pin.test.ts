import { backoffFor, constantTimeEqual, hashPin, isValidPin, LOCK_TIMING_MS, PIN_LENGTH } from '../pin';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  digestStringAsync: jest.fn((_alg: string, s: string) => Promise.resolve(require('crypto').createHash('sha256').update(s).digest('hex'))),
  getRandomBytesAsync: jest.fn((n: number) => Promise.resolve(new Uint8Array(n).fill(7))),
}));

describe('pin', () => {
  it('has a 6 digit length and the D-02 timing choices', () => {
    expect(PIN_LENGTH).toBe(6);
    expect(LOCK_TIMING_MS).toEqual({ now: 0, oneMinute: 60_000, fiveMinutes: 300_000, fifteenMinutes: 900_000 });
  });

  it.each([
    [0, { kind: 'none' }],
    [4, { kind: 'none' }],
    [5, { kind: 'wait', ms: 30_000 }],
    [6, { kind: 'wait', ms: 60_000 }],
    [7, { kind: 'wait', ms: 120_000 }],
    [8, { kind: 'wait', ms: 300_000 }],
    [9, { kind: 'wait', ms: 900_000 }],
    [10, { kind: 'reauth' }],
    [11, { kind: 'reauth' }],
  ])('backoffFor(%i)', (n, expected) => {
    expect(backoffFor(n)).toEqual(expected);
  });

  it('validates exactly 6 ASCII digits', () => {
    expect(isValidPin('123456')).toBe(true);
    for (const bad of ['12345', '1234567', '12a456', '١٢٣٤٥٦', '', '12 456']) expect(isValidPin(bad)).toBe(false);
  });

  it('hashes with the salt and compares in constant time', async () => {
    const a = await hashPin('123456', 'aa');
    const b = await hashPin('123456', 'bb');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('123456');
    expect(constantTimeEqual(a, a)).toBe(true);
    expect(constantTimeEqual(a, b)).toBe(false);
    expect(constantTimeEqual('a', 'ab')).toBe(false);
  });
});
