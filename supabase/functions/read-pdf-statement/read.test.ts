import { readStatement, normalizePage, type PdfDoc, type PdfOpenResult, type ReadDeps } from './read';
import { PDF_MAX_BYTES, PDF_MAX_ITEMS } from './contract';

const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PATH = `${UID}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf`;
const PW = 'fincwin-test';
const SECRETS = ['ALEX SAMPLE', '40302010', '20-30-40', 'ACME GROCERS', '1,245.60', '£120.40'];

type Page = { width: number; height: number; items: { str: string; x: number; y: number; w: number }[] };
const textPage: Page = {
  width: 595.24,
  height: 841.96,
  items: [
    { str: '  ACME GROCERS  ', x: 10.04, y: 20.06, w: 30.049 },
    { str: '   ', x: 1, y: 1, w: 1 },
    { str: '£120.40', x: 100, y: 20, w: 20 },
  ],
};

function mkDoc(pages: Page[] | number, pageFn?: (n: number) => Promise<Page>): PdfDoc {
  const numPages = typeof pages === 'number' ? pages : pages.length;
  return {
    numPages,
    page: jest.fn(async (n: number) => {
      if (pageFn) return pageFn(n);
      return (pages as Page[])[n - 1];
    }),
    destroy: jest.fn(async () => undefined),
  };
}

interface Opts {
  open?: PdfOpenResult;
  bytes?: Uint8Array | null;
}

function mkDeps(o: Opts = {}) {
  const logs: string[] = [];
  let t = 1000;
  const deps = {
    userId: jest.fn(async (): Promise<string | null> => UID),
    download: jest.fn(async (_p: string): Promise<Uint8Array | null> => (o.bytes === undefined ? new Uint8Array(10) : o.bytes)),
    remove: jest.fn(async (_p: string): Promise<void> => undefined),
    openPdf: jest.fn(async (_b: Uint8Array, _pw: string | null): Promise<PdfOpenResult> => o.open ?? { kind: 'invalid' }),
    now: jest.fn(() => (t += 5)),
    log: jest.fn((l: string) => {
      logs.push(l);
    }),
  };
  return { deps: deps as typeof deps & ReadDeps, logs };
}

describe('readStatement input and ownership', () => {
  it.each([
    ['non-object', 'nope'],
    ['null', null],
    ['no path', {}],
    ['short path', { path: 'x/y.pdf' }],
    ['dotdot', { path: `${UID}/../${UID}.pdf` }],
    ['password number', { path: PATH, password: 5 }],
    ['password empty', { path: PATH, password: '' }],
    ['password too long', { path: PATH, password: 'a'.repeat(257) }],
  ])('400 invalid-input for %s', async (_n, body) => {
    const { deps } = mkDeps();
    const r = await readStatement(deps, body);
    expect(r).toEqual({ status: 400, body: { ok: false, error: 'invalid-input' } });
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it('401 when no user', async () => {
    const { deps } = mkDeps();
    deps.userId.mockResolvedValue(null);
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 401, body: { ok: false, error: 'unauthorized' } });
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it('500 internal when userId throws', async () => {
    const { deps } = mkDeps();
    deps.userId.mockRejectedValue(new Error('jwt ALEX SAMPLE'));
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 500, body: { ok: false, error: 'internal' } });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it('foreign path is not-found with no download or remove', async () => {
    const { deps } = mkDeps();
    deps.userId.mockResolvedValue(OTHER);
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 200, body: { ok: false, error: 'not-found' } });
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
  });
});

