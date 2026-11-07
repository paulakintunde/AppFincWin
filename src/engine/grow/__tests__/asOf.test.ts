import { VALUE_STALE_DAYS, isValueStale } from '../asOf';

describe('isValueStale', () => {
  it('is 30 days', () => {
    expect(VALUE_STALE_DAYS).toBe(30);
  });
  it('fresh on day 30, stale on day 31', () => {
    expect(isValueStale('2026-10-05', '2026-11-04')).toBe(false);
    expect(isValueStale('2026-10-05', '2026-11-05')).toBe(true);
  });
  it('same day and future as-of are fresh', () => {
    expect(isValueStale('2026-11-05', '2026-11-05')).toBe(false);
    expect(isValueStale('2026-12-05', '2026-11-05')).toBe(false);
  });
  it('crosses year and leap days', () => {
    expect(isValueStale('2023-12-31', '2024-01-30')).toBe(false);
    expect(isValueStale('2023-12-31', '2024-01-31')).toBe(true);
    expect(isValueStale('2024-02-01', '2024-03-02')).toBe(false);
    expect(isValueStale('2024-02-01', '2024-03-03')).toBe(true);
    expect(isValueStale('2100-02-01', '2100-03-03')).toBe(false);
    expect(isValueStale('2100-02-01', '2100-03-04')).toBe(true);
  });
});
