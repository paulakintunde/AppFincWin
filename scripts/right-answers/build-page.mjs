#!/usr/bin/env node
// 05.4-05 (D-01): one static review page per topic, built from the same JSON the engine tests read, so the page cannot
// drift from the tests. Usage: node scripts/right-answers/build-page.mjs [--topic <topic>]
// Output: reports/right-answers/<topic>.html (self-contained, no scripts).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CASES_DIR = join(ROOT, 'src/engine/decide/v3/__tests__/rightAnswers/cases');
const OUT_DIR = join(ROOT, 'reports/right-answers');
const TOPIC_TOTAL = 9;

const LABELS = {
  fits_month: 'Fits',
  'fits_month.tight': 'Fits, but tight each month',
  'fits_month.low_month': 'Fits, a low month is tight',
  'fits_month.no_net': 'Fits, but no safety net',
  'fits_month.small_net': 'Fits, but your safety net is small',
  'fits_unspent.tight': 'Fits, but tight',
  'fits_unspent.no_net': 'Fits, but no safety net',
  'fits_unspent.small_net': 'Fits, but your safety net is small',
  'fits_unspent.costly_debt': 'Fits, but you carry costly debt',
  'fits_unspent.low_month': 'Fits, a low month is tight',
  fits_uses_net: 'Dips into your safety net',
  'fits_uses_net.protection_off': 'Uses your safety net · protection off',
  fits_uses_overdraft: 'Uses your overdraft',
  'fits_uses_overdraft.not_cleared': 'Uses your overdraft past payday',
  fits_by_borrowing: 'Only by borrowing',
  'fits_by_borrowing.borrowing_costs_more': 'Fits, but borrowing costs more',
  fits_on_your_answer: 'Only on your answer',
  not_yet: 'Not yet',
  monthly_short: 'Short each month',
  needs_input: 'Needs a figure first',
  fits_unspent: 'Fits from spare money',
  emergency_use: 'Uses your safety net',
};

// D-40: tight on a one-off purchase reads "Fits, but tight"; on a plan it stays "Fits, but tight each month".
function labelOf(code, variant, payMode) {
  if (code === 'fits_month' && variant === 'tight' && payMode === 'once') return 'Fits, but tight';
  return LABELS[`${code}.${variant}`] ?? LABELS[code] ?? code;
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function money(minor, currency) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = { USD: '$', CAD: '$', GBP: '£', EUR: '€' }[currency] ?? '';
  return `${sign}${symbol}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

function numbersRows(f) {
  const m = (n) => money(n, f.currency);
  const rows = [
    ['Pay', `${m(f.pay.amount)} ${f.pay.cadence}, next on ${f.pay.nextDate}`],
    ['Usual bills a month', m(f.usualMonth.bills)],
    ['Usual everyday spending a month', m(f.usualMonth.everyday)],
  ];
  for (const a of f.accounts) {
    const od = a.overdraftLimit === null ? '' : `, overdraft limit ${m(a.overdraftLimit)}${a.overdraftRate ? ` at ${a.overdraftRate}%` : ''}`;
    rows.push([`Account: ${a.name}`, `${m(a.balance)}${od}`]);
  }
  if (f.safetyNet) {
    rows.push(['Safety net', `${f.safetyNet.protect ? 'protected' : 'protection off'}, saved ${m(f.safetyNet.saved)}${f.safetyNet.size === null ? '' : `, size ${m(f.safetyNet.size)}`}`]);
  }
  for (const d of f.debts) rows.push([`Debt (${d.kind})`, `${m(d.balance)}, minimum ${m(d.minimum)}${d.apr ? `, ${d.apr}%` : ''}`]);
  const c = f.check;
  rows.push(['Price', c.price === null ? 'none' : m(c.price)]);
  if (c.taxPercent) rows.push(['Tax', `${c.taxPercent}%`]);
  if (c.oneOffFees) rows.push(['Fees', m(c.oneOffFees)]);
  if (c.pay.mode === 'plan') rows.push(['Paid over', `${c.pay.months} months${c.pay.apr ? ` at ${c.pay.apr}%` : ''}`]);
  return rows;
}

function card(c) {
  const rows = numbersRows(c.fixture)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('');
  const notes = [
    c.ownerReason ? `<p><strong>Owner:</strong> ${esc(c.ownerReason)}</p>` : '',
    c.expertNote ? `<p><strong>Expert:</strong> ${esc(c.expertNote)}</p>` : '',
    c.plannerNote ? `<p><strong>Planner note:</strong> ${esc(c.plannerNote)}</p>` : '',
  ].join('');
  return `<section class="card" id="${esc(c.id)}">
<h2>${esc(c.id)} <span class="who">${esc(c.persona)}</span></h2>
<h3>Situation</h3><p>${esc(c.situation)}</p>
${c.reviewNote ? `<div class="check"><h3>Owner check</h3><p>${esc(c.reviewNote)}</p></div>` : ''}
<h3>Expected answer</h3><p class="answer">${esc(labelOf(c.expected.code, c.expected.variant, c.fixture.check.pay.mode))}</p>
<h3>Why</h3><p>${esc(c.why)}</p>
<h3>Numbers</h3><table>${rows}</table>
<p class="status">Status: ${esc(c.status)}</p>
${notes}
</section>`;
}

function loadTopics() {
  const out = new Map();
  for (const f of readdirSync(CASES_DIR).filter((n) => n.endsWith('.json')).sort()) {
    const file = JSON.parse(readFileSync(join(CASES_DIR, f), 'utf8'));
    out.set(file.topic, file.cases);
  }
  return out;
}

const CSS = `body{font-family:system-ui,sans-serif;color:#000;background:#fff;max-width:760px;margin:0 auto;padding:16px;line-height:1.45}
h1{font-size:1.5rem}h2{font-size:1.15rem;margin:0}h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;margin:12px 0 2px}
.card{border:1px solid #000;padding:12px 16px;margin:16px 0}.who{font-weight:normal}.answer{font-size:1.1rem;font-weight:bold;margin:0}
table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ccc;padding:4px 6px;font-size:.9rem}th{width:45%;font-weight:normal}
.status{font-size:.85rem;margin-bottom:0}.check{border:2px solid #000;padding:4px 10px;margin:8px 0}`;

function buildPage(topic, cases, approvedTopics) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Right answers: ${esc(topic)}</title><style>${CSS}</style></head><body>
<h1>Right answers: ${esc(topic.replace(/-/g, ' '))}</h1>
<p>${cases.length} ${cases.length === 1 ? 'case' : 'cases'}. Progress: ${approvedTopics} of ${TOPIC_TOTAL} topics approved.</p>
${cases.length === 0 ? '<p>No cases yet.</p>' : cases.map(card).join('\n')}
</body></html>
`;
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--topic');
  const only = i >= 0 ? args[i + 1] : null;
  const topics = loadTopics();
  if (only && !topics.has(only)) {
    console.error(`unknown topic: ${only}`);
    process.exit(1);
  }
  const approvedTopics = [...topics.values()].filter((cs) => cs.length > 0 && cs.every((c) => c.status === 'approved')).length;
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [topic, cases] of topics) {
    if (only && topic !== only) continue;
    writeFileSync(join(OUT_DIR, `${topic}.html`), buildPage(topic, cases, approvedTopics));
    console.log(`wrote reports/right-answers/${topic}.html (${cases.length} cases)`);
  }
}

main();
