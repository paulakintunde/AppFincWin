// 08.1-10: the household side of a Household check as plain data. A partner is only ever the one rounded figure; the share is the
// household's default split rule; the settle-up facts are the viewer's own.
import { minorUnits } from '@/engine/money';
import { partnersOf, scopeSourceOf, settleUpOf, shareScopeOf } from '../scopeSource';

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
    });
  });

  it('is null when the viewer is not among the members', () => {
    expect(scopeSourceOf({ viewerId: 'ghost', members: [A, B], totals: [], settleUp: null })).toBeNull();
  });
});
