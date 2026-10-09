import fc from 'fast-check';
import { matchRefunds, REFUND_LOOKBACK_DAYS, type RefundImportRow, type RefundPurchase } from '../refundMatch';

const row = (o: Partial<RefundImportRow> = {}): RefundImportRow => ({
  index: 0, amount: 2999, currency: 'GBP', name: 'AMAZON MKTPLACE REFUND', localDate: '2026-10-05', isTransfer: false, ...o,
});
const purchase = (o: Partial<RefundPurchase> = {}): RefundPurchase => ({
  id: 'p1', amount: -2999, currency: 'GBP', name: 'Amazon Mktplace', localDate: '2026-09-20', categoryId: 'c1', isRefund: false, ...o,
});

describe('matchRefunds', () => {
  it('matches a refund to its earlier purchase', () => {
    expect(matchRefunds([row()], [purchase()], 'credit')).toEqual([
      { index: 0, purchaseId: 'p1', merchant: 'Amazon Mktplace', categoryId: 'c1' },
    ]);
    expect(matchRefunds([row()], [purchase()], 'checking')).toHaveLength(1);
  });
  it('rejects wrong account kind, sign, transfer, currency', () => {
    expect(matchRefunds([row()], [purchase()], 'savings')).toEqual([]);
    expect(matchRefunds([row({ amount: 0 })], [purchase()], 'credit')).toEqual([]);
    expect(matchRefunds([row({ amount: -5 })], [purchase()], 'credit')).toEqual([]);
    expect(matchRefunds([row({ isTransfer: true })], [purchase()], 'credit')).toEqual([]);
    expect(matchRefunds([row({ currency: 'USD' })], [purchase()], 'credit')).toEqual([]);
  });
  it('rejects bad purchases', () => {
    expect(matchRefunds([row()], [purchase({ isRefund: true })], 'credit')).toEqual([]);
    expect(matchRefunds([row()], [purchase({ amount: 100 })], 'credit')).toEqual([]);
    expect(matchRefunds([row()], [purchase({ name: null })], 'credit')).toEqual([]);
    expect(matchRefunds([row()], [purchase({ name: 'Tesco' })], 'credit')).toEqual([]);
  });
  it('enforces the date window', () => {
    expect(matchRefunds([row()], [purchase({ localDate: '2026-10-06' })], 'credit')).toEqual([]);
    expect(matchRefunds([row()], [purchase({ localDate: '2026-10-05' })], 'credit')).toHaveLength(1);
    expect(matchRefunds([row({ localDate: '2026-10-05' })], [purchase({ localDate: '2025-06-01' })], 'credit')).toEqual([]);
    expect(REFUND_LOOKBACK_DAYS).toBe(120);
  });
  it('is one-to-one, closer date wins, ties by id then index', () => {
    const rows = [row({ index: 0 }), row({ index: 1 })];
    const near = purchase({ id: 'b', localDate: '2026-10-01' });
    const far = purchase({ id: 'a', localDate: '2026-09-01' });
    expect(matchRefunds(rows, [far, near], 'credit').map((m) => [m.index, m.purchaseId])).toEqual([[0, 'b'], [1, 'a']]);
    const tie = [purchase({ id: 'z' }), purchase({ id: 'y' })];
    expect(matchRefunds([row()], tie, 'credit')[0]?.purchaseId).toBe('y');
    const amt = [purchase({ id: 'a', amount: -3500 }), purchase({ id: 'b', amount: -2999 })];
    expect(matchRefunds([row()], amt, 'credit')[0]?.purchaseId).toBe('b');
    expect(matchRefunds(rows, [purchase()], 'credit').map((m) => m.index)).toEqual([0]);
  });
  it('property: one-to-one and only positive rows', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5000, max: 5000 }), { maxLength: 6 }),
        fc.array(fc.integer({ min: 0, max: 130 }), { maxLength: 6 }),
        (amounts, ages) => {
          const rows = amounts.map((a, i) => row({ index: i, amount: a }));
          const ps = ages.map((d, i) =>
            purchase({ id: `p${i}`, localDate: new Date(Date.UTC(2026, 9, 5 - d)).toISOString().slice(0, 10) }));
          const out = matchRefunds(rows, ps, 'credit');
          expect(new Set(out.map((m) => m.index)).size).toBe(out.length);
          expect(new Set(out.map((m) => m.purchaseId)).size).toBe(out.length);
          for (const m of out) expect(amounts[m.index]).toBeGreaterThan(0);
        }
      )
    );
  });
});
