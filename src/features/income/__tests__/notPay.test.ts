import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { isNotPayKey, notPayCandidateKey, notPayKey, notPayMatcher } from '../notPay';

const U = '11111111-2222-3333-4444-555555555555';
const V = '99999999-8888-7777-6666-555555555555';
const K = 'refund - online store|GBP|1';

const row = (over: Partial<RecurringDismissalRow> = {}): RecurringDismissalRow => ({
  id: 'd1', household_id: 'h1', payee_key: notPayKey(K, U), direction: 'in', dismissed_at: '2026-10-01T00:00:00Z', created_by: U, deleted_at: null, version: 1, ...over,
});

describe('not-pay keys', () => {
  it('namespaces the candidate key with the user id', () => {
    expect(notPayKey(K, U)).toBe(`not-pay:${U}:${K}`);
  });
  it('cuts a long key to 200 chars the same way every time', () => {
    const long = 'x'.repeat(300);
    expect(notPayKey(long, U)).toHaveLength(200);
    expect(notPayKey(long, U)).toBe(notPayKey(long, U));
  });
  it('cuts by code point and never leaves a lone surrogate', () => {
    const prefixLen = `not-pay:${U}:`.length;
    const emoji = '\u{1F600}';
    const k = 'a'.repeat(200 - prefixLen - 1) + emoji + 'tail';
    const out = notPayKey(k, U);
    expect(Array.from(out).length).toBeLessThanOrEqual(200);
    expect(out).toMatch(/^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/);
    expect(out.endsWith(emoji)).toBe(true);
  });
  it('tells a not-pay key from a plain one', () => {
    expect(isNotPayKey(notPayKey('a|GBP|1', U))).toBe(true);
    expect(isNotPayKey('not-pay:a|GBP|1')).toBe(true);
    expect(isNotPayKey('a|GBP|1')).toBe(false);
  });
});

describe('notPayCandidateKey', () => {
  it('reads both formats and returns null for a plain key', () => {
    expect(notPayCandidateKey(notPayKey(K, U))).toBe(K);
    expect(notPayCandidateKey(`not-pay:${K}`)).toBe(K);
    expect(notPayCandidateKey(K)).toBeNull();
  });
  it('strips only the first uid when the payer key itself starts with a uuid-like prefix', () => {
    const tricky = `${V}:acme|GBP|1`;
    expect(notPayCandidateKey(notPayKey(tricky, U))).toBe(tricky);
    expect(notPayMatcher([row({ payee_key: notPayKey(tricky, U) })], U)(tricky)).toBe(true);
    expect(notPayMatcher([row({ payee_key: notPayKey(tricky, U) })], U)('acme|GBP|1')).toBe(false);
  });
  it('gives the cut candidate for an over-200 code point key, inside the column limit', () => {
    const long = 'z'.repeat(250);
    const stored = notPayKey(long, U);
    expect(Array.from(stored).length).toBe(200);
    const back = notPayCandidateKey(stored) as string;
    expect(long.startsWith(back)).toBe(true);
    expect(back.length).toBe(200 - `not-pay:${U}:`.length);
  });
});

describe('notPayMatcher', () => {
  it('matches the user\'s own live incoming not-pay row, new format', () => {
    expect(notPayMatcher([row()], U)(K)).toBe(true);
  });
  it('matches the user\'s own old-format row', () => {
    expect(notPayMatcher([row({ payee_key: `not-pay:${K}` })], U)(K)).toBe(true);
  });
  it('ignores another user\'s rows in either format', () => {
    expect(notPayMatcher([row({ created_by: V })], U)(K)).toBe(false);
    expect(notPayMatcher([row({ created_by: V, payee_key: `not-pay:${K}` })], U)(K)).toBe(false);
    expect(notPayMatcher([row({ created_by: null })], U)(K)).toBe(false);
  });
  it('leaves out deleted rows, outgoing rows and plain Not regular rows', () => {
    expect(notPayMatcher([row({ deleted_at: '2026-10-02T00:00:00Z' })], U)(K)).toBe(false);
    expect(notPayMatcher([row({ direction: 'out' })], U)(K)).toBe(false);
    expect(notPayMatcher([row({ payee_key: K })], U)(K)).toBe(false);
  });
  it('still matches a key that was cut', () => {
    const long = 'y'.repeat(300);
    expect(notPayMatcher([row({ payee_key: notPayKey(long, U) })], U)(long)).toBe(true);
  });
  it('matches nothing without a user', () => {
    expect(notPayMatcher([row()], undefined)(K)).toBe(false);
  });
});
