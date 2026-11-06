/**
 * 05.3-54 D-24: readiness names its gaps. Expectations are worked by hand from the owner's evidence (asOf 2026-10-30),
 * never read off the engine. `legacyMissing` is today's readinessOf, copied before the refactor, so `missing` can be
 * pinned against it for every input with no waivers and no skips.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../money/types';
import { MATCH_DAYS, NEEDS_INPUT_ENTRY_AGE_DAYS, UNDER_LOGGED_PACE_PERCENT } from '../constants';
import { addDays, addYearMonths, daysBetween, yearMonthOf } from '../dates';
import { evaluate } from '../evaluate';
import { classifyLine, seriesIndex, seriesOccurrences } from '../month/series';
import { dueKey, matchWindowDays, settle, toPaidLine, type Due } from '../month/settle';
import { readinessOf } from '../readiness';
import type { Envelope, MonthModel, Readiness, ReadinessCode, ReadinessItem, ReadinessWaiver, V3Inputs, V3Line } from '../types';
import { loadPersons, toV3Inputs } from './golden/adapter';
import { loadAllVariableCases } from './golden/variableIncomeLoader';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';

// ---- legacy reference: readinessOf as it was before 05.3-54 (codes only) ----
function legacyBillDues(inputs: V3Inputs, from: string, to: string): { readonly dues: readonly Due[]; readonly window: (id: string) => number } {
  const dues: Due[] = [];
  const windows = new Map<string, number>();
  for (const s of inputs.series) {
    if (s.role !== 'bill') continue;
    const dates = seriesOccurrences(s, from, to, inputs.asOf);
    if (dates.length === 0) continue;
    windows.set(s.id, matchWindowDays(s.cadence, MATCH_DAYS));
    for (const date of dates) dues.push({ seriesId: s.id, date, amount: s.amount });
  }
  return { dues, window: (id) => windows.get(id) as number };
}
function legacyPaidLines(inputs: V3Inputs): readonly V3Line[] {
  return inputs.months.flatMap((m) => m.lines.filter((l) => l.status === 'paid'));
}
function legacyPast(inputs: V3Inputs, ym: string): boolean {
  const prev = addYearMonths(ym, -1);
  const prevMonth = inputs.months.find((m) => m.month === prev);
  if (prevMonth === undefined || !prevMonth.full) return true;
  const index = seriesIndex(inputs.series);
  const paid = prevMonth.lines.filter((l) => l.status === 'paid');
  if (!paid.some((l) => classifyLine(l, index) === 'everyday')) return true;
  const from = `${prev}-01`;
  const to = `${ym}-01`;
  const incomeDue = inputs.series.some((s) => (s.role === 'pay' || s.role === 'other_income') && seriesOccurrences(s, from, to, inputs.asOf).length > 0);
  if (incomeDue && !paid.some((l) => l.role === 'income')) return true;
  const { dues, window } = legacyBillDues(inputs, from, to);
  const { settled } = settle(dues, legacyPaidLines(inputs).map(toPaidLine), window);
  return dues.some((d) => !settled.has(dueKey(d)));
}
function legacyCurrent(inputs: V3Inputs, month: MonthModel, ym: string): boolean {
  if (!inputs.months.some((m) => m.lines.some((l) => l.status === 'paid'))) return false;
  const index = seriesIndex(inputs.series);
  let newest: string | null = null;
  for (const l of legacyPaidLines(inputs)) {
    if (l.role === 'spending' && classifyLine(l, index) === 'everyday' && (newest === null || l.date > newest)) newest = l.date;
  }
  const old = newest === null || daysBetween(newest, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS;
  const behind =
    month.e === null ||
    BigInt(month.everydayLogged) * BigInt(month.daysInMonth) * 100n < BigInt(UNDER_LOGGED_PACE_PERCENT) * BigInt(month.e) * BigInt(month.day);
  if (old && behind) return true;
  const { dues, window } = legacyBillDues(inputs, `${ym}-01`, addDays(inputs.asOf, 1));
  const { settled } = settle(dues, legacyPaidLines(inputs).map(toPaidLine), window);
  return dues.some((d) => daysBetween(d.date, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS && !settled.has(dueKey(d)));
}
function legacyMissing(inputs: V3Inputs, month: MonthModel): readonly ReadinessCode[] {
  const ym = yearMonthOf(inputs.asOf);
  if (inputs.typedEstimates !== null && !inputs.months.some((m) => m.month < ym)) return [];
  const missing: ReadinessCode[] = [];
  if (legacyPast(inputs, ym)) missing.push('past_month_missing');
  if (legacyCurrent(inputs, month, ym)) missing.push('activity_not_current');
  if (inputs.envelopes.some((e) => e.accountId === null || e.accountId === undefined)) missing.push('envelopes_unconfirmed');
  return missing.sort();
}

// ---- fixtures ----
const mu = minorUnits;
const check = checkOnce(1000);
const MONTHLY = { unit: 'month', every: 1 } as const;

/** Readiness through evaluate (so the result carries it) and directly; both must agree. */
function readinessFor(inputs: V3Inputs): Readiness {
  const ev = evaluate(inputs, check);
  const r = readinessOf(inputs, ev.month);
  expect(ev.result.readiness).toEqual(r);
  return r;
}

