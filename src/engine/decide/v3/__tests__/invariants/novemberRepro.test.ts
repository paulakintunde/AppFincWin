/**
 * 05.4-24 Task 1 (D-24 investigation, 05.3 handoff item 1): the November mismatch, reproduced on an invented person (D-04).
 *
 * Seen on the Pixel (05.3 round 2): Decide home said November is "on track to leave $25,661.20"; on the same day and data a $35
 * check's answer said "November is heading about $3,101.25 overspent". The price cannot explain a gap of about $28,700.
 *
 * The invented person below has the same shape: a $35 check, and Home and the answer about $2,700 apart.
 * - Pay $4,000 on the 25th, rent $1,500 on the 3rd.
 * - Three complete months of everyday spending at $1,800.
 * - Three later months marked not complete (thin), with $4,500 of everyday spending logged in each.
 * - November so far: rent paid, $600 of everyday spending, $3,000 in the account.
 *
 * The three candidate causes (05.4-RESEARCH "The November mismatch"), each tested below:
 * 1. The answer used the stricter reading in stricterOf (thin months read as full), whose month differs from Home's reading.
 *    CONFIRMED: Home (no price: both readings ask, the tie goes to the first) reads the months as given; the $35 check is
 *    stricter on the all-full reading, so the answer carries that reading's MonthModel.
 * 2. Home and the answer were judged on different inputs. RULED OUT: the same Prepared serves both here, and the 05.3 branch
 *    built both from the same snapshot (computeV3 and computeV3Many both default `uses` to {}).
 * 3. Home showed a different quantity (the typical month) from the notice (this month). RULED OUT: 05.3 Home drew
 *    monthBar(month).left, which is MonthModel.monthLeft, the same quantity as the month_heading_short notice.
 *
 * The fix (05.4-24 Task 2) is in the last block: Home and the answer read one month figure (afterBuy.ts).
 */
import { minorUnits } from '../../../../money/types';
import { homeFigure } from '../../afterBuy';
import { judgeCheck, prepare } from '../../prepare';
import type { CheckV2 } from '../../types';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';

const mu = minorUnits;
const PRICE = 3_500;

function novemberPerson(): ReturnType<typeof inputsOf> {
  const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-25', amount: 400_000 });
  const rent = v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-03', amount: 150_000 });
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m, k) => {
    const thin = k >= 3;
    return monthOf(
      m,
      [
        v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 400_000, role: 'income', seriesId: 'pay' }),
        v3Line({ id: `r-${m}`, date: `${m}-03`, amount: 150_000, seriesId: 'rent' }),
        v3Line({ id: `e-${m}`, date: `${m}-12`, amount: thin ? 450_000 : 180_000 }),
      ],
      { full: !thin }
    );
  });
  const nov = monthOf(
    '2026-11',
    [v3Line({ id: 'r-nov', date: '2026-11-03', amount: 150_000, seriesId: 'rent' }), v3Line({ id: 'e-nov', date: '2026-11-08', amount: 60_000 })],
    { full: false }
  );
  return inputsOf({ asOf: '2026-11-15', series: [pay, rent], months: [...months, nov], balance: mu(300_000), unspent: { amount: mu(300_000), at: '2026-11-15' } });
}

/** What 05.3 Home evaluated: the stored inputs `{}`, so no price. */
const NO_PRICE = { ...checkOnce(0), price: null } as unknown as CheckV2;

describe('05.4-24 the November mismatch, reproduced (invented person)', () => {
  const p = prepare(novemberPerson());
  const home = judgeCheck(p, NO_PRICE);
  const answer = judgeCheck(p, checkOnce(PRICE));

  it('the shape: Home and the $35 answer differ by far more than the price', () => {
    expect(home.month.monthLeft).toBe(70_000); // "November is on track to leave $700"
    expect(answer.month.monthLeft).toBe(-200_000);
    expect(answer.result.notices).toContainEqual({ code: 'month_heading_short', values: { month: '2026-11', short: 200_000 } }); // "heading about $2,000 overspent"
    expect(home.month.monthLeft - answer.month.monthLeft).toBeGreaterThan(50 * PRICE);
  });

  it('cause 1 (confirmed): the answer is the stricter all-full reading; Home is the months as given', () => {
    expect(p.readings).toHaveLength(2);
    const [given, allFull] = p.readings as readonly [(typeof p.readings)[number], (typeof p.readings)[number]];
    expect(home.month).toBe(given.month);
    expect(answer.month).toBe(allFull.month);
    expect(answer.result.reasons).toContain('thin_history_stricter');
    // The two readings disagree only through the everyday rate still to come: the thin months, read as full, raise it.
    expect([given.month.e, allFull.month.e]).toEqual([180_000, 450_000]);
    expect([given.month.erest, allFull.month.erest]).toEqual([120_000, 390_000]);
    expect([given.month.moneyIn, allFull.month.moneyIn]).toEqual([400_000, 400_000]);
  });

  it('cause 2 (ruled out): one Prepared, so the same inputs, gives both figures', () => {
    expect(home.month.month).toBe(answer.month.month);
    expect(p.readings[0]!.inputs).toBe(p.inputs);
  });

  it('cause 3 (ruled out): Home and the notice read the same quantity, MonthModel.monthLeft', () => {
    const heading = answer.result.notices.find((n) => n.code === 'month_heading_short');
    expect(heading?.values['short']).toBe(-answer.month.monthLeft);
    expect(home.month.monthLeft).toBe(p.readings[0]!.month.monthLeft);
  });
});

describe('05.4-24 the November mismatch is gone (regression)', () => {
  const p = prepare(novemberPerson());

  it('Home reads the stricter month figure, and the $35 answer differs from it by exactly the price', () => {
    const home = homeFigure(p);
    expect(home).toBe(-200_000);
    const answer = judgeCheck(p, checkOnce(PRICE)).result;
    expect(answer.afterBuy.before).toBe(home);
    expect(home - answer.afterBuy.month).toBe(PRICE);
    expect(answer.facts.find((f) => f.code === 'month_left_after')?.values['left'] ?? answer.afterBuy.month).toBe(answer.afterBuy.month);
  });

  it('every price starts from the Home figure, and the no-price ask shows it', () => {
    // Whichever reading decides the code for a price, the figure starts from Home's.
    for (const price of [0, 100, PRICE, 60_000]) {
      const r = judgeCheck(p, checkOnce(price)).result;
      expect({ price, before: r.afterBuy.before }).toEqual({ price, before: homeFigure(p) });
    }
    expect(judgeCheck(p, NO_PRICE).result.afterBuy).toMatchObject({ before: -200_000, month: -200_000 });
  });
});
