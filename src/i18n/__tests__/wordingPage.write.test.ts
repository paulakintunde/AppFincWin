/**
 * 05.4-41 (D-15, D-150..D-153): writes the wording review page, reports/wording/decide-v3.html. Runs only with WORDING_WRITE=1
 * (npm run wording:page, which runs the copy guards first). Self-contained page, no scripts.
 *
 * Baseline: the signed copy for the locked groups once it exists (D-153); until then, and always for the plan-06 lines, en.ts at
 * the merge base with origin/main (the last owner-signed main). Every string is marked New, Changed (old -> new) or Same, and
 * strings that are gone are listed as Removed.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import en from '../locales/en';
import * as mandatedCopy from '../mandatedCopy';
import { CAVEAT_FIGURE_KEYS, CAVEAT_KEYS, CAVEAT_WRONG_FIGURE_KEY, MISSING_KEYS, verdictRowFor } from '../../engine/decide/v3/copy/verdictTable';
import { FREE_HELP } from '../../engine/decide/v3/help/freeHelp';
import { evaluate } from '../../engine/decide/v3/evaluate';
import type { Caveat, CheckV2, Result, V3Inputs } from '../../engine/decide/v3/types';
import { corpus } from '../../engine/decide/v3/__tests__/reviewed/corpus';
import { esc, sayLine } from '../../engine/decide/v3/__tests__/reviewed/page';
import { loadCases } from '../../engine/decide/v3/__tests__/rightAnswers/loader';
import { toEngineInputs } from '../../engine/decide/v3/__tests__/rightAnswers/fixture';
import { DECISION_MAP, fillSample, leaves, type Leaves, LOCKED_ROOTS, lockedLeaves, OTHER_KEYS, placeholdersOf, readSigned, readSignoff } from './wordingScope';

const ROOT = join(__dirname, '..', '..', '..');
const OUT_DIR = join(ROOT, 'reports', 'wording');
const OUT = join(OUT_DIR, 'decide-v3.html');
const WRITE = process.env.WORDING_WRITE === '1';

type Status = 'New' | 'Changed' | 'Same';
interface Row {
  readonly key: string;
  readonly text: string;
  readonly old: string | undefined;
  readonly status: Status;
}

// ---------------------------------------------------------------- the baseline

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function baseRef(): string {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(`merge-base HEAD ${ref}`).trim();
    } catch {
      // try the next ref
    }
  }
  throw new Error('wording page: no merge base with origin/main or main');
}

/** en.ts as it was at `ref`, turned into a plain object (its one import, mandatedCopy, is the current module). */
function enAt(ref: string): unknown {
  const source = git(`show ${ref}:src/i18n/locales/en.ts`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod: { exports: { default?: unknown } } = { exports: {} };
  const req = (id: string): unknown => {
    if (id === '../mandatedCopy') return mandatedCopy;
    throw new Error(`wording page: en.ts at ${ref} imports ${id}`);
  };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
  return mod.exports.default;
}

// ---------------------------------------------------------------- money and months for the worked answers

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym: string): string => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const SYMBOL: Record<string, string> = { USD: '$', CAD: '$', GBP: '£', EUR: '€' };
function money(minor: number, currency: string): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${minor < 0 ? '-' : ''}${SYMBOL[currency] ?? `${currency} `}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

const enLeaves = leaves(en, '');
const say = (key: string): string => {
  const t = enLeaves[key];
  if (t === undefined) throw new Error(`wording page: ${key} is not in en.ts`);
  return t;
};

/** Fill from real values first, then mark any blank still open with a sample and a star. */
function fillReal(key: string, real: Record<string, string>): string {
  return say(key).replace(/\{\{(\w+)\}\}/g, (_m, p: string) => real[p] ?? `${fillSample(key, `{{${p}}}`)}*`);
}

function caveatLines(c: Caveat, currency: string): string[] {
  const real: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.values as Record<string, unknown>)) {
    real[k] = typeof v === 'number' ? (k === 'months' || k === 'lookedFor' ? String(v) : money(v, currency)) : String(v);
  }
  const out = [fillReal(CAVEAT_KEYS[c.code], real)];
  if (c.code === 'large_for_month') {
    for (const [k, key] of Object.entries(CAVEAT_FIGURE_KEYS)) if (real[k] !== undefined) out.push(fillReal(key, real));
    out.push(say(CAVEAT_WRONG_FIGURE_KEY));
  }
  return out;
}

interface Worked {
  readonly kind: string;
  readonly label: string;
  readonly chip: string;
  readonly title: string;
  readonly body: string;
  readonly lines: readonly string[];
}