const SERIES = [
  v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-06-03', amount: 1619942, name: 'Salary' }),
  v3Series({ id: 'netflix', role: 'bill', cadence: MONTHLY, anchorDate: '2026-06-03', amount: 1199, name: 'Netflix' }),
  v3Series({ id: 'lunch', role: 'bill', cadence: MONTHLY, anchorDate: '2026-06-21', amount: 1000, name: 'Lunch' }),
];

function paidMonth(ym: string): V3Line[] {
  return [
    v3Line({ id: `pay-${ym}`, date: `${ym}-03`, amount: 1619942, role: 'income', seriesId: 'pay' }),
    v3Line({ id: `netflix-${ym}`, date: `${ym}-03`, amount: 1199, seriesId: 'netflix' }),
    v3Line({ id: `lunch-${ym}`, date: `${ym}-21`, amount: 1000, seriesId: 'lunch' }),
    v3Line({ id: `e1-${ym}`, date: `${ym}-08`, amount: 150000 }),
    v3Line({ id: `e2-${ym}`, date: `${ym}-18`, amount: 150000 }),
  ];
}

/** The owner's evidence on 2026-10-30. */
function evidence(over: Partial<V3Inputs> = {}): V3Inputs {
  const sep: V3Line[] = [
    v3Line({ id: 'pay-sep', date: '2026-09-03', amount: 1619942, role: 'income', seriesId: 'pay', status: 'pending', name: 'Pay' }),
    v3Line({ id: 'netflix-sep', date: '2026-09-03', amount: 1199, seriesId: 'netflix', status: 'pending', name: 'Netflix' }),
    v3Line({ id: 'lunch-sep', date: '2026-09-21', amount: 1000, seriesId: 'lunch', status: 'pending', name: 'Lunch' }),
    v3Line({ id: 'e1-sep', date: '2026-09-08', amount: 150000 }),
    v3Line({ id: 'e2-sep', date: '2026-09-18', amount: 150000 }),
  ];
  const oct: V3Line[] = [
    v3Line({ id: 'pay-oct', date: '2026-10-03', amount: 1619942, role: 'income', seriesId: 'pay' }),
    v3Line({ id: 'netflix-oct', date: '2026-10-03', amount: 1199, seriesId: 'netflix' }),
    v3Line({ id: 'lunch-oct', date: '2026-10-21', amount: 1000, seriesId: 'lunch' }),
    v3Line({ id: 'e1-oct', date: '2026-10-14', amount: 5000 }),
  ];
  return inputsOf({
    asOf: '2026-10-30',
    series: SERIES,
    months: [monthOf('2026-06', paidMonth('2026-06')), monthOf('2026-07', paidMonth('2026-07')), monthOf('2026-08', paidMonth('2026-08')), monthOf('2026-09', sep), monthOf('2026-10', oct, { full: false })],
    ...over,
  });
}

const item = (p: Partial<ReadinessItem> & Pick<ReadinessItem, 'kind' | 'code' | 'month'>): ReadinessItem => ({
  seriesId: null,
  envelopeId: null,
  lineId: null,
  name: null,
  amount: null,
  date: null,
  ...p,
});

