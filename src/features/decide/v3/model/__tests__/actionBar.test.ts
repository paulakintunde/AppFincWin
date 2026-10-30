import type { Code, ReadyBy, Variant } from '@/engine/decide/v3';
import { actionBar } from '../actionBar';

jest.setTimeout(60000);

const DATE_READY: ReadyBy = { kind: 'date', date: '2026-11-01' };

type Row = { name: string; code: Code; variant: Variant | null; readyBy: ReadyBy | null; right: string; leftPrimary: boolean; rightPrimary: boolean };

const ROWS: Row[] = [
  { name: 'fits_month', code: 'fits_month', variant: null, readyBy: null, right: 'savePlan', leftPrimary: true, rightPrimary: false },
  { name: 'fits_month low', code: 'fits_month', variant: 'low_month', readyBy: null, right: 'savePlan', leftPrimary: true, rightPrimary: false },
  { name: 'fits_unspent', code: 'fits_unspent', variant: null, readyBy: null, right: 'savePlan', leftPrimary: true, rightPrimary: false },
  { name: 'fits_unspent low', code: 'fits_unspent', variant: 'low_month', readyBy: null, right: 'savePlan', leftPrimary: true, rightPrimary: false },
  { name: 'emergency_use', code: 'emergency_use', variant: null, readyBy: null, right: 'savePlan', leftPrimary: true, rightPrimary: false },
  { name: 'not_yet payday', code: 'not_yet', variant: 'payday', readyBy: DATE_READY, right: 'remindMe', leftPrimary: false, rightPrimary: true },
  { name: 'not_yet not_covered', code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2027-01' }, right: 'planIt', leftPrimary: false, rightPrimary: true },
  { name: 'monthly_short', code: 'monthly_short', variant: null, readyBy: null, right: 'savePlan', leftPrimary: false, rightPrimary: true },
  { name: 'needs_input', code: 'needs_input', variant: null, readyBy: null, right: 'savePlan', leftPrimary: false, rightPrimary: false },
];

describe('actionBar', () => {
  it.each(ROWS)('$name', (r) => {
    const bar = actionBar({ code: r.code, variant: r.variant, readyBy: r.readyBy });
    expect(bar.left).toEqual({ key: 'decide.v3.ui.answer.bought', primary: r.leftPrimary });
    expect(bar.right.key).toBe(`decide.v3.ui.answer.${r.right}`);
    expect(bar.right.primary).toBe(r.rightPrimary);
    expect(bar.notBuyingKey).toBe('decide.v3.ui.answer.notBuying');
    expect(bar.anotherPriceKey).toBe('decide.v3.ui.answer.checkAnotherPrice');
    expect(bar.helpInBody).toBe(r.code === 'needs_input');
    const primaries = [bar.left.primary, bar.right.primary].filter(Boolean).length;
    expect(primaries).toBe(r.code === 'needs_input' ? 0 : 1);
  });

  it('covers nine rows', () => {
    expect(ROWS).toHaveLength(9);
  });

  it('payday carries the ready date as a param', () => {
    expect(actionBar({ code: 'not_yet', variant: 'payday', readyBy: DATE_READY }).right.params).toEqual({ date: { kind: 'date', iso: '2026-11-01' } });
  });

  it('payday without a date falls back to Plan it', () => {
    expect(actionBar({ code: 'not_yet', variant: 'payday', readyBy: null }).right.key).toBe('decide.v3.ui.answer.planIt');
    expect(actionBar({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'month', month: '2027-01' } }).right.key).toBe('decide.v3.ui.answer.planIt');
  });
});
