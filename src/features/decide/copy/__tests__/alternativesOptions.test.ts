import { percent, ZERO_PERCENT } from '@/engine/decide';
import type { AlternativeRow, DecideOption } from '@/engine/decide';
import { cheaperDescriptor, keptHeader, suppressionReason, SUPPRESSION_REASON } from '../alternativesCopy';
import { OPTION_ACTION, optionCopy } from '../optionCopy';
import type { CopyRef } from '../types';
import { cashCheck, fmt, fmtCents, loanCheck } from './helpers/fixtures';
import { resolvesInEn } from './helpers/enKeys';

const row = (code: AlternativeRow['code'], over: object = {}): AlternativeRow =>
  ({ code, dayOne: 0, monthly: 0, contributed: 0, projected: 1, growth: 0, rangeCode: null, byRate: null, suppression: null, ...over }) as AlternativeRow;
const alts = { monthsToBuy: 14, horizonMonths: 12, cheaperPrice: 700_000, projectionReturn: ZERO_PERCENT } as never;
const sup = (code: string, amount: number | null) => ({ code, amount });

describe('suppressionReason', () => {
  it('maps every suppression code', () => {
    expect(Object.keys(SUPPRESSION_REASON).sort()).toEqual(['month_short', 'nothing_freed', 'nothing_spare', 'past_horizon', 'too_thin']);
    expect(suppressionReason(row('cheaper', { suppression: sup('month_short', 90) }), alts, fmt)).toEqual({ key: 'decide.alt.reasonMonthShortCheaper', params: { amount: '$90' } });
    expect(suppressionReason(row('wait_and_save', { suppression: sup('month_short', 90) }), alts, fmt)).toEqual({ key: 'decide.alt.reasonMonthShort', params: { amount: '$90' } });
    expect(suppressionReason(row('skip', { suppression: sup('too_thin', 5) }), alts, fmt)!.key).toBe('decide.alt.reasonTooThin');
    expect(suppressionReason(row('skip', { suppression: sup('too_thin', null) }), alts, fmt)!.params).toEqual({ amount: '$0' });
    expect(suppressionReason(row('cheaper', { suppression: sup('nothing_freed', null) }), alts, fmt)!.key).toBe('decide.alt.reasonNothingFreed');
    expect(suppressionReason(row('wait_and_save', { suppression: sup('past_horizon', null) }), alts, fmt)).toEqual({ key: 'decide.alt.reasonPastHorizon', params: { count: 14, horizon: 12 } });
    expect(suppressionReason(row('wait_and_save', { suppression: sup('past_horizon', null) }), { monthsToBuy: null, horizonMonths: 12 }, fmt)!.params).toEqual({ count: 0, horizon: 12 });
    expect(suppressionReason(row('skip', { suppression: sup('nothing_spare', null) }), alts, fmt)!.key).toBe('decide.alt.reasonNothingSpare');
  });

  it('an unsuppressed row has no reason', () => {
    expect(suppressionReason(row('as_planned'), alts, fmt)).toBeNull();
  });

  it('an out-of-range kept figure says it is too large', () => {
    expect(suppressionReason(row('skip', { projected: null, growth: null, rangeCode: 'exceeds_range' }), alts, fmt)).toEqual({ key: 'decide.alt.reasonTooLarge' });
  });
});

describe('cheaperDescriptor and keptHeader', () => {
  it('scales the deposit, the instalments, or just names the method', () => {
    expect(cheaperDescriptor(alts, loanCheck(percent('9'), 12), fmt, 'Paid in full')).toEqual({ key: 'decide.alt.descCheaper', params: { price: '$700000' } });
    const inst = { ...cashCheck, payment: { method: 'instalment' } } as never;
    expect(cheaperDescriptor(alts, inst, fmt, 'x').key).toBe('decide.alt.descCheaperInstalments');
    expect(cheaperDescriptor(alts, cashCheck, fmt, 'Paid in full')).toEqual({ key: 'decide.alt.descCheaperPlain', params: { price: '$700000', method: 'Paid in full' } });
  });

  it('keeps the plain header at 0% and names the rate otherwise', () => {
    expect(keptHeader(alts)).toEqual({ key: 'decide.alt.kept' });
    expect(keptHeader({ projectionReturn: percent('4.5') })).toEqual({ key: 'decide.alt.keptRate', params: { rate: '4.5' } });
  });
});

