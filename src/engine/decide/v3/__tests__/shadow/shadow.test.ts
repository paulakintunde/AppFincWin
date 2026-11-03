/**
 * Generators for the synthetic histories (05.1-28, D-17). 05.4-08: the old-engine-vs-v3 comparison and the
 * approved-changes.json enforcement are retired (BO-05); the reviewed diff in ../reviewed/ replaces them.
 * The generators stay: deterministic seeds, and no file-system or random source.
 */
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { buildMonthModel } from '../../month/model';
import { toV3Inputs } from '../golden/adapter';
import { generateHistories, historyArb, SHADOW_SEED, steadyOf } from './generate';
import { generateNearLineHistories, withoutRefundLinks, NEAR_LINE_SEED } from './generateNearLine';
import { generateRefundHistories, REFUND_SEED } from './generateRefunds';

describe('generator', () => {
  it('is deterministic: two calls deep-equal, 300 histories, 6-8 full months and 1-4 purchases each', () => {
    const a = generateHistories();
    const b = generateHistories();
    expect(a).toEqual(b);
    expect(a).toHaveLength(300);
    expect(SHADOW_SEED).toBe(0x051d);
    for (const g of a) {
      const full = g.person.months.filter((m) => m.full === true);
      expect(full.length).toBeGreaterThanOrEqual(6);
      expect(full.length).toBeLessThanOrEqual(8);
      expect(g.purchases.length).toBeGreaterThanOrEqual(1);
      expect(g.purchases.length).toBeLessThanOrEqual(4);
    }
    expect(new Set(a.map((g) => g.person.id)).size).toBe(300);
  });
});

describe('05.4-48 (audit cause 4): generated people are possible people', () => {
  it("every generated person's account follows from its records and is never below 0", () => {
    const raws = fc.sample(historyArb, { seed: SHADOW_SEED, numRuns: 300 });
    const gens = generateHistories();
    gens.forEach((g, i) => {
      const raw = raws[i];
      if (raw === undefined) throw new RangeError(`no raw history ${i}`);
      const p = g.person;
      const fund = p.emergency ?? 0;
      const pots = p.envelopes.reduce((s, e) => s + Number(e.saved), 0);
      const oct = p.months.filter((m) => m.full === false).flatMap((m) => m.lines);
      const octIn = oct.filter((l) => l.role === 'income').reduce((s, l) => s + l.amount, 0);
      const octOut = oct.filter((l) => l.role === 'spending').reduce((s, l) => s + l.amount, 0);
      const carried = Math.max(raw.balance, octOut - octIn - pots);
      const main = p.balance - fund;
      expect(main).toBe(pots + carried + octIn - octOut);
      expect(main).toBeGreaterThanOrEqual(0);
      expect(p.balance).toBeGreaterThanOrEqual(fund);
      if (p.unspent !== null) {
        const mm = buildMonthModel(toV3Inputs({ ...p, unspent: null }));
        const toArrive = Math.max(0, mm.moneyIn - octIn);
        expect(p.unspent.amount).toBeLessThanOrEqual(main - pots + toArrive);
      }
    });
  });

  it('05.4-51 (Plan-49 re-run): every plan deposit is below its price', () => {
    for (const g of generateHistories()) {
      for (const p of g.purchases) if (p.pay.mode === 'plan') expect(p.pay.deposit).toBeLessThan(p.price ?? 0);
    }
  });

  it('05.4-51 (Plan-49 re-run): a usual month costs at most 125% of pay (bills + everyday base + debt minimums)', () => {
    const raws = fc.sample(historyArb, { seed: SHADOW_SEED, numRuns: 300 });
    for (const raw of raws) {
      const bills = raw.bills.reduce((t, b) => t + b.amount, 0);
      const mins = raw.debts.reduce((t, d) => t + d.minimum, 0);
      expect(raw.everydayBase).toBeDefined();
      expect(bills + (raw.everydayBase ?? 0) + mins).toBeLessThanOrEqual(Math.floor((raw.pay * 125) / 100) + raw.bills.length);
      // and never under half of the usual month's money in (a freelancer's stated steady amount): nobody has almost no costs
      const usualIn = raw.freelance ? steadyOf(raw.pay) : raw.pay;
      expect(bills + (raw.everydayBase ?? 0) + mins).toBeGreaterThanOrEqual(Math.floor((usualIn * 50) / 100) - raw.bills.length);
    }
  });

  it('05.4-51 (D-65): 10 to 60 of the 200 reviewed-corpus people have an already-short usual month', () => {
    const short = generateHistories(200).filter((g) => {
      const t = buildMonthModel(toV3Inputs(g.person)).typicalLeft;
      return t !== null && t < 0;
    }).length;
    expect(short).toBeGreaterThanOrEqual(10);
    expect(short).toBeLessThanOrEqual(60);
  });

  it('no adapter clamp binds over the 200 reviewed-corpus histories (person.balance >= the fund)', () => {
    for (const g of generateHistories(200)) expect(g.person.balance).toBeGreaterThanOrEqual(g.person.emergency ?? 0);
  });
});

describe('refund and bucket generator (05.2-31)', () => {
  it('is deterministic: two calls deep-equal, 40 histories, each with a linked refund and a saving bucket', () => {
    const a = generateRefundHistories();
    expect(a).toEqual(generateRefundHistories());
    expect(a).toHaveLength(40);
    expect(REFUND_SEED).toBe(0x052d);
    expect(new Set(a.map((g) => g.person.id)).size).toBe(40);
    for (const g of a) {
      const lines = g.person.months.flatMap((m) => m.lines);
      expect(lines.some((l) => l.role === 'refund' && typeof l.refundOf === 'string')).toBe(true);
      expect(g.person.envelopes.some((e) => e.bucket === true)).toBe(true);
    }
  });
});

describe('near-the-line refund generator (05.2-31)', () => {
  it('is deterministic: 30 histories, each linked to a refund, each just over the fit line (1 to 5 percent) with the link off', () => {
    const a = generateNearLineHistories();
    expect(a).toHaveLength(30);
    expect(NEAR_LINE_SEED).toBe(0x052e);
    expect(new Set(a.map((g) => g.person.id)).size).toBe(30);
    for (const g of a) {
      expect(g.marginPct).toBeGreaterThanOrEqual(1);
      expect(g.marginPct).toBeLessThanOrEqual(5);
      expect(g.purchases[0]?.price).toBeGreaterThan(g.line);
      const lines = g.person.months.flatMap((m) => m.lines);
      expect(lines.some((l) => l.role === 'refund' && typeof l.refundOf === 'string')).toBe(true);
      expect(withoutRefundLinks(g.person).months.flatMap((m) => m.lines).some((l) => l.refundOf !== undefined)).toBe(false);
    }
  });
});

describe('D-17 synthetic only', () => {
  it('compare.ts and generate.ts import no file-system module', () => {
    for (const f of ['compare.ts', 'generate.ts', 'generateRefunds.ts']) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(src).not.toMatch(/from ['"](node:)?(fs|path)['"]/);
      expect(src).not.toMatch(/require\(['"](node:)?fs['"]\)/);
      expect(src).not.toMatch(/Math\.random|Date\.now/);
    }
  });
});
