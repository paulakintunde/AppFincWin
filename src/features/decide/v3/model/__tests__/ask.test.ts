import { MISSING_KEYS } from '@/engine/decide/v3';
import type { Evaluation, MissingCode } from '@/engine/decide/v3';
import { QUESTION_CODES, askAnsweredProps, askModel, needsInputLines } from '../ask';

jest.setTimeout(60000);

type Ev = Pick<Evaluation, 'result' | 'month'>;
const ev = (missing: MissingCode[], notices: unknown[] = [], unseenPay?: unknown[]): Ev =>
  ({ result: { missing, notices }, month: { month: '2026-10', unseenPay } }) as unknown as Ev;
const notice = (code: string, values: Record<string, unknown>) => ({ code, values });

describe('askModel', () => {
  it('has exactly seven question codes', () => {
    expect(QUESTION_CODES.size).toBe(7);
  });

  it('first is the engine-first question; the rest are counted', () => {
    const m = askModel(ev(['account_use_question', 'pay_arrival_question', 'records_look_behind'], [notice('account_use_unknown', { accountId: 'a1', count: 1 })]))!;
    expect(m.first.code).toBe('account_use_question');
    expect(m.first.questionKey).toBe('decide.v3.missing.account_use_question');
    expect(m.first.params).toEqual({ accountId: 'a1', count: 1 });
    expect([m.k, m.n, m.more, m.moreKey]).toEqual([1, 2, 1, 'decide.v3.ui.ask.andMore_one']);
  });

  it('uses the plural key for several more and null for none', () => {
    const many = askModel(ev(['account_use_question', 'pay_arrival_question', 'unspent_not_confirmed']))!;
    expect(many.moreKey).toBe('decide.v3.ui.ask.andMore_other');
    const one = askModel(ev(['unspent_not_confirmed']))!;
    expect([one.more, one.moreKey]).toEqual([0, null]);
  });

  it('fund variant when only fund_account_unknown is present', () => {
    const m = askModel(ev(['account_use_question'], [notice('fund_account_unknown', { amount: 5000 })]))!;
    expect(m.first.variant).toBe('fund');
    expect(m.first.questionKey).toBe('decide.v3.missing.account_use_question_fund');
    expect(m.first.params).toEqual({ amount: 5000 });
  });

  it('account use with neither notice has no params', () => {
    const m = askModel(ev(['account_use_question']))!;
    expect(m.first.variant).toBeNull();
    expect(m.first.params).toEqual({});
  });

  it('pay arrival carries the unseen pay', () => {
    const m = askModel(ev(['pay_arrival_question'], [notice('pay_not_seen', { amount: 100, date: '2026-10-01' })], [{ seriesId: 's1', date: '2026-10-01', amount: 100, arrived: null }]))!;
    expect(m.first.params).toEqual({ amount: 100, date: '2026-10-01' });
    expect(m.first.pay).toEqual({ seriesId: 's1', payDate: '2026-10-01', amount: 100 });
  });

  it('pay arrival with no unseen pay has pay null (card disables the two buttons)', () => {
    expect(askModel(ev(['pay_arrival_question']))!.first.pay).toBeNull();
    expect(askModel(ev(['pay_arrival_question'], [], [{ seriesId: 's', date: 'd', amount: 1, arrived: true }]))!.first.pay).toBeNull();
  });

  it('drops null notice values', () => {
    const m = askModel(ev(['pay_arrival_question'], [notice('pay_not_seen', { amount: 100, date: null })]))!;
    expect(m.first.params).toEqual({ amount: 100 });
  });

  it('volatile and unexplained read their notices', () => {
    expect(askModel(ev(['volatile_cover_question'], [notice('income_volatile', { monthly: 10, months: 6, payment: 1 })]))!.first.params).toEqual({ monthly: 10, months: 6 });
    expect(askModel(ev(['unexplained_money_question'], [notice('unexplained_money', { amount: 7 })]))!.first.params).toEqual({ amount: 7 });
  });

  it('expected income uses this month and a count', () => {
    const m = askModel(ev(['expected_income_needed']))!;
    expect(m.first.params).toEqual({ month: '2026-10', months: 1 });
    expect(m.first.months).toEqual(['2026-10']);
  });

  it('other question codes have empty params', () => {
    expect(askModel(ev(['income_pattern_unconfirmed']))!.first.params).toEqual({});
  });

  it('null with no question codes', () => {
    expect(askModel(ev(['records_look_behind']))).toBeNull();
    expect(askModel(ev([]))).toBeNull();
  });
});

describe('needsInputLines and askAnsweredProps', () => {
  it('excludes question codes and keeps engine order', () => {
    expect(needsInputLines({ missing: ['records_look_behind', 'no_price', 'account_use_question'] })).toEqual([MISSING_KEYS.records_look_behind, MISSING_KEYS.no_price]);
  });

  it('answered props are the code for question codes only', () => {
    expect(askAnsweredProps('pay_arrival_question')).toEqual({ missing: 'pay_arrival_question' });
    expect(() => askAnsweredProps('no_price')).toThrow(RangeError);
  });
});
