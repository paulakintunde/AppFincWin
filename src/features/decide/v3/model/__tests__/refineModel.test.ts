import { minorUnits } from '@/engine/money';
import type { RefineCard, RefineCardKind } from '@/engine/decide/v3';
import { refineCards, refineHomeCard, REFINE_CHOICES } from '../refineModel';
import { refine } from '../../../../../i18n/locales/decideV3Ui/refine';

jest.setTimeout(60000);
const mu = minorUnits;

const ALL_KINDS: readonly RefineCardKind[] = [
  'pay', 'pay_stopped', 'everyday', 'everyday_override_expiring', 'new_regular', 'saving_bucket',
  'unspent', 'changing_income', 'steady_above_income', 'series_drift', 'card_not_paid_in_full', 'under_logged_month',
];
const card = (kind: RefineCardKind, over: Partial<RefineCard> = {}): RefineCard => ({ kind, ref: null, month: null, current: mu(100), suggested: mu(150), noise: mu(10), ...over });

describe('refineHomeCard', () => {
  it('three_months with two cards', () => {
    expect(refineHomeCard({ trigger: 'three_months', cards: [card('pay'), card('everyday')] }, false)).toEqual({
      show: true,
      eyebrowKey: 'decide.v3.ui.refine.eyebrowThree',
      bodyKey: 'decide.v3.ui.refine.body_other',
      count: 2,
    });
  });
  it('one card uses body_one; other triggers use eyebrowNew', () => {
    const h = refineHomeCard({ trigger: 'new_repeating', cards: [card('new_regular')] }, false);
    expect(h).toMatchObject({ show: true, eyebrowKey: 'decide.v3.ui.refine.eyebrowNew', bodyKey: 'decide.v3.ui.refine.body_one', count: 1 });
  });
  it('reads the engine triggers list', () => {
    expect(refineHomeCard({ triggers: ['rough_one_month', 'three_months'], cards: [card('pay')] }, false).eyebrowKey).toBe('decide.v3.ui.refine.eyebrowThree');
    expect(refineHomeCard({ triggers: ['typed_off'], cards: [card('pay')] }, false).eyebrowKey).toBe('decide.v3.ui.refine.eyebrowNew');
  });
  it('hidden when snoozed, with no cards, or with no result', () => {
    expect(refineHomeCard({ trigger: 'three_months', cards: [card('pay')] }, true).show).toBe(false);
    expect(refineHomeCard({ trigger: 'three_months', cards: [] }, false).show).toBe(false);
    expect(refineHomeCard(null, false)).toMatchObject({ show: false, count: 0, eyebrowKey: 'decide.v3.ui.refine.eyebrowNew' });
  });
});

describe('refineCards', () => {
  it('maps keys, params and choices for each card', () => {
    const [a, b] = refineCards([card('pay', { ref: 's1' }), card('under_logged_month', { month: '2026-08', current: null, suggested: null })]);
    expect(a).toMatchObject({
      kind: 'pay',
      ref: 's1',
      kickerKey: 'decide.v3.ui.refine.kind.pay.kicker',
      titleKey: 'decide.v3.ui.refine.kind.pay.title',
      bodyKey: 'decide.v3.ui.refine.kind.pay.body',
      params: { current: 100, suggested: 150, month: null },
    });
    expect(a!.choices).toBe(REFINE_CHOICES.pay);
    expect(b!.params).toEqual({ current: null, suggested: null, month: '2026-08' });
    expect(b!.choices.map((c) => c.id)).toEqual(['looksRight', 'keepIt']);
    expect(refineCards([])).toEqual([]);
  });
});

describe('REFINE_CHOICES', () => {
  it('covers every kind, and every key exists in the refine copy', () => {
    expect(Object.keys(REFINE_CHOICES).sort()).toEqual([...ALL_KINDS].sort());
    const copy = refine as unknown as Record<string, unknown>;
    for (const kind of ALL_KINDS) {
      expect(copy['kind']).toHaveProperty(kind);
      for (const c of REFINE_CHOICES[kind]) {
        expect(c.key.startsWith('decide.v3.ui.refine.')).toBe(true);
        expect(typeof copy[c.key.slice('decide.v3.ui.refine.'.length)]).toBe('string');
      }
    }
  });
  it('value kinds offer update/keep with figures; others differ per spec', () => {
    for (const k of ['pay', 'everyday', 'everyday_override_expiring', 'unspent', 'steady_above_income', 'series_drift'] as const) {
      expect(REFINE_CHOICES[k]).toEqual([
        { id: 'update', key: 'decide.v3.ui.refine.use', amount: 'suggested' },
        { id: 'keep', key: 'decide.v3.ui.refine.keepAmount', amount: 'current' },
      ]);
    }
    expect(REFINE_CHOICES.saving_bucket.map((c) => c.id)).toEqual(['looksRight', 'changeIt']);
    expect(REFINE_CHOICES.new_regular.map((c) => c.id)).toEqual(['regular', 'notRegular']);
    expect(REFINE_CHOICES.changing_income.map((c) => c.id)).toEqual(['lowerIt', 'keepIt']);
    expect(REFINE_CHOICES.pay_stopped.map((c) => c.id)).toEqual(['lowerIt', 'keepIt']);
    expect(REFINE_CHOICES.card_not_paid_in_full.map((c) => c.id)).toEqual(['looksRight', 'keepIt']);
  });
});
