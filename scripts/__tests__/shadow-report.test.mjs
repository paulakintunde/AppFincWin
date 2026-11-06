import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CODE_PRECEDENCE,
  UUID_RE,
  analyse,
  buildQueries,
  formatFigure,
  labelsFrom,
  loadContext,
  parseCodePrecedence,
  parseExponents,
  readRevision,
  renderHtml,
  run,
  splitReasons,
} from '../shadow-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OA = 'aaaaaaaa-1111-4111-8111-111111111111';
const OB = 'bbbbbbbb-2222-4222-8222-222222222222';
const T1 = 'cccccccc-3333-4333-8333-333333333333';
const T2 = 'dddddddd-4444-4444-8444-444444444444';
const OUT = 'eeeeeeee-5555-4555-8555-555555555555';
const testersText = JSON.stringify({
  accounts: [
    { id: OA, role: 'owner' },
    { id: T1, role: 'tester' },
    { id: OB, role: 'owner' },
    { id: T2, role: 'tester' },
  ],
});
const SAMPLES = ['s60', 'p500', 'l2000', 'c9000_cash', 'c9000_plan', 'f1200_plan'];
const context = { ...loadContext(ROOT), testersText };
const REV = '05.4.1';
const row = (user, sample, code, variant = null, figures = {}, rev = REV, extra = {}) => ({
  user_id: user, engine_revision: rev, sample_id: sample, code, variant, reasons: ['m:price', 'r:pay_gap', 'f:debt_left_after_sale'],
  figures: { am: 50000, ab: 60000, ready: 1, cut: 0, ...figures }, created_at: '2026-11-06T00:00:00Z', currency: 'GBP', ...extra,
});
const allFit = (user, rev = REV) => SAMPLES.map((s) => row(user, s, 'fits_month', null, {}, rev));
const env = { SUPABASE_READONLY_TOKEN: 'sbp_secrettoken', SUPABASE_PROD_PROJECT_REF: 'ref123' };
const fetchOf = (rows, on, status = 200) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const body = calls.length === 1 ? rows : on;
    return { ok: status === 200, status, json: async () => body };
  };
  f.calls = calls;
  return f;
};
const go = (rows, opts = {}) =>
  analyse({ rows, shadowOnIds: opts.on ?? [OA, OB], labels: labelsFrom(testersText), chipLabels: context.chipLabels, revision: REV, previous: opts.previous ?? null });

test('CODE_PRECEDENCE copy equals the engine constant', () => {
  const engine = parseCodePrecedence(readFileSync(join(ROOT, 'src/engine/decide/v3/constants.ts'), 'utf8'));
  assert.deepEqual(CODE_PRECEDENCE, engine);
  assert.equal(parseCodePrecedence('nothing here'), null);
});

test('revision is read from revision.ts; exponents from currencyExponents.ts', () => {
  assert.match(readRevision(ROOT), /^[a-z0-9._-]{1,40}$/);
  const ex = parseExponents(readFileSync(join(ROOT, 'src/engine/money/currencyExponents.ts'), 'utf8'));
  assert.equal(ex.JPY, 0);
  assert.equal(ex.KWD, 3);
  assert.equal(ex.GBP, undefined);
});

test('labels: testers numbered among role tester, owners lettered among role owner', () => {
  const l = labelsFrom(testersText);
  assert.equal(l.get(OA), 'Owner A');
  assert.equal(l.get(OB), 'Owner B');
  assert.equal(l.get(T1), 'Tester 1');
  assert.equal(l.get(T2), 'Tester 2');
  assert.equal(l.get(OA.toUpperCase().toLowerCase()), 'Owner A');
});

test('queries are read-only selects and refuse a bad revision', () => {
  const q = buildQueries([REV, '05.4.0']);
  assert.match(q.rows, /^select /);
  assert.match(q.rows, /in \('05.4.1', '05.4.0'\)/);
  assert.match(q.shadowOn, /^select id from public.profiles where decide_shadow$/);
  assert.throws(() => buildQueries(["x'; drop table t; --"]));
});

test('reasons split on the m/d/r/f/c/n prefixes', () => {
  assert.deepEqual(splitReasons(['m:price', 'd:stale', 'r:a', 'f:b', 'c:c', 'n:d', 'zz']), {
    missing: ['price'], readiness: ['stale'], reasons: ['a'], facts: ['b'], caveats: ['c'], notices: ['d'], other: ['zz'],
  });
  assert.deepEqual(splitReasons(undefined), {});
});

