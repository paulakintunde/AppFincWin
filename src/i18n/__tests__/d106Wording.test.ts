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
  'decide.section.outcome.wiped_out': 'cash left after a setback: cash',
  'decide.section.outcome.through_cushion': 'cash left after a setback: cash',
  'decide.section.outcome.absorbed': 'cash left after a setback: cash',
};

describe('D-106 wording', () => {
  // 05.4 D-116 (owner, 2026-11-05; UX-08 and the 05.4 answer names): Decide v3 says "short", never "overspent", so decide.v3 is out
  // of this guard. The old decide.* keys keep D-106 until 05.5 deletes them; decideCopy.test.ts bans "overspent" in decide.v3.
  // 06.1-05 (D-18): the new decide.screens.* keys follow the v3 wording ("left", "short"), so they are out of this guard too.
  const all = leaves(en.decide, 'decide').filter((l) => !l.path.startsWith('decide.v3.') && !l.path.startsWith('decide.screens.'));

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
  });
});
