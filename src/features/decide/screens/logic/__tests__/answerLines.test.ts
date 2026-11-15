// 06.1-67 (DS-3, CS-5): which notice sits above the verdict, and the Give it more to go on count.
import { LEAD_NOTICE_ORDER, giveMoreCount, splitNotices } from '../answerLines';
import type { Line } from '../sayResult';

const line = (code: string): Line => ({ key: `decide.v3.notice.${code}`, code, text: `${code}.` });

describe('splitNotices (DS-3)', () => {
  it('no notices: nothing above the verdict, nothing behind Why?', () => {
    expect(splitNotices([])).toEqual({ lead: null, rest: [] });
  });

  it('the six-caveat device case: the month heading short leads, the other five keep their order', () => {
    const said = ['unsaved_changes', 'month_heading_short', 'month_looks_under_logged', 'month_looks_under_logged', 'tax_not_included', 'account_use_unknown'].map(line);
    const { lead, rest } = splitNotices(said);
    expect(lead?.code).toBe('month_heading_short');
    expect(rest.map((l) => l.code)).toEqual(['unsaved_changes', 'month_looks_under_logged', 'month_looks_under_logged', 'tax_not_included', 'account_use_unknown']);
  });

  it('the higher-ranked notice leads whatever the said order', () => {
    expect(splitNotices(['pay_gap', 'typical_short'].map(line)).lead?.code).toBe('typical_short');
    expect(splitNotices(['typical_short', 'pay_gap'].map(line)).lead?.code).toBe('typical_short');
  });

  it('two of the same rank: the first one leads', () => {
    const said = [line('pay_not_seen'), { ...line('pay_not_seen'), text: 'second.' }];
    const { lead, rest } = splitNotices(said);
    expect(lead?.text).toBe('pay_not_seen.');
    expect(rest.map((l) => l.text)).toEqual(['second.']);
  });

  it('unsaved changes leads only when nothing above it in the order is sent (CO-D-113)', () => {
    expect(splitNotices(['unsaved_changes', 'tax_not_included'].map(line)).lead?.code).toBe('unsaved_changes');
    expect(LEAD_NOTICE_ORDER[LEAD_NOTICE_ORDER.length - 1]).toBe('unsaved_changes');
  });

  it('tax, month warnings and accounts without a use never sit above the verdict', () => {
    const { lead, rest } = splitNotices(['tax_not_included', 'month_looks_under_logged', 'account_use_unknown'].map(line));
    expect(lead).toBeNull();
    expect(rest).toHaveLength(3);
  });
});

describe('giveMoreCount (CS-5)', () => {
  it('counts the next step, every readiness line and every missing figure', () => {
    expect(giveMoreCount({ nextStep: null, readiness: [], missing: [] })).toBe(0);
    expect(giveMoreCount({ nextStep: line('add_records'), readiness: [line('a'), line('b')], missing: [line('c')] })).toBe(4);
    expect(giveMoreCount({ nextStep: null, readiness: [], missing: [line('c'), line('d')] })).toBe(2);
  });
});
