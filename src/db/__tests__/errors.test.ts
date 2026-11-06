import { RequestTimeoutError } from '@/services/supabase/timeoutFetch';
import { DbError, VersionConflictError, NotFoundError, SessionUnavailableError, classifyReadError, toDbError } from '../errors';

describe('DbError / toDbError', () => {
  it('maps a PostgREST-shaped error object to a DbError with code and status', () => {
    const err = toDbError({ message: 'x', code: '42501' }, 403);

    expect(err).toBeInstanceOf(DbError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('x');
    expect(err.code).toBe('42501');
    expect(err.status).toBe(403);
  });

  it('defaults status to null and code to empty string when absent', () => {
    const err = toDbError({ message: 'y' });

    expect(err.status).toBeNull();
    expect(err.code).toBe('');
  });

  it('treats a null code the same as an absent code', () => {
    const err = toDbError({ message: 'z', code: null });

    expect(err.code).toBe('');
  });
});

describe('VersionConflictError', () => {
  it('carries entity, id, serverRow and a fixed code', () => {
    const serverRow = { id: 'row-1', version: 4 };
    const err = new VersionConflictError('transactions', 'row-1', serverRow);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('version-conflict');
    expect(err.entity).toBe('transactions');
    expect(err.id).toBe('row-1');
    expect(err.serverRow).toBe(serverRow);
  });
});

describe('NotFoundError', () => {
  it('carries entity, id and a fixed code', () => {
    const err = new NotFoundError('accounts', 'acc-1');

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('not-found');
    expect(err.entity).toBe('accounts');
    expect(err.id).toBe('acc-1');
  });
});

// 05.4-33 APP-10: a read failure has a kind; a network failure never reads as "not found".
describe('classifyReadError', () => {
  it('network: a fetch TypeError, the 15 s read timeout, an AbortError and a DbError with no HTTP answer', () => {
    expect(classifyReadError(new TypeError('Network request failed'))).toBe('network');
    expect(classifyReadError(new RequestTimeoutError(15_000, false))).toBe('network');
    expect(classifyReadError({ name: 'AbortError', message: 'Aborted' })).toBe('network');
    expect(classifyReadError(toDbError({ message: 'TypeError: Network request failed', code: '' }, 0))).toBe('network');
    expect(classifyReadError(toDbError({ message: 'fetch failed' }))).toBe('network');
  });

  it('not_found only when the server says so: 404, PGRST116 or a confirmed missing row', () => {
    expect(classifyReadError(toDbError({ message: 'x' }, 404))).toBe('not_found');
    expect(classifyReadError(toDbError({ message: 'x', code: 'PGRST116' }, 406))).toBe('not_found');
    expect(classifyReadError(new NotFoundError('decide_checks', 'c1'))).toBe('not_found');
  });

  it('forbidden: 401, 403, 42501, the JWT codes and no usable session', () => {
    expect(classifyReadError(toDbError({ message: 'x' }, 401))).toBe('forbidden');
    expect(classifyReadError(toDbError({ message: 'x' }, 403))).toBe('forbidden');
    expect(classifyReadError(toDbError({ message: 'x', code: '42501' }, 400))).toBe('forbidden');
    expect(classifyReadError(toDbError({ message: 'x', code: 'PGRST303' }, 400))).toBe('forbidden');
    expect(classifyReadError(new SessionUnavailableError())).toBe('forbidden');
  });

  it('conflict: 409 or a version conflict', () => {
    expect(classifyReadError(toDbError({ message: 'x' }, 409))).toBe('conflict');
    expect(classifyReadError(new VersionConflictError('accounts', 'a1', {}))).toBe('conflict');
  });

  it('server: 5xx, 408, 429, other codes and anything unknown, never not_found', () => {
    expect(classifyReadError(toDbError({ message: 'x' }, 500))).toBe('server');
    expect(classifyReadError(toDbError({ message: 'x' }, 408))).toBe('server');
    expect(classifyReadError(toDbError({ message: 'x', code: '22P02' }, 400))).toBe('server');
    expect(classifyReadError(new Error('boom'))).toBe('server');
    expect(classifyReadError(undefined)).toBe('server');
    expect(classifyReadError(null)).toBe('server');
    expect(classifyReadError('text')).toBe('server');
  });
});
