// 05.5-16 (D-07): the changed-answers page for the builder swap. Test-only.
//
// The reviewed-diff corpus (engine/decide/v3/__tests__/reviewed) feeds the engine directly, so the builder swap cannot move it. What the
// swap can move is what the builders hand the engine. This file runs each fixture source of the parity harness through the old path
// (buildDecideSnapshot -> buildV3Inputs) and the new one (buildInputs), judges the same checks on both, and lists every answer that
// differs. Next to those rows sit the Grow figures (05.5-26), the bill-detector windows (05.5-10) and the named input differences
// (05.5-12), each with a reason. The owner approves or sends back each row; changedAnswers.json holds the rows, reasons and approvals.
//
//   CHANGED_ANSWERS_WRITE=1 npx jest src/features/decide/snapshot/v3/__tests__/changedAnswers.test.ts
//       rewrites changedAnswers.json (reasons and approvals of rows that still exist are kept) and the page
//       reports/reviewed/05.5-16-changed-answers.html. Without the variable the test only checks the file against today's code.
import * as fs from 'fs';
import * as path from 'path';
import { evaluate, readStoredCheck, type CheckV2 } from '@/engine/decide/v3';
import { carInputs, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import { toCheckV2, type FixturePurchase } from '@/engine/decide/v3/__tests__/golden/adapter';
import { pick } from '@/engine/decide/v3/__tests__/rightAnswers/pick';
import { type ReviewedAnswer } from '@/engine/decide/v3/__tests__/reviewed/corpus';
import { esc, words } from '@/engine/decide/v3/__tests__/reviewed/page';
import { buildDecideSnapshot } from '../../buildSnapshot';
import { buildInputs } from '../buildInputs';
import { buildV3Inputs } from '../buildV3Inputs';
import { cases, diffInputs } from './builderCases';
import { EXPECTED_DIFFS } from './expectedDiffs';

const FILE = path.join(__dirname, 'changedAnswers.json');
const WRITE = process.env.CHANGED_ANSWERS_WRITE === '1';
/** Flipped to true by the owner approval step of 05.5-16 (Task 3): from then on an unapproved row fails the build. */
const REQUIRE_APPROVAL = false;
const MIN_REASON = 20;

type Section = 'answer' | 'grow' | 'detector' | 'input';
interface Row {
  id: string;
  section: Section;
  /** Plain words: what moved. */
  what: string;
  old: string;
  next: string;
  reason: string;
  /** Which change names it (D-11 cap store, 05.5-26 Grow, ...). */
  source: string;
  /** A rounding change is its own row and is never batched (D-07). */
  rounding: boolean;
  approved: boolean;
  approvedAt: string | null;
}
interface Stored {
  rows: Row[];
}

const BASE: FixturePurchase = {
  price: null, taxPercent: null, oneOffFees: 0, itemType: 'general', purpose: null, emergency: false, envelopeId: null, categoryId: null,
  pay: { mode: 'once' }, extras: {}, share: 'personal', foreign: null,
};
const cash = (price: number, categoryId: string | null = null): CheckV2 => toCheckV2({ ...BASE, price, categoryId });

interface Named { name: string; check: CheckV2 }
const CHECKS: Named[] = [
  { name: 'sofa', check: readStoredCheck(sofaInputs).check },
  { name: 'car', check: readStoredCheck(carInputs).check },
  ...[6000, 50000, 200000, 900000].map((p) => ({ name: `${p / 100} cash`, check: cash(p) })),
  { name: '600 cash in the Groceries category', check: cash(60000, 'c-food') },
  { name: '150 cash in the Dining category', check: cash(15000, 'cat-dining') },
  { name: '600 cash in the Groceries category (demo)', check: cash(60000, 'cat-groceries') },
];

/** What the answer says: the verdict, the month after buying, the date it is ready and the reasons and facts shown with it. */
interface Said { answer: ReviewedAnswer; readyBy: string | null; notes: string[] }
const answerOf = (inputs: Parameters<typeof evaluate>[0], check: CheckV2): Said => {
  const p = pick(evaluate(inputs, check));
  return { answer: { code: p.code, variant: p.variant, afterBuyMonth: p.afterBuy.month }, readyBy: p.readyBy, notes: [...p.reasons, ...p.facts].sort() };
};
const say = (a: Said): string => `${words(a.answer)}${a.readyBy === null ? '' : `; ready by ${a.readyBy}`}${a.notes.length === 0 ? '' : `; shown with it: ${a.notes.join(', ')}`}`;

const PLAIN: Readonly<Record<string, string>> = { line_crossed: 'it now says the purchase crosses one of your category limits' };
const plain = (code: string): string => PLAIN[code] ?? code;
/** The notes added or dropped, in words, so the owner sees at a glance what moved. */
function differenceNote(before: Said, after: Said): string {
  const added = after.notes.filter((n) => !before.notes.includes(n)).map(plain);
  const dropped = before.notes.filter((n) => !after.notes.includes(n)).map(plain);
  const parts = [added.length === 0 ? '' : `now also: ${added.join(', ')}`, dropped.length === 0 ? '' : `no longer: ${dropped.join(', ')}`].filter((x) => x !== '');
  return parts.length === 0 ? '' : ` (${parts.join('; ')})`;
}

/** The reason for an answer that moved, by which named input difference the case shows. */
function reasonFor(paths: readonly string[]): { reason: string; source: string } {
  if (paths.some((p) => /^limits\.lines/.test(p))) {
    return {
      source: 'D-11 cap store',
      reason: 'The category limit now comes from the cap set on Activity (categories.monthly_cap), so a purchase in that category is checked against it and the answer now says when it crosses the limit. The verdict itself did not change. The old path read caps only from the rules document.',
    };
  }
  if (paths.some((p) => /seriesId/.test(p))) {
    return { source: 'gap: seriesId', reason: 'A debt now says which regular payment covers it, so that payment is not counted a second time in the month.' };
  }
  return { source: 'unnamed', reason: '' };
}

/** Each fixture situation built once on both paths; the rows below share it. */
let built: { name: string; old: ReturnType<typeof buildInputs>; next: ReturnType<typeof buildInputs>; diffs: ReturnType<typeof diffInputs> }[] | null = null;
function bothPaths(): NonNullable<typeof built> {
  built ??= cases().map((c) => {
    const old = buildV3Inputs(c.source, c.settings, buildDecideSnapshot(c.source));
    const next = buildInputs(c.source, c.settings);
    return { name: c.name, old, next, diffs: diffInputs(old, next) };
  });
  return built;
}

function liveAnswerRows(): Row[] {
  const out: Row[] = [];
  for (const c of bothPaths()) {
    const { old, next } = c;
    const paths = c.diffs.map((d) => d.path);
    if (paths.length === 0) continue;
    const why = reasonFor(paths);
    for (const k of CHECKS) {
      const before = answerOf(old, k.check);
      const after = answerOf(next, k.check);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      out.push({
        id: `answer:${c.name}:${k.name}`,
        section: 'answer',
        what: `${c.name}: ${k.name}${differenceNote(before, after)}`,
        old: say(before),
        next: say(after),
        reason: why.reason,
        source: why.source,
        rounding: false,
        approved: false,
        approvedAt: null,
      });
    }
  }
  return out;
}

/** Input differences the builders show (05.5-12), grouped by the named expected difference and the cases they appear in. */
function liveInputRows(): Row[] {
  const out: Row[] = [];
  EXPECTED_DIFFS.forEach((e, i) => {
    const names: string[] = [];
    for (const c of bothPaths()) {
      if (c.diffs.some((d) => e.pathPattern.test(d.path))) names.push(c.name);
    }
    out.push({
      id: `input:${i}:${e.source}`,
      section: 'input',
      what: `What the builder hands the engine (${e.source}); seen in ${names.length} of ${bothPaths().length} fixture situations: ${names.join('; ')}`,
      old: 'old builder value',
      next: 'new builder value',
      reason: e.reason,
      source: e.source,
      rounding: false,
      approved: false,
      approvedAt: null,
    });
  });
  return out;
}

const noApproval = { rounding: false, approved: false, approvedAt: null } as const;

/** 05.5-26-SUMMARY "Grow figures for D-07" (owner chose standing saving and investing plans only, 2026-11-15). Money in minor units. */
const GROW_ROWS: readonly Row[] = [
  { id: 'grow:demo:left', section: 'grow', what: 'Demo account: usual money left each month (Debts screen "left", Lines breakdown result)', old: '200.00', next: '1,100.00', source: '05.5-26 Grow on v3', reason: 'The new usual month does not subtract saving that was only logged as lines (the old path subtracted 900.00 of logged saving and investing). Saving counts only when it is a standing plan (a repeating series).', ...noApproval },
  { id: 'grow:demo:saving', section: 'grow', what: 'Demo account: saving row and default floors', old: '900.00', next: '0.00', source: '05.5-26 Grow on v3', reason: 'Same cause: hand-logged saving no longer counts; only standing saving plans do, and the demo account has none.', ...noApproval },
  { id: 'grow:demo:badges', section: 'grow', what: 'Demo account: "Met" badges and unset floors for investing and saving', old: 'investing 400.00, saving 500.00 (logged averages)', next: '0.00 and 0.00', source: '05.5-26 Grow on v3', reason: 'The badge and an unset floor now read standing plans only. A rule with a figure of its own, and logged-only saving, can flip from "Met" to "Not yet".', ...noApproval },
  { id: 'grow:typed:left', section: 'grow', what: 'Typed estimates only (income 4,000.00, spending 3,000.00, saving 200.00): usual money left each month', old: '1,000.00', next: '800.00', source: '05.5-26 Grow on v3', reason: 'Typed saving, debt and investing figures now count; the old rough path ignored them.', ...noApproval },
  { id: 'grow:typed:saving', section: 'grow', what: 'Typed estimates only (same account): saving row', old: '0.00', next: '200.00', source: '05.5-26 Grow on v3', reason: 'Typed saving now shows as the saving row; the old rough path showed none.', ...noApproval },
  { id: 'grow:income', section: 'grow', what: 'Any logged month: usual pay (income) on the Grow lines', old: 'average of the logged months', next: 'median of the usual-month window', source: '05.5-26 Grow on v3', reason: 'Decide and Grow now read one usual-month income (typicalIncome). Equal on the fixtures; it can differ for a variable earner. Rounding: none, this is a different statistic, not a rounding step.', ...noApproval },
  { id: 'grow:unchanged', section: 'grow', what: 'Household with no debts and no saving; goal plus a 200.00 saving series: income, spending, saving, set-aside, left', old: 'unchanged', next: 'unchanged', source: '05.5-26 Grow on v3', reason: 'Listed so the owner sees the cases that did not move: income, spending and left are identical to the old path on these fixtures.', ...noApproval },
];

/** 05.5-10-SUMMARY "Changed answers for the D-07 page": the bill-detector windows now follow Activity's (owner accepted 2026-11-14). */
const DETECTOR_ROWS: readonly Row[] = [
  { id: 'detector:weekly', section: 'detector', what: 'Weekly bills and pay: the gap between payments that is offered as a weekly series', old: '5 to 9 days', next: '6 to 8 days', source: '05.5-10 one detector', reason: 'Decide and Activity now share one detector and Activity\'s windows win; gaps of exactly 5 or 9 days are no longer offered as weekly.', ...noApproval },
  { id: 'detector:fortnightly', section: 'detector', what: 'Fortnightly bills and pay: the gap offered as fortnightly', old: '11 to 17 days', next: '12 to 16 days', source: '05.5-10 one detector', reason: 'Activity\'s windows win; gaps of 11 or 17 days are no longer offered. This includes a pay on the 3rd and 17th seen in only two months.', ...noApproval },
  { id: 'detector:monthly', section: 'detector', what: 'Monthly bills and pay: the gap offered as monthly', old: '28 to 33 days', next: '27 to 33 days', source: '05.5-10 one detector', reason: 'Activity\'s window starts a day earlier, so a 27-day gap is now offered as monthly (also in two-date clusters).', ...noApproval },
  { id: 'detector:quarterly', section: 'detector', what: 'Quarterly bills: the gap offered as quarterly', old: '85 to 95 days', next: '85 to 97 days', source: '05.5-10 one detector', reason: 'Activity\'s window runs two days longer, so gaps of 96 or 97 days are now offered.', ...noApproval },
  { id: 'detector:yearly', section: 'detector', what: 'Yearly bills: the gap offered as yearly', old: '360 to 370 days', next: '360 to 370 days', source: '05.5-10 one detector', reason: 'No change; listed so the owner sees every cadence. Minimum repeats and the 10 percent amount tolerance were already identical.', ...noApproval },
];

function liveRows(): Row[] {
  return [...liveAnswerRows(), ...liveInputRows(), ...GROW_ROWS, ...DETECTOR_ROWS];
}

function read(): Stored {
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Stored;
}

function pageHtml(rows: readonly Row[], shadow: string): string {
  const sections: [Section, string, string][] = [
    ['answer', 'Decide answers that moved', 'The same check judged on the same situation by the old path and the new path. Only answers that differ are listed.'],
    ['input', 'What the builder hands the engine', 'Named differences between the two builders (05.5-12). They are the causes behind the moved answers.'],
    ['grow', 'Grow figures for D-07', 'The Debts screen and the Lines breakdown now read the new month model (05.5-26). You chose standing saving and investing plans only.'],
    ['detector', 'Bill and pay detector windows', 'One detector now serves Decide and Activity (05.5-10). You accepted these windows on 2026-11-14.'],
  ];
  const body = sections
    .map(([s, title, intro]) => {
      const list = rows.filter((r) => r.section === s);
      const items = list.length === 0
        ? '<p>None. The two paths agree on every fixture situation.</p>'
        : `<table><tr><th>Row</th><th>What</th><th>Was</th><th>Now</th><th>Why</th><th>You</th></tr>${list
            .map((r) => `<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.what)}</td><td>${esc(r.old)}</td><td>${esc(r.next)}</td><td>${esc(r.reason)}${r.rounding ? ' <b>(rounding)</b>' : ''}</td><td>${r.approved ? `approved ${esc(r.approvedAt ?? '')}` : 'waiting'}</td></tr>`)
            .join('')}</table>`;
      return `<h2>${esc(title)} (${list.length})</h2><p>${esc(intro)}</p>${items}`;
    })
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>05.5-16 changed answers</title><style>body{font:15px/1.5 system-ui;margin:24px;max-width:1100px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;vertical-align:top;text-align:left}th{background:#f3f3f3}code{font-size:12px}</style><h1>Changed answers: Decide on the new builder (05.5-16)</h1><p>Approve each row or send it back. Nothing ships with an unapproved row. Money figures are shown in dollars for readability; the code keeps whole minor units.</p>${body}<h2>Real-account comparison</h2><p>${esc(shadow)}</p>`;
}

