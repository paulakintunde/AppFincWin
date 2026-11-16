// 05.5-12 (ARC-03, T-05.5-12-01): field-by-field parity of the new builder against the old input path on every fixture source.
// The old path is buildDecideSnapshot -> buildV3Inputs. A difference passes only when expectedDiffs.ts names it with a reason.
import fs from 'node:fs';
import path from 'node:path';
import { MARKET_DEFAULTS, AVERAGING_WINDOW_MONTHS } from '@/engine/decide';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildDecideSnapshot } from '../../buildSnapshot';
import { buildInputs } from '../buildInputs';
import { WINDOW_MONTHS, marketCardTerms } from '../buildInputsParts';
import { buildV3Inputs } from '../buildV3Inputs';
import type { V3SettingsSource } from '../types';
import { EXPECTED_DIFFS } from './expectedDiffs';
import { cases, diffInputs, type Diff } from './builderCases';

describe('buildInputs against the old path (D-07 parity)', () => {
  const used = new Set<number>();
  const seen: Diff[] = [];

  for (const c of cases()) {
    it(`${c.name}: every difference is named`, () => {
      const old = buildV3Inputs(c.source, c.settings, buildDecideSnapshot(c.source));
      const next = buildInputs(c.source, c.settings);
      for (const d of diffInputs(old, next)) {
        const hit = EXPECTED_DIFFS.findIndex((e) => e.pathPattern.test(d.path));
        if (hit < 0) throw new Error(`unexpected difference at ${d.path}: old ${JSON.stringify(d.old)}, new ${JSON.stringify(d.next)}`);
        used.add(hit);
        seen.push(d);
      }
    });
  }

  it('every expected difference matches something (no stale entry)', () => {
    EXPECTED_DIFFS.forEach((e, i) => {
      if (!used.has(i)) throw new Error(`stale expected difference: ${e.source} ${String(e.pathPattern)}`);
    });
  });

  it('every reason is at least 20 characters', () => {
    for (const e of EXPECTED_DIFFS) expect(e.reason.length).toBeGreaterThanOrEqual(20);
  });

  it('diffInputs sees bigint, arrays, objects and absent keys', () => {
    expect(diffInputs({ a: 1n, b: [1, 2], c: undefined }, { a: 2n, b: [1], d: { e: 1 } })).toEqual([
      { path: 'a', old: '1n', next: '2n' },
      { path: 'b[1]', old: 2, next: undefined },
      { path: 'd', old: undefined, next: { e: 1 } },
    ]);
    expect(diffInputs([1], [1])).toEqual([]);
  });
});

describe('what the new builder keeps in step with the old engine', () => {
  it('uses the same averaging window', () => expect(WINDOW_MONTHS).toBe(AVERAGING_WINDOW_MONTHS));

  it('uses the same market card terms', () => {
    for (const [region, key] of [['US', 'US'], ['CA', 'CA'], ['GB', 'UK']] as const) {
      const old = MARKET_DEFAULTS[key];
      const next = marketCardTerms(region)!;
      expect(next.currency).toBe(old.currency);
      expect(next.floor).toBe(old.floor);
      expect(next.terms.minimumPercent).toBe(old.minimumPercent);
      expect(next.terms.interestAdded).toBe(old.interestAdded);
    }
    expect(marketCardTerms('DE')).toBeNull();
    expect(marketCardTerms(null)).toBeNull();
  });
});

// T-05.5-12-02: a real owner export, only from outside the repository. Absent unless SHADOW_SOURCE names a file.
const shadowPath = process.env.SHADOW_SOURCE;
const repoRoot = path.resolve(__dirname, '../../../../../..');
const outsideRepo = shadowPath !== undefined && shadowPath !== '' && path.relative(repoRoot, path.resolve(shadowPath)).startsWith('..');
(outsideRepo ? describe : describe.skip)('buildInputs against the owner-local shadow source', () => {
  it('names every difference', () => {
    const file = JSON.parse(fs.readFileSync(path.resolve(shadowPath as string), 'utf8')) as { source: SnapshotSource; v3Settings: V3SettingsSource | null };
    const old = buildV3Inputs(file.source, file.v3Settings);
    for (const d of diffInputs(old, buildInputs(file.source, file.v3Settings))) {
      if (!EXPECTED_DIFFS.some((e) => e.pathPattern.test(d.path))) throw new Error(`unexpected difference at ${d.path}`);
    }
  });
});
