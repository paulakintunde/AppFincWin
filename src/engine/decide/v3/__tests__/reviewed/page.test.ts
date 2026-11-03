import { corpus, type ReviewedChange } from './corpus';
import { buildPage, situationHtml } from './page';

const cases = corpus();
const persona = cases.find((c) => c.key.startsWith('persona:audit-p4-overdrawn:6000'));
const gen = cases.find((c) => c.key === 'gen:3');
const change = (key: string): ReviewedChange => ({ fixId: 'T', key, before: { code: 'needs_input', variant: null, afterBuyMonth: null }, after: { code: 'not_yet', variant: 'not_covered', afterBuyMonth: null }, reason: '', approved: true, approvedAt: null });

describe('reviewed page', () => {
  it('shows a situation for a persona key and a generated key', () => {
    expect(persona).toBeDefined();
    expect(gen).toBeDefined();
    const html = buildPage('T', [change(persona!.key), change(gen!.key)], cases);
    expect(html).toContain('<summary>Situation</summary>');
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
});
