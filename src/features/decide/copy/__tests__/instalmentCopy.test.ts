import type { Plan } from '@/engine/decide';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs } from '../../snapshot/types';
import { instalmentNotes } from '../instalmentCopy';
import { resolvesInEn } from './helpers/enKeys';

const whole = (n: number) => `W${n}`;
const exact = (n: number) => `E${n}`;
const fmt = { whole, exact };
const inputs = (inst: Partial<CheckInputs['instalment']> = {}): CheckInputs => {
  const b = emptyCheckInputs('buy', '2026-10-01');
  return { ...b, advertised: 150_000, instalment: { ...b.instalment, ...inst } };
};
const plan = (over: Record<string, unknown> = {}): Plan =>
  ({ price: 150_000, dayFees: 0, financed: 150_000, total: 156_000, interest: 6_000, monthly: 13_000, months: 12, impliedAnnualRate: null, ...over }) as unknown as Plan;

describe('instalmentNotes', () => {
  it('D-80 no rate keeps the implied-rate and below-price notes', () => {
    const noRate = instalmentNotes(inputs({ amount: 13_000, count: 12 }), plan({ impliedAnnualRate: 8_000_000_000n }), [], fmt, null);
    expect(noRate).toHaveLength(1);
    expect(noRate[0]!.key).toBe('decide.pay.instalmentNote');
    expect(noRate[0]!.params).toMatchObject({ count: 12, payment: 'E13000', total: 'W156000', price: 'W150000' });
    const fees = instalmentNotes(inputs({ amount: 13_000, count: 12 }), plan({ dayFees: 2_000, financed: 148_000, total: 158_000 }), [], fmt, null);
    expect(fees[0]!.key).toBe('decide.pay.instalmentNoteFees');
    const below = instalmentNotes(inputs({ amount: 1_000, count: 2 }), null, ['instalment_total_below_price'], fmt, { price: 150_000, dayFees: 0 });
    expect(below[0]).toEqual({ key: 'decide.pay.instalmentBelowPrice', params: { count: 2, payment: 'E1000', total: 'W2000', financed: 'W150000' } });
    expect(instalmentNotes(inputs(), null, ['instalment_amount_missing'], fmt, null)).toEqual([{ key: 'decide.pay.instalmentMissing' }]);
  });

  it('D-80 with a rate the note reads the scored payment, the rate and the interest', () => {
    const i = inputs({ hasRate: true, aprText: '9.9', amount: null, count: 12 });
    const today = instalmentNotes(i, plan({ computedPayment: 13_000 }), [], fmt, null);
    expect(today).toEqual([{ key: 'decide.pay.instalmentRateNote', params: { count: 12, payment: 'E13000', apr: '9.9', interest: 'W6000' } }]);
    const month = instalmentNotes({ ...i, instalment: { ...i.instalment, firstPayment: 'next_month' } }, plan({ computedPayment: 13_000 }), [], fmt, null);
    expect(month[0]!.key).toBe('decide.pay.instalmentRateNoteMonth');
  });

  it('D-80 a quote that differs from the worked-out payment adds the difference note', () => {
    const quoted = inputs({ hasRate: true, aprText: '9.9', amount: 12_500, count: 12 });
    const notes = instalmentNotes(quoted, plan({ monthly: 12_500, computedPayment: 13_000 }), [], fmt, null);
    expect(notes[0]!.params).toMatchObject({ payment: 'E12500' }); // the quote is the one scored
    expect(notes[1]).toEqual({ key: 'decide.pay.instalmentCalcNote', params: { calc: 'E13000', typed: 'E12500' } });
    const same = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: 13_000, count: 12 }), plan({ computedPayment: 13_000 }), [], fmt, null);
    expect(same).toHaveLength(1);
    const oneUnit = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: 12_999, count: 12 }), plan({ monthly: 12_999, computedPayment: 13_000 }), [], fmt, null);
    expect(oneUnit).toHaveLength(2);
  });

  it('D-80 a rate with no plan says what is missing, or that the quote is below the price', () => {
    const i = inputs({ hasRate: true, aprText: '', amount: null, count: null });
    expect(instalmentNotes(i, null, ['instalment_rate_missing'], fmt, null)).toEqual([{ key: 'decide.pay.instalmentMissing' }]);
    const low = inputs({ hasRate: true, aprText: '5', amount: 1_000, count: 2 });
    expect(instalmentNotes(low, null, ['instalment_total_below_price'], fmt, { price: 150_000, dayFees: 0 })[0]!.key).toBe('decide.pay.instalmentBelowPrice');
  });

  it('D-80 every key resolves in en', () => {
    for (const k of ['instalmentNote', 'instalmentNoteFees', 'instalmentBelowPrice', 'instalmentMissing', 'instalmentRateNote', 'instalmentRateNoteMonth', 'instalmentCalcNote']) {
      expect(resolvesInEn(`decide.pay.${k}`)).toBe(true);
    }
  });
});