test('per-sample counts use the app chip text; code plus variant count separately', () => {
  const rows = [...allFit(OA), ...SAMPLES.map((s) => row(OB, s, 'fits_unspent', s === 's60' ? 'no_net' : null))];
  const a = go(rows);
  const s60 = a.perSample.find((p) => p.sample === 's60').counts;
  assert.deepEqual(s60, [['Fits this month', 1], ['Fits, but no safety net', 1]].sort((x, y) => x[0].localeCompare(y[0])));
  const p500 = a.perSample.find((p) => p.sample === 'p500').counts;
  assert.equal(p500.length, 2);
  assert.deepEqual(a.sent, ['Owner A', 'Owner B']);
  assert.equal(a.switchedOn, 2);
  assert.deepEqual(a.waiting, []);
  assert.equal(a.surprises.length, 0);
});

test('one-off and plan samples read tight differently', () => {
  const rows = [row(OA, 'p500', 'fits_month', 'tight'), row(OA, 'c9000_plan', 'fits_month', 'tight')];
  const a = go(rows);
  assert.equal(a.perSample.find((p) => p.sample === 'p500').counts[0][0], 'Fits, but tight');
  assert.equal(a.perSample.find((p) => p.sample === 'c9000_plan').counts[0][0], 'Fits, but tight each month');
});

test('surprise 1: a fit with no caution below 0 this month (D-115)', () => {
  const plain = go([row(OA, 's60', 'fits_month', null, { am: -100, ab: -50 })]);
  assert.deepEqual(plain.surprises.map((s) => s.rule), [1]);
  const overdraftFromAbove = go([row(OA, 's60', 'fits_uses_overdraft', null, { am: -100, ab: 500 })]);
  assert.deepEqual(overdraftFromAbove.surprises.map((s) => s.rule), [1]);
  const alreadyBelow = go([row(OA, 's60', 'fits_uses_overdraft', null, { am: -100, ab: -10 })]);
  assert.equal(alreadyBelow.surprises.length, 0);
  const withCaution = go([row(OA, 's60', 'fits_month', 'tight', { am: -100, ab: 500 })]);
  assert.equal(withCaution.surprises.length, 0);
  const notAFit = go([row(OA, 's60', 'not_yet', null, { am: -100, ab: 500 })]);
  assert.equal(notAFit.surprises.length, 0);
});

test('surprise 2: an answer changed since --previous', () => {
  const rows = [row(OA, 's60', 'fits_month'), row(OA, 's60', 'not_yet', 'payday', {}, '05.4.0'), row(OA, 'p500', 'fits_month'), row(OA, 'p500', 'fits_month', null, {}, '05.4.0')];
  const a = go(rows, { previous: '05.4.0' });
  assert.deepEqual(a.surprises.map((s) => [s.rule, s.sample]), [[2, 's60']]);
  assert.match(a.surprises[0].text, /was not_yet \(payday\)/);
  assert.equal(go(rows).surprises.length, 0, 'no previous revision, no rule 2');
});

test('surprise 3: a cheaper cash sample gets a stricter answer; plan samples are not compared', () => {
  const rows = [row(OA, 's60', 'not_yet'), row(OA, 'p500', 'fits_month'), row(OA, 'c9000_plan', 'needs_input'), row(OA, 'f1200_plan', 'fits_month')];
  const a = go(rows);
  assert.deepEqual(a.surprises.map((s) => [s.rule, s.sample]), [[3, 's60']]);
  const same = go([row(OA, 's60', 'fits_month', 'tight'), row(OA, 'p500', 'fits_month')]);
  assert.equal(same.surprises.length, 0, 'same code is not stricter');
});

test('surprise 4: needs_input on all 6 samples', () => {
  const a = go(SAMPLES.map((s) => row(OA, s, 'needs_input')));
  assert.deepEqual(a.surprises.map((s) => s.rule), [4]);
  assert.equal(a.surprises[0].sample, 'all');
});

test('surprise 5: an answer with no app label', () => {
  const a = go([row(OA, 's60', 'brand_new_code')]);
  assert.deepEqual(a.surprises.map((s) => s.rule), [5]);
  assert.equal(a.perSample[0].counts[0][0], 'brand_new_code');
  const v = go([row(OA, 's60', 'brand_new_code', 'odd')]);
  assert.equal(v.perSample[0].counts[0][0], 'brand_new_code (odd)');
});

