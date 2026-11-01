/** 05.3-105 (UAT gap 29): the "What's missing" list never carries an empty or repeated line. */
import { MISSING_KEYS, MISSING_PRIORITY } from '@/engine/decide/v3';
import type { MissingCode } from '@/engine/decide/v3';
import { i18n } from '@/i18n';
import { QUESTION_CODES, needsInputLines } from '../ask';

jest.setTimeout(60000);

const lines = (missing: string[]) => needsInputLines({ missing: missing as MissingCode[] });

describe('needsInputLines', () => {
  it('Van case (periodic, records behind, income variable, saved waiting): only real items', () => {
    const out = lines(['income_pattern_unconfirmed', 'records_look_behind', 'plan_count_missing']);
    expect(out).toEqual(['decide.v3.missing.records_look_behind', 'decide.v3.missing.plan_count_missing']);
  });

  it('every non-question code maps to non-empty English text with no unfilled placeholder', () => {
    for (const code of MISSING_PRIORITY) {
      if (QUESTION_CODES.has(code)) continue;
      const key = MISSING_KEYS[code];
      const text = i18n.t(key);
      expect(text.trim()).not.toBe('');
      expect(text).not.toBe(key);
      expect(text).not.toContain('{{');
    }
  });

  it('drops duplicates and unknown codes', () => {
    expect(lines(['no_price', 'no_price', 'not_a_code'])).toEqual(['decide.v3.missing.no_price']);
  });
});
