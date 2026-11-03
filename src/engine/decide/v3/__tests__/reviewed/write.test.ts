/**
 * 05.4-08: writer for the reviewed diff. Skipped unless REVIEWED_WRITE=<FIX-ID> (or REVIEWED_PAGE=<FIX-ID>) is set by scripts/reviewed-diff.mjs.
 *
 * - --write: appends one unapproved entry per changed key to changes.json and writes reports/reviewed/<FIX-ID>.html
 *   (the D-14 page: "Before -> After" with each person's situation, grouped stricter / looser, with totals). answers.json is not touched.
 * - --page: read-only. Rebuilds the page from changes.json's entries for that fix; touches no data file.
 * - --approve (REVIEWED_ACCEPT=1): refuses unless every changed key has an approved entry for this fix, then rewrites
 *   answers.json from the current outputs.
 * - First run with an empty answers.json records the baseline (no changes listed).
 */
import * as fs from 'fs';
import * as path from 'path';
import { corpus, currentAnswers, type ReviewedAnswer, type ReviewedChange } from './corpus';
import { buildPage } from './page';

const FIX = process.env.REVIEWED_WRITE;
const PAGE = process.env.REVIEWED_PAGE;
const ACCEPT = process.env.REVIEWED_ACCEPT === '1';
const DIR = __dirname;
const ANSWERS = path.join(DIR, 'answers.json');
const CHANGES = path.join(DIR, 'changes.json');

const run = FIX === undefined || FIX === '' ? describe.skip : describe;
const runPage = PAGE === undefined || PAGE === '' ? describe.skip : describe;

runPage('reviewed diff page (read-only)', () => {
  it('builds the page from changes.json for one fix', () => {
    const file = JSON.parse(fs.readFileSync(CHANGES, 'utf8')) as { changes: ReviewedChange[] };
    const mine = file.changes.filter((c) => c.fixId === PAGE);
    expect(mine.length).toBeGreaterThan(0);
    const out = path.join(process.cwd(), 'reports', 'reviewed');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${PAGE}.html`), buildPage(PAGE as string, mine, corpus()));
    process.stdout.write(`reviewed: page for ${PAGE} rebuilt from changes.json (${mine.length} changes); data files untouched\n`);
  });
});

run('reviewed diff writer', () => {
  it('writes the list, the page or the new answers', () => {
    const fixId = FIX as string;
    const current = currentAnswers();
    const previous = JSON.parse(fs.readFileSync(ANSWERS, 'utf8')) as Record<string, ReviewedAnswer>;
    const file = JSON.parse(fs.readFileSync(CHANGES, 'utf8')) as { changes: ReviewedChange[] };
    if (Object.keys(previous).length === 0) {
      fs.writeFileSync(ANSWERS, JSON.stringify(current, null, 2) + '\n');
      process.stdout.write(`reviewed: baseline of ${Object.keys(current).length} answers recorded\n`);
      return;
    }
    const keys = corpus().map((c) => c.key);
    const differing = keys.filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(current[k]));
    if (ACCEPT) {
      const unapproved = differing.filter((k) => !file.changes.some((c) => c.fixId === fixId && c.key === k && c.approved));
      expect(unapproved).toEqual([]);
      fs.writeFileSync(ANSWERS, JSON.stringify(current, null, 2) + '\n');
      process.stdout.write(`reviewed: ${differing.length} change(s) accepted for ${fixId}\n`);
      return;
    }
    const kept = file.changes.filter((c) => !(c.fixId === fixId && !c.approved));
    const fresh: ReviewedChange[] = differing.map((k) => {
      const done = file.changes.find((c) => c.fixId === fixId && c.key === k && c.approved);
      return done ?? { fixId, key: k, before: previous[k] as ReviewedAnswer, after: current[k] as ReviewedAnswer, reason: '', approved: false, approvedAt: null };
    });
    const merged = [...kept.filter((c) => !fresh.some((f) => f.fixId === c.fixId && f.key === c.key)), ...fresh];
    fs.writeFileSync(CHANGES, JSON.stringify({ changes: merged }, null, 2) + '\n');

    const mine = fresh.filter((c) => !c.approved);
    const out = path.join(process.cwd(), 'reports', 'reviewed');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${fixId}.html`), buildPage(fixId, fresh, corpus()));
    process.stdout.write(`reviewed: ${fresh.length} change(s) listed for ${fixId} (${mine.length} awaiting approval); page: reports/reviewed/${fixId}.html\n`);
  });
});
