// 06.1-43 (G-1): the fix model. Each waiver-carrying choice is checked against the engine's own readinessOf: applying it clears
// exactly the item it was offered for.
import type { Envelope, ReadinessItem, V3Inputs, V3Line } from '@/engine/decide/v3';
import { evaluate } from '@/engine/decide/v3';
import { readinessOf } from '@/engine/decide/v3/readiness';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money';
import { estimatesCanAnswer, readinessFixRows, type ReadinessFixRow } from '../readinessFixes';

const MONTHLY = { unit: 'month', every: 1 } as const;
const ASOF = '2026-10-30';
const check = checkOnce(1000);

const SERIES = [
  v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-06-03', amount: 1619942, name: 'Salary' }),
  v3Series({ id: 'netflix', role: 'bill', cadence: MONTHLY, anchorDate: '2026-06-03', amount: 1199, name: 'Netflix' }),
];

function paidMonth(ym: string): V3Line[] {
  return [
    v3Line({ id: `pay-${ym}`, date: `${ym}-03`, amount: 1619942, role: 'income', seriesId: 'pay' }),
    v3Line({ id: `netflix-${ym}`, date: `${ym}-03`, amount: 1199, seriesId: 'netflix' }),
    v3Line({ id: `e1-${ym}`, date: `${ym}-08`, amount: 150000 }),
  ];
}

/** September's pay and Netflix are pending (with lines) or absent (no lines); October's spending is old. */
function fixture(opts: { pendingLines: boolean; septFull?: boolean; envelopes?: Envelope[] }): V3Inputs {
  const pending = opts.pendingLines
    ? [
        v3Line({ id: 'pay-sep', date: '2026-09-03', amount: 1619942, role: 'income', seriesId: 'pay', status: 'pending', name: 'Pay' }),
        v3Line({ id: 'netflix-sep', date: '2026-09-03', amount: 1199, seriesId: 'netflix', status: 'pending', name: 'Netflix' }),
      ]
    : [];
  const sep = [...pending, v3Line({ id: 'e1-sep', date: '2026-09-08', amount: 150000 })];
  const oct = [
    v3Line({ id: 'pay-oct', date: '2026-10-03', amount: 1619942, role: 'income', seriesId: 'pay' }),
    v3Line({ id: 'netflix-oct', date: '2026-10-03', amount: 1199, seriesId: 'netflix' }),
    v3Line({ id: 'e1-oct', date: '2026-10-14', amount: 5000 }),
  ];
  return inputsOf({
    asOf: ASOF,
    series: SERIES,
    months: [
      monthOf('2026-07', paidMonth('2026-07')),
      monthOf('2026-08', paidMonth('2026-08')),
      monthOf('2026-09', sep, { full: opts.septFull ?? true }),
      monthOf('2026-10', oct, { full: false }),
    ],
    envelopes: opts.envelopes ?? [],
  });
}

const envelope = (id: string): Envelope => ({
  id,
  kind: 'pot',
  target: null,
  monthlyAmount: null,
  readyBy: null,
  saved: minorUnits(0),
  purposeId: null,
  accountId: null,
  name: 'Holiday',
});

const readiness = (inputs: V3Inputs) => readinessOf(inputs, evaluate(inputs, check).month);
const sameItem = (a: ReadinessItem, b: ReadinessItem): boolean =>
  a.kind === b.kind && a.month === b.month && a.seriesId === b.seriesId && a.envelopeId === b.envelopeId && a.date === b.date;

/** Applying each waiver-carrying choice to the inputs moves its item from open to waived. */
function expectChoicesClear(inputs: V3Inputs, rows: readonly ReadinessFixRow[]): number {
  let checked = 0;
  for (const row of rows) {
    for (const c of row.choices) {
      if (c.waiver === null) continue;
      const after = readiness({ ...inputs, waivers: [c.waiver] });
      expect((after.items ?? []).some((i) => sameItem(i, row.item))).toBe(false);
      expect((after.waived ?? []).some((w) => sameItem(w.item, row.item) && w.by === c.waiver!.kind)).toBe(true);
      checked += 1;
    }
  }
  return checked;
}

