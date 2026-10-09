import fc from 'fast-check';
import { calendarCells, weekdayOrder } from '../calendar';
import type { GroupRow } from '../groups';

type R = GroupRow & { category_id: string | null };
const row = (id: string, o: Partial<R> = {}): R => ({
  id,
  local_date: '2026-10-05',
  created_at: '2026-10-05T00:00:00Z',
  name: null,
  original_amount: -100,
  amountHome: -100,
  status: 'paid',
  transfer_id: null,
  category_id: 'c1',
  ...o,
});

describe('calendarCells', () => {
  it('pads leading and trailing blanks to whole weeks', () => {
    const cells = calendarCells('2026-10', 1, []);
    expect(cells.slice(0, 3).every((c) => c.kind === 'blank')).toBe(true);
    expect(cells[3]).toMatchObject({ kind: 'day', day: 1, date: '2026-10-01', dots: [], net: 0 });
    expect(cells.filter((c) => c.kind === 'day')).toHaveLength(31);
    expect(cells.length % 7).toBe(0);
  });

  it('limits dots to 3 distinct categories and ignores transfers and skipped', () => {
    const rows = [
      row('a', { category_id: 'c1', amountHome: -10 }),
      row('b', { category_id: 'c1', amountHome: -20 }),
      row('c', { category_id: null, amountHome: -30 }),
      row('d', { category_id: 'c2', amountHome: -40 }),
      row('e', { category_id: 'c3', amountHome: -50 }),
      row('t', { category_id: 'c9', transfer_id: 'x' }),
    ];
    const cell = calendarCells('2026-10', 1, rows).find((c) => c.kind === 'day' && c.day === 5);
    expect(cell).toMatchObject({ dots: ['c1', null, 'c2'], net: -150, count: 5 });
    const skipped = calendarCells('2026-10', 1, [row('s', { status: 'skipped' })]).find(
      (c) => c.kind === 'day' && c.day === 5
    );
    expect(skipped).toMatchObject({ dots: [], count: 0 });
  });

  it('weekdayOrder rotates by week start', () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('day cells are exactly 1..daysInMonth, each once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom(0, 1),
        (y, m, ws) => {
          const month = `${y}-${String(m).padStart(2, '0')}`;
          const cells = calendarCells(month, ws as 0 | 1, []);
          const days = cells.flatMap((c) => (c.kind === 'day' ? [c.day] : []));
          expect(days).toEqual(Array.from({ length: days.length }, (_, i) => i + 1));
          expect(days.length).toBe(new Date(Date.UTC(y, m, 0)).getUTCDate());
          expect(cells.length % 7).toBe(0);
        }
      )
    );
  });
});
