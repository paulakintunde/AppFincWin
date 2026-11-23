// 10-25 (ACC-11, D-30): the reviewer sign-in call. One 'invalid' for every failure; never logs the password.
const mockInvoke = jest.fn();
const mockSetSession = jest.fn();

jest.mock('@/services/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    auth: { setSession: (...a: unknown[]) => mockSetSession(...a) },
  },
}));

import { reviewerSignIn } from '../reviewerSignIn';

beforeEach(() => {
  mockInvoke.mockReset();
  mockSetSession.mockReset();
});

describe('reviewerSignIn', () => {
  it('trims and lower-cases the email, invokes the function and sets the session', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, access_token: 'a', refresh_token: 'r' }, error: null });
    mockSetSession.mockResolvedValue({ error: null });
    await expect(reviewerSignIn('  Rev@Example.TEST ', 'pw')).resolves.toBe('ok');
    expect(mockInvoke).toHaveBeenCalledWith('reviewer-signin', { body: { email: 'rev@example.test', password: 'pw' } });
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
  });

  it('returns invalid when the function errors', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(reviewerSignIn('a@b.c', 'pw')).resolves.toBe('invalid');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('returns invalid when the body carries no tokens', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false, error: 'invalid' }, error: null });
    await expect(reviewerSignIn('a@b.c', 'pw')).resolves.toBe('invalid');
  });

  it('returns invalid when the call throws', async () => {
    mockInvoke.mockRejectedValue(new Error('offline'));
    await expect(reviewerSignIn('a@b.c', 'pw')).resolves.toBe('invalid');
  });

  it('returns invalid when setSession fails', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, access_token: 'a', refresh_token: 'r' }, error: null });
    mockSetSession.mockResolvedValue({ error: { message: 'bad' } });
    await expect(reviewerSignIn('a@b.c', 'pw')).resolves.toBe('invalid');
  });

  it('never logs the password', async () => {
    const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')].map((s) =>
      s.mockImplementation(() => undefined),
    );
    mockInvoke.mockRejectedValue(new Error('offline'));
    await reviewerSignIn('a@b.c', 'secret-pw-123');
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain('secret-pw-123');
    spies.forEach((s) => s.mockRestore());
  });
});
