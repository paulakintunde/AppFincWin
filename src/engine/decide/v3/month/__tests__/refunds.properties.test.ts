/** Properties of refund re-dating (05.2-04): conservation, month order, idempotence, non-refund lines untouched. */
import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import type { LineRole, V3Line, V3Month } from '../../types';
import { redateRefunds } from '../refunds';

const mk = (id: string, date: string, amount: number, role: LineRole, refundOf: string | null): V3Line => ({
  id,
  date,
  amount: minorUnits(amount),
  role,
  status: 'paid',
  seriesId: null,
  categoryId: 'C',
  coversMonths: null,
  expected: false,
  incomeKind: null,
  countsAs: null,
  refundOf,
});

const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06'] as const;

const scenario = fc.record({
  price: fc.integer({ min: 1, max: 5_000_000 }),
  purchaseMonth: fc.integer({ min: 0, max: 1 }),
  refunds: fc.array(fc.record({ amount: fc.integer({ min: 1, max: 3_000_000 }), month: fc.integer({ min: 2, max: 3 }), day: fc.integer({ min: 1, max: 28 }) }), { maxLength: 5 }),
  noise: fc.array(fc.record({ amount: fc.integer({ min: 1, max: 99_999 }), month: fc.integer({ min: 0, max: 3 }) }), { maxLength: 4 }),
});

type Scenario = typeof scenario extends fc.Arbitrary<infer T> ? T : never;

function build(s: Scenario): { months: V3Month[]; refundIds: string[] } {
  const lines: V3Line[][] = MONTHS.map(() => []);
  lines[s.purchaseMonth]?.push(mk('p', `${MONTHS[s.purchaseMonth]}-10`, s.price, 'spending', null));
  const refundIds: string[] = [];
  s.refunds.forEach((r, i) => {
    const id = `r${i}`;
    refundIds.push(id);
    lines[r.month]?.push(mk(id, `${MONTHS[r.month]}-${String(r.day).padStart(2, '0')}`, r.amount, 'refund', 'p'));
  });
  s.noise.forEach((n, i) => lines[n.month]?.push(mk(`n${i}`, `${MONTHS[n.month]}-15`, n.amount, 'spending', null)));
  return { months: MONTHS.map((m, i) => ({ month: m, full: true, mark: null, lines: lines[i] as V3Line[] })), refundIds };
}

const sum = (ls: V3Line[]): number => ls.reduce((a, l) => a + l.amount, 0);

describe('redateRefunds properties', () => {
  it('conserves the refunded total across refund and surplus lines', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { months, refundIds } = build(s);
        const before = sum(months.flatMap((m) => m.lines).filter((l) => refundIds.includes(l.id)));
        const after = sum(
          redateRefunds(months)
            .flatMap((m) => m.lines)
            .filter((l) => refundIds.some((id) => l.id === id || l.id === `${id}:surplus`))
        );
        expect(after).toBe(before);
      })
    );
  });

  it('every moved credit sits in the purchase month and never exceeds the price in total', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { months, refundIds } = build(s);
        const out = redateRefunds(months);
        let credits = 0;
        out.forEach((m) => {
          for (const l of m.lines) {
            if (!refundIds.includes(l.id)) continue;
            expect(m.month).toBe(MONTHS[s.purchaseMonth]);
            expect(l.date.slice(0, 7)).toBe(m.month);
            credits += l.amount;
          }
        });
        expect(credits).toBeLessThanOrEqual(s.price);
      })
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const once = redateRefunds(build(s).months);
        expect(redateRefunds(once)).toEqual(once);
      })
    );
  });

  it('leaves non-refund lines unchanged in every month', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { months } = build(s);
        const out = redateRefunds(months);
        const keep = (m: V3Month): V3Line[] => m.lines.filter((l) => l.role !== 'refund' && !l.id.endsWith(':surplus')).sort((a, b) => (a.id < b.id ? -1 : 1));
        months.forEach((m, i) => expect(keep(out[i] as V3Month)).toEqual(keep(m)));
      })
    );
  });
});