describe('readinessFixRows', () => {
  it('bills and pay with a pending line offer markSkipped first; every waiver clears its item in the engine', () => {
    const inputs = fixture({ pendingLines: true });
    const items = readiness(inputs).items ?? [];
    const rows = readinessFixRows(items, ASOF);
    expect(rows.map((r) => r.id)).toEqual(items.map((i) => `${i.kind}|${i.month}|${i.seriesId ?? i.envelopeId ?? ''}|${i.date ?? ''}`));

    const pay = rows.find((r) => r.item.kind === 'pay')!;
    expect(pay.id).toBe('pay|2026-09|pay|2026-09-03');
    expect(pay.fix).toEqual({ kind: 'records', month: '2026-09', lineId: 'pay-sep' });
    expect(pay.choices).toEqual([
      { key: 'markSkipped', waiver: null, lineId: 'pay-sep' },
      { key: 'incomeElsewhere', waiver: { kind: 'income_elsewhere' }, lineId: null },
    ]);

    const bill = rows.find((r) => r.item.kind === 'bill')!;
    expect(bill.choices.map((c) => c.key)).toEqual(['markSkipped', 'paidByOther', 'alwaysOther']);
    expect(bill.choices[0]).toEqual({ key: 'markSkipped', waiver: null, lineId: 'netflix-sep' });
    expect(bill.choices[1]!.waiver).toEqual({ kind: 'paid_by_other', seriesId: 'netflix', date: '2026-09-03' });
    expect(bill.choices[2]!.waiver).toEqual({ kind: 'always_other', seriesId: 'netflix' });

    const spending = rows.find((r) => r.item.kind === 'spending')!;
    expect(spending.fix).toEqual({ kind: 'records', month: '2026-10', lineId: null });
    expect(spending.choices).toEqual([{ key: 'nothingToAdd', waiver: { kind: 'nothing_to_add', month: '2026-10', at: ASOF }, lineId: null }]);

    expect(expectChoicesClear(inputs, rows)).toBe(4);
  });

  it('bills and pay with no pending line offer didntHappen / noPay instead; each clears its item', () => {
    const inputs = fixture({ pendingLines: false });
    const rows = readinessFixRows(readiness(inputs).items ?? [], ASOF);
    const pay = rows.find((r) => r.item.kind === 'pay')!;
    const bill = rows.find((r) => r.item.kind === 'bill')!;
    expect(pay.choices.map((c) => c.key)).toEqual(['noPay', 'incomeElsewhere']);
    expect(pay.choices[0]!.waiver).toEqual({ kind: 'no_pay', seriesId: 'pay', date: '2026-09-03' });
    expect(bill.choices.map((c) => c.key)).toEqual(['didntHappen', 'paidByOther', 'alwaysOther']);
    expect(bill.choices[0]!.waiver).toEqual({ kind: 'didnt_happen', seriesId: 'netflix', date: '2026-09-03' });
    expect(expectChoicesClear(inputs, rows)).toBe(6);
  });

  it('a late start offers startFrom the next month, which clears it', () => {
    const inputs = fixture({ pendingLines: true, septFull: false });
    const rows = readinessFixRows(readiness(inputs).items ?? [], ASOF);
    const late = rows.find((r) => r.item.kind === 'late_start')!;
    expect(late.choices).toEqual([{ key: 'startFrom', waiver: { kind: 'start_from', month: '2026-10' }, lineId: null }]);
    expect(expectChoicesClear(inputs, [late])).toBe(1);
  });

  it('a December late start starts from January of the next year', () => {
    const item: ReadinessItem = { kind: 'late_start', code: 'past_month_missing', month: '2026-12', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null };
    expect(readinessFixRows([item], '2027-01-05')[0]!.choices[0]!.waiver).toEqual({ kind: 'start_from', month: '2027-01' });
    expect(readinessFixRows([item], '2027-01-05')[0]!.id).toBe('late_start|2026-12||');
  });

  it('D-54: an envelope has no choices and its fix is linking the envelope', () => {
    const inputs = fixture({ pendingLines: true, envelopes: [envelope('env-1')] });
    const rows = readinessFixRows(readiness(inputs).items ?? [], ASOF);
    const env = rows.find((r) => r.item.kind === 'envelopes')!;
    expect(env.id).toBe('envelopes|2026-10|env-1|');
    expect(env.fix).toEqual({ kind: 'linkEnvelope', envelopeId: 'env-1' });
    expect(env.choices).toEqual([]);
  });

  it('a bill or pay item missing its series or date offers no occurrence answer', () => {
    const base: ReadinessItem = { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null };
    expect(readinessFixRows([base], ASOF)[0]!.choices).toEqual([]);
    expect(readinessFixRows([{ ...base, lineId: 'l1', seriesId: 's1' }], ASOF)[0]!.choices).toEqual([{ key: 'markSkipped', waiver: null, lineId: 'l1' }]);
    expect(readinessFixRows([{ ...base, kind: 'pay' }], ASOF)[0]!.choices.map((c) => c.key)).toEqual(['incomeElsewhere']);
  });
});

describe('estimatesCanAnswer (D-57, C-1)', () => {
  it('is true only when no month is before the current one', () => {
    expect(estimatesCanAnswer({ months: [], asOf: ASOF })).toBe(true);
    expect(estimatesCanAnswer({ months: [{ month: '2026-10' }], asOf: ASOF })).toBe(true);
    expect(estimatesCanAnswer({ months: [{ month: '2026-09' }, { month: '2026-10' }], asOf: ASOF })).toBe(false);
  });

  it('agrees with the engine: with typed estimates and no earlier month the result is ready', () => {
    const rough = { income: minorUnits(400000), expenses: minorUnits(250000), saving: minorUnits(0), debt: minorUnits(0), invest: minorUnits(0), asOf: ASOF };
    const fresh = inputsOf({ asOf: ASOF, typedEstimates: rough, months: [monthOf('2026-10', [], { full: false })] });
    expect(estimatesCanAnswer(fresh)).toBe(true);
    expect(readiness(fresh).ready).toBe(true);
    const withHistory = { ...fixture({ pendingLines: true }), typedEstimates: rough };
    expect(estimatesCanAnswer(withHistory)).toBe(false);
    expect(readiness(withHistory).ready).toBe(false);
  });
});
