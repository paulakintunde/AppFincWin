/**
 * 05.4-28 (ENG-15, ENG-17, APP-02, UX-14, UX-15; D-109, D-113, D-114, D-115).
 * I73 price limits hold in both pay modes: no price or 0 asks for a price; over the limit (about US$100,000,000 in every
 *     currency, D-109) is "too large to check"; anything in between asks for neither.
 * I74 the working never contradicts the answer (D-115): (1) what the purchase takes from this month (the parts paid from this month
 *     plus plan payments later this month) adds up exactly to the month figure before buying less the figure after; (2) a plain
 *     "Fits" never takes this month below $0, and any other fit below $0 this month was already that low before buying or carries a
 *     caution; (3) unsaved changes never change the answer or a figure (APP-02): they are a note on top.
 * Also here: an account with no exchange rate counts nowhere and is named (ENG-17, D-114), and the careful path never breaks (UX-14):
 * after "Plan it", "Not buying it" or Delete, the inputs still give an answer.
 */
import * as fc from 'fast-check';

import { MAX_ABS_AMOUNT_MINOR, currencyCode, minorUnits as mu } from '../../../../money/types';
import { laterThisMonth } from '../../afterBuy';
import { maxCheckPrice } from '../../bandEdges';
import { evaluate } from '../../evaluate';
import { judgeCheck, prepare } from '../../prepare';
import type { CheckV2, Code, Envelope, V3Account, V3Inputs } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { checkArb, inputsArb } from './arbitraries';

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const FITS: readonly Code[] = ['fits_month', 'fits_unspent', 'fits_uses_net', 'fits_uses_overdraft', 'fits_on_your_answer', 'fits_by_borrowing'];
/** The fit codes that are themselves a caution (the condition first, owner 2026-11-01). */
const CAUTION_CODES: readonly Code[] = ['fits_uses_net', 'fits_uses_overdraft', 'fits_on_your_answer', 'fits_by_borrowing'];

describe('I73 price limits hold in both pay modes', () => {
  const currencyArb = fc.constantFrom('USD', 'GBP', 'EUR', 'CAD', 'JPY', 'IDR');
  const priceFor = (currency: string): fc.Arbitrary<number> => {
    const max = maxCheckPrice(currency);
    return fc.oneof(
      fc.constantFrom(-100, -1, 0),
      fc.integer({ min: 1, max: 10_000_000 }),
      fc.constantFrom(max - 1, max, max + 1),
      fc.integer({ min: max + 1, max: MAX_ABS_AMOUNT_MINOR * 10 })
    );
  };

  it('I73 no price or 0 asks for a price; over the limit is too large to check; in between asks for neither', () => {
    const seen = { zeroOnce: 0, zeroPlan: 0, overOnce: 0, overPlan: 0, inside: 0 };
    fc.assert(
      fc.property(
        inputsArb,
        checkArb,
        currencyArb.chain((c) => fc.tuple(fc.constant(c), priceFor(c), fc.boolean())),
        (inputs, check0, [currency, price, empty]) => {
          const check = { ...check0, price: empty ? null : mu(price) };
          const r = evaluate({ ...inputs, currency: currencyCode(currency) }, check).result;
          const plan = check.pay.mode === 'plan';
          if (check.price === null || price <= 0) {
            expect(r.code).toBe('needs_input');
            expect(r.missing).toContain('no_price');
            expect(r.missing).not.toContain('price_too_large');
            if (plan) seen.zeroPlan++;
            else seen.zeroOnce++;
          } else if (price > maxCheckPrice(currency)) {
            expect(r.code).toBe('needs_input');
            expect(r.missing).toContain('price_too_large');
            expect(r.missing).not.toContain('no_price');
            if (plan) seen.overPlan++;
            else seen.overOnce++;
          } else {
            expect(r.missing).not.toContain('no_price');
            expect(r.missing).not.toContain('price_too_large');
            seen.inside++;
          }
        }
      ),
      { numRuns: fcRuns(200), seed: 0x0573 }
    );
    if (isFullRun(200)) for (const [k, n] of Object.entries(seen)) expect({ k, reached: n > 0 }).toEqual({ k, reached: true });
  });
});