describe('readStatement outcomes', () => {
  it('absent object -> not-found, remove still called', async () => {
    const { deps } = mkDeps({ bytes: null });
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 200, body: { ok: false, error: 'not-found' } });
    expect(deps.remove).toHaveBeenCalledWith(PATH);
  });

  it('too large -> openPdf never called', async () => {
    const { deps } = mkDeps({ bytes: new Uint8Array(PDF_MAX_BYTES + 1) });
    const r = await readStatement(deps, { path: PATH });
    expect(r.body).toEqual({ ok: false, error: 'too-large' });
    expect(deps.openPdf).not.toHaveBeenCalled();
    expect(deps.remove).toHaveBeenCalledWith(PATH);
  });

  it.each([
    ['password-required', 'password-required'],
    ['password-incorrect', 'password-incorrect'],
    ['invalid', 'unreadable'],
  ] as const)('open %s -> %s', async (kind, error) => {
    const { deps } = mkDeps({ open: { kind } as PdfOpenResult });
    const r = await readStatement(deps, { path: PATH, password: PW });
    expect(r).toEqual({ status: 200, body: { ok: false, error } });
    expect(deps.openPdf).toHaveBeenCalledWith(expect.any(Uint8Array), PW);
    expect(deps.remove).toHaveBeenCalledWith(PATH);
  });

  it('passes null password when none is given', async () => {
    const { deps } = mkDeps({ open: { kind: 'invalid' } });
    await readStatement(deps, { path: PATH });
    expect(deps.openPdf).toHaveBeenCalledWith(expect.any(Uint8Array), null);
  });

  it('26 pages -> too-many-pages before any page() call', async () => {
    const doc = mkDoc(26);
    const { deps } = mkDeps({ open: { kind: 'ok', doc } });
    const r = await readStatement(deps, { path: PATH });
    expect(r.body).toEqual({ ok: false, error: 'too-many-pages', pageCount: 26 });
    expect(doc.page).not.toHaveBeenCalled();
    expect(deps.remove).toHaveBeenCalledWith(PATH);
    expect(doc.destroy).toHaveBeenCalled();
  });

  it('2 pages -> ok with normalized items', async () => {
    const doc = mkDoc([textPage, textPage]);
    const { deps } = mkDeps({ open: { kind: 'ok', doc } });
    const r = await readStatement(deps, { path: PATH });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      pageCount: 2,
      pages: [1, 2].map((n) => ({
        n,
        width: 595.2,
        height: 842,
        items: [
          { str: 'ACME GROCERS', x: 10, y: 20.1, w: 30 },
          { str: '£120.40', x: 100, y: 20, w: 20 },
        ],
      })),
    });
    expect(deps.remove).toHaveBeenCalledWith(PATH);
    expect(doc.destroy).toHaveBeenCalled();
  });

  it('all-whitespace pages -> no-text-layer', async () => {
    const blank: Page = { width: 1, height: 1, items: [{ str: ' ', x: 1, y: 1, w: 1 }] };
    const doc = mkDoc([blank, blank]);
    const { deps } = mkDeps({ open: { kind: 'ok', doc } });
    const r = await readStatement(deps, { path: PATH });
    expect(r.body).toEqual({ ok: false, error: 'no-text-layer', pageCount: 2 });
    expect(deps.remove).toHaveBeenCalled();
  });

  it('too many items -> unreadable, refused not truncated', async () => {
    const big: Page = {
      width: 1,
      height: 1,
      items: Array.from({ length: PDF_MAX_ITEMS + 1 }, () => ({ str: 'a', x: 1, y: 1, w: 1 })),
    };
    const doc = mkDoc([big]);
    const { deps } = mkDeps({ open: { kind: 'ok', doc } });
    const r = await readStatement(deps, { path: PATH });
    expect(r.body).toEqual({ ok: false, error: 'unreadable', pageCount: 1 });
    expect(deps.remove).toHaveBeenCalled();
  });

  it('page() throw -> unreadable, message nowhere', async () => {
    const doc = mkDoc(1, async () => {
      throw new Error('bad xref near ALEX SAMPLE 40302010');
    });
    const { deps, logs } = mkDeps({ open: { kind: 'ok', doc } });
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 200, body: { ok: false, error: 'unreadable', pageCount: 1 } });
    expect(JSON.stringify(r)).not.toContain('ALEX');
    expect(logs.join('')).not.toContain('ALEX');
    expect(JSON.parse(logs[0]).errorClass).toBe('Other');
    expect(deps.remove).toHaveBeenCalled();
  });

  it('openPdf throw before pageCount -> unreadable without pageCount', async () => {
    const { deps } = mkDeps();
    deps.openPdf.mockRejectedValue({ name: 'FormatError' });
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 200, body: { ok: false, error: 'unreadable' } });
  });

  it('download throws -> 500 internal, remove attempted', async () => {
    const { deps, logs } = mkDeps();
    deps.download.mockRejectedValue(new Error('storage ALEX SAMPLE'));
    const r = await readStatement(deps, { path: PATH });
    expect(r).toEqual({ status: 500, body: { ok: false, error: 'internal' } });
    expect(deps.remove).toHaveBeenCalledWith(PATH);
    expect(JSON.parse(logs[0]).errorClass).toBe('StorageError');
  });

  it('remove throwing is swallowed and logged removed:false; destroy failure swallowed', async () => {
    const doc = mkDoc([textPage]);
    (doc.destroy as jest.Mock).mockRejectedValue(new Error('x'));
    const { deps, logs } = mkDeps({ open: { kind: 'ok', doc } });
    deps.remove.mockRejectedValue(new Error('rm ALEX SAMPLE'));
    const r = await readStatement(deps, { path: PATH });
    expect(r.body.ok).toBe(true);
    expect(JSON.parse(logs[0]).removed).toBe(false);
  });

  it('exactly one log line with exactly the allowed keys', async () => {
    const doc = mkDoc([textPage]);
    const { deps, logs } = mkDeps({ open: { kind: 'ok', doc } });
    await readStatement(deps, { path: PATH });
    expect(logs).toHaveLength(1);
    const p = JSON.parse(logs[0]);
    expect(Object.keys(p)).toEqual(['fn', 'outcome', 'durationMs', 'pageCount', 'byteSize', 'removed', 'errorClass']);
    expect(p).toMatchObject({ outcome: 'ok', pageCount: 1, byteSize: 10, removed: true, errorClass: null });
  });
});

