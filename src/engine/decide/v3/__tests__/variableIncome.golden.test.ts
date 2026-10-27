/**
 * Goldens for the variable-income, account and readiness rules (05.1-48): a seasonal earner (ines), a gig earner (gabe),
 * a very volatile gig earner (vic), a steady salaried person with stated accounts (dee) and a rough-figures-only new user
 * (rae). Every expectation was worked by hand from the rules and is written with its working in variable-income.json
 * (D-28 style). The engine's own output is never the source of an expectation.
 */
import en from '../../../../i18n/locales/en';
import { evaluate } from '../evaluate';
import type { Evaluation } from '../evaluate';
import { loadAllVariableCases, type LoadedCase } from './golden/variableIncomeLoader';

const CASES = loadAllVariableCases();
const byId = (id: string): LoadedCase => CASES.find((c) => c.id === id) as LoadedCase;
const run = (c: LoadedCase): Evaluation => evaluate(c.inputs, c.check);
const COPY = (en as unknown as { decide: { v3: Record<string, Record<string, string>> } }).decide.v3;

/** The wording of the account question: the fund wording only when the fund is the open gap (D-62). */
function questionKeyOf(ev: Evaluation): string {
  const codes = ev.result.notices.map((n) => n.code);
  return codes.includes('fund_account_unknown') && !codes.includes('account_use_unknown') ? 'account_use_question_fund' : 'account_use_question';
}

function expectMatches(c: LoadedCase): void {
  const e = c.expect;
  const ev = run(c);
  const r = ev.result;
  expect(r.code).toBe(e.code);
  expect(r.variant).toBe(e.variant ?? null);
  expect(r.missing).toEqual(e.missing ?? []);
  for (const f of e.facts ?? []) expect(r.facts).toContainEqual(f);
  for (const n of e.notices ?? []) expect(r.notices).toContainEqual(n);
  for (const code of e.noticesAbsent ?? []) expect(r.notices.map((n) => n.code)).not.toContain(code);
  for (const x of e.reasons ?? []) expect(r.reasons).toContain(x);
  if (e.confidence !== undefined) expect(r.confidence.level).toBe(e.confidence);
  if (e.futures !== undefined) expect(ev.futures !== null).toBe(e.futures);
  if (e.readyBy !== undefined) expect(r.readyBy).toEqual(e.readyBy);
  if (e.split !== undefined) expect(r.split.map((s) => ({ source: s.source, amount: s.amount }))).toEqual(e.split);
  if (e.readiness !== undefined) expect(r.readiness).toEqual(e.readiness);
  const f = e.funds;
  if (f) {
    if (f.suggested !== undefined) expect(ev.funds.suggested).toBe(f.suggested);
    if (f.unexplained !== undefined) expect(ev.funds.unexplained).toBe(f.unexplained);
    if (f.ringFenced !== undefined) expect(ev.funds.ringFenced).toBe(f.ringFenced);
    if (f.spending !== undefined) expect(ev.funds.spending).toBe(f.spending);
  }
  const g = e.figures;
  if (g) {
    if (g.monthLeft !== undefined) expect(ev.month.monthLeft).toBe(g.monthLeft);
    if (g.typicalIncome !== undefined) expect(ev.month.typicalIncome).toBe(g.typicalIncome);
    if (g.leanLeft !== undefined) expect(ev.month.incomePicture?.leanLeft).toBe(g.leanLeft);
    if (g.lowLeft !== undefined) expect(ev.month.low?.left).toBe(g.lowLeft);
    if (g.erest !== undefined) expect(ev.month.erest).toBe(g.erest);
  }
  if (e.questionKey !== undefined) {
    expect(questionKeyOf(ev)).toBe(e.questionKey);
    expect(typeof COPY.missing![e.questionKey]).toBe('string');
  }
}

describe.each(CASES.map((c) => [c.person, c] as const))('05.1-48 %s', (_person, c) => {
  it(`${c.id} matches the hand-worked expectation`, () => {
    expectMatches(c);
  });
});

