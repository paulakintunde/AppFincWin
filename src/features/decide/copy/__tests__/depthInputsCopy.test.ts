import { percent, ZERO_PERCENT } from '@/engine/decide';
import type { EstimateBias, ExpectedIncomeOutcome, IncomeAtRiskReport, InvestmentViews, PromoOutcome, StressOutcome } from '@/engine/decide';
import { i18n } from '@/i18n';
import { refText } from '../../check/refText';
import {
  changeRowCopy,
  estimateGapCopy,
  expectedIncomeCopy,
  goalCopy,
  investViewCopy,
  lateFeeCopy,
  lossOfValueCopy,
  promoCopy,
  runningPromptCopy,
  runwayCopy,
  stressCopy,
} from '../depthInputsCopy';
import { fmt, fmtCents, fmtDate } from './helpers/fixtures';
import { resolvesInEn } from './helpers/enKeys';
import type { CopyRef } from '../types';

const D = 'decide.depth.';
const resolves = (key: string): boolean => resolvesInEn(key) || resolvesInEn(`${key}_one`) || resolvesInEn(`${key}_other`);
const t = (key: string, params?: Record<string, string | number>): string => String((i18n.t as (k: string, o?: Record<string, string | number>) => unknown)(key, params));
const text = (r: CopyRef): string => refText(t, r);

