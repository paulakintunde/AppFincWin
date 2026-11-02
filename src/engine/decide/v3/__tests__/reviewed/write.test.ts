/**
 * 05.4-08: writer for the reviewed diff. Skipped unless REVIEWED_WRITE=<FIX-ID> is set (by scripts/reviewed-diff.mjs).
 *
 * - --write: appends one unapproved entry per changed key to changes.json and writes reports/reviewed/<FIX-ID>.html
 *   (the D-14 page: "Before -> After", grouped stricter / looser, with totals). answers.json is not touched.
 * - --approve (REVIEWED_ACCEPT=1): refuses unless every changed key has an approved entry for this fix, then rewrites
 *   answers.json from the current outputs.
 * - First run with an empty answers.json records the baseline (no changes listed).
 */
import * as fs from 'fs';
import * as path from 'path';
import { corpus, currentAnswers, type ReviewedAnswer, type ReviewedChange } from './corpus';

const FIX = process.env.REVIEWED_WRITE;
const ACCEPT = process.env.REVIEWED_ACCEPT === '1';
const DIR = __dirname;
const ANSWERS = path.join(DIR, 'answers.json');
const CHANGES = path.join(DIR, 'changes.json');

const LABEL: Record<string, string> = {
  fits_month: 'Fits',
  fits_unspent: 'Fits from spare money',
  emergency_use: 'Uses your safety net',
  monthly_short: 'Short each month',
  not_yet: 'Not yet',
  needs_input: 'Needs a figure first',
};
const RANK: Record<string, number> = { fits_month: 0, fits_unspent: 1, emergency_use: 2, monthly_short: 3, not_yet: 4, needs_input: 5 };
const VARIANT: Record<string, string> = { payday: 'payday', not_covered: 'not covered', low_month: 'low month' };

const words = (a: ReviewedAnswer): string => {
  const base = LABEL[a.code] ?? a.code;
  const v = a.variant === null ? '' : ` (${VARIANT[a.variant] ?? a.variant})`;
  const left = a.afterBuyMonth === null ? '' : `, ${(a.afterBuyMonth / 100).toFixed(2)} left that month`;
  return `${base}${v}${left}`;
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const group = (b: ReviewedAnswer, a: ReviewedAnswer): 'stricter' | 'looser' | 'detail' => {
  const rb = RANK[b.code] ?? 99;
  const ra = RANK[a.code] ?? 99;
  return ra > rb ? 'stricter' : ra < rb ? 'looser' : 'detail';
};

const run = FIX === undefined || FIX === '' ? describe.skip : describe;

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
    const labelOf = new Map(corpus().map((c) => [c.key, c.label]));
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
    const groups = { stricter: [] as ReviewedChange[], looser: [] as ReviewedChange[], detail: [] as ReviewedChange[] };
    for (const c of fresh) groups[group(c.before, c.after)].push(c);
    const section = (title: string, list: ReviewedChange[]): string =>
      `<h2>${title} (${list.length})</h2>` +
      (list.length === 0
        ? '<p>None.</p>'
        : `<ul>${list.map((c) => `<li><b>${esc(labelOf.get(c.key) ?? c.key)}</b> <code>${esc(c.key)}</code><br>${esc(words(c.before))} &rarr; ${esc(words(c.after))}</li>`).join('')}</ul>`);
    const html =
      `<!doctype html><meta charset="utf-8"><title>${esc(fixId)}: changed answers</title>` +
      `<h1>${esc(fixId)}: changed answers</h1><p>${fresh.length} of ${keys.length} checks changed (${groups.stricter.length} stricter, ${groups.looser.length} looser, ${groups.detail.length} same answer with different detail). Invented people only.</p>` +
      section('Stricter', groups.stricter) + section('Looser', groups.looser) + section('Same answer, detail changed', groups.detail);
    const out = path.join(process.cwd(), 'reports', 'reviewed');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${fixId}.html`), html);
    process.stdout.write(`reviewed: ${fresh.length} change(s) listed for ${fixId} (${mine.length} awaiting approval); page: reports/reviewed/${fixId}.html\n`);
  });
});
