// BO-07 point 6 (household scope) contracts. Owner: Phase 8 plan 08-25, switched on here in place (same titles).
// Switching a todo on keeps the exact title. The frozen list lives in src/test/contracts/contractManifest.test.ts.
import { minorUnits } from '../../money/types';
import { splitLine } from '../../household/lineSplit';
import { myShareOfLine } from '../../household/myShare';
import { countsLineOf, mineAmountOf, type ScopeLine } from '../../household/countsForMeInput';
import { owedToMeTotal, pairBalances } from '../../household/balances';
import { countsForMe, countsForMeTotal } from '../countsForMe';
import type { CountsLine } from '../types';

const m = minorUnits;
const ME = 'me';
const SAM = 'sam';

function line(over: Partial<ScopeLine> = {}): ScopeLine {
  return {
    id: 'l1',
    createdBy: ME,
    isShared: false,
    amount: m(-6_000),
    amountHome: m(-6_000),
    householdAmount: null,
    householdCurrency: null,
    ...over,
  };
}
const shared = (over: Partial<ScopeLine> = {}): ScopeLine =>
  line({ isShared: true, householdAmount: m(-6_000), householdCurrency: 'USD', ...over });

function counted(lines: readonly ScopeLine[], splits: Record<string, { memberKey: string; share: number }[]>): number {
  const out: CountsLine[] = [];
  for (const l of lines) {
    const c = countsLineOf(l, (splits[l.id] ?? []).map((s) => ({ memberKey: s.memberKey, share: m(s.share) })), ME, 'USD');
    if (c !== null && 'line' in c) out.push(c.line);
  }
  return countsForMeTotal(out);
}

describe('BO-07 point 6: household scope (turned on by Phase 8, plan 08-25)', () => {
  it('a record is personal unless shared', () => {
    // my own line counts in full; the same line shared counts only my stored split
    expect(mineAmountOf(line(), [], ME, 'USD')).toEqual({ amountHome: -6_000 });
    const s = [
      { memberKey: ME, share: m(-2_000) },
      { memberKey: SAM, share: m(-4_000) },
    ];
    expect(mineAmountOf(shared(), s, ME, 'USD')).toEqual({ amountHome: -2_000 });
    // a personal line is never counted at a split, even if stray splits exist for it
    expect(mineAmountOf(line(), s, ME, 'USD')).toEqual({ amountHome: -6_000 });
  });

  it('my share of a shared line is its stored split, never recomputed from current weights', () => {
    // stored when the line was shared at 50/50
    const stored = [
      { memberKey: ME, share: m(-3_000) },
      { memberKey: SAM, share: m(-3_000) },
    ];
    // the household's weights have since moved to 80/20: a fresh split would give me -4,800
    const now = splitLine(
      m(-6_000),
      { kind: 'weight', weights: [80, 20] },
      [
        { key: ME, included: true, weight: 80 },
        { key: SAM, included: true, weight: 20 },
      ],
      0,
    );
    expect(now.ok && now.parts[0]).toBe(-4_800);
    expect(myShareOfLine(shared(), stored, ME)).toEqual({ amount: -3_000, source: 'stored' });
    expect(mineAmountOf(shared(), stored, ME, 'USD')).toEqual({ amountHome: -3_000 });
  });

  it("a partner's money counts only with that partner's opt-in (off by default)", () => {
    const partner: CountsLine = { id: 'p', amount: m(250_000), isShared: false, isMine: false };
    expect(countsForMe(partner)).toBe(0);
    expect(countsForMe({ ...partner, partnerOptIn: false })).toBe(0);
    expect(countsForMe({ ...partner, partnerOptIn: true })).toBe(250_000);
    // the 08-25 adapter never sets an opt-in (08.1 owns it), so a partner's personal line never reaches countsForMe at all
    expect(countsLineOf(line({ createdBy: SAM, amountHome: m(250_000) }), [], ME, 'USD')).toBeNull();
  });

  it("a partner's personal line never reaches my figures", () => {
    const mine = line({ id: 'a', amountHome: m(-1_000) });
    const partnerPersonal = line({ id: 'b', createdBy: SAM, amountHome: m(-90_000) });
    const partnerShared = shared({ id: 'c', createdBy: SAM });
    const total = counted([mine, partnerPersonal, partnerShared], {
      c: [
        { memberKey: ME, share: -2_500 },
        { memberKey: SAM, share: -3_500 },
      ],
    });
    expect(total).toBe(-3_500); // -1,000 mine + -2,500 my share; the partner's -90,000 is absent
    // ENG-25: what Sam owes me is its own figure, never added to spendable money
    const owed = owedToMeTotal(
      pairBalances(
        [
          {
            lineId: 'c',
            payerKey: ME,
            paidFromJoint: false,
            status: 'open',
            pendingSettlementId: null,
            shares: [
              { memberKey: ME, amount: m(2_500) },
              { memberKey: SAM, amount: m(3_500) },
            ],
          },
        ],
        ME,
      ),
    );
    expect(owed).toBe(3_500);
    expect(total).toBe(-3_500); // unchanged by what is owed
  });
});
