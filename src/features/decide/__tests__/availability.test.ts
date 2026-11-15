import * as fs from 'fs';
import * as path from 'path';

import * as availability from '../availability';

const { DECIDE_OPEN, DECIDE_SETUP_VISIBLE } = availability;

const ROOT = path.join(__dirname, '..', '..', '..', '..');
// Built at runtime so this file does not itself contain the removed names.
const REMOVED = [['DECIDE', 'V3'].join('_'), ['decide', 'Engine'].join('')];

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

describe('Decide availability switches', () => {
  it('APP-17: the v2 switch and the engine chooser are gone', () => {
    for (const name of REMOVED) expect(Object.keys(availability)).not.toContain(name);
    const files: string[] = [];
    walk(path.join(ROOT, 'src'), files);
    walk(path.join(ROOT, 'app'), files);
    const hits = files.filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return REMOVED.some((n) => text.includes(n));
    });
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('05.4 BO-06 the setup page stays hidden', () => {
    expect(DECIDE_SETUP_VISIBLE).toBe(false);
  });

  it('owner 2026-11-06: Decide is open', () => {
    expect(DECIDE_OPEN).toBe(true);
  });
});