describe('I74 the working never contradicts the answer', () => {
  it('I74 the working adds up, a plain Fits never takes the month below $0, and unsaved changes change nothing but the note', () => {
    const seen = { split: 0, noSplit: 0, later: 0, belowAlready: 0 };
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 1, max: 5 }), (inputs, check, unsaved) => {
        const p = prepare(inputs);
        const e = judgeCheck(p, check);
        const r = e.result;
        // (3) APP-02 (D-113): unsaved changes are a note on top, never an input to the sums
        const u = evaluate({ ...inputs, unsavedWrites: unsaved }, check).result;
        expect(u.notices[0]).toEqual({ code: 'unsaved_changes', values: {} });
        expect({ ...u, notices: u.notices.slice(1) }).toEqual(r);
        if (r.code === 'needs_input' || e.purchase === null) return;
        const ab = r.afterBuy;
        // (1) the working: what the purchase takes from this month adds up to before - after
        const laterMonth = r.purchaseDate.slice(0, 7) > ab.monthName;
        const byCash = r.facts.some((f) => f.code === 'short_plan_from_cash');
        const fromMonth = r.split.length > 0 ? sum(r.split.filter((s) => s.source === 'month' || s.source === 'emergency').map((s) => s.amount)) : e.purchase.dayOne;
        const taken = laterMonth ? 0 : fromMonth;
        const later = byCash ? 0 : laterThisMonth(e.purchase, inputs.asOf, e.month.month);
        expect(ab.before - ab.month).toBe(taken + later);
        if (r.split.length > 0) seen.split++;
        else seen.noSplit++;
        if (later > 0) seen.later++;
        // (2) the safe floor. "Takes this month below $0" = the month was at or above $0 before buying and is below it after. A
        // plain Fits never does; another fit may only with a caution. A month already below $0 before buying (an overdraft carried
        // in, D-86) is "already that low" (a plan's payments later this month still come off it, as I64 states).
        if (!FITS.includes(r.code) || ab.month >= 0) return;
        const already = ab.before < 0;
        const plainFits = r.code === 'fits_month' && r.variant === null;
        const caution = r.variant !== null || CAUTION_CODES.includes(r.code);
        expect({ code: r.code, variant: r.variant, before: ab.before, month: ab.month, ok: already || (caution && !plainFits) }).toMatchObject({ ok: true });
        if (already) seen.belowAlready++;
      }),
      { numRuns: fcRuns(200), seed: 0x0574 }
    );
    if (isFullRun(200)) for (const k of ['split', 'noSplit'] as const) expect({ k, reached: seen[k] > 0 }).toEqual({ k, reached: true });
  });
});

