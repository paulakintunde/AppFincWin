import { assert, property, string } from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { checkOnce, inputsOf } from '../../__tests__/helpers/fixtures';
import { evaluate } from '../../evaluate';
import type { V3Account } from '../../types';
import { emergencyOf, emergencyUse, liveEmergencyOf, mayUseEmergency, withLiveEmergency } from '../emergency';

const m = minorUnits;
const acct = (id: string, balance: number, use: V3Account['use']): V3Account => ({ id, balance: m(balance), use });

describe('live emergency fund (owner decision 2026-10-28)', () => {
  const stored = { amount: m(500000), accountId: 'a' };
  it('null stays null; no link or no accounts stays as stored; an unknown account stays as stored', () => {
    expect(liveEmergencyOf(null, [])).toBeNull();
    const bare = { amount: m(500000) };
    expect(liveEmergencyOf(bare, [acct('a', 1, null)])).toBe(bare);
    const nulled = { amount: m(500000), accountId: null };
    expect(liveEmergencyOf(nulled, [acct('a', 1, null)])).toBe(nulled);
    expect(liveEmergencyOf(stored, undefined)).toBe(stored);
    expect(liveEmergencyOf(stored, [acct('z', 1, null)])).toBe(stored);
  });
  it('a non-mixed account gives its whole balance, floored at 0', () => {
    const uses: V3Account['use'][] = [{ kind: 'dedicated', purpose: { kind: 'emergency' } }, { kind: 'untouched' }, { kind: 'everyday' }, null];
    for (const u of uses) expect(liveEmergencyOf(stored, [acct('a', 900000, u)])?.amount).toBe(900000);
    expect(liveEmergencyOf(stored, [acct('a', -5, { kind: 'untouched' })])?.amount).toBe(0);
  });
  it('a mixed account gives the stated amount capped at the live balance', () => {
    const mixed = { kind: 'mixed', extraSetAside: null } as const;
    expect(liveEmergencyOf({ amount: m(300000), accountId: 'a' }, [acct('a', 900000, mixed)])?.amount).toBe(300000);
    expect(liveEmergencyOf({ amount: m(300000), accountId: 'a' }, [acct('a', 200000, mixed)])?.amount).toBe(200000);
    expect(liveEmergencyOf({ amount: m(300000), accountId: 'a' }, [acct('a', -1, mixed)])?.amount).toBe(0);
  });
  it('evaluate shows the fund at the account balance now', () => {
    const raw = inputsOf({ emergency: stored, accounts: [acct('a', 900000, { kind: 'dedicated', purpose: { kind: 'emergency' } })] });
    expect(evaluate(raw, checkOnce(1000)).funds.emergency).toBe(900000);
  });
  it('withLiveEmergency returns the same object when nothing changes', () => {
    const same = inputsOf({ emergency: { amount: m(900000), accountId: 'a' }, accounts: [acct('a', 900000, { kind: 'untouched' })] });
    expect(withLiveEmergency(same)).toBe(same);
    const moved = inputsOf({ emergency: stored, accounts: [acct('a', 900000, { kind: 'untouched' })] });
    expect(withLiveEmergency(moved).emergency?.amount).toBe(900000);
    expect(withLiveEmergency(inputsOf())).toEqual(inputsOf());
  });
});

describe('emergency fund', () => {
  it('v3 3.7 not set', () => {
    expect(emergencyOf(null)).toEqual({ amount: null, notice: { code: 'emergency_not_set', values: {} } });
    expect(emergencyOf({ amount: m(500) })).toEqual({ amount: 500, notice: null });
  });
  it('v3 3.7 use and rebuild', () => {
    expect(emergencyUse({ need: m(60000), fund: m(300000), typicalLeft: m(12000) })).toEqual({ used: 60000, shortfall: 0, rebuildMonths: 5 });
    expect(emergencyUse({ need: m(60000), fund: m(300000), typicalLeft: m(0) }).rebuildMonths).toBeNull();
    expect(emergencyUse({ need: m(60000), fund: m(300000), typicalLeft: null }).rebuildMonths).toBeNull();
    expect(emergencyUse({ need: m(400000), fund: m(300000), typicalLeft: m(100000) })).toEqual({ used: 300000, shortfall: 100000, rebuildMonths: 3 });
    expect(emergencyUse({ need: m(0), fund: m(300000), typicalLeft: m(10) })).toEqual({ used: 0, shortfall: 0, rebuildMonths: 0 });
  });
  it('I38 gate', () => {
    const nec = { kind: 'preset', value: 'necessity' } as const;
    const work = { kind: 'preset', value: 'for_work' } as const;
    expect(mayUseEmergency({ emergency: true, purpose: nec })).toBe(true);
    expect(mayUseEmergency({ emergency: true, purpose: work })).toBe(true);
    expect(mayUseEmergency({ emergency: false, purpose: nec })).toBe(false);
    expect(mayUseEmergency({ emergency: true, purpose: null })).toBe(false);
    expect(mayUseEmergency({ emergency: true, purpose: { kind: 'preset', value: 'treat' } })).toBe(false);
    assert(property(string(), (id) => !mayUseEmergency({ emergency: true, purpose: { kind: 'custom', id } })));
  });
});
