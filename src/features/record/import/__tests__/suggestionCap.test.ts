// Review follow-up item 12 (C-IN-02): one import is one undo step and one finalize, both capped at
// 6000 ops. The undo step holds a delete per inserted row plus a reversal per stored row the
// suggestions touch, so the number of accepted suggestions is capped by what the lines leave.
import { MAX_UNDO_OPS } from '@/engine/undo/types';
import { acceptedSuggestionCount, canAcceptSuggestion, maxAcceptedSuggestions } from '../suggestionCap';

describe('maxAcceptedSuggestions', () => {
  it('is bounded by the forward ops of a finalize (two per link) when the file is small', () => {
    expect(maxAcceptedSuggestions(10)).toBe(2999);
  });

  it('shrinks as more lines are inserted, leaving room for the limit patch', () => {
    expect(maxAcceptedSuggestions(5000)).toBe(999);
    expect(maxAcceptedSuggestions(5999)).toBe(0);
  });

  it('never goes negative', () => {
    expect(maxAcceptedSuggestions(7000)).toBe(0);
  });

  it('any mix at the cap stays under the op limit, forward and undo', () => {
    for (const included of [1, 500, 3000, 5000]) {
      const a = maxAcceptedSuggestions(included);
      // worst case forward: all links (2 ops each) plus the limit patch
      expect(2 * a + 1).toBeLessThanOrEqual(MAX_UNDO_OPS);
      // worst case undo: every included row, one extra op per accepted suggestion, plus the limit
      expect(included + a + 1).toBeLessThanOrEqual(MAX_UNDO_OPS);
    }
  });
});

describe('acceptedSuggestionCount', () => {
  it('counts linked, orphan and accepted pay-match rows only', () => {
    expect(
      acceptedSuggestionCount(
        [{ answer: 'linked' }, { answer: 'orphan' }, { answer: 'dismissed' }, { answer: null }],
        [{ answer: 'accepted' }, { answer: 'dismissed' }, { answer: null }]
      )
    ).toBe(3);
  });
});

describe('canAcceptSuggestion', () => {
  it('allows an acceptance while under the cap', () => {
    expect(canAcceptSuggestion(5000, 998)).toBe(true);
  });

  it('refuses one more once the cap is reached', () => {
    expect(canAcceptSuggestion(5000, 999)).toBe(false);
  });
});
