#!/usr/bin/env node
// 05.4-42 (BO-08; D-10, D-16, D-158..D-164): the shadow-run summary page.
//   node scripts/shadow-report.mjs [--revision <rev>] [--previous <rev>]
// Reads production read-only (Management API, read_only: true) and writes reports/shadow/<revision>.html (reports/ is
// gitignored). Accounts are labelled from docs/ops/decide-testers.json: role tester -> Tester 1, 2, ... in file order;
// role owner -> Owner A, B, ... The page never carries an account id, a name, a transaction or an account name: only the
// answer code and variant, the prefixed reason codes and the figures the phone already rounded to 2 significant figures.
// Token: SUPABASE_READONLY_TOKEN, else SUPABASE_ACCESS_TOKEN (exported per command; never printed). Fails closed without it.
// Exit 1 when a row comes from an account on no list ("Not on list"), as the release check would.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Copy of src/engine/decide/v3/constants.ts CODE_PRECEDENCE (lower index = stricter); a test keeps them equal. */
export const CODE_PRECEDENCE = ['needs_input', 'not_yet', 'monthly_short', 'fits_on_your_answer', 'fits_by_borrowing', 'fits_uses_overdraft', 'emergency_use', 'fits_uses_net', 'fits_unspent', 'fits_month'];
export const SAMPLE_ORDER = ['s60', 'p500', 'l2000', 'c9000_cash', 'c9000_plan', 'f1200_plan'];
/** One-off cash samples, cheapest first. Only these are compared for "a cheaper price got a stricter answer". */
export const CASH_LADDER = ['s60', 'p500', 'l2000', 'c9000_cash'];
export const SAMPLE_NAMES = {
  s60: '60 item', p500: '500 phone', l2000: '2,000 laptop', c9000_cash: '9,000 car, cash',
  c9000_plan: '9,000 car, 48 payments at 9.9%', f1200_plan: '1,200, 12 payments at 0%',
};
const REASON_LISTS = { m: 'missing', d: 'readiness', r: 'reasons', f: 'facts', c: 'caveats', n: 'notices' };
const MONEY_KEY = /^(am|aum|ab|s\..+)$/;
const REVISION_RE = /^[a-z0-9._-]{1,40}$/;
export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function readRevision(root = ROOT) {
  const text = readFileSync(join(root, 'src/engine/decide/v3/shadow/revision.ts'), 'utf8');
  const m = text.match(/DECIDE_ENGINE_REVISION\s*=\s*'([^']+)'/);
  if (!m) throw new Error('DECIDE_ENGINE_REVISION not found in revision.ts');
  return m[1];
}