const EVIDENCE_ITEMS: readonly ReadinessItem[] = [
  item({ kind: 'pay', code: 'past_month_missing', month: '2026-09', seriesId: 'pay', lineId: 'pay-sep', name: 'Pay', amount: mu(1619942), date: '2026-09-03' }),
  item({ kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: 'netflix', lineId: 'netflix-sep', name: 'Netflix', amount: mu(1199), date: '2026-09-03' }),
  item({ kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: 'lunch', lineId: 'lunch-sep', name: 'Lunch', amount: mu(1000), date: '2026-09-21' }),
  item({ kind: 'spending', code: 'activity_not_current', month: '2026-10', date: '2026-10-14' }),
];

const envelope = (id: string, accountId: string | null, name?: string): Envelope => ({
  id,
  kind: 'pot',
  target: null,
  monthlyAmount: null,
  readyBy: null,
  saved: mu(0),
  purposeId: null,
  accountId,
  ...(name === undefined ? {} : { name }),
});

/** Every fixture person on a few dates, every variable-income case, and the evidence. */
function corpus(): V3Inputs[] {
  const out: V3Inputs[] = [];
  for (const p of loadPersons()) for (const asOf of ['2026-10-03', '2026-10-12', '2026-10-20', '2026-10-30']) out.push(toV3Inputs(p, { asOf }));
  for (const c of loadAllVariableCases()) out.push(c.inputs);
  out.push(evidence(), evidence({ envelopes: [envelope('a', null), envelope('b', 'acct')] }));
  return out;
}

