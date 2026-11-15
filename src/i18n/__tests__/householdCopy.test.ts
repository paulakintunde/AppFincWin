// 08-12 (T-08-102): Household copy keeps FincWin's compliance voice. Declarative, never advice. Curly apostrophes only.
import en from '../locales/en';
import { household } from '../locales/household';

function collect(node: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      collect(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

const strings = collect(household, 'household');

describe('household copy', () => {
  it('is wired into en.ts', () => {
    expect(en.household).toBe(household);
  });

  it('uses no advice words (should, advice, advise, recommend, best, optimal, better)', () => {
    const bad = strings.filter((s) => /\b(should|advice|advise|recommend|best|optimal|better)\b/i.test(s.value));
    expect(bad).toEqual([]);
  });

  it('uses typographic apostrophes only', () => {
    expect(strings.filter((s) => s.value.includes("'"))).toEqual([]);
  });

  it.each(['home', 'members', 'join', 'sharing', 'rules', 'settle', 'leave', 'account', 'notices'])(
    'has copy in the %s area',
    (area) => {
      expect(strings.filter((s) => s.path.startsWith(`household.${area}.`)).length).toBeGreaterThan(0);
    }
  );

  it('keeps the resolver and privacy strings fixed', () => {
    expect(household.members.you).toBe('You');
    expect(household.members.former).toBe('Former member');
    expect(household.members.leftSuffix).toBe('{{name}} (left)');
    expect(household.join.shared.body).toBe(
      'Your records stay private. Only lines you mark shared are seen by {{household}}. Your Decide checks are never shared.'
    );
    expect(household.sharing.linkedLineMeta).toBe('Debt and goal payments stay personal.');
  });
});
