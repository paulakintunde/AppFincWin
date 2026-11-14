// 06.2-04 (T-06.2-04-01): the appLife.* words keep FincWin's compliance voice. FincWin is a record-keeping tool, not an
// adviser, a lender or a bank: no advice words, no "free", no "Skip", no "lend", no "unspent". Apostrophes are curly,
// placeholders come from a fixed list and no word list carries an emoji.
import en from '../locales/en';
import { i18n } from '../index';

interface Leaf {
  path: string;
  value: unknown;
}

function collectLeaves(node: unknown, prefix = ''): Leaf[] {
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeaves(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [{ path: prefix, value: node }];
}

const leaves = collectLeaves(en.appLife, 'appLife');
const strings = leaves.filter((l): l is { path: string; value: string } => typeof l.value === 'string');

// Each rule names what it keeps out. "lend" matches only at the start of a word, so "calendar" passes.
const BANNED: readonly RegExp[] = [
  /\badvice\b/i,
  /\badviser\b/i,
  /\brecommend/i,
  /\byou should\b/i,
  /\bfree\b/i,
  /\bskip\b/i,
  /\blend/i,
  /\bunspent\b/i,
];
const STRAIGHT_APOSTROPHE = /[A-Za-z]'[A-Za-z]/;
const PLACEHOLDER = /\{\{\s*([^}\s]+)\s*\}\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['name', 'amount', 'month', 'date', 'count', 'percent', 'day', 'low', 'high', 'seconds', 'target']);
const EMOJI = /\p{Extended_Pictographic}/u;

function bannedHit(value: string): RegExp | undefined {
  return BANNED.find((re) => re.test(value));
}

describe('appLife copy guard', () => {
  it('has leaves, and every leaf is a non-empty string', () => {
    expect(leaves.length).toBeGreaterThan(0);
    const offenders = leaves.filter((l) => typeof l.value !== 'string' || (l.value as string).trim() === '').map((l) => l.path);
    expect(offenders).toEqual([]);
  });

  it('uses no banned word (advice, adviser, recommend, you should, free, Skip, lend, unspent)', () => {
    const offenders = strings.filter((l) => bannedHit(l.value)).map((l) => `${l.path}: ${l.value}`);
    expect(offenders).toEqual([]);
  });

  it('uses curly apostrophes only (no straight apostrophe between letters)', () => {
    const offenders = strings.filter((l) => STRAIGHT_APOSTROPHE.test(l.value)).map((l) => l.path);
    expect(offenders).toEqual([]);
  });

  it('uses only allowed {{placeholder}} names', () => {
    const offenders = strings.flatMap((l) =>
      [...l.value.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((name) => !ALLOWED_PLACEHOLDERS.has(name)).map((name) => `${l.path}: ${name}`)
    );
    expect(offenders).toEqual([]);
  });

  it('carries no emoji', () => {
    const offenders = strings.filter((l) => EMOJI.test(l.value)).map((l) => l.path);
    expect(offenders).toEqual([]);
  });

  it('has an _other form beside every _one plural', () => {
    const paths = new Set(strings.map((l) => l.path));
    const offenders = [...paths].filter((p) => p.endsWith('_one') && !paths.has(`${p.slice(0, -4)}_other`));
    expect(offenders).toEqual([]);
  });
});

describe('appLife copy guard rules catch what they should', () => {
  it.each([
    ['This is not advice', /\badvice\b/i],
    ['Ask an adviser', /\badviser\b/i],
    ['We recommend this', /\brecommend/i],
    ['You should pay it', /\byou should\b/i],
    ['Try the free plan', /\bfree\b/i],
    ['Skip this', /\bskip\b/i],
    ['We are lending', /\blend/i],
    ['Your unspent money', /\bunspent\b/i],
  ])('flags "%s"', (sample, rule) => {
    expect(bannedHit(sample)?.source).toBe(rule.source);
  });

  it.each(['Open the calendar', 'Blend the months', 'Carefree'])('does not flag "%s"', (sample) => {
    expect(bannedHit(sample)).toBeUndefined();
  });

  it('flags a straight apostrophe inside a word and passes a curly one', () => {
    expect(STRAIGHT_APOSTROPHE.test("You're offline.")).toBe(true);
    expect(STRAIGHT_APOSTROPHE.test('You’re offline.')).toBe(false);
  });

  it('flags an emoji and an unknown placeholder', () => {
    expect(EMOJI.test('Goal reached \u{1F389}')).toBe(true);
    const names = [...'Saved {{item}}'.matchAll(PLACEHOLDER)].map((m) => m[1]);
    expect(names.filter((n) => !ALLOWED_PLACEHOLDERS.has(n))).toEqual(['item']);
  });

  it('resolves plurals through i18next count', () => {
    expect(i18n.t('appLife.importDone.added', { count: 1 })).toBe('1 transaction added');
    expect(i18n.t('appLife.importDone.added', { count: 4 })).toBe('4 transactions added');
    expect(i18n.t('appLife.home.dueIn', { count: 1 })).toBe('Due tomorrow');
    expect(i18n.t('appLife.status.updatedAgo', { count: 3 })).toBe('Updated 3 days ago');
  });
});
