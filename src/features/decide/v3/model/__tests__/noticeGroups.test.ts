/** Plan 05.3-121 (UAT gap 38): under-logged months merge into one tile item; every other notice passes through in order. */
import type { Notice, NoticeCode } from '@/engine/decide/v3';
import { noticeTileItems } from '../noticeGroups';

const n = (code: NoticeCode, values: Notice['values'] = {}): Notice => ({ code, values });
const under = (month: string): Notice => n('month_looks_under_logged', { month });

describe('noticeTileItems', () => {
  it('returns nothing for no notices', () => {
    expect(noticeTileItems([])).toEqual([]);
  });

  it('keeps one under-logged notice as its own item, in order with the others', () => {
    const list = [n('emergency_not_set'), under('2026-10'), n('from_your_figures')];
    expect(noticeTileItems(list)).toEqual(list.map((notice) => ({ kind: 'notice', notice })));
  });

  it('merges six under-logged notices into one item at the first one’s place, months in month order', () => {
    const a = n('emergency_not_set');
    const b = n('unspent_stale', { days: 40 });
    const list = [
      under('2026-04'),
      a,
      under('2025-11'),
      under('2026-10'),
      b,
      under('2025-12'),
      under('2026-01'),
      under('2026-05'),
    ];
    expect(noticeTileItems(list)).toEqual([
      { kind: 'underLogged', months: ['2025-11', '2025-12', '2026-01', '2026-04', '2026-05', '2026-10'] },
      { kind: 'notice', notice: a },
      { kind: 'notice', notice: b },
    ]);
  });

  it('places the merged item after notices that came before the first under-logged one', () => {
    const a = n('emergency_not_set');
    expect(noticeTileItems([a, under('2026-02'), under('2026-01')])).toEqual([
      { kind: 'notice', notice: a },
      { kind: 'underLogged', months: ['2026-01', '2026-02'] },
    ]);
  });

  it('lists a duplicated month once', () => {
    expect(noticeTileItems([under('2026-01'), under('2026-01'), under('2025-12')])).toEqual([
      { kind: 'underLogged', months: ['2025-12', '2026-01'] },
    ]);
  });
});
