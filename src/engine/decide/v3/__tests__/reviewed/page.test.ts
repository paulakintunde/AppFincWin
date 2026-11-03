import { corpus, type ReviewedChange } from './corpus';
import * as fs from 'fs';
import * as path from 'path';
import { auditOf, breakdown, buildPage, priceShareOfPay, rateText, situationHtml, situationRows, words } from './page';
import { SHORT_PLAN_CASES, shortPlan, type ShortPlanCase } from '../helpers/shortPlanFixtures';
import { TIER_CASES, rileyTier, type TierCase } from '../helpers/tierFixtures';

const cases = corpus();
const persona = cases.find((c) => c.key.startsWith('persona:audit-p4-overdrawn:6000'));
const gen = cases.find((c) => c.key === 'gen:3');
const change = (key: string): ReviewedChange => ({ fixId: 'T', key, before: { code: 'needs_input', variant: null, afterBuyMonth: null }, after: { code: 'not_yet', variant: 'not_covered', afterBuyMonth: null }, reason: '', approved: true, approvedAt: null });

describe('reviewed page', () => {
  it('shows a situation for a persona key and a generated key', () => {
    expect(persona).toBeDefined();
    expect(gen).toBeDefined();
    const html = buildPage('T', [change(persona!.key), change(gen!.key)], cases);
    expect(html).toContain('<summary>Situation and full breakdown</summary>');
    expect(html).toContain('Generated person 3 (made up from a fixed seed, the same every run)');
    expect(html).toContain('Buying');
    expect(html).toContain('Check date');
    expect(situationHtml(persona!)).toMatch(/[£$€]/);
    expect(html).not.toContain('<script');
  });
  it('uses no banned words', () => {
    const html = buildPage('T', cases.slice(0, 40).map((c) => change(c.key)), cases).toLowerCase();
    for (const w of ['advice', 'recommend', 'you should', 'suggestion']) expect(html).not.toContain(w);
  });
  it('shows every rate as a real percent between 0 and 100 (D-53)', () => {
    expect(rateText(79000000000n)).toBe('7.9%');
    expect(rateText(0n)).toBe('0%');
    expect(rateText(null)).toBe('');
    expect(() => rateText(1010000000000n)).toThrow(RangeError);
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'changes.json'), 'utf8')) as { changes: ReviewedChange[] };
    for (const fix of ['FIN-01', 'FIN-03', 'FIN-01b']) {
      const listed = file.changes.filter((c) => c.fixId === fix);
      if (listed.length === 0) continue;
      // 05.4-56 (D-69): a price's share of monthly pay is not a rate and may pass 100% (up to 1,500% by design); it is left out here
      // and pinned by its own test below (the audit notes also name the draw, "0.1% to 1,500% of pay").
      const html = buildPage(fix, listed, cases).replace(/(\d[\d,]*(?:\.\d+)?% to )?\d[\d,]*(?:\.\d+)?% of (monthly )?pay/g, '');
      const rates = [...html.matchAll(/(-?\d[\d,]*(?:\.\d+)?)%/g)].map((m) => Number((m[1] as string).replace(/,/g, '')));
      expect(rates.length).toBeGreaterThan(0);
      for (const r of rates) expect(r >= 0 && r <= 100).toBe(true);
    }
  });
  it('has an audit entry for every FIN-01 and FIN-03 change, and the full breakdown', () => {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'changes.json'), 'utf8')) as { changes: ReviewedChange[] };
    const fin01 = file.changes.filter((c) => c.fixId === 'FIN-01');
    expect(file.changes.filter((c) => c.fixId === 'FIN-03').length).toBe(5);
    expect(fin01.length).toBeGreaterThan(0);
    for (const c of file.changes.filter((x) => x.fixId === 'FIN-01' || x.fixId === 'FIN-03')) expect(auditOf(c.key)).not.toBeNull();
    const html = buildPage('FIN-01', fin01, cases);
    for (const t of ['Money in this month', 'Already spent this month', 'Still to come this month', 'After bills due before payday', 'Unused overdraft', 'Expected at month end', 'Starter (D-51)', 'Locked', 'Split', 'What the answer says', '90-day cash path', 'Lowest with the purchase', 'Step by step', 'Right answer:']) expect(html).toContain(t);
    for (const w of ['advice', 'recommend', 'you should', 'suggestion', '<script', 'not built yet', '{{']) expect(html.toLowerCase()).not.toContain(w);
  });

  const rowsOf = (key: string, title: string, mutate?: (c: (typeof cases)[number]) => (typeof cases)[number]): [string, string][] => {
    const base = cases.find((c) => c.key === key);
    expect(base).toBeDefined();
    const c = mutate ? mutate(base!) : base!;
    return breakdown(c).sections.find((s) => s.title === title)?.rows ?? [];
  };
  const text = (rows: [string, string][]): string => rows.map((r) => r.join(' ')).join(' / ');

  it('says every line of the answer in the en.ts wording: the Riley plan shows the depletion lines (D-54, D-63)', () => {
    const says = text(rowsOf('persona:riley:900000:plan', 'What the answer says'));
    expect(says).toContain('Your usual month, already $300.00 overspent');
    expect(says).toContain('This plan costs $1,526.06 in interest');
    expect(says).toContain('No: your month is already short');
    expect(says).not.toContain('{{');
  });

  it('names extra savings in the split (Leo $500, D-56, D-62)', () => {
    const split = text(rowsOf('persona:leo:50000:cash', 'Split'));
    expect(split).toContain("Extra savings (above the safety net's size)");
    expect(text(rowsOf('persona:leo:50000:cash', 'What the answer says'))).toContain('From your extra savings: uses $400.00');
  });

  it('counts the Maya pay from history on her usual payday (D-52), with nothing "not built yet"', () => {
    const pathRows = rowsOf('persona:maya:6000:cash', '90-day cash path');
    const pay = pathRows.find(([k]) => k === 'Pay counted');
    expect(pay?.[1]).toContain('2026-11-05 $2,800.00');
    expect(pay?.[1]).toContain('2026-12-05 $2,800.00');
    expect(text(pathRows)).not.toContain('not built yet');
  });

  it('shows the D-61 lock state in the Safety net section', () => {
    const locked = text(rowsOf('persona:riley:900000:plan', 'Safety net'));
    expect(locked).toContain('locked: left out of the answer');
    const unlocked = text(
      rowsOf('persona:riley:900000:plan', 'Safety net', (c) => ({ ...c, inputs: { ...c.inputs, safetyNet: { ...(c.inputs.safetyNet as NonNullable<typeof c.inputs.safetyNet>), locked: false } } })),
    );
    expect(unlocked).toContain('unlocked: may lend');
  });
  // 05.4-52 (D-65): the three tiers and Large, on the Riley tier people (the same fixtures as the 05.4-51 drafts SN-21..SN-24,
  // through toEngineInputs). Riley: usual month $300 short; locked $2,000 net.
  const tierCase = (o: TierCase, key: string): (typeof cases)[number] => ({ key, label: key, ...rileyTier(o) });
  const stepsOf = (o: TierCase, key: string): { steps: string[]; says: string } => {
    const b = breakdown(tierCase(o, key));
    return { steps: b.steps, says: text(b.sections.find((s) => s.title === 'What the answer says')?.rows ?? []) };
  };

  it('names each D-65 tier in words, code kept in brackets', () => {
    expect(words({ code: 'fits_unspent', variant: 'month_short_small', afterBuyMonth: null })).toBe('Fits, but your month is already short (code: Fits from spare money)');
    expect(words({ code: 'fits_unspent', variant: 'month_short_moderate', afterBuyMonth: null })).toBe('Fits from spare money, but your month is already short (code: Fits from spare money)');
    expect(words({ code: 'fits_unspent', variant: 'month_short_moderate_extra', afterBuyMonth: null })).toBe('Fits from extra savings, but your month is already short (code: Fits from spare money)');
    expect(words({ code: 'not_yet', variant: 'month_already_short', afterBuyMonth: null })).toBe('No: your month is already short (code: Not yet)');
  });

  it('Small: the tier line and the page sum (SN-21, $60)', () => {
    const { steps, says } = stepsOf(TIER_CASES.small, 'tier:small');
    expect(says).toContain('Fits, but your month is already short');
    expect(says).toContain('This $60.00 fits your $4,350.00 of spare money and extra savings. Your usual month is $300.00 short.');
    expect(steps.join(' ')).toContain('= $4,350.00; usual shortfall $300.00 a month; $4,350.00 / $300.00 = 14 months; after this purchase ($60.00): 14 months');
    expect(steps.join(' ')).toContain('so the tier is Small (D-65)');
  });

  it('Moderate: "from N months to M." as plain numbers and the page sum (SN-22, $1,000)', () => {
    const { steps, says } = stepsOf(TIER_CASES.moderate, 'tier:moderate');
    expect(says).toContain('Fits from spare money, but your month is already short');
    expect(says).toContain('from 14 months to 11.');
    expect(steps.join(' ')).toContain('$4,350.00 / $300.00 = 14 months; after this purchase ($1,000.00): 11 months');
    expect(steps.join(' ')).toContain('so the tier is Moderate, from spare money (D-65)');
  });

  it('Moderate from extra savings: the sum counts money above the net size, never the locked net (SN-23, $2,000)', () => {
    const { steps, says } = stepsOf(TIER_CASES.moderateExtra, 'tier:extra');
    expect(says).toContain('Fits from extra savings, but your month is already short');
    expect(says).toContain('from 14 months to 7.');
    expect(steps.join(' ')).toContain('extra savings $4,000.00 (never the locked safety net) = $4,350.00');
    expect(steps.join(' ')).toContain('so the tier is Moderate, from extra savings (D-65)');
  });

  it('Large names its reason (SN-24 locked net; the Riley plan payment)', () => {
    const large = stepsOf(TIER_CASES.large, 'tier:large');
    expect(large.says).toContain('No: your month is already short');
    expect(large.steps.join(' ')).toContain('only the locked safety net ($2,000.00) could pay it');
    const riley = cases.find((c) => c.key === 'persona:riley:900000:plan');
    expect(breakdown(riley!).steps.join(' ')).toContain('a plan payment of about');
    // Riley $9,000 cash: the path goes $9,600 below $0, more than the $2,000 net, so the locked net is not named as the payer.
    const rileyCash = cases.find((c) => c.key === 'persona:riley:900000:cash');
    expect(breakdown(rileyCash!).steps.join(' ')).toContain('goes $9,600.00 below $0.00 with it, more than even the locked safety net ($2,000.00) holds');
    for (const k of Object.keys(TIER_CASES) as (keyof typeof TIER_CASES)[]) {
      const b = breakdown(tierCase(TIER_CASES[k], k));
      const all = [...b.steps, ...b.sections.flatMap((s) => s.rows.flat())].join(' ');
      expect(all).not.toContain('{{');
      expect(all).toContain('How long your money lasts');
      // D-66: the net is locked, so no "your safety net would last" line.
      expect(b.sections.find((s) => s.title === 'What the answer says')?.rows.some(([key]) => key === 'Fact net_lasts' || key === 'Fact net_lasts_without')).toBe(false);
    }
  });

  // 05.4-56 (D-68, D-69): price against pay, the plan in brief, and the D-68 step on the 05.4-53 hand-worked people
  // (helpers/shortPlanFixtures.ts: pay $3,000, usual month leaves $500, $3,500 spare, asOf 2026-11-15, day 90 = 2027-02-13).
  const sp = (o: ShortPlanCase, key: string): (typeof cases)[number] => ({ key, label: key, ...shortPlan(o) });
  const all = (c: (typeof cases)[number]): { steps: string; plan: string; says: string } => {
    const b = breakdown(c);
    return {
      steps: b.steps.join(' / '),
      plan: text(b.sections.find((s) => s.title === 'Plan')?.rows ?? []),
      says: text(b.sections.find((s) => s.title === 'What the answer says')?.rows ?? []),
    };
  };

  it('shows the price as a real percent of monthly pay, to 2 decimals, and says which pay (D-69)', () => {
    const q = sp(SHORT_PLAN_CASES.qualifies, 'sp:q');
    expect(priceShareOfPay(q.inputs, q.check)).toBe('Price $1,800.00 is 60.00% of monthly pay $3,000.00 (pay)');
    const g70 = cases.find((c) => c.key === 'gen:70')!;
    expect(text(situationRows(g70.inputs, g70.check))).toContain("Price $4,773.74 is 122.11% of monthly pay $3,909.38 (a freelancer's steady amount)");
    for (const c of cases.filter((x) => x.key.startsWith('gen:'))) {
      const line = priceShareOfPay(c.inputs, c.check);
      expect(line).not.toBeNull();
      expect(line).toMatch(/^Price \$[\d,]+\.\d{2} is \d+\.\d{2}% of monthly pay \$[\d,]+\.\d{2} \((pay|a freelancer's steady amount)\)$/);
    }
  });

  it('shows each plan in brief: payments, how often, term in months, APR as a real percent, first and last payment', () => {
    expect(all(sp(SHORT_PLAN_CASES.qualifies, 'sp:q')).plan).toContain('In brief 3 payments every month over 3 months, at 0% a year (APR), first payment 2026-11-15, last payment 2027-01-15');
    expect(all(sp(SHORT_PLAN_CASES.fortnight, 'sp:f')).plan).toContain('4 payments every 2 weeks over 2 months, at 0% a year (APR), first payment 2026-11-15, last payment 2026-12-27');
    expect(all(sp({ ...SHORT_PLAN_CASES.qualifies, apr: '19.9' }, 'sp:apr')).plan).toContain('at 19.9% a year (APR)');
    expect(all(cases.find((c) => c.key === 'gen:136')!).plan).toContain('In brief 13 payments every week over 3 months, at 0% a year (APR), first payment 2026-10-03, last payment 2026-12-26');
  });

  it('a D-68 answer shows the page\'s own judged-by-cash step and the caution line in the en.ts wording', () => {
    const q = all(sp(SHORT_PLAN_CASES.qualifies, 'sp:q'));
    expect(q.steps).toContain(
      'Judged by cash (D-68): the last payment is on 2027-01-15, before the 90 days end on 2027-02-13; with every payment on its date the lowest point is $2,700.00 on 2027-01-31, never below $0.00, with no overdraft and no safety-net money; ' +
        "the plan's whole cost $1,800.00 (deposit $0.00 + every payment once; engine $1,800.00), covered by money on hand $3,500.00 (this month and spare money $3,500.00 + extra savings $0.00); about $600.00 a month against the usual month's $500.00 left, so it is paid from money on hand."
    );
    expect(q.says).toContain('Fact short_plan_from_cash This plan’s $600.00 a month is more than your usual month can cover, so it is paid from money on hand.');
    const x = all(sp(SHORT_PLAN_CASES.extraSavings, 'sp:x'));
    expect(x.steps).toContain('covered by money on hand $4,500.00 (this month and spare money $500.00 + extra savings $4,000.00)');
    expect(all(sp(SHORT_PLAN_CASES.alreadyShort, 'sp:s')).steps).toContain('about $600.00 a month against the usual month, already $100.00 short, so it is paid from money on hand.');
    expect(all(cases.find((c) => c.key === 'gen:70')!).steps).toContain('Judged by cash (D-68): the last payment is on 2026-10-03, before the 90 days end on 2027-01-01');
    for (const k of Object.keys(SHORT_PLAN_CASES) as (keyof typeof SHORT_PLAN_CASES)[]) {
      const r = all(sp(SHORT_PLAN_CASES[k], k));
      expect(`${r.steps} ${r.plan} ${r.says}`).not.toContain('{{');
      expect(r.steps).not.toContain('DISAGREE');
    }
  });

  it('a plan inside the 90 days that D-68 does not take says why in one step', () => {
    const why = (c: (typeof cases)[number]): string => breakdown(c).steps.filter((s) => s.startsWith('Not judged by cash (D-68)')).join(' / ');
    expect(why(sp(SHORT_PLAN_CASES.pathBelow, 'sp:b'))).toContain('but the path goes below $0.00 (lowest -$800.00 on 2027-01-31).');
    expect(why(sp(SHORT_PLAN_CASES.unlockedNet, 'sp:u'))).toContain('but it needs the safety net');
    expect(why(sp(SHORT_PLAN_CASES.running, 'sp:r'))).toContain('but it has a running cost of $20.00 a month.');
    expect(why(sp({ everyday: 400_000, saved: 200_000, price: 90_000, months: 3 }, 'sp:fits'))).toContain('but the monthly part already fits (about $300.00 a month');
    expect(why(sp({ everyday: 400_000, saved: 200_000, price: 450_000, months: 3 }, 'sp:big'))).toContain('money on hand $3,500.00 (this month and spare money $3,500.00 + extra savings $0.00) does not cover $4,500.00.');
    expect(why(cases.find((c) => c.key === 'gen:136')!)).toContain('there is no confirmed spare-money figure, so earlier money and extra savings are not counted) does not cover $32,964.49.');
    // Plans past the 90 days and cash buys carry no D-68 step.
    for (const c of [sp(SHORT_PLAN_CASES.longShort, 'sp:l'), cases.find((x) => x.key === 'persona:riley:900000:cash')!]) expect(breakdown(c).steps.some((s) => s.includes('(D-68)'))).toBe(false);
  });

  it('05.4-19 (D-47): the page own hold-back sum for a yearly bill, with the built-up share as a real percent', () => {
    const hana = cases.find((c) => c.key === 'persona:audit-p8:50000:cash')!;
    const step = breakdown(hana).steps.find((x) => x.includes('(D-47)'))!;
    expect(step).toContain('$1,200.00 every 12 months, last paid 2026-03-10, next due 2027-03-10.');
    expect(step).toContain('Built up: 7 of 12 months (58.33%) = $700.00.');
    expect(step).toContain('4 whole months before 2027-03-10 cover $700.00 x 4 = $2,800.00.');
    expect(step).toContain('Not covered: the larger of $0.00 and $1,200.00 - $2,800.00 = $0.00.');
    expect(step).toContain('Held back: the smaller of $700.00 and $0.00 = $0.00.');
    expect(step).not.toContain('DISAGREE');
    expect(breakdown(hana).steps).toContain('Held back from spare money for these bills: $0.00.');
    // a thin leftover: the usual month counts this bill at a twelfth a month (no yearly-bill choice made), so a $10,000 bill leaves
    // the month $33.33 short: nothing is covered, and the whole $5,833.33 built up is held back
    const big = { ...hana, inputs: { ...hana.inputs, series: hana.inputs.series.map((x) => (x.id === 'audit-p8-ins' ? { ...x, amount: 1_000_000 as typeof x.amount } : x)) } };
    const thin = breakdown(big).steps.find((x) => x.includes('(D-47)'))!;
    expect(thin).toContain('Built up: 7 of 12 months (58.33%) = $5,833.33.');
    expect(thin).toContain('The usual month leaves $0.00 (it is $33.33 short, so it covers nothing)');
    expect(thin).toContain('Held back: the smaller of $5,833.33 and $10,000.00 = $5,833.33 (the whole built-up share).');
    expect(thin).not.toContain('DISAGREE');
    expect(breakdown(big).steps).toContain('Held back from spare money for these bills: $5,833.33 (taken off after the month-end cap, so the cap never cancels it).');
    // a check with no yearly bill has no D-47 step
    expect(breakdown(cases.find((c) => c.key === 'gen:3')!).steps.some((x) => x.includes('(D-47)'))).toBe(false);
  });
  it('05.4-19: the FIN-11 page lists the checks the rule reads whose answer stays the same; other pages do not', () => {
    const html = buildPage('FIN-11', [], cases);
    expect(html).toContain('<h2>Checks this rule reads, answer unchanged (5)</h2>');
    expect(html).toContain('persona:audit-p8:900000:plan');
    expect(html).not.toContain('DISAGREE');
    expect(buildPage('T', [], cases)).not.toContain('Checks this rule reads');
  });
});
