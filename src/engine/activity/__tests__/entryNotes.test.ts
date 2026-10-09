import { entryNotes, type EntryNoteInput } from '../entryNotes';

const make = (o: Partial<EntryNoteInput>): EntryNoteInput => ({
  direction: 'out',
  refund: false,
  foreign: false,
  autoConvert: false,
  hasAccount: true,
  status: 'paid',
  ...o,
});

describe('entryNotes', () => {
  it('transfer only', () => {
    expect(entryNotes(make({ direction: 'transfer', refund: true, foreign: true, status: 'pending' }))).toEqual([
      { kind: 'transfer' },
    ]);
  });
  it('refund plus converted FX', () => {
    expect(entryNotes(make({ refund: true, foreign: true, autoConvert: true, status: 'pending' }))).toEqual([
      { kind: 'refund' },
      { kind: 'fxConverted' },
    ]);
  });
  it('marking plus kept FX', () => {
    expect(entryNotes(make({ direction: 'in', foreign: true, status: 'pending' }))).toEqual([
      { kind: 'marking' },
      { kind: 'fxKept' },
    ]);
  });
  it('nothing for a paid home-currency expense', () => {
    expect(entryNotes(make({}))).toEqual([]);
  });
  it('a refund flag on the income direction is not a refund note', () => {
    expect(entryNotes(make({ direction: 'in', refund: true }))).toEqual([]);
  });
  it('never more than two, FX second, over every combination', () => {
    for (const direction of ['out', 'in', 'transfer'] as const)
      for (const refund of [true, false])
        for (const foreign of [true, false])
          for (const autoConvert of [true, false])
            for (const hasAccount of [true, false])
              for (const status of ['paid', 'pending', 'skipped'] as const) {
                const n = entryNotes({ direction, refund, foreign, autoConvert, hasAccount, status });
                expect(n.length).toBeLessThanOrEqual(2);
                if (n.length === 2) expect(['fxConverted', 'fxKept']).toContain(n[1]!.kind);
              }
  });
});
