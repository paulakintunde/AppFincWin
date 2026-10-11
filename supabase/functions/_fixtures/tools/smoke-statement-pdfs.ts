// Deno-only smoke check; run with deno run --allow-read --node-modules-dir=none
// Prints check names only, never extracted text.
import { getDocumentProxy } from 'npm:unpdf@1.8.1';

const dir = new URL('../statement-pdfs/', import.meta.url);
let failed = false;

function report(ok: boolean, file: string, check: string) {
  if (!ok) failed = true;
  console.log(`${ok ? 'ok' : 'FAIL'} ${file} ${check}`);
}

async function load(file: string, password?: string) {
  const bytes = new Uint8Array(await Deno.readFile(new URL(file, dir)));
  return await getDocumentProxy(bytes, password === undefined ? {} : { password });
}

async function nonBlankItems(doc: Awaited<ReturnType<typeof load>>, pageNo: number) {
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  // deno-lint-ignore no-explicit-any
  return (content.items as any[]).filter((i) => typeof i.str === 'string' && i.str.trim() !== '').length;
}

const statements: Record<string, number> = {
  'current-account.pdf': 2,
  'savings.pdf': 1,
  'credit-card.pdf': 2,
  'year-end.pdf': 1,
  'no-balances.pdf': 1,
  'multi-account.pdf': 2,
};

for (const [file, pages] of Object.entries(statements)) {
  try {
    const doc = await load(file);
    report(doc.numPages === pages, file, `numPages=${doc.numPages} expected=${pages}`);
    const n = await nonBlankItems(doc, 1);
    report(n > 20, file, `page1 text items=${n}`);
  } catch (_e) {
    report(false, file, 'opens');
  }
}

try {
  const doc = await load('scanned.pdf');
  let total = 0;
  for (let p = 1; p <= doc.numPages; p++) total += await nonBlankItems(doc, p);
  report(total === 0, 'scanned.pdf', `text items=${total}`);
} catch (_e) {
  report(false, 'scanned.pdf', 'opens');
}

try {
  const doc = await load('too-many-pages.pdf');
  report(doc.numPages === 26, 'too-many-pages.pdf', `numPages=${doc.numPages}`);
} catch (_e) {
  report(false, 'too-many-pages.pdf', 'opens');
}

async function expectPasswordError(password: string | undefined, code: number, label: string) {
  try {
    await load('encrypted.pdf', password);
    report(false, 'encrypted.pdf', `${label} should refuse`);
  } catch (e) {
    const err = e as { name?: string; code?: number };
    report(err.name === 'PasswordException' && err.code === code, 'encrypted.pdf', `${label} -> PasswordException code ${err.code}`);
  }
}

await expectPasswordError(undefined, 1, 'no password');
await expectPasswordError('wrong-password', 2, 'wrong password');
try {
  const doc = await load('encrypted.pdf', 'fincwin-test');
  const n = await nonBlankItems(doc, 1);
  report(n > 20, 'encrypted.pdf', `correct password page1 text items=${n}`);
} catch (_e) {
  report(false, 'encrypted.pdf', 'correct password opens');
}

if (failed) Deno.exit(1);
