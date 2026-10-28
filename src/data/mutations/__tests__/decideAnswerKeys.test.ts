import { checkAnswerKey, expectedIncomeKey, payArrivalKey } from '../decideAnswerKeys';

const UUID = '3f0c2a9e-1b4d-4c5e-8f60-1234567890ab';

describe('decide answer keys', () => {
  it('payArrivalKey joins series id and date in the SQL shape', () => {
    const key = payArrivalKey(UUID, '2026-10-15');
    expect(key).toBe(`${UUID}:2026-10-15`);
    expect(key).toMatch(/^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/);
  });

  it('payArrivalKey rejects a bad id or date', () => {
    expect(() => payArrivalKey('nope', '2026-10-15')).toThrow(RangeError);
    expect(() => payArrivalKey(UUID, '15/10/2026')).toThrow(RangeError);
  });

  it('expectedIncomeKey is the month and rejects anything else', () => {
    expect(expectedIncomeKey('2026-12')).toBe('2026-12');
    expect(() => expectedIncomeKey('Dec')).toThrow(RangeError);
    expect(() => expectedIncomeKey('2026-12-01')).toThrow(RangeError);
  });

  it('checkAnswerKey is the check id and rejects a non-uuid', () => {
    expect(checkAnswerKey(UUID)).toBe(UUID);
    expect(() => checkAnswerKey('check-1')).toThrow(RangeError);
  });
});
