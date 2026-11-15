/**
 * 06.2 D-20 guard: haptics are called only by meaning (hapticTap, hapticWarn, hapticMilestone,
 * hapticFailed, hapticTick). The old names were deleted in 06.2-24; this test fails if one comes back
 * anywhere under src, tests included.
 *
 * It also pins where Success may fire (goal reached, debt cleared, import done) and that only
 * src/ui/haptics.ts talks to expo-haptics (test files may mock or import it).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..');
const SELF = path.resolve(__filename);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (file: string): string => path.relative(SRC, file).split(path.sep).join('/');
const isTest = (file: string): boolean => /(^|\/)__tests__\//.test(rel(file)) || /\.test\.tsx?$/.test(file);

// Built from parts so this file does not match itself.
const OLD_NAMES = ['Light', 'Selection', 'Warning', 'Success', 'Medium'].map((s) => 'haptic' + s);
const OLD_RE = new RegExp(`\\b(${OLD_NAMES.join('|')})\\b`);

const files = walk(SRC).filter((f) => path.resolve(f) !== SELF);

describe('haptic names (06.2 D-20)', () => {
  it('no file under src uses an old haptic name', () => {
    const hits = files
      .map((f) => ({ f: rel(f), m: fs.readFileSync(f, 'utf8').match(OLD_RE) }))
      .filter((x) => x.m)
      .map((x) => `${x.f}: ${x.m![1]}`);
    expect(hits).toEqual([]);
  });

  it('Success (hapticMilestone) fires only for goal reached, debt cleared and import done', () => {
    const callers = files
      .filter((f) => !isTest(f))
      .filter((f) => /\bhapticMilestone\b/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(callers).toEqual([
      'data/mutations/pasteLines.ts',
      'features/grow/debts/DebtClearedMoment.tsx',
      'features/grow/goals/ReachedMoment.tsx',
      'features/record/import/useStatementImport.ts',
      'ui/haptics.ts',
    ]);
  });

  it('only src/ui/haptics.ts imports expo-haptics outside tests', () => {
    const importers = files
      .filter((f) => !isTest(f))
      .filter((f) => /from ['"]expo-haptics['"]|require\(['"]expo-haptics['"]\)/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(importers).toEqual(['ui/haptics.ts']);
  });
});
