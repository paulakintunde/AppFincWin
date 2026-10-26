import * as fc from 'fast-check';
import { percent } from '../../../../payoff/types';
import corpusFile from '../../__tests__/golden/legacy-v1-inputs.json';
import { legacyLimits, legacyStateOf, upgradeInputs } from '../legacy';
import { LEGACY_STATE_OF_CODE } from '../../constants';
import type { Code } from '../../types';

type Entry = { source: string; shape: string; json: Record<string, unknown> };
const corpus = (corpusFile as unknown as { inputs: Entry[] }).inputs;
const byShape = (s: string): Entry[] => corpus.filter((e) => e.shape === s);
const stripV = (j: Record<string, unknown>): Record<string, unknown> => {
  const { v: _v, ...rest } = j;
  return rest;
};

describe('upgradeInputs', () => {
  it('I42 total over any JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (j) => {
        const r = upgradeInputs(j);
        expect(r.check.v).toBe(2);
        expect(r.reasons).toContain('legacy_upgraded');
      }),
      { numRuns: 300 },
    );
  });

  it('I42 total over structured v1 lookalikes with hostile values', () => {
    const odd = fc.oneof(fc.jsonValue(), fc.constant(NaN), fc.constant(Infinity), fc.integer(), fc.double());
    fc.assert(
      fc.property(fc.record({ method: odd, advertised: odd, adjustments: odd, runningCosts: odd, loan: odd, instalment: odd, scope: odd, split: odd, customItemType: odd, cheaperPrice: odd }), (j) => {
        expect(upgradeInputs(j).check.v).toBe(2);
      }),
      { numRuns: 300 },
    );
  });

  it('I42 corpus', () => {
    for (const e of corpus) {
      const r = upgradeInputs(e.json);
      expect(r.check.v).toBe(2);
      expect(r.reasons).toContain('legacy_upgraded');
    }
  });

  it('I42 corpus with v stripped (real stored seed shape)', () => {
    for (const e of corpus) {
      const withV = upgradeInputs(e.json);
      const r = upgradeInputs(stripV(e.json));
      expect(r.check.v).toBe(2);
      expect(r.reasons).toContain('legacy_upgraded');
      expect(r.check).toEqual(withV.check);
    }
  });

  it('cash: price is advertised plus on-the-day adjustments, tax from taxPercentText', () => {
    const r = upgradeInputs({
      method: 'cash', advertised: 100000,
      adjustments: [
        { amount: 5000, effect: 'adds', onDay: true, counted: true, taxPercentText: null },
        { amount: 2000, effect: 'takes_off', onDay: true, counted: true, taxPercentText: null },
        { amount: 9000, effect: 'adds', onDay: false, counted: true, taxPercentText: null },
        { amount: 7000, effect: 'adds', onDay: true, counted: false, taxPercentText: null },
        { amount: 8000, effect: 'adds', onDay: true, counted: true, taxPercentText: '8.5' },
      ],
    }).check;
    expect(r.price).toBe(103000);
    expect(r.taxPercent).toBe(percent('8.5'));
    expect(r.pay).toEqual({ mode: 'once' });
  });

  it('loan maps to a monthly plan with deposit, term and rate', () => {
    const c = upgradeInputs(byShape('loan')[0]!.json).check;
    expect(c.itemType).toEqual({ kind: 'preset', value: 'vehicle' });
    expect(c.pay).toMatchObject({ mode: 'plan', cadence: { unit: 'month', every: 1 }, count: 24, termMonths: 24, deposit: 700000, apr: percent('6.9'), firstPayment: null });
    expect(c.extras).toEqual({ 'legacy:insurance': 16000, 'legacy:fuel': 14000, 'legacy:other': 6000 });
  });

  it('instalment: cadence from freq, quoted payment, first payment mapping (D-04)', () => {
    const weekly = upgradeInputs(byShape('instalment')[1]!.json).check.pay;
    expect(weekly).toMatchObject({ mode: 'plan', cadence: { unit: 'week', every: 1 }, count: 26, quotedPayment: 10000, firstPayment: { kind: 'one_period' }, apr: 0n });
    const older = upgradeInputs(byShape('instalment')[0]!.json).check.pay;
    expect(older).toMatchObject({ cadence: { unit: 'month', every: 1 }, count: 12, quotedPayment: 150000, firstPayment: null });
    const alias = upgradeInputs({ method: 'instalment', instalment: { firstPayment: 'next_month' } }).check.pay;
    expect(alias).toMatchObject({ firstPayment: { kind: 'one_period' }, count: null, quotedPayment: null });
    const today = upgradeInputs({ method: 'instalment', instalment: { firstPayment: 'today', freq: 'fortnightly', hasRate: true, aprText: '12' } }).check.pay;
    expect(today).toMatchObject({ firstPayment: { kind: 'today' }, cadence: { unit: 'week', every: 2 }, apr: percent('12') });
    const q = upgradeInputs({ method: 'instalment', instalment: { freq: 'quarterly' } }).check.pay;
    expect(q).toMatchObject({ cadence: { unit: 'month', every: 3 } });
  });

  it('card maps to once with legacy_method_mapped; invest kinds map to legacyKind invest', () => {
    const card = upgradeInputs(byShape('card')[0]!.json);
    expect(card.check.pay).toEqual({ mode: 'once' });
    expect(card.reasons).toContain('legacy_method_mapped');
    const inv = upgradeInputs(byShape('invest')[0]!.json);
    expect(inv.check.legacyKind).toBe('invest');
    expect(upgradeInputs({ method: 'lump' }).check.legacyKind).toBe('invest');
    expect(upgradeInputs({ method: 'cash' }).reasons).toEqual(['legacy_upgraded']);
  });

  it('custom item types keep treatLike and drop the name; share and cheaper price carry over', () => {
    expect(upgradeInputs({ customItemType: { name: 'Boat', treatLike: 'vehicle' } }).check.itemType).toEqual({ kind: 'preset', value: 'vehicle' });
    expect(upgradeInputs({ customItemType: { name: 'Boat', treatLike: null } }).check.itemType).toEqual({ kind: 'preset', value: 'general' });
    expect(upgradeInputs({ itemType: 'nonsense' }).check.itemType).toEqual({ kind: 'preset', value: 'general' });
    expect(upgradeInputs({ cheaperPrice: 5000 }).check.value.cheaperPrice).toBe(5000);
    expect(upgradeInputs({}).check.share).toEqual({ kind: 'personal' });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'weight', weights: [1, 3], amounts: [] } }).check.share).toEqual({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [1, 3] } });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'amount', weights: [], amounts: [100, 300] } }).check.share).toMatchObject({ rule: { kind: 'amount', amounts: [100, 300] } });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'even' } }).check.share).toMatchObject({ rule: { kind: 'even' } });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'mine' } }).check.share).toMatchObject({ rule: { kind: 'mine' } });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'weight', weights: [0, 0] } }).check.share).toEqual({ kind: 'personal' });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'weight', weights: [1] } }).check.share).toEqual({ kind: 'personal' });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'amount', amounts: [0, 0] } }).check.share).toEqual({ kind: 'personal' });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'amount', amounts: ['x', 1] } }).check.share).toEqual({ kind: 'personal' });
    expect(upgradeInputs({ scope: 'household', split: { kind: 'other' } }).check.share).toEqual({ kind: 'personal' });
  });

  it('clamps hostile amounts', () => {
    const c = upgradeInputs({ advertised: 1e30, cheaperPrice: -5 }).check;
    expect(c.price).toBe(1_000_000_000_000);
    expect(c.value.cheaperPrice).toBe(0);
  });
});

