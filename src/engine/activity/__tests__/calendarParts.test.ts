import { calendarCells } from '../calendar';
import type { GroupRow } from '../groups';
import type { Part } from '../../parts';

type R = GroupRow & { category_id: string | null; parts?: readonly Part[] | null };
const base: R = {
  id: 's',
  local_date: '2026-10-05',
  created_at: '2026-10-05T00:00:00Z',
  name: null,
  original_amount: -5000,
  amountHome: -5000,
  status: 'paid',
  transfer_id: null,
  category_id: 'groceries',
};
const dotsOf = (rows: R[]) => {
  const c = calendarCells('2026-10', 1, rows).find((x) => x.kind === 'day' && x.day === 5);
  return c && c.kind === 'day' ? c.dots : [];
};

describe('calendarCells with parts (10.1-10)', () => {
  it('a split line gives one dot per part category, in part order', () => {
    const parts: Part[] = [
      { categoryId: 'groceries', amount: -3000 },
      { categoryId: 'dining', amount: -2000 },
    ];
    expect(dotsOf([{ ...base, parts }])).toEqual(['groceries', 'dining']);
  });
  it('a gap adds a null dot and dots stop at three', () => {
    const parts: Part[] = [
      { categoryId: 'a', amount: -1000 },
      { categoryId: 'b', amount: -1000 },
      { categoryId: 'c', amount: -1000 },
    ];
    expect(dotsOf([{ ...base, parts }])).toEqual(['a', 'b', 'c']);
    expect(dotsOf([{ ...base, parts: parts.slice(0, 2) }])).toEqual(['a', 'b', null]);
  });
  it('transfers and skipped lines give no dots', () => {
    expect(dotsOf([{ ...base, transfer_id: 't' }, { ...base, id: 'k', status: 'skipped' }])).toEqual([]);
  });
});
