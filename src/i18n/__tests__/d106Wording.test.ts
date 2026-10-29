// D-106 (05-141): a month figure is worded "free" / "overspent", never "left" / "short". The words survive only for cash,
// the cushion, a card balance and counts, and each of those is named here with its reason so the list cannot rot.
import en from '../locales/en';

function leaves(n: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof n === 'string') return [{ path: prefix, value: n }];
  if (n && typeof n === 'object') return Object.entries(n as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

/** Placeholders are parameter names ({{left}}, {{short}}), not words a person reads. */
const words = (s: string): string => s.replace(/\{\{[^}]*\}\}/g, '');
const MATCH = /\b(short|left)\b/i;

const ALLOWED: Record<string, string> = {
  'decide.info.cushionMonths.body': 'cash left after the purchase: cash, not a month figure',
  'decide.info.reserve.body': 'cash cushion prose, and "Left blank" means an empty field',
  'decide.info.dsrLine.body': '"Left blank" means an empty field',
  'decide.info.unsecuredMultiple.body': '"Left blank" means an empty field',
  'decide.info.investingFloor.body': '"Left blank" means an empty field',
  'decide.info.savingFloor.body': '"Left blank" means an empty field',
  'decide.info.secured.body': '"left out" of a line: a count rule, not a figure',
  'decide.info.netFreeCashFlow.body': 'the definition ("what is left of a month once everything planned is taken off"), not a figure being read out',
  'decide.info.pots.body': '"months left" is a count of months to a pot date',
  'decide.info.housingLine.body': '"Left blank" means an empty field',
  'decide.quick.line.cashNo': 'cash short of the cushion: cash',
  'decide.pay.loanCashLeft': 'cash left after paying: cash',
  'decide.warn.cardCapValue': 'card balance left after 50 years: a card balance, not a month figure',
  'decide.section.lineCashDesc': 'cash left on the day: cash',
  'decide.section.lineShort': 'cash short of the cushion on the lines section: cash',
  'decide.section.setbackAfter': 'cash left after a setback: cash',
  'decide.section.outcome.wiped_out': 'cash left after a setback: cash',
  'decide.section.outcome.through_cushion': 'cash left after a setback: cash',
  'decide.section.outcome.absorbed': 'cash left after a setback: cash',
  'decide.section.asUnconvertedValue_one': 'a line left out of a count',
  'decide.section.asUnconvertedValue_other': 'a line left out of a count',
  'decide.depth.cushion.row': 'cash left on the day: cash',
  'decide.depth.oneOff.basis_one': 'a one-off left out of a count',
  'decide.depth.oneOff.basis_other': 'a one-off left out of a count',
  'decide.depth.credit.leftWhenEnds': 'cash left when a credit ends: cash',
  'decide.setup.accountUse.why': '"left alone" describes savings the user does not touch, not a month figure',
  'decide.setup.detail.optionShort': '"Short answers" is the answer length, not a month figure',
  'decide.unspentSheet.rollNote': '"left out" of the roll-forward: a rule about which moves are ignored',
  'decide.settings.valueUnusual': '"left out" is a count of unusual months',
  'decide.settings.valueDetailShort': '"Short answers" is the answer length, not a month figure',
  'decide.setupPage.roughBody_one': '"step left" is a count of setup steps',
  'decide.setupPage.roughBody_other': '"steps left" is a count of setup steps',
};

describe('D-106 wording', () => {
  const all = leaves(en.decide, 'decide');

  it('D-106 no month figure under decide.* is worded short or left', () => {
    const stray = all.filter(({ path, value }) => MATCH.test(words(value)) && !(path in ALLOWED)).map(({ path, value }) => `${path}: ${value}`);
    expect(stray).toEqual([]);
  });

  it('D-106 every allowlist entry still matches and carries a reason', () => {
    const byPath = new Map(all.map((l) => [l.path, l.value]));
    for (const [path, reason] of Object.entries(ALLOWED)) {
      expect({ path, reason: reason.length > 0 }).toEqual({ path, reason: true });
      const v = byPath.get(path);
      expect({ path, present: v !== undefined }).toEqual({ path, present: true });
      expect({ path, matches: MATCH.test(words(v ?? '')) }).toEqual({ path, matches: true });
    }
  });

  it('D-106 the pause naming survives', () => {
    expect(en.decide.warn.monthTitle).toBe('Still overspent with saving paused');
    expect(en.decide.quick.line.cashMonthShort).toContain('saving paused');
    expect(en.decide.quick.line.cashMonthShort).toContain('overspent');
  });

  it('D-106 the two figure words read free and overspent', () => {
    expect(en.decide.fig.free).toBe('{{amount}} free');
    expect(en.decide.fig.overspent).toBe('{{amount}} overspent');
  });
});
