import { minorUnits as mu } from '../../money/types';
import { MAX_POTS, SIMULATION_MONTH_CAP } from '../constants';
import { potSetAside, totalSetAside } from '../pots';
import type { PotInput } from '../types';

const ASOF = '2026-10-24';

function pot(over: Partial<PotInput> = {}): PotInput {
  return { id: 'p', kind: 'pot', target: mu(60_000), monthlyAmount: null, readyBy: '2027-03-31', saved: mu(0), ...over };
}

describe('potSetAside', () => {
  it('D-101 600 by March from October is 120 a month and 601 rounds up to 121', () => {
    expect(potSetAside(pot(), ASOF)).toEqual({ id: 'p', monthly: 12_000, months: 5, state: 'active' });
    expect(potSetAside(pot({ target: mu(60_100) }), ASOF).monthly).toBe(12_020);
    expect(potSetAside(pot({ target: mu(60_001) }), ASOF).monthly).toBe(12_001);
  });

  it('D-101 whole months round down when the day of the month has not been reached', () => {
    // 24 Oct to 20 Mar: 24 Mar is after the date, so four whole months
    expect(potSetAside(pot({ readyBy: '2027-03-20' }), ASOF)).toMatchObject({ monthly: 15_000, months: 4 });
  });

  it('D-101 a plain pot inside its first month sets aside the whole remainder', () => {
    expect(potSetAside(pot({ readyBy: '2026-11-10' }), ASOF)).toMatchObject({ monthly: 60_000, months: 1 });
  });

  it('D-101 saved money lowers what remains', () => {
    expect(potSetAside(pot({ saved: mu(30_000) }), ASOF)).toMatchObject({ monthly: 6_000, months: 5 });
  });

  it('D-101 a plain pot on or past its date is past_due with 0', () => {
    expect(potSetAside(pot({ readyBy: ASOF }), ASOF)).toEqual({ id: 'p', monthly: 0, months: null, state: 'past_due' });
    expect(potSetAside(pot({ readyBy: '2026-01-01' }), ASOF).state).toBe('past_due');
  });

  it('D-101 a plain pot with no date sets aside 0 and stays active', () => {
    expect(potSetAside(pot({ readyBy: null }), ASOF)).toEqual({ id: 'p', monthly: 0, months: null, state: 'active' });
  });

  it('D-101 month-end clamp follows occurrenceDate', () => {
    const t = mu(1_000);
    // 31 Jan + 1 month is 28 Feb 2027, + 2 months is 31 Mar
    expect(potSetAside(pot({ readyBy: '2027-02-28', target: t }), '2027-01-31')).toMatchObject({ months: 1 });
    expect(potSetAside(pot({ readyBy: '2027-03-30', target: t }), '2027-01-31')).toMatchObject({ months: 1 });
    expect(potSetAside(pot({ readyBy: '2027-03-31', target: t }), '2027-01-31')).toMatchObject({ months: 2 });
  });

  it('D-101 the month count is capped at SIMULATION_MONTH_CAP', () => {
    const p = potSetAside(pot({ readyBy: '2199-01-01', target: mu(SIMULATION_MONTH_CAP * 10) }), ASOF);
    expect(p).toMatchObject({ months: SIMULATION_MONTH_CAP, monthly: 10 });
  });

  it('D-101 the last month is a residual: recomputing after saving converges with no leftover', () => {
    const first = potSetAside(pot({ target: mu(60_100) }), ASOF);
    const after = potSetAside(pot({ target: mu(60_100), saved: mu(first.monthly) }), '2026-11-24');
    expect(after.months).toBe(4);
    expect(after.monthly * 4).toBeGreaterThanOrEqual(60_100 - first.monthly);
  });

  it('D-101 reached (equal and over) sets aside 0', () => {
    expect(potSetAside(pot({ saved: mu(60_000) }), ASOF)).toEqual({ id: 'p', monthly: 0, months: null, state: 'reached' });
    expect(potSetAside(pot({ saved: mu(70_000) }), ASOF).state).toBe('reached');
    expect(potSetAside(pot({ kind: 'wait', saved: mu(70_000), monthlyAmount: mu(5) }), ASOF).state).toBe('reached');
  });

  it('D-101 a Wait pot with a monthly amount of 0 or null sets aside 0 with months null', () => {
    for (const monthlyAmount of [mu(0), null]) {
      expect(potSetAside(pot({ kind: 'wait', monthlyAmount }), ASOF)).toEqual({
        id: 'p', monthly: 0, months: null, state: 'active',
      });
    }
  });

  it('D-101 a Wait pot with a target and neither amount nor date sets aside 0 and stays active', () => {
    expect(potSetAside(pot({ kind: 'wait', monthlyAmount: null, readyBy: null }), ASOF)).toEqual({
      id: 'p', monthly: 0, months: null, state: 'active',
    });
  });

  it('D-101 a Wait pot sets aside its amount, capped at what remains', () => {
    expect(potSetAside(pot({ kind: 'wait', monthlyAmount: mu(25_000), readyBy: null }), ASOF)).toMatchObject({
      monthly: 25_000, months: 3,
    });
    expect(potSetAside(pot({ kind: 'wait', monthlyAmount: mu(90_000) }), ASOF)).toMatchObject({ monthly: 60_000, months: 1 });
  });

  it('D-101 a pot with no target sets aside its monthly amount, or 0', () => {
    expect(potSetAside(pot({ kind: 'wait', target: null, monthlyAmount: mu(5_000) }), ASOF)).toEqual({
      id: 'p', monthly: 5_000, months: null, state: 'active',
    });
    expect(potSetAside(pot({ kind: 'wait', target: null, monthlyAmount: null }), ASOF).monthly).toBe(0);
  });

  it('D-101 refuses an out-of-range or malformed pot on entry', () => {
    expect(() => potSetAside(pot({ target: mu(0) }), ASOF)).toThrow(/^potSetAside: pot p target 0/);
    expect(() => potSetAside(pot({ target: mu(10_000_000_000_001) }), ASOF)).toThrow(/target/);
    expect(() => potSetAside(pot({ saved: mu(-1) }), ASOF)).toThrow(/saved/);
    expect(() => potSetAside(pot({ monthlyAmount: mu(-1) }), ASOF)).toThrow(/monthlyAmount/);
    expect(() => potSetAside(pot({ target: 1.5 as never }), ASOF)).toThrow(/target/);
    expect(() => potSetAside(pot({ readyBy: '2027-02-30' }), ASOF)).toThrow(/readyBy/);
    expect(() => potSetAside(pot(), '2026-13-01')).toThrow(/asOf/);
  });
});