describe('D-46: every why code appears in a golden with exact values', () => {
  const all = CASES.flatMap((c) => {
    const r = run(c).result;
    return [...r.facts.map((f) => ({ ...f, kind: 'fact' as const })), ...r.notices.map((n) => ({ ...n, kind: 'notice' as const }))];
  });
  const has = (code: string, pred: (v: Record<string, number | string | null>) => boolean = () => true): boolean =>
    all.some((x) => x.code === code && pred(x.values));

  it('lean_months_judged, low_month_judged, lean_bridge (with until) and unspent_held_back', () => {
    expect(has('lean_months_judged', (v) => v.from === '2027-01' && v.to === '2027-03' && v.leanLeft === 25000)).toBe(true);
    expect(has('low_month_judged', (v) => v.month === '2026-05' && v.left === 13000)).toBe(true);
    expect(has('lean_bridge', (v) => v.until === '2027-03' && v.bridge === 45000 && v.after === 259000)).toBe(true);
    expect(has('lean_bridge', (v) => v.until === '2026-12' && v.bridge === 24000 && v.after === 220000)).toBe(true);
    expect(has('unspent_held_back', (v) => v.amount === 270000)).toBe(true);
  });

  it('income_from_expected: confirmed, last_year and low', () => {
    expect(has('income_from_expected', (v) => v.source === 'confirmed' && v.amount === 260000)).toBe(true);
    expect(has('income_from_expected', (v) => v.source === 'last_year' && v.sameMonth === '2025-11')).toBe(true);
    expect(has('income_from_expected', (v) => v.source === 'low' && v.amount === 170000)).toBe(true);
  });

  it('pay_capped_expected, same_season_compared and history_window_12', () => {
    expect(has('pay_capped_expected', (v) => v.capped === 570000)).toBe(true);
    expect(has('pay_capped_expected', (v) => v.capped === 260000)).toBe(true);
    expect(has('same_season_compared', (v) => v.lastYear === '2025-12' && v.everyday === 150000)).toBe(true);
    expect(has('history_window_12', (v) => v.months === 12)).toBe(true);
  });
});

describe('D-48: ask, yes and no each appear in a golden', () => {
  it('vic asks with the income_volatile values', () => {
    const r = run(byId('vic-ask')).result;
    expect(r.code).toBe('needs_input');
    expect(r.missing).toEqual(['volatile_cover_question']);
    expect(r.notices).toContainEqual({
      code: 'income_volatile',
      values: { payment: 20000, periods: 6, monthly: 20000, months: 6, leanFrom: '2026-05', leanTo: '2026-05', leanLeft: -87000 },
    });
  });

  it('a yes fits on her word at rough confidence; a no is not_yet with futures', () => {
    const yes = run(byId('vic-yes'));
    expect(yes.result.code).toBe('fits_month');
    expect(yes.result.facts).toContainEqual({ code: 'rests_on_your_answer', values: { monthly: 20000, months: 6 } });
    expect(yes.result.confidence.level).toBe('rough');
    expect(yes.result.confidence.reasons).toContain('user_said_cover');
    const no = run(byId('vic-no'));
    expect(no.result.code).toBe('not_yet');
    expect(no.result.reasons).toContain('volatile_cover_declined');
    expect(no.futures).not.toBeNull();
  });

  it('ines is seasonal at about 28% and never volatile; gabe about 30%; vic about 59% is volatile', () => {
    expect(run(byId('ines-lean-fits')).month.incomePicture?.volatile).toBe(false);
    expect(run(byId('gabe-low-fits')).month.incomePicture?.volatile).toBe(false);
    expect(run(byId('gabe-low-fits')).month.incomePicture?.swings).toBe(true);
    expect(run(byId('vic-ask')).month.incomePicture?.volatile).toBe(true);
  });
});

describe('D-49: envelope money inside an account is ring-fenced', () => {
  it('a mixed account holds back the envelope linked to it and the stated extra', () => {
    const ev = run(byId('dee-mixed'));
    expect(ev.funds.spending).toBe(400000 - 60000 - 20000);
    expect(ev.funds.ringFenced).toBe(80000);
  });

  it('an envelope that sits in a savings account is not taken out of the checking account', () => {
    const ev = run(byId('dee-everyday'));
    expect(ev.funds.spending).toBe(400000);
    expect(ev.funds.ringFenced).toBe(0);
  });
});

describe('D-50: unexplained money asks, and only spare counts', () => {
  it('asks what the money is for, then a spare answer counts it and someone-elses keeps it out', () => {
    const ask = run(byId('dee-unexplained-ask'));
    expect(ask.result.missing).toEqual(['unexplained_money_question']);
    expect(ask.result.notices).toContainEqual({ code: 'unexplained_money', values: { amount: 50000 } });
    expect(ask.funds.unexplained).toBe(50000);
    expect(run(byId('dee-unexplained-spare')).result.code).toBe('fits_unspent');
    expect(run(byId('dee-unexplained-someone')).result.code).toBe('not_yet');
    expect(run(byId('dee-unexplained-someone')).funds.ringFenced).toBe(130000);
  });
});

