import { minorUnits as mu } from '../../../../money/types';
import type { Confidence, ConfidenceReason, ReasonItem } from '../../types';
import {
  NEXT_STEP_OF,
  REASON_AUDIENCE,
  REASON_WEIGHT,
  buildBasis,
  confidenceOf,
  mergeConfidence,
  pickNextStep,
  reasonItem,
  withReason,
  type ConfidenceInput,
} from '../reasons';

/** Every ConfidenceReason, spelled out so a new code must be added here (and to both tables) before this compiles. */
const ALL: Readonly<Record<ConfidenceReason, true>> = {
  few_months: true,
  early_in_month: true,
  under_logged: true,
  unspent_stale: true,
  unspent_drifted: true,
  quick_estimates: true,
  provisional_rates: true,
  no_setup: true,
  user_said_cover: true,
  pay_missed: true,
  close_to_line: true,
};
const CODES = Object.keys(ALL) as ConfidenceReason[];

const clean: ConfidenceInput = {
  monthsUsed: 6,
  day: 20,
  everydayLogged: mu(100000),
  e: mu(150000),
  typedEstimatesUsed: false,
  provisionalRates: false,
  upTo: '2026-10-29',
};

const codes = (c: Confidence): ConfidenceReason[] => c.reasons.map((r) => r.code);

describe('reason tables (ENG-18)', () => {
  it('every reason has a weight and an audience, and no two reasons share a weight', () => {
    expect(Object.keys(REASON_WEIGHT).sort()).toEqual([...CODES].sort());
    expect(Object.keys(REASON_AUDIENCE).sort()).toEqual([...CODES].sort());
    expect(new Set(Object.values(REASON_WEIGHT)).size).toBe(CODES.length);
  });

  it('Theme H order: your own word, quick estimates, few months, spare money drifted, missed pay, close to the line, then the rest', () => {
    const order = [...CODES].sort((a, b) => REASON_WEIGHT[a] - REASON_WEIGHT[b]);
    expect(order.slice(0, 6)).toEqual(['user_said_cover', 'quick_estimates', 'few_months', 'unspent_drifted', 'pay_missed', 'close_to_line']);
  });

  it('the reasons that can change the answer are the answer audience', () => {
    expect(CODES.filter((c) => REASON_AUDIENCE[c] === 'answer').sort()).toEqual(['close_to_line', 'few_months', 'pay_missed', 'quick_estimates', 'user_said_cover']);
  });

  it('reasonItem carries the table weight and audience', () => {
    expect(reasonItem('few_months', { used: 2, lookedFor: 3 })).toEqual({ code: 'few_months', numbers: { used: 2, lookedFor: 3 }, weight: 30, audience: 'answer' });
    expect(reasonItem('provisional_rates')).toEqual({ code: 'provisional_rates', numbers: {}, weight: 110, audience: 'detail' });
  });
});

describe('confidenceOf', () => {
  it('nothing lowering it: no reasons, the clean records basis with the records date, no next step', () => {
    expect(confidenceOf(clean)).toEqual({ reasons: [], basis: { kind: 'records', months: 6, upTo: '2026-10-29' }, nextStep: null });
  });

  it('I5 few months: under 3 months is few_months with its numbers and a partial basis', () => {
    expect(confidenceOf({ ...clean, monthsUsed: 2 })).toEqual({
      reasons: [{ code: 'few_months', numbers: { used: 2, lookedFor: 3 }, weight: 30, audience: 'answer' }],
      basis: { kind: 'partial', used: 2, lookedFor: 3, upTo: '2026-10-29' },
      nextStep: { reason: 'few_months', step: 'add_records' },
    });
    expect(confidenceOf({ ...clean, monthsUsed: 3 }).basis).toEqual({ kind: 'records', months: 3, upTo: '2026-10-29' });
  });

  it('I7 (05.4 APP-02, D-113): unsaved writes are not a reason; they are a note on top of the answer only (prepare.ts leadNotes)', () => {
    expect(Object.keys(REASON_WEIGHT)).not.toContain('unsaved_changes');
    expect(Object.values(NEXT_STEP_OF)).not.toContain('save_changes');
  });

  it('I8 early in the month and under-logged carry their numbers; at the edges they are absent', () => {
    expect(confidenceOf({ ...clean, day: 19 }).reasons).toEqual([reasonItem('early_in_month', { day: 19, from: 20 })]);
    expect(confidenceOf({ ...clean, day: 19 }).nextStep).toBeNull();
    expect(confidenceOf({ ...clean, everydayLogged: mu(74999) }).reasons).toEqual([reasonItem('under_logged', { logged: 74999, usual: 150000 })]);
    expect(confidenceOf({ ...clean, everydayLogged: mu(75000) }).reasons).toEqual([]);
  });

  it('no E means nothing to be under-logged against', () => {
    expect(confidenceOf({ ...clean, e: null, everydayLogged: mu(0) }).reasons).toEqual([]);
  });

  it('quick estimates alone give the quick-estimates basis; provisional rates are a detail', () => {
    const q = confidenceOf({ ...clean, monthsUsed: 0, typedEstimatesUsed: true });
    expect(codes(q)).toEqual(['quick_estimates', 'few_months']);
    expect(q.basis).toEqual({ kind: 'quick_estimates' });
    expect(q.nextStep).toEqual({ reason: 'quick_estimates', step: 'add_records' });
    expect(confidenceOf({ ...clean, provisionalRates: true }).reasons).toEqual([reasonItem('provisional_rates')]);
  });

  it('reasons are sorted by weight', () => {
    const c = confidenceOf({ ...clean, monthsUsed: 1, day: 3, everydayLogged: mu(1), provisionalRates: true });
    expect(codes(c)).toEqual(['few_months', 'early_in_month', 'under_logged', 'provisional_rates']);
  });
});

