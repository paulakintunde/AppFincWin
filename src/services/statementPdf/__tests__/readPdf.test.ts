import { defaultReadPdfDeps, readPdfStatement, type ReadPdfDeps } from '../readPdf';

const mockCapture = jest.fn();
jest.mock('@/services/errors', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));

const mockGetSession = jest.fn();
const mockUpload = jest.fn();
const mockInvoke = jest.fn();
const mockFrom = jest.fn(() => ({ upload: (...a: unknown[]) => mockUpload(...a) }));
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    storage: { from: (...a: unknown[]) => (mockFrom as (...x: unknown[]) => unknown)(...a) },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-from-crypto' }));
jest.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => true } }));

const PASSWORD = 'fincwin-test';
const UID = 'user-1';
const GOOD = {
  ok: true,
  pageCount: 1,
  pages: [{ n: 1, width: 600, height: 800, items: [{ str: 'ALEX SAMPLE', x: 10, y: 10, w: 50 }, { str: '40302010', x: 10, y: 30, w: 40 }] }],
};

function makeDeps(over: Partial<ReadPdfDeps> = {}) {
  const upload = jest.fn().mockResolvedValue({ ok: true });
  const invoke = jest.fn().mockResolvedValue({ data: GOOD, errorName: null });
  const deps: ReadPdfDeps = {
    isOnline: () => true,
    userId: async () => UID,
    newId: () => 'abc-123',
    upload,
    invoke,
    ...over,
  };
  return { deps, upload, invoke };
}

const bytes = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3]);

