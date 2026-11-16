// BO-07 Phase 8 contract todos. Owners: 08-30 (settlements), 08.1 (income profile), 08-25 (visibility).
// Switching a todo on keeps the exact title. The frozen list lives in src/test/contracts/contractManifest.test.ts.
import { minorUnits } from '../../money/types';
import { monthTotals } from '../../activity/totals';
import { excludeSettlements, isSettlement } from '../../household/settlement';
import { countsForMe } from '../countsForMe';
import type { CountsLine } from '../types';

const settlementLine = (over: Partial<CountsLine> = {}): CountsLine => ({
  id: 's1',
  amount: minorUnits(-7_000),
  isShared: false,
  isMine: true,
  isSettlement: true,
  ...over,
});

describe('BO-07 Phase 8 contracts (settlements, income profile, visibility)', () => {
  it('settlements count as neither spending nor income in Activity totals', () => {
    const rows = [
      { amountHome: -7_000, status: 'paid' as const, isTransfer: false, isSettlement: true },
      { amountHome: 9_000, status: 'paid' as const, isTransfer: false, isSettlement: true },
      { amountHome: -2_000, status: 'pending' as const, isTransfer: false, isSettlement: true },
      { amountHome: -1_500, status: 'paid' as const, isTransfer: false },
      { amountHome: 4_000, status: 'paid' as const, isTransfer: false },
    ];
    const t = monthTotals(rows, []);
    expect(t.paidOut).toBe(-1_500);
    expect(t.paidIn).toBe(4_000);
    expect(t.net).toBe(2_500);
    expect(t.stillToCome).toBe(0);
    expect(t.count).toBe(2);
    expect(t.transferCount).toBe(0);
  });
  it('settlements count as neither spending nor income in the month picture', () => {
    // Engine half: a settlement line counts 0 for me whoever made it, and the one rule drops it before any month line is built.
    // The builder half (Decide's source rows carry isSettlement, the month picture is unchanged) is
    // src/features/decide/snapshot/v3/__tests__/buildInputs.settlement.test.ts.
    expect(countsForMe(settlementLine())).toBe(0);
    expect(countsForMe(settlementLine({ isMine: false, isShared: true }))).toBe(0);
    expect(countsForMe(settlementLine({ isSettlement: false }))).toBe(-7_000);
    const rows = [{ id: 'a', isSettlement: true }, { id: 'b', isSettlement: false }, { id: 'c' }];
    expect(excludeSettlements(rows).map((r) => r.id)).toEqual(['b', 'c']);
    expect(rows.filter(isSettlement)).toHaveLength(1);
  });
  test.todo("one income profile per member; a partner's pay never overwrites mine");
  test.todo('database rules gate reading; countsForMe gates counting; no screen adds its own filter');
});
