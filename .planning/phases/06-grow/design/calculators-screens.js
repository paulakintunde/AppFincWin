// Grow calculators (Phase 6 D-13, D-17..D-20): goal calculator, debt extra payments, growth illustration,
// "Make this the plan" confirms, and a Calculators page (loan, savings, compound growth, debt payoff) that works with typed numbers.
// Every number is computed here with ../calc.js (integer cents, interest rounded half up each month).
// Also patches entry points and a few numbers on Grow screens from 30-areas.js (G01, G03, G03d, G03f, G07, G08, G10).
const C = require('../calc.js');
module.exports = (K, X) => {
  const { T, FAM, SP, SHADOW, DISPLAY, icon, tile, accTile, card, row, badge, sectionHeader, A } = K;
  const out = [];
  const da = (a) => (a ? ` data-act="${a}"` : '');
  const m = C.money, d$ = C.dollars;
  const GG = 'Grow · Calculators';
  const gs = (id, title, html, extra = {}) => out.push({ id, title, tab: 'Grow', group: GG, html, ...extra });
  const gsheet = (id, title, html, extra = {}) => out.push({ id, title, tab: 'Grow', group: GG, kind: 'sheet', html, ...extra });

  // ---- local parts (same look as 30-areas.js) ----
  const P = (t, a) => `<button type="button"${da(a)} style="width:100%; min-height:52px; padding:12px 20px; border-radius:999px; border:none; background:${T.accent}; color:#FFFFFF; font-family:inherit; font-size:16px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer">${t}</button>`;
  const O = (t, a) => `<button type="button"${da(a)} style="width:100%; min-height:52px; padding:12px 20px; border-radius:999px; border:1.5px solid ${T.ink}; background:#FFFFFF; color:${T.ink}; font-family:inherit; font-size:16px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer">${t}</button>`;
  const TB = (t, a) => `<button type="button"${da(a)} style="min-height:44px; padding:0 4px; border:none; background:none; color:${T.ink}; font-family:inherit; font-size:15px; font-weight:700; text-decoration:underline; text-underline-offset:3px; cursor:pointer">${t}</button>`;
  const stack = (...b) => `<div style="display:flex; flex-direction:column; gap:10px">${b.join('')}</div>`;
  const R = (o, a) => A(row(o), a);
  const caps = (t) => `<div style="font-size:11.5px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:${T.muted}">${t}</div>`;
  const pad = (h, top = 16) => `<div style="padding:${top}px ${SP.edge}px 0 ${SP.edge}px">${h}</div>`;
  const inCard = (h) => card(`<div style="padding:16px">${h}</div>`);
  const lab = (t) => `<div style="font-size:13px; font-weight:600; color:${T.muted}">${t}</div>`;
  const fig = (t, size = 34) => `<div style="${DISPLAY}; font-size:${size}px; line-height:1.05; margin-top:6px; font-variant-numeric:tabular-nums">${t}</div>`;
  const why = (h) => `<div style="margin:16px ${SP.card}px 0 ${SP.card}px; padding:14px 16px; border-radius:18px; background:${T.soft}"><div style="display:flex; align-items:center; gap:8px">${icon('view', T.muted, 16)}<span style="font-size:14px; font-weight:800; color:${T.ink}">How it was worked out</span></div><div style="margin-top:6px; font-size:14px; line-height:1.5; color:#5A564B">${h}</div></div>`;
  const tint = (fam, h, ic) => `<div style="display:flex; gap:12px; align-items:flex-start; padding:14px 16px; border-radius:18px; background:${FAM[fam].tint}; color:${FAM[fam].text}">${ic ? icon(ic, FAM[fam].strong, 20) : ''}<div style="flex:1; min-width:0; font-size:14px; line-height:1.5">${h}</div></div>`;
  const softBadge = (word, ic) => `<span style="display:inline-flex; align-items:center; gap:4px; min-height:24px; padding:2px 8px 2px ${ic ? 5 : 8}px; border-radius:999px; background:${T.soft}; color:#5A564B; font-size:12px; font-weight:700; white-space:nowrap">${ic ? icon(ic, T.muted, 16) : ''}${word}</span>`;
  const sheetHead = (t, sub) => `<div style="display:flex; align-items:flex-start; gap:10px; padding:6px 16px 0 ${SP.edge}px"><h2 style="flex:1; min-width:0; margin:10px 0 0 0; font-size:21px; font-weight:800; letter-spacing:-.02em; line-height:1.25">${t}</h2><button type="button" aria-label="Close" style="width:44px; height:44px; flex:none; border-radius:999px; border:none; background:${T.soft}; display:flex; align-items:center; justify-content:center; cursor:pointer">${icon('close', T.ink, 20)}</button></div>${sub ? `<p style="margin:6px ${SP.edge}px 0 ${SP.edge}px; font-size:15px; line-height:1.5; color:${T.muted}">${sub}</p>` : ''}`;
  const foot = (h) => `<div style="padding:22px ${SP.edge}px 0 ${SP.edge}px">${h}</div>`;
  const footer = (t) => `<p style="margin:22px ${SP.edge}px 0 ${SP.edge}px; font-size:12.5px; line-height:1.45; color:${T.muted}">${t}</p>`;
  const input = (l, val, o = {}) => `<label style="display:block; min-width:0; margin-top:${o.mt ?? 16}px"><span style="display:block; font-size:13px; font-weight:700; color:${T.ink}; margin-bottom:6px">${l}</span><span style="display:flex; align-items:center; gap:8px; min-height:52px; padding:0 16px; border-radius:16px; background:${T.soft}">${o.pre ? `<span style="font-size:17px; font-weight:700; color:${T.muted}">${o.pre}</span>` : ''}<input type="text" inputmode="decimal" value="${val}" aria-label="${l}" style="flex:1; min-width:0; border:none; background:transparent; font-family:inherit; font-size:17px; font-weight:700; color:${T.ink}; outline:none; font-variant-numeric:tabular-nums">${o.suf ? `<span style="font-size:15px; font-weight:700; color:${T.muted}; white-space:nowrap">${o.suf}</span>` : ''}</span>${o.help ? `<span style="display:block; margin-top:6px; font-size:12.5px; line-height:1.4; color:${T.muted}">${o.help}</span>` : ''}</label>`;
  const grid2 = (a, b) => `<div style="display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px">${a}${b}</div>`;
  const kv = (k, v, first) => `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:52px; padding:8px 16px; ${first ? '' : `border-top:1px solid ${T.rule};`}"><span style="font-size:15px; color:${T.muted}">${k}</span><span style="font-size:15px; font-weight:700; text-align:right; font-variant-numeric:tabular-nums">${v}</span></div>`;
  const chg = (k, a, b, first) => `<div style="display:flex; align-items:center; gap:8px; min-height:52px; padding:8px 16px; ${first ? '' : `border-top:1px solid ${T.rule};`}"><span style="flex:1; min-width:0; font-size:14.5px">${k}</span><span style="font-size:14.5px; color:${T.muted}; font-variant-numeric:tabular-nums">${a}</span><span aria-hidden="true" style="color:${T.muted}">→</span><span class="sr" style="position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)">changes to</span><span style="font-size:14.5px; font-weight:800; font-variant-numeric:tabular-nums">${b}</span></div>`;
  // chips that swap to another computed variant (radio look, but each one replaces the screen)
  const chipStyle = (on) => `flex:none; min-height:44px; padding:0 16px; border-radius:999px; border:none; ${on ? `background:${T.accentTint}; color:${T.accent}; box-shadow:inset 0 0 0 1.5px ${T.accent};` : `background:#FFFFFF; color:${T.ink}; box-shadow:inset 0 0 0 1px ${T.rule2};`} font-family:inherit; font-size:14px; font-weight:700; cursor:pointer; white-space:nowrap`;
  const swapChips = (name, list) => `<div role="radiogroup" aria-label="${name}" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px">${list.map(([t, on, a]) => `<button type="button" role="radio" aria-checked="${on}"${on ? '' : da(a)} style="${chipStyle(on)}">${t}</button>`).join('')}</div>`;
  const titleBlock = (k, t, sub) => `<div style="display:flex; align-items:center; gap:8px; padding:0 16px 0 6px; min-height:52px"><button type="button" aria-label="Back" style="width:44px; height:44px; flex:none; display:flex; align-items:center; justify-content:center; background:none; border:none; border-radius:999px; cursor:pointer; transform:scaleX(-1)">${icon('chev', T.ink, 22)}</button><div style="flex:1; min-width:0">${caps(k)}</div></div>${pad(`<h1 style="margin:0; ${DISPLAY}; font-size:28px; line-height:1.1">${t}</h1>${sub ? `<p style="margin:8px 0 0 0; font-size:15px; line-height:1.45; color:${T.muted}">${sub}</p>` : ''}`, 0)}`;
  const nowPlan = (t) => `<div style="margin:16px ${SP.card}px 0 ${SP.card}px">${tint('fits', t, 'sCheck')}</div>`;
  const pct = (a, b) => Math.round((a / b) * 100); // whole percent, half up for positives

  // =====================================================================
  // 1. Goal calculator: Trip to Lisbon (D-17). $640 of $1,800, $50 a month on the 16th, first new deposit Nov 16 2026.
  // =====================================================================
  const G = { have: 64000, target: 180000, now: 5000 }; const left = G.target - G.have; // 116000
  const goalByAmount = (each) => { const n = Math.ceil(left / each); return { each, n, date: C.monthName(n - 1), put: each * n }; };
  const goalByDate = (n) => { const each = C.needEach(left, n); return { each, n, date: C.monthName(n - 1), put: each * n }; };
  const goalVars = [
    { id: 'GC02a', mode: 'amount', ...goalByAmount(2500) },
    { id: 'GC02', mode: 'amount', ...goalByAmount(5000) },
    { id: 'GC02b', mode: 'amount', ...goalByAmount(7500) },
    { id: 'GC02c', mode: 'amount', ...goalByAmount(10000) },
    { id: 'GC02d', mode: 'date', ...goalByDate(14) }, // Dec 2027
    { id: 'GC02e', mode: 'date', ...goalByDate(20) }, // Jun 2028
  ];
  const goalCur = goalVars.find((v) => v.id === 'GC02');
  const LEFT_MONTH = 42500, GOALS_NOW = 15000, SAVE_LINE = 15000;
  const amtIds = goalVars.filter((v) => v.mode === 'amount');
  const dateIds = goalVars.filter((v) => v.mode === 'date');
  for (const v of goalVars) {
    const cur = v.id === 'GC02';
    const goalsTotal = GOALS_NOW - G.now + v.each; const leftNew = LEFT_MONTH - (v.each - G.now);
    const lower = amtIds.filter((w) => w.each < v.each), higher = amtIds.filter((w) => w.each > v.each);
    const lessTo = lower.length ? lower[lower.length - 1].id : null;
    const moreTo = higher.length ? higher[0].id : null;
    const stepBtn = (ic, label, to) => to ? `<button type="button" aria-label="${label}"${da('replace:' + to)} style="width:44px; height:44px; flex:none; border-radius:50%; border:none; background:${T.soft}; display:flex; align-items:center; justify-content:center; cursor:pointer">${icon(ic, T.ink, 20)}</button>` : `<span aria-hidden="true" style="width:44px; height:44px; flex:none; border-radius:50%; background:${T.soft}; display:flex; align-items:center; justify-content:center; opacity:.4">${icon(ic, T.ink, 20)}</span>`;
    const pairCard = `<div style="display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; margin-top:4px">
<div style="padding:12px 14px; border-radius:16px; background:${v.mode === 'amount' ? T.accentTint : T.soft}; ${v.mode === 'amount' ? `box-shadow:inset 0 0 0 1.5px ${T.accent};` : ''}">${lab('Each month')}<div style="${DISPLAY}; font-size:24px; margin-top:4px; font-variant-numeric:tabular-nums">${m(v.each, { whole: true })}</div></div>
<div style="padding:12px 14px; border-radius:16px; background:${v.mode === 'date' ? T.accentTint : T.soft}; ${v.mode === 'date' ? `box-shadow:inset 0 0 0 1.5px ${T.accent};` : ''}">${lab('Reaches $1,800 by')}<div style="${DISPLAY}; font-size:24px; margin-top:4px">${v.date}</div></div></div>`;
    const html = titleBlock('Goal calculator', 'Trip to Lisbon', `$640 of $1,800 · ${m(left, { whole: true })} to go`)
      + inCard(`<div style="font-size:15px; font-weight:700">Save a set amount, or pick a date</div><p style="margin:4px 0 12px 0; font-size:13px; color:${T.muted}">Change one and the other follows.</p>${pairCard}
<div style="margin-top:16px; font-size:13px; font-weight:700">Each month</div>
<div role="group" aria-label="Each month, ${m(v.each)}" style="display:flex; align-items:center; gap:12px; margin-top:8px">${stepBtn('minus', 'Less', lessTo)}<span style="flex:1; text-align:center; ${DISPLAY}; font-size:22px">${m(v.each, { whole: true })}</span>${stepBtn('plus', 'More', moreTo)}</div>
<div style="margin-top:16px; font-size:13px; font-weight:700">Or reach it by</div>
${swapChips('Reach it by', [...dateIds.map((x) => [x.date, x.id === v.id, 'replace:' + x.id]), ['Oct 2028 (now)', cur, 'replace:GC02']])}`)
      + why(v.mode === 'amount'
        ? `${m(G.target, { whole: true })} − ${m(G.have, { whole: true })} saved = <b>${m(left, { whole: true })} to go</b>. At ${m(v.each, { whole: true })} a month that takes <b>${v.n} deposits</b> (${v.n - 1} would be ${m(v.each * (v.n - 1), { whole: true })}, not enough). The first goes in on Nov 16, so deposit ${v.n} lands in <b>${v.date}</b>. Interest is not counted.`
        : `From Nov 16 to ${v.date} there are <b>${v.n} deposits</b>. ${m(left, { whole: true })} ÷ ${v.n} = ${(left / v.n / 100).toFixed(3)}, rounded up to <b>${m(v.each)}</b> so the goal is reached. ${v.n} × ${m(v.each)} = ${m(v.put)}. Interest is not counted.`)
      + (cur ? '' : sectionHeader('What changes each month')
      + card(chg('Into goals', m(GOALS_NOW, { whole: true }), m(goalsTotal, { whole: true }), true) + chg('Left in a usual month', m(LEFT_MONTH, { whole: true }), m(leftNew, { whole: true }))))
      + (goalsTotal < SAVE_LINE ? `<div style="margin:12px ${SP.card}px 0 ${SP.card}px">${tint('tight', `Your line is saving at least ${m(SAVE_LINE, { whole: true })} a month. This puts ${m(goalsTotal, { whole: true })} into goals.`, 'sHalf')}</div>` : '')
      + (cur ? nowPlan('This is your plan now.') : foot(P('Make this the plan', 'sheet:' + v.id.replace('GC02', 'GC03'))))
      + footer('Worked out from the goal as you set it. Nothing changes until you choose “Make this the plan”.');
    gs(v.id, cur ? 'Goal calculator' : `Goal calculator, ${v.mode === 'amount' ? m(v.each, { whole: true }) + ' a month' : 'by ' + v.date}`, html);
    if (!cur) {
      const each = m(v.each, { whole: true });
      gsheet(v.id.replace('GC02', 'GC03'), `Make this the plan? (${each})`, sheetHead('Make this the plan?', 'Nothing changes until you confirm.')
        + card(chg('Each month', '$50', each, true) + chg('Reaches $1,800', 'Oct 2028', v.date) + chg('Into goals', m(GOALS_NOW, { whole: true }), m(goalsTotal, { whole: true })) + chg('Left in a usual month', m(LEFT_MONTH, { whole: true }), m(leftNew, { whole: true })))
        + `<p style="margin:12px ${SP.edge}px 0 ${SP.edge}px; font-size:13px; line-height:1.45; color:${T.muted}">Starts with the Nov 16 transfer. Decide’s next answers use the new amount.</p>`
        + foot(stack(P('Make this the plan', `closeall|back|toast:Plan saved. ${each} a month reaches $1,800 by ${v.date}.~Undo`), O('Not now', 'close'))));
    }
  }

  // =====================================================================
  // 2. Debt extra payments: Auto loan $8,420 at 6.9%, $312 on the 15th (D-18, D-13)
  // =====================================================================
  const L = { bal: 842000, bp: 690, pay: 31200 };
  const base = C.payoff(L.bal, L.bp, L.pay);
  const debtVars = [['GC04c', 0], ['GC04a', 2500], ['GC04', 5000], ['GC04b', 10000]].map(([id, x]) => ({ id, x, ...C.payoff(L.bal, L.bp, L.pay, x) }));
  for (const v of debtVars) {
    const cur = v.x === 0; const saved = base.totalInt - v.totalInt; const sooner = base.months - v.months;
    const payNew = L.pay + v.x; const share = pct(payNew, 320000);
    const sideCard = (t) => `<div style="min-width:0; padding:12px 14px; border-radius:18px; background:#FFFFFF; box-shadow:inset 0 0 0 1px ${T.rule2}"><div style="font-size:13px; font-weight:800; line-height:1.3">${t}</div><div style="font-size:12.5px; color:${T.muted}; margin-top:8px">Paid off</div><div style="font-size:16px; font-weight:800; margin-top:2px">${v.lastMonth}</div><div style="font-size:12.5px; color:${T.muted}; margin-top:8px">Interest</div><div style="font-size:16px; font-weight:800; margin-top:2px; font-variant-numeric:tabular-nums">${m(v.totalInt)}</div></div>`;
    const html = titleBlock('Auto loan', 'Extra payments', `${m(L.bal, { whole: true })} owed · 6.9% a year · $312 on the 15th`)
      + inCard(`<div style="font-size:13px; font-weight:700">Extra each month</div>${swapChips('Extra each month', debtVars.map((w) => [w.x ? '+' + m(w.x, { whole: true }) : 'None', w.id === v.id, 'replace:' + w.id]))}
<div style="margin-top:18px">${lab('Paid off')}${fig(v.lastMonth)}<p style="margin:6px 0 0 0; font-size:14px; line-height:1.45; color:${T.muted}">${cur ? `${v.months} payments on $312. This is the payment you have now.` : `${v.months} payments of ${m(payNew, { whole: true })}, ${sooner} months sooner than ${base.lastMonth}.`}</p></div>`)
      + card(kv('Each month', m(payNew, { whole: true }), true) + kv('Interest from now', m(v.totalInt)) + kv('Interest saved', cur ? '—' : m(saved)) + kv('Last payment', `${m(v.last)} in ${v.lastMonth}`))
      + sectionHeader('Payoff order') + `<div style="margin:${SP.row}px ${SP.card}px 0 ${SP.card}px">${grid2(sideCard('Highest rate first'), sideCard('Smallest balance first'))}<p style="margin:10px 4px 0 4px; font-size:13px; line-height:1.45; color:${T.muted}">With one debt, both orders give the same result. They differ when there is more than one debt.</p><div style="margin-top:2px">${TB('Try it with more debts', 'go:GC40')}</div></div>`
      + why(`6.9% a year is 0.575% a month. Each month, interest is worked out on what is still owed and rounded to the cent, then the ${m(payNew, { whole: true })} payment comes off. Nov 15 is the first payment, with ${m(C.interest(L.bal, L.bp))} of interest on ${m(L.bal, { whole: true })}. ${cur ? '' : `Paying ${m(v.x, { whole: true })} more lowers the balance faster, so less interest builds up: ${m(base.totalInt)} becomes ${m(v.totalInt)}.`} The last payment is smaller, just enough to reach $0.`)
      + (cur ? '' : sectionHeader('What changes each month') + card(chg('Auto loan payment', '$312', m(payNew, { whole: true }), true) + chg('Left in a usual month', m(LEFT_MONTH, { whole: true }), m(LEFT_MONTH - v.x, { whole: true })) + chg('Debt payments, share of pay', '10%', share + '%')) + `<p style="margin:10px ${SP.edge}px 0 ${SP.edge}px; font-size:13px; line-height:1.45; color:${T.muted}">Your line is debt payments at most 36% of pay.</p>`)
      + (cur ? nowPlan('This is your plan now.') : foot(P('Make this the plan', 'sheet:' + v.id.replace('GC04', 'GC06'))))
      + footer('Your own record of the loan. FincWin does not pay lenders; you make the payment as you do now.');
    gs(v.id, cur ? 'Extra payments, none' : `Extra payments, +${m(v.x, { whole: true })}`, html);
    if (!cur) {
      gsheet(v.id.replace('GC04', 'GC06'), `Make this the plan? (+${m(v.x, { whole: true })})`, sheetHead('Make this the plan?', 'Nothing changes until you confirm.')
        + card(chg('Each month', '$312', m(payNew, { whole: true }), true) + chg('Paid off', base.lastMonth, v.lastMonth) + chg('Interest from now', m(base.totalInt), m(v.totalInt)) + chg('Left in a usual month', m(LEFT_MONTH, { whole: true }), m(LEFT_MONTH - v.x, { whole: true })))
        + `<p style="margin:12px ${SP.edge}px 0 ${SP.edge}px; font-size:13px; line-height:1.45; color:${T.muted}">From the Nov 15 payment, the expected amount is ${m(payNew, { whole: true })}. You pay your lender as usual. Decide’s next answers count the extra.</p>`
        + foot(stack(P('Make this the plan', `closeall|back|toast:Plan saved. ${m(payNew, { whole: true })} a month pays it off by ${v.lastMonth}.~Undo`), O('Not now', 'close'))));
    }
  }

  // =====================================================================
  // 3. Growth illustration from Investing (D-19): $7,690 now + $200 a month, 10 years, rate you pick
  // =====================================================================
  const barChart = (years, label) => {
    const max = Math.max(...years.map((y) => y.value)); const H = 120, W = 320, bw = 22, gap = (W - bw * 10) / 9;
    const bars = years.map((y, i) => { const x = i * (bw + gap); const hv = (y.value / max) * H; const hp = (y.put / max) * H; return `<rect x="${x.toFixed(1)}" y="${(H - hv).toFixed(1)}" width="${bw}" height="${(hv - hp).toFixed(1)}" rx="3" fill="${T.accent}"></rect><rect x="${x.toFixed(1)}" y="${(H - hp).toFixed(1)}" width="${bw}" height="${hp.toFixed(1)}" rx="3" fill="${T.rule2}"></rect>`; }).join('');
    return `<svg role="img" aria-label="${label}" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block; margin-top:14px">${bars}</svg><div style="display:flex; justify-content:space-between; font-size:11.5px; color:${T.muted}; margin-top:4px">${years.map((_, i) => `<span style="width:22px; text-align:center">${i + 1}</span>`).join('')}</div>
<div style="display:flex; gap:16px; margin-top:10px; font-size:13px; color:${T.muted}"><span style="display:inline-flex; align-items:center; gap:6px"><span style="width:10px; height:10px; border-radius:3px; background:${T.rule2}"></span>Put in</span><span style="display:inline-flex; align-items:center; gap:6px"><span style="width:10px; height:10px; border-radius:3px; background:${T.accent}"></span>Growth</span><span style="margin-left:auto">Years</span></div>`;
  };
  const growVars = [['GC05a', 200], ['GC05', 400], ['GC05b', 600]].map(([id, bp]) => ({ id, bp, now: C.grow(769000, 20000, bp, 120), own: C.grow(0, 20000, bp, 120) }));
  for (const v of growVars) {
    const r = v.bp / 100;
    const html = titleBlock('Investing', 'Growth illustration', 'What $7,690 plus $200 a month could become at one steady rate.')
      + pad(`<div style="display:flex; flex-wrap:wrap; gap:8px">${softBadge('Illustration, not a forecast', 'sQuestion')}</div>`, 12)
      + inCard(`<div style="font-size:13px; font-weight:700">Rate a year</div>${swapChips('Rate a year', growVars.map((w) => [w.bp / 100 + '%', w.id === v.id, 'replace:' + w.id]))}
<div style="margin-top:18px">${lab(`After 10 years at ${r}% a year`)}${fig(m(v.now.value))}</div>${barChart(v.now.years, `Illustration at ${r} percent: after 10 years ${m(v.now.value)}, of which ${m(v.now.put)} put in`)}`)
      + card(kv('Starting value', '$7,690.00 · as of Nov 1', true) + kv('Put in over 10 years', m(v.now.put - 769000)) + kv('Growth', m(v.now.growth)) + kv(`$200 a month alone, from $0`, m(v.own.value)))
      + why(`${r}% a year is added as ${r}% ÷ 12 each month on the balance, rounded to the cent. $200 goes in at the end of each month, 120 times. ${m(769000)} + ${m(v.now.put - 769000)} put in = ${m(v.now.put)}; the rest, ${m(v.now.growth)}, is growth.`)
      + `<div style="margin:12px ${SP.card}px 0 ${SP.card}px">${tint('notyet', 'Real returns rise and fall, and some years go below zero. This uses one steady rate you pick, so it shows a shape, not what will happen.', 'sQuestion')}</div>`
      + footer('An illustration from the values you typed. FincWin holds no investments and makes no forecast.');
    gs(v.id, `Growth illustration, ${r}%`, html);
  }

  // =====================================================================
  // 4. Calculators page and the four typed calculators (no records needed)
  // =====================================================================
  const calcRow = (ic, t, s, a, first) => R({ title: t, sub: s, lead: accTile(ic), first }, a);
  gs('GC01', 'Calculators', titleBlock('Grow', 'Calculators', 'Type your own numbers. These work without any records, and nothing you type here is saved.')
    + card(calcRow('bills', 'Loan calculator', 'Monthly payment and total interest', 'go:GC10', true) + calcRow('savings', 'Savings calculator', 'How long to reach an amount', 'go:GC20') + calcRow('invest', 'Compound growth', 'What regular saving could grow to', 'go:GC30') + calcRow('debt', 'Debt payoff', 'Two payoff orders, side by side', 'go:GC40'))
    + sectionHeader('With your records')
    + card(calcRow('calendar', 'Trip to Lisbon', '$640 of $1,800 · $50 a month', 'go:GC02', true) + calcRow('debt', 'Auto loan, extra payments', '$8,420 · $312 a month', 'go:GC04') + calcRow('invest', 'Investing, growth illustration', '$7,690 · $200 a month', 'go:GC05'))
    + footer('Results come from the numbers you type, worked out to the cent. They are estimates for planning, not offers, quotes or forecasts. FincWin holds no money and lends none.'));

  // Loan calculator
  const LN = { p: 2000000, bp: 750, n: 60 }; const ln = C.loan(LN.p, LN.bp, LN.n);
  gs('GC10', 'Loan calculator', titleBlock('Calculators', 'Loan calculator')
    + pad(input('Amount borrowed', '20,000', { pre: '$', mt: 4 }) + grid2(input('Rate a year (APR)', '7.5', { suf: '%' }), input('Length', '60', { suf: 'months' })), 8)
    + inCard(`${lab('Each month')}${fig(m(ln.pay))}<p style="margin:6px 0 0 0; font-size:14px; color:${T.muted}">for 60 months. Results update as you type.</p>`)
    + card(kv('Total interest', m(ln.totalInt), true) + kv('Total paid', m(ln.total)) + kv('Last payment', m(ln.last)))
    + why(`7.5% a year is 0.625% a month. The payment is the fixed amount that pays off ${m(LN.p, { whole: true })} and its interest in exactly 60 months (standard loan maths): ${m(LN.p, { whole: true })} × 0.00625 ÷ (1 − 1.00625<sup>−60</sup>) = ${m(ln.pay)}. Each month, interest on what is still owed is rounded to the cent and the rest of the payment lowers the balance. The last payment, ${m(ln.last)}, is what is left.`)
    + footer('An estimate. A lender’s offer can differ: fees, the day interest starts and its rounding all change the numbers.'));

  // Savings calculator
  const SV = { have: 50000, target: 500000, add: 25000, bp: 300 }; const sv = C.saveTo(SV.have, SV.target, SV.add, SV.bp);
  const svDate = C.monthName(sv.months - 1, 2026, 11); // first deposit Dec 2026
  gs('GC20', 'Savings calculator', titleBlock('Calculators', 'Savings calculator')
    + pad(grid2(input('Target', '5,000', { pre: '$', mt: 4 }), input('Saved so far', '500', { pre: '$', mt: 4 })) + grid2(input('Each month', '250', { pre: '$' }), input('Interest a year', '3', { suf: '%', help: 'Optional. 0 if none.' })), 8)
    + inCard(`${lab('Reaches $5,000 in')}${fig(sv.months + ' months')}<p style="margin:6px 0 0 0; font-size:14px; color:${T.muted}">by ${svDate}, with the first $250 next month (Dec 2026).</p>`)
    + card(kv('You put in', m(sv.put), true) + kv('Interest earned', m(sv.interest)) + kv(`Total in ${svDate}`, m(sv.value)))
    + why(`3% a year is 0.25% a month, added on the balance and rounded to the cent; $250 goes in at the end of each month. After ${sv.months - 1} months the total is still under $5,000; month ${sv.months} takes it to ${m(sv.value)}. Without interest it also takes ${C.saveTo(SV.have, SV.target, SV.add, 0).months} months: $500 + ${sv.months} × $250 = ${m(sv.put)}.`)
    + footer('An estimate. A bank’s rate can change, and some pay interest daily or yearly, which moves the result a little.'));

  // Compound growth
  const CG = C.grow(0, 20000, 400, 120);
  gs('GC30', 'Compound growth', titleBlock('Calculators', 'Compound growth')
    + pad(grid2(input('Start with', '0', { pre: '$', mt: 4 }), input('Add each month', '200', { pre: '$', mt: 4 })) + grid2(input('Rate a year', '4', { suf: '%' }), input('Years', '10', { suf: 'years' })), 8)
    + pad(`<div style="display:flex; flex-wrap:wrap; gap:8px">${softBadge('Illustration, not a forecast', 'sQuestion')}</div>`, 12)
    + inCard(`${lab('$200 a month at 4% for 10 years')}${fig(m(CG.value))}${barChart(CG.years, `Illustration: after 10 years ${m(CG.value)}, of which ${m(CG.put)} put in`)}`)
    + card(kv('Put in', m(CG.put), true) + kv('Growth', m(CG.growth)))
    + why(`4% a year is added as 4% ÷ 12 each month on the balance, rounded to the cent. $200 goes in at the end of each month, 120 times: ${m(CG.put)} put in. The other ${m(CG.growth)} is growth on growth, which is why later years rise faster.`)
    + `<div style="margin:12px ${SP.card}px 0 ${SP.card}px">${tint('notyet', 'Real returns rise and fall. This uses one steady rate, so it shows a shape, not what will happen.', 'sQuestion')}</div>`
    + footer('An illustration from the numbers you type. FincWin makes no forecast.'));

  // Debt payoff, two orders side by side (D-13)
  const debts = [{ name: 'Credit card', bal: 420000, bp: 2190, min: 12000 }, { name: 'Personal loan', bal: 150000, bp: 950, min: 7500 }];
  const EXTRA = 10000;
  const av = C.strategy(debts, EXTRA, 'rate'), sb = C.strategy(debts, EXTRA, 'balance'), mn = C.strategy(debts, 0, 'rate');
  const when = (n) => `${n} months · ${C.monthName(n - 1, 2026, 11)}`;
  const firstDone = (s) => { const f = [...s.debts].sort((a, b) => a.done - b.done)[0]; return `${f.name}, month ${f.done}`; };
  const debtIn = (name, bal, rate, min, mt) => `<div style="margin-top:${mt}px; padding:12px 14px 14px 14px; border-radius:18px; background:#FFFFFF; ${SHADOW}"><div style="font-size:15px; font-weight:800">${name}</div><div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px">${input('Owed', bal, { pre: '$', mt: 10 })}${input('Rate', rate, { suf: '%', mt: 10 })}${input('Minimum', min, { pre: '$', mt: 10 })}</div></div>`;
  const stratCard = (t, s, order) => `<div style="min-width:0; padding:14px; border-radius:18px; background:#FFFFFF; ${SHADOW}"><div style="font-size:14px; font-weight:800; line-height:1.3">${t}</div><div style="font-size:12.5px; color:${T.muted}; margin-top:4px; line-height:1.35">${order}</div>
<div style="font-size:12.5px; color:${T.muted}; margin-top:12px">Debt-free</div><div style="font-size:16px; font-weight:800; margin-top:2px">${s.months} months</div><div style="font-size:13px; color:${T.muted}; margin-top:1px">by ${C.monthName(s.months - 1, 2026, 11)}</div>
<div style="font-size:12.5px; color:${T.muted}; margin-top:10px">Total interest</div><div style="font-size:16px; font-weight:800; margin-top:2px; font-variant-numeric:tabular-nums">${m(s.totalInt)}</div>
<div style="font-size:12.5px; color:${T.muted}; margin-top:10px">First debt cleared</div><div style="font-size:14px; font-weight:700; margin-top:2px">${firstDone(s)}</div></div>`;
  gs('GC40', 'Debt payoff', titleBlock('Calculators', 'Debt payoff', 'Two debts, one monthly amount. See how the order changes the result.')
    + `<div style="padding:0 ${SP.card}px">${debtIn('Credit card', '4,200', '21.9', '120', 16)}${debtIn('Personal loan', '1,500', '9.5', '75', 10)}</div>`
    + `<div style="padding:0 ${SP.edge}px">${input('Extra each month', '100', { pre: '$', help: `On top of the minimums: ${m(av.budget, { whole: true })} a month in all.` })}</div>`
    + sectionHeader('Side by side') + `<div style="margin:${SP.row}px ${SP.card}px 0 ${SP.card}px">${grid2(stratCard('Highest rate first', av, 'Extra goes to the Credit card (21.9%)'), stratCard('Smallest balance first', sb, 'Extra goes to the Personal loan ($1,500)'))}</div>`
    + card(kv('Minimums only, no extra', `${when(mn.months)}`, true) + kv('Interest on minimums only', m(mn.totalInt)))
    + why(`Each month, interest on each debt is worked out (rate ÷ 12, rounded to the cent). Every debt gets its minimum, and the extra $100 goes to one debt: the highest rate or the smallest balance. When a debt is paid off, its minimum joins the extra, so the ${m(av.budget, { whole: true })} a month stays the same. Both columns pay the same ${m(av.budget, { whole: true })}; only the order differs. First payment next month (Dec 2026).`)
    + footer('Both orders are shown with the same numbers. The choice is yours. An estimate; a lender’s figures can differ.'));

  // =====================================================================
  // Entry points and number fixes on 30-areas.js Grow screens
  // =====================================================================
  const areas = require('./30-areas.js')(K, X);
  const get = (id) => areas.find((s) => s.id === id);
  const beforeFooter = (h, snip) => { const i = h.lastIndexOf(`<p style="margin:22px ${SP.edge}px 0 ${SP.edge}px`); return i < 0 ? h + snip : h.slice(0, i) + snip + h.slice(i); };
  const calcCard = sectionHeader('Tools') + card(calcRow('target', 'Calculators', 'Loan, savings, growth, debt payoff', 'go:GC01', true));
  const textRow = (t, a, ic) => `<a href="#"${da(a)} style="display:flex; align-items:center; gap:10px; min-height:52px; padding:0 16px; text-decoration:none; color:${T.accent}; font-size:15px; font-weight:700; border-top:1px solid ${T.rule}">${icon(ic, T.accent, 20)}${t}</a>`;
  const patch = (id, fn) => { const s = get(id); if (s) out.push({ ...s, html: fn(s.html) }); };
  patch('G01', (h) => beforeFooter(h, calcCard));
  patch('G07', (h) => beforeFooter(h.replace('>Smallest first<', '>Smallest balance first<'), card(calcRow('debt', 'Extra payments on the Auto loan', 'Payoff date and interest saved', 'go:GC04', true)) + calcCard));
  patch('G10', (h) => beforeFooter(h, card(calcRow('invest', 'Growth illustration', '$200 a month at a rate you pick', 'go:GC05', true)) + calcCard));
  patch('G03', (h) => h.replace('Change one and the other follows.</p></div>', `Change one and the other follows.</p>${textRow('Try other amounts or dates', 'go:GC02', 'target')}</div>`));
  const plus50 = C.payoff(L.bal, L.bp, L.pay, 5000);
  patch('G08', (h) => h.replace(/\+\$50 a month ends it in Dec 2028 and saves about \$120\./, `+$50 a month ends it in ${plus50.lastMonth} and saves about ${d$(Math.round((base.totalInt - plus50.totalInt) / 1000) * 1000)}.`)
    .replace('Change in the payoff plan</button>', `Change in the payoff plan</button><br>${TB('Try other amounts', 'go:GC04')}`));
  // Laptop goal: $3,500 from $0, first deposit Nov 16
  const lap = (each) => C.monthName(Math.ceil(350000 / each) - 1);
  patch('G03f', (h) => h.replace('$292 a month reaches it by Nov 2027. $150 a month reaches it by Apr 2028.', `$292 a month reaches it by ${lap(29200)}. $150 a month reaches it by ${lap(15000)}.`));
  const byOct = goalByDate(24);
  patch('G03d', (h) => h.replace('That takes about <b>$49 a month</b>.', `That takes <b>${m(byOct.each)} a month</b>.`).replace('toast:Plan saved. $49 a month.', `toast:Plan saved. ${m(byOct.each)} a month.`));
  return out;
};
