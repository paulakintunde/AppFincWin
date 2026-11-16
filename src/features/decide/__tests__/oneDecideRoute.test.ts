import * as fs from 'fs';
import * as path from 'path';

// 05.5-20 SC5: one Decide in the routes. Old paths stay as redirects so deep links from older installs still land.
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const APP = path.join(ROOT, 'app');
const DECIDE_DIR = path.join(APP, '(app)', 'decide');
const REDIRECTS = ['open', 'lines', 'pots', 'changes', 'settings'];

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
}

describe('one Decide in the routes', () => {
  it('every old Decide path is a bare Redirect that imports no screen', () => {
    for (const name of REDIRECTS) {
      const file = path.join(DECIDE_DIR, `${name}.tsx`);
      expect(fs.existsSync(file)).toBe(true);
      const text = fs.readFileSync(file, 'utf8');
      expect(text).toMatch(/<Redirect\b/);
      expect(text).not.toMatch(/features\/decide\/screens/);
      const imports = text.match(/^import .* from '.*';$/gm) ?? [];
      expect(imports.every((l) => /from 'expo-router'/.test(l))).toBe(true);
    }
  });

  it('exactly one route file imports the Decide home screen', () => {
    const files: string[] = [];
    walk(APP, files);
    const hits = files.filter((f) => /screens\/home\/DecideHome'/.test(fs.readFileSync(f, 'utf8')));
    expect(hits.map((f) => path.relative(ROOT, f).split(path.sep).join('/'))).toEqual(['app/(app)/(tabs)/decide.tsx']);
  });
});
