// Real-parser proof (Deno). Named _test so Jest's *.test.ts testMatch never picks it up.
import { readStatement, type ReadDeps } from './read.ts';
import { openPdf, pdfOpenOptions, PDFJS_VERBOSITY_ERRORS } from './unpdf.ts';

const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PATH = `${UID}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf`;
const pdfDir = new URL('../_fixtures/statement-pdfs/', import.meta.url);
const extractDir = new URL('../../../src/engine/statement/pdf/__tests__/fixtures/', import.meta.url);

function harness(bytes: Uint8Array) {
  const removed: string[] = [];
  const logs: string[] = [];
  const deps: ReadDeps = {
    userId: () => Promise.resolve(UID),
    download: () => Promise.resolve(bytes.slice()), // pdf.js detaches its input buffer; each real download is fresh
    remove: (p) => {
      removed.push(p);
      return Promise.resolve();
    },
    openPdf,
    now: () => 0,
    log: (l) => {
      logs.push(l);
    },
  };
  return { deps, removed, logs };
}
const load = (f: string) => Deno.readFile(new URL(f, pdfDir));
function assertEq(actual: unknown, expected: unknown, msg: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(msg);
}
const FORBIDDEN = ['ALEX SAMPLE', '40302010', 'ACME GROCERS', 'fincwin-test'];
const KEYS = ['fn', 'outcome', 'durationMs', 'pageCount', 'byteSize', 'removed', 'errorClass'].sort();
function checkLogs(logs: string[]) {
  if (logs.length === 0) throw new Error('no log line captured');
  for (const l of logs) {
    const o = JSON.parse(l) as Record<string, unknown>;
    assertEq(Object.keys(o).sort(), KEYS, 'log keys');
    for (const f of FORBIDDEN) if (l.includes(f)) throw new Error('log leaks fixture content');
  }
}
async function run(bytes: Uint8Array, password?: string) {
  const h = harness(bytes);
  const r = await readStatement(h.deps, password === undefined ? { path: PATH } : { path: PATH, password });
  assertEq(h.removed, [PATH], 'object removed exactly once');
  checkLogs(h.logs);
  return r.body;
}

const statements: Record<string, number> = {
  'current-account': 2,
  savings: 1,
  'credit-card': 2,
  'year-end': 1,
  'no-balances': 1,
  'multi-account': 2,
};
for (const [name, pages] of Object.entries(statements)) {
  Deno.test(`statement fixture ${name} reads and matches snapshot`, async () => {
    const body = await run(await load(`${name}.pdf`));
    if (!body.ok) throw new Error(`expected ok, got ${body.error}`);
    if (body.pageCount !== pages) throw new Error(`pageCount ${body.pageCount} != ${pages}`);
    const expected = JSON.parse(await Deno.readTextFile(new URL(`${name}.extract.json`, extractDir)));
    assertEq(
      { pageCount: body.pageCount, pages: body.pages },
      expected,
      `${name}: extraction drifted from snapshot; re-run npm run fixtures:pdf:snapshot and review the diff`
    );
  });
}

Deno.test('scanned.pdf has no text layer', async () => {
  assertEq(await run(await load('scanned.pdf')), { ok: false, error: 'no-text-layer', pageCount: 1 }, 'scanned');
});
Deno.test('too-many-pages.pdf refused before parsing', async () => {
  const b = await run(await load('too-many-pages.pdf'));
  assertEq(b, { ok: false, error: 'too-many-pages', pageCount: 26 }, 'too-many-pages');
});
Deno.test('truncated pdf is unreadable', async () => {
  const b = await run((await load('current-account.pdf')).slice(0, 300));
  if (b.ok || b.error !== 'unreadable') throw new Error('expected unreadable');
});
Deno.test('encrypted.pdf password round trip', async () => {
  const bytes = await load('encrypted.pdf');
  const a = await run(bytes);
  if (a.ok || a.error !== 'password-required') throw new Error('expected password-required');
  const b = await run(bytes, 'wrong-password');
  if (b.ok || b.error !== 'password-incorrect') throw new Error('expected password-incorrect');
  const c = await run(bytes, 'fincwin-test');
  if (!c.ok || c.pageCount < 1) throw new Error('expected ok with right password');
});

// Review LO-01: pdf.js runs at errors-only verbosity, and reading the fixtures writes nothing to the
// console outside the allow-listed log line.
Deno.test('pdf.js verbosity is errors-only and parsing prints nothing to the console', async () => {
  assertEq(PDFJS_VERBOSITY_ERRORS, 0, 'VerbosityLevel.ERRORS is 0');
  assertEq((pdfOpenOptions(null) as Record<string, unknown>).verbosity, 0, 'open options carry verbosity 0');
  const seen: unknown[] = [];
  const saved = { log: console.log, warn: console.warn, info: console.info, debug: console.debug };
  console.log = console.warn = console.info = console.debug = (...a: unknown[]) => {
    seen.push(a);
  };
  try {
    for (const f of ['current-account.pdf', 'credit-card.pdf']) {
      const h = harness(await load(f));
      const r = await readStatement(h.deps, { path: PATH });
      if (!r.body.ok) throw new Error(`${f} did not read`);
    }
  } finally {
    Object.assign(console, saved);
  }
  assertEq(seen.length, 0, 'pdf.js wrote to the console');
});
