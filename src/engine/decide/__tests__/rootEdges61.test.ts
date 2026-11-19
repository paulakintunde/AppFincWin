/**
 * 05.4-61 (D-177 a): the shared decide root files, edge cases a mutation run showed unpinned: error text of share, pots and
 * bisectCore, the singular cash-like words, and runs of punctuation between words.
 */
import { minorUnits } from '../../money/types';
import { bisectLargest } from '../bisectCore';
import { suggestItemType } from '../cardRule';
import { potSetAside } from '../pots';
import { resolveShare } from '../share';

const mu = minorUnits;

describe('05.4-61 share: error text names the figures', () => {
  it('weights with a bad entry say "weights"', () => {
    expect(() => resolveShare({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [1, -1] } })).toThrow(
      'resolveShare: weights entry -1 must be a non-negative integer',
    );
  });
  it('amounts with a bad entry say "amounts"', () => {
    expect(() => resolveShare({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'amount', amounts: [mu(5), 1.5 as never] } })).toThrow(
      'resolveShare: amounts entry 1.5 must be a non-negative integer',
    );
  });
  it('a member count below 1 or not a whole number is refused with its own text', () => {
    expect(() => resolveShare({ kind: 'household', memberCount: 0, myIndex: 0, rule: { kind: 'even' } })).toThrow('resolveShare: memberCount 0 must be an integer >= 1');
    expect(() => resolveShare({ kind: 'household', memberCount: 1.5, myIndex: 0, rule: { kind: 'even' } })).toThrow('resolveShare: memberCount 1.5 must be an integer >= 1');
    expect(resolveShare({ kind: 'household', memberCount: 1, myIndex: 0, rule: { kind: 'even' } }).ok).toBe(true);
  });
  it('all-zero weights and amounts are named', () => {
    expect(resolveShare({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [0, 0] } })).toEqual({ ok: false, reason: 'split_weights_zero' });
    expect(resolveShare({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'amount', amounts: [mu(0), mu(0)] } })).toEqual({ ok: false, reason: 'split_amounts_zero' });
    expect(resolveShare({ kind: 'household', memberCount: 2, myIndex: 1, rule: { kind: 'weight', weights: [0, 3] } })).toEqual({ ok: true, share: { weights: [0, 3], myIndex: 1 } });
  });
});

describe('05.4-61 cardRule: cash-like words and punctuation runs', () => {
  it.each(['money order', 'money orders', 'gift card', 'gift cards', 'crypto', 'bitcoin', 'casino', 'gambling', 'betting', 'wire transfer'])('"%s" is cash-like', (name) => {
    expect(suggestItemType(name)).toBe('cash_equivalent');
  });

  it('a run of punctuation between words reads as one space', () => {
    expect(suggestItemType('wire -- transfer')).toBe('cash_equivalent');
    expect(suggestItemType('gift - card!!')).toBe('cash_equivalent');
    expect(suggestItemType('house...deposit')).toBe('property');
  });
});

describe('05.4-61 pots: error text names potSetAside', () => {
  it('a bad amount names the function and the pot', () => {
    expect(() => potSetAside({ id: 'p1', kind: 'pot', target: mu(0), monthlyAmount: null, readyBy: null, saved: mu(0) }, '2026-11-15')).toThrow(
      /^potSetAside: pot p1 target 0 must be a whole number from 1 to /,
    );
  });
  it('a pot with a stated monthly amount below what remains sets that amount aside', () => {
    expect(potSetAside({ id: 'p1', kind: 'wait', target: mu(1000), monthlyAmount: mu(300), readyBy: null, saved: mu(0) }, '2026-11-15')).toEqual({ id: 'p1', monthly: 300, months: 4, state: 'active' });
  });
});

describe('05.4-61 bisectLargest', () => {
  it('an upper bound of 0 is allowed; a negative one names the figure', () => {
    expect(() => bisectLargest(mu(0), () => true)).not.toThrow();
    expect(() => bisectLargest(-1 as never, () => true)).toThrow('bisectLargest: upper -1 must be a non-negative safe integer');
  });
});
