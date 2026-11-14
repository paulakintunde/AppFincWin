// 05.5-03 (D-14, CMP-F09): the per-sentence copy guard. Pure CommonJS module shared with the ESLint rule.
import { checkSentence, checkString, hashSentence, isAllowed, splitSentences, staleEntries } from '../guard.cjs';

describe('splitSentences', () => {
  it('splits on sentence ends', () => {
    expect(splitSentences('It fits. You have {{amount}} left!')).toEqual(['It fits.', 'You have {{amount}} left!']);
  });
  it('does not split a decimal', () => {
    expect(splitSentences('It grows 1.5% a year.')).toEqual(['It grows 1.5% a year.']);
  });
  it('returns nothing for an empty string', () => {
    expect(splitSentences('')).toEqual([]);
  });
});

describe('checkSentence', () => {
  it('flags a banned phrase in the decide set', () => {
    const v = checkSentence('decide.v3.answer', 'You should wait.');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'banned:you should', set: 'decide' });
  });
  it('flags a negated disclaimer too', () => {
    const v = checkSentence('decide.v3.answer', 'This does not give advice.');
    expect(v.map((x) => x.rule)).toContain('banned:advice');
  });
  it('flags the grow set', () => {
    const v = checkSentence('grow.goals.x', 'The optimal plan.');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'banned:optimal', set: 'grow' });
  });
  it('limits words in decide.v3', () => {
    const long = Array.from({ length: 26 }, () => 'word').join(' ') + '.';
    expect(checkSentence('decide.v3.x', long).map((x) => x.rule)).toContain('limit:words');
    const ok = Array.from({ length: 25 }, () => 'word').join(' ') + '.';
    expect(checkSentence('decide.v3.x', ok)).toEqual([]);
  });
  it('limits numbers, counting numeric placeholders and digits', () => {
    const v = checkSentence('decide.v3.x', 'Pay {{amount}} then {{left}} then 3 then 4.');
    expect(v.map((x) => x.rule)).toContain('limit:numbers');
  });
  it('does not count not-a-number placeholders', () => {
    expect(checkSentence('decide.v3.x', 'In {{month}} {{account}} holds {{amount}} and {{left}} and {{short}}.')).toEqual([]);
  });
  it('treats a range as one figure', () => {
    expect(checkSentence('decide.v3.x', 'Plan 3 to 6 months, then {{amount}} and {{left}}.')).toEqual([]);
  });
  it('uses the general set elsewhere', () => {
    expect(checkSentence('activity.list.empty', 'Nothing yet.')).toEqual([]);
    expect(checkSentence('activity.list.empty', 'You should add one.')[0]).toMatchObject({ set: 'general', rule: 'banned:you should' });
  });
  it('applies no word limit outside the limit prefixes', () => {
    const long = Array.from({ length: 40 }, () => 'word').join(' ') + '.';
    expect(checkSentence('activity.list.empty', long)).toEqual([]);
  });
});

describe('checkString, hashSentence, allowlist', () => {
  it('tags each violation with path, sentence and hash', () => {
    const v = checkString('decide.v3.a', 'Fine. You should wait.');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ path: 'decide.v3.a', sentence: 'You should wait.', hash: hashSentence('You should wait.') });
  });
  it('hashes FNV-1a 32 as 8 hex chars, stably', () => {
    expect(hashSentence('')).toBe('811c9dc5');
    expect(hashSentence('a')).toBe('e40c292c');
    expect(hashSentence('You should wait.')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashSentence('You should wait.')).toBe(hashSentence('You should wait.'));
  });
  it('isAllowed needs path, hash and rule to match', () => {
    const [v] = checkString('decide.v3.a', 'You should wait.');
    const entry = { path: 'decide.v3.a', sentenceHash: v!.hash, rule: v!.rule, dated: '2026-11-13', reason: 'x' };
    const list = { dated: '2026-11-13', emptyBy: 'x', entries: [entry] };
    expect(isAllowed(v!, list)).toBe(true);
    expect(isAllowed(v!, { ...list, entries: [{ ...entry, path: 'decide.v3.b' }] })).toBe(false);
    expect(isAllowed(v!, { ...list, entries: [{ ...entry, sentenceHash: '00000000' }] })).toBe(false);
    expect(isAllowed(v!, { ...list, entries: [{ ...entry, rule: 'banned:other' }] })).toBe(false);
  });
  it('reports stale entries', () => {
    const [v] = checkString('decide.v3.a', 'You should wait.');
    const live = { path: 'decide.v3.a', sentenceHash: v!.hash, rule: v!.rule, dated: '2026-11-13', reason: 'x' };
    const stale = { ...live, path: 'decide.v3.gone' };
    const list = { dated: '2026-11-13', emptyBy: 'x', entries: [live, stale] };
    expect(staleEntries([v!], list)).toEqual([stale]);
  });
});
