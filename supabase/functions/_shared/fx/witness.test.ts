import { confirmWithWitness } from './witness';
import type { FxRow } from './parse';
import type { Classification, OpenHold } from './plausibility';

const D = '2026-10-07';

function created(overrides: Partial<Classification['hold'][number]> = {}): Classification['hold'][number] {
  return {
    base: 'EUR',
    quote: 'GBP',
    rate: '1.30',
    date: D,
    priorRate: '0.86',
    priorDate: '2026-10-04',
    changeRatio: 0.5,
    source: 'frankfurter-v2',
    ...overrides,
  };
}

function hold(overrides: Partial<OpenHold> = {}): OpenHold {
  return { id: 7, quote: 'GBP', heldRate: '1.30', heldDate: D, source: 'frankfurter-v2', status: 'held', ...overrides };
}

const witness = (quote: string, rate: string): FxRow => ({ base: 'EUR', quote, rate, date: D });

describe('confirmWithWitness (ported fx-sync WR-B03 second-source match)', () => {
  it('confirms a created hold when the witness is within 3%, writing the HELD value under the hold source', () => {
    const out = confirmWithWitness([created()], [hold()], [witness('GBP', '1.31')]);
    expect(out.holdIds).toEqual([7]);
    expect([...out.rowsBySource.entries()]).toEqual([
      ['frankfurter-v2', [{ base: 'EUR', quote: 'GBP', rate: '1.30', date: D }]],
    ]);
  });

  it('confirms nothing when the witness is beyond 3%', () => {
    const out = confirmWithWitness([created()], [hold()], [witness('GBP', '1.40')]);
    expect(out.holdIds).toEqual([]);
    expect(out.rowsBySource.size).toBe(0);
  });

  it('never confirms an older hold for the same quote (different date or source) -- WR-B03', () => {
    const older = hold({ id: 3, heldDate: '2026-10-01' });
    const otherSource = hold({ id: 4, source: 'open-er-api' });
    const out = confirmWithWitness([created()], [older, otherSource], [witness('GBP', '1.30')]);
    expect(out.holdIds).toEqual([]);
    const both = confirmWithWitness([created()], [older, otherSource, hold()], [witness('GBP', '1.30')]);
    expect(both.holdIds).toEqual([7]);
  });

  it('confirms nothing when the witness has no row for the quote', () => {
    const out = confirmWithWitness([created()], [hold()], [witness('JPY', '160')]);
    expect(out.holdIds).toEqual([]);
  });

  it('ignores a created hold that is not (any longer) an open hold row', () => {
    expect(confirmWithWitness([created()], [], [witness('GBP', '1.30')]).holdIds).toEqual([]);
  });
});
