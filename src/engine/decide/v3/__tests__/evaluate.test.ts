import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { purchaseCashFlows } from '../judge/purchase';
import { evaluate, stricterOf, type Evaluation } from '../evaluate';
import type { Code, ConfidenceLevel, ReadyBy } from '../types';
import { personById, toV3Inputs } from './golden/adapter';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';

const mu = minorUnits;
const sam = (): ReturnType<typeof toV3Inputs> => toV3Inputs(personById('sam'));

describe('evaluate', () => {
  it('Sam, $150: fits_month and the untouched month figures', () => {
    const ev = evaluate(sam(), checkOnce(15000));
    expect(ev.result.code).toBe('fits_month');
    expect(ev.month.monthLeft).toBe(42500);
    expect(ev.purchase?.dayOne).toBe(15000);
    expect(ev.cash.kind).toBe('ok');
  });

  it('I16 deterministic, and the order of months never matters', () => {
    const inputs = sam();
    const a = evaluate(inputs, checkOnce(15000));
    const b = evaluate(inputs, checkOnce(15000));
    expect(b).toEqual(a);
    const shuffled = { ...inputs, months: [...inputs.months].reverse().map((m) => ({ ...m, lines: [...m.lines].reverse() })) };
    expect(evaluate(shuffled, checkOnce(15000))).toEqual(a);
  });

  it('a missing price still returns a Result: needs_input with no_price', () => {
    const ev = evaluate(sam(), checkOnce(0, { price: null }));
    expect(ev.result.code).toBe('needs_input');
    expect(ev.result.missing).toContain('no_price');
    expect(ev.purchase).toBeNull();
    expect(ev.planCard).toBeNull();
    expect(ev.quoted).toEqual({ kind: 'none' });
  });

  it('a first payment dated today is on the cash path once, not twice', () => {
    // 4 x 10,000 fortnightly, first today, no income, 40,000 in the bank: exactly enough only if today is counted once.
    const check = checkPlan(40000, {
      cadence: { unit: 'week', every: 2 },
      count: 4,
      apr: percent('0'),
      firstPayment: { kind: 'today' },
    });
    const ev = evaluate(inputsOf({ balance: mu(40000) }), check);
    expect(ev.purchase?.dayOne).toBe(10000);
    expect(ev.cash.kind).toBe('ok');
    if (ev.cash.kind === 'ok') expect(ev.cash.lowest.balance).toBe(0);
    const short = evaluate(inputsOf({ balance: mu(39999) }), check);
    expect(short.cash.kind).toBe('not_covered');
  });

  it('one share convention end to end: even 2, plan 24 x 10,000 full', () => {
    const check = checkPlan(
      240000,
      { cadence: { unit: 'month', every: 1 }, count: 24, apr: percent('0'), firstPayment: { kind: 'one_period' } },
      { share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } } }
    );
    const ev = evaluate(sam(), check);
    const p = ev.purchase;
    expect(p).not.toBeNull();
    if (p === null || p.schedule === null) throw new Error('expected a plan purchase');
    expect(p.schedule.payment).toBe(10000); // the lender amount (D-05)
    expect(Math.abs(p.monthly - 5000)).toBeLessThanOrEqual(1); // half, never a quarter
    const flows = purchaseCashFlows(p, '2026-10-03', 90);
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) expect(f.amount).toBe(5000);
    expect(ev.planCard?.monthlyEquivalent).toBe(10000);
  });

  it('every field of the Evaluation is JSON-serialisable', () => {
    const ev = evaluate(sam(), checkPlan(120000, { count: 12, apr: percent('9.9'), firstPayment: { kind: 'one_period' } }));
    expect(JSON.parse(JSON.stringify(ev))).toEqual(ev);
    expect(JSON.parse(JSON.stringify(ev.result))).toEqual(ev.result);
  });

  it('D-41: an ended series with endDate null counts as ended as of today', () => {
    const base = sam();
    const baseline = evaluate(base, checkOnce(15000));
    const ended = (endDate: string | null): ReturnType<typeof toV3Inputs> => ({
      ...base,
      series: base.series.map((s) => (s.id === 'sam-utils' ? v3Series({ ...s, amount: s.amount, status: 'ended', endDate }) : s)),
    });
    // ended with no end date behaves exactly like an end date the day before asOf (2026-10-03).
    const openEnded = evaluate(ended(null), checkOnce(15000));
    const dated = evaluate(ended('2026-10-02'), checkOnce(15000));
    expect(openEnded.month).toEqual(dated.month);
    expect(openEnded.result).toEqual(dated.result);
    expect(openEnded.month.monthLeft).not.toBe(baseline.month.monthLeft);
    // With the end date set before today the 30,000 bill stops being due: October has 30,000 more room.
    const stopped = evaluate(ended('2026-09-30'), checkOnce(15000));
    expect(stopped.month.monthLeft).toBe(42500 + 30000);
  });

  describe('logged pay is not landed again in the cash path (H-01, H-02, W4)', () => {
    const MONTHLY = { unit: 'month', every: 1 } as const;
    const payOn = (anchorDate: string) => v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate, amount: 400000 });
    const payLine = (date: string) => v3Line({ id: `p-${date}`, date, amount: 400000, role: 'income', seriesId: 'pay' });
    const buy = checkOnce(150000);

    it('H-01 pay due and logged on asOf is not added a second time', () => {
      const logged = evaluate(
        inputsOf({ asOf: '2026-10-03', balance: mu(100000), series: [payOn('2026-01-03')], months: [monthOf('2026-10', [payLine('2026-10-03')])] }),
        buy
      );
      expect(logged.cash.kind).toBe('not_covered');
      const unlogged = evaluate(inputsOf({ asOf: '2026-10-03', balance: mu(100000), series: [payOn('2026-01-03')] }), buy);
      expect(unlogged.cash.kind).toBe('ok');
    });

    it('H-01 pay received 2026-10-26 for a due date 2026-10-31 does not land on 10-31', () => {
      const ev = evaluate(
        inputsOf({ asOf: '2026-10-28', balance: mu(100000), series: [payOn('2026-01-31')], months: [monthOf('2026-10', [payLine('2026-10-26')])] }),
        buy
      );
      expect(ev.cash.kind).toBe('not_covered');
    });

    it('W4 pay due Sun 11-01 received Fri 10-30: not added on asOf 10-31 or on asOf 11-01', () => {
      const oct = monthOf('2026-10', [payLine('2026-10-30')]);
      const a = evaluate(inputsOf({ asOf: '2026-10-31', balance: mu(100000), series: [payOn('2026-01-01')], months: [oct] }), buy);
      expect(a.cash.kind).toBe('not_covered');
      const b = evaluate(
        inputsOf({ asOf: '2026-11-01', balance: mu(100000), series: [payOn('2026-01-01')], months: [oct, monthOf('2026-11', [])] }),
        buy
      );
      expect(b.cash.kind).toBe('not_covered');
    });

    it('M-02 a typed bill payment of the right amount takes the bill off the cash path (D-56)', () => {
      const rent = v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-10', amount: 80000 });
      const base = { asOf: '2026-10-08', balance: mu(215000), series: [rent] }; // three rents in 90 days: paying one leaves just enough
      const paid = evaluate(inputsOf({ ...base, months: [monthOf('2026-10', [v3Line({ id: 't', date: '2026-10-09', amount: 80000 })])] }), checkOnce(50000));
      const unpaid = evaluate(inputsOf(base), checkOnce(50000));
      expect(unpaid.cash.kind).not.toBe('ok');
      expect(paid.cash.kind).toBe('ok');
    });
  });
});

