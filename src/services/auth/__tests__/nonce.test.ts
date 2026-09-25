// T-00-15-01: createNonce() must produce a raw value whose SHA-256 hash matches `hashed`
// exactly, and a fresh raw value on every call (never cached, never reused across attempts).
// Uses Node's own `crypto` module as the source of truth -- expo-crypto is mocked to delegate
// to it, so the assertion is never circular (it doesn't just re-call the mock to check itself).
import { createHash } from 'crypto';

jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('hex'),
  };
});

import { createNonce } from '../nonce';

describe('createNonce', () => {
  it('returns a raw value whose SHA-256 hash equals hashed', async () => {
    const { raw, hashed } = await createNonce();
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('produces a different raw value on every call', async () => {
    const a = await createNonce();
    const b = await createNonce();
    expect(a.raw).not.toBe(b.raw);
  });

  it('raw contains no hyphens (256 bits of entropy from two stripped UUIDs)', async () => {
    const { raw } = await createNonce();
    expect(raw).not.toContain('-');
    expect(raw.length).toBeGreaterThanOrEqual(60);
  });
});
