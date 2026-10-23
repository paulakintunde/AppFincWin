import en from '@/i18n/locales/en';
import { percent } from '@/engine/decide';
import type { InstalmentFreq, Plan } from '@/engine/decide';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs } from '../../snapshot/types';
import { instalmentNotes } from '../instalmentCopy';
import { joinPreview } from '../foldCopy';
import { methodSummary } from '../methodCardCopy';
import type { CopyRef } from '../types';
import { resolvesInEn } from './helpers/enKeys';

const whole = (n: number) => `W${n}`;
const exact = (n: number) => `E${n}`;
const fmt = { whole, exact };
const NB = ' ';

const node = (path: string): string | undefined => {
  const v = path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);
  return typeof v === 'string' ? v : undefined;
};
function t(key: string, params: Record<string, string | number> = {}): string {
  const count = params.count;
  const raw = (typeof count === 'number' ? node(`${key}_${count === 1 ? 'one' : 'other'}`) : undefined) ?? node(key);
  if (raw === undefined) throw new Error(`missing ${key}`);
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name]));
}
const say = (r: CopyRef): string => joinPreview(t, r);

const inputs = (inst: Partial<CheckInputs['instalment']> = {}): CheckInputs => {
  const b = emptyCheckInputs('buy', '2026-10-01');
  return { ...b, advertised: 150_000, instalment: { ...b.instalment, ...inst } };
};
const plan = (over: Record<string, unknown> = {}): Plan =>
  ({ price: 150_000, dayFees: 0, financed: 150_000, total: 156_000, interest: 6_000, monthly: 13_000, months: 12, impliedAnnualRate: null, ...over }) as unknown as Plan;

const FREQS: readonly InstalmentFreq[] = ['weekly', 'fortnightly', 'monthly', 'quarterly'];
const WHEN: Record<InstalmentFreq, string> = { weekly: 'in a week', fortnightly: 'in 2 weeks', monthly: 'in a month', quarterly: 'in 3 months' };
/** R16.16 M6: the lead of the Has a rate? = No note, by frequency. */
const LEAD: Record<InstalmentFreq, string> = {
  weekly: `12${NB}weekly payments of E13000, about E4000 a month.`,
  fortnightly: `12${NB}payments of E13000 every 2 weeks, about E4000 a month.`,
  monthly: `12${NB}monthly payments of E13000.`,
  quarterly: `12${NB}quarterly payments of E13000, about E4000 a month.`,
};
/** The Has a rate? = Yes note, `first` being the text of "the first {when}". */
const YES = (freq: InstalmentFreq, first: string): string => {
  const head: Record<InstalmentFreq, string> = {
    weekly: `12${NB}weekly payments of E13000 at 9.9%, the first ${first}`,
    fortnightly: `12${NB}payments of E13000 every 2 weeks at 9.9%, the first ${first}`,
    monthly: `12${NB}monthly payments of E13000 at 9.9%, the first ${first}`,
    quarterly: `12${NB}quarterly payments of E13000 at 9.9%, the first ${first}`,
  };
  const about = freq === 'monthly' ? '' : '; about E4000 a month';
  return `${head[freq]}${about}. Interest over the plan is W6000.`;
};
const SUMMARY: Record<InstalmentFreq, string> = { weekly: 'weekly', fortnightly: 'every 2 weeks', monthly: 'a month', quarterly: 'a quarter' };

