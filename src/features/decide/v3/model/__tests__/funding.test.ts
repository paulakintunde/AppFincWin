import fc from 'fast-check';
import { fundingStrip } from '../funding';

jest.setTimeout(60000);

type Seg = { source: 'month' | 'unspent_earlier' | 'envelope' | 'emergency'; amount: number };
interface Opts {
  code?: string;
  variant?: string | null;
  split?: Seg[];
  facts?: { code: string; values: Record<string, unknown> }[];
  dayOne?: number;
  monthly?: number;
  running?: number;
  typicalLeft?: number | null;
  cash?: unknown;
  envelopeId?: string | null;
}
const ev = (o: Opts) =>
  ({
    result: { code: o.code ?? 'fits_unspent', variant: o.variant ?? null, split: o.split ?? [], facts: o.facts ?? [] },
    purchase: { dayOne: o.dayOne ?? 0, monthly: o.monthly ?? 0, runningMonthly: o.running ?? 0, envelopeId: o.envelopeId ?? null },
    month: { month: '2026-10', typicalLeft: o.typicalLeft === undefined ? 100000 : o.typicalLeft },
    cash: o.cash ?? { kind: 'ok' },
  }) as never;
const sum = (s: { parts: readonly { amount: number }[] }) => s.parts.reduce((a, p) => a + p.amount, 0);

