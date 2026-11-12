import en from '../../../../../i18n/locales/en';
import {
  FACT_KEYS,
  FACT_VALUE_KEYS,
  FOOTER_KEY,
  MISSING_KEYS,
  NOTICE_KEYS,
  NOTICE_VALUE_KEYS,
  READINESS_KEYS,
  VERDICT_TABLE,
  verdictRowFor,
} from '../verdictTable';

describe('verdict table (I22 one code one text)', () => {
  it('I22 one code one text: seventeen rows; only the documented shared rows share a text', () => {
    expect(Object.keys(VERDICT_TABLE).sort()).toEqual(
      [
        'fits_month', 'fits_month.low_month', 'fits_unspent', 'fits_unspent.low_month', 'not_yet.payday', 'not_yet.not_covered', 'monthly_short', 'emergency_use', 'needs_input', 'fits_uses_overdraft', 'fits_uses_overdraft.not_cleared',
        'fits_month.no_net', 'fits_month.small_net', 'fits_unspent.no_net', 'fits_unspent.small_net', 'fits_uses_net', 'fits_uses_net.protection_off',
        'fits_unspent.extra_savings',
        'fits_unspent.costly_debt',
        'fits_month.month_already_short', 'fits_unspent.month_already_short', 'fits_uses_net.month_already_short', 'fits_uses_overdraft.month_already_short',
        'monthly_short.month_already_short', 'not_yet.month_already_short', 'emergency_use.month_already_short',
        'fits_month.month_short_small', 'fits_unspent.month_short_small', 'fits_month.month_short_moderate', 'fits_unspent.month_short_moderate',
        'fits_unspent.month_short_moderate_extra',
        'fits_month.tight', 'fits_unspent.tight_plan', 'fits_month.tight_once', 'fits_unspent.tight',
        'fits_by_borrowing', 'fits_by_borrowing.borrowing_costs_more', 'fits_by_borrowing.month_already_short',
        'fits_by_borrowing.month_short_small', 'fits_by_borrowing.month_short_moderate', 'fits_by_borrowing.month_short_moderate_extra',
        'fits_on_your_answer', 'fits_on_your_answer.month_already_short', // 05.4 FIN-08
      ].sort()
    );
    const rows = Object.values(VERDICT_TABLE);
    for (const r of rows) {
      expect(r.chipKey).toBeTruthy();
      expect(r.titleKey).toBeTruthy();
      expect(r.bodyKey).toBeTruthy();
      expect(r.tone).toBeTruthy();
    }
    // 05.4: one answer, one text. "Fits, but no safety net" and "Fits, but your safety net is small" are one answer each on
    // either fits code (D-35), and a stored emergency_use answer reads the "Dips into your safety net" copy (D-41).
    const SHARED: readonly (readonly (keyof typeof VERDICT_TABLE)[])[] = [
      ['fits_month.no_net', 'fits_unspent.no_net'],
      ['fits_month.small_net', 'fits_unspent.small_net'],
      ['fits_uses_net', 'emergency_use'],
      // 05.4 D-63: "No: your month is already short" is one answer on any code but an ask.
      ['fits_month.month_already_short', 'fits_unspent.month_already_short'],
      ['fits_month.month_already_short', 'fits_uses_net.month_already_short'],
      ['fits_month.month_already_short', 'fits_uses_overdraft.month_already_short'],
      ['fits_month.month_already_short', 'monthly_short.month_already_short'],
      ['fits_month.month_already_short', 'not_yet.month_already_short'],
      ['fits_month.month_already_short', 'emergency_use.month_already_short'],
      ['fits_month.month_already_short', 'fits_by_borrowing.month_already_short'],
      ['fits_month.month_already_short', 'fits_on_your_answer.month_already_short'], // 05.4 FIN-08
      // 05.4 D-65: Small and Moderate are one answer each on either cash-fit code.
      ['fits_month.month_short_small', 'fits_unspent.month_short_small'],
      ['fits_month.month_short_moderate', 'fits_unspent.month_short_moderate'],
      // 05.4 FIN-05: the same D-65 headlines on an expensive plan judged by cash
      ['fits_month.month_short_small', 'fits_by_borrowing.month_short_small'],
      ['fits_month.month_short_moderate', 'fits_by_borrowing.month_short_moderate'],
      ['fits_unspent.month_short_moderate_extra', 'fits_by_borrowing.month_short_moderate_extra'],
      // 05.4 FIN-07: "Fits, but tight each month" is one answer on either fit code of a plan.
      ['fits_month.tight', 'fits_unspent.tight_plan'],
    ];
    for (const [a, b] of SHARED) expect(VERDICT_TABLE[a!]).toEqual(VERDICT_TABLE[b!]);
    const distinct = rows.length - SHARED.length;
    expect(new Set(rows.map((r) => r.titleKey)).size).toBe(distinct);
    expect(new Set(rows.map((r) => r.bodyKey)).size).toBe(distinct);
  });

  it('verdictRowFor resolves variants', () => {
    // 05.4 FIN-05 (D-07, D-39a): Only by borrowing, and Fits, but borrowing costs more; a month-short headline keeps its row
    expect(verdictRowFor('fits_by_borrowing', null)).toBe(VERDICT_TABLE.fits_by_borrowing);
    // 05.4 FIN-08 / CMP-F01: Only on your answer, amber; the month-short headline keeps its row
    expect(verdictRowFor('fits_on_your_answer', null)).toBe(VERDICT_TABLE.fits_on_your_answer);
    expect(verdictRowFor('fits_on_your_answer', 'tight')).toBe(VERDICT_TABLE.fits_on_your_answer);
    expect(VERDICT_TABLE.fits_on_your_answer.tone).toBe('caution');
    expect(verdictRowFor('fits_on_your_answer', 'month_already_short')).toBe(VERDICT_TABLE['fits_on_your_answer.month_already_short']);
    expect(verdictRowFor('fits_by_borrowing', 'borrowing_costs_more')).toBe(VERDICT_TABLE['fits_by_borrowing.borrowing_costs_more']);
    expect(verdictRowFor('fits_by_borrowing', 'tight')).toBe(VERDICT_TABLE.fits_by_borrowing);
    expect(verdictRowFor('fits_by_borrowing', 'month_already_short')).toBe(VERDICT_TABLE['fits_by_borrowing.month_already_short']);
    expect(verdictRowFor('fits_by_borrowing', 'month_short_small')).toBe(VERDICT_TABLE['fits_by_borrowing.month_short_small']);
    expect(verdictRowFor('fits_by_borrowing', 'month_short_moderate')).toBe(VERDICT_TABLE['fits_by_borrowing.month_short_moderate']);
    expect(verdictRowFor('fits_by_borrowing', 'month_short_moderate_extra')).toBe(VERDICT_TABLE['fits_by_borrowing.month_short_moderate_extra']);
    expect(verdictRowFor('fits_month', 'month_short_moderate_extra')).toBe(VERDICT_TABLE.fits_month);
    expect(VERDICT_TABLE.fits_by_borrowing.tone).toBe('caution');
    expect(VERDICT_TABLE['fits_by_borrowing.borrowing_costs_more'].tone).toBe('caution');
    expect(verdictRowFor('fits_month', null)).toBe(VERDICT_TABLE.fits_month);
    expect(verdictRowFor('fits_unspent', null)).toBe(VERDICT_TABLE.fits_unspent);
    expect(verdictRowFor('fits_month', 'low_month')).toBe(VERDICT_TABLE['fits_month.low_month']);
    expect(verdictRowFor('fits_unspent', 'low_month')).toBe(VERDICT_TABLE['fits_unspent.low_month']);
    expect(verdictRowFor('not_yet', null)).toBe(VERDICT_TABLE['not_yet.not_covered']);
    expect(verdictRowFor('not_yet', 'not_covered')).toBe(VERDICT_TABLE['not_yet.not_covered']);
    expect(verdictRowFor('not_yet', 'payday')).toBe(VERDICT_TABLE['not_yet.payday']);
    expect(verdictRowFor('monthly_short', 'low_month')).toBe(VERDICT_TABLE.monthly_short);
    expect(verdictRowFor('emergency_use', null)).toBe(VERDICT_TABLE.emergency_use);
    // 05.4 FIN-01 / FIN-02 (D-35, D-06): the safety-net answers, all amber
    expect(verdictRowFor('fits_month', 'no_net')).toBe(VERDICT_TABLE['fits_month.no_net']);
    expect(verdictRowFor('fits_month', 'small_net')).toBe(VERDICT_TABLE['fits_month.small_net']);
    expect(verdictRowFor('fits_unspent', 'no_net')).toBe(VERDICT_TABLE['fits_unspent.no_net']);
    expect(verdictRowFor('fits_unspent', 'small_net')).toBe(VERDICT_TABLE['fits_unspent.small_net']);
    expect(verdictRowFor('fits_month', 'protection_off')).toBe(VERDICT_TABLE.fits_month);
    // 05.4 D-62, D-63
    expect(verdictRowFor('fits_unspent', 'extra_savings')).toBe(VERDICT_TABLE['fits_unspent.extra_savings']);
    expect(verdictRowFor('fits_month', 'extra_savings')).toBe(VERDICT_TABLE.fits_month);
    expect(verdictRowFor('not_yet', 'month_already_short')).toBe(VERDICT_TABLE['not_yet.month_already_short']);
    expect(verdictRowFor('monthly_short', 'month_already_short')).toBe(VERDICT_TABLE['monthly_short.month_already_short']);
    expect(verdictRowFor('needs_input', 'month_already_short')).toBe(VERDICT_TABLE.needs_input);
    // 05.4 D-65: the tiers, caution tone, on the cash-fit codes only
    expect(verdictRowFor('fits_month', 'month_short_small')).toBe(VERDICT_TABLE['fits_month.month_short_small']);
    expect(verdictRowFor('fits_unspent', 'month_short_small')).toBe(VERDICT_TABLE['fits_unspent.month_short_small']);
    expect(verdictRowFor('fits_month', 'month_short_moderate')).toBe(VERDICT_TABLE['fits_month.month_short_moderate']);
    expect(verdictRowFor('fits_unspent', 'month_short_moderate')).toBe(VERDICT_TABLE['fits_unspent.month_short_moderate']);
    expect(verdictRowFor('fits_unspent', 'month_short_moderate_extra')).toBe(VERDICT_TABLE['fits_unspent.month_short_moderate_extra']);
    expect(verdictRowFor('fits_month', 'month_short_moderate_extra')).toBe(VERDICT_TABLE.fits_month);
    expect(verdictRowFor('not_yet', 'month_short_small')).toBe(VERDICT_TABLE['not_yet.not_covered']);
    for (const k of ['fits_month.month_short_small', 'fits_month.month_short_moderate', 'fits_unspent.month_short_moderate_extra'] as const) {
      expect(VERDICT_TABLE[k].tone).toBe('caution');
    }
    // 05.4 FIN-07 / D-40: tight, caution tone; the plan row unless the check is paid once (or judged by cash, D-68)
    expect(verdictRowFor('fits_month', 'tight')).toBe(VERDICT_TABLE['fits_month.tight']);
    expect(verdictRowFor('fits_unspent', 'tight')).toBe(VERDICT_TABLE['fits_unspent.tight_plan']);
    expect(verdictRowFor('fits_month', 'tight', true)).toBe(VERDICT_TABLE['fits_month.tight_once']);
    expect(verdictRowFor('fits_unspent', 'tight', true)).toBe(VERDICT_TABLE['fits_unspent.tight']);
    expect(verdictRowFor('fits_uses_net', 'tight')).toBe(VERDICT_TABLE.fits_uses_net);
    expect(verdictRowFor('monthly_short', 'tight', true)).toBe(VERDICT_TABLE.monthly_short);
    for (const k of ['fits_month.tight', 'fits_unspent.tight_plan', 'fits_month.tight_once', 'fits_unspent.tight'] as const) expect(VERDICT_TABLE[k].tone).toBe('caution');
    expect(verdictRowFor('fits_uses_net', null)).toBe(VERDICT_TABLE.fits_uses_net);
    expect(verdictRowFor('fits_uses_net', 'protection_off')).toBe(VERDICT_TABLE['fits_uses_net.protection_off']);
    for (const k of ['fits_month.no_net', 'fits_month.small_net', 'fits_unspent.no_net', 'fits_unspent.small_net', 'fits_uses_net', 'fits_uses_net.protection_off'] as const) {
      expect(VERDICT_TABLE[k].tone).toBe('caution');
    }
    expect(verdictRowFor('needs_input', 'low_month')).toBe(VERDICT_TABLE.needs_input);
    // 05.4 FIN-03: Uses your overdraft, and past payday when the next pay does not clear it (D-36); same caution tone
    expect(verdictRowFor('fits_uses_overdraft', null)).toBe(VERDICT_TABLE.fits_uses_overdraft);
    expect(verdictRowFor('fits_uses_overdraft', 'not_cleared')).toBe(VERDICT_TABLE['fits_uses_overdraft.not_cleared']);
    expect(VERDICT_TABLE.fits_uses_overdraft.tone).toBe('caution');
    expect(VERDICT_TABLE['fits_uses_overdraft.not_cleared'].tone).toBe('caution');
  });

  it('every key starts with decide.v3. except the D-64 footer', () => {
    const keys = [
      ...Object.values(VERDICT_TABLE).flatMap((r) => [r.chipKey, r.titleKey, r.bodyKey]),
      ...Object.values(NOTICE_KEYS),
      ...Object.values(FACT_KEYS),
      ...Object.values(MISSING_KEYS),
    ];
    for (const k of keys) expect(k.startsWith('decide.v3.')).toBe(true);
    expect(FOOTER_KEY).toBe('legal.decideAnswer.footer');
  });

  it('one key per missing and fact code, plan_total gone', () => {
    expect(Object.keys(MISSING_KEYS).sort()).toEqual(
      [
        'no_income_figures', 'unspent_not_confirmed', 'records_look_behind', 'no_price', 'plan_count_missing',
        'first_payment_not_chosen', 'pause_interest_not_answered', 'plan_rate_missing', 'everyday_unknown',
        'legacy_invest_check', 'share_invalid', 'income_pattern_unconfirmed', 'expected_income_needed',
        'first_payment_passed', 'volatile_cover_question', 'unexplained_money_question', 'account_use_question',
        'pay_arrival_question', 'price_too_large',
      ].sort()
    );
    expect(Object.keys(FACT_KEYS).sort()).toEqual(
      [
        'month_left_after', 'unspent_before_after', 'emergency_untouched', 'net_used', 'envelope_used',
        'line_crossed', 'quoted_differs', 'implied_rate', 'deferred_interest_term', 'at_todays_rate', 'low_month',
        'lean_bridge', 'unspent_held_back', 'lean_months_judged', 'low_month_judged', 'rests_on_your_answer',
        'no_full_month', 'overdraft_use', 'overdraft_without_purchase', 'overdraft_purchase_adds', 'overdraft_not_cleared',
        'overdraft_cost_90d', 'wait_clears', 'overdraft_repeat', 'other_account_overdrawn', 'no_overdraft_limit',
        'ready_without_interest', 'clearing_first', 'net_left', 'net_refill', 'net_zero_is_off', 'net_protection_off',
        'net_none_start', 'net_progress', 'net_above_size', 'wait_keeps_net', 'need_net_line',
        'bills_held_back', 'yearly_bill_ahead', 'net_locked', 'extra_savings_used', 'net_two_months', 'move_money_by',
        'usual_month_short', 'depletion_payment', 'plan_makes_short', 'price_over_net', 'net_lasts', 'net_lasts_without', 'interest_is_a_cost',
        'balanced_month_room', 'month_balance_gap', 'month_short_fits', 'money_lasts_shorter', 'short_plan_from_cash',
        'debt_interest_cost', 'debt_more', 'housing_cost', 'joint_loan_risk', 'debt_due_day_assumed', 'card_instead', 'ask_debts_not_recorded',
        'tight_floor', 'save_vs_borrow', 'net_covers_surprises', 'income_or_costs_first',
        'covered_from_savings', 'further_shortfall_runway', // 05.4 D-46
        'earlier_money_from', // 05.4 D-44 (05.4-24)
        'overdraft_carried_in', // 05.4 D-86 (05.4-24 FIN-09b)
        'tax_estimate', // 05.4 FIN-27 (05.4-25)
        'tax_set_aside', // 06.1 FIN-20 (06.1-29)
        'debt_left_after_sale', 'sale_counted', // 05.4 BO-05 (05.4-27, D-106)
        'free_help', // 05.4 CMP-F04 (05.4-38, D-123)
        'locked_goals_kept', 'net_and_goals_kept', 'unlocked_goals_counted', // 06 D-05, D-06, D-22 (06-03)
        'quick_lines_counted', 'quick_savings_counted', // 06.1 D-21 (06.1-09)
      ].sort()
    );
    expect(Object.keys(FACT_KEYS)).not.toContain('plan_total');
    // 05.4-22 (D-48): the retired name never comes back
    expect(Object.keys(FACT_KEYS)).not.toContain('plan_interest_cost');
  });

  it('M-03 FACT_VALUE_KEYS and NOTICE_VALUE_KEYS have one entry per code', () => {
    expect(Object.keys(FACT_VALUE_KEYS).sort()).toEqual(Object.keys(FACT_KEYS).sort());
    expect(Object.keys(NOTICE_VALUE_KEYS).sort()).toEqual(Object.keys(NOTICE_KEYS).sort());
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
