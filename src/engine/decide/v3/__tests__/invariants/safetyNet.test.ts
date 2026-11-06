/**
 * I50, I51, I52 and the named properties I-saved and I-D41 (05.4 FIN-01, FIN-02, ENG-03, ENG-04; D-05, D-06, D-35, D-41, D-49;
 * 05.4-12 revision notes section 4). Golden persons with a safety-net record (netInputsArb). needs_input asks for a figure, not a
 * verdict, so a pair where either side asks is skipped.
 */
import * as fc from 'fast-check';
import { evaluate, type Evaluation } from '../../evaluate';
import type { CheckV2, Fact, Result, V3Inputs } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { PURPOSES, checkArb, checkOf, codeRank, netInputsArb, priceArb, shapeArb, withSafetyNet, type NetTweak } from './arbitraries';

const run = (inputs: V3Inputs, check: CheckV2): Result => evaluate(inputs, check).result;
const asking = (...rs: Result[]): boolean => rs.some((r) => r.code === 'needs_input');

/** The facts that only describe the net; every other fact is the same answer told the same way. */
const NET_FACTS = new Set<string>(['emergency_untouched', 'net_used', 'net_left', 'net_refill', 'net_zero_is_off', 'net_protection_off', 'net_none_start', 'net_progress', 'net_above_size', 'wait_keeps_net', 'need_net_line', 'net_locked', 'extra_savings_used', 'net_two_months', 'move_money_by', 'price_over_net', 'net_lasts', 'net_lasts_without']);
/** 05.4 D-54 / D-63: the depletion lines lead the answer; the net's own lines start after them. */
const DEPLETION = new Set<string>(['usual_month_short', 'depletion_payment', 'plan_makes_short', 'price_over_net', 'net_lasts', 'net_lasts_without', 'interest_is_a_cost', 'balanced_month_room', 'month_balance_gap']);
const afterDepletion = (facts: readonly Fact[]): readonly Fact[] => facts.filter((f) => !DEPLETION.has(f.code));
const otherFacts = (facts: readonly Fact[]): readonly Fact[] => facts.filter((f) => !NET_FACTS.has(f.code));
const answer = (r: Result): unknown => ({ code: r.code, variant: r.variant, split: r.split, readyBy: r.readyBy, missing: r.missing, parts: r.parts, facts: otherFacts(r.facts), notices: r.notices });

/** What the split takes from the safety net's account. */
const fromNet = (r: Result): number => r.split.filter((s) => s.source === 'emergency').reduce((t, s) => t + s.amount, 0);

