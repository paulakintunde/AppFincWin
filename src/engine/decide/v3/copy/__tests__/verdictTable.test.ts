import { FACT_KEYS, FOOTER_KEY, MISSING_KEYS, NOTICE_KEYS, VERDICT_TABLE, verdictRowFor } from '../verdictTable';

describe('verdict table (I22 one code one text)', () => {
  it('I22 one code one text: nine rows, no shared title key', () => {
    expect(Object.keys(VERDICT_TABLE).sort()).toEqual(
      ['fits_month', 'fits_month.low_month', 'fits_unspent', 'fits_unspent.low_month', 'not_yet.payday', 'not_yet.not_covered', 'monthly_short', 'emergency_use', 'needs_input'].sort()
    );
    const rows = Object.values(VERDICT_TABLE);
    for (const r of rows) {
      expect(r.chipKey).toBeTruthy();
      expect(r.titleKey).toBeTruthy();
      expect(r.bodyKey).toBeTruthy();
      expect(r.tone).toBeTruthy();
    }
    expect(new Set(rows.map((r) => r.titleKey)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.bodyKey)).size).toBe(rows.length);
  });

  it('verdictRowFor resolves variants', () => {
    expect(verdictRowFor('fits_month', null)).toBe(VERDICT_TABLE.fits_month);
    expect(verdictRowFor('fits_month', 'low_month')).toBe(VERDICT_TABLE['fits_month.low_month']);
    expect(verdictRowFor('fits_unspent', 'low_month')).toBe(VERDICT_TABLE['fits_unspent.low_month']);
    expect(verdictRowFor('not_yet', null)).toBe(VERDICT_TABLE['not_yet.not_covered']);
    expect(verdictRowFor('not_yet', 'not_covered')).toBe(VERDICT_TABLE['not_yet.not_covered']);
    expect(verdictRowFor('not_yet', 'payday')).toBe(VERDICT_TABLE['not_yet.payday']);
    expect(verdictRowFor('monthly_short', 'low_month')).toBe(VERDICT_TABLE.monthly_short);
    expect(verdictRowFor('emergency_use', null)).toBe(VERDICT_TABLE.emergency_use);
    expect(verdictRowFor('needs_input', 'low_month')).toBe(VERDICT_TABLE.needs_input);
  });

  it('every key starts with decide.v3. except the footer', () => {
    const keys = [
      ...Object.values(VERDICT_TABLE).flatMap((r) => [r.chipKey, r.titleKey, r.bodyKey]),
      ...Object.values(NOTICE_KEYS),
      ...Object.values(FACT_KEYS),
      ...Object.values(MISSING_KEYS),
    ];
    for (const k of keys) expect(k.startsWith('decide.v3.')).toBe(true);
    expect(FOOTER_KEY).toBe('legal.decideFooter');
  });
});
