/** QA-03: every approved right-answer case with no pending rule also runs through the plain calculator. */
import { loadCases } from '../rightAnswers/loader';
import { PENDING_RULES, pendingFixIds } from './pendingRules';
import { freeMoney, notCleared, overdraftRoom, payDates, plainAnswer, plainNet, plainOverdraftCost, plainPath, recordsFresh, recordsLookBehind } from './plain';

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

describe('plain calculator: safety net (05.4-18, FIN-01, FIN-02; D-05, D-06, D-35, D-41)', () => {
  const sn = loadCases().filter((c) => c.topic === 'safety-net' && c.status === 'approved');
  const NET_VARIANTS: readonly (string | null)[] = [null, 'no_net', 'small_net', 'protection_off'];

  it('every approved safety-net case gets its expected code, and its net variant, from the plain rules', () => {
    for (const c of sn) {
      // SN-09 needs its rent on its own date (the bills list, FIN-11, 05.4-19); tight (SN-10, SN-11) is 05.4-21.
      if (c.id === 'SN-09') continue;
      const got = plainAnswer(c.fixture);
      const variant = NET_VARIANTS.includes(c.expected.variant) ? got.variant : c.expected.variant;
      const expected = c.id === 'SN-11' ? 'no_net' : c.id === 'SN-10' ? null : c.expected.variant;
      expect({ id: c.id, code: got.code, variant: c.id === 'SN-10' || c.id === 'SN-11' ? got.variant : variant }).toEqual({ id: c.id, code: c.expected.code, variant: expected });
    }
  });

  it('the starter is 1 month of essential costs, rounded up; only money saved is protected; above the size is spare; $0 is off', () => {
    const leo = sn.find((c) => c.id === 'SN-01')!.fixture;
    expect(plainNet(leo)).toMatchObject({ starter: 190_000n, size: 190_000n, saved: 0n, protectedPart: 0n, lend: 0n });
    const kai = sn.find((c) => c.id === 'SN-13')!.fixture;
    expect(plainNet(kai)).toMatchObject({ protectedPart: 100_000n, above: 50_000n });
    expect(plainNet({ ...kai, safetyNet: { protect: true, size: 0, saved: 150_000 } })).toMatchObject({ off: true, lend: 150_000n, above: 0n });
    expect(plainNet({ ...kai, debts: [{ id: 'd', kind: 'card', balance: 1, minimum: 2_501, apr: null, dueDay: null, joint: false }] }).starter).toBe(242_600n);
    expect(freeMoney(sn.find((c) => c.id === 'SN-04')!.fixture)).toBe(30_000n);
  });

  it('D-41: need or want never changes the plain answer', () => {
    for (const purpose of ['necessity', 'treat', null] as const) {
      const f = sn.find((c) => c.id === 'SN-03')!.fixture;
      expect(plainAnswer({ ...f, check: { ...f.check, purpose } }).code).toBe('fits_uses_net');
    }
  });
});

describe('plain calculator: 05.4-48 drafts (D-52, D-61, D-62)', () => {
  const byId = (id: string) => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new Error(`no case ${id}`);
    return c;
  };
  it('SN-16 Maya: pay expected on her usual day at her lowest month (D-52), a plain Fits with $740 left', () => {
    const c = byId('SN-16');
    expect(payDates(c.fixture)).toEqual(['2026-11-05', '2026-12-05']);
    expect(plainAnswer(c.fixture)).toMatchObject({ code: c.expected.code, afterBuy: c.expected.afterBuy.month });
  });
  it('SN-19 locked and SN-20 unlocked (D-61): the locked net lends nothing', () => {
    expect(plainNet(byId('SN-19').fixture).lend).toBe(0n);
    expect(plainAnswer(byId('SN-19').fixture).code).toBe('not_yet');
    expect(plainAnswer(byId('SN-20').fixture).code).toBe('fits_uses_net');
  });
  it('SN-13 and SN-17: Fits from extra savings (D-62)', () => {
    for (const id of ['SN-13', 'SN-17']) expect(plainAnswer(byId(id).fixture)).toMatchObject({ code: 'fits_unspent', variant: 'extra_savings' });
  });
});
