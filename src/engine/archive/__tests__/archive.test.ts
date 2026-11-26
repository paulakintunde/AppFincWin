import fc from 'fast-check';

import {
  archivedCount,
  canArchiveMonth,
  isArchivedMonth,
  monthKeyOf,
  visibleMonths,
  withoutArchivedRows,
} from '../archive';

describe('monthKeyOf', () => {
  it('takes the year and month from a local date', () => {
    expect(monthKeyOf('2026-03-14')).toBe('2026-03');
  });
  it('throws on a malformed date', () => {
    expect(() => monthKeyOf('2026-3-1')).toThrow();
  });
});

describe('isArchivedMonth / archivedCount', () => {
  it('reports membership and size', () => {
    const set = new Set(['2026-04']);
    expect(isArchivedMonth('2026-04', set)).toBe(true);
    expect(isArchivedMonth('2026-05', set)).toBe(false);
    expect(archivedCount(set)).toBe(1);
    expect(archivedCount(new Set())).toBe(0);
  });
});

describe('visibleMonths', () => {
  it('drops archived months and keeps order', () => {
    expect(visibleMonths(['2026-05', '2026-04', '2026-03'], new Set(['2026-04']))).toEqual([
      '2026-05',
      '2026-03',
    ]);
  });
  it('returns a new equal array for an empty set', () => {
    const input = ['2026-05', '2026-04'];
    const out = visibleMonths(input, new Set());
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
  it('property: no archived month, every other month kept', () => {
    const month = fc
      .tuple(fc.integer({ min: 2000, max: 2040 }), fc.integer({ min: 1, max: 12 }))
      .map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);
    fc.assert(
      fc.property(fc.array(month), fc.array(month), (months, arch) => {
        const set = new Set(arch);
        const out = visibleMonths(months, set);
        expect(out.every((m) => !set.has(m))).toBe(true);
        expect(out).toEqual(months.filter((m) => !set.has(m)));
      }),
    );
  });
});

describe('canArchiveMonth', () => {
  it('allows only months before the current one', () => {
    expect(canArchiveMonth('2026-10', '2026-11-22')).toBe(true);
    expect(canArchiveMonth('2026-11', '2026-11-22')).toBe(false);
    expect(canArchiveMonth('2026-12', '2026-11-22')).toBe(false);
  });
});

describe('withoutArchivedRows', () => {
  const rows = [
    { id: 1, local_date: '2026-05-02' },
    { id: 2, local_date: '2026-04-30' },
    { id: 3, local_date: '2026-03-01' },
    { id: 4, local_date: '2026-05-20' },
  ];
  it('drops archived-month rows, order preserved', () => {
    expect(withoutArchivedRows(rows, new Set(['2026-04'])).map((r) => r.id)).toEqual([1, 3, 4]);
  });
  it('property: empty set returns equal rows', () => {
    const date = fc
      .date({ min: new Date('2000-01-01'), max: new Date('2040-12-28'), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10));
    fc.assert(
      fc.property(fc.array(fc.record({ local_date: date, n: fc.integer() })), (rs) => {
        expect(withoutArchivedRows(rs, new Set())).toEqual(rs);
      }),
    );
  });
});
