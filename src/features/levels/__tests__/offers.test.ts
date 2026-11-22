import {
  DAY_MS,
  EMPTY_OFFER_STATE,
  OFFER_GAP_MS,
  SNOOZE_MS,
  canShowOffer,
  paymentNoticeDue,
  pickOffer,
  withNever,
  withShown,
  withSnooze,
  type CanShowInput,
  type OfferState,
} from '../offers';
import { parseOfferState } from '../offerStore';
import { triggeredFeatures, type TriggerInput } from '../offerTriggers';

const NOW = Date.parse('2026-11-19T10:00:00Z');
const HIDDEN = { visible: false, reason: 'level' as const };

function input(over: Partial<CanShowInput> = {}): CanShowInput {
  return {
    featureId: 'debts',
    now: NOW,
    state: EMPTY_OFFER_STATE,
    context: 'home',
    planStatus: 'active',
    planWritable: true,
    paymentNoticeToday: false,
    access: HIDDEN,
    ...over,
  };
}

describe('canShowOffer', () => {
  it('shows a hidden feature when nothing rules it out', () => {
    expect(canShowOffer(input())).toBe(true);
  });

  it('uses a 7 day gap and a 30 day snooze', () => {
    expect(OFFER_GAP_MS).toBe(7 * DAY_MS);
    expect(SNOOZE_MS).toBe(30 * DAY_MS);
  });

  it('is false when an offer was shown within 7 days, true once 7 days have passed', () => {
    const recent: OfferState = { ...EMPTY_OFFER_STATE, lastShownAt: new Date(NOW - 6 * DAY_MS).toISOString() };
    expect(canShowOffer(input({ state: recent }))).toBe(false);
    const old: OfferState = { ...EMPTY_OFFER_STATE, lastShownAt: new Date(NOW - 7 * DAY_MS).toISOString() };
    expect(canShowOffer(input({ state: old }))).toBe(true);
  });

  it('is false while the feature is snoozed, true after the snooze ends', () => {
    const snoozed = withSnooze(EMPTY_OFFER_STATE, 'debts', NOW);
    expect(canShowOffer(input({ state: snoozed }))).toBe(false);
    expect(canShowOffer(input({ state: snoozed, now: NOW + 30 * DAY_MS + 1 }))).toBe(true);
  });

  it('a snooze on one feature does not hide another', () => {
    const snoozed = withSnooze(EMPTY_OFFER_STATE, 'goals', NOW);
    expect(canShowOffer(input({ state: snoozed }))).toBe(true);
  });

  it('is false for a feature marked never, forever', () => {
    const never = withNever(EMPTY_OFFER_STATE, 'debts');
    expect(canShowOffer(input({ state: never, now: NOW + 400 * DAY_MS }))).toBe(false);
  });

  it.each(['decide', 'onboarding'] as const)('is false in the %s context', (context) => {
    expect(canShowOffer(input({ context }))).toBe(false);
  });

  it.each(['sample', 'locked'] as const)('is false when the plan status is %s', (planStatus) => {
    expect(canShowOffer(input({ planStatus }))).toBe(false);
  });

  it('is false when the plan is not writable', () => {
    expect(canShowOffer(input({ planWritable: false }))).toBe(false);
  });

  it('is false on a payment-notice day', () => {
    expect(canShowOffer(input({ paymentNoticeToday: true }))).toBe(false);
  });

  it.each(['household', 'plan'] as const)('is false when the %s rules the feature out', (reason) => {
    expect(canShowOffer(input({ access: { visible: false, reason } }))).toBe(false);
  });

  it('is false when the feature is already visible', () => {
    expect(canShowOffer(input({ access: { visible: true, reason: null } }))).toBe(false);
  });
});

describe('paymentNoticeDue', () => {
  it('is true in grace and when a trial ends within 3 days', () => {
    expect(paymentNoticeDue({ status: 'grace', trialEndsAt: null }, NOW)).toBe(true);
    expect(paymentNoticeDue({ status: 'trial', trialEndsAt: new Date(NOW + 2 * DAY_MS).toISOString() }, NOW)).toBe(true);
  });
  it('is false for a trial further out, and for an active plan', () => {
    expect(paymentNoticeDue({ status: 'trial', trialEndsAt: new Date(NOW + 10 * DAY_MS).toISOString() }, NOW)).toBe(false);
    expect(paymentNoticeDue({ status: 'active', trialEndsAt: null }, NOW)).toBe(false);
  });
});