export function parseCodePrecedence(constantsText) {
  const m = constantsText.match(/export const CODE_PRECEDENCE = \[([^\]]*)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

export function parseExponents(exponentsText) {
  const out = {};
  for (const m of exponentsText.matchAll(/^\s*([A-Z]{3}):\s*(\d),/gm)) out[m[1]] = Number(m[2]);
  return out;
}

export function loadContext(root = ROOT) {
  return {
    testersText: readFileSync(join(root, 'docs/ops/decide-testers.json'), 'utf8'),
    chipLabels: JSON.parse(readFileSync(join(root, 'scripts/shadow-labels.json'), 'utf8')).labels,
    exponents: parseExponents(readFileSync(join(root, 'src/engine/money/currencyExponents.ts'), 'utf8')),
  };
}

/** id (lower case) -> label. Tester 1.. by order among role tester; Owner A.. by order among role owner. */
export function labelsFrom(testersText) {
  const data = JSON.parse(testersText);
  const out = new Map();
  let t = 0;
  let o = 0;
  for (const a of data.accounts ?? []) {
    const id = String(a.id).toLowerCase();
    if (a.role === 'owner') out.set(id, `Owner ${String.fromCharCode(65 + o++)}`);
    else if (a.role === 'tester') out.set(id, `Tester ${++t}`);
  }
  return out;
}

export function buildQueries(revisions) {
  for (const r of revisions) if (!REVISION_RE.test(r)) throw new Error('bad revision');
  const list = revisions.map((r) => `'${r}'`).join(', ');
  return {
    rows:
      'select r.user_id, r.engine_revision, r.sample_id, r.code, r.variant, r.reasons, r.figures, r.created_at, s.currency ' +
      'from public.decide_shadow_runs r left join public.decide_settings s on s.user_id = r.user_id ' +
      `where r.engine_revision in (${list}) order by r.created_at`,
    shadowOn: 'select id from public.profiles where decide_shadow',
  };
}

const labelKey = (code, variant, sample) => `${code}|${variant ?? ''}|${CASH_LADDER.includes(sample) ? 1 : 0}`;

export function splitReasons(reasons) {
  const out = {};
  for (const r of reasons ?? []) {
    const i = String(r).indexOf(':');
    const list = REASON_LISTS[String(r).slice(0, i)] ?? 'other';
    (out[list] ??= []).push(String(r).slice(i + 1));
  }
  return out;
}

const fitCode = (c) => c === 'fits_month' || c === 'fits_unspent' || c.startsWith('fits_');

/** Pure analysis of the rows. No ids leave this function: everything is keyed by label. */
export function analyse({ rows, shadowOnIds, labels, chipLabels, revision, previous = null }) {
  const notOnList = new Set();
  const current = new Map(); // label -> sample -> row
  const prev = new Map();
  const currency = new Map();
  for (const row of rows) {
    const label = labels.get(String(row.user_id).toLowerCase());
    if (!label) {
      notOnList.add(String(row.user_id).toLowerCase());
      continue;
    }
    const target = row.engine_revision === revision ? current : row.engine_revision === previous ? prev : null;
    if (!target) continue;
    if (!target.has(label)) target.set(label, new Map());
    target.get(label).set(row.sample_id, row);
    if (row.currency && row.engine_revision === revision) currency.set(label, row.currency);
  }

  const perSample = SAMPLE_ORDER.map((sample) => {
    const counts = new Map();
    for (const [, bySample] of current) {
      const row = bySample.get(sample);
      if (!row) continue;
      const key = labelKey(row.code, row.variant, sample);
      const name = chipLabels[key] ?? `${row.code}${row.variant ? ` (${row.variant})` : ''}`;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return { sample, counts: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  });

  const surprises = [];
  const add = (label, sample, rule, text, row) => surprises.push({ label, sample, rule, text, row });
  let notReady = 0;
  const cutNoted = [];
  for (const [label, bySample] of [...current.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const sample of SAMPLE_ORDER) {
      const row = bySample.get(sample);
      if (!row) continue;
      const f = row.figures ?? {};
      if (f.ready === 0) notReady += 1;
      if (f.cut > 0) cutNoted.push({ label, sample, cut: f.cut });
      if (!chipLabels[labelKey(row.code, row.variant, sample)]) add(label, sample, 5, 'This answer has no label in the app (unknown code or variant).', row);
      if (fitCode(row.code) && row.variant == null && typeof f.am === 'number' && f.am < 0) {
        const plain = row.code === 'fits_month' || row.code === 'fits_unspent';
        if (plain || (typeof f.ab === 'number' && f.ab >= 0)) add(label, sample, 1, 'A fit with no caution takes this month below 0 (D-115).', row);
      }
      if (previous) {
        const old = prev.get(label)?.get(sample);
        if (old && (old.code !== row.code || (old.variant ?? null) !== (row.variant ?? null))) {
          add(label, sample, 2, `The answer changed since ${previous}: was ${old.code}${old.variant ? ` (${old.variant})` : ''}.`, row);
        }
      }
    }
    for (let i = 0; i < CASH_LADDER.length; i++) {
      for (let j = i + 1; j < CASH_LADDER.length; j++) {
        const cheap = bySample.get(CASH_LADDER[i]);
        const dear = bySample.get(CASH_LADDER[j]);
        if (!cheap || !dear) continue;
        const rc = CODE_PRECEDENCE.indexOf(cheap.code);
        const rd = CODE_PRECEDENCE.indexOf(dear.code);
        if (rc >= 0 && rd >= 0 && rc < rd) {
          add(label, CASH_LADDER[i], 3, `A cheaper price got a stricter answer than the ${SAMPLE_NAMES[CASH_LADDER[j]]} (${dear.code}).`, cheap);
        }
      }
    }
    if (SAMPLE_ORDER.every((s) => bySample.get(s)?.code === 'needs_input')) {
      add(label, 'all', 4, 'Every sample asks for more information (needs_input).', bySample.get('s60'));
    }
  }

  const waiting = [];
  for (const id of shadowOnIds) {
    const label = labels.get(String(id).toLowerCase());
    if (label && !(current.get(label)?.size === SAMPLE_ORDER.length)) waiting.push(label);
  }
  return {
    revision,
    previous,
    sent: [...current.entries()].filter(([, m]) => m.size === SAMPLE_ORDER.length).map(([l]) => l).sort(),
    switchedOn: shadowOnIds.filter((id) => labels.has(String(id).toLowerCase())).length,
    waiting: waiting.sort(),
    notOnList: notOnList.size,
    notReady,
    cutNoted,
    currency,
    perSample,
    surprises,
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function formatFigure(key, value, currency, exponents) {
  if (typeof value !== 'number') return '';
  if (!MONEY_KEY.test(key)) return String(value);
  if (!currency) return `${value.toLocaleString('en-US')} minor units`;
  const exp = exponents[currency] ?? 2;
  return `${currency} ${(value / 10 ** exp).toLocaleString('en-US', { maximumFractionDigits: exp })}`;
}

export function renderHtml(a, exponents) {
  const parts = [];
  parts.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push(`<title>Shadow run ${esc(a.revision)}</title>`);
  parts.push('<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1c1c1e}table{border-collapse:collapse;width:100%;margin:8px 0 20px}td,th{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}h2{margin-top:28px}.n{text-align:right}.muted{color:#666}</style></head><body>');
  parts.push(`<h1>Shadow run ${esc(a.revision)}</h1>`);
  parts.push(`<p>${a.sent.length} of ${a.switchedOn} switched-on accounts sent all 6 samples${a.sent.length ? ` (${esc(a.sent.join(', '))})` : ''}. Waiting: ${a.waiting.length ? esc(a.waiting.join(', ')) : 'none'}.</p>`);
  parts.push(`<p class="muted">Records not up to date (sent after the 7-day wait, D-145): ${a.notReady} rows. Rows from accounts on no list: ${a.notOnList}. Figures were rounded to 2 significant figures on the phone. No names, ids, transactions or account names are on this page.</p>`);
  parts.push('<h2>Answers per sample</h2>');
  for (const s of a.perSample) {
    parts.push(`<h3>${esc(SAMPLE_NAMES[s.sample])} <span class="muted">(${esc(s.sample)})</span></h3>`);
    if (!s.counts.length) {
      parts.push('<p class="muted">No answers yet.</p>');
      continue;
    }
    parts.push('<table><tr><th>Answer</th><th class="n">Count</th></tr>');
    for (const [name, n] of s.counts) parts.push(`<tr><td>${esc(name)}</td><td class="n">${n}</td></tr>`);
    parts.push('</table>');
  }
  parts.push(`<h2>Surprises (${a.surprises.length})</h2>`);
  if (!a.surprises.length) parts.push('<p>None.</p>');
  a.surprises.forEach((s, i) => {
    const row = s.row ?? {};
    const reasons = splitReasons(row.reasons);
    const cur = a.currency.get(s.label);
    parts.push(`<h3>${i + 1}. ${esc(s.label)}, ${esc(SAMPLE_NAMES[s.sample] ?? 'all samples')} (rule ${s.rule})</h3><p>${esc(s.text)}</p>`);
    parts.push(`<p>Answer: ${esc(row.code ?? '')}${row.variant ? ` (${esc(row.variant)})` : ''}</p>`);
    const rl = Object.entries(reasons).map(([k, v]) => `${esc(k)}: ${esc(v.join(', '))}`).join('<br>');
    if (rl) parts.push(`<p class="muted">${rl}</p>`);
    const figs = Object.entries(row.figures ?? {}).filter(([, v]) => typeof v === 'number');
    if (figs.length) {
      parts.push('<table><tr><th>Figure</th><th class="n">Value</th></tr>');
      for (const [k, v] of figs) parts.push(`<tr><td>${esc(k)}</td><td class="n">${esc(formatFigure(k, v, cur, exponents))}</td></tr>`);
      parts.push('</table>');
    }
  });
  if (a.cutNoted.length) {
    parts.push('<h2>Code lists cut at 12</h2><ul>');
    for (const c of a.cutNoted) parts.push(`<li>${esc(c.label)}, ${esc(c.sample)}: ${c.cut} codes cut</li>`);
    parts.push('</ul>');
  }
  parts.push('</body></html>');
  const html = parts.join('\n');
  if (UUID_RE.test(html)) throw new Error('refusing to write: the page contains an account id');
  return html;
}

async function query(doFetch, ref, token, sql) {
  const res = await doFetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: true }),
  });
  if (!res.ok) throw new Error(`query failed with HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('query returned an unexpected shape');
  return rows;
}

/** Returns { ok, lines, html, analysis }. Never puts the token in lines or html. */
export async function run({ fetch: doFetch, env, context, revision, previous = null }) {
  const token = env.SUPABASE_READONLY_TOKEN || env.SUPABASE_ACCESS_TOKEN;
  const ref = env.SUPABASE_PROD_PROJECT_REF;
  if (!token || !ref) return { ok: false, lines: ['fail closed: a Supabase token or SUPABASE_PROD_PROJECT_REF is missing.'] };
  const q = buildQueries(previous ? [revision, previous] : [revision]);
  let rows;
  let on;
  try {
    rows = await query(doFetch, ref, token, q.rows);
    on = await query(doFetch, ref, token, q.shadowOn);
  } catch (e) {
    return { ok: false, lines: [String(e.message).replaceAll(token, '***')] };
  }
  const analysis = analyse({
    rows,
    shadowOnIds: on.map((r) => r.id),
    labels: labelsFrom(context.testersText),
    chipLabels: context.chipLabels,
    revision,
    previous,
  });
  const html = renderHtml(analysis, context.exponents);
  const lines = [
    `revision ${revision}: ${analysis.sent.length} of ${analysis.switchedOn} sent; waiting ${analysis.waiting.length}; surprises ${analysis.surprises.length}`,
  ];
  if (analysis.notOnList) lines.push(`Not on list: ${analysis.notOnList} account(s) sent rows. Treat as a release-check failure.`);
  return { ok: analysis.notOnList === 0, lines, html, analysis };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const revision = arg('--revision') ?? readRevision();
  const r = await run({ fetch: globalThis.fetch, env: process.env, context: loadContext(), revision, previous: arg('--previous') });
  for (const l of r.lines) console.log(l);
  if (r.html) {
    const out = join(ROOT, 'reports/shadow', `${revision}.html`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, r.html);
    console.log(`wrote reports/shadow/${revision}.html`);
  }
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    console.error('shadow-report failed unexpectedly');
    process.exit(1);
  });
}
