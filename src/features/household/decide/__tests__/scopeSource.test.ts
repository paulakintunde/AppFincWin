// 08.1-10: the household side of a Household check as plain data. A partner is only ever the one rounded figure; the share is the
// household's default split rule; the settle-up facts are the viewer's own.
import { minorUnits } from '@/engine/money';
import { billWeightsOf, jointSourcesOf, partnersOf, scopeSourceOf, settingOf, settleUpOf, shareScopeOf } from '../scopeSource';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number): string => new Date(ms).toISOString();
const A = { user_id: 'me', weight: 60 };
const B = { user_id: 'sam', weight: 40 };

describe('shareScopeOf', () => {
  it('is null for a household of one, a viewer who is not in it, or more people than a check can hold', () => {
    expect(shareScopeOf([A], 'me', undefined)).toBeNull();
    expect(shareScopeOf([A, B], 'nobody', undefined)).toBeNull();
    expect(shareScopeOf([A, B], undefined, undefined)).toBeNull();
    const many = Array.from({ length: 21 }, (_, i) => ({ user_id: i === 0 ? 'me' : `u${i}`, weight: 5 }));
    expect(shareScopeOf(many, 'me', undefined)).toBeNull();
  });

  it('reads even when the household has set no default', () => {
    expect(shareScopeOf([A, B], 'me', undefined)).toEqual({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } });
    expect(shareScopeOf([A, B], 'me', [{ category_ref: 'builtin:food', rule: 'mine' }])).toMatchObject({ rule: { kind: 'even' } });
  });

  it('follows the household default row: weights, even or mine; the viewer index is their place in join order', () => {
    expect(shareScopeOf([A, B], 'sam', [{ category_ref: null, rule: 'weight' }])).toEqual({ kind: 'household', memberCount: 2, myIndex: 1, rule: { kind: 'weight', weights: [60, 40] } });
    expect(shareScopeOf([A, B], 'me', [{ category_ref: null, rule: 'even' }])).toMatchObject({ rule: { kind: 'even' } });
    expect(shareScopeOf([A, B], 'me', [{ category_ref: null, rule: 'mine' }])).toMatchObject({ rule: { kind: 'mine' } });
  });

  it('reads weights that are all zero as even (a weight rule with no weight cannot split)', () => {
    const zero = [{ user_id: 'me', weight: 0 }, { user_id: 'sam', weight: 0 }];
    expect(shareScopeOf(zero, 'me', [{ category_ref: null, rule: 'weight' }])).toMatchObject({ rule: { kind: 'even' } });
  });
});

describe('partnersOf', () => {
  it('carries a figure only from an ok answer; a refusal, a missing answer or a loading one counts as not shared', () => {
    const out = partnersOf(
      [B, { user_id: 'lee', weight: 0 }, { user_id: 'kim', weight: 0 }],
      [{ ok: true, rounded_left: 300000, currency: 'USD', as_of: '2026-11-20' }, { ok: false, reason: 'not_both_on' }, undefined],
    );
    expect(out).toEqual([
      { key: 'sam', weight: 40, sharing: true, roundedLeft: 300000, currency: 'USD' },
      { key: 'lee', weight: 0, sharing: false, roundedLeft: null, currency: '' },
      { key: 'kim', weight: 0, sharing: false, roundedLeft: null, currency: '' },
    ]);
  });
});

describe('settleUpOf', () => {
  it('is null with nothing lapsed and nothing owed', () => {
    expect(settleUpOf([], [{ net: minorUnits(500) }], 'me', NOW)).toBeNull();
  });

  it('sums what the viewer owes (net below zero) and ignores what is owed to them', () => {
    expect(settleUpOf([], [{ net: minorUnits(-4000) }, { net: minorUnits(1000) }, { net: minorUnits(-500) }], 'me', NOW)).toEqual({ lapsedAsPayer: false, owed: 4500 });
  });

  it('counts a settle-up the viewer owed that lapsed in the last 30 days, in either form', () => {
    const lapsed = { payer_id: 'me', status: 'lapsed' as const, expires_at: iso(NOW - 3 * DAY) };
    const pastExpiry = { payer_id: 'me', status: 'pending' as const, expires_at: iso(NOW - DAY) };
    expect(settleUpOf([lapsed], [], 'me', NOW)).toEqual({ lapsedAsPayer: true, owed: 0 });
    expect(settleUpOf([pastExpiry], [], 'me', NOW)).toEqual({ lapsedAsPayer: true, owed: 0 });
  });

  it('does not count another payer, a live one, an old one or one with no date', () => {
    const rows = [
      { payer_id: 'sam', status: 'lapsed' as const, expires_at: iso(NOW - DAY) },
      { payer_id: 'me', status: 'pending' as const, expires_at: iso(NOW + DAY) },
      { payer_id: 'me', status: 'lapsed' as const, expires_at: iso(NOW - 40 * DAY) },
      { payer_id: 'me', status: 'lapsed' as const, expires_at: null },
      { payer_id: 'me', status: 'confirmed' as const, expires_at: iso(NOW - DAY) },
    ];
    expect(settleUpOf(rows, [], 'me', NOW)).toBeNull();
  });
});

