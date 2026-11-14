// 05.5-03 (D-14, CMP-F09): walks every `en` leaf through the per-sentence guard.
// Report mode by default: existing hits do not fail the run. Plan 05.5-07 fills the allowlist from the post-06.1 report
// and sets COPY_GUARD_ENFORCE on by default. COPY_GUARD_REPORT=<file> writes the inventory as JSON.
import fs from 'fs';
import path from 'path';

import allowlist from '../copyGuard/allowlist.json';
import { checkString, isAllowed, staleEntries, type Allowlist, type Violation } from '../copyGuard/guard.cjs';
import en from '../locales/en';

interface Leaf {
  path: string;
  value: string;
}

function collect(node: unknown, prefix: string): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => collect(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

const list = allowlist as Allowlist;
const leaves = collect(en, '');
const violations: Violation[] = leaves.flatMap((l) => checkString(l.path, l.value));

function writeReport(file: string): void {
  const resolved = path.resolve(file);
  const repo = path.resolve(process.cwd());
  const inRepo = resolved === repo || resolved.startsWith(repo + path.sep);
  if (inRepo && !resolved.startsWith(path.join(repo, 'reports') + path.sep)) {
    throw new Error('COPY_GUARD_REPORT must be outside the repo or under reports/');
  }
  const bySet: Record<string, number> = {};
  for (const v of violations) bySet[v.set] = (bySet[v.set] ?? 0) + 1;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify({ count: violations.length, bySet, violations }, null, 2));
}

describe('copy guard over the en catalogue (05.5-03)', () => {
  it('walks the catalogue', () => {
    expect(leaves.length).toBeGreaterThan(1000);
  });

  it('has no stale allowlist entry', () => {
    expect(staleEntries(violations, list)).toEqual([]);
  });

  it('writes a report when asked', () => {
    const file = process.env.COPY_GUARD_REPORT;
    if (file) writeReport(file);
    expect(true).toBe(true);
  });

  (process.env.COPY_GUARD_ENFORCE === '1' ? it : it.skip)('has every violation on the allowlist', () => {
    const open = violations.filter((v) => !isAllowed(v, list)).map((v) => `${v.path} [${v.rule}]: ${v.sentence}`);
    expect(open).toEqual([]);
  });
});
