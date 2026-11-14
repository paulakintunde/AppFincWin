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
import { RUNNING_COST_TEMPLATES, type TemplateLine } from '../../features/decide/screens/logic/runningCostTemplates';
import {
  CHANGED_061,
  DECISION_MAP,
  fillSample,
  leaves,
  type Leaves,
  LOCKED_ROOTS,
  lockedLeaves,
  OTHER_KEYS,
  OTHER_KEYS_061,
  placeholdersOf,
  readSigned,
  readSignoff,
  SAMPLE_VALUES,
  UNDO_HISTORY_PREFIXES,
} from './wordingScope';

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
  // 06.1-05: en.ts imports the decide.screens area files (./decideScreens, then ./common etc.), so relative imports inside
  // src/i18n/locales are loaded from the same ref. A file path is tried as `<path>.ts`, then `<path>/index.ts`.
  const cache = new Map<string, unknown>();
  const load = (file: string): unknown => {
    if (cache.has(file)) return cache.get(file);
    const source = git(`show ${ref}:${file}`);
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    const dir = file.slice(0, file.lastIndexOf('/'));
    const req = (id: string): unknown => {
      if (id === '../mandatedCopy') return mandatedCopy;
      if (id.startsWith('./')) {
        const base = `${dir}/${id.slice(2)}`;
        for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
          try {
            git(`cat-file -e ${ref}:${candidate}`);
          } catch {
            continue;
          }
          return load(candidate);
        }
      }
      throw new Error(`wording page: ${file} at ${ref} imports ${id}`);
    };
    new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
    cache.set(file, mod.exports);
    return mod.exports;
  };
  return (load('src/i18n/locales/en.ts') as { default?: unknown }).default;
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
  ['Other Decide lines', (k) => !k.startsWith('decide.screens.')],
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

function section(title: string, rows: readonly Row[], level: 'h2' | 'h3' = 'h2', id?: string): string {
  const changed = rows.filter((r) => r.status !== 'Same');
  const same = rows.filter((r) => r.status === 'Same');
  const sameHtml = same.length === 0 ? '' : `<details><summary>${same.length} the same as before</summary>${table(same)}</details>`;
  const idAttr = id === undefined ? '' : ` id="${id}"`;
  return `<${level}${idAttr}>${esc(title)} <small>(${changed.length} new or changed, ${same.length} the same)</small></${level}>${changed.length > 0 ? table(changed) : ''}${sameHtml}`;
}

const rowOf = (key: string, text: string, old: string | undefined): Row => ({ key, text, old, status: old === undefined ? 'New' : old === text ? 'Same' : 'Changed' });

// ---------------------------------------------------------------- 06.1-33: new screens, running costs, draft cases

/** decide.screens area files, in the order a user meets them (src/i18n/locales/decideScreens/index.ts). */
const SCREEN_AREAS: readonly [string, string][] = [
  ['common', 'Shared pieces (common.ts)'],
  ['home', 'Decide home (home.ts)'],
  ['sheetsHome', 'Sheets from Decide home (sheetsHome.ts)'],
  ['stepper', 'The check steps: item, price, how you pay, running costs (stepper.ts)'],
  ['answer', 'The answer (answer.ts)'],
  ['answerDetail', 'Answer details (answerDetail.ts)'],
  ['answerActions', 'Bought it, save for it, not now (answerActions.ts)'],
  ['setup', 'Setup banner, checklist and quick estimates (setup.ts)'],
  ['setupPayBills', 'Setup: pay and bills (setupPayBills.ts)'],
  ['setupOthers', 'Setup: the other items (setupOthers.ts)'],
  ['sheetsInput', 'Input sheets (sheetsInput.ts)'],
  ['sheetsCosts', 'Cost sheets (sheetsCosts.ts)'],
  ['past', 'Past decisions (past.ts)'],
  ['safetyNet', 'Safety net (safetyNet.ts)'],
];