// DCU-09: nothing a depth surface returns reads as advice; 'forecast' only inside the caption's own 'not a forecast'
const expectDeclarative = (refs: (CopyRef | null)[]): void => {
  for (const r of refs) {
    if (!r) continue;
    for (const k of [r.key, ...Object.values(r.keyParams ?? {})]) {
      expect(k.startsWith(D) || k.startsWith('decide.state.')).toBe(true);
      expect(resolves(k)).toBe(true);
    }
    const s = text(r);
    expect(s).not.toMatch(/\{\{|undefined|NaN/);
    expect(s).not.toMatch(/should|recommend/i);
    if (/forecast/i.test(s)) expect(s).toMatch(/not a forecast/);
  }
};

const promoOutcome = (over: Record<string, unknown> = {}): PromoOutcome =>
  ({
    promoMonths: 12,
    promoApr: ZERO_PERCENT,
    deferredInterest: false,
    paymentDuringPromo: 8_333,
    paymentAfterPromo: 9_000,
    clearsBeforePromoEnd: false,
    interestAfterPromo: 4_500,
    deferredInterestCharged: 0,
    deferredInterestCode: null,
    highestMonthlyPayment: 9_000,
    paymentToClearInPromo: 8_334,
    ...over,
  }) as unknown as PromoOutcome;

describe('promoCopy', () => {
  const promo = { aprText: '0', months: 12, deferredInterest: false };

  it('summarises the typed promotion and lists the results in order', () => {
    const c = promoCopy(promo, '19.9', promoOutcome(), 40_000, fmt, fmtCents);
    expect(c.summary).toEqual({ key: `${D}credit.promoSummary`, params: { rate: '0', months: 12, after: '19.9' } });
    expect(c.results.map((r) => r.key)).toEqual([
      `${D}credit.clearInPromo`,
      `${D}credit.afterPromo`,
      `${D}credit.leftWhenEnds`,
      `${D}credit.interestAfter`,
      `${D}credit.highestPayment`,
    ]);
    expect(c.results[0]?.params).toEqual({ amount: '$83.34' }); // cents
    expect(c.results[2]?.params).toEqual({ amount: '$40000' }); // a balance stays whole units
    expect(c.showDeferredToggle).toBe(true);
    expect(c.notice).toBeNull();
    expectDeclarative([c.summary, ...c.results]);
  });

  it('the promo shows what clears it inside the promotion', () => {
    const cleared = promoCopy(promo, '19.9', promoOutcome({ clearsBeforePromoEnd: true, paymentAfterPromo: null, interestAfterPromo: null }), null, fmt, fmtCents);
    expect(cleared.results.map((r) => r.key)).toEqual([`${D}credit.clearInPromo`, `${D}credit.clearsBefore`, `${D}credit.highestPayment`]);
    expect(cleared.results[0]).toEqual({ key: `${D}credit.clearInPromo`, params: { amount: '$83.34' } });
    // no balance at the end reported: the left-when-ends tile is left out
    const noBalance = promoCopy(promo, '19.9', promoOutcome(), null, fmt, fmtCents);
    expect(noBalance.results.map((r) => r.key)).not.toContain(`${D}credit.leftWhenEnds`);
  });

  it('deferred interest shows the charge only when the engine reports it', () => {
    const none = promoCopy(promo, '19.9', promoOutcome(), 0, fmt, fmtCents);
    expect(none.notice).toBeNull();
    expect(none.results.map((r) => r.key)).not.toContain(`${D}credit.deferredCharged`);
    const charged = promoCopy(
      { ...promo, deferredInterest: true },
      '19.9',
      promoOutcome({ deferredInterest: true, deferredInterestCharged: 21_000, deferredInterestCode: 'deferred_interest_charged' }),
      30_000,
      fmt,
      fmtCents,
    );
    expect(charged.results[charged.results.length - 1]).toEqual({ key: `${D}credit.deferredCharged`, params: { amount: '$21000' } });
    expect(charged.notice).toEqual({
      title: { key: `${D}credit.deferredNoticeTitle` },
      body: { key: `${D}credit.deferredNoticeBody`, params: { months: 12, amount: '$21000' } },
    });
    expect(text(charged.notice!.body)).toBe('If the balance isn’t cleared when the 12-month promotion ends, $21000 of interest is charged back.');
    expectDeclarative([charged.notice!.title, charged.notice!.body]);
  });

  it('shows the toggle only for a zero rate, and no summary until rate and months are typed', () => {
    expect(promoCopy({ ...promo, aprText: '0.0' }, '10', null, null, fmt, fmtCents).showDeferredToggle).toBe(true);
    expect(promoCopy({ ...promo, aprText: '3.5' }, '10', null, null, fmt, fmtCents).showDeferredToggle).toBe(false);
    expect(promoCopy({ ...promo, aprText: '' }, '10', null, null, fmt, fmtCents).showDeferredToggle).toBe(false);
    expect(promoCopy({ ...promo, aprText: ' , ' }, '10', null, null, fmt, fmtCents).showDeferredToggle).toBe(false);
    expect(promoCopy(null, '10', null, null, fmt, fmtCents)).toEqual({ summary: null, results: [], showDeferredToggle: false, notice: null });
    expect(promoCopy({ ...promo, months: null }, '10', null, null, fmt, fmtCents).summary).toBeNull();
    expect(promoCopy({ ...promo, aprText: '' }, '10', null, null, fmt, fmtCents).summary).toBeNull();
  });
});

describe('stressCopy / lateFeeCopy', () => {
  const stress = (offset: string, monthly: number, state: StressOutcome['state']): StressOutcome => ({ offset: percent(offset), monthly, state }) as unknown as StressOutcome;

  it('one line per outcome, payments in cents, with the state chip key', () => {
    const lines = stressCopy([stress('2', 12_345, 'fits'), stress('4', 13_000, 'no'), stress('7', 1, 'fits')], fmt, fmtCents);
    expect(lines).toEqual([
      { line: { key: `${D}credit.stress2`, params: { amount: '$123.45' } }, stateKey: 'decide.state.fits' },
      { line: { key: `${D}credit.stress4`, params: { amount: '$130.00' } }, stateKey: 'decide.state.no' },
    ]);
    expectDeclarative(lines.map((l) => l.line));
    expect(stressCopy([], fmt, fmtCents)).toEqual([]);
  });

  it('late fees read in cents, or nothing', () => {
    expect(lateFeeCopy(null, fmt, fmtCents)).toEqual([]);
    const lines = lateFeeCopy({ feePerLatePayment: 2_500, capTotal: null, oneLate: 2_500, twoLate: 5_000 } as never, fmt, fmtCents);
    expect(lines).toEqual([
      { key: `${D}credit.late1`, params: { amount: '$25.00' } },
      { key: `${D}credit.late2`, params: { amount: '$50.00' } },
    ]);
    expectDeclarative(lines);
  });
});

describe('investViewCopy', () => {
  const figure = (rate: string, projected: number | null, growth: number | null = projected === null ? null : projected - 1000) => ({
    rate: percent(rate),
    contributed: 1000,
    projected,
    growth,
    rangeCode: projected === null ? 'exceeds_range' : null,
  });
  const viewsOf = (over: Record<string, unknown> = {}): InvestmentViews => {
    const rates = [
      { rate: percent('0'), userEntered: false, label: 'held_not_grown' },
      { rate: percent('5'), userEntered: true, label: 'projection_at_entered_rate' },
    ];
    return {
      horizonMonths: 24,
      horizonSource: 'plan_term',
      rates,
      holdingFee: ZERO_PERCENT,
      netRates: rates.map((r) => ({ rate: r.rate, netRateScaled: r.rate })),
      priceInvested: { lump: 100_000, byRate: [figure('0', 100_000), figure('5', 110_000)] },
      paymentsInvested: { firstMonthPayment: 4_000, paymentMonths: 24, monthlyRunning: 500, byRate: [figure('0', 108_000), figure('5', 112_000)] },
      pauseImpact: { pausedMonthly: 2_000, byRate: [figure('0', 48_000), figure('5', 50_000)] },
      netWorth: [
        { rate: percent('0'), withoutPurchase: [0, 1, 2, 3], withPurchase: [0, 1, 2, 3], rangeCode: null },
        { rate: percent('5'), withoutPurchase: [0, 1, 2, 3], withPurchase: [0, 1, 2, 3], rangeCode: null },
      ],
      ...over,
    } as unknown as InvestmentViews;
  };
  // netWorth is indexed by month; build a full-length path so index = horizonMonths resolves
  const path = (end: number | null) => Array.from({ length: 25 }, (_v, m) => (m === 24 ? end : m));

  it('labels each rate and captions every view with no fee', () => {
    const c = investViewCopy(viewsOf({ netWorth: [{ rate: percent('0'), withoutPurchase: path(5), withPurchase: path(4), rangeCode: null }] }), fmt);
    expect(c.price.rows.map((r) => r.label)).toEqual([{ key: `${D}invest.zero` }, { key: `${D}invest.rateChip`, params: { rate: '5' } }]);
    expect(c.price.rows.map((r) => r.caption.key)).toEqual([`${D}invest.captionZero`, `${D}invest.caption`]);
    expect(c.price.rows[1]?.figure).toEqual({ key: `${D}invest.priceLine`, params: { amount: '$100000', months: 24, value: '$110000' } });
    expect(c.payments.rows[0]?.figure).toEqual({ key: `${D}invest.paymentsLine`, params: { amount: '$4500', months: 24, value: '$108000' } });
    expect(c.pause.rows[1]?.figure).toEqual({ key: `${D}invest.pauseLine`, params: { amount: '$2000', months: 24, value: '$49000' } }); // growth, not the projected total
    expect(c.pause.none).toBeNull();
    expect(c.netWorth.rows[0]?.alt).toEqual({ key: `${D}invest.netWorthAlt`, params: { months: 24, with: '$4', without: '$5', rate: '0' } });
    expect(text(c.price.rows[1]!.caption)).toBe('A projection at the rate you entered, not a forecast.');
    const all = [c.price, c.payments, c.pause].flatMap((s) => s.rows.flatMap((r) => [r.label, r.figure, r.caption]));
    expectDeclarative([c.price.title, c.payments.title, c.pause.title, c.netWorth.title, ...all, c.netWorth.rows[0]!.alt, c.netWorth.rows[0]!.caption]);
  });

  it('a pause of nothing says so', () => {
    const c = investViewCopy(viewsOf({ pauseImpact: null }), fmt);
    expect(c.pause.rows).toEqual([]);
    expect(c.pause.none).toEqual({ key: `${D}invest.pauseNone` });
  });

  it('an out-of-range projection reads too large', () => {
    const c = investViewCopy(
      viewsOf({
        priceInvested: { lump: 100_000, byRate: [figure('0', 100_000), figure('5', null)] },
        pauseImpact: { pausedMonthly: 2_000, byRate: [figure('0', 48_000), figure('5', null)] },
        netWorth: [{ rate: percent('5'), withoutPurchase: path(null), withPurchase: path(1), rangeCode: 'exceeds_range' }],
      }),
      fmt,
    );
    expect(c.price.rows[1]?.figure).toEqual({ key: `${D}invest.tooLarge` });
    expect(c.pause.rows[1]?.figure).toEqual({ key: `${D}invest.tooLarge` });
    expect(c.price.rows[0]?.figure.key).toBe(`${D}invest.priceLine`);
    expect(c.netWorth.rows[0]?.alt).toEqual({ key: `${D}invest.netWorthAltTooLarge`, params: { months: 24, rate: '5' } });
    // a null end point without a range code still never prints a figure
    const stray = investViewCopy(viewsOf({ netWorth: [{ rate: percent('5'), withoutPurchase: path(null), withPurchase: path(1), rangeCode: null }] }), fmt);
    expect(stray.netWorth.rows[0]?.alt.key).toBe(`${D}invest.netWorthAltTooLarge`);
    expectDeclarative([c.price.rows[1]!.figure, c.netWorth.rows[0]!.alt]);
  });

  it('a holding fee labels the net rate and the fee caption', () => {
    const rates = [
      { rate: percent('0'), userEntered: false, label: 'held_not_grown' },
      { rate: percent('5'), userEntered: true, label: 'projection_at_entered_rate' },
    ];
    const scaled = (n: number) => BigInt(n) * 10n ** 10n;
    const c = investViewCopy(
      viewsOf({
        holdingFee: percent('1'),
        netRates: [
          { rate: rates[0]!.rate, netRateScaled: scaled(-1) },
          { rate: rates[1]!.rate, netRateScaled: scaled(4) },
        ],
      }),
      fmt,
    );
    expect(c.price.rows.map((r) => text(r.label))).toEqual(['0% a year, −1% after fees', '5% a year, 4% after fees']);
    expect(c.price.rows[0]?.caption).toEqual({ key: `${D}invest.captionZeroFee`, params: { fee: '1' } });
    expect(c.price.rows[1]?.caption).toEqual({ key: `${D}invest.captionFee`, params: { fee: '1' } });
    expect(text(c.price.rows[1]!.caption)).toBe('A projection at the rate you entered less the 1% fee, not a forecast.');
    expect(text(c.price.rows[0]!.caption)).toBe('At 0% the money is only held, and the 1% fee comes off it.');
    expectDeclarative([...c.price.rows.flatMap((r) => [r.label, r.caption]), ...c.netWorth.rows.map((r) => r.label)]);
  });

  it('accepts a custom rate label', () => {
    const c = investViewCopy(viewsOf(), fmt, () => 'R');
    expect(c.price.rows[1]?.label.params).toEqual({ rate: 'R' });
  });
});

describe('expectedIncomeCopy', () => {
  const outcome = (months: number | null): ExpectedIncomeOutcome =>
    ({ monthlyAmount: 30_000, likelihood: 'likely', startMonth: '2026-12', assessment: { state: 'fits' }, payback: { months, totalCost: 1, extraIncome: 1, horizonMonths: 36 } }) as unknown as ExpectedIncomeOutcome;

  it('reads the payback, or that it does not pay for itself within the horizon', () => {
    expect(expectedIncomeCopy(null, fmt)).toBeNull();
    const paid = expectedIncomeCopy(outcome(14), fmt)!;
    expect(paid).toEqual({
      key: `${D}income.line`,
      params: { amount: '$30000', months: 14 },
      keyParams: { likelihood: `${D}income.likelihood.likely`, state: `${D}income.state.fits` },
    });
    expect(text(paid)).toBe('With the expected $30000 a month (likely): fits, pays for itself in 14 months.');
    const never = expectedIncomeCopy(outcome(null), fmt)!;
    expect(never.key).toBe(`${D}income.lineNever`);
    expect(never.params).toEqual({ amount: '$30000', months: 36 });
    expectDeclarative([paid, never]);
  });
});

describe('runwayCopy', () => {
  const report = (over: Record<string, unknown>): IncomeAtRiskReport =>
    ({
      runwayWith: 5,
      runwayWithout: 8,
      runwayLost: 3,
      setbacks: [
        { code: 'job_loss', paymentsMet: true },
        { code: 'income_drop', paymentsMet: false },
      ],
      ...over,
    }) as unknown as IncomeAtRiskReport;

  it('states the runway lost and each setback', () => {
    const c = runwayCopy(report({}));
    expect(c.summary).toEqual({ key: `${D}runway.summary`, params: { months: 5, lost: 3 } });
    expect(c.lostLine).toEqual({ key: `${D}runway.lost`, params: { months: 3 } });
    expect(c.perSetback).toEqual([
      { code: 'job_loss', line: { key: `${D}runway.met` } },
      { code: 'income_drop', line: { key: `${D}runway.notMet` } },
    ]);
    expectDeclarative([c.summary, c.lostLine, ...c.perSetback.map((s) => s.line)]);
  });

  it('says nothing about runway when none is lost', () => {
    for (const lost of [0, null]) {
      const c = runwayCopy(report({ runwayLost: lost }));
      expect(c.summary).toBeNull();
      expect(c.lostLine).toBeNull();
    }
    expect(runwayCopy(report({ runwayWith: null })).summary).toBeNull();
  });
});

describe('running costs', () => {
  it('prompts: only loss of value is non-cash', () => {
    expect(runningPromptCopy('fuel')).toEqual({ label: { key: `${D}running.fuel` }, note: null, entry: 'cash' });
    expect(runningPromptCopy('loss_of_value')).toEqual({ label: { key: `${D}running.loss_of_value` }, note: { key: `${D}running.notCash` }, entry: 'loss_of_value' });
    for (const c of ['insurance', 'fuel', 'maintenance', 'registration', 'loss_of_value'] as const) expectDeclarative([runningPromptCopy(c).label]);
  });

  it('loss of value states its monthly figure as non-cash', () => {
    const typed = lossOfValueCopy({ kind: 'percent_per_year', percentText: '15' }, 18_125, fmt);
    expect(typed.about).toEqual({ key: `${D}running.lossAbout`, params: { amount: '$18125' } });
    expect(typed.placeholder).toEqual({ key: `${D}running.lossPercentPlaceholder` });
    expect(typed.modes).toEqual([{ key: `${D}running.lossMonth` }, { key: `${D}running.lossPercent` }]);
    expect(typed.note).toEqual({ key: `${D}running.notCash` });
    expect(text(typed.about!)).toBe('About $18125 a month. Shown here, not counted in your month.');
    const amount = lossOfValueCopy({ kind: 'amount', monthly: 5_000 }, 5_000, fmt);
    expect(amount.placeholder).toEqual({ key: `${D}running.addAmount` });
    expect(lossOfValueCopy(null, 18_125, fmt).about).toBeNull();
    expect(lossOfValueCopy(null, null, fmt).placeholder.key).toBe(`${D}running.addAmount`);
    expect(lossOfValueCopy({ kind: 'amount', monthly: 0 }, 0, fmt).about).toBeNull();
    expect(lossOfValueCopy({ kind: 'amount', monthly: 1 }, null, fmt).about).toBeNull();
    expectDeclarative([typed.about, typed.note, ...typed.modes, typed.placeholder]);
  });
});

describe('estimateGapCopy', () => {
  const bias = (bp: number | null, figure: EstimateBias['figure'] = 'running_costs'): EstimateBias => ({ figure, decisionsUsed: 4, biasBasisPoints: bp }) as EstimateBias;

  it('rounds basis points half-up to a whole percent', () => {
    expect(estimateGapCopy(bias(1_250))?.params).toEqual({ pct: 13 }); // 12.5% -> 13
    expect(estimateGapCopy(bias(1_249))?.params).toEqual({ pct: 12 });
    expect(estimateGapCopy(bias(50))?.params).toEqual({ pct: 1 }); // 0.5% -> 1
    expect(estimateGapCopy(bias(-1_250))?.params).toEqual({ pct: 13 });
  });

  it('is absent at null and when the gap rounds to nothing', () => {
    expect(estimateGapCopy(bias(null))).toBeNull();
    expect(estimateGapCopy(bias(49))).toBeNull();
    expect(estimateGapCopy(bias(0))).toBeNull();
    expect(estimateGapCopy(bias(-49))).toBeNull();
  });

  it('names the figure and the direction', () => {
    expect(estimateGapCopy(bias(800))).toEqual({ key: `${D}estimateGap.running`, params: { pct: 8 }, keyParams: { direction: `${D}estimateGap.higher` } });
    expect(estimateGapCopy(bias(-800, 'monthly_payment'))).toEqual({ key: `${D}estimateGap.payment`, params: { pct: 8 }, keyParams: { direction: `${D}estimateGap.lower` } });
    const day = estimateGapCopy(bias(300, 'day_one'))!;
    expect(day.key).toBe(`${D}estimateGap.dayOne`);
    expect(text(day)).toBe('Your day-one costs have come in about 3% higher than estimated.');
    expectDeclarative([day, estimateGapCopy(bias(800))]);
  });
});

describe('goalCopy / changeRowCopy', () => {
  it('goal caption, preview and written line, with and without a date', () => {
    const dated = goalCopy({ target: 500_000, monthly_amount: 50_000, ready_by: '2027-06-01' }, 120_000, fmt, fmtDate);
    expect(dated.caption).toEqual({ key: `${D}goal.caption`, params: { saved: '$120000', target: '$500000' } });
    expect(dated.preview).toEqual({ key: `${D}goal.preview`, params: { target: '$500000', amount: '$50000', date: 'on 2027-06-01' } });
    expect(dated.written.key).toBe(`${D}goal.written`);
    const open = goalCopy({ target: 500_000, monthly_amount: 50_000, ready_by: null }, null, fmt, fmtDate);
    expect(open.caption).toEqual({ key: `${D}goal.waitingRate` });
    expect(open.preview).toEqual({ key: `${D}goal.previewNoDate`, params: { target: '$500000', amount: '$50000' } });
    expect(open.written.key).toBe(`${D}goal.writtenNoDate`);
    expect(goalCopy({ target: null, monthly_amount: null, ready_by: null }, 0, fmt, fmtDate).preview.params).toEqual({ target: '$0', amount: '$0' });
    expectDeclarative([dated.caption, dated.preview, dated.written, open.caption, open.preview, open.written]);
  });

  it('change rows carry a sign, the name or a fallback, and an optional end', () => {
    const month = (m: string): string => `M:${m}`;
    const up = changeRowCopy({ kind: 'income', name: 'Raise', monthly_amount: 25_000, start_month: '2027-01', end_month: null }, fmt, month);
    expect(up).toEqual({ name: 'Raise', from: { key: `${D}changes.rowFrom`, params: { sign: '+', amount: '$25000', month: 'M:2027-01' } }, until: null });
    const down = changeRowCopy({ kind: 'spending', name: '  ', monthly_amount: -40_000, start_month: '2027-02', end_month: '2027-08' }, fmt, month);
    expect(down.name).toEqual({ key: `${D}changes.unnamedSpending` });
    expect(down.from.params).toEqual({ sign: '−', amount: '$40000', month: 'M:2027-02' });
    expect(down.until).toEqual({ key: `${D}changes.rowUntil`, params: { month: 'M:2027-08' } });
    expect(changeRowCopy({ kind: 'income', name: null, monthly_amount: 1, start_month: '2027-02', end_month: null }, fmt, month).name).toEqual({ key: `${D}changes.unnamedIncome` });
    expectDeclarative([up.from, down.from, down.until]);
  });
});