test('waiting, not up to date, cut and not-on-list are counted', () => {
  const rows = [
    ...SAMPLES.map((s) => row(OA, s, 'fits_month', null, s === 's60' ? { ready: 0, cut: 3 } : {})),
    row(OB, 's60', 'fits_month'),
    row(OUT, 's60', 'fits_month'),
    row(OA, 's60', 'fits_month', null, {}, '04.9.9'),
  ];
  const a = go(rows, { on: [OA, OB, T1, OUT] });
  assert.deepEqual(a.sent, ['Owner A']);
  assert.deepEqual(a.waiting, ['Owner B', 'Tester 1']);
  assert.equal(a.switchedOn, 3);
  assert.equal(a.notReady, 1);
  assert.deepEqual(a.cutNoted, [{ label: 'Owner A', sample: 's60', cut: 3 }]);
  assert.equal(a.notOnList, 1);
});

test('figures: money keys in whole units with the currency, others raw, minor units when no currency', () => {
  const ex = { JPY: 0, KWD: 3 };
  assert.equal(formatFigure('am', 123000, 'GBP', ex), 'GBP 1,230');
  assert.equal(formatFigure('s.cash', 1200, 'JPY', ex), 'JPY 1,200');
  assert.equal(formatFigure('ab', 1500, 'KWD', ex), 'KWD 1.5');
  assert.equal(formatFigure('am', 1200, null, ex), '1,200 minor units');
  assert.equal(formatFigure('rbm', 3, 'GBP', ex), '3');
  assert.equal(formatFigure('am', 'x', 'GBP', ex), '');
});

test('the page never contains an id, a name or the token, and escapes text', () => {
  const rows = [...SAMPLES.map((s) => row(OA, s, 'needs_input', null, { am: -5 })), row(T1, 's60', 'fits_month', null, { am: -100, ab: 50 }, REV, { reasons: ['r:<b>x</b>'] })];
  const a = go(rows, { on: [OA, T1] });
  const html = renderHtml(a, context.exponents);
  assert.ok(!UUID_RE.test(html));
  for (const id of [OA, T1]) assert.ok(!html.includes(id.slice(0, 8)));
  assert.ok(!html.includes('sbp_secrettoken'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(html.includes('Owner A') && html.includes('Tester 1'));
  assert.ok(html.includes('Surprises (2)'));
  assert.ok(html.includes('GBP'));
  assert.ok(html.includes('Code lists cut') === false);
});

test('renderHtml refuses to write a page that would carry an id', () => {
  const a = go([row(OA, 's60', 'fits_month', OA)]);
  assert.throws(() => renderHtml(a, context.exponents), /account id/);
});

test('run: read_only on both queries, fails closed without a token, exits non-ok on Not on list, hides the token', async () => {
  const f = fetchOf(allFit(OA), [{ id: OA }]);
  const r = await run({ fetch: f, env, context, revision: REV });
  assert.equal(r.ok, true);
  assert.equal(f.calls.length, 2);
  for (const c of f.calls) assert.equal(c.read_only, true);
  assert.match(r.lines[0], /1 of 1 sent/);
  assert.ok(!r.lines.join('\n').includes('sbp_secrettoken'));

  const viaAccess = await run({ fetch: fetchOf([], []), env: { SUPABASE_ACCESS_TOKEN: 't', SUPABASE_PROD_PROJECT_REF: 'r' }, context, revision: REV });
  assert.equal(viaAccess.ok, true);

  const closed = await run({ fetch: fetchOf([], []), env: {}, context, revision: REV });
  assert.equal(closed.ok, false);
  assert.match(closed.lines[0], /fail closed/);

  const out = await run({ fetch: fetchOf([row(OUT, 's60', 'fits_month')], []), env, context, revision: REV });
  assert.equal(out.ok, false);
  assert.match(out.lines.join('\n'), /Not on list: 1/);

  const prev = fetchOf([], []);
  await run({ fetch: prev, env, context, revision: REV, previous: '05.4.0' });
  assert.match(prev.calls[0].query, /'05.4.1', '05.4.0'/);

  const http = await run({ fetch: fetchOf([], [], 500), env, context, revision: REV });
  assert.equal(http.ok, false);
  assert.match(http.lines[0], /HTTP 500/);

  const shape = await run({ fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }), env, context, revision: REV });
  assert.equal(shape.ok, false);
  assert.match(shape.lines[0], /unexpected shape/);
});