describe('D-42 the stricter of the as-given and the all-full reading', () => {
  const base = evaluate(sam(), checkOnce(15000));
  const fake = (code: Code, level: ConfidenceLevel, extra: { readyBy?: ReadyBy | null; reasons?: Evaluation['result']['reasons']; cReasons?: Evaluation['result']['confidence']['reasons'] } = {}): Evaluation => ({
    ...base,
    result: {
      ...base.result,
      code,
      readyBy: extra.readyBy ?? null,
      reasons: extra.reasons ?? [],
      confidence: { level, reasons: extra.cReasons ?? [] },
    },
  });

  it('D-42 no thin history month: evaluated once, deep-equal to a repeat', () => {
    expect(evaluate(sam(), checkOnce(15000))).toEqual(base);
    expect(base.result.reasons).not.toContain('thin_history_stricter');
  });

  it('D-42 a thin history month never gives a better code than reading it as full', () => {
    const s = sam();
    const rank = (c: Code): number => ['needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month'].indexOf(c);
    for (const price of [106, 15000, 42500, 300000, 5000000]) {
      const thin = { ...s, months: s.months.map((m) => (m.month < '2026-10' && m.month !== '2026-07' && m.month !== '2026-08' ? { ...m, full: false } : m)) };
      const full = { ...s, months: s.months.map((m) => ({ ...m, full: true })) };
      const a = evaluate(thin, checkOnce(price)).result;
      expect(rank(a.code)).toBeLessThanOrEqual(rank(evaluate(full, checkOnce(price)).result.code));
    }
  });

  it('D-42 the all-full reading is stricter: it wins, and the answer says so', () => {
    const out = stricterOf(fake('fits_month', 'firm', { reasons: ['rough_figures_used'] }), fake('fits_unspent', 'fair', { cReasons: ['few_months'] }));
    expect(out.result.code).toBe('fits_unspent');
    expect(out.result.reasons).toEqual(['rough_figures_used', 'thin_history_stricter']);
    expect(out.result.confidence).toEqual({ level: 'fair', reasons: ['few_months'] });
  });

  it('D-42 the as-given reading is stricter or equal: it wins, no thin_history_stricter, confidence is the lower', () => {
    const out = stricterOf(fake('fits_unspent', 'rough', { cReasons: ['under_logged'] }), fake('fits_month', 'firm', { cReasons: ['few_months'] }));
    expect(out.result.code).toBe('fits_unspent');
    expect(out.result.reasons).toEqual([]);
    expect(out.result.confidence).toEqual({ level: 'rough', reasons: ['few_months', 'under_logged'] });
    const same = stricterOf(fake('fits_month', 'fair'), fake('fits_month', 'firm'));
    expect(same.result.confidence.level).toBe('fair');
  });

  it('D-42 both not_yet: the later readyBy wins, null (never) last, ties keep the as-given reading', () => {
    const d = (date: string): ReadyBy => ({ kind: 'date', date });
    const m = (month: string): ReadyBy => ({ kind: 'month', month });
    expect(stricterOf(fake('not_yet', 'fair', { readyBy: d('2026-11-01') }), fake('not_yet', 'fair', { readyBy: m('2026-12') })).result.readyBy).toEqual(m('2026-12'));
    expect(stricterOf(fake('not_yet', 'fair', { readyBy: m('2026-12') }), fake('not_yet', 'fair', { readyBy: d('2026-11-01') })).result.readyBy).toEqual(m('2026-12'));
    expect(stricterOf(fake('not_yet', 'fair', { readyBy: d('2026-11-01') }), fake('not_yet', 'fair', { readyBy: null })).result.readyBy).toBeNull();
    const tie = stricterOf(fake('not_yet', 'fair', { readyBy: d('2026-11-01'), reasons: ['exceeds_range'] }), fake('not_yet', 'fair', { readyBy: d('2026-11-01') }));
    expect(tie.result.reasons).toEqual(['exceeds_range']);
  });
});

