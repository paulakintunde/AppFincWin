// ACC-01/ACC-02, T-00-15-01: a fresh, high-entropy nonce per sign-in attempt. `raw` goes to
// Supabase (signInWithIdToken hashes it server-side and compares against the token's nonce
// claim); `hashed` goes to the native auth SDK (Apple/Google) -- see apple.ts/google.ts call
// sites, and never swap the two (Pitfall 1 in 00-RESEARCH.md).
import * as Crypto from 'expo-crypto';

export interface Nonce {
  raw: string;
  hashed: string;
}

/**
 * 256 bits of entropy: two concatenated v4 UUIDs (122 bits of randomness each) with their
 * hyphens stripped. Never cache or reuse this across sign-in attempts.
 */
export async function createNonce(): Promise<Nonce> {
  const raw = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}
