import { corpus, type ReviewedChange } from './corpus';
import * as fs from 'fs';
import * as path from 'path';
import { auditOf, buildPage, d52Pay, rateText, situationHtml } from './page';

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
    const mine = file.changes.filter((c) => c.fixId === 'FIN-01' || c.fixId === 'FIN-03');
    expect(mine.length).toBe(52);
    for (const c of mine) expect(auditOf(c.key)).not.toBeNull();
    const html = buildPage('FIN-01', mine.filter((c) => c.fixId === 'FIN-01'), cases);
    for (const t of ['Money in this month', 'Already spent this month', 'Still to come this month', 'Available now', 'Expected at month end', 'Starter (D-51)', '90-day cash path', 'Lowest with the purchase', 'Step by step', 'Right answer:', 'D-54 lines']) expect(html).toContain(t);
    for (const w of ['advice', 'recommend', 'you should', 'suggestion', '<script']) expect(html.toLowerCase()).not.toContain(w);
  });
  it('names D-52 for an irregular earner with no pay series (maya) and not for a salaried one (sam)', () => {
    const maya = cases.find((c) => c.key === 'persona:maya:6000:cash');
    const sam = cases.find((c) => c.key === 'persona:sam:900000:cash');
    expect(d52Pay(maya!.inputs)).toEqual({ day: 5, low: 280000, months: 6 });
    expect(d52Pay(sam!.inputs)).toBeNull();
  });
});