describe('fundingStrip', () => {
  it('Sam fits_unspent: 42500 from the month and 77500 from earlier months', () => {
    const s = fundingStrip(ev({ dayOne: 120000, split: [{ source: 'month', amount: 42500 }, { source: 'unspent_earlier', amount: 77500 }] }))!;
    expect(s.headingKey).toBe('decide.v3.ui.answer.whereFrom');
    expect(s.headingParams).toEqual({ price: 120000 });
    expect(s.parts).toEqual([
      { amount: 42500, labelKey: 'decide.v3.ui.answer.fromMonth', params: { month: '2026-10' }, style: 'accent' },
      { amount: 77500, labelKey: 'decide.v3.ui.answer.fromEarlier', style: 'accentHalf' },
    ]);
    expect(s.uncovered).toBe(0);
  });

  it('not_yet adds a dashed not-covered part', () => {
    const s = fundingStrip(
      ev({ code: 'not_yet', variant: 'not_covered', dayOne: 400000, split: [{ source: 'month', amount: 42500 }, { source: 'unspent_earlier', amount: 197500 }] })
    )!;
    expect(s.headingKey).toBe('decide.v3.ui.answer.whereWould');
    expect(s.parts[2]).toEqual({ amount: 160000, labelKey: 'decide.v3.ui.answer.notCovered', style: 'dashed' });
    expect(s.uncovered).toBe(160000);
  });

  it('fits_month adds a soft left-after part; none when nothing is left', () => {
    const base = { code: 'fits_month', dayOne: 10000, split: [{ source: 'month', amount: 10000 }] as Seg[] };
    const s = fundingStrip(ev({ ...base, facts: [{ code: 'month_left_after', values: { month: '2026-10', left: 5000 } }] }))!;
    expect(s.parts[1]).toEqual({ amount: 5000, labelKey: 'decide.v3.ui.answer.leftAfter', style: 'soft' });
    expect(fundingStrip(ev({ ...base, facts: [{ code: 'month_left_after', values: { month: '2026-10', left: -5 } }] }))!.parts).toHaveLength(1);
    expect(fundingStrip(ev({ ...base }))!.parts).toHaveLength(1);
  });

  it('emergency and envelope parts carry their style and ids', () => {
    const s = fundingStrip(
      ev({
        code: 'emergency_use',
        dayOne: 3000,
        split: [{ source: 'envelope', amount: 1000 }, { source: 'emergency', amount: 2000 }],
        facts: [{ code: 'envelope_used', values: { used: 1000, envelopeId: 'e1' } }],
      })
    )!;
    expect(s.parts[0]).toEqual({ amount: 1000, labelKey: 'decide.v3.ui.answer.fromEnvelope', params: { envelopeId: 'e1' }, style: 'ink' });
    expect(s.parts[1]).toMatchObject({ labelKey: 'decide.v3.ui.answer.fromEmergency', style: 'warn' });
    const viaPurchase = fundingStrip(ev({ dayOne: 10, split: [{ source: 'envelope', amount: 10 }], envelopeId: 'e2' }))!;
    expect(viaPurchase.parts[0]!.params).toEqual({ envelopeId: 'e2' });
    expect(fundingStrip(ev({ dayOne: 10, split: [{ source: 'envelope', amount: 10 }] }))!.parts[0]!.params).toBeUndefined();
  });

  it('monthly_short: what is left in a typical month and what is overspent each month', () => {
    const s = fundingStrip(ev({ code: 'monthly_short', monthly: 30000, running: 5000, typicalLeft: 20000 }))!;
    expect(s.headingKey).toBe('decide.v3.ui.answer.eachMonth');
    expect(s.headingParams).toEqual({ amount: 35000 });
    expect(s.parts).toEqual([
      { amount: 20000, labelKey: 'decide.v3.ui.answer.leftTypical', style: 'accent' },
      { amount: 15000, labelKey: 'decide.v3.ui.answer.overspentEach', style: 'dashed' },
    ]);
    expect(fundingStrip(ev({ code: 'monthly_short', monthly: 100, typicalLeft: -50 }))!.parts).toEqual([
      { amount: 100, labelKey: 'decide.v3.ui.answer.overspentEach', style: 'dashed' },
    ]);
    expect(fundingStrip(ev({ code: 'monthly_short', monthly: 100, typicalLeft: null }))!.parts).toHaveLength(1);
    expect(sum(fundingStrip(ev({ code: 'monthly_short', monthly: 100, typicalLeft: 900 }))!)).toBe(100);
  });

  it('payday: cash today and the part short until payday', () => {
    const s = fundingStrip(ev({ code: 'not_yet', variant: 'payday', dayOne: 50000, cash: { kind: 'payday', until: '2026-10-28', shortBy: 12000 } }))!;
    expect(s.headingKey).toBe('decide.v3.ui.answer.cashBeforePayday');
    expect(s.parts).toEqual([
      { amount: 38000, labelKey: 'decide.v3.ui.answer.cashToday', style: 'accent' },
      { amount: 12000, labelKey: 'decide.v3.ui.answer.shortUntil', params: { date: '2026-10-28' }, style: 'dashed' },
    ]);
    const all = fundingStrip(ev({ code: 'not_yet', variant: 'payday', dayOne: 5000, cash: { kind: 'payday', until: '2026-10-28', shortBy: 99999 } }))!;
    expect(all.parts).toHaveLength(1);
    expect(sum(all)).toBe(5000);
  });

  it('a payday variant without a payday cash check reads as a normal one-off', () => {
    const s = fundingStrip(ev({ code: 'not_yet', variant: 'payday', dayOne: 100, split: [{ source: 'month', amount: 100 }], cash: { kind: 'ok' } }))!;
    expect(s.headingKey).toBe('decide.v3.ui.answer.whereWould');
  });

  it('periodic fit: this payment and what is left in a typical month', () => {
    const s = fundingStrip(ev({ monthly: 20000, running: 0, typicalLeft: 90000 }))!;
    expect(s.headingKey).toBe('decide.v3.ui.answer.typicalMonth');
    expect(s.headingParams).toEqual({ amount: 90000 });
    expect(s.parts).toEqual([
      { amount: 20000, labelKey: 'decide.v3.ui.answer.thisPayment', style: 'ink' },
      { amount: 70000, labelKey: 'decide.v3.ui.answer.leftTypical', style: 'soft' },
    ]);
    expect(fundingStrip(ev({ monthly: 20000, typicalLeft: 20000 }))!.parts).toHaveLength(1);
    expect(fundingStrip(ev({ monthly: 20000, typicalLeft: -5 }))!.headingParams).toEqual({ amount: 0 });
    expect(fundingStrip(ev({ monthly: 20000, typicalLeft: null }))).toBeNull();
    expect(fundingStrip(ev({ monthly: 0, typicalLeft: 5 }))).toBeNull();
  });

  it('needs_input and no purchase give no strip', () => {
    expect(fundingStrip(ev({ code: 'needs_input' }))).toBeNull();
    expect(fundingStrip({ ...(ev({}) as object), purchase: null } as never)).toBeNull();
  });

  it('property: parts are never negative and sum to the drawn total', () => {
    const src = fc.constantFrom('month', 'unspent_earlier', 'envelope', 'emergency') as fc.Arbitrary<Seg['source']>;
    fc.assert(
      fc.property(
        fc.array(fc.record({ source: src, amount: fc.integer({ min: 0, max: 1_000_000 }) }), { maxLength: 4 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.constantFrom('fits_unspent', 'not_yet', 'emergency_use'),
        (split, dayOne, code) => {
          const total = split.reduce((a, s) => a + s.amount, 0);
          const s = fundingStrip(ev({ code, dayOne: Math.max(dayOne, total), split }));
          if (s === null) return split.length === 0 && true;
          expect(s.parts.every((p) => p.amount >= 0)).toBe(true);
          expect(sum(s)).toBe(Math.max(dayOne, total));
          return true;
        }
      )
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: -1000, max: 2_000_000 }), (monthly, typ) => {
        const s = fundingStrip(ev({ code: 'monthly_short', monthly, typicalLeft: typ }))!;
        expect(s.parts.every((p) => p.amount >= 0)).toBe(true);
        expect(sum(s)).toBe(monthly);
      })
    );
  });
});
