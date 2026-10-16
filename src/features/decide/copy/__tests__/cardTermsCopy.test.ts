import { i18n } from '@/i18n';
import { refText } from '../../check/refText';
import type { CardTermsView } from '../../snapshot/types';
import { cardCostsCopy, cardTermsSummary, parseCardTermsForm } from '../cardTermsCopy';
import { resolvesInEn } from './helpers/enKeys';
import type { CopyRef } from '../types';

const t = (key: string, params?: Record<string, string | number>): string => String((i18n.t as (k: string, o?: Record<string, string | number>) => unknown)(key, params));
const text = (r: CopyRef): string => refText(t, r);
const fmt = (minor: number, currency: string): string => `${currency} ${minor}`;

const TERMS: CardTermsView = { debtId: 'd1', source: 'stored', paidInFull: false, percentText: '2', interestAdded: true, floor: 2_500, floorCurrency: 'USD', marketAvailable: true, version: 1 };

const expectDeclarative = (refs: (CopyRef | null)[]): void => {
  for (const r of refs) {
    if (!r) continue;
    expect(r.key.startsWith('decide.depth.cardMin.') || r.key.startsWith('decide.depth.cardCosts.')).toBe(true);
    expect(resolvesInEn(r.key)).toBe(true);
    expect(text(r)).not.toMatch(/\{\{|undefined|NaN|should|advice|recommend/i);
  }
};

describe('cardTermsSummary', () => {
  it('reads the stored terms with and without interest', () => {
    const a = cardTermsSummary(TERMS, fmt);
    expect(a.tone).toBe('normal');
    expect(a.note).toBeNull();
    expect(text(a.value)).toBe('2% of the balance plus interest, at least USD 2500');
    const b = cardTermsSummary({ ...TERMS, interestAdded: false, percentText: '3.5' }, fmt);
    expect(text(b.value)).toBe('3.5% of the balance, at least USD 2500');
    expectDeclarative([a.value, b.value]);
  });

  it('paid in full reads as such with no note', () => {
    const s = cardTermsSummary({ ...TERMS, paidInFull: true, source: 'market' }, fmt);
    expect(s.value.key).toBe('decide.depth.cardMin.paidInFull');
    expect(s.note).toBeNull();
  });

  it('no terms read not set, in the warn tone', () => {
    for (const terms of [
      { ...TERMS, source: 'none' as const },
      { ...TERMS, percentText: null },
      { ...TERMS, interestAdded: null },
      { ...TERMS, floor: null },
    ]) {
      const s = cardTermsSummary(terms, fmt);
      expect(s.value.key).toBe('decide.depth.cardMin.notSet');
      expect(s.tone).toBe('warn');
    }
  });

  it('a Canadian pre-fill reads the outside-Quebec note', () => {
    expect(cardTermsSummary({ ...TERMS, source: 'market', floorCurrency: 'CAD' }, fmt).note?.key).toBe('decide.depth.cardMin.marketNoteCa');
    expect(cardTermsSummary({ ...TERMS, source: 'market', floorCurrency: 'USD' }, fmt).note?.key).toBe('decide.depth.cardMin.marketNote');
    expect(cardTermsSummary(TERMS, fmt).note).toBeNull();
    expectDeclarative([cardTermsSummary({ ...TERMS, source: 'market' }, fmt).note]);
  });
});

describe('parseCardTermsForm', () => {
  const form = { percentText: '2', interestAdded: true, floorText: '25.00', paidInFull: false };

  it('parses valid terms to minor units', () => {
    expect(parseCardTermsForm(form, 2)).toEqual({ ok: true, terms: { percentText: '2', interestAdded: true, floor: 2_500, paidInFull: false } });
    expect(parseCardTermsForm({ ...form, percentText: '100', floorText: '0' }, 2)).toEqual({ ok: true, terms: { percentText: '100', interestAdded: true, floor: 0, paidInFull: false } });
  });

  it('rejects a bad percent or floor with the field', () => {
    for (const percentText of ['', '101', '1.', 'abc', '-1', '2.12345678901', '12345']) {
      expect(parseCardTermsForm({ ...form, percentText }, 2)).toEqual({ ok: false, field: 'percent' });
    }
    for (const floorText of ['', 'x', '-5', '1.234']) {
      expect(parseCardTermsForm({ ...form, floorText }, 2)).toEqual({ ok: false, field: 'floor' });
    }
  });

  it('paid in full keeps valid typed terms, else nulls', () => {
    expect(parseCardTermsForm({ ...form, paidInFull: true }, 2)).toEqual({ ok: true, terms: { percentText: '2', interestAdded: true, floor: 2_500, paidInFull: true } });
    expect(parseCardTermsForm({ ...form, percentText: '', paidInFull: true }, 2)).toEqual({ ok: true, terms: { percentText: null, interestAdded: null, floor: null, paidInFull: true } });
  });
});

describe('cardCostsCopy', () => {
  it('card costs break down into interest and card fees', () => {
    const f = (m: number) => `$${m}`;
    const r = cardCostsCopy({ fees: 3_500, cardCosts: 31_160 }, 27_660, f);
    expect(r).toEqual({ key: 'decide.depth.cardCosts.breakdown', params: { interest: '$27660', fees: '$3500' } });
    expect(text(r!)).toBe('$27660 interest plus $3500 in card fees.');
    expectDeclarative([r]);
    expect(cardCostsCopy({ fees: 0, cardCosts: 27_660 }, 27_660, f)).toBeNull();
    expect(cardCostsCopy({ fees: 3_500, cardCosts: null }, 27_660, f)).toBeNull();
    expect(cardCostsCopy({ fees: 3_500, cardCosts: 31_160 }, null, f)).toBeNull();
    expect(cardCostsCopy(null, 27_660, f)).toBeNull();
  });
});