describe('instalmentNotes', () => {
  it('D-89 the instalment note follows the frequency, rate and timing table', () => {
    for (const freq of FREQS) {
      for (const timing of ['today', 'next_period'] as const) {
        const when = timing === 'today' ? 'on the day' : WHEN[freq];
        // Has a rate? = No: the lead, then the solved rate clause
        const no = instalmentNotes(
          inputs({ amount: 13_000, count: 12, freq, firstPayment: timing }),
          plan({ monthly: 4_000 }),
          [],
          fmt,
          null,
          { apr: percent('18.41') },
        );
        expect(no.map(say)).toEqual([LEAD[freq], 'No rate was quoted: about 18.5% a year, worked out from the figures you typed.']);
        // Has a rate? = Yes: whole note, the first {when}
        const yes = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: null, count: 12, freq, firstPayment: timing }), plan({ monthly: 4_000, computedPayment: 13_000 }), [], fmt, null);
        expect(yes.map(say)).toEqual([YES(freq, when)]);
      }
    }
  });

  it('D-89 a stored next_month reads as the next period, and an absent freq is monthly', () => {
    const legacy = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: null, count: 12, freq: undefined, firstPayment: 'next_month' }), plan({ computedPayment: 13_000, monthly: 13_000 }), [], fmt, null);
    expect(say(legacy[0]!)).toBe(`12${NB}monthly payments of E13000 at 9.9%, the first in a month. Interest over the plan is W6000.`);
    const bare = instalmentNotes({ ...inputs({ amount: 13_000, count: 12 }), instalment: { amount: 13_000, count: 12, lateFee: null } }, plan({ monthly: 13_000 }), [], fmt, null);
    expect(say(bare[0]!)).toBe(`12${NB}monthly payments of E13000.`);
  });

  it('D-89 one payment reads as a single payment, with no first', () => {
    const one = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: null, count: 1, freq: 'weekly', firstPayment: 'next_period' }), plan({ computedPayment: 156_000, monthly: 676_000 }), [], fmt, null);
    expect(say(one[0]!)).toBe(`1${NB}weekly payment of E156000 at 9.9%, in a week; about E676000 a month. Interest over the plan is W6000.`);
  });

  it('D-90 the no-rate note shows the true APR rounded up', () => {
    const i = inputs({ amount: 13_000, count: 12 });
    const note = instalmentNotes(i, plan({ monthly: 13_000 }), [], fmt, null, { apr: percent('18.41') });
    expect(note[1]).toEqual({ key: 'decide.pay.instRateAbout', params: { apr: '18.5' } });
    expect(say(note[1]!)).toContain('worked out from the figures you typed');
    // a whole rate drops the decimal
    expect(instalmentNotes(i, plan(), [], fmt, null, { apr: percent('18') })[1]!.params).toEqual({ apr: '18' });
    // not solved yet (the settled path has not run): the lead alone
    expect(instalmentNotes(i, plan(), [], fmt, null, null)).toHaveLength(1);
  });

  it('D-90 above the cap reads above 999.99% a year', () => {
    const note = instalmentNotes(inputs({ amount: 13_000, count: 2 }), plan({ monthly: 13_000 }), [], fmt, null, { aboveMax: true });
    expect(say(note[1]!)).toBe('No rate was quoted: above 999.99% a year, worked out from the figures you typed.');
  });

  it('D-90 a total equal to the amount financed reads 0% a year', () => {
    const note = instalmentNotes(inputs({ amount: 12_500, count: 12 }), plan({ monthly: 12_500, total: 150_000 }), [], fmt, null, { apr: 0n as never });
    expect(say(note[1]!)).toBe('No rate was quoted: 0% a year, worked out from the figures you typed.');
  });

  it('D-90 one payment on the day has no rate clause', () => {
    const note = instalmentNotes(inputs({ amount: 150_000, count: 1 }), plan({ monthly: 150_000 }), [], fmt, null, null);
    expect(note.map(say)).toEqual([`1${NB}monthly payment of E150000.`]);
    // one payment a period on is a rate, so its clause stays
    const later = instalmentNotes(inputs({ amount: 156_000, count: 1, firstPayment: 'next_period' }), plan({ monthly: 156_000 }), [], fmt, null, { apr: percent('50') });
    expect(later).toHaveLength(2);
  });

  it('D-90 the solved rate is never a rate for the rate field', () => {
    const i = inputs({ amount: 13_000, count: 12 });
    const note = instalmentNotes(i, plan(), [], fmt, null, { apr: percent('18.41') });
    expect(i.instalment.aprText).toBe('');
    expect(JSON.stringify(note)).not.toContain('aprText');
  });

  it('D-80 a total below the price replaces the rate clause with the below-price note', () => {
    const below = instalmentNotes(inputs({ amount: 1_000, count: 2 }), null, ['instalment_total_below_price'], fmt, { price: 150_000, dayFees: 0 });
    expect(below).toEqual([{ key: 'decide.pay.instalmentBelowPrice', params: { count: 2, payment: 'E1000', total: 'W2000', financed: 'W150000' } }]);
    expect(instalmentNotes(inputs(), null, ['instalment_amount_missing'], fmt, null)).toEqual([{ key: 'decide.pay.instalmentMissing' }]);
    expect(instalmentNotes(inputs({ amount: 1_000, count: 2 }), null, ['instalment_total_below_price'], fmt, null)).toEqual([{ key: 'decide.pay.instalmentMissing' }]);
  });

  it('D-80 a quote that differs from the worked-out payment adds the difference note after the Yes note', () => {
    const quoted = inputs({ hasRate: true, aprText: '9.9', amount: 12_500, count: 12 });
    const notes = instalmentNotes(quoted, plan({ monthly: 12_500, computedPayment: 13_000 }), [], fmt, null);
    expect(notes[0]!.params).toMatchObject({ payment: 'E12500' }); // the quote is the one scored
    expect(notes[1]).toEqual({ key: 'decide.pay.instalmentCalcNote', params: { calc: 'E13000', typed: 'E12500' } });
    const same = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: 13_000, count: 12 }), plan({ computedPayment: 13_000 }), [], fmt, null);
    expect(same).toHaveLength(1);
    const oneUnit = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: 12_999, count: 12 }), plan({ monthly: 12_999, computedPayment: 13_000 }), [], fmt, null);
    expect(oneUnit).toHaveLength(2);
  });

  it('D-89 the difference note names the frequency, never "a month" for a weekly quote', () => {
    const PERIOD: Record<InstalmentFreq, string> = { weekly: 'a week', fortnightly: 'every 2 weeks', monthly: 'a month', quarterly: 'a quarter' };
    for (const freq of FREQS) {
      const notes = instalmentNotes(
        inputs({ hasRate: true, aprText: '9.9', amount: 12_500, count: 12, freq }),
        plan({ monthly: 12_500, computedPayment: 13_000 }),
        [],
        fmt,
        null,
      );
      expect(say(notes[1]!)).toBe(`The rate works out to E13000 ${PERIOD[freq]}; the quote is E12500.`);
      expect(notes[1]!.key).toBe(freq === 'monthly' ? 'decide.pay.instalmentCalcNote' : `decide.pay.instalmentCalcNoteBy.${freq}`);
      if (freq !== 'monthly') expect(say(notes[1]!)).not.toContain('a month');
    }
    for (const f of ['weekly', 'fortnightly', 'quarterly']) expect(resolvesInEn(`decide.pay.instalmentCalcNoteBy.${f}`)).toBe(true);
  });

  it('D-80 a rate with no plan says what is missing, or that the quote is below the price', () => {
    const i = inputs({ hasRate: true, aprText: '', amount: null, count: null });
    expect(instalmentNotes(i, null, ['instalment_rate_missing'], fmt, null)).toEqual([{ key: 'decide.pay.instalmentMissing' }]);
    const low = inputs({ hasRate: true, aprText: '5', amount: 1_000, count: 2 });
    expect(instalmentNotes(low, null, ['instalment_total_below_price'], fmt, { price: 150_000, dayFees: 0 })[0]!.key).toBe('decide.pay.instalmentBelowPrice');
  });

  it('D-80 a rated note with no typed quote and no worked-out payment falls back to the monthly figure', () => {
    const n = instalmentNotes(inputs({ hasRate: true, aprText: '9.9', amount: null, count: 12 }), plan({ monthly: 7_000, interest: undefined }), [], fmt, null);
    expect(n[0]!.params).toMatchObject({ payment: 'E7000', interest: 'W0' });
  });

  it('D-89 every key resolves in en', () => {
    const keys = ['instalmentBelowPrice', 'instalmentMissing', 'instalmentCalcNote', 'instRateAbout', 'instRateAbove', 'instRateZero', 'instSummaryNoRate', 'instSummaryRate', 'instSummaryFirst'];
    for (const k of keys) expect(resolvesInEn(`decide.pay.${k}`)).toBe(true);
    for (const f of FREQS) {
      for (const k of ['instNoRate', 'instRate', 'instSummary']) expect(resolvesInEn(`decide.pay.${k}.${f}_one`)).toBe(true);
      expect(resolvesInEn(`decide.pay.when.${f}`)).toBe(true);
    }
    expect(resolvesInEn('decide.pay.when.today')).toBe(true);
  });
});

