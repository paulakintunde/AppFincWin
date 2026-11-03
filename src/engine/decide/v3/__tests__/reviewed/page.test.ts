import { corpus, type ReviewedChange } from './corpus';
import * as fs from 'fs';
import * as path from 'path';
import { auditOf, breakdown, buildPage, rateText, situationHtml, words } from './page';
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
    for (const fix of ['FIN-01', 'FIN-03']) {
      const html = buildPage(fix, file.changes.filter((c) => c.fixId === fix), cases);
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
});