function workedAnswer(label: string, inputs: V3Inputs, check: CheckV2, r: Result): Worked {
  const once = check.pay.mode === 'once' || r.facts.some((f) => f.code === 'short_plan_from_cash');
  const row = verdictRowFor(r.code, r.variant, once);
  const cur = inputs.currency;
  const ab = r.afterBuy;
  const leftNow = ab.lead === 'usualMonth' && ab.usualMonth !== null ? ab.usualMonth : ab.month;
  const real: Record<string, string> = { month: monthName(ab.monthName), left: money(leftNow, cur), zero: money(0, cur) };
  const lines: string[] = [];
  if (r.code !== 'needs_input') {
    const v = ab.lead === 'usualMonth' && ab.usualMonth !== null ? ab.usualMonth : ab.month;
    const key = ab.lead === 'usualMonth' && ab.usualMonth !== null ? (v < 0 ? 'decide.v3.afterBuy.usualMonthOver' : 'decide.v3.afterBuy.usualMonth') : v < 0 ? 'decide.v3.afterBuy.monthOver' : 'decide.v3.afterBuy.month';
    lines.push(fillReal(key, { monthName: monthName(ab.monthName), amount: money(Math.abs(v), cur) }));
    lines.push(r.purchaseDate === inputs.asOf ? say('decide.v3.afterBuy.boughtToday') : fillReal('decide.v3.afterBuy.boughtOn', { date: r.purchaseDate }));
  }
  for (const m of r.missing) lines.push(fillReal(MISSING_KEYS[m], {}));
  for (const n of r.notices) lines.push(sayLine('notice', n, inputs));
  for (const f of r.facts) lines.push(sayLine('fact', f, inputs));
  const first = r.caveats?.[0];
  if (first !== undefined) lines.push(...caveatLines(first, cur));
  return {
    kind: `${r.code}${r.variant === null ? '' : `.${r.variant}`}`,
    label,
    chip: say(row.chipKey),
    title: fillReal(row.titleKey, real),
    body: fillReal(row.bodyKey, real),
    lines,
  };
}

// ---------------------------------------------------------------- grouping

const GROUPS: readonly [string, (k: string) => boolean][] = [
  ['Answers: headline, title and body', (k) => k.startsWith('decide.v3.verdict.')],
  ['Notices', (k) => k.startsWith('decide.v3.notice.')],
  ['Facts', (k) => k.startsWith('decide.v3.fact.')],
  ['Buttons on fact lines', (k) => k.startsWith('decide.v3.factAction.')],
  ['After you buy', (k) => k.startsWith('decide.v3.afterBuy.')],
  ['What the answer is based on', (k) => k.startsWith('decide.v3.basis.')],
  ['Next steps', (k) => k.startsWith('decide.v3.nextStep.')],
  ['Questions and missing figures', (k) => k.startsWith('decide.v3.missing.') || k.startsWith('decide.v3.readiness.')],
  ['What this answer can’t see (caveats)', (k) => k.startsWith('decide.v3.caveat.')],
  ['Tax', (k) => k.startsWith('decide.v3.tax.')],
  ['Plan labels', (k) => k.startsWith('decide.v3.plan.')],
  ['Under every answer', (k) => k.startsWith('legal.decideAnswer.')],
  ['About this answer (sheet)', (k) => k.startsWith('legal.decideAbout.')],
  ['How Decide answers (one-time card)', (k) => k.startsWith('legal.decideIntro.')],
  ['Other Decide lines', () => true],
];

const BADGE: Record<Status | 'Removed', string> = { New: 'new', Changed: 'chg', Same: 'same', Removed: 'rem' };

function rowHtml(r: Row): string {
  const filled = placeholdersOf(r.text).length > 0 ? `<div class="ex">Example: ${esc(fillSample(r.key, r.text))}</div>` : '';
  const old = r.status === 'Changed' && r.old !== undefined ? `<div class="old">Was: ${esc(r.old)}</div>` : '';
  const dec = DECISION_MAP[r.key];
  const tag = dec === undefined ? '' : ` <span class="dec">${esc(dec.id)}</span>`;
  return `<tr><td><span class="b ${BADGE[r.status]}">${r.status}</span>${tag}<div class="k">${esc(r.key)}</div></td><td>${esc(r.text)}${old}${filled}</td></tr>`;
}

const table = (rows: readonly Row[]): string => `<table>${rows.map(rowHtml).join('')}</table>`;

function section(title: string, rows: readonly Row[]): string {
  const changed = rows.filter((r) => r.status !== 'Same');
  const same = rows.filter((r) => r.status === 'Same');
  const sameHtml = same.length === 0 ? '' : `<details><summary>${same.length} the same as before</summary>${table(same)}</details>`;
  return `<h2>${esc(title)} <small>(${changed.length} new or changed, ${same.length} the same)</small></h2>${changed.length > 0 ? table(changed) : ''}${sameHtml}`;
}

