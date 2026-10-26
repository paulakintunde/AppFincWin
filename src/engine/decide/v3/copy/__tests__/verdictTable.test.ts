import en from '../../../../../i18n/locales/en';
import { FACT_KEYS, FOOTER_KEY, MISSING_KEYS, NOTICE_KEYS, READINESS_KEYS, VERDICT_TABLE, verdictRowFor } from '../verdictTable';

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
    expect(verdictRowFor('fits_unspent', null)).toBe(VERDICT_TABLE.fits_unspent);
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

  it('one key per missing and fact code, plan_total gone', () => {
    expect(Object.keys(MISSING_KEYS).sort()).toEqual(
      [
        'no_income_figures', 'unspent_not_confirmed', 'records_look_behind', 'no_price', 'plan_count_missing',
        'first_payment_not_chosen', 'pause_interest_not_answered', 'plan_rate_missing', 'everyday_unknown',
        'legacy_invest_check', 'share_invalid', 'income_pattern_unconfirmed', 'expected_income_needed',
        'first_payment_passed', 'volatile_cover_question', 'unexplained_money_question', 'account_use_question',
        'pay_arrival_question',
      ].sort()
    );
    expect(Object.keys(FACT_KEYS).sort()).toEqual(
      [
        'month_left_after', 'unspent_before_after', 'emergency_untouched', 'emergency_used', 'envelope_used',
        'line_crossed', 'quoted_differs', 'implied_rate', 'deferred_interest_term', 'at_todays_rate', 'low_month',
        'lean_bridge', 'unspent_held_back', 'lean_months_judged', 'low_month_judged', 'rests_on_your_answer',
      ].sort()
    );
    expect(Object.keys(FACT_KEYS)).not.toContain('plan_total');
  });

  it('every key resolves to a string in en.ts', () => {
    const keys = [
      ...Object.values(NOTICE_KEYS),
      ...Object.values(FACT_KEYS),
      ...Object.values(MISSING_KEYS),
      ...Object.values(READINESS_KEYS),
    ];
    for (const k of keys) {
      let node: unknown = en;
      for (const part of k.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
      expect({ key: k, type: typeof node }).toEqual({ key: k, type: 'string' });
    }
  });
});