describe('legacyLimits', () => {
  it('D-13 lines carry over on', () => {
    const l = legacyLimits({ dsr_line: '40', housing_line: null, unsecured_multiple: 8 }).lines;
    expect(l.map((x) => [x.spec.kind, x.on, x.source])).toEqual([
      ['debt_share', true, 'legacy'], ['housing_share', false, 'builtin'], ['unsecured_multiple', true, 'legacy'],
    ]);
    expect(l[0]!.spec).toEqual({ kind: 'debt_share', pct: percent('40') });
    expect(l[1]!.spec).toEqual({ kind: 'housing_share', pct: percent('28') });
    expect(l[2]!.spec).toEqual({ kind: 'unsecured_multiple', times: 8 });
  });

  it('invalid text stays off with the default', () => {
    const l = legacyLimits({ dsr_line: 'abc', housing_line: '101', unsecured_multiple: 121 }).lines;
    expect(l.every((x) => !x.on)).toBe(true);
    expect(l[0]!.spec).toEqual({ kind: 'debt_share', pct: percent('36') });
    expect(l[2]!.spec).toEqual({ kind: 'unsecured_multiple', times: 12 });
    expect(legacyLimits(null).lines.every((x) => !x.on)).toBe(true);
  });
});

describe('legacyStateOf', () => {
  it('D-23 mapping', () => {
    const codes = Object.keys(LEGACY_STATE_OF_CODE) as Code[];
    expect(codes.map((c) => [c, legacyStateOf(c)])).toEqual([
      ['fits_month', 'fits'], ['fits_unspent', 'fits'], ['monthly_short', 'adjust'], ['emergency_use', 'adjust'], ['not_yet', 'no'], ['needs_input', 'missing'],
    ]);
  });
});