describe('normalizePage', () => {
  it('trims, cuts to 200 chars, rounds, drops non-finite items', () => {
    const p = normalizePage(3, {
      width: 10.04,
      height: 20.06,
      items: [
        { str: ' ' + 'x'.repeat(300), x: 1.26, y: 2.24, w: 3.35 },
        { str: 'bad', x: NaN, y: 1, w: 1 },
        { str: 'bad', x: 1, y: Infinity, w: 1 },
        { str: 'bad', x: 1, y: 1, w: NaN },
      ],
    });
    expect(p.n).toBe(3);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].str).toHaveLength(200);
    expect(p.items[0]).toMatchObject({ x: 1.3, y: 2.2 });
  });
});

describe('privacy', () => {
  it('no statement content, path or password reaches a log line or a failure body', async () => {
    const secretPage: Page = {
      width: 100,
      height: 100,
      items: SECRETS.map((s, i) => ({ str: s, x: i, y: i, w: 5 })),
    };
    const blank: Page = { width: 1, height: 1, items: [{ str: ' ', x: 1, y: 1, w: 1 }] };
    const runs: { open: PdfOpenResult; expectOk: boolean }[] = [
      { open: { kind: 'ok', doc: mkDoc([secretPage]) }, expectOk: true },
      { open: { kind: 'ok', doc: mkDoc(26) }, expectOk: false },
      { open: { kind: 'ok', doc: mkDoc([blank]) }, expectOk: false },
      {
        open: {
          kind: 'ok',
          doc: mkDoc(1, async () => {
            throw new Error(`bad ${SECRETS.join(' ')} ${PW} ${PATH}`);
          }),
        },
        expectOk: false,
      },
      { open: { kind: 'password-incorrect' }, expectOk: false },
    ];
    const needles = [...SECRETS, PATH, PW];
    for (const run of runs) {
      const { deps, logs } = mkDeps({ open: run.open });
      const r = await readStatement(deps, { path: PATH, password: PW });
      const out = [...logs, ...(r.body.ok ? [] : [JSON.stringify(r.body)])].join('\n');
      for (const n of needles) expect(out).not.toContain(n);
      expect(r.body.ok).toBe(run.expectOk);
    }
  });
});
