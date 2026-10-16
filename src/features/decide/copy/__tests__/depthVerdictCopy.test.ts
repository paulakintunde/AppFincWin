import type { CashPathReport, Confidence, Decision, LineMargin } from '@/engine/decide';
import {
  basisDetailItems,
  cashPathCopy,
  cashTightFactCopy,
  combinedLine,
  confidenceCopy,
  confidenceReasons,
  conversionBasisCopy,
  cushionCopy,
  edgeChipA11y,
  edgeOn,
  marginText,
  verdictLineOne,
  worstMonthLine,
} from '../depthVerdictCopy';
import { fmt, fmtDate } from './helpers/fixtures';
import { resolvesInEn } from './helpers/enKeys';
import type { CopyRef } from '../types';

const monthName = (m: string): string => `M:${m}`;
const D = 'decide.depth.';

// plural bases resolve through _one / _other
const resolves = (key: string): boolean => resolvesInEn(key) || resolvesInEn(`${key}_one`) || resolvesInEn(`${key}_other`);
const allKeys = (refs: (CopyRef | null)[]): string[] => refs.flatMap((r) => (r ? [r.key, ...Object.values(r.keyParams ?? {})] : []));
const expectInDepth = (refs: (CopyRef | null)[]): void => {
  for (const k of allKeys(refs)) {
    expect(k.startsWith(D)).toBe(true);
    expect(resolves(k)).toBe(true);
  }
};

const applied = { index: 0, status: 'applied', reasons: [], mineDayOne: 0, mineMonthly: 0 };
const missing = { ...applied, index: 1, status: 'missing' };
const verdictWith = (over: Record<string, unknown> = {}) => ({
  state: 'fits',
  cashPath: { status: 'unavailable', code: 'cash_path_unavailable' },
  basisCodes: [],
  context: { money: { oneOffsExcluded: { count: 0 }, steadiness: 'steady' }, limits: { reserveHalfMonths: 6 } },
  ...over,
});
const decisionOf = (over: Record<string, unknown> = {}): Decision =>
  ({
    verdict: verdictWith(),
    standalone: null,
    combinedDiffers: false,
    stacked: [],
    worstMonth: null,
    margins: [],
    stress: [],
    withExpectedIncome: null,
    ...over,
  }) as unknown as Decision;

const margin = (line: LineMargin['line'], m: number, flag: LineMargin['flag'] = null): LineMargin =>
  ({ line, margin: m, threshold: 0, base: 0, flag }) as unknown as LineMargin;

const worst = (over: Record<string, unknown> = {}) => ({ month: '2027-03', offset: 5, leftAfter: -5000, leftAfterNow: 1000, shortfall: 5000, differsFromNow: true, ...over });

describe('combinedLine / worstMonthLine / verdictLineOne', () => {
  it('combined line counts applied stacked checks only', () => {
    const d = decisionOf({ combinedDiffers: true, standalone: { state: 'fits' }, stacked: [applied, missing, { ...applied, index: 2 }] });
    expect(combinedLine(d)).toEqual({ key: `${D}combined.differs`, params: { count: 2 } });
    const adj = decisionOf({ combinedDiffers: true, standalone: { state: 'adjust' }, stacked: [applied] });
    expect(combinedLine(adj)).toEqual({ key: `${D}combined.differsFromAdjust`, params: { count: 1 } });
    expect(combinedLine(decisionOf())).toBeNull();
    expect(combinedLine(decisionOf({ combinedDiffers: true, standalone: null }))).toBeNull();
  });

  it('worst month line needs a different, short month', () => {
    expect(worstMonthLine(decisionOf({ worstMonth: worst() }), fmt, monthName)).toEqual({ key: `${D}changes.worstMonth`, params: { month: 'M:2027-03', amount: '$5000' } });
    expect(worstMonthLine(decisionOf({ worstMonth: worst({ differsFromNow: false }) }), fmt, monthName)).toBeNull();
    expect(worstMonthLine(decisionOf({ worstMonth: worst({ shortfall: 0 }) }), fmt, monthName)).toBeNull();
    expect(worstMonthLine(decisionOf(), fmt, monthName)).toBeNull();
  });

  it('the combined line wins line one', () => {
    const both = decisionOf({ combinedDiffers: true, standalone: { state: 'fits' }, stacked: [applied], worstMonth: worst() });
    expect(verdictLineOne(both, fmt, monthName)?.key).toBe(`${D}combined.differs`);
    expect(verdictLineOne(decisionOf({ worstMonth: worst() }), fmt, monthName)?.key).toBe(`${D}changes.worstMonth`);
    expect(verdictLineOne(decisionOf(), fmt, monthName)).toBeNull();
  });
});

