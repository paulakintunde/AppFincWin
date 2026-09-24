import { DbError, VersionConflictError, NotFoundError, toDbError } from '../errors';

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
