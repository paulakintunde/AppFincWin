/**
 * SC-6 coverage index (05.1-27, T-05.1-55): every invariant I1..I43 has at least one test whose title starts with its id.
 * A missing id fails here by name. I24 is retired (CONTEXT: v2's I24 and protection months are superseded) and keeps its
 * number through a documented test below. I28 (the back-test) lives in 05.1-29; until its folder exists it is listed as
 * pending, and becomes strict the moment the folder lands.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../../../../../..');
const V3 = join(ROOT, 'src/engine/decide/v3');
const SNAPSHOT_V3 = join(ROOT, 'src/features/decide/snapshot/v3');
const COPY_TEST = join(ROOT, 'src/i18n/__tests__/decideCopy.test.ts');

const TITLE = /(it|test|describe)(\.each\([^)]*\))?\(\s*['"`]I(\d+)\b/g;
const IDS = Array.from({ length: 43 }, (_, i) => i + 1);

/** Ids that may be absent only while the folder that will carry them does not exist yet. */
const PENDING_UNTIL: Readonly<Record<number, { readonly owner: string; readonly folder: string }>> = {
  28: { owner: '05.1-29', folder: join(V3, 'backtest') },
};

function testFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...testFilesUnder(full));
    else if (/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function coveredIds(): ReadonlySet<number> {
  const files = [...testFilesUnder(V3), ...testFilesUnder(SNAPSHOT_V3), ...(existsSync(COPY_TEST) ? [COPY_TEST] : [])];
  const seen = new Set<number>();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(TITLE)) seen.add(Number(m[3]));
  }
  return seen;
}

describe('SC-6 invariant coverage index', () => {
  it('SC-6 every invariant has a named test', () => {
    const seen = coveredIds();
    const missing = IDS.filter((id) => !seen.has(id)).filter((id) => {
      const p = PENDING_UNTIL[id];
      return p === undefined || existsSync(p.folder); // strict once the owning folder exists
    });
    expect(missing.map((id) => `I${id}`)).toEqual([]);
  });

  it('SC-6 an id is pending only while its owner has not landed', () => {
    for (const [id, p] of Object.entries(PENDING_UNTIL)) {
      if (existsSync(p.folder)) expect(coveredIds().has(Number(id))).toBe(true);
    }
  });

  it('SC-6 the scan sees the titles it is meant to (anchor ids from three suites)', () => {
    const seen = coveredIds();
    for (const id of [1, 9, 17, 31, 42]) expect(seen.has(id)).toBe(true);
  });

  it('I24 retired: emergency grading superseded (05.1 CONTEXT)', () => {
    // No severity and no grade anywhere on the Result: the emergency is used or untouched, never "heavy" or "light".
    const types = readFileSync(join(V3, 'types.ts'), 'utf8');
    const start = types.indexOf('export interface Result {');
    expect(start).toBeGreaterThan(-1);
    const body = types.slice(start, types.indexOf('\n', start));
    expect(body).not.toMatch(/severity|grade|heavy|light/i);
    expect(types).not.toMatch(/\bseverity\b|\bgrade\b/i);
    expect(types).not.toMatch(/uses_emergency/);
  });
});