/** A seasonal earner: 14 full months, pay of 145,000 in May-Sep and 70,000 otherwise (the 05.1-44 corpus fixture, built here). */
function gigInputs(payAmount: number, anchorDate: string, over: Partial<ReturnType<typeof inputsOf>> = {}): ReturnType<typeof inputsOf> {
  const gigPay = v3Series({ id: 'gig', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate, amount: payAmount });
  const months = Array.from({ length: 14 }, (_, i) => {
    const t = 9 + i; // 2025-10 ...
    const m = `${2025 + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    const pay = ['05', '06', '07', '08', '09'].includes(m.slice(5)) ? 145_000 : 70_000;
    return monthOf(m, [
      v3Line({ id: `gp-${m}`, date: `${m}-01`, amount: pay, role: 'income', seriesId: 'gig' }),
      v3Line({ id: `ge-${m}`, date: `${m}-15`, amount: m.endsWith('-12') ? 50_000 : 30_000 }),
    ]);
  });
  return inputsOf({
    asOf: '2026-12-10',
    series: [gigPay],
    months: [...months, monthOf('2026-12', [], { full: false })],
    profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'seasonal' },
    ...over,
  });
}

describe('D-46 the pay cap is named', () => {
  it('D-46 a seasonal earner paid the high-season amount gets pay_capped_expected with the amount withheld', () => {
    const ev = evaluate(gigInputs(145_000, '2025-01-01'), checkOnce(10_000));
    const notice = ev.result.notices.find((n) => n.code === 'pay_capped_expected');
    // 2027-01-01, 02-01 and 03-01 each land 70,000 (the same month last year) of the 145,000 on record: 3 x 75,000 withheld.
    expect(notice?.values).toEqual({ capped: 225_000 });
    expect(ev.result.notices[ev.result.notices.length - 1]).toBe(notice);
  });

  it('D-46 pay at or under the expected income is not capped, and a steady earner never sees the notice', () => {
    expect(evaluate(gigInputs(70_000, '2025-01-01'), checkOnce(10_000)).result.notices.map((n) => n.code)).not.toContain('pay_capped_expected');
    expect(evaluate(sam(), checkOnce(15000)).result.notices.map((n) => n.code)).not.toContain('pay_capped_expected');
  });

  it('D-35 this month the cap is expected minus what has arrived, never below 0', () => {
    // A pay due 2026-12-20; December expected 70,000 (December last year).
    const open = evaluate(gigInputs(145_000, '2025-01-20'), checkOnce(10_000));
    expect(open.result.notices.find((n) => n.code === 'pay_capped_expected')?.values).toEqual({ capped: 225_000 }); // 3 x 75,000
    // 100,000 has already arrived this month, above the 70,000 expected: December may add nothing, so all 145,000 is withheld.
    const base = gigInputs(145_000, '2025-01-20');
    const arrived = {
      ...base,
      months: base.months.map((m) => (m.month === '2026-12' ? { ...m, lines: [v3Line({ id: 'got', date: '2026-12-02', amount: 100_000, role: 'income', seriesId: 'gig' })] } : m)),
    };
    const ev = evaluate(arrived, checkOnce(10_000));
    expect(ev.result.notices.find((n) => n.code === 'pay_capped_expected')?.values).toEqual({ capped: 295_000 }); // 145,000 + 2 x 75,000
  });
});

describe('D-35 cap without a current month of records', () => {
  it('D-35 the cap still applies when nothing is logged for the current month', () => {
    const base = gigInputs(145_000, '2025-01-20');
    const noCurrent = { ...base, months: base.months.filter((m) => m.month !== '2026-12') };
    const ev = evaluate(noCurrent, checkOnce(10_000));
    expect(ev.result.notices.find((n) => n.code === 'pay_capped_expected')?.values).toEqual({ capped: 225_000 });
  });
});

describe('D-63 an emergency purchase may count the emergency fund in the cash check', () => {
  const leo = (): ReturnType<typeof toV3Inputs> => toV3Inputs(personById('leo'));
  const laptop = (over: Partial<Parameters<typeof checkOnce>[1]> = {}): ReturnType<typeof checkOnce> =>
    checkOnce(70_000, {
      itemType: { kind: 'preset', value: 'electronics' },
      purpose: { kind: 'preset', value: 'for_work' },
      emergency: true,
      ...over,
    });

  it('D-63 (a) a Leo-like emergency purchase is emergency_use with the emergency_used fact', () => {
    const ev = evaluate(leo(), laptop());
    expect(ev.funds.spending).toBe(89_484); // the 300,000 fund sits in its own account
    expect(ev.cash.kind).toBe('ok'); // the path opens at 89,484 + 300,000
    expect(ev.result.code).toBe('emergency_use');
    expect(ev.result.facts.find((f) => f.code === 'emergency_used')?.values).toEqual({ used: 60_000, months: 5 });
  });

  it('D-63 (b) the same purchase not marked an emergency never sees the fund: not_yet', () => {
    const ev = evaluate(leo(), laptop({ emergency: false }));
    expect(ev.cash.kind).toBe('not_covered');
    expect(ev.result.code).toBe('not_yet');
  });

  it('D-63 (c) emergency-marked with a custom purpose keeps the fund locked: not_yet', () => {
    const ev = evaluate(
      { ...leo(), custom: { itemTypes: [], purposes: [{ id: 'mine' }], cadences: [], incomeKinds: [] } },
      laptop({ purpose: { kind: 'custom', id: 'mine' } })
    );
    expect(ev.cash.kind).toBe('not_covered');
    expect(ev.result.code).toBe('not_yet');
  });

  it('D-63 (c) emergency-marked with no purpose, or no fund at all, adds nothing', () => {
    expect(evaluate(leo(), laptop({ purpose: null })).cash.kind).toBe('not_covered');
    const noFund = evaluate({ ...leo(), emergency: null }, laptop());
    expect(noFund.funds.emergency).toBeNull();
    expect(noFund.cash.kind).toBe('not_covered');
  });

  it('D-63 (d) an unlinked fund (D-62) is subtracted from spending and added back once for an eligible purchase', () => {
    const base = leo();
    const emergency = base.emergency as NonNullable<typeof base.emergency>;
    // Every account is stated, but the fund sits in none of them: 389,484 everyday, fund 300,000 unlinked.
    const unlinked = {
      ...base,
      emergency: { ...emergency, accountId: null },
      accounts: [{ id: 'main', balance: minorUnits(389_484), use: { kind: 'everyday' as const } }],
    };
    const ev = evaluate(unlinked, laptop());
    expect(ev.funds.fundUnlinked).toBe(true);
    expect(ev.funds.spending).toBe(89_484);
    // 89,484 + 300,000 once, never 89,484 + 2 x 300,000: the same cash reading as the linked fund.
    expect(ev.cash).toEqual(evaluate(leo(), laptop()).cash);
    expect(ev.result.missing).toContain('account_use_question'); // D-62 asks which account holds the fund
    expect(evaluate(unlinked, laptop({ emergency: false })).cash.kind).toBe('not_covered');
  });
});