describe('05.3-54 D-24 named readiness items', () => {
  it('missing equals the legacy readinessOf for every corpus input with no waivers and no skips', () => {
    for (const inputs of corpus()) {
      const ev = evaluate(inputs, check);
      const r = readinessOf(inputs, ev.month);
      expect(r.missing).toEqual(legacyMissing(inputs, ev.month));
      expect(r.ready).toBe(r.missing.length === 0);
      expect(r.waived).toEqual([]);
      expect([...new Set((r.items ?? []).map((i) => i.code))].sort()).toEqual(r.missing);
    }
  });

  it('missing equals the legacy readinessOf when lines are dropped, months unmarked or the date moves', () => {
    const base = [...corpus().slice(0, 6), evidence()];
    const arb = fc.record({
      pick: fc.nat(base.length - 1),
      drop: fc.array(fc.nat(60), { maxLength: 6 }),
      unfull: fc.boolean(),
      shift: fc.integer({ min: -25, max: 5 }),
    });
    fc.assert(
      fc.property(arb, ({ pick, drop, unfull, shift }) => {
        const src = base[pick] as V3Inputs;
        const asOf = addDays(src.asOf, shift);
        const prev = addYearMonths(yearMonthOf(asOf), -1);
        let n = 0;
        const months = src.months
          .filter((m) => m.month <= yearMonthOf(asOf))
          .map((m) => ({
            ...m,
            full: unfull && m.month === prev ? false : m.full,
            lines: m.lines.filter((l) => l.date <= asOf && !drop.includes(n++)),
          }));
        const inputs = { ...src, asOf, months };
        const ev = evaluate(inputs, check);
        const r = readinessOf(inputs, ev.month);
        expect(r.missing).toEqual(legacyMissing(inputs, ev.month));
      }),
      { numRuns: 120, seed: 5403 },
    );
  });

  it('owner evidence: pay, Netflix and Lunch in September, each with its pending line, and October spending dated Oct 14', () => {
    const r = readinessFor(evidence());
    expect(r.missing).toEqual(['activity_not_current', 'past_month_missing']);
    expect(r.ready).toBe(false);
    expect(r.items).toEqual(EVIDENCE_ITEMS);
    expect(r.waived).toEqual([]);
  });

  it('with no pending line the name and amount come from the series; with no names they are null', () => {
    const noPending = evidence();
    const edited = { ...noPending, months: noPending.months.map((m) => (m.month === '2026-09' ? { ...m, lines: m.lines.filter((l) => l.status === 'paid') } : m)) };
    const r = readinessFor(edited);
    expect(r.items?.[1]).toEqual(item({ kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: 'netflix', name: 'Netflix', amount: mu(1199), date: '2026-09-03' }));
    expect(r.items?.[0]?.name).toBe('Salary');
    const unnamed = { ...edited, series: edited.series.map(({ name: _n, ...s }) => s) };
    expect(readinessFor(unnamed).items?.[1]?.name).toBeNull();
    // a pending line with no name falls back to the series name
    const lineUnnamed = evidence({ series: SERIES });
    const stripped = { ...lineUnnamed, months: lineUnnamed.months.map((m) => ({ ...m, lines: m.lines.map(({ name: _n, ...l }) => l) })) };
    expect(readinessFor(stripped).items?.[2]).toMatchObject({ lineId: 'lunch-sep', name: 'Lunch' });
  });

  it('a past month not marked full gives one late_start item dated at its earliest line, and nothing else for that month', () => {
    const e = evidence();
    const lateSep = [
      v3Line({ id: 'late-1', date: '2026-09-20', amount: 4000 }),
      v3Line({ id: 'late-0', date: '2026-09-14', amount: 2000, status: 'pending', seriesId: 'netflix' }),
    ];
    const r = readinessFor({ ...e, months: e.months.map((m) => (m.month === '2026-09' ? monthOf('2026-09', lateSep, { full: false }) : m)) });
    expect(r.items?.filter((i) => i.month === '2026-09')).toEqual([item({ kind: 'late_start', code: 'past_month_missing', month: '2026-09', date: '2026-09-14' })]);
    const absent = readinessFor({ ...e, months: e.months.filter((m) => m.month !== '2026-09') });
    expect(absent.items?.[0]).toEqual(item({ kind: 'late_start', code: 'past_month_missing', month: '2026-09' }));
  });

  it('a full past month with no paid everyday line gives a spending item with no date', () => {
    const e = evidence();
    const r = readinessFor({ ...e, months: e.months.map((m) => (m.month === '2026-09' ? { ...m, lines: m.lines.filter((l) => l.status === 'pending') } : m)) });
    expect(r.items?.filter((i) => i.kind === 'spending' && i.month === '2026-09')).toEqual([item({ kind: 'spending', code: 'past_month_missing', month: '2026-09' })]);
  });

  it('an overdue unsettled bill this month is a named bill item; a recent one is not', () => {
    const e = evidence();
    const r = readinessFor({ ...e, months: e.months.map((m) => (m.month === '2026-10' ? { ...m, lines: m.lines.filter((l) => l.id !== 'netflix-oct' && l.id !== 'lunch-oct') } : m)) });
    expect(r.items?.filter((i) => i.month === '2026-10')).toEqual([
      item({ kind: 'bill', code: 'activity_not_current', month: '2026-10', seriesId: 'netflix', name: 'Netflix', amount: mu(1199), date: '2026-10-03' }),
      item({ kind: 'spending', code: 'activity_not_current', month: '2026-10', date: '2026-10-14' }),
    ]);
  });

  it('D-54: one envelopes item per unlinked envelope, named, sorted by id', () => {
    const r = readinessFor(evidence({ envelopes: [envelope('z-car', null, 'Car'), envelope('a-trip', null), envelope('linked', 'acct', 'Linked')] }));
    expect(r.missing).toEqual(['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing']);
    expect(r.items?.filter((i) => i.kind === 'envelopes')).toEqual([
      item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-10', envelopeId: 'a-trip' }),
      item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-10', envelopeId: 'z-car', name: 'Car' }),
    ]);
  });

  it('D-57: the rough shortcut has no items and nothing waived', () => {
    const rough = { income: mu(300000), expenses: mu(200000), saving: mu(0), debt: mu(0), invest: mu(0), asOf: '2026-10-03' };
    expect(readinessFor(inputsOf({ typedEstimates: rough }))).toEqual({ ready: true, missing: [], items: [], waived: [] });
  });
});

// ---- Task 2: waivers, skips and the same-series lineId (B1) ----
type Months = V3Inputs['months'];
const editLines = (inputs: V3Inputs, month: string, edit: (lines: Months[number]['lines']) => Months[number]['lines']): V3Inputs => ({
  ...inputs,
  months: inputs.months.map((m) => (m.month === month ? { ...m, lines: edit(m.lines) } : m)),
});
const EV = EVIDENCE_ITEMS as readonly [ReadinessItem, ReadinessItem, ReadinessItem, ReadinessItem];
const [, NETFLIX_SEP, LUNCH_SEP, SPEND_OCT] = EV;
const waivedBy = (r: Readiness): readonly (readonly [string | null, string, string])[] =>
  (r.waived ?? []).map((w) => [w.item.seriesId, w.item.kind, w.by] as const);