describe('D-52: past-month fail, current-month fail and pass each appear', () => {
  it('one case fails for each reason, one passes, and readiness never changes the code', () => {
    expect(run(byId('dee-past-month-missing')).result.readiness).toEqual({ ready: false, missing: ['past_month_missing'] });
    expect(run(byId('dee-current-not-current')).result.readiness).toEqual({ ready: false, missing: ['activity_not_current'] });
    expect(run(byId('dee-mixed')).result.readiness).toEqual({ ready: true, missing: [] });
    expect(run(byId('dee-past-month-missing')).result.code).toBe('fits_month');
  });
});

describe('D-54: one case per account use and an unstated account', () => {
  it('everyday, mixed with put-aside, dedicated emergency, dedicated envelope and untouched each shape the answer', () => {
    expect(run(byId('dee-everyday')).result.code).toBe('fits_unspent');
    expect(run(byId('dee-mixed')).funds.spending).toBe(320000);
    expect(run(byId('dee-dedicated-emergency')).result.code).toBe('emergency_use');
    expect(run(byId('dee-dedicated-envelope')).result.facts).toContainEqual({ code: 'envelope_used', values: { used: 40000, envelopeId: 'car' } });
    expect(run(byId('dee-untouched')).result.code).toBe('not_yet');
  });

  it('an account of no stated use asks first; an envelope linked to no account is assumed inside and unconfirmed', () => {
    const unstated = run(byId('dee-account-unstated')).result;
    expect(unstated.missing[0]).toBe('account_use_question');
    expect(unstated.notices).toContainEqual({ code: 'account_use_unknown', values: { accountId: 'dee-savings', count: 1 } });
    const unlinked = run(byId('dee-unlinked-envelope')).result;
    expect(unlinked.notices).toContainEqual({ code: 'envelope_location_assumed', values: { count: 1 } });
    expect(unlinked.readiness?.missing).toEqual(['envelopes_unconfirmed']);
  });
});

describe('D-57: rough-only answers', () => {
  it('a person with only rough figures is ready and the answer is marked rough', () => {
    const r = run(byId('rae-rough')).result;
    expect(r.readiness).toEqual({ ready: true, missing: [] });
    expect(r.confidence.level).toBe('rough');
    expect(r.notices.map((n) => n.code)).toContain('from_your_figures');
    expect(JSON.stringify(CASES.map((c) => c.expect))).not.toContain('income_not_recorded');
  });
});

describe('D-58: ask, arrived, not yet', () => {
  it('an unseen pay asks; arrived counts it; not yet gives the careful rough answer', () => {
    expect(run(byId('dee-pay-unseen')).result.missing).toEqual(['pay_arrival_question']);
    expect(run(byId('dee-pay-arrived')).month.monthLeft).toBe(97250);
    const missed = run(byId('dee-pay-not-yet')).result;
    expect(missed.notices).toContainEqual({ code: 'pay_counted_missed', values: { amount: 300000, date: '2026-10-01' } });
    expect(missed.confidence.level).toBe('rough');
    expect(missed.confidence.reasons).toContain('pay_missed');
  });
});

describe('D-59: two questions in priority order', () => {
  it('account use comes before pay arrival', () => {
    expect(run(byId('dee-two-questions')).result.missing).toEqual(['account_use_question', 'pay_arrival_question']);
  });
});

describe('D-60: seasonal ready-by follows the walk', () => {
  it('ines ready-by is the walk month, not the typical-month answer', () => {
    const ev = run(byId('ines-ready-by'));
    expect(ev.result.readyBy).toEqual({ kind: 'month', month: '2027-02' });
    // The typical-month answer: gap 36,000 over a typical 25,000 leftover is 2 months, 2027-01.
    const gap = 340000 - 304000;
    const typicalMonths = Math.max(1, Math.ceil(gap / (ev.month.typicalLeft as number)));
    expect(typicalMonths).toBe(2);
    expect(ev.result.readyBy).not.toEqual({ kind: 'month', month: '2027-01' });
  });
});

describe('D-62: an unlinked fund is subtracted and asked about', () => {
  it('the fund question uses the fund wording when only the fund is open', () => {
    const ev = run(byId('dee-fund-unlinked'));
    expect(ev.funds.fundUnlinked).toBe(true);
    expect(ev.result.missing[0]).toBe('account_use_question');
    expect(questionKeyOf(ev)).toBe('account_use_question_fund');
    expect(ev.result.notices).toContainEqual({ code: 'fund_account_unknown', values: { amount: 300000 } });
  });

  it('the account question comes first when an account is also unstated (D-59)', () => {
    const ev = run(byId('dee-fund-and-account'));
    expect(questionKeyOf(ev)).toBe('account_use_question');
    const codes = ev.result.notices.map((n) => n.code);
    expect(codes).toContain('account_use_unknown');
    expect(codes).not.toContain('fund_account_unknown');
  });
});