describe('pickOffer', () => {
  const base = {
    now: NOW,
    state: EMPTY_OFFER_STATE,
    context: 'home' as const,
    planStatus: 'active' as const,
    planWritable: true,
    paymentNoticeToday: false,
    accessById: () => HIDDEN,
  };

  it('returns the first triggered, eligible feature in registry order', () => {
    // 'goals' comes before 'debts' in the registry; the set order does not matter.
    expect(pickOffer({ ...base, triggered: new Set(['debts', 'goals']) })).toBe('goals');
  });

  it('skips a feature that may not be shown and takes the next', () => {
    const state = withNever(EMPTY_OFFER_STATE, 'goals');
    expect(pickOffer({ ...base, state, triggered: new Set(['debts', 'goals']) })).toBe('debts');
  });

  it('returns null when nothing is triggered or the week is used', () => {
    expect(pickOffer({ ...base, triggered: new Set() })).toBeNull();
    const state = withShown(EMPTY_OFFER_STATE, NOW - DAY_MS);
    expect(pickOffer({ ...base, state, triggered: new Set(['debts']) })).toBeNull();
  });
});

describe('triggeredFeatures', () => {
  const t: TriggerInput = {
    lines: [],
    debtCategoryId: 'cat-debt',
    savingsCategoryId: 'cat-save',
    homeCurrency: 'USD',
    seriesOfferCount: 0,
    today: '2026-11-19',
  };
  const line = (over: Partial<TriggerInput['lines'][number]>) => ({
    category_id: null,
    local_date: '2026-11-10',
    original_currency: 'USD',
    ...over,
  });

  it('debts: a Debt-category line within 60 days', () => {
    expect([...triggeredFeatures({ ...t, lines: [line({ category_id: 'cat-debt' })] })]).toEqual(['debts']);
  });
  it('debts: not when the line is older than 60 days', () => {
    expect(triggeredFeatures({ ...t, lines: [line({ category_id: 'cat-debt', local_date: '2026-08-01' })] }).size).toBe(0);
  });
  it('goals: a Savings-category line within 60 days', () => {
    expect([...triggeredFeatures({ ...t, lines: [line({ category_id: 'cat-save' })] })]).toEqual(['goals']);
  });
  it('multiCurrency: a line whose currency differs from home', () => {
    expect([...triggeredFeatures({ ...t, lines: [line({ original_currency: 'EUR' })] })]).toEqual(['multiCurrency']);
  });
  it('recurring: when a repeating-bill suggestion is waiting', () => {
    expect([...triggeredFeatures({ ...t, seriesOfferCount: 2 })]).toEqual(['recurring']);
  });
  it('ignores deleted and sample lines', () => {
    const lines = [
      line({ category_id: 'cat-debt', deleted_at: '2026-11-11T00:00:00Z' }),
      line({ category_id: 'cat-save', is_sample: true }),
    ];
    expect(triggeredFeatures({ ...t, lines }).size).toBe(0);
  });
  it('triggers nothing when the person has no such categories', () => {
    expect(triggeredFeatures({ ...t, debtCategoryId: null, savingsCategoryId: null, lines: [line({ category_id: 'x' })] }).size).toBe(0);
  });
});

describe('offer state helpers and store parsing', () => {
  it('withShown stamps the time; withSnooze sets now plus 30 days; withNever is idempotent', () => {
    expect(withShown(EMPTY_OFFER_STATE, NOW).lastShownAt).toBe(new Date(NOW).toISOString());
    expect(withSnooze(EMPTY_OFFER_STATE, 'debts', NOW).snoozed.debts).toBe(new Date(NOW + 30 * DAY_MS).toISOString());
    const once = withNever(EMPTY_OFFER_STATE, 'debts');
    expect(withNever(once, 'debts').never).toEqual(['debts']);
  });
  it('parses stored JSON and falls back to empty on junk', () => {
    expect(parseOfferState(JSON.stringify({ lastShownAt: 'x', snoozed: { a: 'y', b: 1 }, never: ['c', 2] }))).toEqual({
      lastShownAt: 'x',
      snoozed: { a: 'y' },
      never: ['c'],
    });
    expect(parseOfferState('not json')).toEqual(EMPTY_OFFER_STATE);
    expect(parseOfferState(null)).toEqual(EMPTY_OFFER_STATE);
  });
});
