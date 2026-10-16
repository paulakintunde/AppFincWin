import { joinSentences } from '../joinSentences';

describe('joinSentences', () => {
  it('trims a part’s own full stop so the join never reads ".."', () => {
    expect(joinSentences(['Fits', 'Medium', 'You keep $1200 this month.', '$3000 in, $1800 out once this is running.', 'average']))
      .toBe('Fits. Medium. You keep $1200 this month. $3000 in, $1800 out once this is running. average');
  });

  it('drops empty parts instead of leaving ". ."', () => {
    expect(joinSentences(['Fits', '', 'You keep $1200 this month.', '', ''])).toBe('Fits. You keep $1200 this month');
  });

  it('never contains a doubled full stop', () => {
    const out = joinSentences(['A.', 'B..', ' C. ', '.', 'D']);
    expect(out).toBe('A. B. C. D');
    expect(out).not.toMatch(/\.\s*\./);
  });

  it('keeps a decimal point inside a part', () => {
    expect(joinSentences(['About 12.5% a year.'])).toBe('About 12.5% a year');
  });

  it('is empty for no parts', () => {
    expect(joinSentences([])).toBe('');
  });
});