describe('05.3-54 D-24 waivers, skips and B1', () => {
  it('B1: a pending one-off with the same amount never gives a lineId; the same-series line does', () => {
    const dentist = v3Line({ id: 'dentist', date: '2026-09-03', amount: 1199, status: 'pending', name: 'Dentist' });
    const withBoth = editLines(evidence(), '2026-09', (lines) => [dentist, ...lines]);
    expect(readinessFor(withBoth).items?.[1]).toEqual(NETFLIX_SEP);
    const onlyDentist = editLines(withBoth, '2026-09', (lines) => lines.filter((l) => l.id !== 'netflix-sep'));
    expect(readinessFor(onlyDentist).items?.[1]).toEqual({ ...NETFLIX_SEP, lineId: null, name: 'Netflix' });
  });

  it('pay marked paid, Netflix skipped, Lunch paid by someone else and nothing to add in October: ready, with Lunch and October spending waived', () => {
    const paidPay = editLines(evidence(), '2026-09', (lines) => lines.map((l) => (l.id === 'pay-sep' ? { ...l, status: 'paid' as const } : l)));
    const r = readinessFor({
      ...paidPay,
      skipped: [{ seriesId: 'netflix', date: '2026-09-03' }],
      waivers: [
        { kind: 'paid_by_other', seriesId: 'lunch', date: '2026-09-21' },
        { kind: 'nothing_to_add', month: '2026-10', at: '2026-10-30' },
      ],
    });
    expect(r).toEqual({
      ready: true,
      missing: [],
      items: [],
      waived: [
        { item: LUNCH_SEP, by: 'paid_by_other', waiver: { kind: 'paid_by_other', seriesId: 'lunch', date: '2026-09-21' } },
        { item: SPEND_OCT, by: 'nothing_to_add', waiver: { kind: 'nothing_to_add', month: '2026-10', at: '2026-10-30' } },
      ],
    });
  });

  it('a skip settles its due silently; a skip of an unknown series is ignored; a skipped pay settles the pay item', () => {
    const r = readinessFor(evidence({ skipped: [{ seriesId: 'netflix', date: '2026-09-03' }, { seriesId: 'ghost', date: '2026-09-03' }, { seriesId: 'pay', date: '2026-09-03' }] }));
    expect(r.items).toEqual([LUNCH_SEP, SPEND_OCT]);
    expect(r.waived).toEqual([]);
  });

  it('month_complete for September settles all three September items; income_elsewhere only the pay; no_pay on the wrong date nothing', () => {
    expect(waivedBy(readinessFor(evidence({ waivers: [{ kind: 'month_complete', month: '2026-09', at: '2026-10-01' }] })))).toEqual([
      ['pay', 'pay', 'month_complete'],
      ['netflix', 'bill', 'month_complete'],
      ['lunch', 'bill', 'month_complete'],
    ]);
    const elsewhere = readinessFor(evidence({ waivers: [{ kind: 'income_elsewhere' }] }));
    expect(waivedBy(elsewhere)).toEqual([['pay', 'pay', 'income_elsewhere']]);
    expect(elsewhere.items).toEqual([NETFLIX_SEP, LUNCH_SEP, SPEND_OCT]);
    const wrong = readinessFor(evidence({ waivers: [{ kind: 'no_pay', seriesId: 'pay', date: '2026-09-04' }] }));
    expect(wrong.items).toEqual(EVIDENCE_ITEMS);
    expect(wrong.waived).toEqual([]);
    const right = readinessFor(evidence({ waivers: [{ kind: 'no_pay', seriesId: 'pay', date: '2026-09-03' }, { kind: 'didnt_happen', seriesId: 'netflix', date: '2026-09-03' }] }));
    expect(waivedBy(right)).toEqual([
      ['pay', 'pay', 'no_pay'],
      ['netflix', 'bill', 'didnt_happen'],
    ]);
  });

  it('late start from 2026-09-14 is one dated item, settled by start_from 2026-10', () => {
    const e = evidence();
    const late = { ...e, months: e.months.map((m) => (m.month === '2026-09' ? monthOf('2026-09', [v3Line({ id: 'l', date: '2026-09-14', amount: 900 })], { full: false }) : m)) };
    const before = readinessFor(late);
    expect(before.items?.[0]).toEqual(item({ kind: 'late_start', code: 'past_month_missing', month: '2026-09', date: '2026-09-14' }));
    const after = readinessFor({ ...late, waivers: [{ kind: 'start_from', month: '2026-10' }] });
    expect(after.missing).toEqual(['activity_not_current']);
    expect(waivedBy(after)).toEqual([[null, 'late_start', 'start_from']]);
    // start_from the past month itself settles nothing there
    expect(readinessFor({ ...late, waivers: [{ kind: 'start_from', month: '2026-09' }] }).waived).toEqual([]);
  });

  it('a waiver dated in the future settles nothing; always_other settles that series in both months', () => {
    const future = readinessFor(evidence({ waivers: [{ kind: 'nothing_to_add', month: '2026-10', at: '2026-11-02' }, { kind: 'month_complete', month: '2026-09', at: '2026-10-31' }] }));
    expect(future.items).toEqual(EVIDENCE_ITEMS);
    expect(future.waived).toEqual([]);
    const noOct = editLines(evidence(), '2026-10', (lines) => lines.filter((l) => l.id !== 'netflix-oct'));
    const always = readinessFor({ ...noOct, waivers: [{ kind: 'always_other', seriesId: 'netflix' }] });
    expect(waivedBy(always)).toEqual([
      ['netflix', 'bill', 'always_other'],
      ['netflix', 'bill', 'always_other'],
    ]);
    expect(always.waived?.map((w) => w.item.month)).toEqual(['2026-09', '2026-10']);
  });

  it('this month: month_complete settles bills dated on or before its date and, when recent, the spending clock; old answers do not', () => {
    const noOct = editLines(evidence(), '2026-10', (lines) => lines.filter((l) => l.id !== 'netflix-oct'));
    const r = readinessFor({ ...noOct, waivers: [{ kind: 'month_complete', month: '2026-10', at: '2026-10-25' }] });
    expect(waivedBy(r)).toEqual([
      ['netflix', 'bill', 'month_complete'],
      [null, 'spending', 'month_complete'],
    ]);
    const early = readinessFor({ ...noOct, waivers: [{ kind: 'month_complete', month: '2026-10', at: '2026-10-02' }] });
    expect(early.waived).toEqual([]);
    const oldAdd = readinessFor(evidence({ waivers: [{ kind: 'nothing_to_add', month: '2026-10', at: '2026-10-15' }] }));
    expect(oldAdd.waived).toEqual([]);
  });

  it('nothing_to_add settles a past month spending item whatever its date', () => {
    const noEveryday = editLines(evidence(), '2026-09', (lines) => lines.filter((l) => l.status === 'pending'));
    const r = readinessFor({ ...noEveryday, waivers: [{ kind: 'nothing_to_add', month: '2026-09', at: '2026-10-01' }] });
    expect(waivedBy(r)).toEqual([[null, 'spending', 'nothing_to_add']]);
    expect(r.waived?.[0]?.item.month).toBe('2026-09');
  });

  it('precedence picks one waiver whatever the input order: kind first, then the latest date, then a fixed order', () => {
    const lunch = { kind: 'paid_by_other', seriesId: 'lunch', date: '2026-09-21' } as const;
    const early = { kind: 'month_complete', month: '2026-09', at: '2026-10-01' } as const;
    const late = { kind: 'month_complete', month: '2026-09', at: '2026-10-05' } as const;
    for (const waivers of [[lunch, early, late], [late, early, lunch]]) {
      const r = readinessFor(evidence({ waivers }));
      expect(r.waived?.find((w) => w.item.seriesId === 'lunch')).toEqual({ item: LUNCH_SEP, by: 'month_complete', waiver: late });
    }
    const e = evidence();
    const unfull = { ...e, months: e.months.map((m) => (m.month === '2026-09' ? { ...m, full: false } : m)) };
    const s10 = { kind: 'start_from', month: '2026-10' } as const;
    const s11 = { kind: 'start_from', month: '2026-11' } as const;
    for (const waivers of [[s10, s11], [s11, s10]]) {
      expect(readinessFor({ ...unfull, waivers }).waived?.[0]?.waiver).toEqual(s10);
    }
  });

  it('D-54: no waiver ever settles an envelopes item', () => {
    const all = [
      { kind: 'start_from', month: '2026-12' },
      { kind: 'month_complete', month: '2026-10', at: '2026-10-30' },
      { kind: 'nothing_to_add', month: '2026-10', at: '2026-10-30' },
      { kind: 'income_elsewhere' },
    ] as const;
    const r = readinessFor(evidence({ envelopes: [envelope('b', null, 'Trip'), envelope('a', null)], waivers: all }));
    expect(r.items).toEqual([
      item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-10', envelopeId: 'a' }),
      item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-10', envelopeId: 'b', name: 'Trip' }),
    ]);
    expect(r.missing).toEqual(['envelopes_unconfirmed']);
    expect(r.waived).toHaveLength(4);
  });
});

