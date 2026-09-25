import { upsertRow } from '../cacheRows';

describe('upsertRow (WR-A04)', () => {
  const a = { id: 'a', v: 1 };
  const b = { id: 'b', v: 1 };

  it('replaces a row with the same id in place', () => {
    expect(upsertRow([a, b], { id: 'a', v: 2 }, 'start')).toEqual([{ id: 'a', v: 2 }, b]);
  });

  it('inserts a missing row at the start or the end', () => {
    expect(upsertRow([a], b, 'start')).toEqual([b, a]);
    expect(upsertRow([a], b, 'end')).toEqual([a, b]);
  });
});