/** A placeholder followed by a counted word (a plain or no-break space, at most one word between), on a key with no _one / _other form: it can read "1 months". */
const COUNTED_WORD = /\{\{(\w+)\}\}[ \u00a0](?:[a-z]+[ \u00a0])?(months|payments|days|entries|times|steps|changes|lines|weeks|years|goals|bills|rules|checks|items|answers|estimates)\b/;
const pluralRisk = (key: string, text: string): boolean => !/_(one|other|zero|few|many|two)$/.test(key) && COUNTED_WORD.test(text);

const REGION_NAME: Record<string, string> = { US: 'United States', GB: 'United Kingdom', CA: 'Canada' };

function templateHtml(): { html: string; lines: number } {
  const t = RUNNING_COST_TEMPLATES;
  let lines = 0;
  const regions = Object.entries(t.kinds.car) as [keyof typeof t.currencies, readonly TemplateLine[]][];
  const body = regions
    .map(([region, ls]) => {
      const cur = t.currencies[region];
      lines += ls.length;
      const rows = ls
        .map((l) => {
          const label = say(`decide.screens.stepper.running.${l.labelKey}`);
          const how = say(`decide.screens.stepper.running.${l.everyMonths === 1 ? 'monthly' : 'yearly'}`);
          const perMonth = l.everyMonths === 1 ? '' : ` (about ${money(Math.round(l.amount / l.everyMonths), cur)} a month)`;
          const fig = l.on ? `${money(l.amount, cur)} ${how}${perMonth}` : 'Off and empty; the user types it';
          return `<tr><td>${esc(label)}<div class="k">${esc(l.key)}</div></td><td>${esc(fig)}</td></tr>`;
        })
        .join('');
      const badge = region === 'US' ? '<span class="b same">From the decide spec (D13)</span>' : '<span class="b same">Approved by the owner, 2026-11-14</span>';
      return `<h3>${esc(REGION_NAME[region] ?? region)} · ${esc(cur)} ${badge}</h3><table>${rows}</table>`;
    })
    .join('');
  const intro = `<p class="lbl">Car running costs filled in on the Running costs step when no recorded bill matches; the screen calls them “quick estimates”. Figures as of ${esc(t.asOf)}. A country with no table gets empty lines, switched off, for the user to fill in. EU countries have no table (removed 2026-11-14). Every figure can be changed on the step.</p>`;
  return { html: intro + body, lines };
}

/** 06.1-83 (owner, 2026-11-14): draft cases the owner sent on instead of approving here. They stay draft; no engine change. */
const ROUTED_CASES: Readonly<Record<string, string>> = { 'SN-18': 'Routed to engine maths review (owner, 2026-11-14). Stays a draft; not for approval on this page.' };

function draftCasesHtml(): { html: string; ids: string[] } {
  const drafts = loadCases().filter((c) => c.status === 'draft');
  const ids = drafts.map((c) => c.id);
  const html = drafts
    .map((c) => {
      const { inputs, check } = toEngineInputs(c.fixture);
      const r = evaluate(inputs, check).result;
      const w = workedAnswer(`${c.id} ${c.persona}`, inputs, check, r);
      const exp = c.expected;
      const expKind = `${exp.code}${exp.variant === null ? '' : `.${exp.variant}`}`;
      const match = w.kind === expKind ? 'The app gives this answer today.' : `The app gives ${w.kind} today, not the expected ${expKind}.`;
      const m = exp.afterBuy.month;
      const left = m === null ? '' : ` Left that month: ${money(m, inputs.currency)}.`;
      const must = exp.mustHaveFacts.length > 0 ? ` Must show: ${exp.mustHaveFacts.join(', ')}.` : '';
      const routedNote = ROUTED_CASES[c.id];
      const routed = routedNote === undefined ? '' : `<div class="dec">${esc(routedNote)}</div>`;
      const mustNot = exp.mustNotHaveFacts.length > 0 ? ` Must not show: ${exp.mustNotHaveFacts.join(', ')}.` : '';
      return `<div class="ans" id="case-${esc(c.id)}"><div><span class="b new">Draft</span> <b>${esc(c.id)}</b> · ${esc(c.persona)}</div>${routed}<p>${esc(c.situation)}</p><div class="lbl">Expected: ${esc(expKind)}.${esc(left + must + mustNot)} ${esc(match)}</div><div class="lbl">What the answer reads like:</div><div class="chip">${esc(w.chip)}</div><div>${esc(w.title)}</div><div>${esc(w.body)}</div><ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><details><summary>Why this is the right answer</summary><p>${esc(c.why)}</p></details></div>`;
    })
    .join('');
  return { html, ids };
}