describe('basisDetailItems', () => {
  const base = { conversions: [], cardsWithoutMinimum: 0, fmt, monthName, formatDate: fmtDate };

  it('is empty when nothing applies', () => {
    expect(basisDetailItems({ ...base, decision: decisionOf() })).toEqual([]);
  });

  it('puts the worst month in the row only when the combined line holds line one', () => {
    const combined = decisionOf({ combinedDiffers: true, standalone: { state: 'fits' }, stacked: [applied], worstMonth: worst() });
    expect(basisDetailItems({ ...base, decision: combined }).map((r) => r.key)).toEqual([`${D}changes.worstMonth`]);
    expect(basisDetailItems({ ...base, decision: decisionOf({ worstMonth: worst() }) })).toEqual([]);
  });

  it('orders worst month, one-offs, conversion, cash path, then the card minimum', () => {
    const decision = decisionOf({
      combinedDiffers: true,
      standalone: { state: 'fits' },
      stacked: [applied],
      worstMonth: worst(),
      verdict: verdictWith({
        basisCodes: ['cash_path_unavailable', 'one_offs_excluded'],
        context: { money: { oneOffsExcluded: { count: 3 }, steadiness: 'steady' }, limits: { reserveHalfMonths: 6 } },
      }),
    });
    const items = basisDetailItems({ ...base, decision, conversions: [{ currency: 'EUR', rateText: '1.0850000000', rateDate: '2026-10-01' }], cardsWithoutMinimum: 1 });
    expect(items.map((r) => r.key)).toEqual([
      `${D}changes.worstMonth`,
      `${D}oneOff.basis`,
      `${D}currency.basis`,
      `${D}cashPath.basisUnavailable`,
      `${D}cardMin.basis`,
    ]);
    expect(items[1]?.params).toEqual({ count: 3 });
    expect(items[2]?.params).toEqual({ currency: 'EUR', rate: '1.09', date: 'on 2026-10-01' });
    expectInDepth(items);
  });

  it('uses four decimals for a rate below one and the earliest date for several currencies', () => {
    const one = basisDetailItems({ ...base, decision: decisionOf(), conversions: [{ currency: 'JPY', rateText: '0.0067000000', rateDate: '2026-10-02' }] });
    expect(one[0]?.params?.rate).toBe('0.0067');
    const many = basisDetailItems({
      ...base,
      decision: decisionOf(),
      conversions: [
        { currency: 'EUR', rateText: '1.0850000000', rateDate: '2026-10-03' },
        { currency: 'GBP', rateText: '1.3000000000', rateDate: '2026-10-01' },
      ],
    });
    expect(many).toEqual([{ key: `${D}currency.basisMany`, params: { currencies: 'EUR, GBP', date: 'on 2026-10-01' } }]);
  });

  it('a missing verdict adds no engine basis items', () => {
    const decision = decisionOf({ verdict: { state: 'missing', reasons: [] } });
    expect(basisDetailItems({ ...base, decision })).toEqual([]);
  });

  it('a card without a minimum is a basis item', () => {
    const items = basisDetailItems({ ...base, decision: decisionOf(), cardsWithoutMinimum: 2 });
    expect(items).toEqual([{ key: `${D}cardMin.basis` }]);
  });
});

describe('cushionCopy', () => {
  const ctx = (halves: number | null, steadiness: 'steady' | 'variable' | 'volatile' | 'insufficient') => ({ limits: { reserveHalfMonths: halves }, money: { steadiness } });

  it('a typed reserve reads as your own line', () => {
    expect(cushionCopy(ctx(null, 'steady'))).toEqual({ key: `${D}cushion.ownLine` });
  });

  it('names the months and why, in whole and half months', () => {
    expect(cushionCopy(ctx(6, 'steady'))).toEqual({ key: `${D}cushion.reason`, params: { months: '3' }, keyParams: { because: `${D}cushion.because.steady` } });
    expect(cushionCopy(ctx(9, 'variable')).params).toEqual({ months: '4.5' });
    expect(cushionCopy(ctx(12, 'volatile'))).toEqual({ key: `${D}cushion.reason`, params: { months: '6' }, keyParams: { because: `${D}cushion.because.volatile` } });
  });

  it('under three full months says the steadiness is not known yet', () => {
    expect(cushionCopy(ctx(6, 'insufficient'))).toEqual({ key: `${D}cushion.reasonInsufficient`, params: { months: '3' } });
    expectInDepth([cushionCopy(ctx(9, 'variable')), cushionCopy(ctx(6, 'insufficient')), cushionCopy(ctx(null, 'steady'))]);
  });
});