describe('readPdfStatement', () => {
  it('refuses offline and touches nothing', async () => {
    const { deps, upload, invoke } = makeDeps({ isOnline: () => false });
    await expect(readPdfStatement(bytes, { password: null }, deps)).resolves.toEqual({ kind: 'failed', reason: 'offline', pageCount: null });
    expect(upload).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses oversized bytes without uploading', async () => {
    const { deps, upload } = makeDeps();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await expect(readPdfStatement(big, { password: null }, deps)).resolves.toMatchObject({ reason: 'too-large' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('reports network with no session and does not upload', async () => {
    const { deps, upload } = makeDeps({ userId: async () => null });
    await expect(readPdfStatement(bytes, { password: null }, deps)).resolves.toMatchObject({ reason: 'network' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads to the own folder and reads, with no password key when none given', async () => {
    const { deps, upload, invoke } = makeDeps();
    const out = await readPdfStatement(bytes, { password: null }, deps);
    expect(out).toEqual({ kind: 'ok', extraction: { pageCount: 1, pages: GOOD.pages } });
    const [path, body] = upload.mock.calls[0] as [string, ArrayBuffer];
    expect(path).toBe('user-1/abc-123.pdf');
    expect(body).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(body))).toEqual(Array.from(bytes));
    expect(invoke).toHaveBeenCalledWith({ path });
    expect(Object.keys(invoke.mock.calls[0][0])).not.toContain('password');
  });

  it('slices a view onto a larger buffer to exactly its bytes', async () => {
    const { deps, upload } = makeDeps();
    const whole = new Uint8Array([9, 9, 37, 80, 68, 70, 45, 9]);
    await readPdfStatement(whole.subarray(2, 7), { password: null }, deps);
    expect(Array.from(new Uint8Array(upload.mock.calls[0][1] as ArrayBuffer))).toEqual([37, 80, 68, 70, 45]);
  });

  it('sends the password when given', async () => {
    const { deps, invoke } = makeDeps();
    await readPdfStatement(bytes, { password: PASSWORD }, deps);
    expect(invoke).toHaveBeenCalledWith({ path: 'user-1/abc-123.pdf', password: PASSWORD });
  });

  it('maps upload errors', async () => {
    const a = makeDeps({ upload: jest.fn().mockResolvedValue({ ok: false, status: 413 }) });
    await expect(readPdfStatement(bytes, { password: null }, a.deps)).resolves.toMatchObject({ reason: 'too-large' });
    const b = makeDeps({ upload: jest.fn().mockResolvedValue({ ok: false, status: 500 }) });
    await expect(readPdfStatement(bytes, { password: null }, b.deps)).resolves.toMatchObject({ reason: 'network' });
    const c = makeDeps({ upload: jest.fn().mockResolvedValue({ ok: false, status: null }) });
    await expect(readPdfStatement(bytes, { password: null }, c.deps)).resolves.toMatchObject({ reason: 'network' });
  });

  it('maps invoke errors', async () => {
    const a = makeDeps({ invoke: jest.fn().mockResolvedValue({ data: null, errorName: 'FunctionsFetchError' }) });
    await expect(readPdfStatement(bytes, { password: null }, a.deps)).resolves.toMatchObject({ reason: 'network' });
    for (const name of ['FunctionsHttpError', 'FunctionsRelayError']) {
      const b = makeDeps({ invoke: jest.fn().mockResolvedValue({ data: null, errorName: name }) });
      await expect(readPdfStatement(bytes, { password: null }, b.deps)).resolves.toMatchObject({ reason: 'unreadable' });
    }
  });

  it.each([
    ['too-large', 'too-large'],
    ['too-many-pages', 'too-large'],
    ['password-required', 'password-required'],
    ['password-incorrect', 'password-incorrect'],
    ['not-found', 'unreadable'],
    ['invalid-input', 'unreadable'],
    ['unauthorized', 'unreadable'],
    ['internal', 'unreadable'],
    ['unreadable', 'unreadable'],
  ])('maps response error %s to %s', async (error, reason) => {
    const { deps } = makeDeps({ invoke: jest.fn().mockResolvedValue({ data: { ok: false, error }, errorName: null }) });
    await expect(readPdfStatement(bytes, { password: null }, deps)).resolves.toEqual({ kind: 'failed', reason, pageCount: null });
  });

  it('carries the page count for no-text-layer', async () => {
    const { deps } = makeDeps({ invoke: jest.fn().mockResolvedValue({ data: { ok: false, error: 'no-text-layer', pageCount: 4 }, errorName: null }) });
    await expect(readPdfStatement(bytes, { password: null }, deps)).resolves.toEqual({ kind: 'failed', reason: 'no-text-layer', pageCount: 4 });
  });

  it('treats a response that fails validation as unreadable', async () => {
    const { deps } = makeDeps({ invoke: jest.fn().mockResolvedValue({ data: { ok: true, pageCount: 2, pages: [] }, errorName: null }) });
    await expect(readPdfStatement(bytes, { password: null }, deps)).resolves.toMatchObject({ reason: 'unreadable' });
  });

  it('turns a thrown dependency into network', async () => {
    const { deps } = makeDeps({ upload: jest.fn().mockRejectedValue(new Error(`boom ${PASSWORD}`)) });
    const out = await readPdfStatement(bytes, { password: PASSWORD }, deps);
    expect(out).toEqual({ kind: 'failed', reason: 'network', pageCount: null });
  });

  it('never logs, reports or returns the password, path or statement content', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    const outcomes = [];
    const scenarios: Partial<ReadPdfDeps>[] = [
      { isOnline: () => false },
      { userId: async () => null },
      { upload: jest.fn().mockResolvedValue({ ok: false, status: 413 }) },
      { upload: jest.fn().mockRejectedValue(new Error(`${PASSWORD} ALEX SAMPLE 40302010`)) },
      { invoke: jest.fn().mockResolvedValue({ data: null, errorName: 'FunctionsFetchError' }) },
      { invoke: jest.fn().mockResolvedValue({ data: null, errorName: 'FunctionsHttpError' }) },
      { invoke: jest.fn().mockResolvedValue({ data: { ok: false, error: 'password-incorrect' }, errorName: null }) },
      { invoke: jest.fn().mockResolvedValue({ data: { ok: false, error: 'no-text-layer', pageCount: 2 }, errorName: null }) },
      { invoke: jest.fn().mockResolvedValue({ data: { ok: true, pageCount: 1, pages: 'ALEX SAMPLE 40302010' }, errorName: null }) },
    ];
    for (const s of scenarios) {
      outcomes.push(await readPdfStatement(bytes, { password: PASSWORD }, makeDeps(s).deps));
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
    for (const o of outcomes) {
      expect(o.kind).toBe('failed');
      const json = JSON.stringify(o);
      for (const secret of [PASSWORD, 'user-1', 'abc-123', '.pdf', 'ALEX SAMPLE', '40302010']) expect(json).not.toContain(secret);
    }
    spies.forEach((s) => s.mockRestore());
  });
});

describe('defaultReadPdfDeps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('wires the session, storage upload and function invoke', async () => {
    const deps = defaultReadPdfDeps();
    expect(deps.isOnline()).toBe(true);
    expect(deps.newId()).toBe('uuid-from-crypto');

    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u9' } } } });
    await expect(deps.userId()).resolves.toBe('u9');
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(deps.userId()).resolves.toBeNull();

    const body = new ArrayBuffer(2);
    mockUpload.mockResolvedValue({ error: null });
    await expect(deps.upload('u9/x.pdf', body)).resolves.toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith('statement-uploads');
    expect(mockUpload).toHaveBeenCalledWith('u9/x.pdf', body, { contentType: 'application/pdf', upsert: false });

    mockUpload.mockResolvedValue({ error: { statusCode: '413', message: 'secret' } });
    await expect(deps.upload('u9/x.pdf', body)).resolves.toEqual({ ok: false, status: 413 });
    mockUpload.mockResolvedValue({ error: { statusCode: 400 } });
    await expect(deps.upload('u9/x.pdf', body)).resolves.toEqual({ ok: false, status: 400 });
    mockUpload.mockResolvedValue({ error: { message: 'x' } });
    await expect(deps.upload('u9/x.pdf', body)).resolves.toEqual({ ok: false, status: null });

    mockInvoke.mockResolvedValue({ data: { ok: true }, error: { name: 'FunctionsHttpError' } });
    await expect(deps.invoke({ path: 'p' })).resolves.toEqual({ data: { ok: true }, errorName: 'FunctionsHttpError' });
    expect(mockInvoke).toHaveBeenCalledWith('read-pdf-statement', { body: { path: 'p' } });
    mockInvoke.mockResolvedValue({ data: 1, error: null });
    await expect(deps.invoke({ path: 'p' })).resolves.toEqual({ data: 1, errorName: null });
  });
});
