import fc from 'fast-check';
import { runningBalance, type RunningRow } from '../runningBalance';

const row = (id: string, day: number, o: Partial<RunningRow> = {}): RunningRow => ({
  id,
  local_date: `2026-10-${String(day).padStart(2, '0')}`,
  created_at: '2026-10-01T00:00:00Z',
  status: 'paid',
  amount: 0,
  ...o,
});

describe('runningBalance', () => {
  it('moves only on paid lines', () => {
    const r = runningBalance({
      opening: 10000,
      paidBeforeMonth: '-2000',
      rows: [
        row('c', 5, { amount: 1000 }),
        row('a', 3, { amount: -500 }),
        row('b', 4, { amount: -700, status: 'pending' }),
        row('s', 4, { amount: -1, status: 'skipped', created_at: '2026-10-02T00:00:00Z' }),
      ],
    });
    expect(r.steps).toEqual([
      { id: 'a', moves: true, after: 7500 },
      { id: 'b', moves: false, after: 7500 },
      { id: 's', moves: false, after: 7500 },
      { id: 'c', moves: true, after: 8500 },
    ]);
    expect(r).toMatchObject({ final: 8500, exact: true, overflow: false });
  });

  it('orders ties by created_at then id', () => {
    const r = runningBalance({
      opening: 0,
      paidBeforeMonth: '0',
      rows: [
        row('b', 1, { amount: 1 }),
        row('a', 1, { amount: 1 }),
        row('z', 1, { amount: 1, created_at: '2026-10-01T00:00:01Z' }),
      ],
    });
    expect(r.steps.map((s) => s.id)).toEqual(['a', 'b', 'z']);
  });

  it('a paid line with no amount makes the figure unknown from there', () => {
    const r = runningBalance({
      opening: 100,
      paidBeforeMonth: '0',
      rows: [
        row('a', 1, { amount: 50 }),
        row('b', 2, { amount: null }),
        row('c', 3, { amount: 5 }),
        row('d', 4, { amount: null, status: 'pending' }),
      ],
    });
    expect(r.steps.map((s) => s.after)).toEqual([150, null, null, null]);
    expect(r).toMatchObject({ final: null, exact: false, overflow: false });
  });

  it('flags overflow instead of a wrong figure', () => {
    const r = runningBalance({
      opening: Number.MAX_SAFE_INTEGER,
      paidBeforeMonth: '0',
      rows: [row('a', 1, { amount: 5 })],
    });
    expect(r).toMatchObject({ final: null, overflow: true });
    expect(r.steps[0]).toEqual({ id: 'a', moves: true, after: null });
  });

  it('final equals opening + paidBefore + sum(paid); pending never changes after', () => {
    const arb = fc.array(
      fc.record({
        amount: fc.integer({ min: -100000, max: 100000 }),
        status: fc.constantFrom('paid', 'pending', 'skipped'),
      }),
      { maxLength: 30 }
    );
    fc.assert(
      fc.property(arb, fc.integer({ min: -1e6, max: 1e6 }), fc.integer({ min: -1e6, max: 1e6 }), (rs, opening, before) => {
        const rows = rs.map((r, i) => row(`r${String(i).padStart(3, '0')}`, 1 + (i % 28), { ...r, status: r.status as RunningRow['status'] }));
        const out = runningBalance({ opening, paidBeforeMonth: String(before), rows });
        const paid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.amount ?? 0), 0);
        expect(out.final).toBe(opening + before + paid);
        let prev = opening + before;
        for (const step of out.steps) {
          if (!step.moves) expect(step.after).toBe(prev);
          prev = step.after as number;
        }
      })
    );
  });
});