describe('optionCopy', () => {
  const ctx = { fmt, fmtCents, lineName: (id: string) => `Line ${id}` };
  const opts = [
    { code: 'affordable_price', price: 900_000, reduction: 100_000 },
    { code: 'longer_term', termMonths: 36, monthlyPayment: 33_333, leftAfter: 5, monthCloses: true, leftChange: 12_345, extraInterest: 4_000 },
    { code: 'cut_line', lineId: 'l1', lineAverage: 5, cut: 2_000, gap: 1_500, closesGap: true },
    { code: 'earn_more', gap: 800, incomeBasis: 4_000, basis: 'worst', percentOfIncome: percent('20') },
    { code: 'save_first', need: 5_000, monthlySpare: 500, months: 10 },
    { code: 'do_without', keptMonthly: 700, horizonMonths: 12, projected: 8_400, rangeCode: null, projectionReturn: ZERO_PERCENT, byRate: [] },
  ] as unknown as DecideOption[];

  it('names are noun phrases with the engine figures', () => {
    const [aff, term, cut, earn, save, without] = opts.map((o) => optionCopy(o, ctx));
    expect(aff).toEqual({ name: { key: 'decide.section.optAffordable', params: { price: '$900000' } }, value: null, desc: { key: 'decide.section.optAffordableDesc', params: { amount: '$100000' } }, action: 'usePrice' });
    expect(term!.name).toEqual({ key: 'decide.section.optTerm', params: { count: 36 } });
    expect(term!.value).toEqual({ key: 'decide.section.optTermValue', params: { amount: '$123.45' } });
    expect(term!.desc!.params).toEqual({ payment: '$333.33', interest: '$4000' });
    expect(term!.action).toBe('useTerm');
    expect(cut!.name.params).toEqual({ line: 'Line l1' });
    expect(cut!.action).toBe('openActivity');
    expect(earn!.desc).toEqual({ key: 'decide.section.optEarnDesc', params: { pct: '20' }, keyParams: { basis: 'decide.verdict.basisWorst' } });
    expect(earn!.action).toBeNull();
    expect(save!.desc).toEqual({ key: 'decide.section.optSaveFirstDesc', params: { amount: '$500', count: 10 } });
    expect(save!.action).toBe('switchWait');
    expect(without!.value).toEqual({ key: 'decide.section.optWithoutValue', params: { amount: '$700' } });
    expect(without!.desc).toEqual({ key: 'decide.section.optWithoutDesc', params: { amount: '$8400', count: 12 } });
    expect(without!.action).toBeNull();
  });

  it('covers the edge states', () => {
    expect(optionCopy({ ...opts[1], monthCloses: false } as never, ctx).value).toEqual({ key: 'decide.section.optTermStill' });
    expect(optionCopy({ ...opts[3], percentOfIncome: null } as never, ctx).desc).toBeNull();
    expect(optionCopy({ ...opts[4], months: null } as never, ctx).desc).toEqual({ key: 'decide.section.optSaveFirstOpen', params: { amount: '$5000' } });
    expect(optionCopy({ ...opts[3], basis: 'average' } as never, ctx).desc!.keyParams).toEqual({ basis: 'decide.verdict.basisAverage' });
    expect(optionCopy({ ...opts[5], projected: null, rangeCode: 'exceeds_range' } as never, ctx).desc).toEqual({ key: 'decide.section.optWithoutDescTooLarge', params: { count: 12 } });
    expect(Object.keys(OPTION_ACTION).sort()).toEqual(['affordable_price', 'cut_line', 'do_without', 'earn_more', 'longer_term', 'save_first']);
  });

  it('payments show cents and totals stay whole', () => {
    const term = optionCopy(opts[1]!, ctx);
    expect(term.desc!.params!.payment).toBe('$333.33');
    expect(term.desc!.params!.interest).toBe('$4000');
  });

  it('every key resolves and no amount is a raw number', () => {
    const refs: CopyRef[] = [];
    for (const o of opts) {
      const c = optionCopy(o, ctx);
      refs.push(c.name, ...(c.value ? [c.value] : []), ...(c.desc ? [c.desc] : []));
    }
    for (const r of refs) {
      expect(resolvesInEn(r.key)).toBe(true);
      for (const k of Object.values(r.keyParams ?? {})) expect(resolvesInEn(k)).toBe(true);
      for (const [name, v] of Object.entries(r.params ?? {})) if (name !== 'count') expect(typeof v).toBe('string');
    }
  });
});