describe('scopeSourceOf', () => {
  it('lays the viewer, their weight and every other member into the builder source', () => {
    const src = scopeSourceOf({ viewerId: 'me', members: [A, B], totals: [{ ok: true, rounded_left: 1000, currency: 'USD', as_of: 'x' }], settleUp: null });
    expect(src).toEqual({
      scope: 'household',
      viewerId: 'me',
      myWeight: 60,
      partners: [{ key: 'sam', weight: 40, sharing: true, roundedLeft: 1000, currency: 'USD' }],
      settleUp: null,
      memberKeys: ['me', 'sam'],
      setting: null,
      billWeights: { me: 1, sam: 1 },
      joint: [],
    });
  });

  it('08.1-22: carries the scope, the saved rule, the bill weights and the joint accounts', () => {
    const src = scopeSourceOf({
      viewerId: 'sam',
      members: [A, B],
      totals: [],
      settleUp: null,
      scope: 'me',
      spendRule: { rule: 'custom', setup: 'mixed', shares: { me: 70, sam: 30 } },
      defaults: [{ category_ref: null, rule: 'weight' }],
      joint: [{ id: 'j1', currency: 'USD', purpose: 'bills', spendable: false, balance: 1, monthIn: 2, monthOut: 3, billsDueBeforeNextIn: 0, paidInBy: {} }],
    });
    expect(src).toMatchObject({
      scope: 'me',
      viewerId: 'sam',
      memberKeys: ['me', 'sam'],
      setting: { rule: 'custom', setup: 'mixed', shares: { me: 70, sam: 30 } },
      billWeights: { me: 60, sam: 40 },
    });
    expect(src?.joint).toHaveLength(1);
  });

  it('is null when the viewer is not among the members', () => {
    expect(scopeSourceOf({ viewerId: 'ghost', members: [A, B], totals: [], settleUp: null })).toBeNull();
  });
});

describe('08.1-22 billWeightsOf / settingOf', () => {
  it('follows the household default bill rule; "mine only" is none', () => {
    expect(billWeightsOf([A, B], [{ category_ref: null, rule: 'weight' }])).toEqual({ me: 60, sam: 40 });
    expect(billWeightsOf([A, B], [{ category_ref: null, rule: 'even' }])).toEqual({ me: 1, sam: 1 });
    expect(billWeightsOf([A, B], undefined)).toEqual({ me: 1, sam: 1 });
    expect(billWeightsOf([A, B], [{ category_ref: null, rule: 'mine' }])).toBeNull();
    expect(billWeightsOf([{ ...A, weight: 0 }, { ...B, weight: 0 }], [{ category_ref: null, rule: 'weight' }])).toEqual({ me: 1, sam: 1 });
  });
  it('reads the saved row, or none', () => {
    expect(settingOf(null)).toBeNull();
    expect(settingOf(undefined)).toBeNull();
    expect(settingOf({ rule: 'bill', setup: null, shares: null })).toEqual({ rule: 'bill', setup: null, shares: null });
  });
});

describe('08.1-22 jointSourcesOf', () => {
  const purposes = [
    { id: 'j1', currency: 'USD', opening_balance: 100_000, joint_purpose: 'bills' as const, joint_savings_spendable: false, joint_safety_net: false, version: 1 },
    { id: 'j2', currency: 'EUR', opening_balance: 0, joint_purpose: null, joint_savings_spendable: true, joint_safety_net: false, version: 1 },
  ];
  it('is none with no read', () => {
    expect(jointSourcesOf(undefined)).toEqual([]);
  });
  it('adds the opening balance to the paid lines of the account in its own currency, and carries this month\'s totals', () => {
    const out = jointSourcesOf(
      {
        purposes,
        balances: [
          { account_id: 'j1', balance: 50_000, currency: 'USD' },
          { account_id: 'j1', balance: 9, currency: 'EUR' }, // a stray leg in another currency is not the account's own
          { account_id: 'j2', balance: 7, currency: 'EUR' },
        ],
        month: [{ account_id: 'j1', currency: 'USD', money_in: 300, money_out: 120, paid_in_by: { me: 300 } }],
      },
      new Set(['j2']),
    );
    expect(out[0]).toEqual({ id: 'j1', currency: 'USD', purpose: 'bills', spendable: false, balance: 150_000, monthIn: 300, monthOut: 120, billsDueBeforeNextIn: 0, paidInBy: { me: 300 } });
    expect(out[1]).toEqual({ id: 'j2', currency: 'EUR', purpose: null, spendable: true, safetyNet: true, balance: 7, monthIn: 0, monthOut: 0, billsDueBeforeNextIn: 0, paidInBy: {} });
  });
  // 08.1-23 (Q10, HH-34): the group's "This is our safety net" mark reaches the engine as safetyNet, on joint savings only.
  it('marks joint savings the group set as the safety net, and nothing else', () => {
    const read = (purpose: 'savings' | 'everyday', net: boolean) => ({
      purposes: [{ id: 'j3', currency: 'USD', opening_balance: 500_000, joint_purpose: purpose, joint_savings_spendable: false, joint_safety_net: net, version: 2 }],
      balances: [],
      month: [],
    });
    expect(jointSourcesOf(read('savings', true))[0]?.safetyNet).toBe(true);
    expect(jointSourcesOf(read('savings', false))[0]?.safetyNet).toBeUndefined();
    expect(jointSourcesOf(read('everyday', true))[0]?.safetyNet).toBeUndefined();
  });
});