describe('05.5-16 changed answers', () => {
  const shadow = process.env.SHADOW_SOURCE;
  const shadowLine =
    shadow === undefined || shadow === ''
      ? 'Not run: no owner-local SHADOW_SOURCE file was available, so this page shows the fixture situations only. Running it adds the moved answers of a real account.'
      : 'Run through the shadow harness; see the shadow test output.';

  if (WRITE) {
    it('writes changedAnswers.json and the page', () => {
      const prev = fs.existsSync(FILE) ? read().rows : [];
      const rows = liveRows().map((r) => {
        const before = prev.find((p) => p.id === r.id);
        return before === undefined ? r : { ...r, approved: before.approved, approvedAt: before.approvedAt };
      });
      fs.writeFileSync(FILE, JSON.stringify({ rows }, null, 2) + '\n');
      const out = path.join(process.cwd(), 'reports', 'reviewed');
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, '05.5-16-changed-answers.html'), pageHtml(rows, shadowLine));
      process.stdout.write(`changed answers: ${rows.length} rows written\n`);
    });
    return;
  }

  it('the file lists exactly the answers and input differences that move today', () => {
    const stored = read().rows;
    const live = liveRows();
    const key = (r: Row): string => JSON.stringify([r.id, r.old, r.next, r.reason]);
    expect(stored.map(key).sort()).toEqual(live.map(key).sort());
  });

  it('every row has a reason of 20 or more characters and a named source', () => {
    for (const r of read().rows) {
      expect(`${r.id}: ${r.reason.trim().length >= MIN_REASON}`).toBe(`${r.id}: true`);
      expect(r.source.trim()).not.toBe('');
      expect(r.source).not.toBe('unnamed');
    }
  });

  it('a rounding change is its own row with a reason that starts "rounding:"', () => {
    for (const r of read().rows.filter((x) => x.rounding)) expect(r.reason.startsWith('rounding:')).toBe(true);
  });

  it('every row is approved by the owner (switched on at the approval step)', () => {
    if (!REQUIRE_APPROVAL) return;
    expect(read().rows.filter((r) => !r.approved || r.approvedAt === null).map((r) => r.id)).toEqual([]);
  });
});
