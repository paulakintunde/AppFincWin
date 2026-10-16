#!/usr/bin/env node
// D-22 golden fixtures for the Decide engine (plans 04-04 payoff parity, 04-11 decide parity).
//
// Purpose: record what the design prototype ACTUALLY computes. The prototype's
// Decide methods are sliced out of "FincWin United.dc.html" (from the `dhh(){`
// line up to, not including, the `dmethod(p,short){` line) and evaluated
// unmodified with node:vm inside a class. The maths is never re-typed here.
// The only overrides are the data accessors: `items` (current-month rows),
// `dseries()` (income per month) and `cvt()` (identity, single currency).
//
// Default mode: (re)writes both JSON fixtures.
// --check mode: regenerates in memory, exits 1 naming any file that differs.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { PAYOFF_CASES, DECIDE_SCENARIOS } from './scenarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const HTML_PATH = join(ROOT, 'FincWin United.dc.html');
const PAYOFF_PATH = join(ROOT, 'src/engine/payoff/__tests__/golden/prototype-payoff.json');
const DECIDE_PATH = join(ROOT, 'src/engine/decide/__tests__/golden/prototype-decide.json');

function loadProto() {
  const lines = readFileSync(HTML_PATH, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trimStart().startsWith('dhh(){'));
  if (start < 0) throw new Error('prototype markers not found');
  const end = lines.findIndex(
    (l, i) => i > start && l.trimStart().startsWith('dmethod(p,short){'),
  );
  if (end < 0) throw new Error('prototype markers not found');
  const block = lines.slice(start, end).join('\n');
  return vm.runInNewContext('(class Proto {\n' + block + '\n})', {
    Math,
    Infinity,
    Number,
    String,
    Array,
    Object,
    JSON,
  });
}

const Proto = loadProto();

class Harness extends Proto {
  constructor(state, items, series) {
    super();
    this.state = state;
    this._items = items;
    this._series = series;
  }
  get items() {
    return this._items;
  }
  dseries() {
    return this._series;
  }
  cvt(a) {
    return a;
  }
}

const num = (x) => (x === Infinity ? 'Infinity' : x);

function toPrototypeState(scn) {
  const series = scn.months.map((m, i) => ({ n: 'M' + i, v: m.income / 100 }));
  const items = [
    { dir: 'out', cat: 'Food', amount: scn.months[scn.months.length - 1].spending / 100, cur: 'USD' },
  ];
  const chk = scn.check;
  const loans = scn.debts.map((d) => ({
    n: d.secured ? 'Mortgage' : 'Store loan',
    bal: d.balance / 100,
    min: d.minimumPayment / 100,
    rate: +d.rate,
    revolving: d.revolving,
    ccy: 'USD',
  }));
  if (chk.kind === 'buy' && chk.payment.method === 'card') {
    // Name avoids the prototype's dsecured() regex (it matches "car" inside "Card").
    loans.push({ n: 'Revolver', bal: 0, min: 0, rate: +chk.payment.apr, revolving: true, ccy: 'USD' });
  }
  const S = {
    loans,
    sav: [{ mo: scn.saving / 100, ccy: 'USD' }],
    inv: [{ auto: { on: true, amt: scn.investing / 100 }, val: 0, ccy: 'USD' }],
    banks: [{ bal: scn.cash / 100, ccy: 'USD' }],
    dlim: {
      reserve: scn.limits.reserve / 100,
      dsr: +scn.limits.dsr / 100,
      minInv: scn.limits.investingFloor / 100,
      minSave: 0,
    },
    dRet: +scn.return,
    dBasis: null,
    dKind: chk.kind,
    dDep: 0,
    dTerm: 48,
    dApr: 0,
    dInsMo: 0,
    dInsN: 0,
    dCardMonths: 12,
    dCardPlan: 'full',
    dAdj: [],
    dOwn: [],
    dRepl: [],
    dName: 'Sofa',
    archive: [],
  };
  if (scn.scope.kind === 'household') {
    const sc = scn.scope;
    S.dScope = 'hh';
    S.hhId = 'h1';
    S.hhs = [
      {
        id: 'h1',
        split: sc.rule,
        members: Array.from({ length: sc.memberCount }, (_, i) => ({
          me: i === sc.myIndex,
          w: sc.rule === 'weight' ? sc.weights[i] : 1,
        })),
      },
    ];
  } else {
    S.dScope = 'me';
  }
  if (chk.kind === 'buy') {
    const pay = chk.payment;
    if (chk.dayFees > 0) S.dAdj = [{ on: true, day: true, v: chk.dayFees / 100 }];
    S.dAdv = (chk.price - chk.dayFees) / 100;
    if (chk.runningCostsNet !== 0) S.dOwn = [{ on: true, v: chk.runningCostsNet / 100 }];
    S.dName = chk.itemType === 'vehicle' ? 'Car' : 'Sofa';
    if (pay.method === 'cash') S.dPay = 'cash';
    else if (pay.method === 'loan') {
      S.dPay = 'loan';
      S.dDep = pay.deposit / 100;
      S.dTerm = pay.termMonths;
      S.dApr = +pay.apr;
    } else if (pay.method === 'instalment') {
      S.dPay = 'instal';
      S.dInsMo = pay.instalmentAmount / 100;
      S.dInsN = pay.instalmentCount;
    } else {
      S.dPay = 'card';
      S.dCardPlan = { full: 'full', months: 'months', minimum: 'min' }[pay.payoff];
      if (pay.months) S.dCardMonths = pay.months;
    }
  } else {
    S.dAdv = chk.amount / 100;
    S.dPay = chk.payment.method;
    S.dTerm = chk.payment.method === 'monthly' ? chk.payment.termMonths : 48;
  }
  return { S, items, series };
}