describe('05.3-54 waiver and skip properties', () => {
  const variants: readonly V3Inputs[] = [
    evidence(),
    editLines(evidence(), '2026-10', (lines) => lines.filter((l) => l.id !== 'netflix-oct')),
    editLines(evidence(), '2026-09', (lines) => lines.filter((l) => l.status === 'pending')),
    { ...evidence(), months: evidence().months.map((m) => (m.month === '2026-09' ? { ...m, full: false } : m)) },
    editLines(
      editLines(evidence(), '2026-09', (lines) => lines.map((l) => ({ ...l, status: 'paid' as const }))),
      '2026-10',
      (lines) => [...lines, v3Line({ id: 'recent', date: '2026-10-28', amount: 900000 })],
    ),
  ];
  const ids = fc.constantFrom('pay', 'netflix', 'lunch', 'ghost');
  const dates = fc.constantFrom('2026-09-03', '2026-09-21', '2026-10-03', '2026-10-21', '2026-09-04');
  const months = fc.constantFrom('2026-08', '2026-09', '2026-10', '2026-11');
  const ats = fc.constantFrom('2026-10-01', '2026-10-15', '2026-10-25', '2026-10-30', '2026-11-03');
  const waiver: fc.Arbitrary<ReadinessWaiver> = fc.oneof(
    fc.record({ kind: fc.constantFrom('paid_by_other' as const, 'didnt_happen' as const, 'no_pay' as const), seriesId: ids, date: dates }),
    fc.record({ kind: fc.constant('always_other' as const), seriesId: ids }),
    fc.constant({ kind: 'income_elsewhere' as const }),
    fc.record({ kind: fc.constantFrom('nothing_to_add' as const, 'month_complete' as const), month: months, at: ats }),
    fc.record({ kind: fc.constant('start_from' as const), month: months }),
  );
  const skip = fc.record({ seriesId: ids, date: dates });
  const keyOf = (i: ReadinessItem): string => JSON.stringify(i);

  it('adding a waiver never adds an item; items plus waived never exceed the items with no waivers; nothing turns ready into not ready', () => {
    fc.assert(
      fc.property(fc.nat(variants.length - 1), fc.array(waiver, { maxLength: 4 }), waiver, fc.array(skip, { maxLength: 3 }), (pick, ws, extra, skips) => {
        const base = variants[pick] as V3Inputs;
        const month = evaluate(base, check).month;
        const plain = readinessOf(base, month);
        const withSkips = readinessOf({ ...base, skipped: skips }, month);
        const some = readinessOf({ ...base, skipped: skips, waivers: ws }, month);
        const more = readinessOf({ ...base, skipped: skips, waivers: [...ws, extra] }, month);
        const someKeys = new Set((some.items ?? []).map(keyOf));
        for (const i of more.items ?? []) expect(someKeys.has(keyOf(i))).toBe(true);
        expect((some.items ?? []).length + (some.waived ?? []).length).toBeLessThanOrEqual((withSkips.items ?? []).length);
        expect((withSkips.items ?? []).length).toBeLessThanOrEqual((plain.items ?? []).length);
        if (plain.ready) expect(more.ready).toBe(true);
      }),
      { numRuns: 300, seed: 5404 },
    );
  });
});
