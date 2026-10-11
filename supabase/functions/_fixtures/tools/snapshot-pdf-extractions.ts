// Deno-only. Regenerates the committed extraction snapshots from the real parser:
//   npm run fixtures:pdf:snapshot
// Prints file names and item counts only, never extracted text.
import { readStatement, type ReadDeps } from '../../read-pdf-statement/read.ts';
import { openPdf } from '../../read-pdf-statement/unpdf.ts';

const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PATH = `${UID}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf`;
const names = ['current-account', 'savings', 'credit-card', 'year-end', 'no-balances', 'multi-account'];
const pdfDir = new URL('../statement-pdfs/', import.meta.url);
const outDir = new URL('../../../../src/engine/statement/pdf/__tests__/fixtures/', import.meta.url);

await Deno.mkdir(outDir, { recursive: true });
for (const name of names) {
  const bytes = await Deno.readFile(new URL(`${name}.pdf`, pdfDir));
  const deps: ReadDeps = {
    userId: () => Promise.resolve(UID),
    download: () => Promise.resolve(bytes),
    remove: () => Promise.resolve(),
    openPdf,
    now: () => 0,
    log: () => undefined,
  };
  const r = await readStatement(deps, { path: PATH });
  if (!r.body.ok) throw new Error(`${name}: ${r.body.error}`);
  const { pageCount, pages } = r.body;
  await Deno.writeTextFile(new URL(`${name}.extract.json`, outDir), JSON.stringify({ pageCount, pages }, null, 2) + '\n');
  console.log(`${name}.extract.json pages=${pageCount} items=${pages.reduce((n, p) => n + p.items.length, 0)}`);
}
