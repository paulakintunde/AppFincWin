import { DbError, VersionConflictError, NotFoundError } from '@/db/errors';
import { classifyWriteError, shouldRetryWrite, writeRetryDelay } from '../writeErrors';

describe('classifyWriteError', () => {
  it('classifies a VersionConflictError as conflict (D-18: never retried, never last-write-wins)', () => {
    expect(classifyWriteError(new VersionConflictError('transactions', '1', {}))).toBe('conflict');
  });

  it('classifies a NotFoundError as not-found', () => {
    expect(classifyWriteError(new NotFoundError('accounts', '1'))).toBe('not-found');
  });

  it.each(['42501', '23514', '23503', '23502', '22P02', 'PGRST204'])(
    'classifies DbError code %s as rejected (D-19: permanent, stop retrying)',
    (code) => {
      expect(classifyWriteError(new DbError('x', code, 400))).toBe('rejected');
    }
  );

  it('classifies DbError code 23505 as already-applied (duplicate client UUID)', () => {
    expect(classifyWriteError(new DbError('duplicate key', '23505', 409))).toBe('already-applied');
  });

  it('classifies a network TypeError as transient', () => {
    expect(classifyWriteError(new TypeError('Network request failed'))).toBe('transient');
  });

  it('classifies an Error named FunctionsFetchError as transient', () => {
    const err = new Error('Failed to send a request to the Edge Function');
    err.name = 'FunctionsFetchError';
    expect(classifyWriteError(err)).toBe('transient');
  });

  it.each([500, 502, 408, 429])('classifies DbError with status %d as transient', (status) => {
    expect(classifyWriteError(new DbError('x', 'ECONNRESET', status))).toBe('transient');
  });

  it('classifies DbError with empty code and null status as transient', () => {
    expect(classifyWriteError(new DbError('x', '', null))).toBe('transient');
  });

  it('classifies an unrecognized DbError code/status combination as rejected', () => {
    expect(classifyWriteError(new DbError('x', '99999', 400))).toBe('rejected');
  });

  it('classifies an unknown non-Error value as rejected, never loops forever', () => {
    expect(classifyWriteError('boom')).toBe('rejected');
    expect(classifyWriteError(null)).toBe('rejected');
    expect(classifyWriteError(undefined)).toBe('rejected');
    expect(classifyWriteError({ some: 'object' })).toBe('rejected');
  });
});

describe('shouldRetryWrite', () => {
  it('retries transient errors regardless of failure count (unbounded; mutations pause while offline)', () => {
    expect(shouldRetryWrite(5, new TypeError('Network request failed'))).toBe(true);
  });

  it('does not retry a permanently rejected write even on the first attempt', () => {
    expect(shouldRetryWrite(0, new DbError('rls denied', '42501', 403))).toBe(false);
  });

  it('does not retry a conflict', () => {
    expect(shouldRetryWrite(0, new VersionConflictError('transactions', '1', {}))).toBe(false);
  });
});

describe('writeRetryDelay', () => {
  it('computes exponential backoff capped at 60 seconds', () => {
    expect(writeRetryDelay(0)).toBe(1000);
    expect(writeRetryDelay(3)).toBe(8000);
    expect(writeRetryDelay(10)).toBe(60_000);
  });
});
