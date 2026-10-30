import fc from 'fast-check';
import { minorUnits } from '@/engine/money';
import { workedModel } from '../workedModel';
import { monthOf, SAM_PARTS } from './monthFixture';

jest.setTimeout(60000);
const mu = minorUnits;

const debt = (minimum: number) => ({ id: `d${minimum}`, minimum: mu(minimum) });
const bill = (id: string, confirmed: boolean, day = 5, status = 'live') => ({
  id,
  role: 'bill',
  confirmed,
  status,
  anchorDate: `2026-09-${String(day).padStart(2, '0')}`,
  amount: mu(1000),
});
const line = (role: string, amount: number, status = 'paid') => ({ role, amount: mu(amount), status });
const pm = (month: string, mark: string | null, lines: unknown[] = [], full = true) => ({ month, full, mark, lines });

function ev(parts: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    month: { ...monthOf(SAM_PARTS), month: '2026-10', day: 18, daysInMonth: 31, monthsUsed: [], notices: [], typicalLeft: null, ...parts, ...over },
  } as never;
}
const inp = (o: Record<string, unknown> = {}) => ({ debts: [], series: [], months: [], ...o }) as never;

const sum = (w: ReturnType<typeof workedModel>) => w.rows.reduce((a, r) => a + (r.deduct ? -Number(r.amount) : Number(r.amount)), 0);

describe('workedModel rows', () => {
  it('Sam: rows sum to monthLeft 42500, result row carries it', () => {
    const w = workedModel(
      ev(),
      inp({ debts: [debt(3000)], series: [{ id: 'p', role: 'pay', confirmed: true, status: 'live', anchorDate: '2026-10-01' }, bill('a', true), bill('b', true)] }),
    );
    expect(sum(w)).toBe(42500);
    expect(w.result).toEqual({ month: '2026-10', amount: 42500, negative: false });
    expect(w.rows.map((r) => Number(r.amount))).toEqual([400000, 200000, 3000, 7000, 120500, 27000]);
    expect(w.rows[1]).toMatchObject({ key: 'decide.v3.ui.worked.regular_other', params: { count: 2 } });
    expect(w.rows[5]).toMatchObject({ key: 'decide.v3.ui.worked.toCome_other', params: { count: 13 } });
    expect(w.rows[0].params).toEqual({ date: '2026-10-01' });
  });

  it('singular keys, no pay series, loans clamped to set-aside, negative result', () => {
    const w = workedModel(ev({}, { day: 30 }), inp({ debts: [debt(99999)], series: [bill('a', true)] }));
    expect(w.rows[1].key).toBe('decide.v3.ui.worked.regular_one');
    expect(w.rows[5].key).toBe('decide.v3.ui.worked.toCome_one');
    expect(w.rows[0].params).toEqual({ date: '' });
    expect(Number(w.rows[2].amount)).toBe(10000);
    expect(Number(w.rows[3].amount)).toBe(0);
    const neg = workedModel(ev({ moneyIn: mu(0), monthLeft: mu(-5) }), inp());
    expect(neg.result.negative).toBe(true);
  });

  it('property: rows always sum to monthLeft', () => {
    const n = fc.integer({ min: 0, max: 1_000_000 });
    fc.assert(
      fc.property(n, n, n, n, n, n, n, (moneyIn, billsPaid, billsDue, everydayLogged, erest, setAside, d) => {
        const w = workedModel(ev(monthOf({ moneyIn, billsPaid, billsDue, everydayLogged, erest, setAside })), inp({ debts: [debt(Math.min(d, setAside))] }));
        return sum(w) === Number(w.result.amount);
      }),
    );
  });
});

describe('workedModel six months', () => {
  it('states, per-month left from picture or lines, last six only, largest', () => {
    const months = [
      pm('2026-01', null),
      pm('2026-02', null),
      pm('2026-03', null),
      pm('2026-04', null),
      pm('2026-05', 'half'),
      pm('2026-06', null),
      pm('2026-07', null),
      pm('2026-08', null),
      pm('2026-09', null, [], false),
      pm('2026-10', null),
    ];
    const picture = { months: [{ month: '2026-03', left: mu(777) }] };
    const w = workedModel(
      ev(
        {},
        {
          monthsUsed: ['2026-03', '2026-04', '2026-07'],
          incomePicture: picture,
          notices: [{ code: 'month_looks_under_logged', values: { month: '2026-06' } }, { code: 'typical_short', values: {} }],
          typicalLeft: mu(500),
        },
      ),
      inp({ months }),
    );
    expect(w.six.map((s) => s.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    expect(w.six.map((s) => s.state)).toEqual(['normal', 'normal', 'half', 'half', 'normal', 'out']);
    expect(Number(w.six[0].left)).toBe(777);
    expect(w.basedOn).toBe(6);
    expect(w.typical).toBe(500);
    expect(w.largest).toEqual({ month: '2026-03', amount: 777 });
  });

  it('left from logged lines when no picture: paid in less paid out, pending and transfers ignored', () => {
    const lines = [
      line('income', 500000),
      line('other_in', 1),
      line('refund', 1),
      line('spending', 100000),
      line('debt_payment', 5000),
      line('saved_invested', 1),
      line('other_out', 1),
      line('own_transfer', 99999),
      line('spending', 99999, 'pending'),
    ];
    const w = workedModel(ev({}, { monthsUsed: ['2026-02'] }), inp({ months: [pm('2026-02', null, lines)] }));
    expect(Number(w.six[0].left)).toBe(500002 - 105002);
  });

  it('fewer than six -> basedOn n; fewer than 3 used -> no largest; ties keep earliest', () => {
    const w = workedModel(ev({}, { monthsUsed: ['2026-08', '2026-09'] }), inp({ months: [pm('2026-08', null), pm('2026-09', null)] }));
    expect(w.basedOn).toBe(2);
    expect(w.largest).toBeNull();
    const t = workedModel(
      ev({}, { monthsUsed: ['2026-07', '2026-08', '2026-09'] }),
      inp({ months: [pm('2026-07', null), pm('2026-08', null), pm('2026-09', null)] }),
    );
    expect(t.largest?.month).toBe('2026-07');
    const bigLater = workedModel(
      ev({}, { monthsUsed: ['2026-07', '2026-08', '2026-09'], incomePicture: { months: [{ month: '2026-09', left: mu(50) }] } }),
      inp({ months: [pm('2026-07', null), pm('2026-08', null), pm('2026-09', null)] }),
    );
    const unsorted = workedModel(ev(), inp({ months: [pm('2026-09', null), pm('2026-07', null), pm('2026-08', null)] }));
    expect(unsorted.six.map((s) => s.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(bigLater.largest).toEqual({ month: '2026-09', amount: 50 });
  });
});

describe('workedModel regular list', () => {
  it('names, day, confirmed flag; dismissed hidden; empty state', () => {
    const w = workedModel(
      ev(),
      inp({ series: [bill('rent', true, 3), bill('gym', false, 9), bill('x', true, 1, 'dismissed'), { id: 'p', role: 'pay', confirmed: true, status: 'live', anchorDate: '2026-10-25' }] }),
      { rent: 'Rent' },
    );
    expect(w.regular.map((r) => [r.name, r.day, r.confirmed])).toEqual([
      ['Rent', 3, true],
      ['gym', 9, false],
    ]);
    expect(w.regularEmpty).toBe(false);
    expect(workedModel(ev(), inp({ series: [bill('gym', false)] })).regularEmpty).toBe(true);
    expect(workedModel(ev(), inp()).regular).toEqual([]);
  });
});
