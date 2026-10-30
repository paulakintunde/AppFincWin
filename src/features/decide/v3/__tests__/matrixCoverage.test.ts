/**
 * 05.3-44 (D-09): every v3 surface folder that holds a component has a 320/402 x 1.0/2.0 matrix test.
 * Static: a folder with a .tsx file needs at least one *Matrix.test.tsx in its __tests__, and each such file must name all
 * four cells (320, 402, and the 1 and 2 font scales).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const V3 = join(__dirname, '..');

// Folders that hold components. 'shared' is hooks and pure helpers; 'model' is pure; 'nav' is route stubs covered by entryGate.
const SURFACES = ['home', 'ready', 'check', 'layers', 'answer', 'answerParts', 'answerLower', 'ask', 'askMore', 'record', 'plan', 'instead', 'worked', 'help', 'refine', 'lists'];
// A folder whose components are rendered inside another surface's matrix test; the host test is named so the link is explicit.
const HOSTED: Readonly<Record<string, string>> = {
  answerParts: 'answer/__tests__/answerAMatrix.test.tsx',
};

function matrixFiles(folder: string): string[] {
  const dir = join(V3, folder, '__tests__');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('Matrix.test.tsx'));
}

function hasComponent(folder: string): boolean {
  return readdirSync(join(V3, folder)).some((n) => n.endsWith('.tsx') && statSync(join(V3, folder, n)).isFile());
}

describe('v3 matrix coverage (D-09)', () => {
  it('lists every v3 folder that holds a component', () => {
    const folders = readdirSync(V3).filter((n) => statSync(join(V3, n)).isDirectory() && n !== '__tests__');
    const withComponents = folders.filter(hasComponent);
    const known = new Set([...SURFACES, 'nav']);
    expect(withComponents.filter((f) => !known.has(f))).toEqual([]);
  });

  it.each(SURFACES)('%s has a matrix test', (folder) => {
    const own = matrixFiles(folder);
    if (own.length > 0) return;
    const host = HOSTED[folder];
    expect(host).toBeDefined();
    expect(existsSync(join(V3, host!))).toBe(true);
  });

  it('every matrix test names both widths and both font scales', () => {
    const bad: string[] = [];
    for (const folder of SURFACES) {
      for (const name of matrixFiles(folder)) {
        const src = readFileSync(join(V3, folder, '__tests__', name), 'utf8');
        const widths = /\b320\b/.test(src) && /\b402\b/.test(src);
        const scales = /\b2(\.0)?\b/.test(src) && /\b1(\.0)?\b/.test(src);
        if (!widths || !scales) bad.push(`${folder}/${name}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