const CSS =
  'body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:16px;line-height:1.45;color:#111}h2{margin-top:28px;font-size:1.1rem}h2 small{font-weight:normal;color:#555}table{border-collapse:collapse;width:100%}td{text-align:left;border-bottom:1px solid #ccc;padding:5px 6px;vertical-align:top;font-size:.92rem}td:first-child{width:32%}.k{font-family:ui-monospace,monospace;font-size:.75rem;color:#555;word-break:break-all}.b{display:inline-block;font-size:.7rem;padding:0 5px;border:1px solid #111;margin-right:4px}.new{background:#111;color:#fff}.chg{background:#ddd}.rem{text-decoration:line-through}.dec{font-size:.75rem;font-weight:bold}.old{color:#555;margin-top:3px}.old::before{content:""}.ex{color:#333;margin-top:3px;font-style:italic}.counts td{font-size:1rem}.ans{border:1px solid #111;padding:8px 12px;margin:10px 0}.ans .chip{font-weight:bold}.ans ul{margin:4px 0 0 18px;padding:0}.ans li{margin:2px 0}.lbl{font-size:.75rem;color:#555}summary{cursor:pointer}';

// ---------------------------------------------------------------- the page

function buildPage(): { html: string; counts: Record<string, number>; worked: number } {
  const base = baseRef();
  const oldEn = enAt(base);
  const oldAll = leaves(oldEn, '');
  const signed = readSigned();
  const signoff = readSignoff();
  const lockedBase: Leaves = signed ?? lockedLeaves(oldEn);
  const baseLabel = signed !== null ? `the signed copy of ${signoff.signedAt ?? 'an unknown date'}` : `main at ${base.slice(0, 8)} (the merge base with origin/main)`;

  const now = lockedLeaves(en);
  const lockedRows: Row[] = Object.keys(now).map((key) => {
    const text = now[key] as string;
    const old = lockedBase[key];
    return { key, text, old, status: old === undefined ? 'New' : old === text ? 'Same' : 'Changed' };
  });
  const otherRows: Row[] = OTHER_KEYS.map((key) => {
    const text = enLeaves[key] as string;
    const old = oldAll[key];
    return { key, text, old, status: old === undefined ? 'New' : old === text ? 'Same' : 'Changed' };
  });
  const removed = Object.keys(lockedBase)
    .filter((k) => now[k] === undefined && LOCKED_ROOTS.some((r) => k.startsWith(`${r}.`)))
    .concat(Object.keys(oldAll).filter((k) => k.startsWith('legal.decideFooter')))
    .filter((k, i, a) => a.indexOf(k) === i && enLeaves[k] === undefined)
    .sort();
  // Strings outside the locked groups that this phase retired (the old footer) come from the main baseline.
  const removedText = (k: string): string => lockedBase[k] ?? oldAll[k] ?? '';

  const pageRows = [...lockedRows, ...otherRows];
  const counts = {
    New: pageRows.filter((r) => r.status === 'New').length,
    Changed: pageRows.filter((r) => r.status === 'Changed').length,
    Same: pageRows.filter((r) => r.status === 'Same').length,
    Removed: removed.length,
    Total: pageRows.length,
  };

  // Worked answers (D-152): one per headline kind, the first case that gives it: the 310 saved answers first, then the approved
  // right-answer cases for the kinds the saved answers never reach.
  const sources: { label: string; inputs: V3Inputs; check: CheckV2 }[] = corpus().map((c) => ({ label: c.label, inputs: c.inputs, check: c.check }));
  for (const rc of loadCases().filter((x) => x.status === 'approved')) sources.push({ label: `${rc.id} ${rc.persona}`, ...toEngineInputs(rc.fixture) });
  const seen = new Map<string, Worked>();
  for (const c of sources) {
    const r = evaluate(c.inputs, c.check).result;
    if (r.readiness !== undefined && !r.readiness.ready) continue;
    const w = workedAnswer(c.label, c.inputs, c.check, r);
    const kind = `${w.kind}|${w.chip}|${w.title}`; // a headline kind: the code, variant and headline row it reads
    if (!seen.has(kind)) seen.set(kind, w);
  }
  const worked = [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.chip.localeCompare(b.chip));

  const parts: string[] = [];
  parts.push(`<h1>Decide wording review (D-15)</h1>`);
  parts.push(
    `<p>Every string on this page is new, changed or kept since ${esc(baseLabel)}. It covers Decide’s answers and the lines around them, the About sheet and intro card, and the 48 new undo and History lines on other screens. Strings with blanks show an example with sample figures. A <b>D-number</b> beside a line is the decision it follows. Screens come in 08.1.</p>`
  );
  parts.push(
    `<table class="counts"><tr><td>New</td><td><b>${counts.New}</b></td></tr><tr><td>Changed</td><td><b>${counts.Changed}</b></td></tr><tr><td>Same as before</td><td>${counts.Same}</td></tr><tr><td>Removed</td><td>${counts.Removed}</td></tr><tr><td>Strings on the page</td><td>${counts.Total}</td></tr><tr><td>Worked answers</td><td>${worked.length}</td></tr><tr><td>Money-help names</td><td>${Object.keys(FREE_HELP).length}</td></tr></table>`
  );
  parts.push(`<p>Signed: ${signoff.signedAt === null ? 'not yet. The owner signs before Grow starts (D-150).' : esc(`${signoff.signedAt} by ${signoff.by ?? '?'}`)}</p>`);

  // 1. Lines written from the owner's own words
  const own = lockedRows.filter((r) => DECISION_MAP[r.key] !== undefined).sort((a, b) => {
    const da = Number((DECISION_MAP[a.key]?.id ?? '').replace(/\D/g, ''));
    const db = Number((DECISION_MAP[b.key]?.id ?? '').replace(/\D/g, ''));
    return da - db || a.key.localeCompare(b.key);
  });
  parts.push(`<h2>Lines written from your own words <small>(${own.length})</small></h2>`);
  parts.push(
    `<table>${own
      .map((r) => {
        const dec = DECISION_MAP[r.key] as { id: string; words: string };
        const ex = placeholdersOf(r.text).length > 0 ? `<div class="ex">Example: ${esc(fillSample(r.key, r.text))}</div>` : '';
        return `<tr><td><b>${esc(dec.id)}</b><div class="lbl">${esc(dec.words)}</div><div class="k">${esc(r.key)}</div></td><td>${esc(r.text)}${ex}</td></tr>`;
      })
      .join('')}</table>`
  );

  // 2. Whole answers
  parts.push(`<h2>What a whole answer reads like <small>(${worked.length}, one per headline kind)</small></h2>`);
  parts.push(
    `<p class="lbl">Built from the saved answers and the approved right-answer cases, with their real figures. The screen (08.1) fills the body’s figures; a figure marked * is a sample. Every answer also ends with the three lines under it, shown once here: “${esc(say('legal.decideAnswer.caveat'))}” · “${esc(say('legal.decideAnswer.cantSeeLink'))}” · “${esc(say('legal.decideAnswer.footer'))}”</p>`
  );
  for (const w of worked) {
    parts.push(
      `<div class="ans"><div class="lbl">${esc(w.kind)} · ${esc(w.label)}</div><div class="chip">${esc(w.chip)}</div><div>${esc(w.title)}</div><div>${esc(w.body)}</div><ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`
    );
  }

  // 3. Every string, grouped
  const left = new Set(lockedRows.map((r) => r.key));
  for (const [title, test] of GROUPS) {
    const rows = lockedRows.filter((r) => left.has(r.key) && test(r.key));
    for (const r of rows) left.delete(r.key);
    if (rows.length > 0) parts.push(section(title, rows));
  }

  // 4. Free-help names (engine table, not en.ts)
  parts.push(`<h2>Money-help names <small>(${Object.keys(FREE_HELP).length}, from the FREE_HELP table)</small></h2>`);
  parts.push(
    `<table>${Object.entries(FREE_HELP)
      .map(([cc, e]) => `<tr><td><span class="b new">New</span><div class="k">${esc(cc)}</div></td><td>${esc(e.name)} · ${esc(e.url)}<div class="ex">Line: ${esc(say('decide.v3.fact.free_help').replace('{{name}}', e.name))}</div></td></tr>`)
      .join('')}</table>`
  );

  // 5. Other screens (D-151)
  parts.push(section('Other screens: undo and History lines (reviewed, not locked, D-151)', otherRows));

  // 6. Removed
  parts.push(`<h2>Removed <small>(${removed.length})</small></h2>`);
  parts.push(`<table>${removed.map((k) => `<tr><td><span class="b rem">Removed</span><div class="k">${esc(k)}</div></td><td>${esc(removedText(k))}</td></tr>`).join('')}</table>`);

  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decide wording review (D-15)</title><style>${CSS}</style>${parts.join('\n')}`;
  return { html, counts, worked: worked.length };
}

(WRITE ? describe : describe.skip)('wording review page (WORDING_WRITE=1)', () => {
  it('writes reports/wording/decide-v3.html', () => {
    const { html, counts, worked } = buildPage();
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('Lines written from your own words');
    expect(counts.Total).toBe(Object.keys(lockedLeaves(en)).length + OTHER_KEYS.length);
    expect(worked).toBeGreaterThan(0);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT, html, 'utf8');
    console.log(`wording page: ${OUT}\n${JSON.stringify({ ...counts, worked })}`);
  }, 600000);
});
