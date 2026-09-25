import { NotFoundError, VersionConflictError } from '@/db/errors';
import { acceptIfAlreadyApplied, upsertRow } from '../cacheRows';

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

describe('acceptIfAlreadyApplied (WR-A13)', () => {
  const server = { id: 'x', note: 'done', version: 2 };

  it('returns the server row when it already carries every patched value', () => {
    expect(acceptIfAlreadyApplied(new VersionConflictError('transactions', 'x', server), { note: 'done' })).toBe(server);
  });

  it('rethrows a genuine conflict', () => {
    const err = new VersionConflictError('transactions', 'x', server);
    expect(() => acceptIfAlreadyApplied(err, { note: 'mine' })).toThrow(err);
  });

  it('rethrows an empty patch, a missing server row, or any other error', () => {
    expect(() => acceptIfAlreadyApplied(new VersionConflictError('transactions', 'x', server), {})).toThrow(
      VersionConflictError
    );
    expect(() => acceptIfAlreadyApplied(new VersionConflictError('transactions', 'x', null), { note: 'done' })).toThrow(
      VersionConflictError
    );
    expect(() => acceptIfAlreadyApplied(new NotFoundError('accounts', 'x'), { name: 'n' })).toThrow(NotFoundError);
  });
});
