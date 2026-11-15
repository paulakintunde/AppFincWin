// 06.1-85 (G-PD-2): confirming the app's own spare money figure must not make every check Not ready, and the "What is the $X for"
// ask must be answerable where it is shown. Logic-level, on the real engine (prepare + judgeCheck) with fixture data: a $12 mug.
import { judgeCheck, prepare, type V3Inputs } from '@/engine/decide/v3';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money/types';
import { spareAnchorPatch, spareSumOf, unexplainedAsk } from '../spareMoney';

const AS_OF = '2026-11-14';
const MUG = checkOnce(1200);
const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-08-15', amount: 300_000 });
const rent = v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-08-28', amount: -90_000 });
const spend = (ym: string, n: number) =>
  Array.from({ length: n }, (_, i) => v3Line({ id: `${ym}-${i}`, date: `${ym}-0${(i % 9) + 1}`, amount: -5_000, role: 'spending' }));
const paid = (ym: string) => [
  v3Line({ id: `${ym}-pay`, date: `${ym}-15`, amount: 300_000, role: 'income', seriesId: 'pay' }),
  v3Line({ id: `${ym}-rent`, date: `${ym}-28`, amount: -90_000, role: 'spending', seriesId: 'rent' }),
];
const account = { id: 'a', balance: minorUnits(1_500_000), use: { kind: 'everyday' as const } };

/** Three full months of records before this one: one reading. */
function fullHistory(): V3Inputs {
  return inputsOf({
    asOf: AS_OF,
    series: [pay, rent],
    months: [
      monthOf('2026-08', [...paid('2026-08'), ...spend('2026-08', 8)]),
      monthOf('2026-09', [...paid('2026-09'), ...spend('2026-09', 8)]),
      monthOf('2026-10', [...paid('2026-10'), ...spend('2026-10', 8)]),
      monthOf('2026-11', spend('2026-11', 2)),
    ],
    accounts: [account],
    balance: minorUnits(1_500_000),
  });
}

/** Thin months and quick estimates (the spare test account's shape): two readings, as given and the thin months read as full. */
function thinHistory(): V3Inputs {
  return inputsOf({
    asOf: AS_OF,
    series: [pay],
    months: [monthOf('2026-09', [], { full: false }), monthOf('2026-10', [], { full: false }), monthOf('2026-11', spend('2026-11', 2))],
    accounts: [account],
    balance: minorUnits(1_500_000),
    typedEstimates: { income: minorUnits(300_000), expenses: minorUnits(150_000), saving: minorUnits(0), debt: minorUnits(0), invest: minorUnits(0), asOf: '2026-11-01' },
  });
}

/** What the sheet's "That's right" saves, read back the way buildV3Inputs reads decide_settings. */
function confirmedAsShown(inputs: V3Inputs): V3Inputs {
  const p = prepare(inputs);
  const sum = spareSumOf(p);
  const patch = spareAnchorPatch(p, sum.total, sum.heldBack);
  return { ...inputs, unspent: { amount: minorUnits(patch.unspent_anchor), at: patch.unspent_anchor_at } };
}

describe('spare money confirmed as shown (G-PD-2)', () => {
  it('a $12 mug gets an answer, not the unexplained money ask', () => {
    const after = prepare(confirmedAsShown(fullHistory()));
    const e = judgeCheck(after, MUG);
    expect(e.result.missing ?? []).not.toContain('unexplained_money_question');
    expect(e.result.code).not.toBe('needs_input');
    expect(unexplainedAsk(after)).toBeNull();
  });

  it('the figure is the as-given reading’s sum and the anchor is dated on the inputs’ own day', () => {
    const p = prepare(thinHistory());
    expect(p.readings).toHaveLength(2);
    const sum = spareSumOf(p);
    expect(sum.suggested).toBe((p.readings[0] as (typeof p.readings)[number]).funds.suggested);
    expect(spareAnchorPatch(p, sum.total, sum.heldBack)).toEqual({ unspent_anchor: sum.total + sum.heldBack, unspent_anchor_at: AS_OF });
  });
});

describe('the unexplained money ask has an answer (G-PD-2)', () => {
  it('thin history: the engine still asks after a confirm; answering it with the amount asked clears it', () => {
    const confirmed = confirmedAsShown(thinHistory());
    const p = prepare(confirmed);
    expect(judgeCheck(p, MUG).result.missing).toContain('unexplained_money_question');
    const ask = unexplainedAsk(p);
    expect(ask).not.toBeNull();
    const { shown, amount } = ask as NonNullable<typeof ask>;
    expect(shown).toBeGreaterThan(confirmed.thresholds.unspentDrift);
    expect(amount).toBe(shown);
    for (const use of ['spare', 'envelope_or_goal', 'set_aside_for_bill', 'someone_elses'] as const) {
      const answered = prepare({ ...confirmed, unexplainedAnswer: { amount: minorUnits(amount), use, at: AS_OF } });
      expect(judgeCheck(answered, MUG).result.missing ?? []).not.toContain('unexplained_money_question');
      expect(unexplainedAsk(answered)).toBeNull();
    }
  });

  it('asked again above an earlier answer: the saved amount covers the earlier one too', () => {
    const confirmed = confirmedAsShown(thinHistory());
    const first = unexplainedAsk(prepare(confirmed)) as NonNullable<ReturnType<typeof unexplainedAsk>>;
    const earlier = { amount: minorUnits(1_000), use: 'spare' as const, at: AS_OF };
    const p = prepare({ ...confirmed, unexplainedAnswer: earlier });
    const again = unexplainedAsk(p) as NonNullable<ReturnType<typeof unexplainedAsk>>;
    expect(again.shown).toBe(first.shown - 1_000);
    expect(again.amount).toBe(first.shown);
    const answered = prepare({ ...confirmed, unexplainedAnswer: { ...earlier, amount: minorUnits(again.amount) } });
    expect(judgeCheck(answered, MUG).result.missing ?? []).not.toContain('unexplained_money_question');
  });

  it('nothing is asked before spare money is confirmed', () => {
    expect(unexplainedAsk(prepare(thinHistory()))).toBeNull();
  });

  it('an earlier answer that is not a whole positive amount counts as none', () => {
    const confirmed = confirmedAsShown(thinHistory());
    const first = unexplainedAsk(prepare(confirmed)) as NonNullable<ReturnType<typeof unexplainedAsk>>;
    const p = prepare({ ...confirmed, unexplainedAnswer: { amount: minorUnits(-5), use: 'spare', at: AS_OF } });
    expect(unexplainedAsk(p)).toEqual(first);
    const half = prepare({ ...confirmed, unexplainedAnswer: { amount: 0.5 as never, use: 'spare', at: AS_OF } });
    expect(unexplainedAsk(half)).toEqual(first);
  });
});
