/**
 * 06-09 compliance: every string under en.grow is declarative (no advice wording) and holds no literal money.
 * T-06-09-01. FincWin is a planning tool, so the payoff orders are named plainly and "The choice is yours."
 */
import en from '../../../i18n/locales/en';

const FORBIDDEN = /\b(advice|advise|recommend\w*|should|best|better|optimal)\b/i;
const LITERAL_MONEY = /\$\s?\d/;

function walk(node: unknown, path: string, out: [string, string][]): void {
  if (typeof node === 'string') {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`, out);
  }
}

const strings: [string, string][] = [];
walk(en.grow, 'grow', strings);

describe('en.grow copy lint', () => {
  it('has copy to scan', () => {
    expect(strings.length).toBeGreaterThan(300);
  });

  it.each(strings)('%s has no advice wording', (_path, text) => {
    expect(text).not.toMatch(FORBIDDEN);
  });

  it.each(strings)('%s holds no literal money', (_path, text) => {
    expect(text).not.toMatch(LITERAL_MONEY);
  });

  it('names the payoff orders with equal weight', () => {
    expect(en.grow.debts.orderRate).toBe('Highest rate first');
    expect(en.grow.debts.orderBalance).toBe('Smallest balance first');
    expect(en.grow.debts.choiceIsYours).toBe('The choice is yours.');
  });

  it('labels every illustration', () => {
    expect(en.grow.calc.illustrationBadge).toBe('Illustration, not a forecast');
  });

  it('titles the rules screen with the owner wording', () => {
    expect(en.grow.lines.title).toBe('Your money rules');
    expect(en.grow.lines.change.save).toBe('Save rule');
  });

  it('carries the first-open and safety-net swap strings', () => {
    expect(en.grow.firstOpen.title).toBe('We moved your safety net here');
    expect(en.grow.goals.useAsSafetyNet.row).toBe('Use as my safety net');
  });

  it('keeps the gap-closure strings free of advice wording', () => {
    const picked = [
      en.grow.debts.useOnceOn,
      en.grow.debts.onceToast,
      en.grow.debts.rowEnds,
      en.grow.home.goalsHeroLabelNet_one,
    ];
    for (const text of picked) {
      expect(text).toBeTruthy();
      expect(text).not.toMatch(FORBIDDEN);
    }
  });
});
