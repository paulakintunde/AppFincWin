/** QA-03: every approved right-answer case with no pending rule also runs through the plain calculator. */
import { loadCases } from '../rightAnswers/loader';
import { PENDING_RULES, pendingFixIds } from './pendingRules';
import { notCleared, overdraftRoom, payDates, plainAnswer, plainOverdraftCost, plainPath, recordsFresh, recordsLookBehind } from './plain';

const PENDING_IDS = new Set(PENDING_RULES.flatMap((r) => r.fixId.split('/')).filter((id) => id !== 'FIN-09'));

describe('plain calculator vs the approved table', () => {
  const cases = loadCases().filter((c) => c.status === 'approved');
  const live = cases.filter((c) => {
    const pending = pendingFixIds(c.fixture).filter((id) => id !== 'FIN-09');
    return pending.length === 0 && !c.fixIds.some((id) => PENDING_IDS.has(id));
  });
  it(`checks ${live.length} approved cases`, () => {
    for (const c of live) expect({ id: c.id, code: plainAnswer(c.fixture).code }).toEqual({ id: c.id, code: c.expected.code });
  });
});

describe('plain calculator: records synced (QE-07, ENG-14)', () => {
  const lucy = loadCases().find((c) => c.id === 'QE-07')!;
  const f = lucy.fixture;
  it('QE-07 answers as a usual month from fresh records', () => {
    expect(recordsFresh(f)).toBe(true);
    expect(plainAnswer(f)).toEqual({ code: lucy.expected.code, variant: null, afterBuy: 50_000 });
  });
  it('older records, or a record already in the new month: the usual rules, and big purchases ask for records first', () => {
    const big = { ...f, check: { ...f.check, price: 150_000 } };
    expect(plainAnswer(big).code).not.toBe('needs_input');
    expect(plainAnswer({ ...big, recordsAsOf: '2026-11-27' }).code).toBe('needs_input');
    expect(plainAnswer({ ...big, recordsAsOf: null }).code).toBe('needs_input');
    expect(recordsFresh({ ...f, recordsAsOf: '2026-12-02' })).toBe(false);
    expect(recordsFresh({ ...f, asOf: '2026-12-08', recordsAsOf: '2026-12-07' })).toBe(false);
    expect(recordsFresh({ ...f, thisMonth: { ...f.thisMonth, everydaySoFar: 100 } })).toBe(false);
    expect(recordsLookBehind({ ...f, historyMonths: 0 })).toBe(false);
  });
});

describe('plain calculator: overdrafts (05.4-17, FIN-03; D-26..D-28, D-36..D-38)', () => {
  const od = loadCases().filter((c) => c.topic === 'overdraft' && c.status === 'approved');
  const costOf = (id: string, withPurchase: boolean): bigint => {
    const f = od.find((c) => c.id === id)!.fixture;
    const cost = withPurchase ? BigInt(f.check.price ?? 0) + BigInt(f.check.oneOffFees) : 0n;
    return plainOverdraftCost(plainPath(f, cost), f.accounts[0]!.overdraftRate!);
  };

  it('every approved overdraft case gets its expected code and variant from the plain rules', () => {
    for (const c of od) {
      const got = plainAnswer(c.fixture);
      expect({ id: c.id, code: got.code, variant: got.code === 'fits_uses_overdraft' ? got.variant : c.expected.variant }).toEqual({
        id: c.id,
        code: c.expected.code,
        variant: c.expected.variant,
      });
    }
  });

  it('the daily-sum cost matches the cases to the cent (OD-01, OD-03, OD-11, OD-12), with and without the purchase', () => {
    expect([costOf('OD-01', true), costOf('OD-01', false)]).toEqual([201n, 169n]);
    expect([costOf('OD-03', true), costOf('OD-03', false)]).toEqual([116n, 2n]);
    expect([costOf('OD-11', true), costOf('OD-11', false)]).toEqual([7_425n, 5_585n]);
    expect([costOf('OD-12', true), costOf('OD-12', false)]).toEqual([268n, 145n]);
  });

  it('only checking and current accounts used for everyday spending carry an overdraft; no limit set is 0 (OD-07, D-28)', () => {
    const hiro = od.find((c) => c.id === 'OD-07')!.fixture;
    expect(overdraftRoom(hiro)).toBe(0n);
    const priya = od.find((c) => c.id === 'OD-01')!.fixture;
    expect(overdraftRoom(priya)).toBe(50_000n);
    expect(overdraftRoom({ ...priya, accounts: priya.accounts.map((a) => ({ ...a, use: 'untouched' as const })) })).toBe(0n);
    // exactly at the limit is inside it; 1 cent past is Not yet (I-limit)
    expect(plainAnswer({ ...priya, accounts: priya.accounts.map((a) => ({ ...a, overdraftLimit: 46_000 })) }).code).toBe('fits_uses_overdraft');
    expect(plainAnswer({ ...priya, accounts: priya.accounts.map((a) => ({ ...a, overdraftLimit: 45_999 })) }).code).toBe('not_yet');
  });

  it('no pay inside the 90 days is never cleared; weekly pay lands every 7 days', () => {
    const tess = od.find((c) => c.id === 'OD-11')!.fixture;
    expect(notCleared({ ...tess, pay: { ...tess.pay, nextDate: '2027-06-01' } }, 20_000n)).toBe(true);
    expect(payDates({ ...tess, pay: { ...tess.pay, cadence: 'weekly' } }).slice(0, 3)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
    expect(payDates({ ...tess, pay: { ...tess.pay, cadence: 'fortnightly' } }).slice(0, 2)).toEqual(['2026-11-01', '2026-11-15']);
  });
});
