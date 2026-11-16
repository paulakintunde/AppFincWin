// 08-30 (ARC-18, 05.5 D-06): the same household with and without a settle-up gives the same month lines and the same
// "left after the month's plans" figure. Decide's source rows get isSettlement from the one engine rule (withSettlementFlag).
// The engine half of this contract is in src/engine/month/__tests__/bo07.phase8.contract.test.ts.
import { prepare } from '@/engine/decide/v3';
import { monthPicture } from '@/engine/month';
import { withSettlementFlag } from '@/data/queries/settlementFlag';
import { household, row as fxRow } from '../../__tests__/helpers/sourceFixtures';
import { buildInputs } from '../buildInputs';
import type { InputsSource } from '../buildInputsParts';

type Row = InputsSource['rows'][number] & { is_settlement?: boolean };

describe('buildInputs: settlement rows set from the database flag', () => {
  const hh = household();
  const settlements = [
    { ...fxRow({ id: 'settle-out', local_date: '2026-09-12', original_amount: -7_000 }), is_settlement: true },
    { ...fxRow({ id: 'settle-in', local_date: '2026-09-13', original_amount: 9_000 }), is_settlement: true },
  ];
  const plain = fxRow({ id: 'plain', local_date: '2026-09-14', original_amount: -2_000 });
  const withSettle = (): InputsSource => ({ ...hh, rows: withSettlementFlag<Row>([...hh.rows, plain, ...settlements]) });
  const without = (): InputsSource => ({ ...hh, rows: withSettlementFlag<Row>([...hh.rows, plain]) });

  it('flags only the rows the database marks as settlements', () => {
    const rows = withSettlementFlag<Row>([plain, ...settlements]);
    expect(rows.map((r) => (r as { isSettlement?: boolean }).isSettlement === true)).toEqual([false, true, true]);
  });

  it('hands the same array back when no row is a settlement, so the memoised source keeps its identity', () => {
    const rows: Row[] = [plain];
    expect(withSettlementFlag(rows)).toBe(rows);
  });

  it('adds nothing to any month line, paid in or out', () => {
    const lines = (s: InputsSource) => buildInputs(s, null).months.flatMap((m) => m.lines);
    expect(buildInputs(withSettle(), null).months).toEqual(buildInputs(without(), null).months);
    const ids = lines(withSettle()).map((l) => l.id);
    expect(ids).toContain('plain');
    expect(ids).not.toContain('settle-out');
    expect(ids).not.toContain('settle-in');
  });

  it('leaves the month picture figure unchanged (Home small line and Decide lead read it)', () => {
    const a = monthPicture(prepare(buildInputs(withSettle(), null)));
    const b = monthPicture(prepare(buildInputs(without(), null)));
    expect(a.leftAfterPlans).toBe(b.leftAfterPlans);
  });
});