describe('safety-net invariants', () => {
  it('I50 never fits below the protected floor min(saved, size): spare money and the 90-day path stay above it', () => {
    fc.assert(
      fc.property(netInputsArb, checkArb, ({ base, n }, check) => {
        fc.pre(n.protect && (n.size === null || n.size > 0));
        const ev: Evaluation = evaluate(withSafetyNet(base, n), check);
        const net = ev.net!;
        expect(net.floor).toBe(Math.min(net.saved, net.size));
        if (ev.result.code === 'fits_month' || ev.result.code === 'fits_unspent') {
          // The path counts spare money only (money above the size included), so a low point at or above 0 is the net's
          // money at or above its floor; the split takes nothing from the protected part.
          expect(ev.cash.kind).toBe('ok');
          if (ev.cash.kind === 'ok') expect(ev.cash.lowest.balance + net.saved).toBeGreaterThanOrEqual(net.floor);
          expect(fromNet(ev.result)).toBeLessThanOrEqual(net.aboveSize);
        }
      }),
      { numRuns: fcRuns(300), seed: 0x0550 }
    );
  });

  it('I51 protection off restores the previous result exactly, except protection_off when the net money is used', () => {
    fc.assert(
      fc.property(netInputsArb, checkArb, ({ base, n }, check) => {
        const off = run(withSafetyNet(base, { ...n, protect: false }), check);
        // The previous rules: the net's money never counted. Protection off with nothing in it is exactly that.
        const before = run(withSafetyNet(base, { ...n, protect: false, saved: 0 }), check);
        if (off.parts.oneOff === 'fits_uses_net') {
          // 05.4 D-63 / D-65: an already-short usual month heads the answer instead (on Dips it is always the Large tier)
          if (off.code === 'fits_uses_net') {
            expect(['protection_off', 'month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra']).toContain(off.variant);
          }
          expect(codeRank(before.code)).toBeLessThanOrEqual(codeRank(off.code));
        } else {
          expect(answer(off)).toEqual(answer(before));
        }
      }),
      { numRuns: fcRuns(300), seed: 0x0551 }
    );
  });

  it('I52 a $0 net equals protection off, and says so', () => {
    fc.assert(
      fc.property(netInputsArb, checkArb, ({ base, n }, check) => {
        const zero = run(withSafetyNet(base, { ...n, protect: true, size: 0 }), check);
        const off = run(withSafetyNet(base, { ...n, protect: false, size: 0 }), check);
        expect({ ...zero, facts: zero.facts.filter((f) => f.code !== 'net_zero_is_off') }).toEqual({ ...off, facts: off.facts.filter((f) => f.code !== 'net_protection_off') });
        if (zero.code !== 'needs_input') expect(zero.facts.some((f) => f.code === 'net_zero_is_off')).toBe(true);
        expect(off.facts.some((f) => f.code === 'net_zero_is_off')).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x0552 }
    );
  });

  it('I-saved more money saved in the net never gives a worse answer', () => {
    fc.assert(
      fc.property(netInputsArb, checkArb, fc.integer({ min: 0, max: 3_000_000 }), ({ base, n }, check, d) => {
        const less = run(withSafetyNet(base, n), check);
        const more = run(withSafetyNet(base, { ...n, saved: n.saved + d }), check);
        fc.pre(!asking(less, more));
        expect(codeRank(more.code)).toBeGreaterThanOrEqual(codeRank(less.code));
      }),
      { numRuns: fcRuns(300), seed: 0x0553 }
    );
  });

  it('I-D41 purpose never changes the code, the variant or any figure; only net facts and their order', () => {
    fc.assert(
      fc.property(netInputsArb, shapeArb, priceArb, ({ base, n }, shape, price) => {
        const inputs = withSafetyNet(base, n);
        const results = PURPOSES.filter((p) => p === null || p.kind === 'preset').map((purpose) => run(inputs, checkOf(price, { ...shape, purpose })));
        const first = results[0]!;
        for (const r of results) {
          expect(answer(r)).toEqual(answer(first));
          // The net's own figures are the same too, whatever their order.
          const figures = (x: Result): unknown => x.facts.filter((f) => NET_FACTS.has(f.code) && f.code !== 'need_net_line' && f.code !== 'wait_keeps_net').map((f) => [f.code, f.values]);
          expect(figures(r)).toEqual(figures(first));
        }
      }),
      { numRuns: fcRuns(200), seed: 0x0554 }
    );
  });

  it('I-D41 a need leads with need_net_line and drops the wait line; a want or no purpose keeps the wait line first', () => {
    const n: NetTweak = { protect: true, size: 1_000_000, saved: 1_000_000, locked: false }; // D-61: the unlocked rule
    fc.assert(
      fc.property(netInputsArb, priceArb, ({ base }, price) => {
        const inputs = withSafetyNet(base, n);
        const need = run(inputs, checkOf(price, { plan: null, purpose: { kind: 'preset', value: 'necessity' }, emergency: false }));
        fc.pre(need.code === 'fits_uses_net');
        const want = run(inputs, checkOf(price, { plan: null, purpose: { kind: 'preset', value: 'treat' }, emergency: false }));
        expect(afterDepletion(need.facts)[0]?.code).toBe('need_net_line');
        expect(need.facts.some((f) => f.code === 'wait_keeps_net')).toBe(false);
        expect(want.facts.some((f) => f.code === 'need_net_line')).toBe(false);
        if (want.facts.some((f) => f.code === 'wait_keeps_net')) expect(afterDepletion(want.facts)[0]?.code).toBe('wait_keeps_net');
      }),
      { numRuns: fcRuns(200), seed: 0x0555 }
    );
  });
});
