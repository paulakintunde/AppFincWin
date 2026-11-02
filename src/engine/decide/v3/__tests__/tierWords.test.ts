/**
 * D-31 tier-word guard (05.4-16, FIN-25 / ENG-10 / CMP-F12). "No Rough / Fair / Firm" applies to the v3 engine and anything
 * new: no source file outside LEGACY_ALLOWLIST may name ConfidenceLevel or carry a quoted 'rough' | 'fair' | 'firm'.
 * The allowlist is the old engine and the old screens, dated, and can only shrink: an entry that no longer matches fails,
 * so 05.5 (old-engine removal) empties it file by file. The v3 copy carries no Rough / Fair / Firm and no bare "sure".
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import en from '../../../../i18n/locales/en';

const ROOT = resolve(__dirname, '../../../../..');
const SRC = join(ROOT, 'src');

/** A tier word in source: the old level type's name, or a level as a quoted string. */
export const TIER_WORD = /ConfidenceLevel|['"](rough|fair|firm)['"]/;

export const LEGACY_ALLOWLIST = {
  dated: '2026-11-02',
  emptyBy: '05.5',
  files: [
    // Old engine: the old level type and its rule.
    'src/engine/decide/confidence.ts',
    'src/engine/decide/types.ts',
    // Old screens: the old chip and the screens that read the old engine's level or the old 'rough' setup and snapshot kinds.
    'src/features/decide/check/steps/Step3Verdict.tsx',
    'src/features/decide/home/DecideHomeScreen.tsx',
    'src/features/decide/home/HomeProblemsSheet.tsx',
    'src/features/decide/home/YourMonthCard.tsx',
    'src/features/decide/home/homeCardModel.ts',
    'src/features/decide/settings/DecideSettingsScreen.tsx',
    'src/features/decide/setup/SetupStatusCard.tsx',
    'src/features/decide/setup/setupFlow.ts',
    'src/features/decide/setup/useSetupFacts.ts',
    'src/features/decide/snapshot/buildSnapshot.ts',
    'src/features/decide/snapshot/computeCheck.ts',
    'src/features/decide/snapshot/types.ts',
    'src/features/decide/ui/ConfidenceChip.tsx',
    // The v3 input builder reads the old snapshot's 'rough' kind (buildSnapshot.ts); it goes when the old snapshot does.
    'src/features/decide/snapshot/v3/buildV3Inputs.ts',
  ],
} as const;

const isTest = (rel: string): boolean => rel.split('/').includes('__tests__') || /\.test\.tsx?$/.test(rel);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

export interface Hit {
  readonly file: string;
  readonly line: number;
}

/** Every tier word in non-test .ts / .tsx under `dir`, as { file, line } with a repo-relative path. */
export function tierWordHits(dir: string = SRC): Hit[] {
  const hits: Hit[] = [];
  for (const full of sourceFiles(dir)) {
    const rel = relative(ROOT, full).split('\\').join('/');
    if (isTest(rel)) continue;
    readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => {
        if (TIER_WORD.test(text)) hits.push({ file: rel, line: i + 1 });
      });
  }
  return hits;
}

interface Leaf {
  readonly path: string;
  readonly value: string;
}
function leaves(node: unknown, path: string): Leaf[] {
  if (typeof node === 'string') return [{ path, value: node }];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
}

describe('D-31 tier-word guard', () => {
  const allowed = new Set<string>(LEGACY_ALLOWLIST.files);
  const hits = tierWordHits();

  it('D-31 no ConfidenceLevel or quoted rough / fair / firm outside the dated allowlist', () => {
    expect(hits.filter((h) => !allowed.has(h.file))).toEqual([]);
  });

  it('D-31 every allowlisted file exists and still matches (a stale entry fails, so the list only shrinks)', () => {
    const matched = new Set(hits.map((h) => h.file));
    for (const f of LEGACY_ALLOWLIST.files) {
      expect({ file: f, exists: existsSync(join(ROOT, f)), matches: matched.has(f) }).toEqual({ file: f, exists: true, matches: true });
    }
  });

  it('D-31 the allowlist is dated, names 05.5, and lists no v3 engine file', () => {
    expect(LEGACY_ALLOWLIST.dated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGACY_ALLOWLIST.emptyBy).toBe('05.5');
    expect(new Set(LEGACY_ALLOWLIST.files).size).toBe(LEGACY_ALLOWLIST.files.length);
    expect(LEGACY_ALLOWLIST.files.filter((f) => f.startsWith('src/engine/decide/v3/'))).toEqual([]);
  });

  it('D-31 a probe file with a quoted tier word is caught', () => {
    expect(TIER_WORD.test("type X = 'fair'")).toBe(true);
    expect(TIER_WORD.test('import type { ConfidenceLevel } from "../types"')).toBe(true);
    expect(TIER_WORD.test('// rough figures were renamed quick estimates')).toBe(false);
    expect(TIER_WORD.test("const s = 'roughly'")).toBe(false);
  });

  it('CMP-F12 the v3 copy carries no Rough / Fair / Firm label and no bare "sure"', () => {
    const v3 = leaves((en as unknown as { decide: { v3: unknown } }).decide.v3, 'decide.v3');
    expect(v3.length).toBeGreaterThan(40);
    for (const l of v3) {
      expect({ path: l.path, tier: /\b(rough|fair|firm)\b/i.test(l.value), sure: /\bsure\b/i.test(l.value) }).toEqual({ path: l.path, tier: false, sure: false });
    }
  });
});
