/**
 * Generators for the synthetic histories (05.1-28, D-17). 05.4-08: the old-engine-vs-v3 comparison and the
 * approved-changes.json enforcement are retired (BO-05); the reviewed diff in ../reviewed/ replaces them.
 * The generators stay: deterministic seeds, and no file-system or random source.
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateHistories, SHADOW_SEED } from './generate';
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
