// 08-30 (ARC-18, HH-08): settlement records are neither spending nor income. They are left out of every month total the way
// transfer legs are, but they are not transfers and do not add to transferCount. A row without the flag behaves as before.
import { monthTotals, type TotalsInput } from '../totals';

const row = (over: Partial<TotalsInput> = {}): TotalsInput => ({
  amountHome: -1000,
  status: 'paid',
  isTransfer: false,
  ...over,
});

describe('monthTotals settlement rows (ARC-18)', () => {
  it('leaves a paid settlement out of money out', () => {
    const t = monthTotals([row({ amountHome: -4000, isSettlement: true }), row({ amountHome: -1000 })], []);
    expect(t.paidOut).toBe(-1000);
    expect(t.net).toBe(-1000);
    expect(t.count).toBe(1);
  });

  it('leaves a paid settlement out of money in', () => {
    const t = monthTotals([row({ amountHome: 4000, isSettlement: true }), row({ amountHome: 2500 })], []);
    expect(t.paidIn).toBe(2500);
    expect(t.net).toBe(2500);
    expect(t.count).toBe(1);
  });

  it('leaves a pending settlement out of still to come and the pending count', () => {
    const t = monthTotals([row({ status: 'pending', amountHome: -4000, isSettlement: true })], []);
    expect(t.stillToCome).toBe(0);
    expect(t.pendingCount).toBe(0);
    expect(t.count).toBe(0);
  });

  it('does not count a settlement without a home amount as waiting for a rate', () => {
    const t = monthTotals([row({ amountHome: null, isSettlement: true })], []);
    expect(t.unconvertedCount).toBe(0);
  });

  it('does not count a settlement as a transfer leg', () => {
    const t = monthTotals([row({ isSettlement: true }), row({ isTransfer: true }), row({ amountHome: -300 })], []);
    expect(t.transferCount).toBe(1);
    expect(t.paidOut).toBe(-300);
    expect(t.count).toBe(1);
  });

  it('treats an omitted or false flag exactly as before', () => {
    const rows = [row({ amountHome: -700 }), row({ amountHome: 900, isSettlement: false })];
    const plain = monthTotals(rows.map((r) => ({ ...r, isSettlement: undefined })), []);
    expect(monthTotals(rows, [])).toEqual(plain);
    expect(plain.paidIn).toBe(900);
    expect(plain.paidOut).toBe(-700);
  });
});
