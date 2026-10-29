import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { isNotPayKey, notPayKey, notPayMatcher } from '../notPay';

const row = (over: Partial<RecurringDismissalRow> = {}): RecurringDismissalRow => ({
  id: 'd1', household_id: 'h1', payee_key: notPayKey('refund - online store|GBP|1'), direction: 'in', dismissed_at: '2026-10-01T00:00:00Z', created_by: 'u1', deleted_at: null, version: 1, ...over,
});

describe('not-pay keys', () => {
  it('prefixes the candidate key', () => {
    expect(notPayKey('refund - online store|GBP|1')).toBe('not-pay:refund - online store|GBP|1');
  });
  it('cuts a long key to 200 chars the same way every time', () => {
    const long = 'x'.repeat(300);
    expect(notPayKey(long)).toHaveLength(200);
    expect(notPayKey(long)).toBe(notPayKey(long));
  });
  it('tells a not-pay key from a plain one', () => {
    expect(isNotPayKey(notPayKey('a|GBP|1'))).toBe(true);
    expect(isNotPayKey('a|GBP|1')).toBe(false);
  });
});

describe('notPayMatcher', () => {
  it('matches a live incoming not-pay row', () => {
    expect(notPayMatcher([row()])('refund - online store|GBP|1')).toBe(true);
  });
  it('leaves out deleted rows, outgoing rows and plain Not regular rows', () => {
    const k = 'refund - online store|GBP|1';
    expect(notPayMatcher([row({ deleted_at: '2026-10-02T00:00:00Z' })])(k)).toBe(false);
    expect(notPayMatcher([row({ direction: 'out' })])(k)).toBe(false);
    expect(notPayMatcher([row({ payee_key: k })])(k)).toBe(false);
  });
  it('still matches a key that was cut', () => {
    const long = 'y'.repeat(300);
    expect(notPayMatcher([row({ payee_key: notPayKey(long) })])(long)).toBe(true);
  });
});
