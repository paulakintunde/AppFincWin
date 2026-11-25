import type { PlanServerState, PlanStateRow } from '../types';

const mockQuery = jest.fn();
jest.mock('@/data/queries/plan', () => ({ usePlanStateQuery: (...a: unknown[]) => mockQuery(...a) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { toPlanView, usePlanState } from '../usePlanState';

function row(state: PlanServerState, over: Partial<PlanStateRow> = {}): PlanStateRow {
  return {
    household_id: 'h1', state, plan_key: 'duo', plan_size: 2, period: 'month', payer_id: 'u1', payer_is_me: true,
    payer_name: 'Sam', store: 'APP_STORE', product_id: 'fincwin.duo.month', environment: 'PRODUCTION', will_renew: true,
    covered_until: '2026-12-01T00:00:00Z', store_expires_at: null, grace_until: null, trial_ends_at: null, promo_kind: null,
    trial_available: true, members: 2, seats: 2, writable: true, billing_issue_at: null, last_synced_at: null, ...over,
  };
}

describe('toPlanView left_at', () => {
  it('maps left_at and left_home_name', () => {
    const v = toPlanView(row('active', { left_at: '2026-11-18T10:00:00Z', left_home_name: 'Maple' }));
    expect(v.leftAt).toBe('2026-11-18T10:00:00Z');
    expect(v.leftHomeName).toBe('Maple');
  });
  it('maps missing keys (an older cached row) to null', () => {
    const v = toPlanView(row('active'));
    expect(v.leftAt).toBeNull();
    expect(v.leftHomeName).toBeNull();
  });
});

describe('toPlanView status mapping', () => {
  it("maps 'prelaunch' to tester, prelaunch, writable", () => {
    const v = toPlanView(row('prelaunch'));
    expect(v.status).toBe('tester');
    expect(v.prelaunch).toBe(true);
    expect(v.writable).toBe(true);
  });
  it("maps 'none' to sample and not writable when the server says so", () => {
    const v = toPlanView(row('none', { writable: false }));
    expect(v.status).toBe('sample');
    expect(v.writable).toBe(false);
  });
  it("maps 'trial'", () => expect(toPlanView(row('trial')).status).toBe('trial'));
  it("maps 'active'", () => expect(toPlanView(row('active')).status).toBe('active'));
  it("maps 'grace'", () => {
    const v = toPlanView(row('grace'));
    expect(v.status).toBe('grace');
    expect(v.leftGrace).toBe(false);
  });
  it("maps 'left_grace' to grace with leftGrace", () => {
    const v = toPlanView(row('left_grace'));
    expect(v.status).toBe('grace');
    expect(v.leftGrace).toBe(true);
  });
  it("maps 'promo' to tester with the promo kind from the row", () => {
    const v = toPlanView(row('promo', { promo_kind: 'owner' }));
    expect(v.status).toBe('tester');
    expect(v.promoKind).toBe('owner');
  });
  it("maps 'lapsed' to locked and not writable", () => {
    const v = toPlanView(row('lapsed', { writable: false }));
    expect(v.status).toBe('locked');
    expect(v.writable).toBe(false);
  });
  it('takes writable from the server, never from dates', () => {
    expect(toPlanView(row('active', { writable: false, covered_until: '2099-01-01T00:00:00Z' })).writable).toBe(false);
    expect(toPlanView(row('lapsed', { writable: true })).writable).toBe(true);
  });
  it('converts every key to camelCase', () => {
    const v = toPlanView(
      row('active', { trial_ends_at: 't', grace_until: 'g', billing_issue_at: 'b', store_expires_at: 'x' }),
      { loading: false, isError: true },
    );
    expect(v).toMatchObject({
      householdId: 'h1', planKey: 'duo', planSize: 2, period: 'month', seats: 2, members: 2, payerId: 'u1', payerIsMe: true,
      payerName: 'Sam', store: 'APP_STORE', productId: 'fincwin.duo.month', willRenew: true, trialEndsAt: 't',
      graceUntil: 'g', billingIssueAt: 'b', trialAvailable: true, loading: false, isError: true,
    });
  });
});

describe('usePlanState', () => {
  it('returns the cached view when present, even after an error (no optimistic unlock)', () => {
    mockQuery.mockReturnValue({ data: row('lapsed', { writable: false }), isError: true });
    const v = usePlanState();
    expect(v.status).toBe('locked');
    expect(v.writable).toBe(false);
    expect(v.isError).toBe(true);
  });
  it('is loading and not writable with no cache', () => {
    mockQuery.mockReturnValue({ data: undefined, isError: false });
    const v = usePlanState();
    expect(v.loading).toBe(true);
    expect(v.writable).toBe(false);
  });
  it('stays not writable with no cache and an error', () => {
    mockQuery.mockReturnValue({ data: undefined, isError: true });
    const v = usePlanState();
    expect(v.writable).toBe(false);
    expect(v.isError).toBe(true);
  });
});
