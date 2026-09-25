import { bumpSessionEpoch, currentSessionEpoch, guardSession, isFromWipedSession, markSession, SessionWipedError } from '../sessionEpoch';
import { classifyWriteError, shouldRetryWrite } from '../writeErrors';

describe('sessionEpoch (WR-A09)', () => {
  it('bumps the epoch', () => {
    const before = currentSessionEpoch();
    bumpSessionEpoch();
    expect(currentSessionEpoch()).toBe(before + 1);
  });

  it('an untagged write is never considered wiped; a tagged one is once the epoch moves on', () => {
    const vars = {};
    expect(isFromWipedSession(vars)).toBe(false);
    markSession(vars);
    markSession(vars); // idempotent
    expect(isFromWipedSession(vars)).toBe(false);
    bumpSessionEpoch();
    expect(isFromWipedSession(vars)).toBe(true);
  });

  it('passes a result through in the same session', async () => {
    await expect(guardSession({}, async () => 'ok')).resolves.toBe('ok');
    await expect(guardSession({}, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('refuses to start a retry of a write from a wiped session', async () => {
    const vars = {};
    markSession(vars);
    bumpSessionEpoch();
    const attempt = jest.fn(async () => 'sent');
    await expect(guardSession(vars, attempt)).rejects.toBeInstanceOf(SessionWipedError);
    expect(attempt).not.toHaveBeenCalled();
  });

  it('turns a result or error that arrives after a wipe into SessionWipedError', async () => {
    const ok = {};
    await expect(
      guardSession(ok, async () => {
        bumpSessionEpoch();
        return 'late';
      })
    ).rejects.toBeInstanceOf(SessionWipedError);

    const failing = {};
    await expect(
      guardSession(failing, async () => {
        bumpSessionEpoch();
        throw new Error('late failure');
      })
    ).rejects.toBeInstanceOf(SessionWipedError);
  });

  it('classifies as discarded and is never retried', () => {
    expect(classifyWriteError(new SessionWipedError())).toBe('discarded');
    expect(shouldRetryWrite(0, new SessionWipedError())).toBe(false);
    expect(new SessionWipedError().code).toBe('session-wiped');
  });
});