describe('marginText and the edge chip', () => {
  const fact = { code: 'cash_tight_before_payday', date: '2026-11-03', amount: 12_000 } as never;
  const tightMargin = margin('cash_path', 0, 'on_edge');

  it('holds by / misses by with the absolute amount', () => {
    expect(marginText(margin('cash', 5000), fmt)).toEqual({ key: `${D}edge.holdsBy`, params: { amount: '$5000' } });
    expect(marginText(margin('cash', 0), fmt).key).toBe(`${D}edge.holdsBy`);
    expect(marginText(margin('cash', -700), fmt)).toEqual({ key: `${D}edge.missesBy`, params: { amount: '$700' } });
  });

  it('a cash path margin of 0 on the edge reads as the tight fact', () => {
    const tight = { fact, stackedApplied: 0, formatDate: fmtDate };
    expect(marginText(tightMargin, fmt, tight)).toEqual({ key: `${D}cashPath.tightFact`, params: { date: 'on 2026-11-03', amount: '$12000' } });
    expect(marginText(tightMargin, fmt, { ...tight, stackedApplied: 2 }).key).toBe(`${D}cashPath.tightFactStacked`);
    // no fact, or a different line or flag: back to the ordinary wording
    expect(marginText(tightMargin, fmt, { ...tight, fact: null }).key).toBe(`${D}edge.holdsBy`);
    expect(marginText(tightMargin, fmt).key).toBe(`${D}edge.holdsBy`);
    expect(marginText(margin('cash_path', 0, null), fmt, tight).key).toBe(`${D}edge.holdsBy`);
    expect(marginText(margin('cash', 0, 'on_edge'), fmt, tight).key).toBe(`${D}edge.holdsBy`);

    const withFact = decisionOf({
      margins: [tightMargin],
      stacked: [applied],
      verdict: verdictWith({ cashPath: { status: 'available', tightBeforePayday: fact } }),
    });
    const spoken = edgeChipA11y('Fits', withFact, fmt, fmtDate);
    expect(spoken.label).toEqual({ key: `${D}edge.chipA11yFact`, params: { state: 'Fits' } });
    expect(spoken.fact).toEqual({ key: `${D}cashPath.tightFactStacked`, params: { date: 'on 2026-11-03', amount: '$12000' } });
    const noFact = decisionOf({ margins: [tightMargin], verdict: verdictWith({ cashPath: { status: 'available', tightBeforePayday: null } }) });
    expect(edgeChipA11y('Fits', noFact, fmt, fmtDate)).toEqual({
      label: { key: `${D}edge.chipA11y`, params: { state: 'Fits', amount: '$0' }, keyParams: { line: `${D}edge.line.cash_path` } },
      fact: null,
    });
    expectInDepth([spoken.label, spoken.fact]);
  });

  it('the chip label names the first on-edge line', () => {
    const d = decisionOf({ margins: [margin('month', 900), margin('dsr', 400, 'on_edge'), margin('cash', -3, 'on_edge')] });
    expect(edgeOn(d)).toBe(true);
    const spoken = edgeChipA11y('Fits', d, fmt, fmtDate);
    expect(spoken.label).toEqual({ key: `${D}edge.chipA11y`, params: { state: 'Fits', amount: '$400' }, keyParams: { line: `${D}edge.line.dsr` } });
    expectInDepth([spoken.label]);
    // an unavailable cash path has no fact to speak
    const unavailable = decisionOf({ margins: [tightMargin] });
    expect(edgeChipA11y('Fits', unavailable, fmt, fmtDate).fact).toBeNull();
    expect(edgeChipA11y('Fits', decisionOf({ margins: [tightMargin], verdict: { state: 'missing' } }), fmt, fmtDate).fact).toBeNull();
  });

  it('with no line on the edge the tag is off and the label falls back to the cushion', () => {
    const d = decisionOf({ margins: [margin('month', 900)] });
    expect(edgeOn(d)).toBe(false);
    expect(edgeChipA11y('Fits', d, fmt, fmtDate).label.key).toBe(`${D}edge.chipA11y`);
  });
});