describe('buildBasis', () => {
  const base = { typedOnly: false, monthsUsed: 4, upTo: '2026-10-29' };

  it('the clean sentence only with no answer reason; detail reasons keep it clean', () => {
    expect(buildBasis(base, [])).toEqual({ kind: 'records', months: 4, upTo: '2026-10-29' });
    expect(buildBasis(base, [reasonItem('unspent_stale', { days: 40 })])).toEqual({ kind: 'records', months: 4, upTo: '2026-10-29' });
  });

  it('the top answer reason joins the records sentence', () => {
    const r: ReasonItem[] = [reasonItem('pay_missed'), reasonItem('early_in_month'), reasonItem('user_said_cover')];
    expect(buildBasis(base, r)).toEqual({ kind: 'records_with_reason', months: 4, upTo: '2026-10-29', reason: 'user_said_cover' });
  });

  it('quick estimates first, then fewer months than Decide looks for', () => {
    expect(buildBasis({ ...base, typedOnly: true }, [])).toEqual({ kind: 'quick_estimates' });
    expect(buildBasis({ ...base, monthsUsed: 0 }, [])).toEqual({ kind: 'partial', used: 0, lookedFor: 3, upTo: '2026-10-29' });
  });
});

describe('pickNextStep', () => {
  it('at most one step: the top-weighted reason with a fix', () => {
    expect(pickNextStep([])).toBeNull();
    expect(pickNextStep([reasonItem('early_in_month'), reasonItem('close_to_line'), reasonItem('user_said_cover'), reasonItem('provisional_rates')])).toBeNull();
    expect(pickNextStep([reasonItem('no_setup'), reasonItem('user_said_cover'), reasonItem('under_logged')])).toEqual({ reason: 'under_logged', step: 'log_spending' });
  });

  it('every step a reason names is one of the five steps (05.4 D-113: save_changes gone)', () => {
    const steps = new Set(Object.values(NEXT_STEP_OF));
    expect([...steps].sort()).toEqual(['add_records', 'confirm_unspent', 'finish_setup', 'log_spending', 'record_pay']);
  });
});

describe('withReason (I35: add, never remove)', () => {
  it('adds a reason with its numbers, resorts and rebuilds the basis and next step', () => {
    const c = withReason(confidenceOf({ ...clean, day: 3 }), 'user_said_cover', { monthly: 25000, months: 12 });
    expect(codes(c)).toEqual(['user_said_cover', 'early_in_month']);
    expect(c.basis).toEqual({ kind: 'records_with_reason', months: 6, upTo: '2026-10-29', reason: 'user_said_cover' });
    expect(c.nextStep).toBeNull();
  });

  it('a reason already there keeps its first numbers', () => {
    const c = withReason(confidenceOf(clean), 'unspent_stale', { days: 40 });
    expect(withReason(c, 'unspent_stale', { days: 1 })).toBe(c);
  });

  it('quick estimates stay the basis whatever is added', () => {
    const q = confidenceOf({ ...clean, monthsUsed: 0, typedEstimatesUsed: true });
    expect(withReason(q, 'pay_missed').basis).toEqual({ kind: 'quick_estimates' });
  });

  it('a partial basis stays partial', () => {
    expect(withReason(confidenceOf({ ...clean, monthsUsed: 1 }), 'unspent_drifted').basis).toEqual({ kind: 'partial', used: 1, lookedFor: 3, upTo: '2026-10-29' });
  });
});

describe('mergeConfidence (D-42)', () => {
  it('the union of reasons, the first numbers kept, the smaller basis', () => {
    const a = confidenceOf({ ...clean, monthsUsed: 4, everydayLogged: mu(1) });
    const b = confidenceOf({ ...clean, monthsUsed: 2, everydayLogged: mu(2) });
    const m = mergeConfidence(a, b);
    expect(m.reasons).toEqual([reasonItem('few_months', { used: 2, lookedFor: 3 }), reasonItem('under_logged', { logged: 1, usual: 150000 })]);
    expect(m.basis).toEqual({ kind: 'partial', used: 2, lookedFor: 3, upTo: '2026-10-29' });
    expect(mergeConfidence(b, a).basis).toEqual(m.basis);
  });

  it('quick estimates on either side win', () => {
    const q = confidenceOf({ ...clean, monthsUsed: 0, typedEstimatesUsed: true });
    expect(mergeConfidence(q, confidenceOf(clean)).basis).toEqual({ kind: 'quick_estimates' });
    expect(mergeConfidence(confidenceOf(clean), q).basis).toEqual({ kind: 'quick_estimates' });
  });

  it('two clean readings stay clean at the smaller month count', () => {
    expect(mergeConfidence(confidenceOf({ ...clean, monthsUsed: 5 }), confidenceOf(clean)).basis).toEqual({ kind: 'records', months: 5, upTo: '2026-10-29' });
  });
});