describe('totalSetAside', () => {
  it('D-101 empty list is 0', () => {
    expect(totalSetAside([], ASOF)).toEqual({ total: 0, saved: 0n, lines: [] });
  });

  it('D-101 the total is the exact sum of the lines and saved is summed', () => {
    const r = totalSetAside([pot({ id: 'a', saved: mu(100) }), pot({ id: 'b', target: mu(60_100) })], ASOF);
    expect(r.lines.map((l) => l.id)).toEqual(['a', 'b']);
    expect(r.total).toBe(r.lines[0]!.monthly + r.lines[1]!.monthly);
    expect(r.saved).toBe(100n);
  });

  it('D-101 50 pots of 10^13 stay exact and inside the safe range', () => {
    const big = Array.from({ length: MAX_POTS }, (_, i) =>
      pot({ id: `p${i}`, kind: 'wait', target: mu(10_000_000_000_000), monthlyAmount: mu(10_000_000_000_000) })
    );
    const r = totalSetAside(big, ASOF);
    expect(r.total).toBe(MAX_POTS * 10_000_000_000_000);
    expect(Number.isSafeInteger(r.total)).toBe(true);
  });

  it('D-101 more than MAX_POTS is refused', () => {
    const many = Array.from({ length: MAX_POTS + 1 }, (_, i) => pot({ id: `p${i}` }));
    expect(() => totalSetAside(many, ASOF)).toThrow(/over the limit of 50/);
  });
});