const CSS =
  'body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:16px;line-height:1.45;color:#111}h2{margin-top:28px;font-size:1.1rem}h2 small{font-weight:normal;color:#555}table{border-collapse:collapse;width:100%}td{text-align:left;border-bottom:1px solid #ccc;padding:5px 6px;vertical-align:top;font-size:.92rem}td:first-child{width:32%}.k{font-family:ui-monospace,monospace;font-size:.75rem;color:#555;word-break:break-all}.b{display:inline-block;font-size:.7rem;padding:0 5px;border:1px solid #111;margin-right:4px}.new{background:#111;color:#fff}.chg{background:#ddd}.rem{text-decoration:line-through}.dec{font-size:.75rem;font-weight:bold}.old{color:#555;margin-top:3px}.old::before{content:""}.ex{color:#333;margin-top:3px;font-style:italic}.counts td{font-size:1rem}.ans{border:1px solid #111;padding:8px 12px;margin:10px 0}.ans .chip{font-weight:bold}.ans ul{margin:4px 0 0 18px;padding:0}.ans li{margin:2px 0}.lbl{font-size:.75rem;color:#555}summary{cursor:pointer}';

// ---------------------------------------------------------------- the page

interface Page {
  readonly html: string;
  readonly counts: Record<string, number>;
  readonly worked: number;
  readonly pageRows: readonly Row[];
  readonly draftIds: readonly string[];
  readonly groups: Record<string, number>;
}

