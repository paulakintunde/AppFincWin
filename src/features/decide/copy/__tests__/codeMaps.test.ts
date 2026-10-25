import {
  ALT_ROW_NAME, CASH_OUTCOME, DIRECTION_LABEL, ITEM_TYPE_LABEL, LEDGER_DESC, LEDGER_LABEL, METHOD_LABEL, MISSING_TITLE, SETBACK_LABEL,
  RUNNING_COST_LABEL, SIZE_LABEL, STEADINESS_LABEL, WARNING_TITLE, WARNING_TONE,
} from '../codeMaps';
import { percentText } from '../percentText';
import { ITEM_TYPES, RUNNING_COST_PROMPTS, percent, ZERO_PERCENT } from '@/engine/decide';
import { resolvesInEn } from './helpers/enKeys';

const MAPS: Record<string, { map: Record<string, string>; codes: string[] }> = {
  SIZE_LABEL: { map: SIZE_LABEL, codes: ['from_spare_this_month', 'from_savings', 'needs_spreading'] },
  MISSING_TITLE: {
    map: MISSING_TITLE,
    codes: ['card_not_accepted', 'card_missing', 'card_apr_missing', 'card_minimum_terms_missing', 'dealer_cap_missing', 'card_limit_rate_missing', 'loan_term_missing', 'loan_apr_missing', 'instalment_amount_missing', 'instalment_count_missing', 'instalment_rate_missing', 'instalment_total_below_price', 'invest_term_missing', 'no_full_month', 'split_weights_zero', 'split_amounts_zero', 'projection_rate_out_of_range'],
  },
  LEDGER_LABEL: { map: LEDGER_LABEL, codes: ['income', 'expenses', 'debt', 'cash', 'investments'] },
  LEDGER_DESC: { map: LEDGER_DESC, codes: ['income', 'expenses', 'debt', 'cash', 'investments'] },
  DIRECTION_LABEL: { map: DIRECTION_LABEL, codes: ['better', 'worse', 'same'] },
  SETBACK_LABEL: { map: SETBACK_LABEL, codes: ['unexpected_expense', 'income_drop', 'job_loss', 'late_invoice'] },
  CASH_OUTCOME: { map: CASH_OUTCOME, codes: ['absorbed', 'through_cushion', 'wiped_out'] },
  STEADINESS_LABEL: { map: STEADINESS_LABEL, codes: ['steady', 'variable', 'volatile', 'insufficient'] },
  ITEM_TYPE_LABEL: { map: ITEM_TYPE_LABEL, codes: ['vehicle', 'rent_bill', 'loan_repayment', 'tax', 'insurance_premium', 'general', 'property', 'cash_equivalent', 'tuition'] },
  METHOD_LABEL: { map: METHOD_LABEL, codes: ['cash', 'loan', 'instalment', 'card', 'lump', 'monthly'] },
  ALT_ROW_NAME: { map: ALT_ROW_NAME, codes: ['as_planned', 'cheaper', 'wait_and_save', 'skip'] },
  WARNING_TITLE: { map: WARNING_TITLE, codes: ['month', 'cash', 'cash_dip', 'dsr', 'housing', 'owe', 'inv'] },
};

describe('code maps', () => {
  it.each(Object.keys(MAPS))('%s has exactly the union keys and every value resolves in en', (name) => {
    const { map, codes } = MAPS[name]!;
    expect(Object.keys(map).sort()).toEqual([...codes].sort());
    for (const key of Object.values(map)) {
      expect(key.startsWith('decide.')).toBe(true);
      expect(resolvesInEn(key)).toBe(true);
    }
  });

  it('D-91 card_limit_rate_missing has its missing title', () => {
    expect(MISSING_TITLE.card_limit_rate_missing).toBe('decide.verdict.missing.card_limit_rate_missing');
    expect(MISSING_TITLE.card_limit_rate_missing).not.toBe(MISSING_TITLE.dealer_cap_missing);
  });

  it('D-80 instalment_rate_missing has its own missing title', () => {
    expect(MISSING_TITLE.instalment_rate_missing).toBe('decide.verdict.missing.instalment_rate_missing');
    expect(MISSING_TITLE.instalment_rate_missing).not.toBe(MISSING_TITLE.instalment_count_missing);
    expect(resolvesInEn(MISSING_TITLE.instalment_rate_missing)).toBe(true);
  });

  it('D-92 every item type and running-cost category has a label', () => {
    for (const type of ITEM_TYPES) {
      expect(ITEM_TYPE_LABEL[type]).toBeDefined();
      expect(resolvesInEn(ITEM_TYPE_LABEL[type])).toBe(true);
    }
    const prompted = new Set(Object.values(RUNNING_COST_PROMPTS).flat());
    expect(Object.keys(RUNNING_COST_LABEL).sort()).toEqual([...prompted].sort());
    for (const key of Object.values(RUNNING_COST_LABEL)) expect(resolvesInEn(key)).toBe(true);
  });

  it('D-103 the housing title and tone maps are exhaustive', () => {
    expect(WARNING_TITLE.housing).toBe('decide.warn.housingTitle');
    expect(WARNING_TONE.housing).toBe('soft');
    expect(resolvesInEn(WARNING_TITLE.housing)).toBe(true);
  });

  it('WARNING_TONE covers every warning code', () => {
    expect(Object.keys(WARNING_TONE).sort()).toEqual(['cash', 'cash_dip', 'dsr', 'housing', 'inv', 'month', 'owe']);
    expect(WARNING_TONE.month).toBe('hard');
    expect(WARNING_TONE.cash_dip).toBe('soft');
  });
});

describe('percentText', () => {
  it('prints whole and fractional percents, trimming zeros', () => {
    expect(percentText(percent('36'))).toBe('36');
    expect(percentText(percent('9.4'))).toBe('9.4');
    expect(percentText(percent('22.99'))).toBe('22.99');
    expect(percentText(ZERO_PERCENT)).toBe('0');
  });
  it('rounds half up to two decimals', () => {
    expect(percentText(percent('6.875'))).toBe('6.88');
    expect(percentText(percent('6.874'))).toBe('6.87');
    expect(percentText(percent('99.999'))).toBe('100');
  });
});