describe('instalment summaries', () => {
  const summary = (inst: Partial<CheckInputs['instalment']>): string | null => {
    const s = methodSummary({ method: 'instalment', inputs: inputs(inst), plan: null, cash: 0, whole, exact, cards: [] });
    return s === null ? null : joinPreview(t, s as CopyRef | readonly CopyRef[]);
  };

  it('D-89 summaries name the frequency', () => {
    for (const freq of FREQS) {
      expect(summary({ amount: 5_000, count: 12, freq })).toBe(`12 × E5000 ${SUMMARY[freq]} · no rate`);
      expect(summary({ amount: 5_000, count: 12, freq, hasRate: true, aprText: '9' })).toBe(`12 × E5000 ${SUMMARY[freq]} · 9%`);
      expect(summary({ amount: 5_000, count: 12, freq, firstPayment: 'next_period' })).toBe(`12 × E5000 ${SUMMARY[freq]} · no rate · first ${WHEN[freq]}`);
      expect(summary({ amount: 5_000, count: 12, freq, hasRate: true, aprText: '9', firstPayment: 'next_period' })).toBe(`12 × E5000 ${SUMMARY[freq]} · 9% · first ${WHEN[freq]}`);
    }
  });

  it('D-89 a stored next_month still adds the first clause, and a rate that is not valid yet is left out', () => {
    expect(summary({ amount: 5_000, count: 12, firstPayment: 'next_month' })).toBe('12 × E5000 a month · no rate · first in a month');
    expect(summary({ amount: 5_000, count: 12, hasRate: true, aprText: '' })).toBe('12 × E5000 a month');
    expect(summary({ amount: 5_000, count: null })).toBeNull();
  });
});
