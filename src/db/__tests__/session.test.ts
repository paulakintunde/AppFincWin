import { SessionUnavailableError } from '../errors';
import { assertSession } from '../session';
import { createFakeSupabase } from './fakeSupabase';

describe('assertSession (WR-A01)', () => {
  it('resolves when the client holds a session', async () => {
    const client = createFakeSupabase();
    await expect(assertSession(client)).resolves.toBeUndefined();
  });

  it('throws SessionUnavailableError when there is no session', async () => {
    const client = createFakeSupabase();
    client.session = null;
    await expect(assertSession(client)).rejects.toBeInstanceOf(SessionUnavailableError);
  });

  it('throws SessionUnavailableError carrying the reason when the refresh failed', async () => {
    const client = createFakeSupabase();
    client.session = null;
    client.sessionError = { message: 'Failed to fetch' };
    await expect(assertSession(client)).rejects.toMatchObject({
      name: 'SessionUnavailableError',
      code: 'session-unavailable',
      message: 'No usable auth session: Failed to fetch',
    });
  });
});
