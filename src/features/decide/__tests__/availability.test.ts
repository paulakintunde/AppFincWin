import * as fs from 'fs';
import * as path from 'path';

import { DECIDE_OPEN, DECIDE_SETUP_VISIBLE, DECIDE_V3, decideEngine } from '../availability';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

describe('Decide availability switches', () => {
  it('owner 2026-11-06: the switch is on for every account', () => {
    expect(DECIDE_V3).toBe(true);
    expect(decideEngine()).toBe('v3');
  });

  it('D-15 one reader: only availability.ts mentions DECIDE_V3, exactly twice', () => {
    const files: string[] = [];
    walk(path.join(ROOT, 'src'), files);
    walk(path.join(ROOT, 'app'), files);
    const hits = files.filter((f) =>
      /\bDECIDE_V3\b/.test(stripComments(fs.readFileSync(f, 'utf8'))),
    );
    expect(hits.map((f) => path.relative(ROOT, f).split(path.sep).join('/'))).toEqual([
      'src/features/decide/availability.ts',
    ]);
    const own = stripComments(fs.readFileSync(hits[0]!, 'utf8'));
    expect(own.match(/\bDECIDE_V3\b/g)).toHaveLength(2);
  });

  it('owner 2026-11-06: v3 whatever the per-account flag says', () => {
    expect(decideEngine({})).toBe('v3');
    expect(decideEngine({ decideV3: false })).toBe('v3');
    expect(decideEngine({ decideV3: true })).toBe('v3');
  });

  it('05.4 BO-06 the setup page stays hidden', () => {
    expect(DECIDE_SETUP_VISIBLE).toBe(false);
  });

  it('owner 2026-11-06: Decide is open', () => {
    expect(DECIDE_OPEN).toBe(true);
  });
});
