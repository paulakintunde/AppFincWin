// Calculator maths for the prototype. Integer cents everywhere; every interest step rounds half up to the cent.
// Rates are yearly, added monthly (yearly rate / 12 each month).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// month index 0 = Nov 2026
const monthName = (i, y0 = 2026, m0 = 10) => { const t = m0 + i; return `${MON[t % 12]} ${y0 + Math.floor(t / 12)}`; };
// round half up for a non-negative value in cents (floating input -> integer cents)
const rhu = (x) => Math.floor(x + 0.5 + 1e-9);
// interest in cents on balance (cents) at yearly rate in basis points (e.g. 690 = 6.9%)
const interest = (bal, bp) => rhu((bal * bp) / 120000);
const money = (c, opt = {}) => { const neg = c < 0; c = Math.abs(c); const d = Math.floor(c / 100), ct = c % 100; const s = d.toLocaleString('en-US') + (opt.whole && ct === 0 ? '' : opt.whole === 'always' ? '' : '.' + String(ct).padStart(2, '0')); return (neg ? '−' : '') + '$' + s; };
const dollars = (c) => '$' + Math.round(c / 100).toLocaleString('en-US'); // display whole dollars (round half up)

// Pay down one debt. bal cents, bp yearly rate, pay cents a month (+ extra), once = lump sum at month 0 before interest.
function payoff(bal, bp, pay, extra = 0, once = 0) {
  let b = bal - once, months = 0, totalInt = 0, last = 0;
  while (b > 0 && months < 1200) { const i = interest(b, bp); totalInt += i; b += i; const p = Math.min(pay + extra, b); b -= p; last = p; months++; }
  return { months, totalInt, last, lastMonth: monthName(months - 1) };
}
// Fixed-payment loan (standard amortisation). principal cents, bp, n months.
function loan(principal, bp, n) {
  const r = bp / 120000; const pay = rhu((principal * r) / (1 - Math.pow(1 + r, -n)));
  let b = principal, totalInt = 0, last = 0;
  for (let k = 0; k < n; k++) { const i = interest(b, bp); totalInt += i; b += i; const p = k === n - 1 ? b : Math.min(pay, b); b -= p; last = p; }
  return { pay, totalInt, last, total: principal + totalInt };
}
// Growth: start cents, add each month (end of month), bp, months. Returns value per year end too.
function grow(start, add, bp, months) {
  let b = start, put = start; const years = [];
  for (let k = 1; k <= months; k++) { b += interest(b, bp) + add; put += add; if (k % 12 === 0) years.push({ value: b, put }); }
  return { value: b, put, growth: b - put, years };
}
// Save toward a target with deposits each month (end of month) and optional interest.
function saveTo(have, target, add, bp = 0) {
  let b = have, k = 0, int = 0;
  while (b < target && k < 1200) { const i = interest(b, bp); int += i; b += i + add; k++; }
  return { months: k, value: b, interest: int, put: have + add * k };
}
// Monthly amount needed to cover `left` cents in n deposits, no interest. Rounded UP to the cent so the goal is reached.
const needEach = (left, n) => Math.ceil(left / n);
// Several debts, one monthly budget (sum of minimums + extra). order: 'rate' (highest rate first) or 'balance' (smallest balance first).
function strategy(debts, extra, order) {
  const ds = debts.map((d) => ({ ...d, b: d.bal, int: 0, done: null }));
  const budget = ds.reduce((s, d) => s + d.min, 0) + extra;
  let m = 0;
  while (ds.some((d) => d.b > 0) && m < 1200) {
    for (const d of ds) if (d.b > 0) { const i = interest(d.b, d.bp); d.int += i; d.b += i; }
    let left = budget;
    for (const d of ds) if (d.b > 0) { const p = Math.min(d.min, d.b); d.b -= p; left -= p; }
    const live = ds.filter((d) => d.b > 0).sort((a, b) => (order === 'rate' ? b.bp - a.bp : a.bal - b.bal));
    for (const d of live) { if (left <= 0) break; const p = Math.min(left, d.b); d.b -= p; left -= p; }
    m++;
    for (const d of ds) if (d.b === 0 && d.done === null) d.done = m;
  }
  return { months: m, totalInt: ds.reduce((s, d) => s + d.int, 0), budget, debts: ds.map((d) => ({ name: d.name, done: d.done, int: d.int })) };
}
module.exports = { MON, monthName, rhu, interest, money, dollars, payoff, loan, grow, saveTo, needEach, strategy };

if (require.main === module) {
  const c = module.exports;
  const out = {};
  const base = c.payoff(842000, 690, 31200);
  out.loanMin = base;
  for (const x of [2500, 5000, 10000]) out['extra' + x] = c.payoff(842000, 690, 31200, x);
  out.once1000 = c.payoff(842000, 690, 31200, 0, 100000);
  out.growth = [200, 400, 600].map((bp) => ({ bp, own: c.grow(0, 20000, bp, 120), withNow: c.grow(769000, 20000, bp, 120) }));
  out.loanCalc = c.loan(2000000, 750, 60);
  out.save = c.saveTo(50000, 500000, 25000, 300);
  out.save0 = c.saveTo(50000, 500000, 25000, 0);
  const debts = [{ name: 'Credit card', bal: 420000, bp: 2190, min: 12000 }, { name: 'Personal loan', bal: 150000, bp: 950, min: 7500 }];
  out.rate = c.strategy(debts, 10000, 'rate'); out.balance = c.strategy(debts, 10000, 'balance');
  out.minOnly = c.strategy(debts, 0, 'rate');
  console.log(JSON.stringify(out, null, 1));
}