describe('ENG-17 (D-114): an account with no exchange rate counts nowhere and is named', () => {
  const unratedArb = fc.record({
    balance: fc.integer({ min: -500_000, max: 50_000_000 }),
    kind: fc.constantFrom('checking', 'current', 'savings', null),
    use: fc.constantFrom(null, { kind: 'everyday' } as const, { kind: 'untouched' } as const, { kind: 'mixed', extraSetAside: null } as const),
    fundInIt: fc.boolean(),
    envelopeSaved: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: null }),
  });

  it('ENG-17 adding an unrated account (with a fund or an envelope in it) changes nothing but the notice naming it', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, unratedArb, (inputs0, check, x) => {
        const accts = inputs0.accounts ?? [];
        const inputs: V3Inputs = { ...inputs0, accounts: accts };
        const acct: V3Account = { id: 'acc-norate', balance: mu(x.balance), use: x.use, kind: x.kind, overdraftLimit: mu(100_000), noRate: true };
        const env: Envelope = { id: 'env-norate', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(0), purposeId: null, accountId: 'acc-norate' };
        const envIn = x.envelopeSaved === null ? null : { ...env, saved: mu(x.envelopeSaved) };
        const base: V3Inputs = { ...inputs, envelopes: envIn === null ? inputs.envelopes : [...inputs.envelopes, env] };
        const withUnrated: V3Inputs = {
          ...base,
          accounts: [...accts, acct],
          envelopes: envIn === null ? inputs.envelopes : [...inputs.envelopes, envIn],
          ...(x.fundInIt && inputs.emergency !== null ? { emergency: { ...inputs.emergency, accountId: 'acc-norate' } } : {}),
        };
        // the same person with the account left out entirely (and the fund, if moved there, holding nothing in any account)
        const without: V3Inputs = {
          ...base,
          accounts: [...accts, { id: 'acc-norate', balance: mu(0), use: { kind: 'untouched' } }],
          ...(x.fundInIt && inputs.emergency !== null ? { emergency: { ...inputs.emergency, accountId: 'acc-norate' } } : {}),
        };
        const got = evaluate(withUnrated, check).result;
        const want = evaluate(without, check).result;
        const named = got.notices.filter((n) => n.code === 'account_no_rate');
        expect(named).toEqual([{ code: 'account_no_rate', values: { account: 'acc-norate' } }]);
        expect({ ...got, notices: got.notices.filter((n) => n.code !== 'account_no_rate') }).toEqual(want);
      }),
      { numRuns: fcRuns(200), seed: 0x0517 }
    );
  });

  it('ENG-17 the notes on top: unsaved changes first, then each unrated account in input order', () => {
    const [inputs] = fc.sample(inputsArb, { numRuns: 1, seed: 0x0518 }) as [V3Inputs];
    const [check] = fc.sample(checkArb, { numRuns: 1, seed: 0x0518 }) as [CheckV2];
    const accounts: V3Account[] = [...(inputs.accounts ?? []), { id: 'b', balance: mu(5), use: null, noRate: true }, { id: 'a', balance: mu(5), use: null, noRate: true }];
    const r = evaluate({ ...inputs, accounts, unsavedWrites: 1 }, check).result;
    expect(r.notices.slice(0, 3)).toEqual([
      { code: 'unsaved_changes', values: {} },
      { code: 'account_no_rate', values: { account: 'b' } },
      { code: 'account_no_rate', values: { account: 'a' } },
    ]);
    // an envelope in a rated account and one linked to no account are left as they are
    const p = prepare({ ...inputs, accounts, envelopes: [...inputs.envelopes, { id: 'e1', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(7), purposeId: null, accountId: null }] });
    expect(p.inputs.envelopes.find((e) => e.id === 'e1')?.saved).toBe(7);
    expect(p.unrated).toEqual(['b', 'a']);
    expect(prepare(inputs).unrated).toEqual([]);
  });
});

describe('UX-14 the careful path never breaks (engine side)', () => {
  it('UX-14 after Plan it, Not buying it or Delete the inputs still give an answer, and the same inputs give the same answer', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const before = evaluate(inputs, check);
        // "Plan it": the check saved as a pot for the item (a new envelope with nothing in it yet)
        const planned: V3Inputs = {
          ...inputs,
          envelopes: [...inputs.envelopes, { id: 'planned-item', kind: 'wait', target: check.price, monthlyAmount: null, readyBy: null, saved: mu(0), purposeId: null }],
        };
        expect(() => evaluate(planned, { ...check, envelopeId: 'planned-item' })).not.toThrow();
        // "Not buying it" / Delete: the check goes away; the inputs are untouched and still give Home's figure and an answer
        expect(() => prepare(inputs)).not.toThrow();
        expect(evaluate(inputs, check)).toEqual(before);
        expect(evaluate(inputs, { ...check, price: null }).result.code).toBe('needs_input');
      }),
      { numRuns: fcRuns(200), seed: 0x0514 }
    );
  });
});