function runScenario(scn) {
  const { S, items, series } = toPrototypeState(scn);
  const h = new Harness(S, items, series);
  const M = h.dmoney();
  const p = h.dplan();
  const a = h.dassess(p);
  let bisect = null;
  if (S.dKind === 'buy' && a.state !== 'fits') {
    // verbatim from FincWin United.dc.html ≈ line 4596
    let lo = 0, hi = p.price, best = null;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (h.dfits(mid)) { best = mid; lo = mid; } else hi = mid; }
    bisect = { best };
  }
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, num(o[k])]));
  return {
    ...scn,
    prototype: {
      money: pick(M, ['avg', 'worst', 'best', 'cv', 'steady', 'basis', 'inBasis', 'exp', 'debtPay', 'debtUnsec', 'left']),
      plan: pick(p, ['day', 'mo', 'n', 'fin', 'tot', 'interest', 'miss']),
      assess: {
        ...pick(a, ['state', 'left', 'cashAfter', 'dsr', 'unsecAfter', 'investAtRisk', 'investAfter', 'mineCash', 'minePay', 'newMo']),
        w: a.w.map((x) => ({ k: x.k, short: x.short })),
      },
      bisect,
    },
  };
}

function buildPayoff() {
  const h = new Harness({}, [], []);
  const out = { dpmt: [], dfv: [], dSimMin: [] };
  for (const c of PAYOFF_CASES.dpmt) {
    const raw = h.dpmt(...c.args);
    out.dpmt.push({ name: c.name, args: c.args, raw, paymentMinor: Math.round(raw * 100) });
  }
  for (const c of PAYOFF_CASES.dfv) {
    const raw = h.dfv(...c.args);
    out.dfv.push({ name: c.name, args: c.args, raw, valueMinor: Math.round(raw * 100) });
  }
  for (const c of PAYOFF_CASES.dSimMin) {
    const r = h.dSimMin(...c.args);
    out.dSimMin.push({
      name: c.name,
      args: c.args,
      raw: { mo: r.mo, int: num(r.int), first: r.first, never: r.never },
      firstMinor: Math.round(r.first * 100),
      interestMinor: r.never ? 'Infinity' : Math.round(r.int * 100),
      months: r.mo,
      never: r.never,
    });
  }
  return out;
}

const files = [
  [PAYOFF_PATH, buildPayoff()],
  [
    DECIDE_PATH,
    {
      source: 'FincWin United.dc.html (dhh..dfits, evaluated via node:vm)',
      scenarios: DECIDE_SCENARIOS.map(runScenario),
    },
  ],
].map(([p, o]) => [p, JSON.stringify(o, null, 2) + '\n']);

if (process.argv.includes('--check')) {
  let bad = false;
  for (const [p, text] of files) {
    if (!existsSync(p) || readFileSync(p, 'utf8') !== text) {
      console.error('golden fixture out of date: ' + p);
      bad = true;
    }
  }
  process.exit(bad ? 1 : 0);
} else {
  for (const [p, text] of files) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  console.log('wrote ' + files.length + ' golden fixtures');
}
