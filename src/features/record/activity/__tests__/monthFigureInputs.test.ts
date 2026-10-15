import { monthPosition, monthTotals } from '@/engine/activity';
import {
  isMonthEmpty,
  monthFigureInputs,
  monthPositionOf,
  paidOutText,
} from '@/features/record/activity/monthFigureInputs';

type Row = Parameters<typeof monthFigureInputs>[0]['rows'][number];

const row = (o: Partial<Row>): Row => ({
  status: 'paid',
  transfer_id: null,
  is_refund: false,
  original_amount: -1000,
  amountHome: -1000,
  ...o,
});

const rows: Row[] = [
  row({ original_amount: 50000, amountHome: 50000 }),
  row({ original_amount: -2000, amountHome: -2000 }),
  row({ status: 'pending', original_amount: -4000, amountHome: -4000 }),
  row({ status: 'pending', original_amount: 9000, amountHome: 9000 }),
  row({ transfer_id: 't1', original_amount: -7000, amountHome: -7000 }),
  row({ is_refund: true, original_amount: 500, amountHome: 500 }),
];
const projections = [{ amount: -3000, amountHome: -3000 }];

function totalsOf(r: Row[], p: typeof projections) {
  return monthTotals(
    r.map((x) => ({
      amountHome: x.amountHome,
      status: x.status,
      isTransfer: x.transfer_id !== null,
      isRefund: x.is_refund,
    })),
    p
  );
}

describe('monthFigureInputs', () => {
  it('maps rows and projections for the engine', () => {
    const m = monthFigureInputs({ rows, projections });
    expect(m.rows[4]).toEqual({
      status: 'paid',
      isTransfer: true,
      isRefund: false,
      originalAmount: -7000,
      amountHome: -7000,
    });
    expect(m.projections).toEqual([{ amount: -3000, amountHome: -3000 }]);
  });

  it('monthPositionOf equals the engine call on the mapped inputs', () => {
    const totals = totalsOf(rows, projections);
    const m = monthFigureInputs({ rows, projections });
    expect(monthPositionOf({ rows, projections, totals })).toEqual(
      monthPosition(totals, m.rows, m.projections)
    );
  });
});

describe('isMonthEmpty', () => {
  it('is true with nothing recorded and nothing expected', () => {
    const totals = totalsOf([], []);
    const pos = monthPositionOf({ rows: [], projections: [], totals });
    expect(isMonthEmpty(totals, pos)).toBe(true);
  });
  it('is false when only an expected bill exists', () => {
    const totals = totalsOf([], projections);
    const pos = monthPositionOf({ rows: [], projections, totals });
    expect(pos.unpaidCount).toBe(1);
    expect(isMonthEmpty(totals, pos)).toBe(false);
  });
  it('is false with a recorded row', () => {
    const r = [row({ original_amount: 50000, amountHome: 50000 })];
    const totals = totalsOf(r, []);
    expect(isMonthEmpty(totals, monthPositionOf({ rows: r, projections: [], totals }))).toBe(false);
  });
});

describe('paidOutText (review WR-04)', () => {
  const fmt = (n: number) => `£${(n / 100).toFixed(2)}`;
  it('prints a real outflow as a plain amount', () => {
    expect(paidOutText(-76500, fmt)).toBe('£765.00');
    expect(paidOutText(0, fmt)).toBe('£0.00');
  });
  it('keeps the plus on net refunds so they never read as money spent', () => {
    expect(paidOutText(5000, fmt)).toBe('+£50.00');
  });
});
