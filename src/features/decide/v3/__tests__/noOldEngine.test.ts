/**
 * 05.3-44 (P-01): the v3 trees never import the old engine barrel, the old snapshot input type, decideGoAhead, the old check
 * screens, the old home screen or the quick flow. This is what makes the D-01 deletion follow-up safe.
 * (@/engine/decide/v3 and shared leaf modules such as @/engine/decide/cardRule are not the old barrel.)
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..', '..', '..');
const ROOTS = [join(SRC, 'features', 'decide', 'v3'), join(SRC, 'shell', 'decide', 'v3')];
const FILES = [join(SRC, 'data', 'mutations', 'boughtWrite.ts')];

const BANNED: readonly { name: string; re: RegExp }[] = [
  { name: 'old engine barrel', re: /from\s+['"]@\/engine\/decide['"]/ },
  { name: 'old engine barrel (relative)', re: /from\s+['"](?:\.\.?\/)+engine\/decide['"]/ },
  { name: 'old snapshot types', re: /from\s+['"]@\/features\/decide\/snapshot\/types['"]/ },
  { name: 'decideGoAhead', re: /decideGoAhead/ },
  { name: 'old check screens', re: /['"]@\/features\/decide\/check(\/|['"])/ },
  { name: 'old home screen', re: /@\/features\/decide\/home\/DecideHomeScreen/ },
  { name: 'old quick flow', re: /['"]@\/features\/decide\/quick(\/|['"])/ },
];

function walk(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('no v3 file imports the old engine or old screens (P-01)', () => {
  const files = [...ROOTS.flatMap(walk), ...FILES];

  it('scans a believable number of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no banned import', () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const b of BANNED) if (b.re.test(line)) hits.push(`${relative(SRC, file).split('\\').join('/')}:${i + 1} ${b.name}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