describe('confidence', () => {
  it('maps the level to its label key', () => {
    expect(confidenceCopy('strong')).toEqual({ key: `${D}confidence.strong` });
    expect(confidenceCopy('fair').key).toBe(`${D}confidence.fair`);
    expect(confidenceCopy('rough').key).toBe(`${D}confidence.rough`);
  });

  it('builds reasons from engine codes and builder facts', () => {
    const c: Confidence = { level: 'rough', reasons: ['first_read', 'under_3_full_months', 'under_6_full_months'] };
    const rows = confidenceReasons(c, { fullMonths: 2, steadiness: 'variable', oneOffs: 1, conversions: [{ currency: 'EUR' }, { currency: 'GBP' }] });
    expect(rows.map((r) => r.key)).toEqual([
      `${D}confidence.fullMonths`,
      `${D}confidence.variable`,
      `${D}confidence.firstRead`,
      `${D}confidence.under3`,
      `${D}confidence.under6`,
      `${D}oneOff.basis`,
      `${D}confidence.converted`,
      `${D}confidence.converted`,
    ]);
    expect(rows[0]?.params).toEqual({ count: 2 });
    expect(rows[6]?.params).toEqual({ currency: 'EUR' });
    expectInDepth(rows);
  });

  it('strong has only the months and steadiness rows; insufficient steadiness and null add none', () => {
    const strong: Confidence = { level: 'strong', reasons: [] };
    expect(confidenceReasons(strong, { fullMonths: 6, steadiness: 'steady', oneOffs: 0, conversions: [] }).map((r) => r.key)).toEqual([`${D}confidence.fullMonths`, `${D}confidence.steady`]);
    expect(confidenceReasons(strong, { fullMonths: 1, steadiness: 'insufficient', oneOffs: 0, conversions: [] })).toHaveLength(1);
    expect(confidenceReasons(strong, { fullMonths: 1, steadiness: null, oneOffs: 0, conversions: [] })).toHaveLength(1);
  });
});

describe('cashPathCopy / cashTightFactCopy / conversionBasisCopy', () => {
  const available = {
    status: 'available',
    withoutPurchase: [],
    withPurchase: [],
    lowestWithout: { day: 3, date: '2026-10-20', amount: 50_000 },
    lowestWith: { day: 5, date: '2026-10-22', amount: 20_000 },
    tightBeforePayday: null,
  } as unknown as CashPathReport;

  it('available gives a summary and a text alternative', () => {
    const c = cashPathCopy(available, fmt, fmtDate);
    expect(c).toEqual({
      available: true,
      summary: { key: `${D}cashPath.summary`, params: { amount: '$20000', date: 'on 2026-10-22' } },
      textAlt: { key: `${D}cashPath.textAlt`, params: { amount: '$20000', date: 'on 2026-10-22', amountWithout: '$50000', dateWithout: 'on 2026-10-20' } },
    });
    if (c.available) expectInDepth([c.summary, c.textAlt]);
  });

  it('unavailable gives the prompt', () => {
    const c = cashPathCopy({ status: 'unavailable', code: 'cash_path_unavailable' }, fmt, fmtDate);
    expect(c).toEqual({
      available: false,
      summary: { key: `${D}cashPath.unavailableSummary` },
      body: { key: `${D}cashPath.unavailableBody` },
      link: { key: `${D}cashPath.unavailableLink` },
    });
    if (!c.available) expectInDepth([c.summary, c.body, c.link]);
  });

  it('the tight fact is null without a fact and stacked with other open checks', () => {
    const fact = { code: 'cash_tight_before_payday', date: '2026-11-03', amount: -500 } as never;
    expect(cashTightFactCopy(null, 0, fmt, fmtDate)).toBeNull();
    expect(cashTightFactCopy(fact, 0, fmt, fmtDate)?.key).toBe(`${D}cashPath.tightFact`);
    expect(cashTightFactCopy(fact, 1, fmt, fmtDate)?.key).toBe(`${D}cashPath.tightFactStacked`);
  });

  it('one assumption row per converted currency', () => {
    const rows = conversionBasisCopy([{ currency: 'EUR', rateText: '1.0850000000', rateDate: '2026-10-01' }, { currency: 'JPY', rateText: '0.0067000000', rateDate: '2026-10-02' }], fmtDate);
    expect(rows).toEqual([
      { key: `${D}currency.assumption`, params: { currency: 'EUR', rate: '1.09', date: 'on 2026-10-01' } },
      { key: `${D}currency.assumption`, params: { currency: 'JPY', rate: '0.0067', date: 'on 2026-10-02' } },
    ]);
    expect(conversionBasisCopy([], fmtDate)).toEqual([]);
    expectInDepth(rows);
  });
});