function buildPage(): Page {
  const base = baseRef();
  const oldEn = enAt(base);
  const oldAll = leaves(oldEn, '');
  const signed = readSigned();
  const signoff = readSignoff();
  const lockedBase: Leaves = signed ?? lockedLeaves(oldEn);
  const baseLabel = signed !== null ? `the signed copy of ${signoff.signedAt ?? 'an unknown date'}` : `main at ${base.slice(0, 8)} (the merge base with origin/main)`;

  const now = lockedLeaves(en);
  const lockedRows: Row[] = Object.keys(now).map((key) => rowOf(key, now[key] as string, lockedBase[key]));
  const isLocked = (k: string): boolean => LOCKED_ROOTS.some((r) => k.startsWith(`${r}.`));
  const isUndoHistory = (k: string): boolean => UNDO_HISTORY_PREFIXES.some((p) => k.startsWith(p));
  // Undo and History lines: plan 05.4-06's 48 (D-151), 06.1's own, and any other one that is new or changed since the baseline.
  const otherKeys: string[] = [...OTHER_KEYS, ...OTHER_KEYS_061];
  for (const k of Object.keys(enLeaves).sort()) if (isUndoHistory(k) && !otherKeys.includes(k) && oldAll[k] !== enLeaves[k]) otherKeys.push(k);
  const otherRows: Row[] = otherKeys.map((key) => rowOf(key, enLeaves[key] as string, oldAll[key]));
  // Every other line outside the locked groups that is new or changed since the baseline (e.g. You > Region, Activity's banner).
  const elsewhereRows: Row[] = Object.keys(enLeaves)
    .filter((k) => !isLocked(k) && !isUndoHistory(k) && !otherKeys.includes(k) && oldAll[k] !== enLeaves[k])
    .sort()
    .map((key) => rowOf(key, enLeaves[key] as string, oldAll[key]));
  const removed = Object.keys(lockedBase)
    .filter((k) => now[k] === undefined && isLocked(k))
    .concat(Object.keys(oldAll).filter((k) => k.startsWith('legal.decideFooter')))
    .filter((k, i, a) => a.indexOf(k) === i && enLeaves[k] === undefined)
    .sort();
  // Strings outside the locked groups that this phase retired (the old footer) come from the main baseline.
  const removedText = (k: string): string => lockedBase[k] ?? oldAll[k] ?? '';
  const removedElsewhere = Object.keys(oldAll)
    .filter((k) => enLeaves[k] === undefined && !isLocked(k) && !removed.includes(k))
    .sort();

  const pageRows = [...lockedRows, ...otherRows, ...elsewhereRows];
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

  // 06.1-33 pieces
  const changed061 = Object.entries(CHANGED_061).map(([topic, keys]) => ({
    topic,
    rows: keys.map((key) => {
      const text = now[key];
      if (text === undefined) throw new Error(`wording page: ${key} (${topic}) is not a locked string in en.ts`);
      return rowOf(key, text, lockedBase[key]);
    }),
  }));
  const drafts = draftCasesHtml();
  const templates = templateHtml();
  const screenRows = lockedRows.filter((r) => r.key.startsWith('decide.screens.'));
  const areaRows = SCREEN_AREAS.map(([area, title]) => ({ area, title, rows: screenRows.filter((r) => r.key.startsWith(`decide.screens.${area}.`)) }));
  const unplaced = screenRows.filter((r) => !SCREEN_AREAS.some(([a]) => r.key.startsWith(`decide.screens.${a}.`)));
  if (unplaced.length > 0) areaRows.push({ area: 'other', title: 'Other screen lines', rows: unplaced });
  const plural = pageRows.filter((r) => pluralRisk(r.key, r.text));

  // Groups for the counts table and the contents list: [anchor, title, lines].
  const answerRows = lockedRows.filter((r) => !r.key.startsWith('decide.screens.'));
  const own = lockedRows.filter((r) => DECISION_MAP[r.key] !== undefined).sort((a, b) => {
    const da = Number((DECISION_MAP[a.key]?.id ?? '').replace(/\D/g, ''));
    const db = Number((DECISION_MAP[b.key]?.id ?? '').replace(/\D/g, ''));
    return da - db || a.key.localeCompare(b.key);
  });
  const toc: [string, string, string][] = [
    ['own', 'Lines written from your own words', `${own.length} lines`],
    ['changed061', 'Changed for 06.1', `${changed061.reduce((n, t) => n + t.rows.length, 0)} lines`],
    ['drafts', 'Draft cases to approve', `${drafts.ids.length} cases (${drafts.ids.join(', ')})`],
    ['templates', 'Running-cost quick estimates', `${templates.lines} figures in ${Object.keys(RUNNING_COST_TEMPLATES.kinds.car).length} countries`],
    ['worked', 'What a whole answer reads like', `${worked.length} answers`],
    ['screens', 'New screens (decide.screens)', `${screenRows.length} lines`],
    ['answers', 'Answer wording (decide.v3, legal.decide*)', `${answerRows.length} lines`],
    ['help', 'Money-help names', `${Object.keys(FREE_HELP).length} names`],
    ['undo', 'Undo and History lines', `${otherRows.length} lines`],
    ['elsewhere', 'Other screens changed in 06.1', `${elsewhereRows.length} lines`],
    ['plural', 'Lines that can read “1 months”', `${plural.length} lines`],
    ['removed', 'Removed', `${removed.length} locked lines, ${removedElsewhere.length} elsewhere`],
  ];

  const parts: string[] = [];
  parts.push(`<h1>Decide wording review (D-08, D-15)</h1>`);
  parts.push(
    `<p>Every string on this page is new, changed or kept since ${esc(baseLabel)}. It covers Decide’s answers and the lines around them, the new Decide screens (06.1), the About sheet and intro card, the undo and History lines, the running-cost quick estimates and the draft right-answer cases. Strings with blanks show an example with sample figures. A <b>D-number</b> beside a line is the decision it follows. Lines under decide.v3, legal.decide* and decide.screens are locked once you sign; the undo, History and other-screen lines are reviewed, not locked.</p>`
  );
  parts.push(
    `<table class="counts"><tr><td>New</td><td><b>${counts.New}</b></td></tr><tr><td>Changed</td><td><b>${counts.Changed}</b></td></tr><tr><td>Same as before</td><td>${counts.Same}</td></tr><tr><td>Removed</td><td>${counts.Removed}</td></tr><tr><td>Strings on the page</td><td>${counts.Total}</td></tr><tr><td>Worked answers</td><td>${worked.length}</td></tr><tr><td>Money-help names</td><td>${Object.keys(FREE_HELP).length}</td></tr></table>`
  );
  parts.push(`<p>Signed: ${signoff.signedAt === null ? 'not yet.' : esc(`${signoff.signedAt} by ${signoff.by ?? '?'}`)}</p>`);
  parts.push(`<h2>Contents</h2><table>${toc.map(([id, title, n]) => `<tr><td><a href="#${id}">${esc(title)}</a></td><td>${esc(n)}</td></tr>`).join('')}</table>`);

  // 1. Lines written from the owner's own words
  parts.push(`<h2 id="own">Lines written from your own words <small>(${own.length})</small></h2>`);
  parts.push(
    `<table>${own
      .map((r) => {
        const dec = DECISION_MAP[r.key] as { id: string; words: string };
        const ex = placeholdersOf(r.text).length > 0 ? `<div class="ex">Example: ${esc(fillSample(r.key, r.text))}</div>` : '';
        return `<tr><td><b>${esc(dec.id)}</b><div class="lbl">${esc(dec.words)}</div><div class="k">${esc(r.key)}</div></td><td>${esc(r.text)}${ex}</td></tr>`;
      })
      .join('')}</table>`
  );

  // 2. Changed for 06.1
  parts.push(`<h2 id="changed061">Changed for 06.1 <small>(by decision)</small></h2>`);
  for (const t of changed061) parts.push(`<h3>${esc(t.topic)}</h3>${table(t.rows)}`);

  // 3. Draft right-answer cases
  parts.push(`<h2 id="drafts">Draft cases to approve <small>(${drafts.ids.length})</small></h2>`);
  parts.push(`<p class="lbl">For each case: approve it as the right answer, or say what should change. The answer is built by the app from the case’s figures.</p>`);
  parts.push(drafts.html);

  // 4. Running-cost quick estimates
  parts.push(`<h2 id="templates">Running-cost quick estimates <small>(car, by country)</small></h2>`);
  parts.push(templates.html);

  // 5. Whole answers
  parts.push(`<h2 id="worked">What a whole answer reads like <small>(${worked.length}, one per headline kind)</small></h2>`);
  parts.push(
    `<p class="lbl">Built from the saved answers and the approved right-answer cases, with their real figures. A figure marked * is a sample. Every answer also ends with the three lines under it, shown once here: “${esc(say('legal.decideAnswer.caveat'))}” · “${esc(say('legal.decideAnswer.cantSeeLink'))}” · “${esc(say('legal.decideAnswer.footer'))}”</p>`
  );
  for (const w of worked) {
    parts.push(
      `<div class="ans"><div class="lbl">${esc(w.kind)} · ${esc(w.label)}</div><div class="chip">${esc(w.chip)}</div><div>${esc(w.title)}</div><div>${esc(w.body)}</div><ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`
    );
  }

  // 6. New screens, by area file
  parts.push(`<h2 id="screens">New screens (decide.screens) <small>(${screenRows.length}, by area file)</small></h2>`);
  for (const a of areaRows) if (a.rows.length > 0) parts.push(section(a.title, a.rows, 'h3'));

  // 7. Answer wording, grouped
  parts.push(`<h2 id="answers">Answer wording (decide.v3, legal.decide*) <small>(${answerRows.length})</small></h2>`);
  const left = new Set(answerRows.map((r) => r.key));
  for (const [title, test] of GROUPS) {
    const rows = answerRows.filter((r) => left.has(r.key) && test(r.key));
    for (const r of rows) left.delete(r.key);
    if (rows.length > 0) parts.push(section(title, rows, 'h3'));
  }

  // 8. Free-help names (engine table, not en.ts)
  parts.push(`<h2 id="help">Money-help names <small>(${Object.keys(FREE_HELP).length}, from the FREE_HELP table)</small></h2>`);
  parts.push(
    `<table>${Object.entries(FREE_HELP)
      .map(([cc, e]) => `<tr><td><div class="k">${esc(cc)}</div></td><td>${esc(e.name)} · ${esc(e.url)}<div class="ex">Line: ${esc(say('decide.v3.fact.free_help').replace('{{name}}', e.name))}</div></td></tr>`)
      .join('')}</table>`
  );

  // 9. Undo and History lines (D-151 and 06.1)
  parts.push(section('Undo and History lines (reviewed, not locked)', otherRows, 'h2', 'undo'));

  // 10. Other screens changed in 06.1
  parts.push(section('Other screens changed in 06.1 (reviewed, not locked)', elsewhereRows, 'h2', 'elsewhere'));

  // 11. Plural check
  parts.push(`<h2 id="plural">Lines that can read “1 months” <small>(${plural.length})</small></h2>`);
  parts.push(`<p class="lbl">A number blank followed by a counted word, with no one / many form. With a count of 1 these read “1 months”.</p>`);
  parts.push(table(plural));

  // 12. Removed
  parts.push(`<h2 id="removed">Removed <small>(${removed.length})</small></h2>`);
  parts.push(`<table>${removed.map((k) => `<tr><td><span class="b rem">Removed</span><div class="k">${esc(k)}</div></td><td>${esc(removedText(k))}</td></tr>`).join('')}</table>`);
  if (removedElsewhere.length > 0) {
    parts.push(
      `<details><summary>${removedElsewhere.length} lines removed outside the locked groups (old screens)</summary><table>${removedElsewhere.map((k) => `<tr><td><div class="k">${esc(k)}</div></td><td>${esc(oldAll[k] ?? '')}</td></tr>`).join('')}</table></details>`
    );
  }

  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decide wording review (D-08)</title><style>${CSS}</style>${parts.join('\n')}`;
  const groups: Record<string, number> = Object.fromEntries(toc.map(([id, , n]) => [id, Number(n.split(' ')[0])]));
  for (const a of areaRows) groups[`screens.${a.area}`] = a.rows.length;
  return { html, counts, worked: worked.length, pageRows, draftIds: drafts.ids, groups };
}

(WRITE ? describe : describe.skip)('wording review page (WORDING_WRITE=1)', () => {
  it('writes reports/wording/decide-v3.html', () => {
    const { html, counts, worked, pageRows, draftIds, groups } = buildPage();
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('Lines written from your own words');
    expect(counts.Total).toBe(pageRows.length);
    expect(worked).toBeGreaterThan(0);
    // 06.1-33 completeness: every locked string (all LOCKED_ROOTS, decide.screens included) is on the page by its dotted key.
    const missing = Object.keys(lockedLeaves(en)).filter((k) => !html.includes(`<div class="k">${esc(k)}</div>`));
    expect(missing).toEqual([]);
    // The draft right-answer cases the owner approves (BR-16, SN-16..SN-24).
    for (const id of ['BR-16', 'SN-16', 'SN-17', 'SN-18', 'SN-19', 'SN-20', 'SN-21', 'SN-22', 'SN-23', 'SN-24']) expect(draftIds).toContain(id);
    // 06.1-83: SN-18 stays a draft, marked as routed to the engine maths review.
    expect(html).toContain('Routed to engine maths review (owner, 2026-11-14)');
    // Every blank on the page reads filled.
    const noSample = new Set<string>();
    for (const r of pageRows) for (const p of placeholdersOf(r.text)) if (SAMPLE_VALUES[p] === undefined) noSample.add(`${p} (${r.key})`);
    expect([...noSample]).toEqual([]);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT, html, 'utf8');
    console.log(`wording page: ${OUT}\n${JSON.stringify({ ...counts, worked, groups })}`);
  }, 600000);
});
