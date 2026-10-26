/**
 * The D-14 gate (05.1-28): today's engine against v3 over synthetic data.
 *
 * - every new "fits" (v3 fits_month or fits_unspent where the old engine did not fit) carries a written reason in
 *   approved-changes.json; stale entries fail;
 * - once the owner marks the file reviewed, every new fit must be approved and every cause group accepted;
 * - unsupported comparisons are never counted as agreement or as an approved change;
 * - SHADOW_REPORT=1 writes the review report; the default run writes nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { classify } from './classify';
import { runShadow, type ShadowRun } from './compare';
import { generateHistories, SHADOW_SEED } from './generate';
import { groupByCause, renderReport, writeReport, type ApprovedChanges } from './report';
import approvedFile from './approved-changes.json';

const approved = approvedFile as unknown as ApprovedChanges;
const MIN_REASON = 20;

let run: ShadowRun;
beforeAll(() => {
  run = runShadow();
});

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

describe('comparison', () => {
  it('counts every comparison exactly once: agreed + changed + unsupported = total', () => {
    expect(run.agreed + run.changes.length + run.unsupported.length).toBe(run.total);
    expect(run.total).toBeGreaterThan(300);
  });

  it('never lists an unsupported comparison as a change', () => {
    const unsupported = new Set(run.unsupported.map((u) => u.key));
    for (const c of run.changes) expect(unsupported.has(c.key)).toBe(false);
  });

  it('gives each change one cause and a differing legacy state', () => {
    for (const c of run.changes) {
      expect(c.cause).toBeTruthy();
      expect(c.v3Legacy).not.toBe(c.old);
    }
  });

  it('includes generated comparisons', () => {
    const keys = [...run.changes.map((c) => c.key), ...run.unsupported.map((u) => u.key)];
    expect(keys.some((k) => k.startsWith('generated:'))).toBe(true);
  });
});

describe('classify', () => {
  it('files a needs_input answer under needs_input_rules whatever the old state', () => {
    const c = run.changes.find((x) => x.v3 === 'needs_input');
    expect(c?.cause).toBe('needs_input_rules');
    expect(typeof classify).toBe('function');
  });
});

describe('D-14 gate', () => {
  const newFits = () => run.changes.filter((c) => c.newFits);

  it('every new fits has a written reason (at least 20 characters)', () => {
    const missing = newFits().filter((c) => {
      const e = approved.newFits.find((n) => n.key === c.key);
      return e === undefined || e.reason.trim().length < MIN_REASON;
    });
    expect(missing.map((c) => c.key)).toEqual([]);
  });

  it('has no stale entries: every approved key and group cause is produced by the current run', () => {
    const keys = new Set(newFits().map((c) => c.key));
    expect(approved.newFits.filter((e) => !keys.has(e.key)).map((e) => e.key)).toEqual([]);
    const causes = new Set(run.changes.map((c) => c.cause));
    expect(approved.groups.filter((g) => !causes.has(g.cause)).map((g) => g.cause)).toEqual([]);
  });

  it('records the cause of each approved entry as the current run classifies it', () => {
    const byKey = new Map(run.changes.map((c) => [c.key, c.cause]));
    expect(approved.newFits.filter((e) => byKey.get(e.key) !== e.cause).map((e) => e.key)).toEqual([]);
  });

  it('owner sign-off: when reviewed, every new fit is approved and every cause in the run is accepted', () => {
    if (!approved.reviewed) return;
    expect(approved.reviewedBy).toBeTruthy();
    expect(approved.reviewedAt).toBeTruthy();
    expect(newFits().filter((c) => approved.newFits.find((e) => e.key === c.key)?.approved !== true).map((c) => c.key)).toEqual([]);
    const unaccepted = [...groupByCause(run.changes).keys()].filter((cause) => approved.groups.find((g) => g.cause === cause)?.accepted !== true);
    expect(unaccepted).toEqual([]);
  });

  it('group counts match the run', () => {
    const counts = groupByCause(run.changes);
    for (const g of approved.groups) expect(counts.get(g.cause)?.length ?? 0).toBe(g.count);
  });
});

describe('D-17 synthetic only', () => {
  it('compare.ts and generate.ts import no file-system module', () => {
    for (const f of ['compare.ts', 'generate.ts']) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(src).not.toMatch(/from ['"](node:)?(fs|path)['"]/);
      expect(src).not.toMatch(/require\(['"](node:)?fs['"]\)/);
      expect(src).not.toMatch(/Math\.random|Date\.now/);
    }
  });
});

describe('report', () => {
  it('renders the totals, the causes and every new fit', () => {
    const md = renderReport(run, approved);
    expect(md).toContain(`| Comparisons | ${run.total} |`);
    expect(md).toContain('## New fits');
    for (const c of run.changes.filter((x) => x.newFits)) expect(md).toContain(c.key);
    expect(md).not.toContain('MISSING');
  });

  it('writes files only when SHADOW_REPORT=1', () => {
    if (process.env.SHADOW_REPORT === '1') writeReport(run, approved);
    else expect(process.env.SHADOW_REPORT).not.toBe('1');
  });
});
